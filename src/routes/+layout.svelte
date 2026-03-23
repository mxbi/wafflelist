<script lang="ts">
	import Sidebar from '$lib/components/Sidebar.svelte';
	import DetailSidebar from '$lib/components/DetailSidebar.svelte';
	import Login from '$lib/components/Login.svelte';
	import { loadLists, loadTodos, loadTodosFromCache, loadListsFromCache, setupSync, mobileView, selectedTodoId } from '$lib/stores/todos';
	import { authState, tryRestore } from '$lib/stores/auth';
	import { background } from '$lib/stores/settings';
	import { browser } from '$app/environment';
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

	// Update theme-color meta tag based on current mobile view
	const themeColorMap: Record<string, string> = {
		sidebar: '#ffffff',
		detail: '#fafbfc'
	};

	$effect(() => {
		if (!browser) return;
		const meta = document.querySelector('meta[name="theme-color"]');
		if (!meta) return;
		const view = $mobileView;
		if (view === 'list') {
			// Extract first color from background (solid or gradient)
			const bg = $background;
			const match = bg.match(/#[0-9a-fA-F]{6}/);
			meta.setAttribute('content', match ? match[0] : '#2B579A');
		} else {
			meta.setAttribute('content', themeColorMap[view] ?? '#2B579A');
		}
	});

	// Swipe gesture handling for mobile navigation
	let touchStartX = 0;
	let touchStartY = 0;

	function handleTouchStart(e: TouchEvent) {
		touchStartX = e.touches[0].clientX;
		touchStartY = e.touches[0].clientY;
	}

	function handleTouchEnd(e: TouchEvent) {
		const dx = e.changedTouches[0].clientX - touchStartX;
		const dy = e.changedTouches[0].clientY - touchStartY;
		const absDx = Math.abs(dx);
		const absDy = Math.abs(dy);

		// Require horizontal swipe: min 60px, more horizontal than vertical
		if (absDx < 60 || absDy > absDx * 0.75) return;

		const view = $mobileView;
		if (dx > 0) {
			// Swipe right → go back
			if (view === 'detail') mobileView.set('list');
			else if (view === 'list') mobileView.set('sidebar');
		} else {
			// Swipe left → go forward (only detail if a todo is selected)
			if (view === 'sidebar') mobileView.set('list');
			else if (view === 'list' && $selectedTodoId) mobileView.set('detail');
		}
	}

	onMount(async () => {
		await tryRestore();
		ready = true;
	});

	$effect(() => {
		if ($authState.status === 'unlocked') {
			// Load from cache first for instant display
			loadTodosFromCache();
			loadListsFromCache();
			// Then fetch from server in parallel
			loadLists().catch(() => {});
			loadTodos().catch(() => {});
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
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="app-layout" data-mobile-view={$mobileView} ontouchstart={handleTouchStart} ontouchend={handleTouchEnd}>
		<Sidebar />
		<main style={bgStyle}>
			{@render children()}
		</main>
		<DetailSidebar />
	</div>
{/if}

<style>
	:global(:root) {
		/* Brand */
		--color-primary: #2B579A;
		--color-primary-light: #e8f0fe;

		/* Danger */
		--color-danger: #e74c3c;
		--color-danger-dark: #c0392b;
		--color-danger-bg: #fde8e8;

		/* Text */
		--color-text: #333;
		--color-text-secondary: #555;
		--color-text-muted: #888;
		--color-text-faint: #999;
		--color-text-faintest: #aaa;
		--color-text-muted-border: #ccc;

		/* Backgrounds */
		--color-bg: #fff;
		--color-bg-hover: #f0f0f0;

		/* Borders */
		--color-border: #e8e8e8;
		--color-border-subtle: #e0e0e0;
		--color-border-light: #ddd;

		/* Shadows */
		--shadow-sm: 0 1px 4px rgba(0,0,0,0.08);
		--shadow-md: 0 4px 12px rgba(0,0,0,0.1);
		--shadow-lg: 0 8px 32px rgba(0,0,0,0.2);
		--shadow-xl: 0 16px 48px rgba(0,0,0,0.2);

		/* Border radius */
		--radius-sm: 4px;
		--radius-md: 6px;
		--radius-lg: 8px;
		--radius-xl: 12px;

		/* Transitions */
		--transition-fast: 0.1s;
		--transition-base: 0.15s;
		--transition-slow: 0.2s;
	}
	:global(*) {
		margin: 0;
		padding: 0;
		box-sizing: border-box;
	}
	:global(body) {
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
		-webkit-font-smoothing: antialiased;
		touch-action: manipulation;
	}
	.app-layout {
		display: flex;
		height: 100dvh;
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
