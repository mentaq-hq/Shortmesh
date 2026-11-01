<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { ICONS } from '../lib/constants';
	import { iconForType, sceneStore } from '../stores/scene';
	import {
		MAX_TIMELINE_SECONDS,
		timelineStore,
		roundTime,
		type LayerClip,
		type NlaStrip,
	} from '../stores/timeline';
	import { uiStore } from '../stores/ui';
	import { viewportStore } from '../stores/viewport';
	import { parseOBJ, parseSTL } from '../lib/io3d';
	import { readProjectFile, applyProject } from '../lib/project';
	import { focalLengthToFOV, fovToFocalLength } from '../lib/math3d';
	import { readLayerImage } from '../lib/media';
	import { isClippable, layerRange, layerTint, type LayerRange, type LayerTint } from '../lib/layers';
	import { formatClock } from '../lib/time';

	let scroller: HTMLDivElement;
	let rowsEl: HTMLDivElement | null = $state(null);
	let menuWrap: HTMLDivElement | null = $state(null);
	let layerInput: HTMLInputElement | null = $state(null);
	let universalInput: HTMLInputElement | null = $state(null);
	let subDrawerMode = $state<'speed' | 'opacity' | 'replace' | 'camera' | null>(null);
	let speedVal = $state(1.0);
	let opacityVal = $state(100);
	let audioMuted = $state(false);
	let renamingTrackId = $state<string | null>(null);
	let renameDraft = $state('');

	function requireSelectedObject(fn: (obj: NonNullable<ReturnType<typeof get<typeof sceneStore>>['objects'][number]>) => void) {
		const st = get(sceneStore);
		const obj = st.objects.find((o) => o.id === st.selectedId);
		if (!obj) {
			uiStore.showToast('Select an object first.', 'warning');
			return;
		}
		fn(obj);
	}

	function actSplitClip() {
		requireSelectedObject((obj) => {
			const res = sceneStore.splitLayer(obj.id);
			if (res) uiStore.showToast(`Split ${obj.name} at ${formatClock(timeline.currentTime, 1)}`, 'success');
			else uiStore.showToast('Move playhead inside the layer clip to split.', 'warning');
		});
	}

	function actApplySpeed(mult: number) {
		requireSelectedObject((obj) => {
			speedVal = mult;
			timelineStore.setLayerSpeed(obj.id, mult);
			uiStore.showToast(`Speed set to ${mult.toFixed(2)}x`, 'success');
		});
	}

	function actReverseClip() {
		requireSelectedObject((obj) => {
			sceneStore.animationEdit(() => timelineStore.reverseLayer(obj.id));
			uiStore.showToast('Reversed layer motion.', 'success');
		});
	}

	function actFreezeClip() {
		requireSelectedObject((obj) => {
			sceneStore.animationEdit(() => timelineStore.freezeLayer(obj.id, timeline.currentTime, 2));
			uiStore.showToast('Inserted 2s freeze frame hold.', 'success');
		});
	}

	function actDuplicateClip() {
		requireSelectedObject((obj) => {
			sceneStore.duplicateObject(obj.id);
			const newId = get(sceneStore).selectedId;
			if (newId) {
				const clip = timeline.clips.get(obj.id) ?? { start: 0, end: 15 };
				timelineStore.setClip(newId, clip.start, clip.end);
				timelineStore.copySelectedKeys(obj.id);
				timelineStore.pasteKeysAtPlayhead(newId);
				uiStore.showToast(`Duplicated layer: ${obj.name}`, 'success');
			}
		});
	}

	function actOpacity(pct: number) {
		requireSelectedObject((obj) => {
			opacityVal = pct;
			sceneStore.setObjectOpacity(obj.id, pct / 100);
		});
	}

	function actReplaceShape(prim: string) {
		requireSelectedObject((obj) => {
			sceneStore.replaceObjectGeometry(obj.id, prim);
			uiStore.showToast(`Replaced with ${prim}.`, 'success');
			subDrawerMode = null;
		});
	}

	function actDeleteLayer() {
		requireSelectedObject((obj) => {
			sceneStore.deleteObject(obj.id);
			timelineStore.removeKeyframesFor(obj.id);
			uiStore.showToast(`Deleted ${obj.name}.`, 'success');
		});
	}

	function actToggleCamView() {
		let cam = get(sceneStore).objects.find((o) => o.type.startsWith('camera'));
		if (!cam) {
			sceneStore.addPrimitive('camera', [0, 2.5, 6]);
			cam = get(sceneStore).objects.find((o) => o.type.startsWith('camera'));
			uiStore.showToast('Added Scene Camera.', 'success');
		}
		viewportStore.toggleViewThroughCamera();
	}

	async function handleUniversalUpload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = input.files;
		if (!files || !files.length) return;
		for (const file of Array.from(files)) {
			const name = file.name || 'Uploaded_Layer';
			const lower = name.toLowerCase();
			const mime = file.type || '';
			try {
				if (mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/i.test(lower)) {
					const img = await readLayerImage(file);
					if (img) {
						sceneStore.addImageLayer(img.dataUrl, img.width, img.height, name);
						const id = get(sceneStore).selectedId;
						if (id) timelineStore.setClip(id, 0, 15);
						uiStore.showToast(`Uploaded image layer: ${name}`, 'success');
						continue;
					}
				}
				if (/\.(obj|stl)$/i.test(lower)) {
					const txt = await file.text();
					const mesh = lower.endsWith('.stl') ? parseSTL(txt) : parseOBJ(txt);
					if (mesh) {
						sceneStore.importMeshObject(name, mesh);
						const id = get(sceneStore).selectedId;
						if (id) timelineStore.setClip(id, 0, 15);
						uiStore.showToast(`Imported 3D model: ${name}`, 'success');
						continue;
					}
				}
				if (/\.(json|tsf)$/i.test(lower)) {
					const proj = await readProjectFile(file);
					applyProject(proj);
					uiStore.showToast(`Loaded project: ${name}`, 'success');
					continue;
				}
				sceneStore.addTextLayer(`Media: ${name}`);
				const id = get(sceneStore).selectedId;
				if (id) timelineStore.setClip(id, 0, 15);
				uiStore.showToast(`Added layer: ${name}`, 'success');
			} catch {
				uiStore.showToast(`Could not load ${name}`, 'warning');
			}
		}
		input.value = '';
	}

	let menuOpen = $state(false);
	let menuPos = $state({ x: 8, y: 8, above: true });
	let textDraft = $state('');
	let textObjectId: string | null = null;
	let rowsHeight = $state<number | null>(null);
	let resizeStart: { y: number; height: number } | null = null;

	/*
		Centre-playhead scrub state.

		The scroller owns time: `scrollLeft / pxPerSecond` is the playhead time.
		`expectedScrolls` marks scrolls the component wrote itself, so a playback
		frame is never mistaken for the user dragging the timeline.
	*/
	let expectedScrolls: { value: number; at: number }[] = [];
	let scrubTimer: ReturnType<typeof setTimeout> | null = null;
	let scrub: { startX: number; startScroll: number; moved: boolean } | null = null;
	let trimFrame = 0;
	let userScrubbing = false;
	// A finger still on the track owns the scrub until it lifts. The short
	// idle timer is only for wheel/momentum events after the pointer is gone.
	let scrubHold = false;

	const ROWS_STORAGE = 'toon-studio.timeline-rows';

	const timeline = $derived($timelineStore);
	const pps = $derived(timeline.pxPerSecond);
	const contentWidth = $derived(Math.max(240, timeline.duration * pps));
	const frameNow = $derived(Math.round(timeline.currentTime * timeline.frameRate));
	const canDeleteKey = $derived(timeline.selectedKey !== null);

	interface Row {
		id: string;
		name: string;
		type: string;
		icon: string;
		keys: number[];
		strips: NlaStrip[];
		range: LayerRange;
		tint: LayerTint;
		clip: LayerClip | null;
		clippable: boolean;
	}

	/**
	 * Every scene object is a layer, animated or not.
	 *
	 * That is what gives the timeline a CapCut style stack: a new empty layer
	 * still gets a header and a + button, so its first key has a home.
	 */
	const rows = $derived.by((): Row[] => {
		const scene = $sceneStore;
		const result: Row[] = [];
		for (const object of scene.objects) {
			const keys = timeline.keyframes.get(object.id) ?? [];
			const strips = timeline.strips.filter((strip) => strip.objectId === object.id);
			const times = keys.map((key) => key.time);
			const clip = timeline.clips.get(object.id) ?? null;
			const clippable = isClippable(object.type);
			result.push({
				id: object.id,
				name: object.name,
				type: object.type,
				icon: iconForType(object.type),
				keys: times,
				strips,
				range: layerRange(times, strips, timeline.duration, clip, clippable),
				tint: layerTint(object.type),
				clip,
				clippable,
			});
		}
		return result;
	});

	const textObject = $derived(
		$sceneStore.objects.find(
			(object) => object.id === $sceneStore.selectedId && object.type === 'text',
		) ?? null,
	);

	$effect(() => {
		const id = textObject?.id ?? null;
		if (id === textObjectId) return;
		textObjectId = id;
		textDraft = textObject?.text ?? '';
	});

	const selectedStrip = $derived(
		timeline.strips.find((strip) => strip.id === timeline.selectedStripId) ?? null,
	);

	const ticks = $derived.by(() => {
		const step = niceStep(timeline.duration, pps);
		const count = Math.min(240, Math.floor(timeline.duration / step));
		const result: { x: number; label: string }[] = [];
		for (let i = 0; i <= count; i++) {
			const time = i * step;
			result.push({ x: time * pps, label: formatTime(time, step) });
		}
		return result;
	});

	/**
	 * Tick spacing in seconds.
	 *
	 * CapCut keeps labels roughly one thumb apart, so pick the smallest step
	 * whose on-screen gap is readable. Long timelines raise the floor so the
	 * ruler never renders thousands of nodes; the 240 tick cap is a hard stop.
	 */
	function niceStep(duration: number, scale: number): number {
		const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
		let step = steps[steps.length - 1];
		for (const candidate of steps) {
			if (candidate * scale >= 56) {
				step = candidate;
				break;
			}
		}
		const floor = duration / 240;
		if (step < floor) {
			step = steps.find((candidate) => candidate >= floor) ?? floor;
		}
		return step;
	}

	function formatTime(time: number, step: number): string {
		// A one hour strip reads as a clock; short clips keep compact seconds.
		if (timeline.duration >= 60) return formatClock(time, 0);
		if (step >= 1) return `${time.toFixed(0)}s`;
		return `${time.toFixed(step < 0.25 ? 2 : 1)}s`;
	}

	function togglePlay() {
		timelineStore.togglePlay();
	}

	function seek(event: Event) {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		// Scrubbing never pauses playback. `tick` reads isUserScrubbing while
		// the finger is down, then resyncs the wall clock on release.
		timelineStore.setTime(value);
		scrollToTime(value);
	}

	function maxScroll(): number {
		return scroller ? Math.max(0, scroller.scrollWidth - scroller.clientWidth) : 0;
	}

	/**
	 * The only place that moves time under the fixed centre rod.
	 *
	 * Exactly one second is `pxPerSecond` pixels of scroll, with equal empty
	 * space before 0 s and after the last second.
	 */
	function scrollToTime(time: number, scale = pps) {
		if (!scroller) return;
		const target = Math.max(0, Math.min(maxScroll(), time * scale));
		if (Math.abs(scroller.scrollLeft - target) <= 0.5) return;
		expectedScrolls.push({ value: target, at: performance.now() });
		if (expectedScrolls.length > 16) expectedScrolls.shift();
		scroller.scrollLeft = target;
	}

	function releaseUserScrubSoon() {
		if (scrubTimer) clearTimeout(scrubTimer);
		scrubTimer = setTimeout(() => {
			scrubTimer = null;
			if (!userScrubbing || scrubHold) return;
			userScrubbing = false;
			timelineStore.setUserScrubbing(false);
			// Resume playback from the scrubbed pose, not from the old clock.
			timelineStore.resyncClock();
		}, 160);
	}

	function markUserScrub(hold = false) {
		if (hold) {
			scrubHold = true;
			if (scrubTimer) {
				clearTimeout(scrubTimer);
				scrubTimer = null;
			}
		}
		if (!userScrubbing) {
			userScrubbing = true;
			timelineStore.setUserScrubbing(true);
		}
		if (!scrubHold) releaseUserScrubSoon();
	}

	function endUserScrubHold() {
		if (!scrubHold) return;
		scrubHold = false;
		releaseUserScrubSoon();
	}

	/**
	 * A finger or mouse going down on the track is already a scrub, even
	 * before the first scroll event arrives. Marking it here stops a playback
	 * frame from stealing the gesture while the user is still touching it.
	 */
	function beginTrackPointer(event: PointerEvent) {
		if (event.button !== 0) return;
		const target = event.target as HTMLElement | null;
		if (target?.closest('.tl-key, .tl-strip, .tl-trim, .tl-clip, .tl-clip-name, .tl-row-empty, .tl-add-menu, input')) {
			return;
		}
		markUserScrub(true);
	}

	/**
	 * Scroll is the scrub gesture now: whatever sits under the centre rod is
	 * the current time. Writes made by playback or zoom are tagged in
	 * `expectedScrolls` and ignored here, so the two never fight.
	 */
	function onScroll() {
		if (!scroller) return;
		const left = scroller.scrollLeft;
		const cutoff = performance.now() - 400;
		while (expectedScrolls.length && expectedScrolls[0].at < cutoff) expectedScrolls.shift();
		const hit = expectedScrolls.findIndex((entry) => Math.abs(entry.value - left) < 1);
		if (hit >= 0) {
			expectedScrolls.splice(0, hit + 1);
			return;
		}
		const time = Math.max(0, Math.min(timeline.duration, left / pps));
		if (Math.abs(time - timeline.currentTime) < 0.001) return;
		markUserScrub();
		timelineStore.setTime(time);
	}

	/**
	 * With a centre playhead the ruler behaves like a film strip: drag it to
	 * pan, tap it to bring that instant under the rod.
	 */
	function beginScrub(event: PointerEvent) {
		if (event.button !== 0) return;
		event.preventDefault();
		markUserScrub(true);
		scrub = { startX: event.clientX, startScroll: scroller.scrollLeft, moved: false };
		(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
	}

	function moveScrub(event: PointerEvent) {
		if (!scrub) return;
		const dx = event.clientX - scrub.startX;
		if (!scrub.moved && Math.abs(dx) < 4) return;
		scrub.moved = true;
		markUserScrub();
		const next = Math.max(0, Math.min(maxScroll(), scrub.startScroll - dx));
		if (Math.abs(scroller.scrollLeft - next) > 0.5) scroller.scrollLeft = next;
	}

	function endScrub(event: PointerEvent) {
		if (!scrub) return;
		const state = scrub;
		scrub = null;
		(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
		if (!state.moved) {
			const time = timeAt(event.clientX);
			timelineStore.setTime(time);
			scrollToTime(time);
		}
		endUserScrubHold();
	}

	function scrubKey(event: KeyboardEvent) {
		const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
		if (!direction) return;
		event.preventDefault();
		const step = event.shiftKey ? 1 : 1 / timeline.frameRate;
		const time = Math.max(
			0,
			Math.min(timeline.duration, timeline.currentTime + direction * step),
		);
		timelineStore.setTime(time);
		scrollToTime(time);
	}

	/** The time under a client x, measured from the fixed centre rod. */
	function timeAt(clientX: number): number {
		if (!scroller || !scroller.clientWidth) return timeline.currentTime;
		const rect = scroller.getBoundingClientRect();
		const centre = rect.left + scroller.clientWidth / 2;
		return Math.max(
			0,
			Math.min(timeline.duration, (scroller.scrollLeft + clientX - centre) / pps),
		);
	}

	/** Puts current time under the centre rod on every time, zoom or resize. */
	$effect(() => {
		const now = timeline.currentTime;
		const scale = pps;
		const duration = timeline.duration;
		const scrubbing = timeline.isUserScrubbing;
		if (!scroller || scrubbing) return;
		scrollToTime(Math.min(now, duration), scale);
	});

	/** Fits the whole duration into the visible width. */
	function fit() {
		if (!scroller) return;
		const width = Math.max(120, scroller.clientWidth);
		const scale = Math.max(4, Math.min(400, width / Math.max(timeline.duration, 0.1)));
		timelineStore.setPxPerSecond(scale);
		requestAnimationFrame(() => scrollToTime(timeline.currentTime, scale));
	}

	function selectStrip(id: string, event: Event) {
		event.stopPropagation();
		timelineStore.selectStrip(id);
	}

	function beginTrim(strip: NlaStrip, edge: 'start' | 'end', event: PointerEvent) {
		event.stopPropagation();
		event.preventDefault();
		timelineStore.selectStrip(strip.id);
		sceneStore.beginAnimationEdit();
		const origin = event.clientX;
		const startValue = edge === 'start' ? strip.start : strip.end;
		const handle = event.currentTarget as HTMLElement;
		handle.setPointerCapture?.(event.pointerId);
		const onMove = (moveEvent: PointerEvent) => {
			const delta = (moveEvent.clientX - origin) / pps;
			timelineStore.updateStrip(strip.id, {
				[edge]: Math.max(0, Math.min(MAX_TIMELINE_SECONDS, startValue + delta)),
			});
		};
		const onUp = () => {
			handle.removeEventListener('pointermove', onMove);
			handle.removeEventListener('pointerup', onUp);
			handle.removeEventListener('pointercancel', onUp);
			sceneStore.endAnimationEdit();
		};
		handle.addEventListener('pointermove', onMove);
		handle.addEventListener('pointerup', onUp);
		handle.addEventListener('pointercancel', onUp);
	}

	function addStrip() {
		const id = $sceneStore.selectedId;
		if (!id) {
			uiStore.showToast('Select an object first.', 'warning');
			return;
		}
		sceneStore.animationEdit(() => {
			timelineStore.addStrip(id, timeline.currentTime);
		});
	}

	function splitStrip() {
		if (!selectedStrip) return;
		sceneStore.animationEdit(() => timelineStore.splitStripAtPlayhead(selectedStrip!.id));
	}

	function duplicateStrip() {
		if (!selectedStrip) return;
		sceneStore.animationEdit(() => timelineStore.duplicateStrip(selectedStrip!.id));
	}

	function reverseStrip() {
		if (!selectedStrip) return;
		sceneStore.animationEdit(() => timelineStore.reverseStrip(selectedStrip!.id));
	}

	function toggleFreeze() {
		if (!selectedStrip) return;
		sceneStore.animationEdit(() => timelineStore.freezeStrip(selectedStrip!.id));
	}

	function changeSpeed(delta: number) {
		if (!selectedStrip) return;
		sceneStore.animationEdit(() =>
			timelineStore.setStripSpeed(selectedStrip!.id, selectedStrip!.speed + delta),
		);
	}

	function removeStrip() {
		if (!selectedStrip) return;
		sceneStore.animationEdit(() => timelineStore.removeStrip(selectedStrip!.id));
	}

	function setInterpolation(interpolation: 'constant' | 'linear' | 'bezier') {
		const id = $sceneStore.selectedId;
		if (!id) {
			uiStore.showToast('Select an object first.', 'warning');
			return;
		}
		sceneStore.animationEdit(() => {
			for (const path of [
				'location.x',
				'location.y',
				'location.z',
				'rotation_quaternion.w',
				'rotation_quaternion.x',
				'rotation_quaternion.y',
				'rotation_quaternion.z',
				'scale.x',
				'scale.y',
				'scale.z',
			] as const) {
				timelineStore.setInterpolation(id, path, interpolation);
			}
		});
	}

	function zoom(delta: number) {
		const scale = Math.max(4, Math.min(400, pps + delta));
		timelineStore.setPxPerSecond(scale);
		requestAnimationFrame(() => scrollToTime(timeline.currentTime, scale));
	}

	function addKey() {
		const id = $sceneStore.selectedId;
		if (!id) {
			uiStore.showToast('Select an object first.', 'warning');
			return;
		}
		const object = get(sceneStore).objects.find((item) => item.id === id);
		if (!object) {
			uiStore.showToast('The selected object no longer exists.', 'warning');
			return;
		}
		const placed = sceneStore.recordKeyframe(id);
		sceneStore.selectObject(id);
		uiStore.showToast(`Key added at ${placed.toFixed(2)}s.`, 'success');
	}

	function goToStart() {
		timelineStore.goToStart();
		scrollToTime(0);
	}

	/** Opens the add-layer menu under the button that was tapped. */
	function openLayerMenu(event: MouseEvent) {
		const button = event.currentTarget as HTMLElement;
		const panel = button.closest('.tl-panel') as HTMLElement | null;
		if (!panel) return;
		// The menu lives beside the clipped timeline stage, so it is measured
		// against the panel and can never be cut off by the stage's overflow.
		const rect = button.getBoundingClientRect();
		const panelRect = panel.getBoundingClientRect();
		const width = 232;
		const height = 150;
		const x = Math.min(
			Math.max(8, rect.left - panelRect.left),
			Math.max(8, panelRect.width - width - 8),
		);
		const above = button.closest('.tl-body')
			? rect.top - panelRect.top > height + 12
			: true;
		const y = above ? rect.top - panelRect.top - 8 : rect.bottom - panelRect.top + 8;
		menuPos = { x, y, above };
		menuOpen = !menuOpen;
	}

	function addTextLayer() {
		menuOpen = false;
		sceneStore.addTextLayer('New text');
		uiStore.showToast('Text layer added. Type the caption in the text bar.', 'success');
	}

	async function pickImageLayer(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		input.value = '';
		menuOpen = false;
		if (!file) return;
		try {
			const image = await readLayerImage(file);
			if (!image) {
				uiStore.showToast('That file is not a readable image.', 'warning');
				return;
			}
			sceneStore.addImageLayer(image.dataUrl, image.width, image.height, file.name);
			uiStore.showToast('Image layer added.', 'success');
		} catch {
			uiStore.showToast('The image could not be read.', 'error');
		}
	}

	function commitText() {
		if (!textObject) return;
		const next = textDraft.replace(/\s+/g, ' ').trim();
		if (!next) {
			textDraft = textObject.text ?? '';
			return;
		}
		if (next === textObject.text) {
			textDraft = next;
			return;
		}
		textDraft = next;
		sceneStore.setTextContent(textObject.id, next);
	}

	function maxRowsHeight(): number {
		if (typeof window === 'undefined') return 112;
		return Math.round(Math.min(680, Math.max(88, window.innerHeight * (window.innerWidth < 640 ? 0.5 : 0.62))));
	}

	function clampRows(value: number): number {
		return Math.round(Math.min(maxRowsHeight(), Math.max(64, value)));
	}

	function rememberRows() {
		if (typeof localStorage === 'undefined') return;
		try {
			if (rowsHeight === null) localStorage.removeItem(ROWS_STORAGE);
			else localStorage.setItem(ROWS_STORAGE, String(rowsHeight));
		} catch {
			// Private browsing can reject writes; the layout still works this session.
		}
	}

	function beginResize(event: PointerEvent) {
		if (event.button !== 0) return;
		event.preventDefault();
		const height = rowsEl?.clientHeight ?? 112;
		rowsHeight = clampRows(height);
		resizeStart = { y: event.clientY, height };
		const handle = event.currentTarget as HTMLElement;
		handle.setPointerCapture?.(event.pointerId);
		const onMove = (moveEvent: PointerEvent) => {
			if (!resizeStart) return;
			rowsHeight = clampRows(resizeStart.height + (resizeStart.y - moveEvent.clientY));
		};
		const onUp = () => {
			handle.removeEventListener('pointermove', onMove);
			handle.removeEventListener('pointerup', onUp);
			handle.removeEventListener('pointercancel', onUp);
			resizeStart = null;
			rememberRows();
		};
		handle.addEventListener('pointermove', onMove);
		handle.addEventListener('pointerup', onUp);
		handle.addEventListener('pointercancel', onUp);
	}

	function resizeKey(event: KeyboardEvent) {
		const current = rowsHeight ?? rowsEl?.clientHeight ?? 112;
		if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
			event.preventDefault();
			rowsHeight = clampRows(current + (event.key === 'ArrowUp' ? 18 : -18));
			rememberRows();
		} else if (event.key === 'Home') {
			event.preventDefault();
			rowsHeight = null;
			rememberRows();
		}
	}

	onMount(() => {
		try {
			const stored = Number(localStorage.getItem(ROWS_STORAGE));
			if (Number.isFinite(stored) && stored > 0) rowsHeight = clampRows(stored);
		} catch {
			// Storage may be unavailable; keep the responsive default height.
		}
		const onWindowResize = () => {
			if (rowsHeight !== null) rowsHeight = clampRows(rowsHeight);
		};
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target as HTMLElement | null;
			if (target?.closest('.tl-layer-menu-trigger, .tl-row-empty')) return;
			if (menuOpen && menuWrap && !menuWrap.contains(event.target as Node)) menuOpen = false;
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') menuOpen = false;
		};
		const onPointerUp = () => endUserScrubHold();
		window.addEventListener('resize', onWindowResize);
		window.addEventListener('pointerdown', onPointerDown);
		window.addEventListener('pointerup', onPointerUp);
		window.addEventListener('pointercancel', onPointerUp);
		window.addEventListener('keydown', onKeyDown);

		scroller.addEventListener('scroll', onScroll, { passive: true });
		const centerOnResize = () => {
			if (!scroller.clientWidth) return;
			scrollToTime(timeline.currentTime);
		};
		const observer =
			typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(centerOnResize);
		observer?.observe(scroller);
		requestAnimationFrame(() => scrollToTime(timeline.currentTime));

		return () => {
			window.removeEventListener('resize', onWindowResize);
			window.removeEventListener('pointerdown', onPointerDown);
			window.removeEventListener('pointerup', onPointerUp);
			window.removeEventListener('pointercancel', onPointerUp);
			window.removeEventListener('keydown', onKeyDown);
			scroller.removeEventListener('scroll', onScroll);
			observer?.disconnect();
			if (scrubTimer) clearTimeout(scrubTimer);
		};
	});

	onDestroy(() => {
		scrubHold = false;
		if (trimFrame) cancelAnimationFrame(trimFrame);
		if (scrubTimer) clearTimeout(scrubTimer);
		if (userScrubbing) timelineStore.setUserScrubbing(false);
	});

	function deleteKey() {
		if (!timeline.selectedKey) {
			uiStore.showToast('Select a keyframe first.', 'warning');
			return;
		}
		sceneStore.animationEdit(() => timelineStore.deleteSelectedKey());
	}

	function isKeySelected(objectId: string, time: number): boolean {
		if ((timeline.selectedKeys ?? []).some((sk) => sk.objectId === objectId && Math.abs(sk.time - time) < 0.001)) {
			return true;
		}
		const selected = timeline.selectedKey;
		return selected !== null && selected.objectId === objectId && Math.abs(selected.time - time) < 0.001;
	}

	/** The key currently being dragged, so one drag makes one undo entry. */
	let keyDrag: { objectId: string; origin: number; from: number; startX: number; moved: boolean } | null = null;

	function beginKeyDrag(objectId: string, time: number, event: PointerEvent) {
		if (event.button !== 0) return;
		event.stopPropagation();
		event.preventDefault();
		// Tapping a key selects it and parks the playhead on the pose.
		const additive = event.shiftKey || event.ctrlKey || event.metaKey || timeline.multiSelectMode;
		sceneStore.selectObject(objectId);
		timelineStore.selectKeyframe(objectId, time, additive);
		keyDrag = { objectId, origin: time, from: time, startX: event.clientX, moved: false };
		const handle = event.currentTarget as HTMLElement;
		handle.setPointerCapture?.(event.pointerId);

		const onMove = (moveEvent: PointerEvent) => {
			const drag = keyDrag;
			if (!drag || drag.objectId !== objectId) return;
			// A few pixels of finger travel still count as a tap.
			if (!drag.moved && Math.abs(moveEvent.clientX - drag.startX) < 4) return;
			if (!drag.moved) {
				drag.moved = true;
				sceneStore.beginAnimationEdit();
			}
			const to = roundTime(
				Math.min(timeline.duration, Math.max(0, drag.origin + (moveEvent.clientX - drag.startX) / pps)),
			);
			if (Math.abs(to - drag.from) < 1e-4) return;
			timelineStore.moveKeyframe(objectId, drag.from, to);
			drag.from = to;
		};

		const onUp = () => {
			handle.removeEventListener('pointermove', onMove);
			handle.removeEventListener('pointerup', onUp);
			handle.removeEventListener('pointercancel', onUp);
			if (keyDrag?.moved) sceneStore.endAnimationEdit();
			keyDrag = null;
			handle.releasePointerCapture?.(event.pointerId);
		};

		handle.addEventListener('pointermove', onMove);
		handle.addEventListener('pointerup', onUp);
		handle.addEventListener('pointercancel', onUp);
	}

	/** Drags one edge of a layer clip; one drag is one undo entry. */
	function beginClipTrim(row: Row, edge: 'start' | 'end', event: PointerEvent) {
		if (event.button !== 0) return;
		event.stopPropagation();
		event.preventDefault();
		sceneStore.selectObject(row.id);
		const handle = event.currentTarget as HTMLElement;
		handle.setPointerCapture?.(event.pointerId);
		sceneStore.beginAnimationEdit();
		// The first trim turns the derived range into stored clip data.
		if (!row.clip) timelineStore.setClip(row.id, row.range.start, row.range.end);

		const origin = event.clientX;
		const startScroll = scroller?.scrollLeft ?? 0;
		const base = row.range;
		let pointerX = event.clientX;
		let finished = false;

		/**
		 * The grab point plus any distance the view scrolled meanwhile. That is
		 * what makes the handle follow the finger while the timeline rolls
		 * under it, so a 3 s clip can be stretched to the one hour ceiling in one
		 * continuous gesture.
		 */
		function apply() {
			const delta = ((pointerX - origin) + ((scroller?.scrollLeft ?? startScroll) - startScroll)) / pps;
			if (edge === 'start') {
				const start = Math.min(base.end - 0.2, Math.max(0, base.start + delta));
				timelineStore.setClip(row.id, start, base.end);
				return;
			}
			const requested = Math.max(base.start + 0.2, base.end + delta);
			const end = Math.min(MAX_TIMELINE_SECONDS, requested);
			// setClip clamps to the current duration, so grow the timeline first.
			if (end > get(timelineStore).duration) timelineStore.setDuration(end);
			timelineStore.setClip(row.id, base.start, end);
		}

		/** Rolls the strip when the finger reaches an edge, like CapCut. */
		function autoScroll() {
			trimFrame = 0;
			if (finished || !scroller) return;
			const rect = scroller.getBoundingClientRect();
			const margin = 48;
			// Faster than a plain scroll so a one hour extension is reachable.
			const boost = Math.max(6, Math.round(pps * 0.5));
			let speed = 0;
			if (pointerX > rect.right - margin) {
				speed = boost + Math.ceil((pointerX - (rect.right - margin)) / 4);
			} else if (pointerX < rect.left + margin) {
				speed = -(boost + Math.ceil((rect.left + margin - pointerX) / 4));
			}
			if (!speed) return;
			const before = scroller.scrollLeft;
			const next = Math.max(0, Math.min(maxScroll(), before + speed));
			if (Math.abs(next - before) < 0.5) return;
			markUserScrub();
			scroller.scrollLeft = next;
			apply();
			trimFrame = requestAnimationFrame(autoScroll);
		}

		markUserScrub(true);
		const onMove = (moveEvent: PointerEvent) => {
			pointerX = moveEvent.clientX;
			markUserScrub();
			apply();
			if (!trimFrame) trimFrame = requestAnimationFrame(autoScroll);
		};
		const onUp = () => {
			finished = true;
			if (trimFrame) cancelAnimationFrame(trimFrame);
			trimFrame = 0;
			handle.removeEventListener('pointermove', onMove);
			handle.removeEventListener('pointerup', onUp);
			handle.removeEventListener('pointercancel', onUp);
			sceneStore.endAnimationEdit();
			handle.releasePointerCapture?.(event.pointerId);
			endUserScrubHold();
		};
		handle.addEventListener('pointermove', onMove);
		handle.addEventListener('pointerup', onUp);
		handle.addEventListener('pointercancel', onUp);
	}

	/** The layer being dragged along the timeline, so one drag is one undo step. */
	let layerDrag: { id: string; startX: number; applied: number; moved: boolean } | null = null;

	/**
	 * Drags the whole layer in time.
	 *
	 * Every key and strip moves together, so the bar keeps its shape. The bar
	 * cannot leave the timeline: the shift is clamped by the store, and the
	 * drag stops at the edges instead of piling keys on top of each other.
	 */
	function beginLayerDrag(row: Row, event: PointerEvent) {
		if (event.button !== 0) return;
		const target = event.target as HTMLElement;
		if (target.closest('.tl-key, .tl-strip, .tl-trim, .tl-clip-trim')) return;
		const selected = get(sceneStore).selectedId === row.id;
		/*
			A finger swipe over an unselected layer is a timeline pan, not a
			clip grab. Otherwise the bar captures the pointer and the strip
			feels locked. Tap once to select, then drag the selected bar.
		*/
		if ((event.pointerType === 'touch' || event.pointerType === 'pen') && !selected) {
			return;
		}
		sceneStore.selectObject(row.id);
		if (!row.keys.length && !row.strips.length && !row.clippable) return;
		event.preventDefault();

		const handle = event.currentTarget as HTMLElement;
		handle.setPointerCapture?.(event.pointerId);
		layerDrag = { id: row.id, startX: event.clientX, applied: 0, moved: false };
		const minDelta = -row.range.start;
		const maxDelta = timeline.duration - row.range.end;

		const onMove = (moveEvent: PointerEvent) => {
			const drag = layerDrag;
			if (!drag || drag.id !== row.id) return;
			if (!drag.moved && Math.abs(moveEvent.clientX - drag.startX) < 4) return;
			if (!drag.moved) {
				drag.moved = true;
				sceneStore.beginAnimationEdit();
				// A media layer with no animation yet gets a real clip the moment
				// the drag begins, so the bar position is data from here on.
				if (!row.clip) timelineStore.setClip(row.id, row.range.start, row.range.end);
			}
			const raw = (moveEvent.clientX - drag.startX) / pps;
			const delta = Math.min(maxDelta, Math.max(minDelta, roundTime(raw)));
			if (Math.abs(delta - drag.applied) < 1e-4) return;
			timelineStore.shiftLayer(row.id, delta - drag.applied);
			// Layer stays anchored at 00:00; horizontal drag scrubs timelineScroller.scrollLeft
			drag.applied = delta;
		};

		const onUp = () => {
			handle.removeEventListener('pointermove', onMove);
			handle.removeEventListener('pointerup', onUp);
			handle.removeEventListener('pointercancel', onUp);
			if (layerDrag?.moved) sceneStore.endAnimationEdit();
			layerDrag = null;
			handle.releasePointerCapture?.(event.pointerId);
		};

		handle.addEventListener('pointermove', onMove);
		handle.addEventListener('pointerup', onUp);
		handle.addEventListener('pointercancel', onUp);
	}
