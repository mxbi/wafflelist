<script lang="ts">
	import { todos, selectedTodoId, updateTodo, deleteTodo, lists, mobileView } from '$lib/stores/todos';
	import { List as ListIcon } from 'lucide-svelte';
	import type { Todo } from '$lib/types';

	const todo = $derived($todos.find((t) => t.id === $selectedTodoId) ?? null);

	let editTitle = $state('');
	let editNotes = $state('');
	let editDueDate = $state('');
	let editListId = $state<string | null>(null);
	let snoozeDate = $state('');
	let initialized = $state<string | null>(null);

	// Sync local state when selected todo changes
	$effect(() => {
		if (todo && todo.id !== initialized) {
			editTitle = todo.title;
			editNotes = todo.notes || '';
			editDueDate = todo.due_date || '';
			editListId = todo.list_id;
			snoozeDate = todo.snoozed_until || '';
			initialized = todo.id;
		}
		if (!todo) {
			initialized = null;
		}
	});

	function close() {
		selectedTodoId.set(null);
		mobileView.set('list');
	}

	function save() {
		if (!todo) return;
		updateTodo(todo.id, {
			title: editTitle.trim() || todo.title,
			notes: editNotes.trim() || null,
			due_date: editDueDate || null,
			list_id: editListId,
			snoozed_until: snoozeDate || null
		});
	}

	function handleDelete() {
		if (!todo) return;
		deleteTodo(todo.id);
		close();
	}

	function toggleComplete() {
		if (!todo) return;
		updateTodo(todo.id, {
			completed_at: todo.completed_at ? null : new Date().toISOString()
		});
	}

	const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	function daysFromNow(n: number): string {
		const d = new Date();
		d.setDate(d.getDate() + n);
		return d.toISOString().split('T')[0];
	}

	function dayLabel(n: number): string {
		const d = new Date();
		d.setDate(d.getDate() + n);
		return dayNames[d.getDay()];
	}

	function handleTitleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			save();
		}
	}
</script>

