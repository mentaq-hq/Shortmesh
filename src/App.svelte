<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { get } from 'svelte/store';
	import Viewport from './components/Viewport.svelte';
	import LeftRail from './components/LeftRail.svelte';
	import TopToolbar from './components/TopToolbar.svelte';
	import BottomDock from './components/BottomDock.svelte';
	import Outliner from './components/Outliner.svelte';
	import Dialog from './components/Dialog.svelte';
	import Toast from './components/Toast.svelte';
	import PiP from './components/PiP.svelte';
	import GamePad from './components/GamePad.svelte';
	import ScoreDisplay from './components/ScoreDisplay.svelte';
	import { sceneStore } from './stores/scene';
	import { setPickingEngine } from './lib/picking';
	import { WasmEngine } from './lib/wasm';
	import { timelineStore } from './stores/timeline';
	import { toolStore } from './stores/tools';
	import { uiStore } from './stores/ui';
	import { physicsStore } from './stores/physics';
	import { workspaceStore } from './stores/workspace';
	import { createProject, loadAutosave, saveAutosave } from './lib/project';
	import { clipHidesLayer, layerRange } from './lib/layers';

	let raf = 0;
	let lastFrame = 0;
	let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
	let unsubscribeScene: (() => void) | null = null;
	let unsubscribeTimeline: (() => void) | null = null;
	let cleanupShortcuts: (() => void) | null = null;
	let cleanupVisibility: (() => void) | null = null;
	const jumpVelocity = new Map<string, number>();
	const onGround = new Map<string, boolean>();
	let audioCtx: AudioContext | null = null;

	function playTone(freq: number, duration = 0.09, type: OscillatorType = 'triangle') {
		try {
			if (typeof AudioContext === 'undefined') return;
			if (!audioCtx) audioCtx = new AudioContext();
			if (audioCtx.state === 'suspended') audioCtx.resume();
			const osc = audioCtx.createOscillator();
			const gain = audioCtx.createGain();
			osc.type = type;
			osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
			gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
			gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
			osc.connect(gain);
			gain.connect(audioCtx.destination);
			osc.start();
			osc.stop(audioCtx.currentTime + duration);
		} catch {
			// Audio is optional and best-effort
		}
	}

	function applyTimeline(time: number) {
		const timeline = get(timelineStore);
		const transforms = timelineStore.evaluate(time, timeline.easing);
		if (transforms.size) sceneStore.applyAnimation(transforms);
		const hidden = new Set<string>();
		for (const object of get(sceneStore).objects) {
			if (!clipHidesLayer(object.type)) continue;
			const keys = (timeline.keyframes.get(object.id) ?? []).map((key) => key.time);
			const strips = timeline.strips.filter((strip) => strip.objectId === object.id);
			const clip = timeline.clips.get(object.id) ?? null;
			const range = layerRange(keys, strips, timeline.duration, clip, true);
			if (time < range.start - 1e-4 || time >= range.end - 1e-4) hidden.add(object.id);
		}
		sceneStore.setTimelineHidden(hidden);
	}

	function gameTick(delta: number) {
		const state = get(sceneStore);
		if (!state.gameMode) {
			jumpVelocity.clear();
			onGround.clear();
			return;
		}
		const input = sceneStore.getGameInput();
		const player =
			state.objects.find((object) => object.id === state.selectedId && object.type !== 'light' && object.type !== 'camera') ||
			state.objects.find((object) => object.type !== 'light' && object.type !== 'camera' && object.type !== 'coin' && object.type !== 'plane');
		if (!player) return;

		const speed = 4.5;
		const position: [number, number, number] = [...player.position];
		if (input.left) position[0] -= speed * delta;
		if (input.right) position[0] += speed * delta;
		if (input.up) position[2] -= speed * delta;
		if (input.down) position[2] += speed * delta;

		let velocity = jumpVelocity.get(player.id) || 0;
		const grounded = position[1] <= 0.501;
		if (input.jump && grounded && !onGround.get(player.id)) {
			velocity = 5.8;
			onGround.set(player.id, true);
			playTone(440, 0.1, 'sine');
		}
		if (!input.jump) onGround.set(player.id, false);
		velocity -= 15 * delta;
		position[1] = Math.max(0.5, position[1] + velocity * delta);
		if (position[1] <= 0.5) velocity = 0;
		jumpVelocity.set(player.id, velocity);

		if (
			position[0] !== player.position[0] ||
			position[1] !== player.position[1] ||
			position[2] !== player.position[2]
		) {
			sceneStore.setTransform(player.id, { position });
		}

		for (const coin of state.objects.filter((object) => object.type === 'coin' && object.visible)) {
			const dx = coin.position[0] - position[0];
			const dz = coin.position[2] - position[2];
			const dy = coin.position[1] - position[1];
			if (Math.hypot(dx, dz) < 0.75 && Math.abs(dy) < 1) {
				sceneStore.deleteObject(coin.id);
				sceneStore.addScore(10);
				playTone(880, 0.12, 'triangle');
			}
		}
	}

	function frame(now: number) {
		const delta = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000 || 0));
		lastFrame = now;
		const timeline = get(timelineStore);
		if (timeline.playing) {
			const time = timelineStore.tick();
			applyTimeline(time);
		}
		const physics = get(physicsStore);
		if (physics.running) sceneStore.stepPhysics(delta, physics.gravity);
		sceneStore.updateCameraTracking(delta, timeline.currentTime);
		gameTick(delta);
		raf = requestAnimationFrame(frame);
	}

	function scheduleAutosave() {
		if (!browser || get(timelineStore).playing) return;
		if (autosaveTimer) clearTimeout(autosaveTimer);
		autosaveTimer = setTimeout(() => {
			const project = createProject('Autosave');
			if (project.scene.objects.length) saveAutosave(project);
		}, 900);
	}

	function isEditable(target: EventTarget | null) {
		if (!(target instanceof HTMLElement)) return false;
		const tag = target.tagName;
		return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
	}

	function setupShortcuts() {
		const onKeyDown = (event: KeyboardEvent) => {
			if (isEditable(event.target)) return;
			const key = event.key.toLowerCase();
			const command = event.ctrlKey || event.metaKey;
			const state = get(sceneStore);

			if (state.gameMode && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', ' '].includes(key)) {
				event.preventDefault();
				if (key === 'arrowup' || key === 'w') sceneStore.setGameInput('up', true);
				if (key === 'arrowdown' || key === 's') sceneStore.setGameInput('down', true);
				if (key === 'arrowleft' || key === 'a') sceneStore.setGameInput('left', true);
				if (key === 'arrowright' || key === 'd') sceneStore.setGameInput('right', true);
				if (key === ' ') sceneStore.setJump(true);
				return;
			}

			if (command && key === 'z') {
				event.preventDefault();
				if (event.shiftKey) sceneStore.redo();
				else sceneStore.undo();
				return;
			}
			if (command && key === 'y') {
				event.preventDefault();
				sceneStore.redo();
				return;
			}
			if (command && key === 's') {
				event.preventDefault();
				uiStore.openDialog('save');
				return;
			}
			if (command && key === 'o') {
				event.preventDefault();
				uiStore.openDialog('open');
				return;
			}
			if (command && key === 'n') {
				event.preventDefault();
				uiStore.openDialog('new');
				return;
			}
			if (command && key === 'd') {
				event.preventDefault();
				sceneStore.duplicateSelected();
				return;
			}
			if (key === 'delete' || key === 'backspace') {
				if (get(sceneStore).selectedId) {
					event.preventDefault();
					sceneStore.deleteSelected();
				}
				return;
			}
			if (key === 'escape') {
				uiStore.closeDialog();
				return;
			}
			if (key === ' ') {
				event.preventDefault();
				timelineStore.togglePlay();
				return;
			}
			if (key === 'g') toolStore.setTool('move');
			if (key === 'r') toolStore.setTool('rotate');
			if (key === 's' && !command) toolStore.setTool('scale');
			if (key === 'v') toolStore.setTool('select');
			if (key === 'f') {
				window.dispatchEvent(new CustomEvent(event.shiftKey ? 'toon:frame-all' : 'toon:frame-selected'));
				return;
			}
			if (key === 'home') {
				event.preventDefault();
				window.dispatchEvent(new CustomEvent('toon:frame-all'));
				return;
			}
			if (key === 'a' && !command) {
				sceneStore.selectAll();
				return;
			}
			if (state.editMode && (key === '1' || key === '2' || key === '3')) {
				sceneStore.setElementMode(key === '1' ? 'vertex' : key === '2' ? 'edge' : 'face');
			}
			if (key === 'tab') {
				event.preventDefault();
				workspaceStore.setWorkspace(state.editMode ? 'mod' : 'edt');
			}
		};

		const onKeyUp = (event: KeyboardEvent) => {
			const key = event.key.toLowerCase();
			if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', ' '].includes(key)) {
				if (key === 'arrowup' || key === 'w') sceneStore.setGameInput('up', false);
				if (key === 'arrowdown' || key === 's') sceneStore.setGameInput('down', false);
				if (key === 'arrowleft' || key === 'a') sceneStore.setGameInput('left', false);
				if (key === 'arrowright' || key === 'd') sceneStore.setGameInput('right', false);
				if (key === ' ') sceneStore.setJump(false);
			}
		};

		const saveBeforeExit = () => {
			const project = createProject('Autosave');
			if (project.scene.objects.length) saveAutosave(project);
		};

		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		window.addEventListener('beforeunload', saveBeforeExit);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
			window.removeEventListener('beforeunload', saveBeforeExit);
		};
	}

	onMount(() => {
		if (!browser) return;

		const restored = loadAutosave();
		if (restored && restored.scene.objects.length) {
			sceneStore.load(restored.scene.objects, restored.scene.selectedId);
			sceneStore.setScore(restored.scene.score);
			timelineStore.loadKeyframes(restored.timeline.keyframes);
			if (Object.keys(restored.timeline.curves ?? {}).length) timelineStore.loadCurves(restored.timeline.curves);
			timelineStore.loadStrips(restored.timeline.strips);
			timelineStore.loadClips(restored.timeline.clips);
			timelineStore.setDuration(restored.timeline.duration);
			timelineStore.setLoop(restored.timeline.loop);
			timelineStore.setEasing(restored.timeline.easing);
			timelineStore.setFrameRate(restored.timeline.frameRate);
			uiStore.showToast('Restored your last session.', 'success', 2400);
		} else {
			uiStore.showToast('New project ready. Pick a shape from Model → Add.', 'info', 3200);
		}

		cleanupShortcuts = setupShortcuts();

		const onVisibility = () => {
			if (!document.hidden) timelineStore.resyncClock();
		};
		document.addEventListener('visibilitychange', onVisibility);
		cleanupVisibility = () => document.removeEventListener('visibilitychange', onVisibility);

		unsubscribeScene = sceneStore.subscribe(() => scheduleAutosave());
		unsubscribeTimeline = timelineStore.subscribe((state) => {
			if (!state.playing) applyTimeline(state.currentTime);
			scheduleAutosave();
		});
		(window as unknown as { __toon: unknown }).__toon = {
			scene: () => get(sceneStore),
			timeline: () => get(timelineStore),
			curves: () => timelineStore.serializeCurves(),
			strips: () => timelineStore.serializeStrips(),
			setDuration: (value: number) => timelineStore.setDuration(value),
		};

		WasmEngine.load('/engine.wasm').then((engine) => {
			if (!engine) return;
			setPickingEngine(engine);
			uiStore.showToast(`Rust engine v${engine.abi} loaded.`, 'success', 1800);
		});

		lastFrame = performance.now();
		raf = requestAnimationFrame(frame);
	});

	onDestroy(() => {
		cancelAnimationFrame(raf);
		timelineStore.setPlaying(false);
		cleanupVisibility?.();
		cleanupShortcuts?.();
		unsubscribeScene?.();
		unsubscribeTimeline?.();
		if (autosaveTimer) clearTimeout(autosaveTimer);
	});
</script>

<div id="app" class="app-root h-full w-full">
	<div id="cv" class="absolute inset-0">
		<Viewport />
		<PiP />
		<GamePad />
		<ScoreDisplay />
	</div>

	<LeftRail />
	<TopToolbar />

	<BottomDock />
	<Outliner />

	<Dialog />
	<Toast />
</div>

<style>
	:global(#app) {
		position: relative;
		height: 100%;
	}

	:global(#cv) {
		position: absolute;
		inset: 0;
	}

	:global(canvas) {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
