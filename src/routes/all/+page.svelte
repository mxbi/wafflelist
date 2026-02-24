<script lang="ts">
	import TodoList from '$lib/components/TodoList.svelte';
	import { todos } from '$lib/stores/todos';
	import { filterTodos } from '$lib/filters';

	const filtered = $derived(filterTodos($todos, 'all'));
</script>

<TodoList title="All To-Dos" filteredTodos={filtered} />