{#if todo}
	<aside class="detail-sidebar">
		<div class="detail-header">
			<button class="close-btn" onclick={close}>&times;</button>
		</div>

		<div class="detail-body">
			<div class="detail-row checkbox-row">
				<button class="checkbox" onclick={toggleComplete}>
					{#if todo.completed_at}
						<svg width="20" height="20" viewBox="0 0 18 18"><circle cx="9" cy="9" r="8" fill="#2B579A" stroke="#2B579A" stroke-width="1.5"/><path d="M5 9l3 3 5-5" stroke="white" stroke-width="2" fill="none"/></svg>
					{:else}
						<svg width="20" height="20" viewBox="0 0 18 18"><circle cx="9" cy="9" r="8" fill="none" stroke="#ccc" stroke-width="1.5"/></svg>
					{/if}
				</button>
				<input
					class="title-input"
					class:completed={!!todo.completed_at}
					bind:value={editTitle}
					onblur={save}
					onkeydown={handleTitleKeydown}
				/>
			</div>

			<div class="detail-section">
				<label class="section-label">List</label>
				<select class="field-input" bind:value={editListId} onchange={save}>
					<option value={null}>Inbox (no list)</option>
					{#each $lists as list (list.id)}
						<option value={list.id}>{list.icon || '▪'} {list.name}</option>
					{/each}
				</select>
			</div>

			<div class="detail-section">
				<label class="section-label">Due Date</label>
				<div class="quick-date-buttons">
					<button class="quick-date-btn" onclick={() => { editDueDate = daysFromNow(0); save(); }}>Today</button>
					<button class="quick-date-btn" onclick={() => { editDueDate = daysFromNow(1); save(); }}>Tomorrow</button>
					<button class="quick-date-btn" onclick={() => { editDueDate = daysFromNow(2); save(); }}>{dayLabel(2)}</button>
					<button class="quick-date-btn" onclick={() => { editDueDate = daysFromNow(3); save(); }}>{dayLabel(3)}</button>
					<button class="quick-date-btn quick-date-clear" onclick={() => { editDueDate = ''; save(); }}>&times;</button>
				</div>
				<input class="field-input" type="date" bind:value={editDueDate} onchange={save} />
			</div>

			<div class="detail-section">
				<label class="section-label">Snooze Until</label>
				<input class="field-input" type="date" bind:value={snoozeDate} onchange={save} />
			</div>

			<div class="detail-section">
				<label class="section-label">Notes</label>
				<textarea
					class="notes-input"
					bind:value={editNotes}
					onblur={save}
					placeholder="Add notes..."
					rows="6"
				></textarea>
			</div>
		</div>

		<div class="detail-footer">
			<span class="created-at">
				Created {new Date(todo.created_at).toLocaleDateString()}
			</span>
			<button class="delete-btn" onclick={handleDelete}>Delete</button>
		</div>
	</aside>
{/if}

<style>
	.detail-sidebar {
		width: 320px;
		min-width: 320px;
		background: #fafbfc;
		border-left: 1px solid #e0e0e0;
		display: flex;
		flex-direction: column;
		height: 100vh;
		overflow-y: auto;
	}

	.detail-header {
		display: flex;
		justify-content: flex-end;
		padding: 12px 16px 4px;
	}
	.close-btn {
		background: none;
		border: none;
		font-size: 1.4rem;
		color: #999;
		cursor: pointer;
		padding: 0 4px;
		line-height: 1;
	}
	.close-btn:hover { color: #333; }

	.detail-body {
		flex: 1;
		padding: 0 16px 16px;
	}

	.checkbox-row {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 20px;
	}
	.checkbox {
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		display: flex;
		flex-shrink: 0;
	}
	.title-input {
		flex: 1;
		border: none;
		background: none;
		font-size: 1.15rem;
		font-weight: 600;
		color: #333;
		outline: none;
		padding: 4px 0;
	}
	.title-input.completed {
		text-decoration: line-through;
		color: #999;
	}
	.title-input:focus {
		border-bottom: 2px solid #2B579A;
	}

	.detail-section {
		margin-bottom: 16px;
	}
	.section-label {
		display: block;
		font-size: 0.75rem;
		font-weight: 600;
		color: #888;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		margin-bottom: 6px;
	}
	.field-input {
		width: 100%;
		padding: 8px 10px;
		border: 1px solid #ddd;
		border-radius: 6px;
		font-size: 0.9rem;
		font-family: inherit;
		background: white;
		color: #333;
		outline: none;
		box-sizing: border-box;
	}
	.field-input:focus { border-color: #2B579A; }

	select.field-input {
		cursor: pointer;
	}

	.quick-date-buttons {
		display: flex;
		gap: 6px;
		margin-bottom: 6px;
	}
	.quick-date-btn {
		padding: 4px 12px;
		font-size: 0.8rem;
		font-family: inherit;
		border: 1px solid #ddd;
		border-radius: 6px;
		background: white;
		color: #555;
		cursor: pointer;
	}
	.quick-date-btn:hover {
		background: #e8f0fe;
		border-color: #2B579A;
		color: #2B579A;
	}
	.quick-date-clear {
		margin-left: auto;
		color: #999;
	}
	.quick-date-clear:hover {
		background: #fde8e8;
		border-color: #e74c3c;
		color: #e74c3c;
	}

	.notes-input {
		width: 100%;
		padding: 8px 10px;
		border: 1px solid #ddd;
		border-radius: 6px;
		font-size: 0.9rem;
		font-family: inherit;
		background: white;
		color: #333;
		outline: none;
		resize: vertical;
		min-height: 80px;
		box-sizing: border-box;
	}
	.notes-input:focus { border-color: #2B579A; }

	.detail-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 16px;
		border-top: 1px solid #eee;
	}
	.created-at {
		font-size: 0.75rem;
		color: #aaa;
	}
	.delete-btn {
		background: none;
		border: none;
		color: #e74c3c;
		cursor: pointer;
		font-size: 0.85rem;
		padding: 4px 8px;
		border-radius: 4px;
	}
	.delete-btn:hover { background: #fde8e8; }

	@media (max-width: 768px) {
		.detail-sidebar {
			width: 100%;
			min-width: 100%;
		}
	}
</style>
