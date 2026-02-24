import { json } from '@sveltejs/kit';
import { db, DEFAULT_USER_ID } from '$lib/server/db';
import { broadcast } from '$lib/server/sync';
import { v4 as uuid } from 'uuid';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const listId = url.searchParams.get('list_id');
	const view = url.searchParams.get('view');
	const today = new Date().toISOString().split('T')[0];
	const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

	let rows;
	if (view === 'inbox') {
		rows = db.prepare(
			'SELECT * FROM todos WHERE user_id = ? AND list_id IS NULL AND (snoozed_until IS NULL OR snoozed_until <= ?) ORDER BY sort_order'
		).all(DEFAULT_USER_ID, today);
	} else if (view === 'today') {
		rows = db.prepare(
			'SELECT * FROM todos WHERE user_id = ? AND due_date = ? AND (snoozed_until IS NULL OR snoozed_until <= ?) ORDER BY sort_order'
		).all(DEFAULT_USER_ID, today, today);
	} else if (view === 'week') {
		rows = db.prepare(
			'SELECT * FROM todos WHERE user_id = ? AND due_date >= ? AND due_date <= ? AND (snoozed_until IS NULL OR snoozed_until <= ?) ORDER BY sort_order'
		).all(DEFAULT_USER_ID, today, weekEnd, today);
	} else if (view === 'all') {
		rows = db.prepare(
			'SELECT * FROM todos WHERE user_id = ? AND (snoozed_until IS NULL OR snoozed_until <= ?) ORDER BY sort_order'
		).all(DEFAULT_USER_ID, today);
	} else if (view === 'snoozed') {
		rows = db.prepare(
			'SELECT * FROM todos WHERE user_id = ? AND snoozed_until IS NOT NULL AND snoozed_until > ? ORDER BY snoozed_until'
		).all(DEFAULT_USER_ID, today);
	} else if (listId) {
		rows = db.prepare(
			'SELECT * FROM todos WHERE user_id = ? AND list_id = ? AND (snoozed_until IS NULL OR snoozed_until <= ?) ORDER BY sort_order'
		).all(DEFAULT_USER_ID, listId, today);
	} else {
		rows = db.prepare(
			'SELECT * FROM todos WHERE user_id = ? ORDER BY sort_order'
		).all(DEFAULT_USER_ID);
	}
	return json(rows);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const id = uuid();
	const maxOrder = db.prepare(
		'SELECT COALESCE(MAX(sort_order), 0) as max_order FROM todos WHERE user_id = ?'
	).get(DEFAULT_USER_ID) as { max_order: number };

	db.prepare(
		'INSERT INTO todos (id, user_id, list_id, title, notes, due_date, reminder_date, snoozed_until, completed_at, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
	).run(
		id,
		DEFAULT_USER_ID,
		body.list_id ?? null,
		body.title,
		body.notes ?? null,
		body.due_date ?? null,
		body.reminder_date ?? null,
		body.snoozed_until ?? null,
		null,
		maxOrder.max_order + 1,
		Date.now()
	);

	const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
	broadcast('todo_created', { todo });
	return json(todo, { status: 201 });
};
