<script lang="ts">
	import { onMount } from 'svelte';
	import { RefreshCw } from 'lucide-svelte';

	let showUpdate = $state(false);

	onMount(() => {
		if (!('serviceWorker' in navigator)) return;

		navigator.serviceWorker.addEventListener('message', (e) => {
			if (e.data?.type === 'SW_UPDATED') {
				showUpdate = true;
			}
		});

		navigator.serviceWorker.getRegistration().then((reg) => {
			if (!reg) return;

			if (reg.waiting) {
				showUpdate = true;
				return;
			}

			reg.addEventListener('updatefound', () => {
				const newSW = reg.installing;
				if (!newSW) return;
				newSW.addEventListener('statechange', () => {
					if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
						showUpdate = true;
					}
				});
			});
		});
	});

	function reload() {
		window.location.reload();
	}
</script>

{#if showUpdate}
	<div class="update-banner">
		<span>Update available</span>
		<button onclick={reload}>
			<RefreshCw size={12} strokeWidth={2} />
			Reload
		</button>
	</div>
{/if}

<style>
	.update-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
		background: var(--color-primary-light);
		border-radius: var(--radius-md);
		margin: 8px;
		font-size: 0.8rem;
		color: var(--color-primary);
	}
	button {
		display: flex;
		align-items: center;
		gap: 4px;
		background: var(--color-primary);
		color: white;
		border: none;
		padding: 4px 10px;
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-size: 0.75rem;
	}
	button:hover {
		opacity: 0.9;
	}
</style>
