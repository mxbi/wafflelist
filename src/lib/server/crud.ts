import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { broadcast } from '$lib/server/sync';
import { verifyRequest, validateBlob, enforceUserBlobLimit } from '$lib/server/verify';
import { v4 as uuid } from 'uuid';

type Table = 'todos' | 'lists';

export function getAll(table: Table) {
	return async ({ request, url }: { request: Request; url: URL }) => {
		const userId = await verifyRequest(request);
		const since = url.searchParams.get('since');

		const rows = since
			? db.prepare(`SELECT id, encrypted_blob, updated_at FROM ${table} WHERE user_id = ? AND updated_at > ?`).all(userId, Number(since))
			: db.prepare(`SELECT id, encrypted_blob, updated_at FROM ${table} WHERE user_id = ?`).all(userId);

		return json(rows);
	};
}

export function create(table: Table) {
	const singular = table === 'todos' ? 'todo' : 'list';
	return async ({ request }: { request: Request }) => {
		const userId = await verifyRequest(request);
		const body = await request.json();
		if (!body.encrypted_blob) return json({ error: 'Missing fields' }, { status: 400 });
		validateBlob(body.encrypted_blob);
		enforceUserBlobLimit(userId, table);

		const id = uuid();
		const now = Date.now();
		db.prepare(`INSERT INTO ${table} (id, user_id, encrypted_blob, updated_at) VALUES (?, ?, ?, ?)`).run(id, userId, body.encrypted_blob, now);

		const item = { id, user_id: userId, encrypted_blob: body.encrypted_blob, updated_at: now };
		broadcast(userId, `${singular}_created`, { [singular]: item });
		return json(item, { status: 201 });
	};
}

export function update(table: Table) {
	const singular = table === 'todos' ? 'todo' : 'list';
	const notFoundMsg = singular.charAt(0).toUpperCase() + singular.slice(1) + ' not found';
	return async ({ params, request }: { params: { id: string }; request: Request }) => {
		const userId = await verifyRequest(request);
		const body = await request.json();

		const existing = db.prepare(`SELECT id FROM ${table} WHERE id = ? AND user_id = ?`).get(params.id, userId);
		if (!existing) throw error(404, notFoundMsg);
		if (body.encrypted_blob === undefined) throw error(400, 'No fields to update');
		validateBlob(body.encrypted_blob);

		const now = Date.now();
		db.prepare(`UPDATE ${table} SET encrypted_blob = ?, updated_at = ? WHERE id = ?`).run(body.encrypted_blob, now, params.id);

		const item = { id: params.id, encrypted_blob: body.encrypted_blob, updated_at: now };
		broadcast(userId, `${singular}_updated`, { [singular]: item });
		return json(item);
	};
}

export function remove(table: Table) {
	const singular = table === 'todos' ? 'todo' : 'list';
	const notFoundMsg = singular.charAt(0).toUpperCase() + singular.slice(1) + ' not found';
	return async ({ params, request }: { params: { id: string }; request: Request }) => {
		const userId = await verifyRequest(request);

		const result = db.prepare(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`).run(params.id, userId);
		if (result.changes === 0) throw error(404, notFoundMsg);
		broadcast(userId, `${singular}_deleted`, { id: params.id });
		return json({ ok: true });
	};
}
