import { test, expect, type Page } from '@playwright/test';

async function createVault(page: Page): Promise<string> {
	await page.goto('/');
	await page.getByRole('button', { name: 'Create New Vault' }).click();
	const phrase = (await page.locator('.phrase-display').textContent())!.trim();
	await page.getByLabel("I've saved my vault phrase").check();
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByPlaceholder('Add a to-do...')).toBeVisible({ timeout: 15_000 });
	return phrase;
}

async function logIn(page: Page, phrase: string) {
	await page.goto('/');
	await page.getByRole('button', { name: 'Log In' }).click();
	await page.getByPlaceholder('word1 word2 word3 ...').fill(phrase);
	await page.getByRole('button', { name: 'Log In' }).click();
	await expect(page.getByPlaceholder('Add a to-do...')).toBeVisible({ timeout: 15_000 });
}

async function addTodo(page: Page, title: string) {
	const input = page.getByPlaceholder('Add a to-do...');
	await input.fill(title);
	await input.press('Enter');
	await expect(todoItem(page, title)).toBeVisible();
}

const todoItem = (page: Page, title: string) => page.locator('.todo-item').filter({ has: page.locator('.title', { hasText: title }) });
const nav = (page: Page, label: string) => page.locator('.smart-views .nav-item', { hasText: label });

test('core flow: add, complete and reload keeps state', async ({ page }) => {
	await createVault(page);
	await addTodo(page, 'Water plants');
	await addTodo(page, 'Pay rent');

	await todoItem(page, 'Pay rent').getByRole('button', { name: 'Mark complete' }).click();
	await expect(page.getByRole('button', { name: /Completed \(1\)/ })).toBeVisible();

	await page.reload();
	await expect(todoItem(page, 'Water plants')).toBeVisible();
	await expect(page.getByRole('button', { name: /Completed \(1\)/ })).toBeVisible();
	await expect(todoItem(page, 'Pay rent')).toHaveCount(0); // completed section is collapsed
});

test('the same vault on two devices syncs live', async ({ browser }) => {
	const phone = await (await browser.newContext()).newPage();
	const laptop = await (await browser.newContext()).newPage();
	const phrase = await createVault(phone);
	await logIn(laptop, phrase);

	await addTodo(phone, 'Book dentist');
	await expect(todoItem(laptop, 'Book dentist')).toBeVisible({ timeout: 10_000 });

	await todoItem(laptop, 'Book dentist').getByRole('button', { name: 'Mark complete' }).click();
	await expect(todoItem(phone, 'Book dentist')).toHaveCount(0, { timeout: 10_000 });
});

test('a todo added from the Today view is due today and stays in Today', async ({ page }) => {
	await createVault(page);
	await nav(page, 'Today').click();
	await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

	await addTodo(page, 'Call mum');
	await page.waitForTimeout(500);
	await expect(todoItem(page, 'Call mum')).toBeVisible();
});

test('a todo added from the Week view stays in the Week view', async ({ page }) => {
	await createVault(page);
	await nav(page, 'Week').click();
	await expect(page.getByRole('heading', { name: 'This Week' })).toBeVisible();

	const input = page.getByPlaceholder('Add a to-do...');
	await input.fill('Plan trip');
	await input.press('Enter');
	await expect(todoItem(page, 'Plan trip')).toBeVisible({ timeout: 2000 });
});

test.describe('in a timezone ahead of UTC, early morning', () => {
	test.use({ timezoneId: 'Asia/Tokyo' });

	test('the "Today" due-date button sets today\'s local date', async ({ page }) => {
		await page.clock.install({ time: new Date('2026-03-10T07:30:00+09:00') }); // 2026-03-09 in UTC
		await createVault(page);
		await addTodo(page, 'Morning task');
		await todoItem(page, 'Morning task').click();
		await page.locator('.detail-sidebar').getByRole('button', { name: 'Today', exact: true }).click();

		await expect(todoItem(page, 'Morning task').locator('.due-date')).toHaveText('Today');
		await expect(page.locator('.detail-sidebar input[type="date"]').first()).toHaveValue('2026-03-10');
	});
});

test('a list\'s completed section only shows todos from that list', async ({ page }) => {
	await createVault(page);
	await page.locator('.add-list-btn').click();
	const listInput = page.getByPlaceholder('List name...');
	await listInput.fill('Work');
	await listInput.press('Enter');

	await addTodo(page, 'Inbox chore');
	await todoItem(page, 'Inbox chore').getByRole('button', { name: 'Mark complete' }).click();

	await page.locator('.lists .nav-item', { hasText: 'Work' }).click();
	await expect(page.getByRole('heading', { name: 'Work' })).toBeVisible();
	await addTodo(page, 'Write report');
	await todoItem(page, 'Write report').getByRole('button', { name: 'Mark complete' }).click();
	await page.getByRole('button', { name: /Completed \(\d+\)/ }).click();

	await expect(todoItem(page, 'Write report')).toBeVisible();
	await expect(todoItem(page, 'Inbox chore')).toHaveCount(0);
});

test('Today\'s completed section only shows todos that belong in Today', async ({ page }) => {
	await createVault(page);
	await addTodo(page, 'Someday idea'); // no due date
	await todoItem(page, 'Someday idea').getByRole('button', { name: 'Mark complete' }).click();

	await nav(page, 'Today').click();
	await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
	await expect(page.getByRole('button', { name: /Completed \(\d+\)/ })).toHaveCount(0);
});

test('drag-and-drop reordering in the Inbox persists across reload', async ({ page }) => {
	await createVault(page);
	await addTodo(page, 'C');
	await addTodo(page, 'B');
	await addTodo(page, 'A'); // newest on top: A, B, C
	const titles = page.locator('.items:not(.completed-items) .todo-item .title');
	await expect(titles).toHaveText(['A', 'B', 'C']);

	await todoItem(page, 'C').dragTo(todoItem(page, 'A'), { targetPosition: { x: 20, y: 2 } });
	await expect(titles).toHaveText(['C', 'A', 'B']);

	await page.reload();
	await expect(titles).toHaveText(['C', 'A', 'B']);
});
