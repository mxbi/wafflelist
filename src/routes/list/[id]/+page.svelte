<script lang="ts">
	import TodoList from '$lib/components/TodoList.svelte';
	import { loadTodos, lists, updateList, currentReloadFn } from '$lib/stores/todos';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';

	const listId = $derived($page.params.id);
	const currentList = $derived($lists.find((l) => l.id === listId));
	const listName = $derived(currentList?.name ?? 'List');

	let editing = $state(false);
	let editName = $state('');

	function reload() { loadTodos({ list_id: listId }); }

	$effect(() => {
		// Reload when listId changes
		listId;
		reload();
	});

	onMount(() => {
		currentReloadFn.set(reload);
		return () => currentReloadFn.set(null);
	});

	function startEdit() {
		editName = listName;
		editing = true;
	}

	function saveEdit() {
		const name = editName.trim();
		if (name && name !== listName) {
			updateList(listId, { name });
		}
		editing = false;
	}
</script>

{#if editing}
	<div class="edit-header">
		<!-- svelte-ignore a11y_autofocus -->
		<input
			bind:value={editName}
			onblur={saveEdit}
			onkeydown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') editing = false; }}
			autofocus
		/>
	</div>
{/if}

<TodoList title={listName} listId={listId} />

{#if !editing}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="rename-hint" ondblclick={startEdit}></div>
{/if}

<style>
	.edit-header {
		padding: 20px 16px 0;
	}
	.edit-header input {
		font-size: 1.5rem;
		font-weight: 600;
		border: 1px solid #2B579A;
		border-radius: 4px;
		padding: 4px 8px;
		outline: none;
		width: 300px;
	}
	.rename-hint {
		position: absolute;
		top: 20px;
		left: 276px;
		width: 300px;
		height: 36px;
		cursor: text;
	}
</style>
