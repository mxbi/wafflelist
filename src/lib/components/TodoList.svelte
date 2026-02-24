<script lang="ts">
	import { todos, searchQuery, mobileView, updateTodo } from '$lib/stores/todos';
	import TodoItem from './TodoItem.svelte';
	import AddTodo from './AddTodo.svelte';
	import BackgroundPicker from './BackgroundPicker.svelte';
	import type { Todo } from '$lib/types';

	interface Props {
		title: string;
		listId?: string | null;
		filteredTodos?: Todo[];
		onrename?: (name: string) => void;
		reorderable?: boolean;
	}
	let { title, listId = null, filteredTodos, onrename, reorderable = false }: Props = $props();

	let editing = $state(false);
	let editName = $state('');
	let dragOverId = $state<string | null>(null);
	let dragPosition = $state<'above' | 'below'>('below');
	let draggedId = $state<string | null>(null);
	let edgeDropZone = $state<'top' | 'bottom' | null>(null);

	function startEdit() {
		if (!onrename) return;
		editName = title;
		editing = true;
	}

	function saveEdit() {
		const name = editName.trim();
		if (name && name !== title) {
			onrename?.(name);
		}
		editing = false;
	}

	let showCompleted = $state(false);

	const baseTodos = $derived(filteredTodos ?? $todos);

	const activeTodos = $derived.by(() => {
		let items = baseTodos.filter((t) => !t.completed_at);
		const q = $searchQuery.toLowerCase().trim();
		if (q) items = items.filter((t) => t.title.toLowerCase().includes(q) || t.notes?.toLowerCase().includes(q));
		return items;
	});

	const completedTodos = $derived.by(() => {
		let items = $todos.filter((t) => {
			if (!t.completed_at) return false;
			if (listId) return t.list_id === listId;
			if (listId === null && filteredTodos) {
				if (title === 'Inbox') return !t.list_id;
			}
			return true;
		});
		const q = $searchQuery.toLowerCase().trim();
		if (q) items = items.filter((t) => t.title.toLowerCase().includes(q) || t.notes?.toLowerCase().includes(q));
		return items.sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime());
	});

	function handleDragStart(e: DragEvent, todoId: string) {
		if (!reorderable) return;
		draggedId = todoId;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', todoId);
		}
	}

	function handleDragOver(e: DragEvent, todoId: string) {
		if (!reorderable || !draggedId || draggedId === todoId) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dragOverId = todoId;

		// Detect top half vs bottom half
		const target = (e.currentTarget as HTMLElement);
		const rect = target.getBoundingClientRect();
		const midY = rect.top + rect.height / 2;
		dragPosition = e.clientY < midY ? 'above' : 'below';
	}

	function handleDragLeave() {
		dragOverId = null;
	}

	function handleDrop(e: DragEvent, targetId: string) {
		e.preventDefault();
		const dropAbove = dragPosition === 'above';
		dragOverId = null;
		if (!reorderable || !draggedId || draggedId === targetId) return;

		const items = activeTodos;
		const targetIdx = items.findIndex(t => t.id === targetId);
		const dragIdx = items.findIndex(t => t.id === draggedId);
		if (targetIdx === -1 || dragIdx === -1) return;

		let newOrder: number;
		if (dropAbove) {
			// Insert before target
			const prev = targetIdx > 0 ? items[targetIdx - 1].sort_order : items[targetIdx].sort_order - 2;
			newOrder = (prev + items[targetIdx].sort_order) / 2;
		} else {
			// Insert after target
			const next = targetIdx < items.length - 1 ? items[targetIdx + 1].sort_order : items[targetIdx].sort_order + 2;
			newOrder = (items[targetIdx].sort_order + next) / 2;
		}

		const movedId = draggedId;
		draggedId = null;
		updateTodo(movedId, { sort_order: newOrder });
	}

	function handleEdgeDragOver(e: DragEvent, zone: 'top' | 'bottom') {
		if (!reorderable || !draggedId) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dragOverId = null;
		edgeDropZone = zone;
	}

	function handleEdgeDrop(e: DragEvent, zone: 'top' | 'bottom') {
		e.preventDefault();
		edgeDropZone = null;
		if (!reorderable || !draggedId) return;

		const items = activeTodos;
		if (items.length === 0) return;

		let newOrder: number;
		if (zone === 'top') {
			newOrder = items[0].sort_order - 1;
		} else {
			newOrder = items[items.length - 1].sort_order + 1;
		}

		const movedId = draggedId;
		draggedId = null;
		updateTodo(movedId, { sort_order: newOrder });
	}

	function handleEdgeDragLeave() {
		edgeDropZone = null;
	}

	function handleDragEnd() {
		draggedId = null;
		dragOverId = null;
		edgeDropZone = null;
	}
