<script lang="ts">
	import { currentChipName, currentWorkspace } from '../stores/workspace';

	let { onMenu = () => {} }: { onMenu?: () => void } = $props();
</script>

<button
	id="mode"
	class="mode"
	onclick={onMenu}
	aria-label="Workspace: {$currentWorkspace?.label}, chip: {$currentChipName}"
	title="Switch the workspace"
	data-testid="mode-pill"
>
	{$currentWorkspace?.label} · {$currentChipName}
</button>

<style>
	:global(#mode) {
		flex: none;
		height: 28px;
		max-width: 200px;
		padding: 0 12px;
		border: 1px solid color-mix(in srgb, var(--ac) 26%, transparent);
		border-radius: 9999px;
		background: color-mix(in srgb, var(--ac) 12%, #141414);
		color: var(--ac);
		font: 700 11.5px Inter, system-ui, sans-serif;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		cursor: pointer;
		white-space: nowrap;
		flex-shrink: 0;
	}
</style>
