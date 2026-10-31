<script lang="ts">
	import { onMount } from 'svelte';
	import { sceneStore } from '../stores/scene';
	import { viewportStore } from '../stores/viewport';
	import { drawScene } from '../lib/render';
	import { basisFromDirection, rotateEuler } from '../lib/math3d';

	let canvas = $state<HTMLCanvasElement | null>(null);
	let ctx: CanvasRenderingContext2D | null = null;
	let raf = 0;
	let dirty = true;
	let width = 320;
	let height = 180;

	const cameraObject = $derived(
		$sceneStore.objects.find((object) => object.id === $viewportStore.pipCamera) || null,
	);
	const visible = $derived(Boolean(cameraObject && $viewportStore.pipMode === 1));

	const zoom = $derived($viewportStore.pipZoom);
	const fov = $derived(Math.min(120, Math.max(10, 75 / Math.max(0.4, zoom))));

	$effect(() => {
		$sceneStore;
		$viewportStore;
		dirty = true;
	});

	// The canvas lives inside `{#if visible}`, so it may appear long after
	// mount. Observe the element that actually exists, not the null captured
	// by onMount, otherwise a window resize leaves a stale preview bitmap.
	$effect(() => {
		if (!visible || !canvas) return;
		dirty = true;
		const observer = new ResizeObserver(() => {
			dirty = true;
		});
		observer.observe(canvas);
		return () => observer.disconnect();
	});

	function setPipZoom(delta: number) {
		viewportStore.setPIPZoom(zoom + delta);
	}

	function resize() {
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		if (rect.width < 2 || rect.height < 2) return;
		width = rect.width;
		height = rect.height;
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = Math.round(width * dpr);
		canvas.height = Math.round(height * dpr);
		ctx = canvas.getContext('2d');
		ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
	}

	function draw() {
		if (!ctx || !visible || !cameraObject || width < 2 || height < 2) return;
		const forward = rotateEuler([0, 0, -1], cameraObject.rotation);
		const basis = basisFromDirection(cameraObject.position, forward, fov);
		// The preview is a picture of the scene, so the helpers of the editor
		// stay out of it: no grid, no axis lines, no lights, cameras or bones.
		const objects = $sceneStore.objects.filter(
			(object) =>
				object.id !== cameraObject.id &&
				object.visible &&
				!object.timelineHidden &&
				object.type !== 'light' &&
				object.type !== 'camera' &&
				object.type !== 'bone',
		);
		drawScene(ctx, width, height, objects, basis, {
			shading: $viewportStore.shadingMode,
			xray: $viewportStore.xray,
			grid: false,
			axes: false,
			selectedId: null,
			showGizmo: false,
			gameMode: false,
		});
	}

	function loop() {
		raf = requestAnimationFrame(loop);
		if (!dirty) return;
		dirty = false;
		resize();
		draw();
	}

	onMount(() => {
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	});
</script>

{#if visible}
	<div id="pip" data-testid="pip-preview">
		<div class="pip-frame">
			<canvas bind:this={canvas}></canvas>
		</div>

		<button
			class="pip-zoom pip-zoom-out"
			onclick={() => setPipZoom(-0.2)}
			aria-label="Zoom out"
			title="Zoom out"
			data-testid="pip-zoom-out"
		>
			−
		</button>
		<button
			class="pip-zoom pip-zoom-in"
			onclick={() => setPipZoom(0.2)}
			aria-label="Zoom in"
			title="Zoom in"
			data-testid="pip-zoom-in"
		>
			+
		</button>
	</div>
{/if}

<style>
	:global(#pip) {
		position: fixed;
		left: 0px;
		top: max(44px, env(safe-area-inset-top, 0px));
		width: min(30vw, 260px);
		z-index: 10;
		pointer-events: none;
	}

	@media (max-width: 560px) {
		:global(#pip) {
			/* Clear the 44 px tool rail; the preview stays in the left corner. */
			left: 0px;
			width: min(38vw, 200px);
		}
	}

	:global(.pip-frame) {
		position: relative;
		width: 100%;
		aspect-ratio: 16 / 9;
		border: 2px solid var(--ac);
		border-left: 0;
		border-radius: 0 7px 7px 0;
		overflow: hidden;
		background: #0b0c10;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
	}

	:global(.pip-frame canvas) {
		display: block;
		width: 100%;
		height: 100%;
	}

	:global(.pip-zoom) {
		position: absolute;
		width: 26px;
		height: 26px;
		display: grid;
		place-items: center;
		padding: 0;
		border: 2px solid var(--ac);
		border-radius: 6px;
		background: rgba(18, 21, 28, 0.94);
		color: var(--ac);
		pointer-events: auto;
		cursor: pointer;
		font: 700 14px system-ui, -apple-system, sans-serif;
		transition: background 140ms ease, color 140ms ease;
	}

	:global(.pip-zoom-out) {
		left: 8px;
		bottom: 8px;
	}

	:global(.pip-zoom-in) {
		right: 8px;
		bottom: 8px;
	}

	:global(.pip-zoom:active) {
		background: var(--ac);
		color: #0b0c10;
	}

	/* Zoom readout removed — plus/minus buttons live on the frame itself. */

</style>
