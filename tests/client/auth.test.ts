import { describe, it, expect, beforeAll } from 'vitest';
import { installNetwork, get } from '../helpers/client';
import { generateMnemonic } from '../../src/lib/crypto';
import { login, logout, tryRestore, authState } from '../../src/lib/stores/auth';
import { createTodo, todos } from '../../src/lib/stores/todos';
import { getCached, getQueue } from '../../src/lib/offlinedb';
import { loadKey } from '../../src/lib/keystore';

beforeAll(() => installNetwork());

describe('vault login', () => {
	it('opens the same vault when the phrase is entered with different spacing', async () => {
		// e.g. pasted from a notes app where it wrapped onto two lines
		const phrase = await generateMnemonic();
		const words = phrase.split(' ');
		await login(phrase);
		const expected = get(authState).userId;

		await logout();
		await login(`${words.slice(0, 6).join(' ')}\n${words.slice(6).join('  ')}`);
		expect(get(authState).userId).toBe(expected);
		await logout();
	});

	it('restores the session on reload without re-entering the phrase', async () => {
		await login(await generateMnemonic());
		const { userId } = get(authState);
		authState.set({ status: 'locked', userId: null, encryptionKey: null, signingKey: null }); // page reload
		await tryRestore();
		expect(get(authState)).toMatchObject({ status: 'unlocked', userId });
		await logout();
	});

	it('logging out removes keys and all locally cached data from the device', async () => {
		await login(await generateMnemonic());
		await createTodo({ title: 'private' });
		(globalThis as Record<string, any>).__setOnline(false);
		await createTodo({ title: 'queued' });
		(globalThis as Record<string, any>).__setOnline(true);

		await logout();
		expect(get(authState).status).toBe('locked');
		expect(get(todos)).toEqual([]);
		expect(await loadKey()).toBeNull();
		expect(await getCached('todos')).toEqual([]);
		expect(await getQueue()).toEqual([]);
	});
});
