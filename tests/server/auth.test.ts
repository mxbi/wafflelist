import { describe, it, expect } from 'vitest';
import { newIdentity, registerIdentity, signedRequest, serverFetch, sign } from '../helpers/server';

const blob = 'ZW5jcnlwdGVk'; // opaque to the server

describe('request authentication', () => {
	it('accepts a correctly signed request', async () => {
		const me = await newIdentity();
		const res = await signedRequest(me, 'GET', '/api/todos');
		expect(res.status).toBe(200);
	});

	it('rejects requests with no auth headers', async () => {
		const res = await serverFetch('/api/todos');
		expect(res.status).toBe(401);
	});

	it('rejects requests for an unregistered user', async () => {
		const ghost = await newIdentity(false);
		const res = await signedRequest(ghost, 'GET', '/api/todos');
		expect(res.status).toBe(401);
	});

	it('rejects a request signed by a different key', async () => {
		const me = await newIdentity();
		const attacker = await newIdentity();
		const res = await signedRequest({ ...attacker, userId: me.userId }, 'GET', '/api/todos');
		expect(res.status).toBe(401);
	});

	it('rejects a request whose body was tampered with after signing', async () => {
		const me = await newIdentity();
		const res = await signedRequest(me, 'POST', '/api/todos', {
			body: { encrypted_blob: 'tampered' },
			signBody: JSON.stringify({ encrypted_blob: blob })
		});
		expect(res.status).toBe(401);
	});

	it('rejects a signature reused on a different path', async () => {
		const me = await newIdentity();
		const created = await (await signedRequest(me, 'POST', '/api/todos', { body: { encrypted_blob: blob } })).json();
		const res = await signedRequest(me, 'DELETE', `/api/todos/${created.id}`, { body: {}, signPath: '/api/todos/some-other-id' });
		expect(res.status).toBe(401);
	});

	it('rejects a signature reused with a different method', async () => {
		const me = await newIdentity();
		const created = await (await signedRequest(me, 'POST', '/api/todos', { body: { encrypted_blob: blob } })).json();
		const res = await signedRequest(me, 'DELETE', `/api/todos/${created.id}`, { body: {}, signMethod: 'PATCH' });
		expect(res.status).toBe(401);
	});

	it('rejects stale and far-future timestamps', async () => {
		const me = await newIdentity();
		const tenMinutes = 10 * 60 * 1000;
		expect((await signedRequest(me, 'GET', '/api/todos', { timestamp: Date.now() - tenMinutes })).status).toBe(401);
		expect((await signedRequest(me, 'GET', '/api/todos', { timestamp: Date.now() + tenMinutes })).status).toBe(401);
	});

	it('rejects a sync stream request with a bad signature', async () => {
		const me = await newIdentity();
		const other = await newIdentity();
		const ts = Date.now();
		const sig = await sign(other.privateKey, 'GET', '/api/sync', ts, '');
		const res = await serverFetch(`/api/sync?${new URLSearchParams({ user_id: me.userId, ts: String(ts), sig })}`);
		expect(res.status).toBe(401);
	});
});

describe('registration (/api/auth/login)', () => {
	it('does not let a second registration replace an existing signing key', async () => {
		const me = await newIdentity();
		const attacker = await newIdentity(false);
		// Attacker who learns the user id tries to register their own key for it
		await registerIdentity({ userId: me.userId, publicKeyB64: attacker.publicKeyB64 });

		const asAttacker = await signedRequest({ ...attacker, userId: me.userId }, 'GET', '/api/todos');
		expect(asAttacker.status).toBe(401);
		const asOwner = await signedRequest(me, 'GET', '/api/todos');
		expect(asOwner.status).toBe(200);
	});

	it('is idempotent for the same user and key (logging in on a second device)', async () => {
		const me = await newIdentity();
		await registerIdentity(me);
		expect((await signedRequest(me, 'GET', '/api/todos')).status).toBe(200);
	});

	it.each([
		['not base64 at all', '!!!'],
		['wrong length', Buffer.alloc(16).toString('base64')],
		['non-string', 12345]
	])('rejects a malformed signing key (%s)', async (_name, key) => {
		const res = await serverFetch('/api/auth/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ user_id: 'a'.repeat(64), signing_public_key: key })
		});
		expect(res.status).toBe(400);
	});
});
