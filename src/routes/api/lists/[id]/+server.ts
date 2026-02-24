import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { broadcast } from '$lib/server/sync';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const body = await request.json();
	const userId = body.user_id;
	if (!userId) throw error(400, 'user_id required');

	const existing = db.prepare('SELECT id FROM lists WHERE id = ? AND user_id = ?').get(params.id, userId);
	if (!existing) throw error(404, 'List not found');

	const fields: string[] = [];
	const values: unknown[] = [];

	if (body.encrypted_blob !== undefined) {
		fields.push('encrypted_blob = ?');
		values.push(body.encrypted_blob);
	}
	if (body.sort_order !== undefined) {
		fields.push('sort_order = ?');
		values.push(body.sort_order);
	}

	if (fields.length === 0) throw error(400, 'No fields to update');

	values.push(params.id);
	db.prepare(`UPDATE lists SET ${fields.join(', ')} WHERE id = ?`).run(...values);

	const list = db.prepare('SELECT id, encrypted_blob, sort_order, created_at FROM lists WHERE id = ?').get(params.id);
	broadcast('list_updated', { list });
	return json(list);
};

export const DELETE: RequestHandler = async ({ params, request }) => {
	const body = await request.json();
	const userId = body.user_id;
	if (!userId) throw error(400, 'user_id required');

	const result = db.prepare('DELETE FROM lists WHERE id = ? AND user_id = ?').run(params.id, userId);
	if (result.changes === 0) throw error(404, 'List not found');
	broadcast('list_deleted', { id: params.id });
	return json({ ok: true });
};
