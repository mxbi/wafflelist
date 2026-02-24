<script lang="ts">
	import { background, presetColors, presetGradients } from '$lib/stores/settings';

	let open = $state(false);
</script>

<div class="bg-picker-wrapper">
	<button class="gear-btn" onclick={() => open = !open} title="Change background">
		<svg width="18" height="18" viewBox="0 0 20 20" fill="white">
			<path d="M11.078 0l.941 3.13 2.792-.995 1.613 2.79-2.168 2.1 2.168 2.1-1.613 2.79-2.792-.995-.941 3.13h-3.156l-.941-3.13-2.792.995L2.576 9.125l2.168-2.1-2.168-2.1L4.189 2.135l2.792.995L7.922 0h3.156zM9.5 6a3.5 3.5 0 100 7 3.5 3.5 0 000-7z"/>
		</svg>
	</button>

	{#if open}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="picker-panel" onclick={(e) => e.stopPropagation()}>
			<div class="section-label">Colors</div>
			<div class="swatches">
				{#each presetColors as color}
					<button
						class="swatch"
						class:active={$background === color}
						style="background: {color}"
						onclick={() => { background.set(color); open = false; }}
					></button>
				{/each}
			</div>
			<div class="section-label">Gradients</div>
			<div class="swatches">
				{#each presetGradients as grad}
					<button
						class="swatch"
						class:active={$background === grad}
						style="background: {grad}"
						onclick={() => { background.set(grad); open = false; }}
					></button>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.bg-picker-wrapper {
		position: relative;
	}
	.gear-btn {
		background: rgba(255,255,255,0.2);
		border: none;
		border-radius: 50%;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: background 0.15s;
	}
	.gear-btn:hover {
		background: rgba(255,255,255,0.35);
	}
	.picker-panel {
		position: absolute;
		top: 40px;
		right: 0;
		background: white;
		border-radius: 10px;
		padding: 12px;
		box-shadow: 0 8px 24px rgba(0,0,0,0.18);
		z-index: 200;
		width: 220px;
	}
	.section-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		color: #999;
		font-weight: 600;
		margin-bottom: 6px;
		margin-top: 4px;
	}
	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 8px;
	}
	.swatch {
		width: 32px;
		height: 32px;
		border-radius: 6px;
		border: 2px solid transparent;
		cursor: pointer;
		transition: border-color 0.15s, transform 0.1s;
	}
	.swatch:hover {
		transform: scale(1.1);
	}
	.swatch.active {
		border-color: #333;
	}
</style>
