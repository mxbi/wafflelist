<script lang="ts">
	import WeekView from '$lib/components/WeekView.svelte';
	import { loadTodos, currentReloadFn } from '$lib/stores/todos';
	import { onMount } from 'svelte';

	function reload() { loadTodos({ view: 'week' }); }
	onMount(() => {
		reload();
		currentReloadFn.set(reload);
		return () => currentReloadFn.set(null);
	});
</script>

<WeekView />
