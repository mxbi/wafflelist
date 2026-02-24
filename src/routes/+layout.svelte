<script lang="ts">
	import Sidebar from '$lib/components/Sidebar.svelte';
	import DetailSidebar from '$lib/components/DetailSidebar.svelte';
	import Login from '$lib/components/Login.svelte';
	import { loadLists, loadTodos, setupSync, mobileView } from '$lib/stores/todos';
	import { authState, tryRestore } from '$lib/stores/auth';
	import { background } from '$lib/stores/settings';
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
	}
	let { children }: Props = $props();

	const bgStyle = $derived(
		$background.startsWith('linear-gradient')
			? `background: ${$background}; background-size: cover;`
			: `background: ${$background};`
	);

	let ready = $state(false);

	onMount(async () => {
		await tryRestore();
		ready = true;
	});

	$effect(() => {
		if ($authState.status === 'unlocked') {
			loadLists();
			loadTodos();
			const cleanup = setupSync();
			return cleanup;
		}
	});
</script>

{#if !ready}
	<!-- loading -->
{:else if $authState.status === 'locked'}
	<Login />
{:else}
	<div class="app-layout" data-mobile-view={$mobileView}>
		<Sidebar />
		<main style={bgStyle}>
			{@render children()}
		</main>
		<DetailSidebar />
	</div>
{/if}

<style>
	:global(*) {
		margin: 0;
		padding: 0;
		box-sizing: border-box;
	}
	:global(body) {
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
		-webkit-font-smoothing: antialiased;
	}
	.app-layout {
		display: flex;
		height: 100vh;
		overflow: hidden;
	}
	main {
		flex: 1;
		overflow: hidden;
		transition: background 0.3s;
	}

	@media (max-width: 768px) {
		.app-layout > :global(.sidebar),
		.app-layout > main,
		.app-layout > :global(.detail-sidebar) {
			display: none;
		}

		.app-layout[data-mobile-view='sidebar'] > :global(.sidebar) {
			display: flex;
			width: 100%;
			min-width: 100%;
		}

		.app-layout[data-mobile-view='list'] > main {
			display: block;
			width: 100%;
		}

		.app-layout[data-mobile-view='detail'] > :global(.detail-sidebar) {
			display: flex;
			width: 100%;
			min-width: 100%;
		}
	}
</style>
