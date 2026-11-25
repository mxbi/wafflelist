import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['tests/{unit,server,client}/**/*.test.ts'],
		setupFiles: ['tests/helpers/setup.ts'],
		// Each test file gets its own process so it can have its own cwd (and hence its own SQLite DB)
		pool: 'forks',
		testTimeout: 20000,
		// The sync engine logs every queue operation; keep test output readable
		onConsoleLog: (log) => !/^\[(flush|enqueueAndFlush)\]/.test(log)
	}
});
