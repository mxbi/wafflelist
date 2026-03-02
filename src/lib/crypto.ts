import { wordlist } from '$lib/bip39-wordlist';

export async function generateMnemonic(): Promise<string> {
	const entropy = crypto.getRandomValues(new Uint8Array(16));
	const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', entropy));
	// 128 bits entropy + 4 bits checksum = 132 bits = 12 × 11-bit indices
	const bits = Array.from(entropy)
		.map((b) => b.toString(2).padStart(8, '0'))
		.join('') + hash[0].toString(2).padStart(8, '0').slice(0, 4);
	const words: string[] = [];
	for (let i = 0; i < 12; i++) {
		const index = parseInt(bits.slice(i * 11, i * 11 + 11), 2);
		words.push(wordlist[index]);
	}
	return words.join(' ');
}

export async function validateMnemonic(phrase: string): Promise<boolean> {
	const words = phrase.trim().split(/\s+/);
	if (words.length !== 12) return false;
	const indices = words.map((w) => wordlist.indexOf(w));
	if (indices.some((i) => i === -1)) return false;
	const bits = indices.map((i) => i.toString(2).padStart(11, '0')).join('');
	const entropyBits = bits.slice(0, 128);
	const checksumBits = bits.slice(128);
	const entropy = new Uint8Array(16);
	for (let i = 0; i < 16; i++) {
		entropy[i] = parseInt(entropyBits.slice(i * 8, i * 8 + 8), 2);
	}
	const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', entropy));
	const expectedChecksum = hash[0].toString(2).padStart(8, '0').slice(0, 4);
	return checksumBits === expectedChecksum;
}

const PBKDF2_ITERATIONS = 600_000;
const USER_ID_SALT = new TextEncoder().encode('wafflelist-user-id-v1');
const ENCRYPTION_SALT = new TextEncoder().encode('wafflelist-encryption-v1');

export async function deriveUserId(phrase: string): Promise<string> {
	const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(phrase), 'PBKDF2', false, ['deriveBits']);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', salt: USER_ID_SALT, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
		keyMaterial,
		256
	);
	return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function deriveEncryptionKey(phrase: string): Promise<CryptoKey> {
	const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(phrase), 'HKDF', false, ['deriveKey']);
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

const SIGNING_SALT = new TextEncoder().encode('wafflelist-signing-v1');

// PKCS8 ASN.1 prefix for Ed25519 private key (RFC 8410)
const ED25519_PKCS8_PREFIX = new Uint8Array([
	0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
	0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20
]);

export async function deriveSigningKeyPair(phrase: string): Promise<{ privateKey: CryptoKey; publicKeyRaw: string }> {
	const keyMaterial = await crypto.subtle.importKey(
		'raw', new TextEncoder().encode(phrase), 'HKDF', false, ['deriveBits']
	);
	const seedBits = await crypto.subtle.deriveBits(
		{ name: 'HKDF', salt: SIGNING_SALT, info: new TextEncoder().encode('signing'), hash: 'SHA-256' },
		keyMaterial, 256
	);
	const seed = new Uint8Array(seedBits);

	// Wrap in PKCS8 envelope
	const pkcs8 = new Uint8Array(ED25519_PKCS8_PREFIX.length + seed.length);
	pkcs8.set(ED25519_PKCS8_PREFIX, 0);
	pkcs8.set(seed, ED25519_PKCS8_PREFIX.length);

	const privateKey = await crypto.subtle.importKey('pkcs8', pkcs8, 'Ed25519', false, ['sign']);

	// Extract public key by importing as extractable then exporting raw
	const extractableKey = await crypto.subtle.importKey('pkcs8', pkcs8, 'Ed25519', true, ['sign']);
	const publicKeyPair = await crypto.subtle.exportKey('jwk', extractableKey);
	// Ed25519 JWK has 'x' as the public key (base64url)
	const publicKeyBytes = Uint8Array.from(atob(publicKeyPair.x!.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
	let binary = '';
	for (let i = 0; i < publicKeyBytes.length; i++) binary += String.fromCharCode(publicKeyBytes[i]);
	const publicKeyRaw = btoa(binary);

	return { privateKey, publicKeyRaw };
}

export async function signRequest(
	privateKey: CryptoKey, method: string, path: string, body: string, timestamp: number
): Promise<string> {
	const message = `${method}\n${path}\n${timestamp}\n${body}`;
	const encoded = new TextEncoder().encode(message);
	const signature = await crypto.subtle.sign('Ed25519', privateKey, encoded);
	let binary = '';
	const bytes = new Uint8Array(signature);
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	return btoa(binary);
}
