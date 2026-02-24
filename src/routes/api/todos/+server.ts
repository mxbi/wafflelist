import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { broadcast } from '$lib/server/sync';
import { v4 as uuid } from 'uuid';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const userId = url.searchParams.get('user_id');
	if (!userId) return json([], { status: 400 });

	const rows = db.prepare(
		'SELECT id, encrypted_blob, sort_order, created_at FROM todos WHERE user_id = ? ORDER BY sort_order'
	).all(userId);
	return json(rows);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const id = uuid();
	const userId = body.user_id;
	if (!userId || !body.encrypted_blob) return json({ error: 'Missing fields' }, { status: 400 });

	const maxOrder = db.prepare(
		'SELECT COALESCE(MAX(sort_order), 0) as max_order FROM todos WHERE user_id = ?'
	).get(userId) as { max_order: number };

	const created_at = Date.now();
	const sort_order = maxOrder.max_order + 1;

	db.prepare(
		'INSERT INTO todos (id, user_id, encrypted_blob, sort_order, created_at) VALUES (?, ?, ?, ?, ?)'
	).run(id, userId, body.encrypted_blob, sort_order, created_at);

	const todo = { id, user_id: userId, encrypted_blob: body.encrypted_blob, sort_order, created_at };
	broadcast('todo_created', { todo });
	return json(todo, { status: 201 });
};
