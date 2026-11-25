// End-to-end-ish tests of the client sync engine: the real todos/auth stores, a real
// IndexedDB implementation, and the real server handlers + SQLite, wired together in-process.
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { installNetwork, setLatency, FakeEventSource, goOffline, goOnline, otherDevice, eventually, get, type OtherDevice } from '../helpers/client';
import { setServerClockOffset } from '../helpers/server';
import { generateMnemonic } from '../../src/lib/crypto';
import { clearQueue } from '../../src/lib/offlinedb';
import { login, authState } from '../../src/lib/stores/auth';
import {
	todos, lists, syncStatus, setupSync, createTodo, updateTodo, deleteTodo, createList, deleteList,
	resetStores, loadTodosFromCache
} from '../../src/lib/stores/todos';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const localTitles = () => get(todos).map((t) => t.title);
const local = (id: string) => get(todos).find((t) => t.id === id);

let phrase: string;
let other: OtherDevice;
let stopSync: (() => void) | undefined;

async function connect() {
	stopSync = setupSync();
	await eventually(() => expect(FakeEventSource.live().some((e) => e.readyState === FakeEventSource.OPEN)).toBe(true));
	await eventually(() => expect(get(syncStatus).isOnline).toBe(true));
}

beforeAll(async () => {
	installNetwork();
	phrase = await generateMnemonic();
	await login(phrase);
	other = await otherDevice(phrase, get(authState).userId!);
});

beforeEach(async () => {
	await connect();
});

afterEach(async () => {
	stopSync?.();
	goOnline();
	setServerClockOffset(0);
	setLatency(0);
	for (const es of FakeEventSource.instances) es.close();
	FakeEventSource.instances = [];
	// Don't let a stuck queue from one test leak into the next
	await clearQueue();
	syncStatus.update((s) => ({ ...s, pendingCount: 0 }));
});

describe('basic sync', () => {
	it('stores new todos on the server, encrypted, readable by another device', async () => {
		const t = await createTodo({ title: 'Buy oat milk', due_date: '2026-05-01' });
		const onServer = (await other.serverTodos()).find((s) => s.id === t.id);
		expect(onServer?.data).toMatchObject({ title: 'Buy oat milk', due_date: '2026-05-01' });
		expect(Buffer.from(onServer!.blob, 'base64').toString('latin1')).not.toContain('oat milk');
		expect(get(syncStatus).pendingCount).toBe(0);
	});

	it('shows changes made on another device live', async () => {
		const id = await other.createTodo({ title: 'from phone' });
		await eventually(() => expect(local(id)?.title).toBe('from phone'));

		await other.updateTodo(id, { title: 'edited on phone', completed_at: '2026-01-01T00:00:00Z' });
		await eventually(() => expect(local(id)).toMatchObject({ title: 'edited on phone', completed_at: '2026-01-01T00:00:00Z' }));

		await other.deleteTodo(id);
		await eventually(() => expect(local(id)).toBeUndefined());
	});

	it('catches up on changes made by another device while this one was offline', async () => {
		const keep = await createTodo({ title: 'will be edited elsewhere' });
		const gone = await createTodo({ title: 'will be deleted elsewhere' });
		goOffline();

		const added = await other.createTodo({ title: 'added while offline' });
		await other.updateTodo(keep.id, { title: 'edited elsewhere' });
		await other.deleteTodo(gone.id);

		goOnline();
		await eventually(() => {
			expect(local(added)?.title).toBe('added while offline');
			expect(local(keep.id)?.title).toBe('edited elsewhere');
			expect(local(gone.id)).toBeUndefined();
		});
	});

	it('deleting a list moves its todos to the inbox, for every device', async () => {
		const list = await createList('Groceries');
		const t = await createTodo({ title: 'eggs', list_id: list.id });
		await deleteList(list.id);

		expect(local(t.id)?.list_id).toBeNull();
		await eventually(async () => {
			expect((await other.serverLists()).map((l) => l.id)).not.toContain(list.id);
			expect((await other.serverTodos()).find((s) => s.id === t.id)?.data.list_id).toBeNull();
		});
	});
});

