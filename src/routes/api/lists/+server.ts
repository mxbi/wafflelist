import { json } from '@sveltejs/kit';
import { db, DEFAULT_USER_ID } from '$lib/server/db';
import { broadcast } from '$lib/server/sync';
import { v4 as uuid } from 'uuid';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const rows = db.prepare('SELECT * FROM lists WHERE user_id = ? ORDER BY sort_order').all(DEFAULT_USER_ID);
	return json(rows);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const id = uuid();
	const maxOrder = db.prepare(
		'SELECT COALESCE(MAX(sort_order), 0) as max_order FROM lists WHERE user_id = ?'
	).get(DEFAULT_USER_ID) as { max_order: number };

	db.prepare(
		'INSERT INTO lists (id, user_id, name, icon, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)'
	).run(id, DEFAULT_USER_ID, body.name, body.icon ?? null, maxOrder.max_order + 1, Date.now());

	const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(id);
	broadcast('list_created', { list });
	return json(list, { status: 201 });
};
