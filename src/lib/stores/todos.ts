import { writable, derived, get } from 'svelte/store';
import type { Todo, List, EncryptedTodo, EncryptedList } from '$lib/types';
import { encrypt, decrypt } from '$lib/crypto';
import { getAuth } from '$lib/stores/auth';
import { computeCounts } from '$lib/filters';

export const todos = writable<Todo[]>([]);
export const lists = writable<List[]>([]);
export const searchQuery = writable('');
export const selectedTodoId = writable<string | null>(null);
export const counts = derived(todos, ($todos) => computeCounts($todos));

async function api(path: string, opts?: RequestInit) {
	const res = await fetch(path, {
		...opts,
		headers: { 'Content-Type': 'application/json', ...opts?.headers }
	});
	if (!res.ok) throw new Error(`API error: ${res.status}`);
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

export async function loadTodos() {
	const { userId, encryptionKey } = getAuth();
	const rows: EncryptedTodo[] = await api(`/api/todos?user_id=${userId}`);
	const decrypted = await Promise.all(rows.map(r => decryptTodo(encryptionKey, r)));
	todos.set(decrypted);
}

export async function createTodo(todo: { title: string; list_id?: string | null; due_date?: string | null }) {
	const { userId, encryptionKey } = getAuth();

	// Compute sort_order: new todos go to top (min - 1)
	const currentTodos = get(todos);
	const sortOrders = currentTodos.filter(t => !t.completed_at).map(t => t.sort_order);
	const sort_order = sortOrders.length > 0 ? Math.min(...sortOrders) - 1 : 0;

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
	const row: EncryptedTodo = await api('/api/todos', {
		method: 'POST',
		body: JSON.stringify({ user_id: userId, encrypted_blob })
	});
	const newTodo: Todo = { ...plainData, id: row.id };
	todos.update(t => {
		if (t.some(existing => existing.id === newTodo.id)) return t;
		return [...t, newTodo];
	});
	return newTodo;
}

export async function updateTodo(id: string, fields: Partial<Todo>) {
	const { userId, encryptionKey } = getAuth();
	const current = get(todos).find(t => t.id === id);
	if (!current) throw new Error('Todo not found');

	const updated = { ...current, ...fields };
	const { id: _id, ...plainFields } = updated;
	const encrypted_blob = await encrypt(encryptionKey, plainFields);

	await api(`/api/todos/${id}`, {
		method: 'PATCH',
		body: JSON.stringify({ user_id: userId, encrypted_blob })
	});
	const finalTodo: Todo = updated;
	todos.update(t => t.map(todo => todo.id === id ? finalTodo : todo));
	return finalTodo;
}

export async function deleteTodo(id: string) {
	const { userId } = getAuth();
	await api(`/api/todos/${id}`, {
		method: 'DELETE',
		body: JSON.stringify({ user_id: userId })
	});
	todos.update(t => t.filter(todo => todo.id !== id));
}

export async function loadLists() {
	const { userId, encryptionKey } = getAuth();
	const rows: EncryptedList[] = await api(`/api/lists?user_id=${userId}`);
	const decrypted = await Promise.all(rows.map(r => decryptList(encryptionKey, r)));
	decrypted.sort((a, b) => a.sort_order - b.sort_order);
	lists.set(decrypted);
}

export async function createList(name: string, icon?: string) {
	const { userId, encryptionKey } = getAuth();
	const created_at = Date.now();

	const currentLists = get(lists);
	const sortOrders = currentLists.map(l => l.sort_order);
	const sort_order = sortOrders.length > 0 ? Math.max(...sortOrders) + 1 : 0;

	const plainData: Omit<List, 'id'> = { user_id: userId, name, icon: icon ?? null, sort_order, created_at };
	const encrypted_blob = await encrypt(encryptionKey, plainData);
	const row: EncryptedList = await api('/api/lists', {
		method: 'POST',
		body: JSON.stringify({ user_id: userId, encrypted_blob })
	});
	const newList: List = { ...plainData, id: row.id };
	lists.update(l => {
		if (l.some(existing => existing.id === newList.id)) return l;
		return [...l, newList];
	});
	return newList;
}

export async function updateList(id: string, fields: Partial<List>) {
	const { userId, encryptionKey } = getAuth();
	const current = get(lists).find(l => l.id === id);
	if (!current) throw new Error('List not found');

	const updated = { ...current, ...fields };
	const { id: _id, ...plainFields } = updated;
	const encrypted_blob = await encrypt(encryptionKey, plainFields);

	await api(`/api/lists/${id}`, {
		method: 'PATCH',
		body: JSON.stringify({ user_id: userId, encrypted_blob })
	});
	lists.update(l => l.map(list => list.id === id ? updated : list));
	return updated;
}

export async function deleteList(id: string) {
	const { userId } = getAuth();
	await api(`/api/lists/${id}`, {
		method: 'DELETE',
		body: JSON.stringify({ user_id: userId })
	});
	lists.update(l => l.filter(list => list.id !== id));
	// Move todos from this list to inbox
	const currentTodos = get(todos);
	const affected = currentTodos.filter(t => t.list_id === id);
	for (const todo of affected) {
		await updateTodo(todo.id, { list_id: null });
	}
}

export const mobileView = writable<'sidebar' | 'list' | 'detail'>('sidebar');


export function setupSync() {
	const { userId } = getAuth();
	const es = new EventSource(`/api/sync?user_id=${encodeURIComponent(userId)}`);
	es.onmessage = async (e) => {
		const data = JSON.parse(e.data);
		if (data.type === 'connected') return;

		try {
			const { encryptionKey } = getAuth();

			if (data.type === 'todo_updated' && data.todo) {
				const decrypted = await decryptTodo(encryptionKey, data.todo);
				todos.update(t => t.map(todo => todo.id === decrypted.id ? decrypted : todo));
			} else if (data.type === 'todo_deleted') {
				todos.update(t => t.filter(todo => todo.id !== data.id));
			} else if (data.type === 'todo_created' && data.todo) {
				const decrypted = await decryptTodo(encryptionKey, data.todo);
				todos.update(t => {
					if (t.some(todo => todo.id === decrypted.id)) return t;
					return [...t, decrypted];
				});
			} else if (data.type === 'list_updated' && data.list) {
				const decrypted = await decryptList(encryptionKey, data.list);
				lists.update(l => l.map(list => list.id === decrypted.id ? decrypted : list));
			} else if (data.type === 'list_deleted') {
				lists.update(l => l.filter(list => list.id !== data.id));
			} else if (data.type === 'list_created' && data.list) {
				const decrypted = await decryptList(encryptionKey, data.list);
				lists.update(l => {
					if (l.some(list => list.id === decrypted.id)) return l;
					return [...l, decrypted];
				});
			}
		} catch {
			// Can't decrypt — likely belongs to a different user
		}
	};
	return () => es.close();
}
