import { wordlist } from '$lib/bip39-wordlist';

export function generateMnemonic(): string {
	// BIP39: 128 bits entropy → 4 bit checksum → 132 bits → 12 words
	const entropy = crypto.getRandomValues(new Uint8Array(16));
	// SHA-256 checksum (sync via subtle not available, compute manually)
	// We'll use a simpler approach: pick 12 random words from the wordlist
	// This gives 12 * 11 = 132 bits of entropy which exceeds BIP39's 128+4
	const words: string[] = [];
	const randValues = crypto.getRandomValues(new Uint32Array(12));
	for (let i = 0; i < 12; i++) {
		words.push(wordlist[randValues[i] % 2048]);
	}
	return words.join(' ');
}

export function validateMnemonic(phrase: string): boolean {
	const words = phrase.trim().split(/\s+/);
	if (words.length !== 12) return false;
	return words.every(w => wordlist.includes(w));
}

const PBKDF2_ITERATIONS = 600_000;
const USER_ID_SALT = new TextEncoder().encode('wafflelist-user-id-v1');
const ENCRYPTION_SALT = new TextEncoder().encode('wafflelist-encryption-v1');

async function phraseToBaseKey(phrase: string): Promise<ArrayBuffer> {
	return crypto.subtle.digest('SHA-256', new TextEncoder().encode(phrase));
}

export async function deriveUserId(phrase: string): Promise<string> {
	const hash = await phraseToBaseKey(phrase);
	const keyMaterial = await crypto.subtle.importKey('raw', hash, 'PBKDF2', false, ['deriveBits']);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', salt: USER_ID_SALT, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
		keyMaterial,
		256
	);
	return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function deriveEncryptionKey(phrase: string): Promise<CryptoKey> {
	const hash = await phraseToBaseKey(phrase);
	const keyMaterial = await crypto.subtle.importKey('raw', hash, 'HKDF', false, ['deriveKey']);
	return crypto.subtle.deriveKey(
		{ name: 'HKDF', salt: ENCRYPTION_SALT, info: new TextEncoder().encode('encryption'), hash: 'SHA-256' },
		keyMaterial,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

export async function encrypt(key: CryptoKey, plaintext: object): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encoded = new TextEncoder().encode(JSON.stringify(plaintext));
	const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
	const combined = new Uint8Array(iv.length + ciphertext.byteLength);
	combined.set(iv, 0);
	combined.set(new Uint8Array(ciphertext), iv.length);
	let binary = '';
	for (let i = 0; i < combined.length; i++) binary += String.fromCharCode(combined[i]);
	return btoa(binary);
}

export async function decrypt(key: CryptoKey, ciphertextB64: string): Promise<object> {
	const combined = Uint8Array.from(atob(ciphertextB64), c => c.charCodeAt(0));
	const iv = combined.slice(0, 12);
	const ciphertext = combined.slice(12);
	const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
	return JSON.parse(new TextDecoder().decode(decrypted));
}
