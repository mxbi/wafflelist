<script lang="ts">
	import TodoList from '$lib/components/TodoList.svelte';
	import { loadTodos, currentReloadFn } from '$lib/stores/todos';
	import { onMount } from 'svelte';

	function reload() { loadTodos({ view: 'today' }); }
	onMount(() => {
		reload();
		currentReloadFn.set(reload);
		return () => currentReloadFn.set(null);
	});
</script>

<TodoList title="Today" />
