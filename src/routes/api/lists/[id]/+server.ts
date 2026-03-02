import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { broadcast } from '$lib/server/sync';
import { verifyRequest, validateBlob } from '$lib/server/verify';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const userId = await verifyRequest(request);
	const body = await request.json();

	const existing = db.prepare('SELECT id FROM lists WHERE id = ? AND user_id = ?').get(params.id, userId);
	if (!existing) throw error(404, 'List not found');

	if (body.encrypted_blob === undefined) throw error(400, 'No fields to update');
	validateBlob(body.encrypted_blob);

	const now = Date.now();
	db.prepare('UPDATE lists SET encrypted_blob = ?, updated_at = ? WHERE id = ?').run(body.encrypted_blob, now, params.id);

	const list = db.prepare('SELECT id, encrypted_blob, updated_at FROM lists WHERE id = ?').get(params.id);
	broadcast(userId, 'list_updated', { list });
	return json(list);
};

export const DELETE: RequestHandler = async ({ params, request }) => {
	const userId = await verifyRequest(request);

	const result = db.prepare('DELETE FROM lists WHERE id = ? AND user_id = ?').run(params.id, userId);
	if (result.changes === 0) throw error(404, 'List not found');
	broadcast(userId, 'list_deleted', { id: params.id });
	return json({ ok: true });
};
