import type { Todo } from '$lib/types';

const today = () => new Date().toISOString().split('T')[0];
const weekEnd = () => new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

function isActive(t: Todo): boolean {
	return !t.completed_at;
}

function isNotSnoozed(t: Todo): boolean {
	return !t.snoozed_until || t.snoozed_until <= today();
}

function isSnoozed(t: Todo): boolean {
	return !!t.snoozed_until && t.snoozed_until > today();
}

function sortActive(a: Todo, b: Todo): number {
	return a.sort_order - b.sort_order;
}

export function filterTodos(todos: Todo[], view: string, listId?: string): Todo[] {
	switch (view) {
		case 'inbox':
			return todos.filter(t => isActive(t) && !t.list_id && isNotSnoozed(t))
				.sort(sortActive);
		case 'today':
			return todos.filter(t => isActive(t) && t.due_date && t.due_date <= today() && isNotSnoozed(t))
				.sort(sortActive);
		case 'week':
			return todos.filter(t => isActive(t) && t.due_date && t.due_date <= weekEnd() && isNotSnoozed(t))
				.sort(sortActive);
		case 'all':
			return todos.filter(t => isActive(t) && isNotSnoozed(t))
				.sort(sortActive);
		case 'snoozed':
			return todos.filter(t => isActive(t) && isSnoozed(t))
				.sort((a, b) => (a.snoozed_until ?? '').localeCompare(b.snoozed_until ?? ''));
		case 'list':
			return todos.filter(t => isActive(t) && t.list_id === listId && isNotSnoozed(t))
				.sort(sortActive);
		default:
			return todos;
	}
}

export function computeCounts(todos: Todo[]): { inbox: number; today: number; week: number; all: number; snoozed: number; lists: Record<string, number> } {
	const t = today();
	const we = weekEnd();
	const active = todos.filter(todo => isActive(todo));

	const lists: Record<string, number> = {};
	let inbox = 0, todayCount = 0, week = 0, all = 0, snoozed = 0;

	for (const todo of active) {
		const sn = todo.snoozed_until && todo.snoozed_until > t;
		if (sn) {
			snoozed++;
			continue;
		}
		all++;
		if (!todo.list_id) inbox++;
		if (todo.due_date && todo.due_date <= t) todayCount++;
		if (todo.due_date && todo.due_date <= we) week++;
		if (todo.list_id) {
			lists[todo.list_id] = (lists[todo.list_id] ?? 0) + 1;
		}
	}

	return { inbox, today: todayCount, week, all, snoozed, lists };
}
