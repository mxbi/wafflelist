import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';

const MAX_AGE_MS = 30 * 1000; // 30 seconds

export async function verifyRequest(request: Request): Promise<string> {
	const userId = request.headers.get('x-user-id');
	const timestamp = request.headers.get('x-timestamp');
	const signature = request.headers.get('x-signature');

	if (!userId || !timestamp || !signature) {
		throw error(401, 'Missing authentication headers');
	}

	const ts = Number(timestamp);
	if (Math.abs(Date.now() - ts) > MAX_AGE_MS) {
		throw error(401, 'Request timestamp expired');
	}

	const user = db.prepare('SELECT signing_public_key FROM users WHERE id = ?').get(userId) as { signing_public_key: string | null } | undefined;
	if (!user?.signing_public_key) {
		throw error(401, 'User not found or no signing key');
	}

	const publicKeyBytes = Uint8Array.from(atob(user.signing_public_key), c => c.charCodeAt(0));
	const publicKey = await crypto.subtle.importKey('raw', publicKeyBytes, 'Ed25519', false, ['verify']);

	const url = new URL(request.url);
	const body = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.clone().text();
	const message = `${request.method}\n${url.pathname}\n${timestamp}\n${body}`;
	const encoded = new TextEncoder().encode(message);

	const sigBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
	const valid = await crypto.subtle.verify('Ed25519', publicKey, sigBytes, encoded);

	if (!valid) {
		throw error(401, 'Invalid signature');
	}

	return userId;
}

const MAX_BLOB_SIZE = 10 * 1024; // 10 KB
const MAX_BLOBS_PER_USER = 10_000;

export function validateBlob(blob: unknown): void {
	if (typeof blob !== 'string' || blob.length > MAX_BLOB_SIZE) {
		throw error(400, `encrypted_blob must be a string of at most ${MAX_BLOB_SIZE} characters`);
	}
}

export function enforceUserBlobLimit(userId: string, table: 'todos' | 'lists'): void {
	const row = db.prepare(`SELECT COUNT(*) as count FROM ${table} WHERE user_id = ?`).get(userId) as { count: number };
	if (row.count >= MAX_BLOBS_PER_USER) {
		throw error(400, `Maximum of ${MAX_BLOBS_PER_USER} ${table} per user reached`);
	}
}

export async function verifySyncRequest(url: URL): Promise<string> {
	const userId = url.searchParams.get('user_id');
	const timestamp = url.searchParams.get('ts');
	const signature = url.searchParams.get('sig');

	if (!userId || !timestamp || !signature) {
		throw error(401, 'Missing authentication params');
	}

	const ts = Number(timestamp);
	if (Math.abs(Date.now() - ts) > MAX_AGE_MS) {
		throw error(401, 'Request timestamp expired');
	}

	const user = db.prepare('SELECT signing_public_key FROM users WHERE id = ?').get(userId) as { signing_public_key: string | null } | undefined;
	if (!user?.signing_public_key) {
		throw error(401, 'User not found or no signing key');
	}

	const publicKeyBytes = Uint8Array.from(atob(user.signing_public_key), c => c.charCodeAt(0));
	const publicKey = await crypto.subtle.importKey('raw', publicKeyBytes, 'Ed25519', false, ['verify']);

	const message = `GET\n/api/sync\n${timestamp}\n`;
	const encoded = new TextEncoder().encode(message);
	const sigBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
	const valid = await crypto.subtle.verify('Ed25519', publicKey, sigBytes, encoded);

	if (!valid) {
		throw error(401, 'Invalid signature');
	}

	return userId;
}
