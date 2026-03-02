import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { broadcast } from '$lib/server/sync';
import { verifyRequest } from '$lib/server/verify';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const userId = await verifyRequest(request);
	const body = await request.json();

	const existing = db.prepare('SELECT id FROM todos WHERE id = ? AND user_id = ?').get(params.id, userId);
	if (!existing) throw error(404, 'Todo not found');

	if (body.encrypted_blob === undefined) throw error(400, 'No fields to update');

	const now = Date.now();
	db.prepare('UPDATE todos SET encrypted_blob = ?, updated_at = ? WHERE id = ?').run(body.encrypted_blob, now, params.id);

	const todo = db.prepare('SELECT id, encrypted_blob, updated_at FROM todos WHERE id = ?').get(params.id);
	broadcast(userId, 'todo_updated', { todo });
	return json(todo);
};

export const DELETE: RequestHandler = async ({ params, request }) => {
	const userId = await verifyRequest(request);

	const result = db.prepare('DELETE FROM todos WHERE id = ? AND user_id = ?').run(params.id, userId);
	if (result.changes === 0) throw error(404, 'Todo not found');
	broadcast(userId, 'todo_deleted', { id: params.id });
	return json({ ok: true });
};
