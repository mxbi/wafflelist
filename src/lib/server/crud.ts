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
			: db.prepare(`SELECT id, encrypted_blob, updated_at FROM ${table} WHERE user_id = ? AND encrypted_blob IS NOT NULL`).all(userId);

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

		const id = body.id || uuid();
		const now = Date.now();

		// Upsert: if client provides an id that already exists (e.g. offline retry), update instead
		db.prepare(
			`INSERT INTO ${table} (id, user_id, encrypted_blob, updated_at) VALUES (?, ?, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET encrypted_blob = excluded.encrypted_blob, updated_at = excluded.updated_at`
		).run(id, userId, body.encrypted_blob, now);

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

		const existing = db.prepare(`SELECT id, updated_at FROM ${table} WHERE id = ? AND user_id = ? AND encrypted_blob IS NOT NULL`).get(params.id, userId) as { id: string; updated_at: number } | undefined;
		if (!existing) throw error(404, notFoundMsg);
		if (body.encrypted_blob === undefined) throw error(400, 'No fields to update');
		validateBlob(body.encrypted_blob);

		// Optimistic concurrency: check If-Unmodified-Since header
		const ifUnmodified = request.headers.get('If-Unmodified-Since');
		if (ifUnmodified && existing.updated_at > Number(ifUnmodified)) {
			return json({ id: params.id, encrypted_blob: existing.encrypted_blob, updated_at: existing.updated_at }, { status: 409 });
		}

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

		// Tombstone: set encrypted_blob to NULL instead of deleting
		const now = Date.now();
		const result = db.prepare(`UPDATE ${table} SET encrypted_blob = NULL, updated_at = ? WHERE id = ? AND user_id = ? AND encrypted_blob IS NOT NULL`).run(now, params.id, userId);
		if (result.changes === 0) throw error(404, notFoundMsg);
		broadcast(userId, `${singular}_deleted`, { id: params.id });
		return json({ ok: true });
	};
}
