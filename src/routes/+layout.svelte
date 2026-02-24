<script lang="ts">
	import Sidebar from '$lib/components/Sidebar.svelte';
	import DetailSidebar from '$lib/components/DetailSidebar.svelte';
	import { loadLists, loadCounts, setupSync } from '$lib/stores/todos';
	import { background } from '$lib/stores/settings';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
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

	onMount(() => {
		loadLists();
		loadCounts();
		const cleanup = setupSync();
		return cleanup;
	});
</script>

<div class="app-layout">
	<Sidebar />
	<main style={bgStyle}>
		{@render children()}
	</main>
	<DetailSidebar />
</div>

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
</style>
