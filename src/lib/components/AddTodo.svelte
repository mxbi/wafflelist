<script lang="ts">
	import { createTodo } from '$lib/stores/todos';
	import { Plus } from 'lucide-svelte';

	interface Props {
		listId?: string | null;
	}
	let { listId = null }: Props = $props();

	let title = $state('');
	let inputEl: HTMLInputElement | undefined = $state();

	async function handleSubmit() {
		const t = title.trim();
		if (!t) return;
		title = '';
		inputEl?.focus();
		try {
			await createTodo({ title: t, list_id: listId });
		} catch (e) {
			console.error('Failed to create todo:', e);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') handleSubmit();
	}
</script>

<div class="add-todo">
	<span class="plus"><Plus size={18} strokeWidth={2} /></span>
	<input
		bind:this={inputEl}
		type="text"
		placeholder="Add a to-do..."
		bind:value={title}
		onkeydown={handleKeydown}
	/>
</div>

<style>
	.add-todo {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		background: rgba(0,0,0,0.08);
		border-radius: 8px;
		margin-bottom: 12px;
		backdrop-filter: blur(4px);
	}
	.plus {
		display: flex;
		color: rgba(255,255,255,0.9);
	}
	input {
		flex: 1;
		border: none;
		background: none;
		font-size: 1rem;
		outline: none;
		color: white;
	}
	input::placeholder { color: rgba(255,255,255,0.6); }
</style>