</script>

<div class="todo-list">
	<div class="list-header">
		<button class="mobile-back" onclick={() => mobileView.set('sidebar')}>&larr;</button>
		{#if editing}
			<!-- svelte-ignore a11y_autofocus -->
			<input
				class="title-edit"
				bind:value={editName}
				onblur={saveEdit}
				onkeydown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') editing = false; }}
				autofocus
			/>
		{:else}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<h1 ondblclick={startEdit} class:editable={!!onrename}>{title}</h1>
		{/if}
		<BackgroundPicker />
	</div>

	<div class="list-content">
		<AddTodo {listId} />

		<div class="items-wrapper">
			{#if reorderable && draggedId && activeTodos.length > 0}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="edge-drop-zone edge-top"
					class:active={edgeDropZone === 'top'}
					ondragover={(e) => handleEdgeDragOver(e, 'top')}
					ondragleave={handleEdgeDragLeave}
					ondrop={(e) => handleEdgeDrop(e, 'top')}
				></div>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="edge-drop-zone edge-bottom"
					class:active={edgeDropZone === 'bottom'}
					ondragover={(e) => handleEdgeDragOver(e, 'bottom')}
					ondragleave={handleEdgeDragLeave}
					ondrop={(e) => handleEdgeDrop(e, 'bottom')}
				></div>
			{/if}
			<div class="items">
				{#each activeTodos as todo (todo.id)}
					<TodoItem
						{todo}
						draggable={reorderable}
						ondragstart={(e) => handleDragStart(e, todo.id)}
						ondragover={(e) => handleDragOver(e, todo.id)}
						ondragleave={handleDragLeave}
						ondrop={(e) => handleDrop(e, todo.id)}
						ondragend={handleDragEnd}
						dragOverPosition={dragOverId === todo.id ? dragPosition : null}
					/>
				{/each}

				{#if activeTodos.length === 0}
					<div class="empty">No to-dos yet. Add one above!</div>
				{/if}
			</div>
		</div>

		{#if completedTodos.length > 0}
			<button class="completed-toggle" onclick={() => showCompleted = !showCompleted}>
				<span class="arrow" class:expanded={showCompleted}>&#9654;</span>
				Completed ({completedTodos.length})
			</button>

			{#if showCompleted}
				<div class="items completed-items">
					{#each completedTodos as todo (todo.id)}
						<TodoItem {todo} />
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	.todo-list {
		flex: 1;
		display: flex;
		flex-direction: column;
		height: 100vh;
		overflow-y: auto;
	}
	.list-header {
		padding: 24px 24px 12px;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.mobile-back {
		display: none;
		background: none;
		border: none;
		color: white;
		font-size: 1.4rem;
		cursor: pointer;
		padding: 0 4px;
		text-shadow: 0 1px 3px rgba(0,0,0,0.2);
	}
	@media (max-width: 768px) {
		.mobile-back { display: block; }
	}
	h1 {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 600;
		color: white;
		text-shadow: 0 1px 3px rgba(0,0,0,0.2);
	}
	h1.editable {
		cursor: text;
	}
	.title-edit {
		font-size: 1.5rem;
		font-weight: 600;
		color: white;
		text-shadow: 0 1px 3px rgba(0,0,0,0.2);
		background: rgba(255,255,255,0.2);
		border: 1px solid rgba(255,255,255,0.5);
		border-radius: 4px;
		padding: 2px 6px;
		margin: -3px -7px;
		outline: none;
		font-family: inherit;
	}
	.list-content {
		flex: 1;
		padding: 0 24px 24px;
	}
	.empty {
		padding: 40px 16px;
		text-align: center;
		color: rgba(255,255,255,0.7);
		font-size: 0.95rem;
	}
	.completed-toggle {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 0;
		background: none;
		border: none;
		cursor: pointer;
		font-size: 0.9rem;
		color: rgba(255,255,255,0.85);
		width: 100%;
		text-align: left;
	}
	.completed-toggle:hover { color: white; }
	.arrow {
		display: inline-block;
		font-size: 0.7rem;
		transition: transform 0.2s;
	}
	.arrow.expanded { transform: rotate(90deg); }
	.items-wrapper {
		position: relative;
	}
	.edge-drop-zone {
		position: absolute;
		left: 0;
		right: 0;
		height: 24px;
		border-radius: 8px;
		z-index: 1;
		transition: background 0.1s;
	}
	.edge-top {
		top: -24px;
	}
	.edge-bottom {
		bottom: -24px;
	}
	.edge-drop-zone.active {
		background: rgba(43, 87, 154, 0.15);
		border: 2px dashed #2B579A;
	}
	.completed-items {
		opacity: 0.7;
	}
</style>