describe('offline use', () => {
	it('sends changes made offline once back online, collapsing intermediate states', async () => {
		const existing = await createTodo({ title: 'existing' });
		goOffline();

		const a = await createTodo({ title: 'offline draft' });
		await sleep(5); // same-millisecond edits are covered separately in queue.test.ts
		await updateTodo(a.id, { title: 'offline final' });
		const b = await createTodo({ title: 'offline throwaway' });
		await sleep(5);
		await deleteTodo(b.id);
		await updateTodo(existing.id, { notes: 'added offline' });
		expect(get(syncStatus).pendingCount).toBeGreaterThan(0);

		goOnline();
		await eventually(async () => {
			const server = await other.serverTodos();
			expect(server.find((s) => s.id === a.id)?.data.title).toBe('offline final');
			expect(server.find((s) => s.id === b.id)).toBeUndefined();
			expect(server.find((s) => s.id === existing.id)?.data.notes).toBe('added offline');
			expect(get(syncStatus).pendingCount).toBe(0);
		});
	});

	it('keeps offline changes across an app reload', async () => {
		goOffline();
		const a = await createTodo({ title: 'before reload' });
		await sleep(5); // same-millisecond edits are covered separately in queue.test.ts
		await updateTodo(a.id, { title: 'edited before reload' });
		const b = await createTodo({ title: 'deleted before reload' });
		await sleep(5);
		await deleteTodo(b.id);

		resetStores(); // in-memory state is lost on reload
		await loadTodosFromCache();
		expect(local(a.id)?.title).toBe('edited before reload');
		expect(local(b.id)).toBeUndefined();

		goOnline();
		await eventually(async () => {
			expect((await other.serverTodos()).find((s) => s.id === a.id)?.data.title).toBe('edited before reload');
		});
	});

	it('converges with the server when an offline edit conflicts with a newer edit from another device', async () => {
		const t = await createTodo({ title: 'original' });
		goOffline();
		await updateTodo(t.id, { title: 'edited offline (older)' });
		await sleep(10);
		await other.updateTodo(t.id, { title: 'edited on phone (newer)' });

		goOnline();
		await eventually(async () => {
			const server = (await other.serverTodos()).find((s) => s.id === t.id)!;
			expect(server.data.title).toBe('edited on phone (newer)');
			expect(local(t.id)?.title).toBe('edited on phone (newer)');
			expect(get(syncStatus).pendingCount).toBe(0);
		});
	});

	it('does not get stuck when an offline delete targets a todo already deleted on another device', async () => {
		const t = await createTodo({ title: 'deleted twice' });
		goOffline();
		await deleteTodo(t.id);
		await other.deleteTodo(t.id);
		goOnline();

		const later = await createTodo({ title: 'created after reconnect' });
		await eventually(async () => {
			expect((await other.serverTodos()).map((s) => s.id)).toContain(later.id);
			expect(get(syncStatus).pendingCount).toBe(0);
		});
	});

	it('does not get stuck when an offline edit targets a todo deleted on another device', async () => {
		const t = await createTodo({ title: 'edited here, deleted there' });
		goOffline();
		await updateTodo(t.id, { title: 'edit that can never land' });
		await other.deleteTodo(t.id);
		goOnline();

		const later = await createTodo({ title: 'created after reconnect 2' });
		await eventually(async () => {
			expect((await other.serverTodos()).map((s) => s.id)).toContain(later.id);
			expect(get(syncStatus).pendingCount).toBe(0);
			expect(local(t.id)).toBeUndefined();
		});
	});
});

describe('robustness', () => {
	it('sends a change made while an earlier change is still in flight', async () => {
		setLatency(200); // a slow mobile connection
		const first = createTodo({ title: 'first' });
		await sleep(50); // user acts again before the first request has completed
		const second = createTodo({ title: 'second' });
		const created = await Promise.all([first, second]);

		await sleep(1000);
		const serverIds = (await other.serverTodos()).map((s) => s.id);
		for (const t of created) expect(serverIds, t.title).toContain(t.id);
		expect(get(syncStatus).pendingCount).toBe(0);
	});

	it('keeps edits when the device clock is behind the server clock', async () => {
		setServerClockOffset(60_000); // server is a minute ahead
		const t = await createTodo({ title: 'v1' });
		await sleep(5);
		await updateTodo(t.id, { title: 'v2' });
		await sleep(5);
		await updateTodo(t.id, { title: 'v3' });

		await sleep(100);
		expect((await other.serverTodos()).find((s) => s.id === t.id)?.data.title).toBe('v3');
		expect(local(t.id)?.title).toBe('v3');
	});

	it('does not miss changes from other devices when the device clock is ahead of the server clock', async () => {
		setServerClockOffset(-60_000); // server is a minute behind
		goOffline();
		await sleep(10);
		const id = await other.createTodo({ title: 'made while this device was offline' });
		goOnline();
		await eventually(() => expect(local(id)?.title).toBe('made while this device was offline'));
	});

	it('keeps a single live sync connection after the network flaps', async () => {
		goOffline();
		goOnline();
		await sleep(1500); // let any reconnect backoff timers fire
		expect(FakeEventSource.live()).toHaveLength(1);
	});
});
