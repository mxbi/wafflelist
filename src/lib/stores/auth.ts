import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { deriveUserId, deriveEncryptionKey, deriveSigningKeyPair } from '$lib/crypto';
import { saveKey, loadKey, clearKey } from '$lib/keystore';

interface AuthState {
	status: 'locked' | 'unlocked';
	userId: string | null;
	encryptionKey: CryptoKey | null;
	signingKey: CryptoKey | null;
}

const LEGACY_STORAGE_KEY = 'wafflelist-phrase';

export const authState = writable<AuthState>({ status: 'locked', userId: null, encryptionKey: null, signingKey: null });

export async function login(phrase: string): Promise<void> {
	const [userId, encryptionKey, signingKeyPair] = await Promise.all([
		deriveUserId(phrase),
		deriveEncryptionKey(phrase),
		deriveSigningKeyPair(phrase)
	]);

	await fetch('/api/auth/login', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ user_id: userId, signing_public_key: signingKeyPair.publicKeyRaw })
	});

	if (browser) {
		await saveKey(userId, encryptionKey, signingKeyPair.privateKey);
		localStorage.removeItem(LEGACY_STORAGE_KEY);
	}
	authState.set({ status: 'unlocked', userId, encryptionKey, signingKey: signingKeyPair.privateKey });
}

export async function logout(): Promise<void> {
	if (browser) {
		await clearKey();
		localStorage.removeItem(LEGACY_STORAGE_KEY);
	}
	authState.set({ status: 'locked', userId: null, encryptionKey: null, signingKey: null });
}

export async function tryRestore(): Promise<void> {
	if (!browser) return;

	// Try IndexedDB first
	const stored = await loadKey();
	if (stored) {
		await fetch('/api/auth/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ user_id: stored.userId })
		});
		localStorage.removeItem(LEGACY_STORAGE_KEY);
		authState.set({ status: 'unlocked', userId: stored.userId, encryptionKey: stored.key, signingKey: stored.signingKey });
		return;
	}

	// Migrate from legacy localStorage
	const phrase = localStorage.getItem(LEGACY_STORAGE_KEY);
	if (phrase) {
		await login(phrase);
	}
}

export function getAuth(): { userId: string; encryptionKey: CryptoKey; signingKey: CryptoKey } {
	const state = get(authState);
	if (!state.userId || !state.encryptionKey || !state.signingKey) throw new Error('Not authenticated');
	return { userId: state.userId, encryptionKey: state.encryptionKey, signingKey: state.signingKey };
}
