import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const { user_id, signing_public_key } = await request.json();
	if (!user_id || typeof user_id !== 'string') {
		return json({ error: 'user_id required' }, { status: 400 });
	}

	// Validate signing_public_key format if provided
	if (signing_public_key) {
		if (typeof signing_public_key !== 'string') {
			return json({ error: 'invalid signing_public_key' }, { status: 400 });
		}
		try {
			const keyBytes = Uint8Array.from(atob(signing_public_key), c => c.charCodeAt(0));
			if (keyBytes.length !== 32) {
				return json({ error: 'signing_public_key must be 32 bytes' }, { status: 400 });
			}
			await crypto.subtle.importKey('raw', keyBytes, 'Ed25519', true, ['verify']);
		} catch {
			return json({ error: 'invalid signing_public_key' }, { status: 400 });
		}
	}

	const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
	if (!existing) {
		db.prepare('INSERT INTO users (id, username, password_hash, signing_public_key, created_at) VALUES (?, ?, ?, ?, ?)').run(
			user_id, user_id, 'e2e-encrypted', signing_public_key || null, Date.now()
		);
	}

	return json({ ok: true });
};
