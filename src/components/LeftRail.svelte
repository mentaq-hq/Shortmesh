<script lang="ts">
	import { toolStore } from '../stores/tools';
	import { timelineStore } from '../stores/timeline';
	import { ICONS } from '../lib/constants';

	const tools = [
		{ id: 'select', icon: 'select', label: 'Select', shortcut: 'V' },
		{ id: 'move', icon: 'move', label: 'Move', shortcut: 'G' },
		{ id: 'rotate', icon: 'rotate', label: 'Rotate', shortcut: 'R' },
		{ id: 'scale', icon: 'scale', label: 'Scale', shortcut: 'S' },
		{ id: 'pan', icon: 'pan', label: 'Pan', shortcut: '' },
	];

	const timelineOpen = $derived($timelineStore.show);
	const timelineLabel = $derived(timelineOpen ? 'Collapse timeline' : 'Expand timeline');
</script>

<div id="rail" role="toolbar" aria-label="Tools">
	{#each tools as tool}
		<button
			class="tb"
			class:on={$toolStore.current === tool.id}
			onclick={() => toolStore.setTool(tool.id)}
			aria-label={tool.label}
			aria-pressed={$toolStore.current === tool.id}
			title={tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label}
			data-testid="tool-{tool.id}"
		>
			{@html ICONS[tool.icon]}
		</button>
	{/each}

	<button
		class="tb tl-toggle"
		class:on={timelineOpen}
		onclick={() => timelineStore.setShow(!timelineOpen)}
		aria-label={timelineLabel}
		aria-expanded={timelineOpen}
		aria-controls="timelinePanel"
		title={timelineLabel}
		data-testid="timeline-toggle"
	>
		{@html ICONS.expand}
	</button>
</div>

<style>
	:global(#rail) {
		position: absolute;
		left: 0px;
		top: 96px;
		max-height: calc(100vh - var(--dh, 180px) - 64px);
		max-height: max(180px, calc(100% - 96px - var(--dh, 92px) - 12px));
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-width: none;
		z-index: 9;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 4px;
		border-radius: 14px;
		background: var(--gl);
	}

	:global(#rail::-webkit-scrollbar) {
		display: none;
	}

	:global(#rail .tl-toggle) {
		position: sticky;
		bottom: 0;
		margin-top: 2px;
		background: var(--gl);
		box-shadow: 0 -8px 12px rgba(0, 0, 0, 0.35);
	}

	.tb {
		background: transparent;
		width: 36px;
		height: 36px;
		border: 0;
		border-radius: 12px;
		color: var(--tx2);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		cursor: pointer;
	}

	.tb :global(svg) {
		width: 20px;
		height: 20px;
	}

	.tb:hover {
		background: #21252f;
		color: var(--tx);
	}

	.tb.on {
		background: rgba(61, 219, 176, 0.14);
		color: var(--ac);
	}
</style>
