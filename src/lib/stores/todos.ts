import { writable, derived, get } from 'svelte/store';
import type { Todo, List, EncryptedTodo, EncryptedList } from '$lib/types';
import { encrypt, decrypt, signRequest } from '$lib/crypto';
import { getAuth } from '$lib/stores/auth';
import { computeCounts } from '$lib/filters';
import {
	cacheRows, getCached, clearCached, deleteCachedRow,
	getMeta, setMeta,
	enqueue, getQueue, clearQueue, clearQueueItem, collapseQueue,
	type QueueItem
} from '$lib/offlinedb';

export const todos = writable<Todo[]>([]);
export const lists = writable<List[]>([]);
export const searchQuery = writable('');
export const selectedTodoId = writable<string | null>(null);
export const counts = derived(todos, ($todos) => computeCounts($todos));
export const mobileView = writable<'sidebar' | 'list' | 'detail'>('sidebar');

export const syncStatus = writable<{
	pendingCount: number;
	lastSyncedAt: number | null;
	isOnline: boolean;
}>({ pendingCount: 0, lastSyncedAt: null, isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true });

export function resetStores() {
	todos.set([]);
	lists.set([]);
	searchQuery.set('');
	selectedTodoId.set(null);
	syncStatus.set({ pendingCount: 0, lastSyncedAt: null, isOnline: navigator.onLine });
	mobileView.set('sidebar');
}

async function api(path: string, opts?: RequestInit & { headers?: Record<string, string> }) {
	const { userId, signingKey } = getAuth();
	const method = opts?.method ?? 'GET';
	const body = opts?.body as string | undefined ?? '';
	const timestamp = Date.now();
	// Sign only the pathname (no query string) to match server-side verification
	const pathname = path.split('?')[0];
	const signature = await signRequest(signingKey, method, pathname, body, timestamp);

	const res = await fetch(path, {
		...opts,
		headers: {
			'Content-Type': 'application/json',
			'X-User-Id': userId,
			'X-Timestamp': String(timestamp),
			'X-Signature': signature,
			...opts?.headers
		}
	});
	if (!res.ok) {
		const err = new Error(`API error: ${res.status}`) as Error & { status: number };
		err.status = res.status;
		throw err;
	}
	return res.json();
}

async function decryptTodo(key: CryptoKey, row: EncryptedTodo): Promise<Todo> {
	const plain = await decrypt(key, row.encrypted_blob) as Record<string, unknown>;
	return {
		...plain,
		id: row.id,
		sort_order: (plain.sort_order as number) ?? 0,
		created_at: (plain.created_at as number) ?? row.updated_at
	} as Todo;
}

async function decryptList(key: CryptoKey, row: EncryptedList): Promise<List> {
	const plain = await decrypt(key, row.encrypted_blob) as Record<string, unknown>;
	return {
		...plain,
		id: row.id,
		sort_order: (plain.sort_order as number) ?? 0,
		created_at: (plain.created_at as number) ?? row.updated_at
	} as List;
}

// --- Cache-first loading ---

export async function loadTodosFromCache() {
	try {
		const { encryptionKey } = getAuth();
		const rows = await getCached('todos');
		if (rows.length > 0) {
			const decrypted = await Promise.all(
				rows.filter(r => r.encrypted_blob).map(r => decryptTodo(encryptionKey, r as EncryptedTodo))
			);
			todos.set(decrypted);
		}
	} catch {
		// No cache available
	}
}

export async function loadListsFromCache() {
	try {
		const { encryptionKey } = getAuth();
		const rows = await getCached('lists');
		if (rows.length > 0) {
			const decrypted = await Promise.all(
				rows.filter(r => r.encrypted_blob).map(r => decryptList(encryptionKey, r as EncryptedList))
			);
			decrypted.sort((a, b) => a.sort_order - b.sort_order);
			lists.set(decrypted);
		}
	} catch {
		// No cache available
	}
}

export async function loadTodos() {
	const { encryptionKey } = getAuth();
	const rows: EncryptedTodo[] = await api('/api/todos');
	const decrypted = await Promise.all(rows.map(r => decryptTodo(encryptionKey, r)));
	todos.set(decrypted);
	// Cache and update lastSyncedAt
	await cacheRows('todos', rows);
	const now = Date.now();
	await setMeta('lastSyncedAt', now);
	syncStatus.update(s => ({ ...s, lastSyncedAt: now }));
}

export async function loadLists() {
	const { encryptionKey } = getAuth();
	const rows: EncryptedList[] = await api('/api/lists');
	const decrypted = await Promise.all(rows.map(r => decryptList(encryptionKey, r)));
	decrypted.sort((a, b) => a.sort_order - b.sort_order);
	lists.set(decrypted);
	await cacheRows('lists', rows);
	const now = Date.now();
	await setMeta('lastSyncedAt', now);
	syncStatus.update(s => ({ ...s, lastSyncedAt: now }));
}

