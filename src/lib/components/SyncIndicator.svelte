<script lang="ts">
	import { syncStatus } from '$lib/stores/todos';
	import { Cloud, CloudOff } from 'lucide-svelte';

	const status = $derived($syncStatus);

	const label = $derived.by(() => {
		let text = '';
		if (status.isOnline) {
			text = status.pendingCount > 0 ? 'Syncing' : 'Online';
		} else {
			if (status.lastSyncedAt) {
				const ago = Date.now() - status.lastSyncedAt;
				if (ago < 60000) text = 'Synced just now';
				else if (ago < 3600000) text = `Synced ${Math.floor(ago / 60000)}m ago`;
				else text = `Synced ${Math.floor(ago / 3600000)}h ago`;
			} else {
				text = 'Offline';
			}
			if (status.pendingCount > 0) {
				text += `, ${status.pendingCount} pending`;
			}
		}
		return text;
	});
</script>

<div class="sync-indicator" class:offline={!status.isOnline} class:pending={status.pendingCount > 0}>
	<span class="sync-icon">
		{#if status.isOnline}
			<Cloud size={16} strokeWidth={2} />
		{:else}
			<CloudOff size={16} strokeWidth={2} />
		{/if}
	</span>
	<span>{label}</span>
</div>

<style>
	.sync-indicator {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 0.75rem;
		color: var(--color-text-faintest);
		padding: 4px 16px;
	}
	.sync-indicator.offline {
		color: var(--color-text-muted);
	}
	.sync-indicator.pending {
		color: var(--color-text-muted);
	}
	.sync-icon {
		width: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
</style>
