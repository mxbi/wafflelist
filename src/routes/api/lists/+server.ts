import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { broadcast } from '$lib/server/sync';
import { verifyRequest, validateBlob, enforceUserBlobLimit } from '$lib/server/verify';
import { v4 as uuid } from 'uuid';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const userId = await verifyRequest(request);

	const since = url.searchParams.get('since');
	if (since) {
		const rows = db.prepare(
			'SELECT id, encrypted_blob, updated_at FROM lists WHERE user_id = ? AND updated_at > ?'
		).all(userId, Number(since));
		return json(rows);
	}

	const rows = db.prepare(
		'SELECT id, encrypted_blob, updated_at FROM lists WHERE user_id = ?'
	).all(userId);
	return json(rows);
};

export const POST: RequestHandler = async ({ request }) => {
	const userId = await verifyRequest(request);
	const body = await request.json();
	if (!body.encrypted_blob) return json({ error: 'Missing fields' }, { status: 400 });
	validateBlob(body.encrypted_blob);
	enforceUserBlobLimit(userId, 'lists');

	const id = uuid();
	const now = Date.now();

	db.prepare(
		'INSERT INTO lists (id, user_id, encrypted_blob, updated_at) VALUES (?, ?, ?, ?)'
	).run(id, userId, body.encrypted_blob, now);

	const list = { id, user_id: userId, encrypted_blob: body.encrypted_blob, updated_at: now };
	broadcast(userId, 'list_created', { list });
	return json(list, { status: 201 });
};
