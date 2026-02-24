import { writable } from 'svelte/store';
import type { Todo, List } from '$lib/types';

export const todos = writable<Todo[]>([]);
export const lists = writable<List[]>([]);
export const searchQuery = writable('');
export const selectedTodoId = writable<string | null>(null);
export const counts = writable<{ inbox: number; today: number; week: number; all: number; snoozed: number; lists: Record<string, number> }>({ inbox: 0, today: 0, week: 0, all: 0, snoozed: 0, lists: {} });

async function api(path: string, opts?: RequestInit) {
	const res = await fetch(path, {
		...opts,
		headers: { 'Content-Type': 'application/json', ...opts?.headers }
	});
	if (!res.ok) throw new Error(`API error: ${res.status}`);
	return res.json();
}

export async function loadTodos(params?: Record<string, string>) {
	const qs = params ? '?' + new URLSearchParams(params).toString() : '';
	const data = await api(`/api/todos${qs}`);
	todos.set(data);
}

export async function createTodo(todo: { title: string; list_id?: string | null; due_date?: string | null }) {
	const data = await api('/api/todos', { method: 'POST', body: JSON.stringify(todo) });
	todos.update((t) => [...t, data]);
	loadCounts();
	return data;
}

export async function updateTodo(id: string, fields: Partial<Todo>) {
	const data = await api(`/api/todos/${id}`, { method: 'PATCH', body: JSON.stringify(fields) });
	todos.update((t) => t.map((todo) => (todo.id === id ? data : todo)));
	loadCounts();
	return data;
}

export async function deleteTodo(id: string) {
	await api(`/api/todos/${id}`, { method: 'DELETE' });
	todos.update((t) => t.filter((todo) => todo.id !== id));
	loadCounts();
}

export async function loadCounts() {
	const data = await api('/api/counts');
	counts.set(data);
}

export async function loadLists() {
	const data = await api('/api/lists');
	lists.set(data);
}

export async function createList(name: string, icon?: string) {
	const data = await api('/api/lists', { method: 'POST', body: JSON.stringify({ name, icon }) });
	lists.update((l) => [...l, data]);
	return data;
}

export async function updateList(id: string, fields: Partial<List>) {
	const data = await api(`/api/lists/${id}`, { method: 'PATCH', body: JSON.stringify(fields) });
	lists.update((l) => l.map((list) => (list.id === id ? data : list)));
	return data;
}

export async function deleteList(id: string) {
	await api(`/api/lists/${id}`, { method: 'DELETE' });
	lists.update((l) => l.filter((list) => list.id !== id));
}

export const mobileView = writable<'sidebar' | 'list' | 'detail'>('sidebar');

export const currentReloadFn = writable<(() => void) | null>(null);

export function setupSync() {
	const es = new EventSource('/api/sync');
	es.onmessage = (e) => {
		const data = JSON.parse(e.data);
		if (data.type === 'connected') return;

		if (data.type === 'todo_updated') {
			todos.update((t) => t.map((todo) => (todo.id === data.todo.id ? data.todo : todo)));
			loadCounts();
		} else if (data.type === 'todo_deleted') {
			todos.update((t) => t.filter((todo) => todo.id !== data.id));
			loadCounts();
		} else if (data.type === 'todo_created') {
			let reload: (() => void) | null = null;
			currentReloadFn.subscribe((fn) => (reload = fn))();
			if (reload) (reload as () => void)();
			loadCounts();
		} else if (data.type === 'list_updated') {
			lists.update((l) => l.map((list) => (list.id === data.list.id ? data.list : list)));
		} else if (data.type === 'list_deleted') {
			lists.update((l) => l.filter((list) => list.id !== data.id));
			loadCounts();
		} else if (data.type === 'list_created') {
			lists.update((l) => [...l, data.list]);
			loadCounts();
		}
	};
	return () => es.close();
}