</script>

<div id="timelinePanel" class="tl-panel" role="region" aria-label="Animation timeline" data-testid="timeline">
	<div class="tl-head">
		<div class="tl-head-left">
			<button type="button" class="tl-mini-icon" id="tl-btn-step-prev" onclick={() => timelineStore.prevFrame()} title="Step Back">
				<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
			</button>
			<button
				type="button"
				id="pp"
				class="tl-play"
				onclick={togglePlay}
				aria-label={timeline.playing ? "Pause" : "Play"}
				aria-pressed={timeline.playing}
				data-testid="play"
				title="Play / Pause (Space)"
			>
				{@html timeline.playing ? ICONS.pause : ICONS.play}
			</button>
			<button type="button" class="tl-mini-icon" id="tl-btn-step-next" onclick={() => timelineStore.nextFrame()} title="Step Forward">
				<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="m6 18 8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
			</button>
			<div id="tt" class="tl-time" data-testid="timeline-time">{formatClock(timeline.currentTime, 0)}</div>
		</div>
		<div class="tl-head-right">
			<button type="button" class="tl-mini-icon" id="tl-btn-add-key" onclick={addKey} data-testid="timeline-add-key" title="Add Keyframe (K)">
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 3 20 12 12 21 4 12 12 3"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
			</button>
			<button type="button" class="tl-mini-icon" id="tl-btn-del-key" onclick={deleteKey} disabled={!canDeleteKey} data-testid="timeline-delete-key" title="Delete Keyframe">
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 3 20 12 12 21 4 12 12 3"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
			</button>
			<button type="button" class="tl-mini-icon" id="tl-btn-zoom-out" onclick={() => zoom(-10)} data-testid="timeline-zoom-out" title="Zoom Out">
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
			</button>
			<button type="button" class="tl-mini-icon" id="tl-btn-zoom-in" onclick={() => zoom(10)} data-testid="timeline-zoom-in" title="Zoom In">
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
			</button>
			<button type="button" class="tl-mini-icon" id="tl-btn-undo" onclick={() => sceneStore.undo()} title="Undo">
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>
			</button>
			<button type="button" class="tl-mini-icon" id="tl-btn-redo" onclick={() => sceneStore.redo()} title="Redo">
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13"/></svg>
			</button>
		</div>
	</div>

	<div id="tl-clip-actions" class="tl-clip-actions" data-testid="clip-actions-bar">
		<button type="button" class="tl-action-btn" onclick={actSplitClip} data-testid="action-split" title="Split Clip at Playhead"><span>Split</span></button>
		<button type="button" class="tl-action-btn" class:on={subDrawerMode === 'speed'} onclick={() => (subDrawerMode = subDrawerMode === 'speed' ? null : 'speed')} data-testid="action-speed" title="Speed Multiplier"><span>Speed</span></button>
		<button type="button" class="tl-action-btn" onclick={actReverseClip} data-testid="action-reverse" title="Reverse Clip Motion"><span>Reverse</span></button>
		<button type="button" class="tl-action-btn" onclick={actFreezeClip} data-testid="action-freeze" title="Freeze Frame (2s)"><span>Freeze</span></button>
		<button type="button" class="tl-action-btn" onclick={actDuplicateClip} data-testid="action-duplicate" title="Duplicate Layer"><span>Duplicate</span></button>
		<button type="button" class="tl-action-btn" onclick={() => timelineStore.copySelectedKeys($sceneStore.selectedId ?? undefined)} data-testid="action-copy" title="Copy Layer & Keys"><span>Copy</span></button>
		<button type="button" class="tl-action-btn" onclick={() => sceneStore.animationEdit(() => timelineStore.pasteKeysAtPlayhead($sceneStore.selectedId ?? undefined))} data-testid="action-paste" title="Paste at Playhead"><span>Paste</span></button>
		<button type="button" class="tl-action-btn" class:on={subDrawerMode === 'opacity'} onclick={() => (subDrawerMode = subDrawerMode === 'opacity' ? null : 'opacity')} data-testid="action-opacity" title="Opacity Slider & Keyframe"><span>Opacity</span></button>
		<button type="button" class="tl-action-btn" class:on={subDrawerMode === 'replace'} onclick={() => (subDrawerMode = subDrawerMode === 'replace' ? null : 'replace')} data-testid="action-replace" title="Replace Shape / Media"><span>Replace</span></button>
		<button type="button" class="tl-action-btn danger" onclick={actDeleteLayer} data-testid="action-delete" title="Delete Layer"><span>Delete</span></button>
		<button type="button" class="tl-action-btn" onclick={() => uiStore.openDialog('save')} data-testid="action-save" title="Save Project (.tsf.json)"><span>Save</span></button>
		<button type="button" class="tl-action-btn" class:on={subDrawerMode === 'camera'} onclick={() => (subDrawerMode = subDrawerMode === 'camera' ? null : 'camera')} data-testid="action-camera-track" title="Camera Tracking & Controls"><span>Camera Track</span></button>
		<button type="button" class="tl-action-btn" class:on={$viewportStore.viewThroughCamera} onclick={actToggleCamView} data-testid="action-camera-view" title="Toggle View Through Active Camera"><span>View Cam</span></button>
	</div>

	{#if subDrawerMode === 'speed'}
		<div id="tl-sub-drawer" class="tl-sub-drawer" data-testid="clip-sub-drawer">
			<span>Speed:</span>
			{#each [0.25, 0.5, 1.0, 1.5, 2.0, 4.0, 8.0] as spd}
				<button type="button" class="sub-chip" class:on={Math.abs(speedVal - spd) < 0.01} onclick={() => actApplySpeed(spd)}>{spd}x</button>
			{/each}
			<input type="range" min="0.1" max="8.0" step="0.1" value={speedVal} oninput={(e) => actApplySpeed(Number(e.currentTarget.value))} style="width:72px;" />
			<span>{speedVal.toFixed(2)}x</span>
			<button type="button" class="sub-chip" onclick={() => (subDrawerMode = null)}>✕</button>
		</div>
	{:else if subDrawerMode === 'opacity'}
		<div id="tl-sub-drawer" class="tl-sub-drawer" data-testid="clip-sub-drawer">
			<span>Opacity:</span>
			<input type="range" min="0" max="100" step="1" value={opacityVal} oninput={(e) => actOpacity(Number(e.currentTarget.value))} style="width:110px;" />
			<span>{opacityVal}%</span>
			{#each [0, 50, 100] as op}
				<button type="button" class="sub-chip" onclick={() => actOpacity(op)}>{op}%</button>
			{/each}
			<button type="button" class="sub-chip" onclick={() => (subDrawerMode = null)}>✕</button>
		</div>
	{:else if subDrawerMode === 'replace'}
		<div id="tl-sub-drawer" class="tl-sub-drawer" data-testid="clip-sub-drawer">
			<span>Replace Shape:</span>
			{#each [['cube', 'Cube'], ['sphere', 'Sphere'], ['cylinder', 'Cylinder'], ['cone', 'Cone'], ['torus', 'Torus'], ['plane', 'Plate'], ['coin', 'Gol Plate']] as [type, lbl]}
				<button type="button" class="sub-chip" onclick={() => actReplaceShape(type)}>{lbl}</button>
			{/each}
			<button type="button" class="sub-chip" onclick={() => universalInput?.click()}>Upload File</button>
			<button type="button" class="sub-chip" onclick={() => (subDrawerMode = null)}>✕</button>
		</div>
	{:else if subDrawerMode === 'camera'}
		{@const camObj = $sceneStore.objects.find((o) => o.id === $sceneStore.selectedId && o.type.startsWith('camera')) ?? $sceneStore.objects.find((o) => o.type.startsWith('camera'))}
		{@const cProps = camObj?.cameraProps ?? { fov: 50, targetId: null, trackingMode: 'look_at' }}
		{@const trackTargets = $sceneStore.objects.filter((o) => o.id !== camObj?.id && !o.type.startsWith('camera') && !o.type.startsWith('light'))}
		<div id="tl-sub-drawer" class="tl-sub-drawer" data-testid="clip-sub-drawer">
			<span>Track Target:</span>
			<select
				class="tl-select"
				value={cProps.targetId ?? ''}
				onchange={(e) => {
					const val = e.currentTarget.value || null;
					if (camObj) {
						sceneStore.setCameraProps(camObj.id, { targetId: val, trackingMode: val ? (cProps.trackingMode === 'none' ? 'look_at' : cProps.trackingMode) : 'none' });
						sceneStore.updateCameraTracking(0.016, timeline.currentTime);
					}
				}}
				data-testid="camera-target-select"
			>
				<option value="">None (Free Direction)</option>
				{#each trackTargets as tObj}
					<option value={tObj.id}>{tObj.name}</option>
				{/each}
			</select>
			<span>Mode:</span>
			{#each [['look_at', 'Look-At'], ['follow', 'Follow'], ['orbit', 'Orbit'], ['none', 'Free']] as [mKey, mLbl]}
				<button
					type="button"
					class="sub-chip"
					class:on={cProps.trackingMode === mKey}
					onclick={() => {
						if (camObj) {
							sceneStore.setCameraProps(camObj.id, { trackingMode: mKey as any });
							sceneStore.updateCameraTracking(0.016, timeline.currentTime);
						}
					}}
				>{mLbl}</button>
			{/each}
			<span>Lens:</span>
			{#each [24, 35, 50, 85, 135] as mm}
				<button
					type="button"
					class="sub-chip"
					onclick={() => {
						if (camObj) sceneStore.setCameraProps(camObj.id, { fov: Math.round(focalLengthToFOV(mm)) });
					}}
				>{mm}mm</button>
			{/each}
			<button type="button" class="sub-chip" onclick={() => (subDrawerMode = null)}>✕</button>
		</div>
	{/if}

	{#if textObject}
		<div class="tl-textbar">
			<span class="tl-text-label">{@html ICONS.text}<span>Text</span></span>
			<input
				class="tl-text-input"
				type="text"
				value={textDraft}
				oninput={(event) => (textDraft = event.currentTarget.value)}
				onchange={commitText}
				onkeydown={(event) => {
					if (event.key === 'Enter') event.currentTarget.blur();
				}}
				aria-label="Text layer caption"
				placeholder="Caption"
				maxlength="200"
				data-testid="text-layer-input"
			/>
			<span class="tl-text-hint">Press Enter to bake the layer texture</span>
		</div>
	{/if}

	<div
		class="tl-resize"
		role="slider"
		tabindex="0"
		aria-label="Timeline layer height"
		aria-orientation="vertical"
		aria-valuemin="64"
		aria-valuemax={maxRowsHeight()}
		aria-valuenow={rowsHeight ?? 112}
		onpointerdown={beginResize}
		onkeydown={resizeKey}
		title="Drag to resize the layer timeline"
		data-testid="timeline-resize"
	><span></span></div>

	<div class="tl-body" style="--tl-rows-h: {rowsHeight === null ? 'min(112px, 16vh)' : `${rowsHeight}px`};">
		<div
			id="timelineScroller"
			class="tl-scroller"
			bind:this={scroller}
			role="group"
			aria-label="Timeline track"
			onpointerdown={beginTrackPointer}
		>
			<div
				class="tl-inner"
				style:min-width={timeline.duration >= MAX_TIMELINE_SECONDS
					? `calc(${MAX_TIMELINE_SECONDS * pps}px)`
					: null}
			>
				<div class="tl-content" style="width: {contentWidth}px;">
					<div
						class="tl-ruler"
						role="slider"
						tabindex="0"
						aria-label="Playhead"
						aria-valuemin="0"
						aria-valuemax={$timelineStore.duration}
						aria-valuenow={$timelineStore.currentTime}
						onpointerdown={beginScrub}
						onpointermove={moveScrub}
						onpointerup={endScrub}
						onpointercancel={endScrub}
						onkeydown={scrubKey}
					>
						{#each ticks as tick}
							<span class="tl-tick" style="left: {tick.x}px">{tick.label}</span>
						{/each}
					</div>

					<div class="tl-rows" bind:this={rowsEl}>
						{#each rows as row}
							<div class="tl-row" data-testid="timeline-row">
								<div
									class="tl-clip"
									class:selected={row.id === $sceneStore.selectedId}
									class:movable={row.clippable || row.keys.length > 0 || row.strips.length > 0}
									role="group"
									aria-label="Drag {row.name} in time"
									title="Drag to move {row.name} in time. Drag the white edges to trim or extend it."
									style="left: {row.range.start * pps}px; width: {Math.max(30, (row.range.end - row.range.start) * pps)}px; --clip: {row.tint.bar}; --clip-edge: {row.tint.edge};"
									onpointerdown={(event) => beginLayerDrag(row, event)}
								>
									{#if row.clippable}
										<button
											type="button"
											class="tl-clip-trim left"
											aria-label="Trim the start of {row.name}"
											title="Drag to trim the start"
											onpointerdown={(event) => beginClipTrim(row, 'start', event)}
											data-testid="clip-trim-start"
										></button>
									{/if}
									<button
										class="tl-clip-name"
										onclick={() => sceneStore.selectObject(row.id)}
										title="Select {row.name}"
										aria-label="Select {row.name}"
										data-testid="timeline-row-name"
									>
										<span class="tl-row-icon">{@html ICONS[row.icon] ?? ICONS.cube}</span>
										<span class="tl-row-label">{row.name}</span>
									</button>
									<span class="tl-dur-badge" data-testid="clip-duration-badge">{Math.max(0.2, row.range.end - row.range.start).toFixed(1)}s</span>
									<button type="button" class="tl-track-ib" title="Add Key at Playhead" onclick={(e) => { e.stopPropagation(); sceneStore.selectObject(row.id); addKey(); }} data-testid="timeline-layer-add">+</button>
									{#if row.clippable}
										<button
											type="button"
											class="tl-clip-trim right"
											aria-label="Trim the end of {row.name}"
											title="Drag to trim or extend to the one hour limit"
											onpointerdown={(event) => beginClipTrim(row, 'end', event)}
											data-testid="clip-trim-end"
										></button>
									{/if}
								</div>

								{#each row.keys as key}
									<button
										class="tl-key"
										class:on={isKeySelected(row.id, key)}
										style="left: {key * pps}px"
										aria-label="Key at {key.toFixed(2)} seconds"
										aria-pressed={isKeySelected(row.id, key)}
										title="{key.toFixed(2)}s"
										onpointerdown={(event) => beginKeyDrag(row.id, key, event)}
										data-testid="timeline-key"
									></button>
								{/each}

								{#each row.strips as strip}
									<div
										class="tl-strip"
										class:on={strip.id === timeline.selectedStripId}
										style="left: {strip.start * pps}px; width: {Math.max(6, (strip.end - strip.start) * pps)}px;"
										role="button"
										tabindex="0"
										aria-label={strip.name}
										onclick={(event) => selectStrip(strip.id, event)}
										onkeydown={(event) => {
											if (event.key === 'Enter' || event.key === ' ') selectStrip(strip.id, event);
										}}
										data-testid="nla-strip"
									>
										<span
											class="tl-trim"
											role="separator"
											aria-label="Trim the start of the strip"
											onpointerdown={(event) => beginTrim(strip, 'start', event)}
											data-testid="nla-trim-start"
										></span>
										<span class="tl-strip-name">{strip.name}</span>
										<span
											class="tl-trim right"
											role="separator"
											aria-label="Trim the end of the strip"
											onpointerdown={(event) => beginTrim(strip, 'end', event)}
											data-testid="nla-trim-end"
										></span>
									</div>
								{/each}
							</div>
						{/each}
						{#if !rows.length}
							<button class="tl-row-empty tl-layer-menu-trigger" onclick={openLayerMenu} aria-haspopup="menu" aria-expanded={menuOpen} data-testid="timeline-add-layer">
								{@html ICONS.plus}<span>Add a text or image layer</span>
							</button>
						{/if}
					</div>
				</div>
			</div>
		</div>
		<div class="center-playhead-rod" aria-hidden="true" data-testid="timeline-playhead"></div>
		<button type="button" id="tl-upload-plus" class="tl-upload-plus" data-testid="timeline-upload-plus" title="Upload Any File (Video, Image, Audio, .OBJ, .STL, .JSON, etc.)" onclick={() => universalInput?.click()}>+</button>
		<input id="tl-universal-file" type="file" multiple accept="*/*" style="display:none;" bind:this={universalInput} onchange={handleUniversalUpload} data-testid="timeline-file-input" />
		<input
			class="tl-file"
			type="file"
			accept="image/*"
			bind:this={layerInput}
			onchange={pickImageLayer}
			data-testid="layer-image-input"
		/>
	</div>

	{#if menuOpen}
		<div
			class="tl-add-menu"
			class:above={menuPos.above}
			style="left: {menuPos.x}px; top: {menuPos.y}px;"
			bind:this={menuWrap}
			role="menu"
			aria-label="Add layer"
		>
			<button role="menuitem" onclick={addTextLayer} data-testid="add-text-layer">
				{@html ICONS.text}<span>Text layer</span>
			</button>
			<button role="menuitem" onclick={() => layerInput?.click()} data-testid="add-image-layer">
				{@html ICONS.photo}<span>Image layer</span>
			</button>
			<button
				role="menuitem"
				disabled
				title="Video layers need local media storage, which this build does not have."
				data-testid="add-video-layer"
			>
				{@html ICONS.video}<span>Video layer</span><em>unsupported</em>
			</button>
			<p class="tl-add-note">Text and image layers become textured planes in the scene.</p>
		</div>
	{/if}

	<input
		id="scrub"
		type="range"
		min="0"
		max={timeline.duration}
		step="0.01"
		value={timeline.currentTime}
		oninput={seek}
		aria-label="Timeline position"
		data-testid="timeline-scrub"
	/>
</div>

<style>
	.tl-panel {
		--tl-gutter: 8px;
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 6px var(--tl-gutter) 8px;
		border-top: 1px solid var(--ln);
		background: var(--gl);
	}

	/* The grip on top of the layer stack: drag it up to grow the timeline. */
	.tl-resize {
		display: grid;
		place-items: center;
		height: 14px;
		margin: -3px 0 -2px;
		cursor: ns-resize;
		touch-action: none;
	}

	.tl-resize span {
		display: block;
		width: 64px;
		height: 4px;
		border-radius: 999px;
		background: var(--ln2);
	}

	.tl-resize:hover span,
	.tl-resize:focus-visible span {
		background: var(--ac);
	}

	.tl-add-menu {
		position: absolute;
		z-index: 60;
		display: flex;
		flex-direction: column;
		gap: 2px;
		width: 232px;
		padding: 6px;
		border: 1px solid var(--ln2);
		border-radius: 12px;
		background: var(--bg1);
		box-shadow: 0 14px 32px rgba(0, 0, 0, 0.55);
	}

	.tl-add-menu.above {
		transform: translateY(-100%);
	}

	.tl-add-menu button {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 30px;
		padding: 0 8px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--tx);
		font: 600 11.5px Inter, system-ui, sans-serif;
		cursor: pointer;
		text-align: left;
	}

	.tl-add-menu button:hover:not(:disabled) {
		background: var(--bg3);
	}

	.tl-add-menu button:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.tl-add-menu button em {
		margin-left: auto;
		font-style: normal;
		font-size: 9px;
		letter-spacing: 0.04em;
		color: var(--tx3);
	}

	.tl-add-menu button :global(svg) {
		width: 14px;
		height: 14px;
		color: var(--ac);
	}

	.tl-add-note {
		margin: 4px 6px 0;
		color: var(--tx3);
		font: 500 10px Inter, system-ui, sans-serif;
		line-height: 1.35;
	}

	.tl-file {
		display: none;
	}

	.tl-textbar {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 3px 4px;
		border: 1px solid var(--ln);
		border-radius: 9px;
		background: var(--bg0);
	}

	.tl-text-label {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--tx2);
		font: 700 10px Inter, system-ui, sans-serif;
	}

	.tl-text-label :global(svg) {
		width: 12px;
		height: 12px;
		color: var(--ac);
	}

	.tl-text-input {
		flex: 1;
		min-width: 0;
		height: 24px;
		padding: 0 6px;
		border: 0;
		border-radius: 6px;
		background: var(--bg2);
		color: var(--tx);
		font: 500 12px Inter, system-ui, sans-serif;
	}

	.tl-text-hint {
		color: var(--tx3);
		font: 500 9.5px Inter, system-ui, sans-serif;
		white-space: nowrap;
	}

	@media (max-width: 560px) {
		.tl-text-hint {
			display: none;
		}
	}

	.tl-head {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
		row-gap: 4px;
	}

	/*
		On a phone the header is wider than the dock: wrap it instead of
		hiding the loop, easing and interpolation controls off-screen.
	*/
	@media (max-width: 560px) {
		.tl-spacer {
			display: none;
		}

		.tl-head {
			gap: 3px;
		}

		.tl-time {
			font-size: 10.5px;
		}

	}

	.tl-spacer {
		flex: 1;
	}

	.tl-group {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 2px;
		background: var(--bg0);
		border: 1px solid var(--ln);
		border-radius: 9px;
	}

	.tl-play {
		width: 34px;
		height: 28px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 9px;
		background: var(--ac);
		color: #0b0c10;
		cursor: pointer;
	}

	.tl-mini {
		min-width: 26px;
		height: 24px;
		padding: 0 6px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 7px;
		background: transparent;
		color: var(--tx2);
		font: 700 11px Inter, system-ui, sans-serif;
		cursor: pointer;
	}

	.tl-mini.on {
		background: color-mix(in srgb, var(--ac) 20%, transparent);
		color: var(--ac);
	}

	.tl-time {
		color: var(--tx2);
		font: 700 11px Inter, system-ui, sans-serif;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.tl-tools {
		display: flex;
		align-items: center;
		gap: 4px;
		overflow-x: auto;
		scrollbar-width: none;
	}

	.tl-tools::-webkit-scrollbar {
		display: none;
	}

	.tl-chip {
		flex: none;
		height: 24px;
		padding: 0 9px;
		border: 1px solid var(--ln);
		border-radius: 999px;
		background: var(--bg2);
		color: var(--tx2);
		font: 700 10.5px Inter, system-ui, sans-serif;
		cursor: pointer;
		white-space: nowrap;
	}

	.tl-chip:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.tl-chip.on {
		border-color: var(--ac);
		color: var(--ac);
		background: color-mix(in srgb, var(--ac) 16%, var(--bg2));
	}

	.tl-speed {
		color: var(--tx2);
		font: 700 10.5px Inter, system-ui, sans-serif;
		min-width: 30px;
		text-align: center;
	}

	.tl-body {
		position: relative;
		display: flex;
		align-items: stretch;
		flex: none;
		min-width: 0;
		/* One ruler row plus the user-resized layer stack: a real stage. */
		height: calc(22px + var(--tl-rows-h));
		/* The rod and the film strip are clipped to this stage. */
		overflow: hidden;
		/* Keep the fixed rod above the scrolling track in one stacking context. */
		isolation: isolate;
		/* The track is full bleed so 50vw really is half of the scroller. */
		margin-inline: calc(var(--tl-gutter) * -1);
	}

	/*
		The fixed white rod. It never moves: the strip scrolls underneath it,
		so whatever is at 50% of the scroller is the current time.
	*/
	.center-playhead-rod {
		position: absolute;
		left: 50%;
		top: 0;
		bottom: 0;
		width: 2px;
		min-height: 100%;
		transform: translateX(-1px);
		background: #ffffff;
		box-shadow: 0 0 8px rgba(255, 255, 255, 0.45);
		z-index: 60;
		pointer-events: none;
	}

	/* A small cap makes the rod easy to find even over a bright clip. */
	.center-playhead-rod::before {
		content: '';
		position: absolute;
		top: 0;
		left: 50%;
		width: 9px;
		height: 6px;
		transform: translateX(-50%);
		border-radius: 0 0 2px 2px;
		background: #ffffff;
		box-shadow: 0 0 6px rgba(255, 255, 255, 0.5);
	}

	.tl-scroller {
		position: relative;
		flex: 1 1 auto;
		min-width: 0;
		overflow-x: auto;
		overflow-y: hidden;
		-webkit-overflow-scrolling: touch;
		overscroll-behavior-x: contain;
		/* Clips, keys and the ruler opt out; empty track pans both axes. */
		touch-action: pan-x pan-y;
		scrollbar-width: thin;
	}

	/*
		50vw of empty track on each side lets 0 s sit under the centre rod and
		lets the last second do the same without a different coordinate system.
		`content-box` keeps the padding outside the explicit track width, so the
		full-hour track is `3600 * pxPerSecond + 100vw` including both gutters.
	*/
	.tl-inner {
		display: block;
		box-sizing: content-box;
		width: max-content;
		padding-left: 50vw;
		padding-right: 50vw;
	}

	.tl-content {
		position: relative;
	}

	.tl-ruler {
		position: relative;
		height: 22px;
		border-bottom: 1px solid var(--ln2);
		touch-action: none;
		cursor: grab;
	}

	.tl-ruler:active {
		cursor: grabbing;
	}

	.tl-tick {
		position: absolute;
		top: 2px;
		font: 600 9px Inter, system-ui, sans-serif;
		color: var(--tx2);
		transform: translateX(-50%);
		pointer-events: none;
	}

	.tl-rows {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 4px 0;
		/*
			The layer stack height is user controlled: drag the grip above the
			timeline, or press the arrow keys while it is focused. The default
			keeps a short phone screen usable.
		*/
		height: var(--tl-rows-h);
		overflow-y: auto;
		/* Empty row space can pan the strip horizontally or scroll layers. */
		touch-action: pan-x pan-y;
	}

	.tl-row {
		flex: none;
		position: relative;
		height: 40px;
	}

	/*
		The CapCut style layer bar. Its length and colour come from the layer's
		real data (see lib/layers.ts), the name and the key button live inside it.
	*/
	.tl-clip {
		position: absolute;
		top: 4px;
		height: 32px;
		display: flex;
		align-items: center;
		border: 1px solid color-mix(in srgb, var(--clip-edge) 70%, transparent);
		border-radius: 6px;
		background: color-mix(in srgb, var(--clip) 62%, #10131a);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
		overflow: hidden;
		cursor: pointer;
		touch-action: none;
	}

	.tl-clip.movable {
		cursor: grab;
	}

	.tl-clip.movable:active {
		cursor: grabbing;
	}

	/* The white edge grips of a bar: drag them to trim or to extend. */
	.tl-clip-trim {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 18px;
		padding: 0;
		border: 0;
		background: transparent;
		cursor: ew-resize;
		touch-action: none;
		z-index: 6;
	}

	.tl-clip-trim.left {
		left: 0;
	}

	.tl-clip-trim.right {
		right: 0;
	}

	.tl-clip-trim::after {
		content: '';
		position: absolute;
		top: 7px;
		bottom: 7px;
		width: 5px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.92);
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
	}

	.tl-clip-trim.left::after {
		left: 5px;
	}

	.tl-clip-trim.right::after {
		right: 5px;
	}

	.tl-clip-trim:hover::after,
	.tl-clip-trim:active::after {
		background: #ffffff;
	}

	.tl-clip-trim:focus-visible {
		outline: 2px solid var(--ac);
		outline-offset: -2px;
	}

	.tl-clip.selected {
		border-color: #ffffff;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.2),
			0 0 0 1px #ffffff;
	}

	.tl-clip-name {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 5px;
		height: 100%;
		padding: 0 20px;
		border: 0;
		background: transparent;
		color: #f4f6f8;
		font: 600 10.5px Inter, system-ui, sans-serif;
		text-align: left;
		cursor: pointer;
	}

	.tl-row-icon {
		flex: none;
		display: inline-flex;
		opacity: 0.9;
	}

	.tl-row-icon :global(svg) {
		width: 12px;
		height: 12px;
	}

	.tl-row-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tl-row-empty {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 34px;
		margin: 6px;
		padding: 0 10px;
		border: 1px dashed var(--ln2);
		border-radius: 8px;
		background: transparent;
		color: var(--tx3);
		font: 600 10.5px Inter, system-ui, sans-serif;
		cursor: pointer;
	}

	.tl-row-empty :global(svg) {
		width: 12px;
		height: 12px;
	}

	.tl-row-empty:hover {
		border-color: var(--ac);
		color: var(--ac);
	}

	/* A 40 px hit area around a 12 px diamond: reachable with a thumb. */
	.tl-key {
		position: absolute;
		top: 0;
		width: 24px;
		height: 40px;
		padding: 0;
		border: 0;
		background: transparent;
		transform: translateX(-12px);
		cursor: ew-resize;
		touch-action: none;
		z-index: 3;
	}

	.tl-key::before {
		content: '';
		position: absolute;
		top: 14px;
		left: 6px;
		width: 12px;
		height: 12px;
		background: #ffe0a3;
		border: 2px solid #10131a;
		border-radius: 2px;
		transform: rotate(45deg);
	}

	.tl-key.on::before {
		background: #ffffff;
		border-color: var(--ac);
	}

	.tl-key:focus-visible {
		outline: 2px solid var(--ac);
		outline-offset: -4px;
		border-radius: 6px;
	}

	.tl-mini:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.tl-frame {
		margin-left: 5px;
		opacity: 0.7;
	}

	.tl-strip {
		position: absolute;
		top: 7px;
		height: 26px;
		display: flex;
		align-items: center;
		border-radius: 6px;
		background: color-mix(in srgb, var(--ac) 30%, rgba(10, 12, 16, 0.72));
		border: 1px solid var(--ac);
		cursor: pointer;
		overflow: hidden;
		z-index: 2;
	}

	.tl-strip.on {
		background: color-mix(in srgb, var(--ac) 52%, rgba(10, 12, 16, 0.72));
	}

	.tl-strip-name {
		flex: 1;
		padding: 0 8px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--tx);
		font: 600 9.5px Inter, system-ui, sans-serif;
		pointer-events: none;
	}

	.tl-trim {
		flex: none;
		width: 10px;
		height: 100%;
		background: #ffffff;
		cursor: ew-resize;
		touch-action: none;
	}

	.tl-trim.right {
		margin-left: auto;
	}

	#scrub {
		position: absolute;
		left: 0;
		top: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		pointer-events: none;
		cursor: pointer;
	}
</style>
