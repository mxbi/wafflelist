// Harness for driving the real client stores (todos/auth) against the in-process server.
import { vi } from 'vitest';
import { get } from 'svelte/store';
import { serverFetch, signedRequest, type Identity } from './server';
import { deriveEncryptionKey, deriveSigningKeyPair, encrypt, decrypt } from '../../src/lib/crypto';

declare const __setOnline: (v: boolean) => void;

// --- network ---

let latencyMs = 0;
/** Simulated round-trip latency for API calls. */
export function setLatency(ms: number) {
	latencyMs = ms;
}

export function installNetwork() {
	globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
		if (!navigator.onLine) throw new TypeError('Failed to fetch');
		if (latencyMs) await new Promise((r) => setTimeout(r, latencyMs));
		return serverFetch(input, init);
	}) as typeof fetch;
	(globalThis as Record<string, unknown>).EventSource = FakeEventSource;
}

/** EventSource stand-in that streams from the real /api/sync handler. */
export class FakeEventSource {
	static CONNECTING = 0;
	static OPEN = 1;
	static CLOSED = 2;
	static instances: FakeEventSource[] = [];

	readyState = FakeEventSource.CONNECTING;
	onopen: (() => void) | null = null;
	onmessage: ((e: { data: string }) => void) | null = null;
	onerror: (() => void) | null = null;
	private reader?: ReadableStreamDefaultReader<unknown>;

	constructor(public url: string) {
		FakeEventSource.instances.push(this);
		queueMicrotask(() => this.start());
	}

	static live() {
		return FakeEventSource.instances.filter((e) => e.readyState !== FakeEventSource.CLOSED);
	}

	private async start() {
		let res: Response;
		try {
			res = await fetch(this.url);
		} catch {
			return this.fail();
		}
		if (res.status !== 200) return this.fail();
		this.reader = res.body!.getReader();
		if (this.readyState === FakeEventSource.CLOSED) return void this.reader.cancel();
		this.readyState = FakeEventSource.OPEN;
		this.onopen?.();
		const decoder = new TextDecoder();
		let buf = '';
		try {
			while (true) {
				const { value, done } = await this.reader.read();
				if (done || this.readyState === FakeEventSource.CLOSED) break;
				buf += typeof value === 'string' ? value : decoder.decode(value as Uint8Array);
				let i;
				while ((i = buf.indexOf('\n\n')) >= 0) {
					const line = buf.slice(0, i).split('\n').find((l) => l.startsWith('data: '));
					buf = buf.slice(i + 2);
					if (line && this.readyState !== FakeEventSource.CLOSED) this.onmessage?.({ data: line.slice(6) });
				}
			}
		} catch {
			/* cancelled */
		}
	}

	private fail() {
		if (this.readyState === FakeEventSource.CLOSED) return;
		this.readyState = FakeEventSource.CLOSED;
		this.onerror?.();
	}

	/** Simulate the connection dropping (network loss / server restart). */
	drop() {
		this.reader?.cancel().catch(() => {});
		this.fail();
	}

	close() {
		this.readyState = FakeEventSource.CLOSED;
		this.reader?.cancel().catch(() => {});
	}
}

export function goOffline() {
	__setOnline(false);
	for (const es of FakeEventSource.live()) es.drop();
}

export function goOnline() {
	__setOnline(true);
}

// --- "another device" using the same vault, independent of the app's client code ---

export interface OtherDevice {
	createTodo(fields: Record<string, unknown>): Promise<string>;
	updateTodo(id: string, fields: Record<string, unknown>): Promise<Response>;
	deleteTodo(id: string): Promise<Response>;
	serverTodos(): Promise<{ id: string; blob: string; data: Record<string, unknown> }[]>;
	serverLists(): Promise<{ id: string; data: Record<string, unknown> }[]>;
}

export async function otherDevice(phrase: string, userId: string): Promise<OtherDevice> {
	const key = await deriveEncryptionKey(phrase);
	const { privateKey } = await deriveSigningKeyPair(phrase);
	const id: Identity = { userId, privateKey, publicKeyB64: '' };
	const now = () => Date.now();

	async function serverTodos() {
		const rows = await (await signedRequest(id, 'GET', '/api/todos')).json();
		return Promise.all(rows.map(async (r: { id: string; encrypted_blob: string }) => ({
			id: r.id, blob: r.encrypted_blob, data: (await decrypt(key, r.encrypted_blob)) as Record<string, unknown>
		})));
	}

	return {
		async createTodo(fields) {
			const tid = crypto.randomUUID();
			const plain = { user_id: userId, list_id: null, title: '', notes: null, due_date: null, reminder_date: null, snoozed_until: null, completed_at: null, sort_order: 0, created_at: now(), ...fields };
			const res = await signedRequest(id, 'POST', '/api/todos', { body: { id: tid, encrypted_blob: await encrypt(key, plain) } });
			if (res.status !== 201) throw new Error(`other device create failed ${res.status}`);
			return tid;
		},
		async updateTodo(tid, fields) {
			const current = (await serverTodos()).find((t) => t.id === tid)!;
			return signedRequest(id, 'PATCH', `/api/todos/${tid}`, { body: { encrypted_blob: await encrypt(key, { ...current.data, ...fields }) } });
		},
		deleteTodo: (tid) => signedRequest(id, 'DELETE', `/api/todos/${tid}`, { body: {} }),
		serverTodos,
		async serverLists() {
			const rows = await (await signedRequest(id, 'GET', '/api/lists')).json();
			return Promise.all(rows.map(async (r: { id: string; encrypted_blob: string }) => ({ id: r.id, data: (await decrypt(key, r.encrypted_blob)) as Record<string, unknown> })));
		}
	};
}

export async function eventually(fn: () => void | Promise<void>, timeout = 3000) {
	await vi.waitFor(fn, { timeout, interval: 20 });
}

export { get };