// --- Delta sync ---

async function deltaSync() {
	try {
		const { encryptionKey } = getAuth();
		const lastSynced = await getMeta('lastSyncedAt') as number | null;
		const since = lastSynced ?? 0;

		const [todoRows, listRows]: [EncryptedTodo[], EncryptedList[]] = await Promise.all([
			api(`/api/todos?since=${since}`),
			api(`/api/lists?since=${since}`)
		]);

		// Process todos
		if (todoRows.length > 0) {
			await cacheRows('todos', todoRows);
			const currentTodos = get(todos);
			let updated = [...currentTodos];
			for (const row of todoRows) {
				if (row.encrypted_blob === null) {
					// Tombstone — remove locally
					updated = updated.filter(t => t.id !== row.id);
				} else {
					const decrypted = await decryptTodo(encryptionKey, row);
					const idx = updated.findIndex(t => t.id === row.id);
					if (idx >= 0) updated[idx] = decrypted;
					else updated.push(decrypted);
				}
			}
			todos.set(updated);
		}

		// Process lists
		if (listRows.length > 0) {
			await cacheRows('lists', listRows);
			const currentLists = get(lists);
			let updated = [...currentLists];
			for (const row of listRows) {
				if (row.encrypted_blob === null) {
					updated = updated.filter(l => l.id !== row.id);
				} else {
					const decrypted = await decryptList(encryptionKey, row);
					const idx = updated.findIndex(l => l.id === row.id);
					if (idx >= 0) updated[idx] = decrypted;
					else updated.push(decrypted);
				}
			}
			updated.sort((a, b) => a.sort_order - b.sort_order);
			lists.set(updated);
		}

		const now = Date.now();
		await setMeta('lastSyncedAt', now);
		syncStatus.update(s => ({ ...s, lastSyncedAt: now, isOnline: true }));
	} catch {
		// Delta sync failed — will retry on next reconnect
	}
}

// --- Reset sync (full reload from server, clear local state) ---

export async function resetSync() {
	await clearQueue();
	await clearCached('todos');
	await clearCached('lists');
	await setMeta('lastSyncedAt', null);
	syncStatus.update(s => ({ ...s, pendingCount: 0, lastSyncedAt: null }));
	await loadLists();
	await loadTodos();
}

// --- Queue flusher ---

async function updatePendingCount() {
	const items = await getQueue();
	syncStatus.update(s => ({ ...s, pendingCount: items.length }));
}

let flushing = false;

async function flushQueue() {
	if (flushing) {
		console.warn('[flush] skipped: already flushing');
		return;
	}
	flushing = true;
	console.log('[flush] start');
	try {
		await collapseQueue();
		const items = await getQueue();
		console.log('[flush] queue items:', items.length, items.map(i => ({ queue_id: i.queue_id, action: i.action, entity_id: i.entity_id })));
		if (items.length === 0) return;

		for (const item of items) {
			try {
				console.log('[flush] processing:', item.action, item.entity_type, item.entity_id, 'queue_id:', item.queue_id);
				if (item.action === 'create') {
					await api(`/api/${item.entity_type}s`, {
						method: 'POST',
						body: JSON.stringify({ id: item.entity_id, encrypted_blob: item.payload!.encrypted_blob })
					});
				} else if (item.action === 'update') {
					try {
						await api(`/api/${item.entity_type}s/${item.entity_id}`, {
							method: 'PATCH',
							body: JSON.stringify({ encrypted_blob: item.payload!.encrypted_blob }),
							headers: { 'If-Unmodified-Since': String(item.updated_at) }
						});
					} catch (e: unknown) {
						if ((e as { status?: number }).status === 409) {
							await deltaSync();
						} else {
							throw e;
						}
					}
				} else if (item.action === 'delete') {
					await api(`/api/${item.entity_type}s/${item.entity_id}`, {
						method: 'DELETE',
						body: JSON.stringify({})
					});
				}
				console.log('[flush] clearing queue_id:', item.queue_id, typeof item.queue_id);
				await clearQueueItem(item.queue_id);
				const remaining = await getQueue();
				console.log('[flush] after clear, remaining:', remaining.length, remaining.map(i => i.queue_id));
			} catch (e) {
				console.error('[flush] error processing item:', e);
				break;
			}
		}
	} finally {
		flushing = false;
		const finalItems = await getQueue();
		console.log('[flush] final queue:', finalItems.length);
		await updatePendingCount();
	}
}

