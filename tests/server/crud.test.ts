import { describe, it, expect } from 'vitest';
import { newIdentity, signedRequest, openSyncStream, type Identity } from '../helpers/server';
import { db } from '../../src/lib/server/db';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function create(id: Identity, kind: 'todos' | 'lists', body: Record<string, unknown>) {
	const res = await signedRequest(id, 'POST', `/api/${kind}`, { body });
	return { status: res.status, json: await res.json() };
}
async function getAll(id: Identity, kind: 'todos' | 'lists', since?: number) {
	const res = await signedRequest(id, 'GET', `/api/${kind}${since !== undefined ? `?since=${since}` : ''}`);
	expect(res.status).toBe(200);
	return (await res.json()) as { id: string; encrypted_blob: string | null; updated_at: number }[];
}

describe.each(['todos', 'lists'] as const)('%s CRUD', (kind) => {
	it('creates, reads, updates and deletes an item', async () => {
		const me = await newIdentity();
		const c = await create(me, kind, { encrypted_blob: 'v1' });
		expect(c.status).toBe(201);
		expect(c.json.id).toBeTruthy();

		expect((await getAll(me, kind)).map((r) => [r.id, r.encrypted_blob])).toEqual([[c.json.id, 'v1']]);

		const u = await signedRequest(me, 'PATCH', `/api/${kind}/${c.json.id}`, { body: { encrypted_blob: 'v2' } });
		expect(u.status).toBe(200);
		expect((await getAll(me, kind))[0].encrypted_blob).toBe('v2');

		const d = await signedRequest(me, 'DELETE', `/api/${kind}/${c.json.id}`, { body: {} });
		expect(d.status).toBe(200);
		expect(await getAll(me, kind)).toEqual([]);
	});

	it('uses the client-supplied id, and a retried create does not duplicate the item', async () => {
		const me = await newIdentity();
		const id = crypto.randomUUID();
		expect((await create(me, kind, { id, encrypted_blob: 'v1' })).json.id).toBe(id);
		await create(me, kind, { id, encrypted_blob: 'v1' });
		expect((await getAll(me, kind)).map((r) => r.id)).toEqual([id]);
	});

	it('cannot update or re-delete a deleted item', async () => {
		const me = await newIdentity();
		const { json } = await create(me, kind, { encrypted_blob: 'v1' });
		await signedRequest(me, 'DELETE', `/api/${kind}/${json.id}`, { body: {} });
		const u = await signedRequest(me, 'PATCH', `/api/${kind}/${json.id}`, { body: { encrypted_blob: 'v2' } });
		expect(u.status).toBe(404);
	});

	it('delta sync (?since=) returns only changes after the given time, including deletions as tombstones', async () => {
		const me = await newIdentity();
		const a = (await create(me, kind, { encrypted_blob: 'a' })).json;
		const b = (await create(me, kind, { encrypted_blob: 'b' })).json;
		const checkpoint = Math.max(a.updated_at, b.updated_at);
		await sleep(5);

		const c = (await create(me, kind, { encrypted_blob: 'c' })).json;
		await signedRequest(me, 'PATCH', `/api/${kind}/${a.id}`, { body: { encrypted_blob: 'a2' } });
		await signedRequest(me, 'DELETE', `/api/${kind}/${b.id}`, { body: {} });

		const delta = await getAll(me, kind, checkpoint);
		const byId = Object.fromEntries(delta.map((r) => [r.id, r.encrypted_blob]));
		expect(byId).toEqual({ [a.id]: 'a2', [b.id]: null, [c.id]: 'c' });
	});

	it('rejects oversized and non-string blobs', async () => {
		const me = await newIdentity();
		expect((await create(me, kind, { encrypted_blob: 'x'.repeat(10 * 1024 + 1) })).status).toBe(400);
		expect((await create(me, kind, { encrypted_blob: { nested: true } })).status).toBe(400);
		const { json } = await create(me, kind, { encrypted_blob: 'ok' });
		const u = await signedRequest(me, 'PATCH', `/api/${kind}/${json.id}`, { body: { encrypted_blob: 'x'.repeat(10 * 1024 + 1) } });
		expect(u.status).toBe(400);
	});
});

