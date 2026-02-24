<script lang="ts">
	import { updateTodo, deleteTodo, selectedTodoId } from '$lib/stores/todos';
	import { formatRelativeDate } from '$lib/dates';
	import type { Todo } from '$lib/types';

	interface Props {
		todo: Todo;
	}
	let { todo }: Props = $props();

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
		selectedTodoId.set(isSelected ? null : todo.id);
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
	oncontextmenu={handleContextMenu}
>
	<button class="checkbox" onclick={toggleComplete} aria-label={todo.completed_at ? 'Mark incomplete' : 'Mark complete'}>
		{#if todo.completed_at}
			<svg width="18" height="18" viewBox="0 0 18 18"><rect x="1" y="1" width="16" height="16" rx="4" fill="#2B579A" stroke="#2B579A" stroke-width="1.5"/><path d="M5 9l3 3 5-5" stroke="white" stroke-width="2" fill="none"/></svg>
		{:else}
			<svg width="18" height="18" viewBox="0 0 18 18"><rect x="1" y="1" width="16" height="16" rx="4" fill="none" stroke="#ccc" stroke-width="1.5"/></svg>
		{/if}
	</button>

	<div class="todo-content" onclick={selectTodo}>
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
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<span class="title" ondblclick={startEdit}>{todo.title}</span>
		{/if}
		{#if todo.notes}
			<span class="has-notes" title="Has notes">📝</span>
		{/if}
	</div>

	{#if todo.due_date && !todo.completed_at}
		<span class="due-date" class:overdue={isOverdue(todo.due_date)}>
			{formatRelativeDate(todo.due_date!)}
		</span>
	{/if}

	<button class="delete-btn" onclick={() => deleteTodo(todo.id)} title="Delete">&times;</button>

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
		transition: background 0.1s;
		background: white;
		border-radius: 8px;
		box-shadow: 0 1px 4px rgba(0,0,0,0.08);
		margin-bottom: 2px;
	}
	.todo-item:hover { background: #f8f9fa; }
	.todo-item.selected { background: #e8f0fe; }
	.todo-item.completed .title {
		text-decoration: line-through;
		color: #999;
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
		cursor: pointer;
		min-width: 0;
	}
	.title {
		font-size: 0.95rem;
		color: #333;
	}
	.has-notes { font-size: 0.75rem; }

	.edit-input {
		flex: 1;
		border: 1px solid #2B579A;
		border-radius: 4px;
		padding: 4px 8px;
		font-size: 0.95rem;
		outline: none;
	}

	.due-date {
		font-size: 0.8rem;
		color: #888;
		white-space: nowrap;
	}
	.due-date.overdue { color: #e74c3c; }

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
	.todo-item:hover .delete-btn { color: #ccc; }
	.delete-btn:hover { color: #e74c3c !important; }

	.context-menu {
		position: absolute;
		top: 100%;
		right: 16px;
		background: white;
		border: 1px solid #ddd;
		border-radius: 8px;
		padding: 8px;
		box-shadow: 0 4px 12px rgba(0,0,0,0.1);
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
		border-radius: 4px;
		text-align: left;
	}
	.menu-item:hover { background: #f0f0f0; }
	.menu-item label { white-space: nowrap; }
	.menu-item input[type="date"] { font-size: 0.85rem; }
	.menu-item button {
		font-size: 0.8rem;
		padding: 2px 8px;
		background: #2B579A;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
	}
	.menu-item button:disabled { opacity: 0.5; }

</style>