async function enqueueAndFlush(item: Omit<QueueItem, 'queue_id' | 'timestamp'>) {
	await enqueue({ ...item, timestamp: Date.now() });
	const count = (await getQueue()).length;
	console.log('[enqueueAndFlush] enqueued, queue size:', count, 'online:', navigator.onLine);
	await updatePendingCount();
	if (navigator.onLine) {
		await flushQueue();
	}
}

// --- Mutations (optimistic + queue) ---

export async function createTodo(todo: { title: string; list_id?: string | null; due_date?: string | null }) {
	const { userId, encryptionKey } = getAuth();

	const currentTodos = get(todos);
	const sortOrders = currentTodos.filter(t => !t.completed_at).map(t => t.sort_order);
	const sort_order = sortOrders.length > 0 ? Math.min(...sortOrders) - 1 : 0;

	const id = crypto.randomUUID();
	const created_at = Date.now();
	const plainData: Omit<Todo, 'id'> = {
		user_id: userId,
		list_id: todo.list_id ?? null,
		title: todo.title,
		notes: null,
		due_date: todo.due_date ?? null,
		reminder_date: null,
		snoozed_until: null,
		completed_at: null,
		sort_order,
		created_at
	};
	const encrypted_blob = await encrypt(encryptionKey, plainData);
	const newTodo: Todo = { ...plainData, id };

	// Optimistic update
	todos.update(t => [...t, newTodo]);

	// Cache
	await cacheRows('todos', [{ id, encrypted_blob, updated_at: created_at }]);

	// Enqueue and flush
	await enqueueAndFlush({
		entity_type: 'todo',
		action: 'create',
		entity_id: id,
		payload: { encrypted_blob },
		updated_at: created_at
	});

	return newTodo;
}

export async function updateTodo(id: string, fields: Partial<Todo>) {
	const { encryptionKey } = getAuth();
	const current = get(todos).find(t => t.id === id);
	if (!current) throw new Error('Todo not found');

	const updated = { ...current, ...fields };
	const { id: _id, ...plainFields } = updated;
	const encrypted_blob = await encrypt(encryptionKey, plainFields);
	const now = Date.now();

	// Optimistic update
	todos.update(t => t.map(todo => todo.id === id ? updated : todo));

	// Cache
	await cacheRows('todos', [{ id, encrypted_blob, updated_at: now }]);

	// Enqueue and flush
	await enqueueAndFlush({
		entity_type: 'todo',
		action: 'update',
		entity_id: id,
		payload: { encrypted_blob },
		updated_at: now
	});

	return updated;
}

export async function deleteTodo(id: string) {
	// Optimistic update
	todos.update(t => t.filter(todo => todo.id !== id));

	// Remove from cache
	await deleteCachedRow('todos', id);

	// Enqueue and flush
	await enqueueAndFlush({
		entity_type: 'todo',
		action: 'delete',
		entity_id: id,
		updated_at: Date.now()
	});
}

export async function createList(name: string, icon?: string) {
	const { userId, encryptionKey } = getAuth();
	const created_at = Date.now();

	const currentLists = get(lists);
	const sortOrders = currentLists.map(l => l.sort_order);
	const sort_order = sortOrders.length > 0 ? Math.max(...sortOrders) + 1 : 0;

	const id = crypto.randomUUID();
	const plainData: Omit<List, 'id'> = { user_id: userId, name, icon: icon ?? null, sort_order, created_at };
	const encrypted_blob = await encrypt(encryptionKey, plainData);
	const newList: List = { ...plainData, id };

	// Optimistic update
	lists.update(l => [...l, newList]);

	// Cache
	await cacheRows('lists', [{ id, encrypted_blob, updated_at: created_at }]);

	// Enqueue and flush
	await enqueueAndFlush({
		entity_type: 'list',
		action: 'create',
		entity_id: id,
		payload: { encrypted_blob },
		updated_at: created_at
	});

	return newList;
}

export async function updateList(id: string, fields: Partial<List>) {
	const { encryptionKey } = getAuth();
	const current = get(lists).find(l => l.id === id);
	if (!current) throw new Error('List not found');

	const updated = { ...current, ...fields };
	const { id: _id, ...plainFields } = updated;
	const encrypted_blob = await encrypt(encryptionKey, plainFields);
	const now = Date.now();

	// Optimistic update
	lists.update(l => l.map(list => list.id === id ? updated : list));

	// Cache
	await cacheRows('lists', [{ id, encrypted_blob, updated_at: now }]);

	// Enqueue and flush
	await enqueueAndFlush({
		entity_type: 'list',
		action: 'update',
		entity_id: id,
		payload: { encrypted_blob },
		updated_at: now
	});

	return updated;
}

