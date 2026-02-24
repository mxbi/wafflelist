<script lang="ts">
	import { todos, searchQuery } from '$lib/stores/todos';
	import TodoItem from './TodoItem.svelte';
	import AddTodo from './AddTodo.svelte';
	import BackgroundPicker from './BackgroundPicker.svelte';
	import { formatDateGroupLabel } from '$lib/dates';
	import type { Todo } from '$lib/types';

	import { filterTodos } from '$lib/filters';

	const weekTodos = $derived(filterTodos($todos, 'week'));

	const activeTodos = $derived.by(() => {
		let items = weekTodos;
		const q = $searchQuery.toLowerCase().trim();
		if (q) items = items.filter((t) => t.title.toLowerCase().includes(q) || t.notes?.toLowerCase().includes(q));
		return items;
	});

	interface DateGroup {
		label: string;
		date: string;
		todos: Todo[];
	}

	const groups = $derived.by(() => {
		const map = new Map<string, Todo[]>();
		const noDate: Todo[] = [];

		for (const todo of activeTodos) {
			if (todo.due_date) {
				const arr = map.get(todo.due_date) || [];
				arr.push(todo);
				map.set(todo.due_date, arr);
			} else {
				noDate.push(todo);
			}
		}

		const result: DateGroup[] = [];
		const sortedDates = [...map.keys()].sort();
		for (const date of sortedDates) {
			result.push({ label: formatDateGroupLabel(date), date, todos: map.get(date)! });
		}
		if (noDate.length > 0) {
			result.push({ label: 'NO DATE', date: '', todos: noDate });
		}
		return result;
	});
</script>

<div class="week-view">
	<div class="list-header">
		<h1>This Week</h1>
		<BackgroundPicker />
	</div>

	<div class="week-content">
		<AddTodo />

		{#each groups as group (group.date)}
			<div class="date-group">
				<div class="date-badge">{group.label}</div>
				{#each group.todos as todo (todo.id)}
					<TodoItem {todo} />
				{/each}
			</div>
		{/each}

		{#if groups.length === 0}
			<div class="empty">Nothing due this week!</div>
		{/if}
	</div>
</div>

<style>
	.week-view {
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
	h1 {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 600;
		color: white;
		text-shadow: 0 1px 3px rgba(0,0,0,0.2);
	}
	.week-content {
		flex: 1;
		padding: 0 24px 24px;
	}
	.date-group {
		margin-top: 16px;
	}
	.date-badge {
		display: inline-block;
		background: rgba(0,0,0,0.5);
		color: white;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.5px;
		padding: 4px 10px;
		border-radius: 10px;
		margin-bottom: 6px;
	}
	.empty {
		padding: 40px 16px;
		text-align: center;
		color: rgba(255,255,255,0.8);
		font-size: 0.95rem;
	}
</style>
