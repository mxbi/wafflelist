<script lang="ts">
	import { lists, todos, createList, deleteList, searchQuery, counts, mobileView, selectedTodoId } from '$lib/stores/todos';
	import { logout } from '$lib/stores/auth';
	import { page } from '$app/stores';
	import type { List } from '$lib/types';

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
		{ path: '/inbox', label: 'Inbox', icon: '📥' },
		{ path: '/today', label: 'Today', icon: '⭐' },
		{ path: '/week', label: 'Week', icon: '📅' },
		{ path: '/all', label: 'All', icon: '📋' },
		{ path: '/snoozed', label: 'Snoozed', icon: '😴' }
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
		<span class="logo">🧇 WaffleList</span>
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
				<span class="nav-icon">{view.icon}</span>
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
				<span class="nav-icon">{list.icon || '📋'}</span>
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
			<span class="nav-icon">+</span>
			<span>New List</span>
		</button>
	{/if}

	<div class="sidebar-footer">
		<button class="logout-btn" onclick={() => {
			const data = { lists: $lists, todos: $todos, exported_at: new Date().toISOString() };
			const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
			const a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			a.download = `wafflelist-export-${new Date().toISOString().slice(0, 10)}.json`;
			a.click();
			URL.revokeObjectURL(a.href);
		}}>
			<span class="nav-icon">📤</span>
			<span>Export Data</span>
		</button>
		<button class="logout-btn" onclick={logout}>
			<span class="nav-icon">🔒</span>
			<span>Lock / Logout</span>
		</button>
	</div>
</aside>

<style>
	.sidebar {
		width: 260px;
		min-width: 260px;
		background: #fff;
		color: #333;
		border-right: 1px solid #e8e8e8;
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
	.search-box {
		padding: 8px 12px;
	}
	.search-box input {
		width: 100%;
		padding: 8px 12px;
		border: none;
		border-radius: 6px;
		background: #f0f0f0;
		color: #333;
		font-size: 0.9rem;
		outline: none;
		box-sizing: border-box;
	}
	.search-box input::placeholder { color: #999; }
	.search-box input:focus { background: #e8e8e8; }

	.nav-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 16px;
		color: #555;
		text-decoration: none;
		font-size: 0.95rem;
		border-radius: 4px;
		margin: 1px 8px;
		position: relative;
	}
	.nav-item:hover { background: #f0f0f0; color: #333; }
	.nav-item.active { background: #e8f0fe; color: #2B579A; font-weight: 600; }
	.nav-icon { width: 20px; text-align: center; flex-shrink: 0; }
	.nav-label { flex: 1; }
	.count {
		margin-left: auto;
		font-size: 0.75rem;
		color: #aaa;
		min-width: 16px;
		text-align: right;
	}

	.divider { height: 1px; background: #e8e8e8; margin: 12px 16px; }

	.lists-header {
		padding: 4px 16px;
		font-size: 0.75rem;
		text-transform: uppercase;
		color: #999;
		letter-spacing: 0.05em;
	}
	.lists { flex: 1; }

	.delete-list {
		display: none;
		position: absolute;
		right: 8px;
		background: none;
		border: none;
		color: #ccc;
		cursor: pointer;
		font-size: 1.1rem;
		padding: 0 4px;
	}
	.nav-item:hover .delete-list { display: block; }
	.delete-list:hover { color: #e74c3c; }
	.list-name { flex: 1; }

	.add-list-btn {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 16px;
		margin: 4px 8px 16px;
		background: none;
		border: none;
		color: #999;
		cursor: pointer;
		font-size: 0.95rem;
		border-radius: 4px;
	}
	.add-list-btn:hover { background: #f0f0f0; color: #333; }

	.new-list-input {
		padding: 4px 12px 16px;
	}
	.new-list-input input {
		width: 100%;
		padding: 8px 12px;
		border: none;
		border-radius: 6px;
		background: #f0f0f0;
		color: #333;
		font-size: 0.9rem;
		outline: none;
		box-sizing: border-box;
	}
	.new-list-input input::placeholder { color: #999; }

	.sidebar-footer {
		margin-top: auto;
		border-top: 1px solid #e8e8e8;
		padding: 8px;
	}
	.logout-btn {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 16px;
		width: 100%;
		background: none;
		border: none;
		color: #999;
		cursor: pointer;
		font-size: 0.9rem;
		border-radius: 4px;
	}
	.logout-btn:hover { background: #f0f0f0; color: #333; }
</style>
