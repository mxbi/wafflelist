import { defineConfig, devices } from '@playwright/test';

const PORT = 4174;

export default defineConfig({
	testDir: 'tests/e2e',
	fullyParallel: true,
	timeout: 30_000,
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: 'off',
		...devices['Desktop Chrome']
	},
	webServer: {
		// Production build served by adapter-node, with its SQLite DB in a throwaway directory
		command: `npm run build && node tests/e2e/serve.mjs`,
		port: PORT,
		env: { PORT: String(PORT) },
		reuseExistingServer: false,
		timeout: 180_000
	}
});
