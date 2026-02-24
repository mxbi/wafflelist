<script lang="ts">
	import { createTodo } from '$lib/stores/todos';

	interface Props {
		listId?: string | null;
	}
	let { listId = null }: Props = $props();

	let title = $state('');
	let inputEl: HTMLInputElement | undefined = $state();

	async function handleSubmit() {
		const t = title.trim();
		if (!t) return;
		await createTodo({ title: t, list_id: listId });
		title = '';
		inputEl?.focus();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') handleSubmit();
	}
</script>

<div class="add-todo">
	<span class="plus">+</span>
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
		font-size: 1.3rem;
		color: rgba(255,255,255,0.9);
		font-weight: 300;
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