export async function deleteList(id: string) {
	// Optimistic update
	lists.update(l => l.filter(list => list.id !== id));

	// Remove from cache
	await deleteCachedRow('lists', id);

	// Enqueue and flush
	await enqueueAndFlush({
		entity_type: 'list',
		action: 'delete',
		entity_id: id,
		updated_at: Date.now()
	});

	// Move todos from this list to inbox
	const currentTodos = get(todos);
	const affected = currentTodos.filter(t => t.list_id === id);
	for (const todo of affected) {
		await updateTodo(todo.id, { list_id: null });
	}
}

// --- SSE Sync with reconnect + delta sync ---

export function setupSync() {
	const { userId, signingKey } = getAuth();
	let es: EventSource | undefined;
	let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
	let backoff = 1000;
	let destroyed = false;

	// Online/offline tracking
	function handleOnline() {
		// Don't set isOnline here — let SSE onopen do that
		// Just trigger a reconnect attempt
		if (!es || es.readyState === EventSource.CLOSED) {
			connect();
		}
	}
	function handleOffline() {
		syncStatus.update(s => ({ ...s, isOnline: false }));
	}
	window.addEventListener('online', handleOnline);
	window.addEventListener('offline', handleOffline);

	async function connect() {
		if (destroyed) return;

		// Don't attempt SSE connection when offline
		if (!navigator.onLine) return;

		const timestamp = Date.now();
		const message = `GET\n/api/sync\n${timestamp}\n`;
		const encoded = new TextEncoder().encode(message);
		let sigBuf: ArrayBuffer;
		try {
			sigBuf = await crypto.subtle.sign('Ed25519', signingKey, encoded);
		} catch {
			if (!destroyed) reconnectTimer = setTimeout(connect, backoff);
			return;
		}
		let binary = '';
		const bytes = new Uint8Array(sigBuf);
		for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
		const sig = btoa(binary);

		const params = new URLSearchParams({ user_id: userId, ts: String(timestamp), sig });
		es = new EventSource(`/api/sync?${params}`);

		es.onopen = () => {
			backoff = 1000;
			syncStatus.update(s => ({ ...s, isOnline: true }));
			// Delta sync + flush queue on reconnect
			flushQueue().then(() => deltaSync());
		};

		es.onmessage = async (e) => {
			const data = JSON.parse(e.data);
			if (data.type === 'connected') return;

			try {
				const { encryptionKey } = getAuth();

				if (data.type === 'todo_updated' && data.todo) {
					const decrypted = await decryptTodo(encryptionKey, data.todo);
					todos.update(t => t.map(todo => todo.id === decrypted.id ? decrypted : todo));
					await cacheRows('todos', [data.todo]);
				} else if (data.type === 'todo_deleted') {
					todos.update(t => t.filter(todo => todo.id !== data.id));
					await deleteCachedRow('todos', data.id);
				} else if (data.type === 'todo_created' && data.todo) {
					const decrypted = await decryptTodo(encryptionKey, data.todo);
					todos.update(t => {
						if (t.some(todo => todo.id === decrypted.id)) return t;
						return [...t, decrypted];
					});
					await cacheRows('todos', [data.todo]);
				} else if (data.type === 'list_updated' && data.list) {
					const decrypted = await decryptList(encryptionKey, data.list);
					lists.update(l => l.map(list => list.id === decrypted.id ? decrypted : list));
					await cacheRows('lists', [data.list]);
				} else if (data.type === 'list_deleted') {
					lists.update(l => l.filter(list => list.id !== data.id));
					await deleteCachedRow('lists', data.id);
				} else if (data.type === 'list_created' && data.list) {
					const decrypted = await decryptList(encryptionKey, data.list);
					lists.update(l => {
						if (l.some(list => list.id === decrypted.id)) return l;
						return [...l, decrypted];
					});
					await cacheRows('lists', [data.list]);
				}

				const now = Date.now();
				await setMeta('lastSyncedAt', now);
				syncStatus.update(s => ({ ...s, lastSyncedAt: now }));
			} catch {
				// Can't decrypt — likely belongs to a different user
			}
		};

		es.onerror = () => {
			es?.close();
			syncStatus.update(s => ({ ...s, isOnline: false }));
			if (!destroyed) {
				reconnectTimer = setTimeout(connect, backoff);
				backoff = Math.min(backoff * 2, 30000);
			}
		};
	}

	connect().catch(() => {});

	// Initialize pending count
	updatePendingCount();

	return () => {
		destroyed = true;
		es?.close();
		if (reconnectTimer) clearTimeout(reconnectTimer);
		window.removeEventListener('online', handleOnline);
		window.removeEventListener('offline', handleOffline);
	};
}
