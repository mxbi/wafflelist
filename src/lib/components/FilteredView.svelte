<script lang="ts">
	import TodoList from './TodoList.svelte';
	import { todos } from '$lib/stores/todos';
	import { filterTodos } from '$lib/filters';

	interface Props {
		title: string;
		view: string;
		reorderable?: boolean;
	}
	let { title, view, reorderable = false }: Props = $props();

	const filtered = $derived(filterTodos($todos, view));
</script>

<TodoList {title} filteredTodos={filtered} {reorderable} />
