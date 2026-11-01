<script lang="ts">
	import { sceneStore } from '../stores/scene';
</script>

{#if $sceneStore.gameMode}
<div id="sc" class="fixed left-1/2 top-[48px] -translate-x-1/2 z-10 flex text-xl font-bold bg-bg1 border border-ln2 rounded-full px-3.5 py-1" role="status" aria-live="polite">
	PTS {$sceneStore.score}
</div>
{/if}

<style>
	:global(#sc) {
		font-size: 14px;
		font-weight: 700;
		background: var(--bg1);
		border: 1px solid var(--ln2);
		border-radius: 9999px;
		padding: 5px 14px;
	}
</style>
