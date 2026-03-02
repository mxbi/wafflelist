<script lang="ts">
	import { lists, todos, createList, deleteList, searchQuery, counts, mobileView, selectedTodoId } from '$lib/stores/todos';
	import { page } from '$app/stores';
	import { Inbox, Star, Calendar, List as ListIcon, AlarmClockOff, Settings, Plus } from 'lucide-svelte';
	import type { ComponentType } from 'svelte';
	import SettingsModal from './SettingsModal.svelte';

	let showSettings = $state(false);

	const iconMap: Record<string, ComponentType> = {
		Inbox, Star, Calendar, List: ListIcon, AlarmClockOff
	};

	const viewCountKey: Record<string, string> = {
		'/inbox': 'inbox',
		'/today': 'today',
		'/week': 'week',
		'/all': 'all',
		'/snoozed': 'snoozed'
	};

	function getViewCount(path: string): number {
		const key = viewCountKey[path];
		if (!key) return 0;
		return ($counts as Record<string, unknown>)[key] as number ?? 0;
	}

	let newListName = $state('');
	let editingListId = $state<string | null>(null);
	let editingName = $state('');
	let showNewListInput = $state(false);

	const smartViews = [
		{ path: '/inbox', label: 'Inbox', icon: 'Inbox' },
		{ path: '/today', label: 'Today', icon: 'Star' },
		{ path: '/week', label: 'Week', icon: 'Calendar' },
		{ path: '/all', label: 'All', icon: 'List' },
		{ path: '/snoozed', label: 'Snoozed', icon: 'AlarmClockOff' }
	];

	function isActive(path: string): boolean {
		return $page.url.pathname === path;
	}

	async function handleCreateList() {
		const name = newListName.trim();
		if (!name) return;
		await createList(name);
		newListName = '';
		showNewListInput = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') handleCreateList();
		if (e.key === 'Escape') { showNewListInput = false; newListName = ''; }
	}

	async function handleDeleteList(e: MouseEvent, id: string) {
		e.preventDefault();
		e.stopPropagation();
		if (confirm('Delete this list? Todos will be moved to Inbox.')) {
			await deleteList(id);
		}
	}
</script>

