import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { deriveUserId, deriveEncryptionKey } from '$lib/crypto';

interface AuthState {
	status: 'locked' | 'unlocked';
	userId: string | null;
	encryptionKey: CryptoKey | null;
}

const STORAGE_KEY = 'wafflelist-phrase';

export const authState = writable<AuthState>({ status: 'locked', userId: null, encryptionKey: null });

export async function login(phrase: string): Promise<void> {
	const [userId, encryptionKey] = await Promise.all([
		deriveUserId(phrase),
		deriveEncryptionKey(phrase)
	]);

	await fetch('/api/auth/login', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ user_id: userId })
	});

	if (browser) localStorage.setItem(STORAGE_KEY, phrase);
	authState.set({ status: 'unlocked', userId, encryptionKey });
}

export function logout(): void {
	if (browser) localStorage.removeItem(STORAGE_KEY);
	authState.set({ status: 'locked', userId: null, encryptionKey: null });
}

export async function tryRestore(): Promise<void> {
	if (!browser) return;
	const phrase = localStorage.getItem(STORAGE_KEY);
	if (!phrase) return;
	await login(phrase);
}

export function getAuth(): { userId: string; encryptionKey: CryptoKey } {
	const state = get(authState);
	if (!state.userId || !state.encryptionKey) throw new Error('Not authenticated');
	return { userId: state.userId, encryptionKey: state.encryptionKey };
}
