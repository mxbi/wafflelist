import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const { user_id } = await request.json();
	if (!user_id || typeof user_id !== 'string') {
		return json({ error: 'user_id required' }, { status: 400 });
	}

	const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
	if (!existing) {
		db.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)').run(
			user_id, user_id, 'e2e-encrypted', Date.now()
		);
	}

	return json({ ok: true });
};