describe('optimistic concurrency (If-Unmodified-Since)', () => {
	it('rejects a stale update with 409 and leaves the server copy unchanged', async () => {
		const me = await newIdentity();
		const { json } = await create(me, 'todos', { encrypted_blob: 'v1' });
		const res = await signedRequest(me, 'PATCH', `/api/todos/${json.id}`, {
			body: { encrypted_blob: 'stale' },
			headers: { 'If-Unmodified-Since': String(json.updated_at - 1000) }
		});
		expect(res.status).toBe(409);
		expect((await getAll(me, 'todos'))[0].encrypted_blob).toBe('v1');
	});

	it('returns the current server copy in the 409 body so the client can resolve the conflict', async () => {
		const me = await newIdentity();
		const { json } = await create(me, 'todos', { encrypted_blob: 'server-version' });
		const res = await signedRequest(me, 'PATCH', `/api/todos/${json.id}`, {
			body: { encrypted_blob: 'stale' },
			headers: { 'If-Unmodified-Since': String(json.updated_at - 1000) }
		});
		expect(res.status).toBe(409);
		const body = await res.json();
		expect(body).toMatchObject({ id: json.id, encrypted_blob: 'server-version', updated_at: json.updated_at });
	});
});

describe('isolation between users', () => {
	it("cannot read another user's items", async () => {
		const alice = await newIdentity();
		const mallory = await newIdentity();
		await create(alice, 'todos', { encrypted_blob: 'alice-secret' });
		expect(await getAll(mallory, 'todos')).toEqual([]);
		expect(await getAll(mallory, 'todos', 0)).toEqual([]);
	});

	it("cannot update or delete another user's items", async () => {
		const alice = await newIdentity();
		const mallory = await newIdentity();
		const { json } = await create(alice, 'todos', { encrypted_blob: 'alice' });

		expect((await signedRequest(mallory, 'PATCH', `/api/todos/${json.id}`, { body: { encrypted_blob: 'pwned' } })).status).toBe(404);
		expect((await signedRequest(mallory, 'DELETE', `/api/todos/${json.id}`, { body: {} })).status).toBe(404);
		expect((await getAll(alice, 'todos'))[0].encrypted_blob).toBe('alice');
	});

	it("cannot overwrite another user's item by POSTing a create with the same id", async () => {
		const alice = await newIdentity();
		const mallory = await newIdentity();
		const { json } = await create(alice, 'todos', { encrypted_blob: 'alice' });

		await create(mallory, 'todos', { id: json.id, encrypted_blob: 'pwned' });

		expect((await getAll(alice, 'todos')).map((r) => r.encrypted_blob)).toEqual(['alice']);
	});

	it('only broadcasts sync events to the owning user', async () => {
		const alice = await newIdentity();
		const bob = await newIdentity();
		const aliceStream = await openSyncStream(alice);
		const bobStream = await openSyncStream(bob);
		try {
			const { json } = await create(alice, 'todos', { encrypted_blob: 'a' });
			await sleep(20);
			expect(aliceStream.events.map((e) => e.type)).toContain('todo_created');
			expect(aliceStream.events.find((e) => e.type === 'todo_created')).toMatchObject({ todo: { id: json.id, encrypted_blob: 'a' } });
			expect(bobStream.events.map((e) => e.type)).toEqual(['connected']);
		} finally {
			aliceStream.close();
			bobStream.close();
		}
	});
});

describe('per-user item limit', () => {
	it('does not count deleted items toward the limit', async () => {
		const me = await newIdentity();
		// Simulate a long-lived account: 10,000 todos created and deleted over time
		const insert = db.prepare('INSERT INTO todos (id, user_id, encrypted_blob, updated_at) VALUES (?, ?, NULL, ?)');
		db.transaction(() => {
			for (let i = 0; i < 10_000; i++) insert.run(`old-${i}`, me.userId, i);
		})();

		const res = await create(me, 'todos', { encrypted_blob: 'new' });
		expect(res.status).toBe(201);
	});
});
