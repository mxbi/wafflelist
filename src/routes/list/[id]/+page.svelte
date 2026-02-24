<script lang="ts">
	import TodoList from '$lib/components/TodoList.svelte';
	import { lists, todos, updateList } from '$lib/stores/todos';
	import { filterTodos } from '$lib/filters';
	import { page } from '$app/stores';

	const listId = $derived($page.params.id);
	const currentList = $derived($lists.find((l) => l.id === listId));
	const listName = $derived(currentList?.name ?? 'List');
	const filtered = $derived(filterTodos($todos, 'list', listId));

	function handleRename(name: string) {
		updateList(listId, { name });
	}
</script>

<TodoList title={listName} listId={listId} filteredTodos={filtered} onrename={handleRename} reorderable={true} />
