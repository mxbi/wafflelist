<script lang="ts">
	import { generateMnemonic, validateMnemonic } from '$lib/crypto';
	import { login } from '$lib/stores/auth';

	let mode = $state<'choose' | 'generate' | 'enter'>('choose');
	let phrase = $state('');
	let generatedPhrase = $state('');
	let confirmed = $state(false);
	let loading = $state(false);
	let error = $state('');

	async function handleGenerate() {
		generatedPhrase = await generateMnemonic();
		mode = 'generate';
	}

	async function handleLogin(p: string) {
		if (!(await validateMnemonic(p.trim()))) {
			error = 'Invalid vault phrase';
			return;
		}
		error = '';
		loading = true;
		try {
			await login(p.trim());
		} catch (e) {
			error = 'Login failed';
			loading = false;
		}
	}
</script>

<div class="login-container">
	<div class="login-card">
		<h1>🧇 WaffleList</h1>

		{#if loading}
			<div class="spinner-wrap">
				<div class="spinner"></div>
				<p>Deriving keys...</p>
			</div>
		{:else if mode === 'choose'}
			<p class="subtitle">Your data is end-to-end encrypted with a vault phrase.</p>
			<div class="buttons">
				<button class="btn primary" onclick={() => mode = 'enter'}>Log In</button>
				<button class="btn" onclick={handleGenerate}>Create New Vault</button>
			</div>
		{:else if mode === 'generate'}
			<p class="subtitle">Save this phrase somewhere safe. It's the only way to access your data.</p>
			<div class="phrase-display">{generatedPhrase}</div>
			<label class="confirm-label">
				<input type="checkbox" bind:checked={confirmed} />
				I've saved my vault phrase
			</label>
			{#if error}<p class="error">{error}</p>{/if}
			<div class="buttons">
				<button class="btn primary" disabled={!confirmed} onclick={() => handleLogin(generatedPhrase)}>Continue</button>
				<button class="btn" onclick={() => { mode = 'choose'; confirmed = false; }}>Back</button>
			</div>
		{:else}
			<p class="subtitle">Enter your 12-word vault phrase.</p>
			<textarea bind:value={phrase} rows="3" placeholder="word1 word2 word3 ..."></textarea>
			{#if error}<p class="error">{error}</p>{/if}
			<div class="buttons">
				<button class="btn primary" disabled={!phrase.trim()} onclick={() => handleLogin(phrase)}>Log In</button>
				<button class="btn" onclick={() => { mode = 'choose'; phrase = ''; error = ''; }}>Back</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.login-container {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100vh;
		background: #2B579A;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}
	.login-card {
		background: white;
		border-radius: 12px;
		padding: 40px;
		max-width: 460px;
		width: 90%;
		text-align: center;
		box-shadow: 0 8px 32px rgba(0,0,0,0.2);
	}
	h1 { font-size: 1.8rem; margin-bottom: 16px; }
	.subtitle { color: #666; margin-bottom: 24px; font-size: 0.95rem; }
	.buttons { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
	.btn {
		padding: 12px 20px;
		border: 1px solid #ddd;
		border-radius: 8px;
		font-size: 1rem;
		cursor: pointer;
		background: white;
		transition: background 0.15s;
	}
	.btn:hover { background: #f5f5f5; }
	.btn.primary { background: #2B579A; color: white; border-color: #2B579A; }
	.btn.primary:hover { background: #1e3f70; }
	.btn.primary:disabled { opacity: 0.5; cursor: default; }
	.phrase-display {
		background: #f8f8f8;
		border: 1px solid #e0e0e0;
		border-radius: 8px;
		padding: 16px;
		font-family: monospace;
		font-size: 1rem;
		line-height: 1.6;
		word-spacing: 4px;
		user-select: all;
	}
	.confirm-label {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 16px;
		justify-content: center;
		font-size: 0.9rem;
		color: #555;
		cursor: pointer;
	}
	textarea {
		width: 100%;
		padding: 12px;
		border: 1px solid #ddd;
		border-radius: 8px;
		font-size: 1rem;
		font-family: monospace;
		resize: none;
		outline: none;
		box-sizing: border-box;
	}
	textarea:focus { border-color: #2B579A; }
	.error { color: #e74c3c; font-size: 0.9rem; margin-top: 8px; }
	.spinner-wrap { padding: 40px 0; }
	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid #e0e0e0;
		border-top-color: #2B579A;
		border-radius: 50%;
		margin: 0 auto 16px;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }
</style>