<aside class="sidebar">
	<div class="sidebar-header">
		<span class="logo">🧇 WaffleList <span class="alpha">ALPHA</span></span>
	</div>

	<div class="search-box">
		<input
			type="text"
			placeholder="Search..."
			bind:value={$searchQuery}
		/>
	</div>

	<nav class="smart-views">
		{#each smartViews as view}
			<a href={view.path} class="nav-item" class:active={isActive(view.path)} onclick={() => { selectedTodoId.set(null); mobileView.set('list'); }}>
				<span class="nav-icon"><svelte:component this={iconMap[view.icon]} size={16} strokeWidth={2} /></span>
				<span class="nav-label">{view.label}</span>
				{#if getViewCount(view.path) > 0}
					<span class="count">{getViewCount(view.path)}</span>
				{/if}
			</a>
		{/each}
	</nav>

	<div class="divider"></div>

	<div class="lists-header">
		<span>Lists</span>
	</div>

	<nav class="lists">
		{#each $lists as list (list.id)}
			<a href="/list/{list.id}" class="nav-item" class:active={isActive(`/list/${list.id}`)} onclick={() => { selectedTodoId.set(null); mobileView.set('list'); }}>
				<span class="nav-icon">{#if list.icon}{list.icon}{:else}<ListIcon size={16} strokeWidth={2} />{/if}</span>
				<span class="list-name">{list.name}</span>
				{#if ($counts.lists[list.id] ?? 0) > 0}
					<span class="count">{$counts.lists[list.id]}</span>
				{/if}
				<button class="delete-list" onclick={(e) => handleDeleteList(e, list.id)} title="Delete list">&times;</button>
			</a>
		{/each}
	</nav>

	{#if showNewListInput}
		<div class="new-list-input">
			<input
				type="text"
				placeholder="List name..."
				bind:value={newListName}
				onkeydown={handleKeydown}
				autofocus
			/>
		</div>
	{:else}
		<button class="add-list-btn" onclick={() => showNewListInput = true}>
			<span class="nav-icon"><Plus size={16} strokeWidth={2} /></span>
			<span>New List</span>
		</button>
	{/if}

	<div class="sidebar-footer">
		<button class="settings-btn" onclick={() => showSettings = true}>
			<span class="nav-icon"><Settings size={16} strokeWidth={2} /></span>
			<span>Settings</span>
		</button>
	</div>
</aside>

{#if showSettings}
	<SettingsModal onclose={() => showSettings = false} />
{/if}

<style>
	.sidebar {
		width: 260px;
		min-width: 260px;
		background: var(--color-bg);
		color: var(--color-text);
		border-right: 1px solid var(--color-border);
		display: flex;
		flex-direction: column;
		height: 100vh;
		overflow-y: auto;
	}
	.sidebar-header {
		padding: 20px 16px 8px;
	}
	.logo {
		font-size: 1.3rem;
		font-weight: 700;
	}
	.alpha {
		font-size: 0.55rem;
		color: var(--color-text-faintest);
		font-weight: 600;
		letter-spacing: 0.05em;
		vertical-align: super;
	}
	.search-box {
		padding: 8px 12px;
	}
	.search-box input {
		width: 100%;
		padding: 8px 12px;
		border: none;
		border-radius: var(--radius-md);
		background: var(--color-bg-hover);
		color: var(--color-text);
		font-size: 0.9rem;
		outline: none;
		box-sizing: border-box;
	}
	.search-box input::placeholder { color: var(--color-text-faint); }
	.search-box input:focus { background: var(--color-border); }

	.nav-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 16px;
		color: var(--color-text-secondary);
		text-decoration: none;
		font-size: 0.95rem;
		border-radius: var(--radius-sm);
		margin: 1px 8px;
		position: relative;
	}
	.nav-item:hover { background: var(--color-bg-hover); color: var(--color-text); }
	.nav-item.active { background: var(--color-primary-light); color: var(--color-primary); font-weight: 600; }
	.nav-icon { width: 20px; text-align: center; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
	.nav-label { flex: 1; }
	.count {
		margin-left: auto;
		font-size: 0.75rem;
		color: var(--color-text-faintest);
		min-width: 16px;
		text-align: right;
	}

	.divider { height: 1px; background: var(--color-border); margin: 12px 16px; }

	.lists-header {
		padding: 4px 16px;
		font-size: 0.75rem;
		text-transform: uppercase;
		color: var(--color-text-faint);
		letter-spacing: 0.05em;
	}
	.lists { flex: 1; }

	.delete-list {
		display: none;
		position: absolute;
		right: 8px;
		background: none;
		border: none;
		color: var(--color-text-muted-border);
		cursor: pointer;
		font-size: 1.1rem;
		padding: 0 4px;
	}
	.nav-item:hover .delete-list { display: block; }
	.delete-list:hover { color: var(--color-danger); }
	.list-name { flex: 1; }

	.add-list-btn {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 16px;
		margin: 4px 8px 16px;
		background: none;
		border: none;
		color: var(--color-text-faint);
		cursor: pointer;
		font-size: 0.95rem;
		border-radius: var(--radius-sm);
	}
	.add-list-btn:hover { background: var(--color-bg-hover); color: var(--color-text); }

	.new-list-input {
		padding: 4px 12px 16px;
	}
	.new-list-input input {
		width: 100%;
		padding: 8px 12px;
		border: none;
		border-radius: var(--radius-md);
		background: var(--color-bg-hover);
		color: var(--color-text);
		font-size: 0.9rem;
		outline: none;
		box-sizing: border-box;
	}
	.new-list-input input::placeholder { color: var(--color-text-faint); }

	.sidebar-footer {
		margin-top: auto;
		border-top: 1px solid var(--color-border);
		padding: 8px;
	}
	.settings-btn {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 16px;
		width: 100%;
		background: none;
		border: none;
		color: var(--color-text-faint);
		cursor: pointer;
		font-size: 0.9rem;
		border-radius: var(--radius-sm);
	}
	.settings-btn:hover { background: var(--color-bg-hover); color: var(--color-text); }
</style>
