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

		// Login page — match the primary background
		if ($authState.status !== 'unlocked') {
			meta.setAttribute('content', '#2B579A');
			return;
		}

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
	let swiping = $state(false);
	let swipeOffset = $state(0);
	let swipeDirection: 'left' | 'right' | null = null;

	function handleTouchStart(e: TouchEvent) {
		touchStartX = e.touches[0].clientX;
		touchStartY = e.touches[0].clientY;
		swiping = false;
		swipeOffset = 0;
		swipeDirection = null;
	}

	function handleTouchMove(e: TouchEvent) {
		const dx = e.touches[0].clientX - touchStartX;
		const dy = e.touches[0].clientY - touchStartY;
		const absDx = Math.abs(dx);
		const absDy = Math.abs(dy);

		// Lock in swipe direction once threshold is met
		if (!swiping) {
			if (absDx < 10) return;
			// If more vertical than horizontal, don't swipe
			if (absDy > absDx * 0.75) return;
			swiping = true;
			swipeDirection = dx > 0 ? 'right' : 'left';
		}

		// Check if this swipe direction has a valid target
		const view = $mobileView;
		const canSwipe =
			(swipeDirection === 'right' && (view === 'detail' || view === 'list')) ||
			(swipeDirection === 'left' && ((view === 'sidebar') || (view === 'list' && $selectedTodoId)));

		if (!canSwipe) {
			swiping = false;
			return;
		}

		swipeOffset = dx;
	}

	function handleTouchEnd(e: TouchEvent) {
		if (!swiping) return;

		const dx = e.changedTouches[0].clientX - touchStartX;
		const threshold = window.innerWidth * 0.3;

		const view = $mobileView;
		if (Math.abs(dx) > threshold) {
			if (dx > 0) {
				if (view === 'detail') {
					selectedTodoId.set(null);
					mobileView.set('list');
				} else if (view === 'list') {
					mobileView.set('sidebar');
				}
			} else {
				if (view === 'sidebar') mobileView.set('list');
				else if (view === 'list' && $selectedTodoId) mobileView.set('detail');
			}
		}

		swiping = false;
		swipeOffset = 0;
		swipeDirection = null;
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
	<div
		class="app-layout"
		class:swiping
		data-mobile-view={$mobileView}
		style:--swipe-offset="{swipeOffset}px"
		ontouchstart={handleTouchStart}
		ontouchmove={handleTouchMove}
		ontouchend={handleTouchEnd}
	>
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
	:global(html, body) {
		height: 100%;
		overflow: hidden;
		overscroll-behavior: none;
	}
	:global(body) {
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
		-webkit-font-smoothing: antialiased;
		touch-action: manipulation;
		background: var(--color-primary);
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
		.app-layout {
			position: relative;
		}

		.app-layout > :global(.sidebar),
		.app-layout > main,
		.app-layout > :global(.detail-sidebar) {
			position: absolute;
			top: 0;
			left: 0;
			width: 100%;
			min-width: 100%;
			height: 100%;
			transition: transform 0.3s ease;
		}

		.app-layout.swiping > :global(.sidebar),
		.app-layout.swiping > main,
		.app-layout.swiping > :global(.detail-sidebar) {
			transition: none;
		}

		/* Sidebar: offscreen left when not active */
		.app-layout > :global(.sidebar) {
			display: flex;
			transform: translateX(-100%);
		}
		.app-layout[data-mobile-view='sidebar'] > :global(.sidebar) {
			transform: translateX(var(--swipe-offset, 0px));
		}
		/* Peek sidebar when swiping right from list */
		.app-layout[data-mobile-view='list'] > :global(.sidebar) {
			transform: translateX(calc(-100% + var(--swipe-offset, 0px)));
		}

		/* Main: default position */
		.app-layout > main {
			display: block;
			transform: translateX(0);
		}
		.app-layout[data-mobile-view='sidebar'] > main {
			transform: translateX(calc(100% + var(--swipe-offset, 0px)));
		}
		.app-layout[data-mobile-view='list'] > main {
			transform: translateX(var(--swipe-offset, 0px));
		}
		.app-layout[data-mobile-view='detail'] > main {
			transform: translateX(calc(-100% + var(--swipe-offset, 0px)));
		}

		/* Detail: offscreen right when not active */
		.app-layout > :global(.detail-sidebar) {
			display: flex;
			transform: translateX(100%);
		}
		.app-layout[data-mobile-view='detail'] > :global(.detail-sidebar) {
			transform: translateX(var(--swipe-offset, 0px));
		}
		/* Peek detail when swiping left from list */
		.app-layout[data-mobile-view='list'] > :global(.detail-sidebar) {
			transform: translateX(calc(100% + var(--swipe-offset, 0px)));
		}
	}
</style>
