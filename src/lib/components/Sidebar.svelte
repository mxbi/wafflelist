<script lang="ts">
	import { lists, createList, deleteList, searchQuery, counts, mobileView, selectedTodoId, moveList, moveTodoToList } from '$lib/stores/todos';
	import { DRAG_TODO, DRAG_LIST } from '$lib/listColors';
	import { page } from '$app/stores';
	import { Inbox, Star, Calendar, List as ListIcon, AlarmClockOff, Settings, Plus } from 'lucide-svelte';
	import SettingsModal from './SettingsModal.svelte';
	import SyncIndicator from './SyncIndicator.svelte';
	import UpdatePrompt from './UpdatePrompt.svelte';
	import { autofocus } from '$lib/actions';

	let showSettings = $state(false);

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
		{ path: '/inbox', label: 'Inbox', icon: Inbox },
		{ path: '/today', label: 'Today', icon: Star },
		{ path: '/week', label: 'Week', icon: Calendar },
		{ path: '/all', label: 'All', icon: ListIcon },
		{ path: '/snoozed', label: 'Snoozed', icon: AlarmClockOff }
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

	// --- Drag and drop: todos onto lists, and reordering lists ---
	// dropTarget is a list id, or 'inbox' for the Inbox smart view
	let dropTarget = $state<string | null>(null);
	let listDropPosition = $state<'above' | 'below' | null>(null);
	let draggedListId = $state<string | null>(null);

	function hasType(e: DragEvent, type: string): boolean {
		return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes(type);
	}

	function handleListDragStart(e: DragEvent, id: string) {
		draggedListId = id;
		if (e.dataTransfer) {
			e.dataTransfer.setData(DRAG_LIST, id);
			e.dataTransfer.effectAllowed = 'move';
		}
	}

	function handleListDragEnd() {
		draggedListId = null;
		dropTarget = null;
		listDropPosition = null;
	}

	function handleNavDragOver(e: DragEvent, target: string) {
		if (hasType(e, DRAG_TODO)) {
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
			dropTarget = target;
			listDropPosition = null;
		} else if (hasType(e, DRAG_LIST) && target !== 'inbox' && draggedListId && draggedListId !== target) {
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
			const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
			dropTarget = target;
			listDropPosition = e.clientY < rect.top + rect.height / 2 ? 'above' : 'below';
		}
	}

	function handleNavDragLeave(e: DragEvent, target: string) {
		// Ignore leave events fired when moving between child elements
		const related = e.relatedTarget as Node | null;
		if (related && (e.currentTarget as HTMLElement).contains(related)) return;
		if (dropTarget === target) {
			dropTarget = null;
			listDropPosition = null;
		}
	}

	function handleNavDrop(e: DragEvent, target: string) {
		e.preventDefault();
		const position = listDropPosition;
		dropTarget = null;
		listDropPosition = null;
		const todoId = e.dataTransfer?.getData(DRAG_TODO);
		if (todoId) {
			moveTodoToList(todoId, target === 'inbox' ? null : target);
			return;
		}
		const listId = e.dataTransfer?.getData(DRAG_LIST) || draggedListId;
		if (listId && target !== 'inbox' && position) {
			moveList(listId, target, position);
		}
		draggedListId = null;
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
			<a
				href={view.path}
				class="nav-item"
				class:active={isActive(view.path)}
				class:drop-target={view.path === '/inbox' && dropTarget === 'inbox'}
				onclick={() => { selectedTodoId.set(null); mobileView.set('list'); }}
				draggable="false"
				ondragover={view.path === '/inbox' ? (e) => handleNavDragOver(e, 'inbox') : undefined}
				ondragleave={view.path === '/inbox' ? (e) => handleNavDragLeave(e, 'inbox') : undefined}
				ondrop={view.path === '/inbox' ? (e) => handleNavDrop(e, 'inbox') : undefined}
			>
				<span class="nav-icon"><view.icon size={16} strokeWidth={2} /></span>
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
			<a
				href="/list/{list.id}"
				class="nav-item"
				class:active={isActive(`/list/${list.id}`)}
				class:drop-target={dropTarget === list.id && !listDropPosition}
				class:drop-above={dropTarget === list.id && listDropPosition === 'above'}
				class:drop-below={dropTarget === list.id && listDropPosition === 'below'}
				class:dragging={draggedListId === list.id}
				onclick={() => { selectedTodoId.set(null); mobileView.set('list'); }}
				draggable="true"
				ondragstart={(e) => handleListDragStart(e, list.id)}
				ondragend={handleListDragEnd}
				ondragover={(e) => handleNavDragOver(e, list.id)}
				ondragleave={(e) => handleNavDragLeave(e, list.id)}
				ondrop={(e) => handleNavDrop(e, list.id)}
			>
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
				use:autofocus
			/>
		</div>
	{:else}
		<button class="add-list-btn" onclick={() => showNewListInput = true}>
			<span class="nav-icon"><Plus size={16} strokeWidth={2} /></span>
			<span>New List</span>
		</button>
	{/if}

	<UpdatePrompt />
	<div class="sidebar-footer">
		<SyncIndicator />
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
		height: 100dvh;
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
	.nav-item.drop-target {
		background: var(--color-primary-light);
		color: var(--color-primary);
		box-shadow: inset 0 0 0 2px var(--color-primary);
	}
	.nav-item.drop-above { box-shadow: inset 0 2px 0 var(--color-primary); }
	.nav-item.drop-below { box-shadow: inset 0 -2px 0 var(--color-primary); }
	.nav-item.dragging { opacity: 0.4; }
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
		padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));
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
