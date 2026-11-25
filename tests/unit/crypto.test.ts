import { describe, it, expect } from 'vitest';
import {
	generateMnemonic, validateMnemonic, deriveUserId, deriveEncryptionKey, deriveSigningKeyPair,
	encrypt, decrypt, signRequest
} from '../../src/lib/crypto';

// Standard BIP39 test vector (all-zero entropy)
const PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('key derivation is stable', () => {
	// If any of these change, every existing user is locked out of their vault and
	// can no longer decrypt their data. Only update them alongside a migration.
	it('derives the same user id from a phrase as previous releases', async () => {
		expect(await deriveUserId(PHRASE)).toBe('abfcff88ab02e4de4c2d215b0bda3b38bbc3602819973951fe8931e2afd53f98');
	});

	it('derives the same signing public key as previous releases', async () => {
		expect((await deriveSigningKeyPair(PHRASE)).publicKeyRaw).toBe('2K3qHXhgi5yNcB+Vs7gbMFJMN9Hbbru8ITKJZ6y5JtY=');
	});

	it('can still decrypt data encrypted by previous releases', async () => {
		const key = await deriveEncryptionKey(PHRASE);
		expect(await decrypt(key, 'HrEznOEhAXUuiHugfj3uihCYufY0i9q0MRv7222tRM0p6vsCHxiK8BZTS9mD')).toEqual({ title: 'hello' });
	});

	it('derives a signing key whose signatures verify against the published public key', async () => {
		const { privateKey, publicKeyRaw } = await deriveSigningKeyPair(PHRASE);
		const pub = await crypto.subtle.importKey('raw', Buffer.from(publicKeyRaw, 'base64'), 'Ed25519', false, ['verify']);
		const sig = await signRequest(privateKey, 'GET', '/api/todos', '', 123);
		const ok = await crypto.subtle.verify('Ed25519', pub, Buffer.from(sig, 'base64'), new TextEncoder().encode('GET\n/api/todos\n123\n'));
		expect(ok).toBe(true);
	});
});

describe('mnemonics', () => {
	it('generates valid, distinct 12-word phrases', async () => {
		const seen = new Set<string>();
		for (let i = 0; i < 50; i++) {
			const p = await generateMnemonic();
			expect(p.split(' ')).toHaveLength(12);
			expect(await validateMnemonic(p)).toBe(true);
			seen.add(p);
		}
		expect(seen.size).toBe(50);
	});

	it('accepts the standard BIP39 test vector', async () => {
		expect(await validateMnemonic(PHRASE)).toBe(true);
	});

	it('rejects a phrase with a bad checksum (one mistyped-but-valid word)', async () => {
		expect(await validateMnemonic(PHRASE.replace(/about$/, 'above'))).toBe(false);
	});

	it('rejects unknown words and wrong word counts', async () => {
		expect(await validateMnemonic(PHRASE.replace(/about$/, 'aboutt'))).toBe(false);
		expect(await validateMnemonic(PHRASE.split(' ').slice(0, 11).join(' '))).toBe(false);
	});
});

describe('encryption', () => {
	it('round-trips data, with a fresh IV each time', async () => {
		const key = await deriveEncryptionKey(PHRASE);
		const data = { title: 'Buy milk 🥛', notes: null, sort_order: -3.5 };
		const a = await encrypt(key, data);
		const b = await encrypt(key, data);
		expect(a).not.toBe(b);
		expect(await decrypt(key, a)).toEqual(data);
	});

	it('does not leak plaintext into the ciphertext', async () => {
		const key = await deriveEncryptionKey(PHRASE);
		const blob = await encrypt(key, { title: 'secret-title' });
		expect(Buffer.from(blob, 'base64').toString('latin1')).not.toContain('secret');
	});

	it('fails to decrypt with another vault key or after tampering', async () => {
		const key = await deriveEncryptionKey(PHRASE);
		const other = await deriveEncryptionKey(await generateMnemonic());
		const blob = await encrypt(key, { title: 'x' });
		await expect(decrypt(other, blob)).rejects.toThrow();

		const bytes = Buffer.from(blob, 'base64');
		bytes[bytes.length - 1] ^= 1;
		await expect(decrypt(key, bytes.toString('base64'))).rejects.toThrow();
	});
});
