<script lang="ts">
	import { background, presetColors, presetGradients } from '$lib/stores/settings';
	import { lists, todos } from '$lib/stores/todos';
	import { logout } from '$lib/stores/auth';
	import { Download, Lock } from 'lucide-svelte';

	interface Props {
		onclose: () => void;
	}
	let { onclose }: Props = $props();

	function handleBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget) onclose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}

	function exportData() {
		const data = { lists: $lists, todos: $todos, exported_at: new Date().toISOString() };
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `wafflelist-export-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(a.href);
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onclick={handleBackdrop} onkeydown={handleKeydown}>
	<div class="modal" role="dialog" aria-modal="true" aria-label="Settings">
		<div class="modal-header">
			<h2>Settings</h2>
			<button class="close-btn" onclick={onclose} aria-label="Close">&times;</button>
		</div>

		<div class="modal-body">
			<section>
				<div class="section-label">Appearance</div>
				<div class="subsection-label">Colors</div>
				<div class="swatches">
					{#each presetColors as color}
						<button
							class="swatch"
							class:active={$background === color}
							style="background: {color}"
							onclick={() => background.set(color)}
							aria-label="Set background color"
						></button>
					{/each}
				</div>
				<div class="subsection-label">Gradients</div>
				<div class="swatches">
					{#each presetGradients as grad}
						<button
							class="swatch"
							class:active={$background === grad}
							style="background: {grad}"
							onclick={() => background.set(grad)}
							aria-label="Set background gradient"
						></button>
					{/each}
				</div>
			</section>

			<div class="divider"></div>

			<section>
				<div class="section-label">Data</div>
				<button class="action-btn" onclick={exportData}>
					<Download size={16} strokeWidth={2} />
					<span>Export Data</span>
				</button>
			</section>

			<div class="divider"></div>

			<section>
				<div class="section-label">Account</div>
				<button class="action-btn danger" onclick={logout}>
					<Lock size={16} strokeWidth={2} />
					<span>Lock / Logout</span>
				</button>
			</section>
		</div>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 500;
	}
	.modal {
		background: var(--color-bg);
		border-radius: var(--radius-xl);
		width: 320px;
		box-shadow: var(--shadow-xl);
		overflow: hidden;
	}
	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px 12px;
		border-bottom: 1px solid var(--color-border);
	}
	.modal-header h2 {
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}
	.close-btn {
		background: none;
		border: none;
		font-size: 1.4rem;
		color: var(--color-text-faintest);
		cursor: pointer;
		line-height: 1;
		padding: 0 2px;
	}
	.close-btn:hover { color: var(--color-text-secondary); }

	.modal-body {
		padding: 16px 20px 20px;
	}
	section {
		margin-bottom: 4px;
	}
	.section-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		color: var(--color-text-faint);
		font-weight: 600;
		letter-spacing: 0.05em;
		margin-bottom: 10px;
	}
	.subsection-label {
		font-size: 0.75rem;
		color: #bbb;
		margin-bottom: 6px;
		margin-top: 2px;
	}
	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 10px;
	}
	.swatch {
		width: 30px;
		height: 30px;
		border-radius: var(--radius-md);
		border: 2px solid transparent;
		cursor: pointer;
		transition: border-color var(--transition-base), transform var(--transition-fast);
	}
	.swatch:hover { transform: scale(1.1); }
	.swatch.active { border-color: var(--color-text); }

	.divider {
		height: 1px;
		background: var(--color-border);
		margin: 12px 0;
	}

	.action-btn {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		width: 100%;
		background: none;
		border: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		font-size: 0.9rem;
		border-radius: var(--radius-md);
		text-align: left;
	}
	.action-btn:hover { background: var(--color-bg-hover); color: var(--color-text); }
	.action-btn.danger { color: var(--color-danger-dark); }
	.action-btn.danger:hover { background: #fdf0ee; color: var(--color-danger-dark); }
</style>
