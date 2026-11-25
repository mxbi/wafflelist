// Shared test environment: a throwaway working directory (the server writes ./data/wafflelist.db
// relative to cwd), an in-memory IndexedDB, and the handful of browser globals the client stores use.
import 'fake-indexeddb/auto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { vi } from 'vitest';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wafflelist-test-'));
process.chdir(dir);

vi.mock('$app/environment', () => ({ browser: true, dev: false, building: false, version: 'test' }));

const g = globalThis as Record<string, unknown>;

let online = true;
Object.defineProperty(globalThis, 'navigator', {
	configurable: true,
	value: {
		get onLine() { return online; },
		vibrate: () => false
	}
});
export function setOnline(value: boolean) {
	online = value;
	window.dispatchEvent(new Event(value ? 'online' : 'offline'));
}
g.__setOnline = setOnline;

if (!g.window) g.window = Object.assign(new EventTarget(), {});
const store = new Map<string, string>();
g.localStorage = {
	getItem: (k: string) => store.get(k) ?? null,
	setItem: (k: string, v: string) => void store.set(k, String(v)),
	removeItem: (k: string) => void store.delete(k),
	clear: () => store.clear()
};
