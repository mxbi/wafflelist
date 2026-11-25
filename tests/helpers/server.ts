// In-process "server": routes fetch-style requests to the real SvelteKit endpoint handlers,
// backed by a real SQLite DB in the test's temp directory.
import { isHttpError } from '@sveltejs/kit';
import * as todos from '../../src/routes/api/todos/+server';
import * as todo from '../../src/routes/api/todos/[id]/+server';
import * as lists from '../../src/routes/api/lists/+server';
import * as list from '../../src/routes/api/lists/[id]/+server';
import * as login from '../../src/routes/api/auth/login/+server';
import * as sync from '../../src/routes/api/sync/+server';

type Handler = (event: unknown) => Promise<Response>;

const ORIGIN = 'http://localhost';

/** Offset (ms) added to Date.now() while server code runs, to simulate client/server clock skew. */
let serverClockOffset = 0;
let activeHandlers = 0;
const realNow = Date.now.bind(Date);
export function setServerClockOffset(ms: number) {
	serverClockOffset = ms;
}

function match(pathname: string): { mod: Record<string, Handler>; params: Record<string, string> } | null {
	let m: RegExpMatchArray | null;
	if (pathname === '/api/todos') return { mod: todos as never, params: {} };
	if (pathname === '/api/lists') return { mod: lists as never, params: {} };
	if (pathname === '/api/auth/login') return { mod: login as never, params: {} };
	if (pathname === '/api/sync') return { mod: sync as never, params: {} };
	if ((m = pathname.match(/^\/api\/todos\/([^/]+)$/))) return { mod: todo as never, params: { id: m[1] } };
	if ((m = pathname.match(/^\/api\/lists\/([^/]+)$/))) return { mod: list as never, params: { id: m[1] } };
	return null;
}

export async function handle(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const route = match(url.pathname);
	if (!route) return new Response('Not found', { status: 404 });
	const handler = route.mod[request.method];
	if (!handler) return new Response('Method not allowed', { status: 405 });

	// Server code sees the skewed clock. Handlers can overlap (e.g. parallel delta fetches), so
	// count active handlers and only restore the real clock when the last one finishes.
	if (activeHandlers++ === 0 && serverClockOffset) {
		const offset = serverClockOffset;
		Date.now = () => realNow() + offset;
	}
	try {
		return await handler({ request, url, params: route.params });
	} catch (e) {
		if (isHttpError(e)) return Response.json(e.body, { status: e.status });
		throw e;
	} finally {
		if (--activeHandlers === 0) Date.now = realNow;
	}
}

/** A fetch() replacement that talks to the in-process server. */
export async function serverFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
	const req = input instanceof Request ? input : new Request(new URL(String(input), ORIGIN), init);
	return handle(req);
}

// --- A minimal signing client, independent of the app's client code ---

export interface Identity {
	userId: string;
	privateKey: CryptoKey;
	publicKeyB64: string;
}

const b64 = (buf: ArrayBuffer | Uint8Array) => Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).toString('base64');

export async function newIdentity(register = true): Promise<Identity> {
	const kp = (await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair;
	const publicKeyB64 = b64(await crypto.subtle.exportKey('raw', kp.publicKey));
	const userId = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');
	const id = { userId, privateKey: kp.privateKey, publicKeyB64 };
	if (register) await registerIdentity(id);
	return id;
}

export async function registerIdentity(id: { userId: string; publicKeyB64: string }) {
	const res = await serverFetch('/api/auth/login', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ user_id: id.userId, signing_public_key: id.publicKeyB64 })
	});
	if (res.status !== 200) throw new Error(`register failed: ${res.status}`);
}

export async function sign(key: CryptoKey, method: string, pathname: string, timestamp: number, body: string) {
	const msg = new TextEncoder().encode(`${method}\n${pathname}\n${timestamp}\n${body}`);
	return b64(await crypto.subtle.sign('Ed25519', key, msg));
}

export interface SignedOpts {
	body?: unknown;
	headers?: Record<string, string>;
	timestamp?: number;
	/** Override what gets signed (to test tampering). */
	signMethod?: string;
	signPath?: string;
	signBody?: string;
}

export async function signedRequest(id: Identity, method: string, path: string, opts: SignedOpts = {}): Promise<Response> {
	const body = opts.body === undefined ? '' : JSON.stringify(opts.body);
	const timestamp = opts.timestamp ?? Date.now();
	const pathname = path.split('?')[0];
	const signature = await sign(id.privateKey, opts.signMethod ?? method, opts.signPath ?? pathname, timestamp, opts.signBody ?? body);
	return serverFetch(path, {
		method,
		body: method === 'GET' ? undefined : body,
		headers: {
			'Content-Type': 'application/json',
			'X-User-Id': id.userId,
			'X-Timestamp': String(timestamp),
			'X-Signature': signature,
			...opts.headers
		}
	});
}

/** Open the SSE stream for a user and collect parsed events. */
export async function openSyncStream(id: Identity) {
	const ts = Date.now();
	const sig = await sign(id.privateKey, 'GET', '/api/sync', ts, '');
	const params = new URLSearchParams({ user_id: id.userId, ts: String(ts), sig });
	const res = await serverFetch(`/api/sync?${params}`);
	if (res.status !== 200) throw new Error(`sync stream failed: ${res.status}`);
	const events: Record<string, unknown>[] = [];
	const reader = res.body!.getReader();
	const decoder = new TextDecoder();
	let buf = '';
	let closed = false;
	(async () => {
		while (!closed) {
			const { value, done } = await reader.read();
			if (done) break;
			buf += typeof value === 'string' ? value : decoder.decode(value);
			let i;
			while ((i = buf.indexOf('\n\n')) >= 0) {
				const chunk = buf.slice(0, i);
				buf = buf.slice(i + 2);
				const line = chunk.split('\n').find((l) => l.startsWith('data: '));
				if (line) events.push(JSON.parse(line.slice(6)));
			}
		}
	})().catch(() => {});
	return {
		events,
		close() {
			closed = true;
			reader.cancel().catch(() => {});
		}
	};
}
