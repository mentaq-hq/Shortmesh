<script lang="ts">
	import { sceneStore } from '../stores/scene';
	import type { GameInput } from '../stores/scene';

	const gameMode = $derived($sceneStore.gameMode);

	function press(direction: keyof GameInput, pressed: boolean) {
		sceneStore.setGameInput(direction, pressed);
	}

	function jump(pressed: boolean) {
		sceneStore.setJump(pressed);
	}

	function stopAll() {
		sceneStore.resetGameInput();
	}
</script>

{#if gameMode}
	<div id="pad" class="fixed left-4 bottom-[calc(var(--dh)+10px)] z-10 grid grid-cols-3 gap-1" role="group" aria-label="Game Controls" data-testid="gamepad">
		<span></span>
		<button
			class="b w-11 h-11"
			aria-label="Move forward"
			onpointerdown={(event) => { event.preventDefault(); press('up', true); }}
			onpointerup={() => press('up', false)}
			onpointerleave={() => press('up', false)}
			onpointercancel={() => press('up', false)}
		>▲</button>
		<span></span>
		<button
			class="b w-11 h-11"
			aria-label="Move left"
			onpointerdown={(event) => { event.preventDefault(); press('left', true); }}
			onpointerup={() => press('left', false)}
			onpointerleave={() => press('left', false)}
			onpointercancel={() => press('left', false)}
		>◀</button>
		<button
			class="b w-11 h-11"
			aria-label="Move backward"
			onpointerdown={(event) => { event.preventDefault(); press('down', true); }}
			onpointerup={() => press('down', false)}
			onpointerleave={() => press('down', false)}
			onpointercancel={() => press('down', false)}
		>▼</button>
		<button
			class="b w-11 h-11"
			aria-label="Move right"
			onpointerdown={(event) => { event.preventDefault(); press('right', true); }}
			onpointerup={() => press('right', false)}
			onpointerleave={() => press('right', false)}
			onpointercancel={() => press('right', false)}
		>▶</button>
	</div>

	<button
		id="jmp"
		class="fixed right-4 bottom-[calc(var(--dh)+14px)] z-10 w-16 h-16 rounded-full bg-accent text-bg0 border-0 font-black"
		onpointerdown={(event) => { event.preventDefault(); jump(true); }}
		onpointerup={() => jump(false)}
		onpointerleave={() => jump(false)}
		onpointercancel={() => jump(false)}
		aria-label="Jump"
		data-testid="jump"
	>
		JUMP
	</button>
	<button class="stop" onclick={stopAll} aria-label="Release controls">stop</button>
{/if}

<style>
	:global(.b) {
		color: var(--tx);
		background: var(--bg2);
		border: 1px solid var(--ln2);
		border-radius: 12px;
		font: inherit;
		cursor: pointer;
		touch-action: none;
	}

	:global(.stop) {
		position: absolute;
		left: 50%;
		bottom: calc(var(--dh) + 8px);
		transform: translateX(-50%);
		z-index: 6;
		padding: 3px 10px;
		border-radius: 9999px;
		border: 1px solid var(--ln2);
		background: var(--gl);
		color: var(--tx2);
		font: 600 10px Inter, system-ui, sans-serif;
		cursor: pointer;
	}
</style>
