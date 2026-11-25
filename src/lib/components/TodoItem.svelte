<script lang="ts">
	import { updateTodo, deleteTodo, selectedTodoId, mobileView, lists } from '$lib/stores/todos';
	import { listColor, DRAG_TODO } from '$lib/listColors';
	import { formatRelativeDate } from '$lib/dates';
	import { StickyNote } from 'lucide-svelte';
	import type { Todo } from '$lib/types';

	interface Props {
		todo: Todo;
		ondragstart?: (e: DragEvent) => void;
		ondragover?: (e: DragEvent) => void;
		ondragleave?: () => void;
		ondrop?: (e: DragEvent) => void;
		ondragend?: () => void;
		dragOverPosition?: 'above' | 'below' | null;
		showListBadge?: boolean;
	}
	let { todo, ondragstart, ondragover, ondragleave, ondrop, ondragend, dragOverPosition = null, showListBadge = false }: Props = $props();

	const badgeList = $derived(showListBadge && todo.list_id ? $lists.find((l) => l.id === todo.list_id) : undefined);
	const badgeColor = $derived(badgeList ? listColor(badgeList.id) : null);

	function handleDragStart(e: DragEvent) {
		if (e.dataTransfer) {
			// Lets the todo be dropped onto a list in the sidebar
			e.dataTransfer.setData(DRAG_TODO, todo.id);
			e.dataTransfer.setData('text/plain', todo.title);
			e.dataTransfer.effectAllowed = 'move';
		}
		ondragstart?.(e);
	}

	let editing = $state(false);
	let editTitle = $state('');
	let showContextMenu = $state(false);
	let snoozeDate = $state('');

	const isSelected = $derived($selectedTodoId === todo.id);

	function toggleComplete() {
		updateTodo(todo.id, {
			completed_at: todo.completed_at ? null : new Date().toISOString()
		});
	}

	function startEdit() {
		editTitle = todo.title;
		editing = true;
	}

	function saveEdit() {
		const t = editTitle.trim();
		if (t && t !== todo.title) {
			updateTodo(todo.id, { title: t });
		}
		editing = false;
	}

	function editKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') saveEdit();
		if (e.key === 'Escape') editing = false;
	}

	function selectTodo() {
		if (isSelected) {
			selectedTodoId.set(null);
			mobileView.set('list');
		} else {
			selectedTodoId.set(todo.id);
			mobileView.set('detail');
		}
	}

	function handleContextMenu(e: MouseEvent) {
		e.preventDefault();
		showContextMenu = !showContextMenu;
		snoozeDate = '';
	}

	function handleSnooze() {
		if (snoozeDate) {
			updateTodo(todo.id, { snoozed_until: snoozeDate });
			showContextMenu = false;
		}
	}

	function isOverdue(d: string | null): boolean {
		if (!d) return false;
		return d < new Date().toISOString().split('T')[0];
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="todo-item"
	class:completed={!!todo.completed_at}
	class:selected={isSelected}
	class:drag-over-above={dragOverPosition === 'above'}
	class:drag-over-below={dragOverPosition === 'below'}
	onclick={selectTodo}
	oncontextmenu={handleContextMenu}
	draggable={editing ? undefined : 'true'}
	ondragstart={handleDragStart}
	{ondragover}
	{ondragleave}
	{ondrop}
	{ondragend}
>
	<button class="checkbox" onclick={(e) => { e.stopPropagation(); toggleComplete(); }} aria-label={todo.completed_at ? 'Mark incomplete' : 'Mark complete'}>
		{#if todo.completed_at}
			<svg width="18" height="18" viewBox="0 0 18 18"><rect x="1" y="1" width="16" height="16" rx="4" fill="#2B579A" stroke="#2B579A" stroke-width="1.5"/><path d="M5 9l3 3 5-5" stroke="white" stroke-width="2" fill="none"/></svg>
		{:else}
			<svg width="18" height="18" viewBox="0 0 18 18"><rect x="1" y="1" width="16" height="16" rx="4" fill="none" stroke="#ccc" stroke-width="1.5"/></svg>
		{/if}
	</button>

	<div class="todo-content">
		{#if editing}
			<!-- svelte-ignore a11y_autofocus -->
			<input
				class="edit-input"
				bind:value={editTitle}
				onblur={saveEdit}
				onkeydown={editKeydown}
				autofocus
			/>
		{:else}
			{#if badgeList && badgeColor}
				<span class="list-badge" style:background={badgeColor.bg} style:color={badgeColor.fg} title="List: {badgeList.name}">{badgeList.name}</span>
			{/if}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<span class="title" ondblclick={startEdit}>{todo.title}</span>
		{/if}
		{#if todo.notes}
			<span class="has-notes" title="Has notes"><StickyNote size={14} strokeWidth={2} /></span>
		{/if}
	</div>

	{#if todo.due_date && !todo.completed_at}
		<span class="due-date" class:overdue={isOverdue(todo.due_date)}>
			{formatRelativeDate(todo.due_date!)}
		</span>
	{/if}

	<button class="delete-btn" onclick={(e) => { e.stopPropagation(); deleteTodo(todo.id); }} title="Delete">&times;</button>

	{#if showContextMenu}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="context-menu" onclick={(e) => e.stopPropagation()}>
			<div class="menu-item">
				<label>Snooze until:</label>
				<input type="date" bind:value={snoozeDate} />
				<button onclick={handleSnooze} disabled={!snoozeDate}>Snooze</button>
			</div>
			<button class="menu-item" onclick={() => { showContextMenu = false; selectTodo(); }}>
				Edit details
			</button>
		</div>
	{/if}
</div>


<style>
	.todo-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 16px;
		position: relative;
		transition: background var(--transition-fast);
		background: var(--color-bg);
		cursor: pointer;
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
		margin-bottom: 3px;
	}
	.todo-item:hover { background: #f8f9fa; }
	.todo-item.selected { background: var(--color-primary-light); }
	.todo-item.drag-over-above {
		border-top: 2px solid var(--color-primary);
		padding-top: 8px;
	}
	.todo-item.drag-over-below {
		border-bottom: 2px solid var(--color-primary);
		padding-bottom: 8px;
	}
	.todo-item.completed .title {
		text-decoration: line-through;
		color: var(--color-text-faint);
	}
	.todo-item[draggable="true"]:active {
		cursor: grabbing;
	}

	.checkbox {
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		display: flex;
		flex-shrink: 0;
	}

	.todo-content {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}
	.title {
		font-size: 0.95rem;
		color: var(--color-text);
	}
	.list-badge {
		flex-shrink: 0;
		max-width: 40%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.7rem;
		font-weight: 600;
		line-height: 1;
		padding: 3px 7px;
		border-radius: 10px;
	}
	.todo-item.completed .list-badge { opacity: 0.6; }
	.has-notes { color: var(--color-text-muted); display: flex; align-items: center; }

	.edit-input {
		flex: 1;
		border: 1px solid var(--color-primary);
		border-radius: var(--radius-sm);
		padding: 4px 8px;
		font-size: 0.95rem;
		outline: none;
	}

	.due-date {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		white-space: nowrap;
	}
	.due-date.overdue { color: var(--color-danger); }

	.delete-btn {
		background: none;
		border: none;
		color: transparent;
		cursor: pointer;
		font-size: 1.2rem;
		padding: 0 4px;
		flex-shrink: 0;
		width: 20px;
	}
	.todo-item:hover .delete-btn { color: var(--color-text-muted-border); }
	.delete-btn:hover { color: var(--color-danger) !important; }

	.context-menu {
		position: absolute;
		top: 100%;
		right: 16px;
		background: var(--color-bg);
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-lg);
		padding: 8px;
		box-shadow: var(--shadow-md);
		z-index: 100;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.menu-item {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.85rem;
		background: none;
		border: none;
		cursor: pointer;
		padding: 4px;
		border-radius: var(--radius-sm);
		text-align: left;
	}
	.menu-item:hover { background: var(--color-bg-hover); }
	.menu-item label { white-space: nowrap; }
	.menu-item input[type="date"] { font-size: 0.85rem; }
	.menu-item button {
		font-size: 0.8rem;
		padding: 2px 8px;
		background: var(--color-primary);
		color: white;
		border: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.menu-item button:disabled { opacity: 0.5; }

</style>
