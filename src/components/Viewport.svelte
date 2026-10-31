<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { get } from 'svelte/store';
	import { sceneStore } from '../stores/scene';
	import { viewportStore } from '../stores/viewport';
	import { toolStore } from '../stores/tools';
	import { workspaceStore } from '../stores/workspace';
	import { brushStore } from '../stores/brush';
	import { uiStore } from '../stores/ui';
	import { GLRenderer, objectRenderColor, type RenderCamera, type RenderObject } from '../lib/gl';
	import { meshFor } from '../lib/mesh';
	import { ICONS } from '../lib/constants';
	import { renderSlotsFor } from '../lib/materials';
	import { cutPlaneFromScreenSegment } from '../lib/bisect';
	import { detectCoplanarRegion } from '../lib/regions';
	import {
		buildGizmo,
		distanceToPolyline,
		distanceToSegment,
		gizmoAxisDirection,
		gizmoPlaneAxes,
		screenAngle,
		type GizmoHit,
		type GizmoMode,
		type GizmoPart,
	} from '../lib/gizmo';
	import { eulerToQuat, quatConjugate, quatFromAxisAngle, quatMul, quatToEuler, type Quat } from '../lib/fcurve';
	import { cameraRay, pickElement, pickObjects, pickingEngineLoaded, projectWorld, rayWorldThreshold, type PickObject } from '../lib/picking';
	import { timelineStore } from '../stores/timeline';
	import { mat4FromTRS, mat4Invert, mat4Transpose, transformDir3, transformVec3 } from '../lib/glmath';
	import {
		DEFAULT_CAMERA,
		add,
		basisFromDirection,
		cameraBasis,
		clamp,
		dot,
		fovToFocalLength,
		rotateEuler,
		sub,
		worldPerPixel,
		type CameraBasis,
		type OrbitCamera,
		type Vec3,
	} from '../lib/math3d';

	let canvas: HTMLCanvasElement;
	let renderer: GLRenderer | null = null;
	let stats = $state({ fps: 0, triangles: 0, objects: 0, engine: 'js' });
	let lastStatsAt = 0;
	let lastFrameAt = 0;
	let smoothFrameMs = 0;
	const triangleCache = new WeakMap<object, number>();
	let glError = $state('');
	let resizeObserver: ResizeObserver | null = null;
	let raf = 0;
	let dirty = true;
	let exporting = $state(false);
	let width = 1;
	let height = 1;
	let dpr = 1;

	const camera: OrbitCamera = { ...DEFAULT_CAMERA, target: [...DEFAULT_CAMERA.target] as Vec3 };
	const pointers = new Map<number, { x: number; y: number }>();

	const toolHintText = $derived.by(() => {
		const tool = $toolStore.current;
		if (tool === 'move') return 'Drag arrows to move · 2 fingers to orbit';
		if (tool === 'rotate') return 'Drag rings to rotate · 2 fingers to orbit';
		if (tool === 'scale') return 'Drag handles to scale · 2 fingers to orbit';
		if (tool === 'pan') return 'Drag to pan view · pinch to zoom';
		if (tool === 'cut') return 'Draw a line across the mesh to slice it';
		if (tool === 'detect') return 'Tap a surface to mark its coplanar portion';
		return 'Drag to orbit · tap to select';
	});

	function setCameraPreset(preset: 'camera' | 'front' | 'right' | 'left' | 'top' | 'bottom' | 'iso') {
		if (preset === 'camera') {
			let cam = $sceneStore.objects.find((o) => o.type.startsWith('camera'));
			if (!cam) {
				sceneStore.addPrimitive('camera', [0, 2.5, 6]);
				cam = $sceneStore.objects.find((o) => o.type.startsWith('camera'));
			}
			viewportStore.toggleViewThroughCamera();
			invalidate();
			return;
		}
		viewportStore.setViewThroughCamera(false);
		if (preset === 'front') { camera.yaw = 0; camera.pitch = 0; }
		else if (preset === 'right') { camera.yaw = Math.PI / 2; camera.pitch = 0; }
		else if (preset === 'left') { camera.yaw = -Math.PI / 2; camera.pitch = 0; }
		else if (preset === 'top') { camera.yaw = 0; camera.pitch = 1.44; }
		else if (preset === 'bottom') { camera.yaw = 0; camera.pitch = -1.44; }
		else { camera.yaw = DEFAULT_CAMERA.yaw; camera.pitch = DEFAULT_CAMERA.pitch; }
		invalidate();
	}

	type Gesture =
		| { kind: 'orbit'; lastX: number; lastY: number }
		| { kind: 'pan'; lastX: number; lastY: number }
		| { kind: 'pinch'; distance: number; midX: number; midY: number }
		| {
				kind: 'transform';
				tool: 'move' | 'rotate' | 'scale';
				hit: GizmoHit;
				mode: GizmoMode;
				lastX: number;
				lastY: number;
				startX: number;
				startY: number;
				depth: number;
				startAngle: number;
				startDistance: number;
				axisDir: Vec3;
				planeAxes: [Vec3, Vec3];
				startPosition: [number, number, number];
				startRotation: [number, number, number];
				startScale: [number, number, number];
				starts: {
					id: string;
					position: [number, number, number];
					rotation: [number, number, number];
					scale: [number, number, number];
				}[];
			}
		| { kind: 'brush'; op: 'sculpt' | 'paint'; startLocal: Vec3; lastLocal: Vec3 }
		| { kind: 'cut'; startX: number; startY: number }
		| { kind: 'detect' };

	let gesture: Gesture | null = null;

	function invalidate() {
		dirty = true;
	}

	$effect(() => {
		$sceneStore;
		$viewportStore;
		$toolStore;
		$workspaceStore;
		gizmoHover;
		invalidate();
	});

	$effect(() => {
		sceneStore.setEditMode($workspaceStore.current === 'edt');
	});

	function workspaceTool(): 'move' | 'rotate' | 'scale' | 'select' {
		const tool = $toolStore.current;
		return tool === 'rotate' || tool === 'scale' || tool === 'select' ? tool : 'move';
	}

	function gizmoMode(): GizmoMode | null {
		const tool = $toolStore.current;
		if (tool === 'move') return 'translate';
		if (tool === 'rotate') return 'rotate';
		if (tool === 'scale') return 'scale';
		if (tool === 'universal') return 'universal';
		return null;
	}

	function specialTool(): 'cut' | 'detect' | null {
		const tool = $toolStore.current;
		return tool === 'cut' || tool === 'detect' ? tool : null;
	}

	let cutStart: { x: number; y: number } | null = null;
	let cutCurrent: { x: number; y: number } | null = null;
	let gizmoHover = $state<GizmoHit | null>(null);

	const setCache = new Map<string, { version: number; set: Set<number> }>();
	function cachedSet(key: string, version: number, values: Iterable<number>): Set<number> | null {
		const entry = setCache.get(key);
		if (entry && entry.version === version) return entry.set;
		const next = new Set(values);
		setCache.set(key, { version, set: next });
		return next;
	}

	let brushHover = $state<{ world: Vec3; normal: Vec3; radius: number } | null>(null);

	function brushOperation(): 'sculpt' | 'paint' | null {
		const workspace = $workspaceStore.current;
		const chipIdx = $workspaceStore.chipIndices[workspace] ?? 0;
		if (workspace === 'scl' || (workspace === 'mod' && chipIdx === 3)) return 'sculpt';
		if (workspace === 'uvp') return 'paint';
		return null;
	}

	function resize() {
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		width = Math.max(1, rect.width);
		height = Math.max(1, rect.height);
		dpr = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = Math.round(width * dpr);
		canvas.height = Math.round(height * dpr);
		viewportStore.setSize(width, height);
		invalidate();
	}

	function toRenderObjects(): RenderObject[] {
		const state = $sceneStore;
		const editMode = state.editMode;
		return state.objects
			.filter((object) => object.visible && !object.timelineHidden)
			.map((object) => {
				const mesh = object.geometry ?? meshFor(object.type) ?? meshFor('cube')!;
				const isSelected = object.id === state.selectedId;
				const elements = isSelected && editMode;
				return {
					id: object.id,
					mesh,
					geometryVersion: object.geometryVersion,
					selectionVersion: object.selectionVersion,
					colorVersion: object.colorVersion,
					position: object.position,
					rotation: object.rotation,
					scale: object.scale,
					color: objectRenderColor(object.color),
					emissive: objectRenderColor(object.material.emissive),
					opacity: object.material.opacity,
					metalness: object.material.metalness,
					roughness: object.material.roughness,
					slots: object.geometry?.slots?.length ? renderSlotsFor(object.geometry.slots) : [],
					glowFaces:
						state.markedObjectId === object.id && state.markedFaces.length
							? cachedSet(`glow:${object.id}`, state.portionVersion, state.markedFaces)
							: null,
					glowVersion: state.portionVersion,
					selected: isSelected,
					selectedFaces: elements ? cachedSet(`faces:${object.id}`, state.selectionVersion, state.selectedFaces) : null,
					selectedEdges: elements ? cachedSet(`edges:${object.id}`, state.selectionVersion, state.selectedEdges) : null,
					selectedVertices: elements ? cachedSet(`verts:${object.id}`, state.selectionVersion, state.selectedVertices) : null,
					hoverKind: elements ? (state.hover?.kind ?? null) : null,
					hoverIndex: elements ? (state.hover?.index ?? null) : null,
					special: object.type === 'light' ? 'light' : object.type === 'camera' ? 'camera' : null,
				} satisfies RenderObject;
			});
	}

	function gizmoTarget(): Vec3 | null {
		const state = $sceneStore;
		if (!state.selectedId || state.gameMode) return null;
		const object = state.objects.find((item) => item.id === state.selectedId);
		if (!object) return null;
		if (state.editMode) {
			if (!state.selectedVertices.length && !state.selectedEdges.length && !state.selectedFaces.length) return null;
		}
		return [...object.position] as Vec3;
	}

	const activeSceneCam = $derived(
		$sceneStore.objects.find((o) => o.type.startsWith('camera') && o.cameraProps?.active) ??
		$sceneStore.objects.find((o) => o.type.startsWith('camera')) ??
		null
	);

	function render() {
		if (!renderer) return;
		const view = $viewportStore;
		const state = $sceneStore;
		let basis = cameraBasis(camera);
		let activeFov = camera.fov;
		if (view.viewThroughCamera && activeSceneCam) {
			const forward = rotateEuler([0, 0, -1], activeSceneCam.rotation);
			activeFov = activeSceneCam.cameraProps?.fov ?? 50;
			basis = basisFromDirection(activeSceneCam.position, forward, activeFov);
		}
		const renderCamera: RenderCamera = {
			eye: basis.eye,
			forward: basis.forward,
			up: basis.up,
			fov: activeFov,
			near: 0.05,
			far: 260,
		};
		const showGizmo = Boolean(gizmoTarget()) && !state.gameMode && !specialTool() && !brushOperation();
		const brushRing = (() => {
			if (!brushOperation() || !brushHover) return null;
			const b = $brushStore;
			const mirrors: Vec3[] = [];
			const sel = selected();
			if (sel && (b.symmetryX || b.symmetryY || b.symmetryZ)) {
				const inv = mat4Invert(mat4FromTRS(sel.position, sel.rotation, sel.scale));
				const fwd = mat4FromTRS(sel.position, sel.rotation, sel.scale);
				const loc = transformVec3(inv, brushHover.world);
				if (b.symmetryX) mirrors.push(transformVec3(fwd, [-loc[0], loc[1], loc[2]]));
				if (b.symmetryY) mirrors.push(transformVec3(fwd, [loc[0], -loc[1], loc[2]]));
				if (b.symmetryZ) mirrors.push(transformVec3(fwd, [loc[0], loc[1], -loc[2]]));
			}
			return {
				center: brushHover.world,
				normal: brushHover.normal,
				radius: b.radius,
				color: (b.inverted ? [0.95, 0.25, 0.25] : [1, 0.55, 0.1]) as [number, number, number],
				mirrors,
			};
		})();
		renderer.render(Math.round(width * dpr), Math.round(height * dpr), toRenderObjects(), renderCamera, {
			shading: view.shadingMode,
			xray: view.xray,
			grid: view.overlays.grid,
			axes: view.overlays.axes,
			wireOverlay: view.overlays.wireframe,
			outlines: view.shadingMode === 'toon',
			selectOutline: !state.editMode,
			editMode: state.editMode,
			elementMode: state.editMode ? state.elementMode : null,
			background: [0.051, 0.059, 0.078],
			gizmo: showGizmo ? gizmoParts() : null,
			cursor: view.cursorVisible ? view.cursorPosition : null,
			brushRing,
			overlayLine:
				cutStart && cutCurrent
					? { x0: cutStart.x, y0: cutStart.y, x1: cutCurrent.x, y1: cutCurrent.y }
					: null,
		});
	}

	async function exportVideo() {
		if (!canvas || !renderer || exporting) return;
		if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') {
			uiStore.showToast('Video export is not supported in this browser.', 'warning');
			return;
		}
		const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
			? 'video/webm;codecs=vp9'
			: MediaRecorder.isTypeSupported('video/webm')
				? 'video/webm'
				: '';
		if (!mimeType) {
			uiStore.showToast('No supported video codec found.', 'warning');
			return;
		}

		exporting = true;
		cancelAnimationFrame(raf);
		raf = 0;

		const tl = get(timelineStore);
		const dur = Math.max(0.1, tl.duration);
		const fps = 30;
		const frameTime = 1 / fps;
		const stream = canvas.captureStream(fps);
		const chunks: Blob[] = [];
		const mr = new MediaRecorder(stream, { mimeType });
		mr.ondataavailable = (e) => {
			if (e.data && e.data.size) chunks.push(e.data);
		};
		const stopped = new Promise<void>((resolve) => {
			mr.onstop = () => resolve();
		});
		mr.start();

		const originalTime = tl.currentTime;
		timelineStore.setPlaying(false);

		try {
			for (let t = 0; t <= dur + 1e-6; t += frameTime) {
				const time = Math.min(dur, t);
				timelineStore.setTime(time);
				dirty = true;
				render();
				await new Promise((resolve) => setTimeout(resolve, 1000 / fps));
			}
		} finally {
			mr.stop();
			await stopped;
			stream.getTracks().forEach((tr) => tr.stop());

			const blob = new Blob(chunks, { type: mimeType });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = 'toon-studio-export.webm';
			a.click();
			setTimeout(() => URL.revokeObjectURL(url), 2000);

			timelineStore.setTime(originalTime);
			exporting = false;
			raf = requestAnimationFrame(loop);
			uiStore.showToast('Video exported.', 'success');
		}
	}

	function loop(now = performance.now()) {
		raf = requestAnimationFrame(loop);
		if (lastFrameAt) {
			const delta = now - lastFrameAt;
			if (delta > 0 && delta < 500) {
				smoothFrameMs = smoothFrameMs ? smoothFrameMs * 0.9 + delta * 0.1 : delta;
			}
		}
		lastFrameAt = now;
		if (!dirty) return;
		dirty = false;
		render();
		if (now - lastStatsAt > 400) {
			lastStatsAt = now;
			stats = {
				fps: smoothFrameMs > 0 ? Math.round(1000 / smoothFrameMs) : 0,
				triangles: triangleCount(),
				objects: $sceneStore.objects.length,
				engine: pickingEngineLoaded() ? 'wasm' : 'js',
			};
		}
	}

	function localPointer(event: PointerEvent | WheelEvent | MouseEvent) {
		const rect = canvas.getBoundingClientRect();
		return { x: event.clientX - rect.left, y: event.clientY - rect.top };
	}

	function selected() {
		const state = $sceneStore;
		return state.objects.find((object) => object.id === state.selectedId) || null;
	}

	function selectedObjects() {
		const state = $sceneStore;
		const picked = state.objects.filter((object) => object.selected && !object.locked);
		const active = picked.find((object) => object.id === state.selectedId);
		return active ? [active, ...picked.filter((object) => object !== active)] : picked;
	}

	function pivotOf(objects: { position: [number, number, number] }[]): [number, number, number] {
		if (!objects.length) return [0, 0, 0];
		let x = 0, y = 0, z = 0;
		for (const object of objects) {
			x += object.position[0];
			y += object.position[1];
			z += object.position[2];
		}
		return [x / objects.length, y / objects.length, z / objects.length];
	}

	function startRecord(objects: { id: string; position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[]) {
		return objects.map((object) => ({
			id: object.id,
			position: [...object.position] as [number, number, number],
			rotation: [...object.rotation] as [number, number, number],
			scale: [...object.scale] as [number, number, number],
		}));
	}

	function pickableObjects(): PickObject[] {
		return $sceneStore.objects
			.filter(
				(object) =>
					object.visible && !object.timelineHidden && !object.locked && object.type !== 'light' && object.type !== 'camera',
			)
			.map((object) => ({
				id: object.id,
				mesh: object.geometry ?? meshFor(object.type) ?? meshFor('cube')!,
				position: object.position,
				rotation: object.rotation,
				scale: object.scale,
				version: object.geometryVersion,
			}));
	}

	function gizmoParts(): GizmoPart[] | null {
		const mode = gizmoMode();
		if (!mode) return null;
		const object = selected();
		const objects = selectedObjects();
		if (!object || object.locked) return null;
		const pivot = pivotOf(objects);
		const basis = cameraBasis(camera);
		const relative = sub(pivot, basis.eye);
		const depth = Math.max(0.2, dot(relative, basis.forward));
		const perPixel = worldPerPixel(depth, camera.fov, height);
		let radius = 0.01;
		for (const item of objects) {
			const mesh = item.geometry ?? meshFor(item.type);
			const scaled = Math.max(Math.abs(item.scale[0]), Math.abs(item.scale[1]), Math.abs(item.scale[2]), 0.01);
			radius = Math.max(radius, (mesh?.radius ?? 0.5) * scaled);
		}
		const minPixels = mode === 'rotate' ? 46 : 30;
		const size = Math.max(perPixel * minPixels, Math.min(perPixel * 72, radius * 2.4));
		return buildGizmo({
			mode,
			target: pivot,
			size,
			rotation: object.rotation,
			local: $toolStore.space === 'local',
			view: { right: basis.right, up: basis.up },
			hover: gizmoHover,
		});
	}

	function gizmoHitAt(px: number, py: number): GizmoHit | null {
		const parts = gizmoParts();
		if (!parts) return null;
		const basis = cameraBasis(camera);
		let best: { hit: GizmoHit; score: number } | null = null;
		for (const part of parts) {
			const pick = part.pick;
			let distance = Infinity;
			if (pick.kind === 'point') {
				const p = projectWorld(pick.at, basis, camera.fov, width, height);
				if (!p.visible) continue;
				distance = Math.hypot(p.x - px, p.y - py);
			} else if (pick.kind === 'segment') {
				const a = projectWorld(pick.a, basis, camera.fov, width, height);
				const b = projectWorld(pick.b, basis, camera.fov, width, height);
				if (!a.visible || !b.visible) continue;
				distance = distanceToSegment(px, py, a.x, a.y, b.x, b.y);
			} else {
				const points = pick.points
					.map((point) => projectWorld(point, basis, camera.fov, width, height))
					.filter((point) => point.visible);
				if (points.length < 3) continue;
				distance = distanceToPolyline(px, py, points);
			}
			if (distance > pick.radius) continue;
			const score = distance / pick.radius;
			if (!best || score < best.score) best = { hit: part.hit, score };
		}
		return best?.hit ?? null;
	}

	function screenDirection(from: Vec3, direction: Vec3, basis: CameraBasis) {
		const a = projectWorld(from, basis, camera.fov, width, height);
		const b = projectWorld(add(from, direction), basis, camera.fov, width, height);
		if (!a.visible || !b.visible) return null;
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const len = Math.hypot(dx, dy);
		if (len < 4) return null;
		return { x: dx / len, y: dy / len };
	}

	function hoverElements(event: PointerEvent) {
		const state = $sceneStore;
		if (!state.editMode || !state.selectedId) return;
		const object = selected();
		if (!object) return;
		const { x, y } = localPointer(event);
		const ray = cameraRay(camera, x, y, width, height);
		const model = mat4FromTRS(object.position, object.rotation, object.scale);
		const scale = Math.min(Math.abs(object.scale[0]), Math.abs(object.scale[1]), Math.abs(object.scale[2])) || 1;
		const threshold = rayWorldThreshold(camera, camera.distance, height, 14) / scale;
		const hit = pickElement(object.geometry ?? meshFor(object.type)!, model, ray, state.elementMode, threshold, object.geometryVersion);
		sceneStore.setHover(hit ? { kind: hit.kind, index: hit.index } : null);
	}

	function startBrush(event: PointerEvent): boolean {
		const op = brushOperation();
		if (!op) return false;
		const object = selected();
		if (!object || object.type === 'light' || object.type === 'camera') return false;
		const ray = cameraRay(camera, localPointer(event).x, localPointer(event).y, width, height);
		const mesh = object.geometry ?? meshFor(object.type)!;
		const hit = pickObjects(
			[
				{
					id: object.id,
					mesh,
					position: object.position,
					rotation: object.rotation,
					scale: object.scale,
					version: object.geometryVersion,
				},
			],
			ray,
		);
		if (!hit) return false;
		const inverse = mat4Invert(mat4FromTRS(object.position, object.rotation, object.scale));
		const local = transformVec3(inverse, hit.world);
		sceneStore.beginTransform('geometry');
		gesture = { kind: 'brush', op, startLocal: local, lastLocal: local };
		if (op === 'paint') paintAt(local);
		else sculptAt(local, [0, 0, 0]);
		return true;
	}

	function sculptAt(local: Vec3, delta: Vec3, pressure = 1) {
		const brush = $brushStore;
		const symmetry = brush.symmetryX || brush.symmetryY || brush.symmetryZ ? { x: brush.symmetryX, y: brush.symmetryY, z: brush.symmetryZ } : null;
		const activeKind = brush.quickSmooth ? 'smooth' : brush.kind;
		sceneStore.applyBrush(activeKind, local, brush.radius, brush.strength, symmetry, delta, false, {
			hardness: brush.hardness,
			inverted: brush.inverted,
			falloff: brush.falloff,
			pressure,
			strokeVector: delta,
		});
	}

	function paintAt(local: Vec3) {
		const brush = $brushStore;
		const rgb = objectRenderColor(brush.color);
		sceneStore.paintVertices(local, brush.radius, rgb, brush.strength, false);
	}

	function detectPortion(event: PointerEvent) {
		const state = get(sceneStore);
		const { x, y } = localPointer(event);
		const ray = cameraRay(camera, x, y, width, height);
		let target = state.selectedId ? state.objects.find((object) => object.id === state.selectedId) ?? null : null;
		if (!target || target.type === 'light' || target.type === 'camera') {
			const hit = pickObjects(pickableObjects(), ray);
			target = hit ? state.objects.find((object) => object.id === hit.id) ?? null : null;
		}
		if (!target) {
			sceneStore.clearPortion();
			return;
		}
		const mesh = target.geometry ?? meshFor(target.type) ?? meshFor('cube')!;
		const model = mat4FromTRS(target.position, target.rotation, target.scale);
		const hit = pickElement(mesh, model, ray, 'face', 0);
		if (!hit) {
			sceneStore.clearPortion();
			return;
		}
		const region = detectCoplanarRegion(mesh, hit.index, 0.85);
		sceneStore.markPortion(target.id, region);
	}

	function commitCut() {
		const start = cutStart;
		const end = cutCurrent;
		cutStart = null;
		cutCurrent = null;
		if (!start || !end) return;
		if (Math.hypot(end.x - start.x, end.y - start.y) < 8) return;

		const basis = cameraBasis(camera);
		const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
		const ray = cameraRay(camera, middle.x, middle.y, width, height);
		const hit = pickObjects(pickableObjects(), ray);
		const state = get(sceneStore);
		const targetId = hit?.id ?? state.selectedId;
		if (!targetId) return;
		const target = state.objects.find((object) => object.id === targetId);
		if (!target) return;

		let depth = camera.distance;
		if (hit) {
			const relative = [
				hit.world[0] - basis.eye[0],
				hit.world[1] - basis.eye[1],
				hit.world[2] - basis.eye[2],
			];
			depth = Math.max(
				0.1,
				relative[0] * basis.forward[0] + relative[1] * basis.forward[1] + relative[2] * basis.forward[2],
			);
		}

		const plane = cutPlaneFromScreenSegment(
			{ eye: basis.eye, forward: basis.forward, right: basis.right, up: basis.up, fov: camera.fov },
			start,
			end,
			width,
			height,
			depth,
		);

		const model = mat4FromTRS(target.position, target.rotation, target.scale);
		const local = transformDir3(mat4Transpose(mat4Invert(model)), plane.normal);
		const localLength = Math.hypot(local[0], local[1], local[2]) || 1;
		const localPlane = {
			normal: [local[0] / localLength, local[1] / localLength, local[2] / localLength] as Vec3,
			dist: plane.dist / localLength,
		};

		const before = new Set(state.objects.map((object) => object.id));
		sceneStore.cutObject(targetId, localPlane, $toolStore.cutMode === 'mark' ? 'mark' : 'split');
		const after = get(sceneStore).objects;
		const parts = [after.find((object) => object.id === targetId), ...after.filter((object) => !before.has(object.id))].filter(
			(object): object is NonNullable<typeof object> => Boolean(object),
		);
		const timeline = get(timelineStore);
		for (const part of parts) {
			timelineStore.addKeyframe(part.id, {
				time: timeline.currentTime,
				position: [...part.position] as [number, number, number],
				rotation: [...part.rotation] as [number, number, number],
				scale: [...part.scale] as [number, number, number],
			});
		}
	}

	function onPointerDown(event: PointerEvent) {
		if (!canvas) return;
		canvas.setPointerCapture(event.pointerId);
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (pointers.size === 2) {
			startPinch();
			invalidate();
			return;
		}

		const x = event.clientX;
		const y = event.clientY;

		if ($toolStore.current === 'pan') {
			gesture = { kind: 'pan', lastX: x, lastY: y };
			invalidate();
			return;
		}

		const special = specialTool();
		if (special === 'cut' && event.button === 0) {
			const { x: lx, y: ly } = localPointer(event);
			cutStart = { x: lx, y: ly };
			cutCurrent = { x: lx, y: ly };
			gesture = { kind: 'cut', startX: lx, startY: ly };
			invalidate();
			return;
		}
		if (special === 'detect' && event.button === 0) {
			gesture = { kind: 'detect' };
			detectPortion(event);
			invalidate();
			return;
		}

		const isPan = event.button === 2 || event.button === 1 || event.shiftKey;
		const state = get(sceneStore);

		if (isPan) {
			gesture = { kind: 'pan', lastX: x, lastY: y };
			invalidate();
			return;
		}

		if (event.button === 0 && startBrush(event)) {
			invalidate();
			return;
		}

		const basis = cameraBasis(camera);
		const pointer = localPointer(event);

		// Check gizmo hit first (works in both Object Mode and Edit Mode when elements are selected)
		const gizmoHit = gizmoHitAt(pointer.x, pointer.y);
		if (gizmoHit) {
			const object = selected();
			const mode = gizmoMode();
			if (object && mode) {
				const local = $toolStore.space === 'local';
				const objects = selectedObjects();
				const pivot = pivotOf(objects);
				const relative = sub(pivot, basis.eye);
				const depth = Math.max(0.2, dot(relative, basis.forward));
				const center = projectWorld(pivot, basis, camera.fov, width, height);
				let axisDir: Vec3 = [1, 0, 0];
				let planeAxes: [Vec3, Vec3] = [[1, 0, 0], [0, 1, 0]];
				if (gizmoHit.kind === 'axis' || gizmoHit.kind === 'ring' || gizmoHit.kind === 'scale') {
					axisDir = gizmoAxisDirection(object.rotation, local, gizmoHit.axis);
				} else if (gizmoHit.kind === 'plane') {
					planeAxes = gizmoPlaneAxes(object.rotation, local, gizmoHit.axis);
				}
				const resolvedMode: GizmoMode =
					mode === 'universal'
						? gizmoHit.kind === 'ring'
							? 'rotate'
							: gizmoHit.kind === 'scale'
								? 'scale'
								: 'translate'
						: mode;
				const resolvedHit: GizmoHit =
					gizmoHit.kind === 'scale' ? { kind: 'axis', axis: gizmoHit.axis } : gizmoHit;
				sceneStore.beginTransform(state.editMode ? 'geometry' : 'transform');
				gesture = {
					kind: 'transform',
					tool: resolvedMode === 'translate' ? 'move' : resolvedMode === 'rotate' ? 'rotate' : 'scale',
					hit: resolvedHit,
					mode: resolvedMode,
					lastX: x,
					lastY: y,
					startX: pointer.x,
					startY: pointer.y,
					depth,
					startAngle: screenAngle(center.x, center.y, pointer.x, pointer.y),
					startDistance: Math.hypot(pointer.x - center.x, pointer.y - center.y),
					axisDir,
					planeAxes,
					startPosition: pivot,
					startRotation: [...object.rotation] as [number, number, number],
					startScale: [...object.scale] as [number, number, number],
					starts: startRecord(objects),
				};
				invalidate();
				return;
			}
		}

		if (state.editMode && event.button === 0) {
			const object = selected();
			const { x: lx, y: ly } = localPointer(event);
			const ray = cameraRay(camera, lx, ly, width, height);
			if (object) {
				const model = mat4FromTRS(object.position, object.rotation, object.scale);
				const scale = Math.min(Math.abs(object.scale[0]), Math.abs(object.scale[1]), Math.abs(object.scale[2])) || 1;
				const threshold = rayWorldThreshold(camera, camera.distance, height, 14) / scale;
				const hit = pickElement(object.geometry ?? meshFor(object.type)!, model, ray, state.elementMode, threshold, object.geometryVersion);
				sceneStore.selectElement(state.elementMode, hit ? hit.index : 0, event.ctrlKey || event.metaKey);
				if (!hit) {
					sceneStore.clearElementSelection();
					gesture = { kind: 'orbit', lastX: x, lastY: y };
				}
			}
			invalidate();
			return;
		}

		const hitId = pickObjects(pickableObjects(), cameraRay(camera, pointer.x, pointer.y, width, height))?.id ?? null;
		const additive = event.shiftKey || event.ctrlKey || event.metaKey;
		if (hitId) {
			sceneStore.selectObject(hitId, additive);
			const object = get(sceneStore).objects.find((item) => item.id === hitId);
			const tool = workspaceTool();
			const mode = gizmoMode();
			if (object && tool !== 'select' && mode) {
				const objects = selectedObjects();
				const pivot = pivotOf(objects);
				const relative = sub(pivot, basis.eye);
				const depth = Math.max(0.2, dot(relative, basis.forward));
				const center = projectWorld(pivot, basis, camera.fov, width, height);
				sceneStore.beginTransform();
				gesture = {
					kind: 'transform',
					tool,
					hit: { kind: 'center' },
					mode,
					lastX: x,
					lastY: y,
					startX: pointer.x,
					startY: pointer.y,
					depth,
					startAngle: screenAngle(center.x, center.y, pointer.x, pointer.y),
					startDistance: Math.hypot(pointer.x - center.x, pointer.y - center.y),
					axisDir: [1, 0, 0],
					planeAxes: [[1, 0, 0], [0, 1, 0]],
					startPosition: pivot,
					startRotation: [...object.rotation] as [number, number, number],
					startScale: [...object.scale] as [number, number, number],
					starts: startRecord(objects),
				};
			}
			invalidate();
			return;
		}

		const activeMode = gizmoMode();
		const activeObject = selected();
		if (activeMode && activeObject && !activeObject.locked && workspaceTool() !== 'select' && !state.editMode) {
			const objects = selectedObjects();
			const pivot = pivotOf(objects);
			const relative = sub(pivot, basis.eye);
			const depth = Math.max(0.2, dot(relative, basis.forward));
			const center = projectWorld(pivot, basis, camera.fov, width, height);
			sceneStore.beginTransform();
			gesture = {
				kind: 'transform',
				tool: activeMode === 'translate' ? 'move' : activeMode,
				hit: { kind: 'center' },
				mode: activeMode,
				lastX: x,
				lastY: y,
				startX: pointer.x,
				startY: pointer.y,
				depth,
				startAngle: screenAngle(center.x, center.y, pointer.x, pointer.y),
				startDistance: Math.hypot(pointer.x - center.x, pointer.y - center.y),
				axisDir: [1, 0, 0],
				planeAxes: [[1, 0, 0], [0, 1, 0]],
				startPosition: pivot,
				startRotation: [...activeObject.rotation] as [number, number, number],
				startScale: [...activeObject.scale] as [number, number, number],
				starts: startRecord(objects),
			};
			invalidate();
			return;
		}

		if ($toolStore.current === 'select' && !state.editMode) sceneStore.selectObject(null);
		gesture = { kind: 'orbit', lastX: x, lastY: y };
		invalidate();
	}

	function onPointerMove(event: PointerEvent) {
		if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (!gesture) {
			hoverElements(event);
			const pointer = localPointer(event);
			const hit = gizmoHitAt(pointer.x, pointer.y);
			if (hit?.kind !== gizmoHover?.kind || (hit && 'axis' in hit && gizmoHover && 'axis' in gizmoHover && hit.axis !== gizmoHover.axis)) {
				gizmoHover = hit;
			}
			return;
		}

		if (gesture.kind === 'pinch') {
			const values = [...pointers.values()];
			if (values.length < 2) return;
			const distance = Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
			const midX = (values[0].x + values[1].x) / 2;
			const midY = (values[0].y + values[1].y) / 2;
			if (gesture.distance > 0) camera.distance = clamp(camera.distance * (gesture.distance / Math.max(distance, 1)), 0.5, 90);
			const basis = cameraBasis(camera);
			const wpp = worldPerPixel(camera.distance, camera.fov, height);
			camera.target = [
				camera.target[0] - basis.right[0] * (midX - gesture.midX) * wpp + basis.up[0] * (midY - gesture.midY) * wpp,
				camera.target[1] - basis.right[1] * (midX - gesture.midX) * wpp + basis.up[1] * (midY - gesture.midY) * wpp,
				camera.target[2] - basis.right[2] * (midX - gesture.midX) * wpp + basis.up[2] * (midY - gesture.midY) * wpp,
			];
			gesture.distance = distance;
			gesture.midX = midX;
			gesture.midY = midY;
			invalidate();
			return;
		}

		if (gesture.kind === 'cut') {
			const { x, y } = localPointer(event);
			cutCurrent = { x, y };
			invalidate();
			return;
		}

		if (gesture.kind === 'detect') {
			detectPortion(event);
			invalidate();
			return;
		}

		if (gesture.kind === 'brush') {
			const object = selected();
			if (!object) return;
			const ray = cameraRay(camera, localPointer(event).x, localPointer(event).y, width, height);
			const hit = pickObjects([{ id: object.id, mesh: object.geometry ?? meshFor(object.type)!, position: object.position, rotation: object.rotation, scale: object.scale }], ray);
			if (!hit) return;
			const inverse = mat4Invert(mat4FromTRS(object.position, object.rotation, object.scale));
			const local = transformVec3(inverse, hit.world);
			if (gesture.op === 'paint') {
				paintAt(local);
			} else {
				const delta: Vec3 = [local[0] - gesture.lastLocal[0], local[1] - gesture.lastLocal[1], local[2] - gesture.lastLocal[2]];
				sculptAt(local, delta);
			}
			gesture.lastLocal = local;
			invalidate();
			return;
		}

		const dx = event.clientX - gesture.lastX;
		const dy = event.clientY - gesture.lastY;
		gesture.lastX = event.clientX;
		gesture.lastY = event.clientY;
		const basis = cameraBasis(camera);

		if (gesture.kind === 'orbit') {
			camera.yaw -= dx * 0.008;
			camera.pitch = clamp(camera.pitch + dy * 0.008, -1.45, 1.45);
			invalidate();
			return;
		}

		if (gesture.kind === 'pan') {
			const wpp = worldPerPixel(camera.distance, camera.fov, height);
			camera.target = [
				camera.target[0] - basis.right[0] * dx * wpp + basis.up[0] * dy * wpp,
				camera.target[1] - basis.right[1] * dx * wpp + basis.up[1] * dy * wpp,
				camera.target[2] - basis.right[2] * dx * wpp + basis.up[2] * dy * wpp,
			];
			invalidate();
			return;
		}

		const object = selected();
		if (!object || object.id !== $sceneStore.selectedId) return;
		const view = $viewportStore;

		if (gesture.kind === 'transform') {
			const drag = gesture;
			const basis = cameraBasis(camera);
			const wpp = worldPerPixel(gesture.depth, camera.fov, height);

			// In Edit Mode, dragging the gizmo translates the selected vertices/edges/faces directly
			if ($sceneStore.editMode) {
				const worldDelta: Vec3 =
					gesture.hit.kind === 'axis'
						? (() => {
								const dir = screenDirection(gesture.startPosition, gesture.axisDir, basis);
								const travel = dir ? (dx * dir.x + dy * dir.y) * wpp : 0;
								return [gesture.axisDir[0] * travel, gesture.axisDir[1] * travel, gesture.axisDir[2] * travel];
							})()
						: [
								basis.right[0] * dx * wpp - basis.up[0] * dy * wpp,
								basis.right[1] * dx * wpp - basis.up[1] * dy * wpp,
								basis.right[2] * dx * wpp - basis.up[2] * dy * wpp,
							];
				sceneStore.translateSelectedElements(worldDelta);
				invalidate();
				return;
			}

			const pointer = localPointer(event);
			const moveX = pointer.x - gesture.startX;
			const moveY = pointer.y - gesture.startY;
			const start = gesture.startPosition;
			const dragAxis = gesture.axisDir;

			const axisTravel = () => {
				const dir = screenDirection(start, dragAxis, basis);
				if (!dir) return 0;
				return (moveX * dir.x + moveY * dir.y) * wpp;
			};

			const axisPixels = () => {
				const dir = screenDirection(start, dragAxis, basis);
				if (!dir) return 0;
				return moveX * dir.x + moveY * dir.y;
			};

			const starts = drag.starts.length
				? drag.starts
				: [
						{
							id: object.id,
							position: [...object.position] as [number, number, number],
							rotation: drag.startRotation,
							scale: drag.startScale,
						},
					];

			const moveGroup = (next: [number, number, number]) => {
				const odx = next[0] - start[0];
				const ody = next[1] - start[1];
				const odz = next[2] - start[2];
				sceneStore.setTransforms(
					starts.map((item) => ({
						id: item.id,
						position: [item.position[0] + odx, item.position[1] + ody, item.position[2] + odz] as [number, number, number],
					})),
				);
			};

			const rotateGroup = (next: Quat, local: boolean) => {
				const base = eulerToQuat(drag.startRotation);
				const delta = local ? quatMul(quatConjugate(base), next) : quatMul(next, quatConjugate(base));
				sceneStore.setTransforms(
					starts.map((item) => ({
						id: item.id,
						rotation: quatToEuler(
							local ? quatMul(eulerToQuat(item.rotation), delta) : quatMul(delta, eulerToQuat(item.rotation)),
						),
					})),
				);
			};

			const scaleGroup = (next: [number, number, number]) => {
				const factors = next.map((value, index) => {
					const base = drag.startScale[index];
					return Math.abs(base) < 1e-6 ? 1 : value / base;
				});
				sceneStore.setTransforms(
					starts.map((item) => ({
						id: item.id,
						scale: [
							Math.max(0.01, item.scale[0] * factors[0]),
							Math.max(0.01, item.scale[1] * factors[1]),
							Math.max(0.01, item.scale[2] * factors[2]),
						] as [number, number, number],
					})),
				);
			};

			if (gesture.mode === 'translate') {
				if (gesture.hit.kind === 'axis') {
					let distance = axisTravel();
					if (view.snapEnabled) distance = Math.round(distance / view.snapIncrement) * view.snapIncrement;
					const next: [number, number, number] = [
						start[0] + gesture.axisDir[0] * distance,
						start[1] + gesture.axisDir[1] * distance,
						start[2] + gesture.axisDir[2] * distance,
					];
					moveGroup(next);
				} else if (gesture.hit.kind === 'plane') {
					const [first, second] = gesture.planeAxes;
					const origin = projectWorld(start, basis, camera.fov, width, height);
					const p1 = projectWorld(add(start, first), basis, camera.fov, width, height);
					const p2 = projectWorld(add(start, second), basis, camera.fov, width, height);
					const u1x = p1.x - origin.x;
					const u1y = p1.y - origin.y;
					const u2x = p2.x - origin.x;
					const u2y = p2.y - origin.y;
					const det = u1x * u2y - u2x * u1y;
					if (Math.abs(det) < 1e-6) return;
					const a1 = (moveX * u2y - u2x * moveY) / det;
					const a2 = (u1x * moveY - moveX * u1y) / det;
					let next: [number, number, number] = [
						start[0] + first[0] * a1 + second[0] * a2,
						start[1] + first[1] * a1 + second[1] * a2,
						start[2] + first[2] * a1 + second[2] * a2,
					];
					if (view.snapEnabled) {
						next = next.map((value) => Math.round(value / view.snapIncrement) * view.snapIncrement) as [number, number, number];
					}
					moveGroup(next);
				} else {
					let next: [number, number, number] = [
						start[0] + basis.right[0] * moveX * wpp - basis.up[0] * moveY * wpp,
						start[1] + basis.right[1] * moveX * wpp - basis.up[1] * moveY * wpp,
						start[2] + basis.right[2] * moveX * wpp - basis.up[2] * moveY * wpp,
					];
					if (view.snapEnabled) next = next.map((value) => Math.round(value / view.snapIncrement) * view.snapIncrement) as [number, number, number];
					moveGroup(next);
				}
				return;
			}

			if (gesture.mode === 'rotate') {
				const startQuat = eulerToQuat(gesture.startRotation);
				const local = $toolStore.space === 'local';
				const step = (view.snapAngle * Math.PI) / 180;
				const snap = (value: number) => (view.snapEnabled ? Math.round(value / step) * step : value);
				let next: Quat;

				if (gesture.hit.kind === 'ring') {
					const center = projectWorld(start, basis, camera.fov, width, height);
					const angle = screenAngle(center.x, center.y, pointer.x, pointer.y);
					let delta = angle - gesture.startAngle;
					while (delta > Math.PI) delta -= Math.PI * 2;
					while (delta < -Math.PI) delta += Math.PI * 2;
					const sign = dot(gesture.axisDir, basis.forward) >= 0 ? -1 : 1;
					const radians = snap(delta * sign);
					const axis = local
						? gesture.hit.axis === 0
							? ([1, 0, 0] as Vec3)
							: gesture.hit.axis === 1
								? ([0, 1, 0] as Vec3)
								: ([0, 0, 1] as Vec3)
						: gesture.axisDir;
					const deltaQuat = quatFromAxisAngle(axis, radians);
					next = local ? quatMul(startQuat, deltaQuat) : quatMul(deltaQuat, startQuat);
				} else {
					const yaw = snap(moveX * 0.013);
					const pitch = snap(moveY * 0.013);
					if (yaw === 0 && pitch === 0) return;
					const yawQuat = quatFromAxisAngle(basis.up, yaw);
					const pitchQuat = quatFromAxisAngle(basis.right, pitch);
					next = quatMul(pitchQuat, quatMul(yawQuat, startQuat));
				}
				rotateGroup(next, local);
				return;
			}

			const next = [...gesture.startScale] as [number, number, number];
			if (gesture.hit.kind === 'axis') {
				const factor = Math.max(0.02, 1 + axisPixels() / 160);
				next[gesture.hit.axis] = Math.max(0.02, gesture.startScale[gesture.hit.axis] * factor);
			} else {
				const center = projectWorld(start, basis, camera.fov, width, height);
				const distance = Math.hypot(pointer.x - center.x, pointer.y - center.y);
				const factor = Math.max(0.01, 1 + (distance - gesture.startDistance) / 120);
				next[0] = Math.max(0.02, gesture.startScale[0] * factor);
				next[1] = Math.max(0.02, gesture.startScale[1] * factor);
				next[2] = Math.max(0.02, gesture.startScale[2] * factor);
			}
			scaleGroup(next);
		}
		invalidate();
	}

	function endGesture(event: PointerEvent) {
		pointers.delete(event.pointerId);
		if (gizmoHover) {
			gizmoHover = null;
			invalidate();
		}
		if (gesture?.kind === 'transform' || gesture?.kind === 'brush') sceneStore.endTransform();
		if (gesture?.kind === 'cut') commitCut();
		gesture = null;
		if (pointers.size === 1) {
			const value = [...pointers.values()][0];
			gesture = { kind: 'orbit', lastX: value.x, lastY: value.y };
		}
		invalidate();
	}

	function startPinch() {
		const values = [...pointers.values()];
		if (values.length < 2) return;
		gesture = {
			kind: 'pinch',
			distance: Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y),
			midX: (values[0].x + values[1].x) / 2,
			midY: (values[0].y + values[1].y) / 2,
		};
	}

	function onWheel(event: WheelEvent) {
		event.preventDefault();
		camera.distance = clamp(camera.distance * Math.exp(event.deltaY * 0.0012), 0.5, 90);
		invalidate();
	}

	function onDoubleClick() {
		frameSelected();
	}

	function worldRadius(object: (typeof $sceneStore.objects)[number]): number {
		const mesh = object.geometry ?? meshFor(object.type);
		const scaled = Math.max(Math.abs(object.scale[0]), Math.abs(object.scale[1]), Math.abs(object.scale[2]), 0.01);
		return Math.max(0.2, (mesh?.radius ?? 0.5) * scaled);
	}

	function frameObjects(objects: { position: [number, number, number] }[] & { length: number }) {
		if (!objects.length) {
			camera.target = [...DEFAULT_CAMERA.target] as Vec3;
			camera.yaw = DEFAULT_CAMERA.yaw;
			camera.pitch = DEFAULT_CAMERA.pitch;
			camera.distance = DEFAULT_CAMERA.distance;
			invalidate();
			return;
		}
		let minX = Infinity, minY = Infinity, minZ = Infinity;
		let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
		for (const object of objects) {
			const radius = worldRadius(object as (typeof $sceneStore.objects)[number]);
			minX = Math.min(minX, object.position[0] - radius);
			minY = Math.min(minY, object.position[1] - radius);
			minZ = Math.min(minZ, object.position[2] - radius);
			maxX = Math.max(maxX, object.position[0] + radius);
			maxY = Math.max(maxY, object.position[1] + radius);
			maxZ = Math.max(maxZ, object.position[2] + radius);
		}
		const centre: Vec3 = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
		const radius = Math.max(0.5, Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2);
		const vertical = (camera.fov * Math.PI) / 360;
		const horizontal = Math.atan(Math.tan(vertical) * Math.max(0.35, width / Math.max(height, 1)));
		camera.target = centre;
		camera.distance = clamp((radius / Math.sin(Math.min(vertical, horizontal))) * 1.15, radius * 1.2 + 0.4, 400);
		invalidate();
	}

	function frameSelected() {
		const objects = selectedObjects();
		frameObjects(objects.length ? objects : []);
	}

	function frameAll() {
		const objects = $sceneStore.objects.filter(
			(object) => object.visible && !object.timelineHidden && object.type !== 'light' && object.type !== 'camera',
		);
		frameObjects(objects);
	}

	function triangleCount(): number {
		let total = 0;
		for (const object of $sceneStore.objects) {
			if (!object.visible || object.timelineHidden) continue;
			const mesh = object.geometry ?? meshFor(object.type);
			if (!mesh) continue;
			let count = triangleCache.get(mesh);
			if (count === undefined) {
				count = 0;
				for (const face of mesh.faces) count += Math.max(0, face.length - 2);
				triangleCache.set(mesh, count);
			}
			total += count;
		}
		return total;
	}

	function capture() {
		if (!renderer) return;
		render();
		const link = document.createElement('a');
		link.href = renderer.snapshot();
		link.download = `toon-studio-${Date.now()}.png`;
		document.body.appendChild(link);
		link.click();
		link.remove();
	}

	onMount(() => {
		try {
			renderer = new GLRenderer(canvas);
		} catch (error) {
			glError = error instanceof Error ? error.message : String(error);
		}
		resizeObserver = new ResizeObserver(resize);
		resizeObserver.observe(canvas);
		canvas.addEventListener('wheel', onWheel, { passive: false });
		window.addEventListener('toon:capture', capture);
		window.addEventListener('toon:frame-selected', frameSelected);
		window.addEventListener('toon:frame-all', frameAll);
		resize();
		raf = requestAnimationFrame(loop);
	});

	onDestroy(() => {
		cancelAnimationFrame(raf);
		resizeObserver?.disconnect();
		canvas?.removeEventListener('wheel', onWheel);
		window.removeEventListener('toon:capture', capture);
		window.removeEventListener('toon:frame-selected', frameSelected);
		window.removeEventListener('toon:frame-all', frameAll);
		renderer?.dispose();
		renderer = null;
	});
</script>

<canvas
	bind:this={canvas}
	class="viewport-canvas w-full h-full"
	style="touch-action: none;"
	aria-label="3D Viewport"
	data-testid="viewport"
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={endGesture}
	onpointercancel={endGesture}
	onpointerleave={(event) => {
		if (event.buttons === 0) endGesture(event);
	}}
	ondblclick={onDoubleClick}
	oncontextmenu={(event) => event.preventDefault()}
></canvas>

{#if glError}
	<div class="gl-error" data-testid="gl-error">WebGL2 unavailable: {glError}</div>
{/if}

{#if $viewportStore.viewThroughCamera && activeSceneCam}
	<div id="cam-safe-frame" class="safe-frame-overlay" data-testid="cam-safe-frame">
		<div class="safe-frame-grid"><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div></div>
		<div id="cam-hud-badge" class="cam-hud-badge" data-testid="cam-hud-badge">
			CAM: {activeSceneCam.name} · {Math.round(fovToFocalLength(activeSceneCam.cameraProps?.fov ?? 50))}mm · FOV {activeSceneCam.cameraProps?.fov ?? 50}°
		</div>
	</div>
{/if}

<div class="view-presets" role="group" aria-label="Camera Presets" data-testid="view-presets">
	<button class:on={$viewportStore.viewThroughCamera} onclick={() => setCameraPreset('camera')} aria-label="Cam" title="View Through Active Camera (Cam)"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg></button>
	<button onclick={() => setCameraPreset('front')} aria-label="Front" title="Front View"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/></svg></button>
	<button onclick={() => setCameraPreset('right')} aria-label="Right" title="Right View"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg></button>
	<button onclick={() => setCameraPreset('left')} aria-label="Left" title="Left View"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/></svg></button>
	<button onclick={() => setCameraPreset('top')} aria-label="Up" title="Top / Up View"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg></button>
	<button onclick={() => setCameraPreset('bottom')} aria-label="Down" title="Bottom / Down View"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M6 13l6 6 6-6"/></svg></button>
	<button onclick={() => setCameraPreset('iso')} aria-label="3D" title="3D Perspective View"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L3 7v10l9 5 9-5V7l-9-5z"/><polyline points="3.3 7 12 12 20.7 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg></button>
</div>

<div class="viewport-hints" data-testid="viewport-hints" aria-live="polite">{toolHintText}</div>

{#if !$sceneStore.editMode}
	<button
		class="snap-toggle"
		class:on={$viewportStore.snapEnabled}
		onclick={() => viewportStore.toggleSnap()}
		aria-label="Toggle Snap"
		aria-pressed={$viewportStore.snapEnabled}
		title="Snap to the grid"
		data-testid="viewport-snap"
	>
		{@html ICONS.snap}
	</button>
{/if}

<button
	class="snap-toggle export-video"
	onclick={exportVideo}
	disabled={exporting}
	aria-label="Export video"
	title="Export the animation as a WebM video"
	data-testid="viewport-export-video"
>
	{exporting ? '…' : 'Video'}
</button>

<div class="stats-hud" data-testid="viewport-stats" aria-live="off">
	<span>{stats.fps} fps</span>
	<span>{stats.triangles.toLocaleString()} tris</span>
	<span>{stats.objects} objs</span>
	<span class="engine">{stats.engine}</span>
</div>

{#if $sceneStore.editMode}
	<div class="element-mode" data-testid="element-mode">
		<button class:on={$sceneStore.elementMode === 'vertex'} onclick={() => sceneStore.setElementMode('vertex')} title="Vertex">Vertex</button>
		<button class:on={$sceneStore.elementMode === 'edge'} onclick={() => sceneStore.setElementMode('edge')} title="Edge">Edge</button>
		<button class:on={$sceneStore.elementMode === 'face'} onclick={() => sceneStore.setElementMode('face')} title="Face">Face</button>
	</div>
{/if}

{#if $sceneStore.selectedId && !$sceneStore.editMode && ($workspaceStore.current === 'scl' || $workspaceStore.current === 'uvp')}
	<div class="brush-badge" data-testid="brush-badge">{$brushStore.kind} · r{$brushStore.radius.toFixed(2)} · s{$brushStore.strength.toFixed(2)}</div>
{/if}

<style>
	:global(.stats-hud .engine) {
		color: var(--ac);
		text-transform: uppercase;
	}

	:global(.stats-hud) {
		position: absolute;
		right: 12px;
		bottom: calc(var(--dh, 120px) + 14px);
		display: flex;
		gap: 8px;
		padding: 4px 8px;
		border-radius: 7px;
		background: rgba(13, 15, 20, 0.55);
		color: var(--tx3);
		font: 600 9.5px ui-monospace, SFMono-Regular, monospace;
		letter-spacing: 0.02em;
		pointer-events: none;
		z-index: 9;
	}

	.view-presets {
		position: absolute;
		right: 0px;
		top: 46px;
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 18px;
		gap: 1px;
		padding: 2px 1px;
		border-radius: 6px 0 0 6px;
		background: rgba(13, 15, 20, 0.86);
		border: 1px solid var(--ln);
		border-right: 0;
		z-index: 8;
	}

	.view-presets button {
		width: 16px;
		height: 16px;
		min-width: 16px;
		padding: 0;
		margin: 0;
		border: 0;
		border-radius: 3px;
		background: transparent;
		color: var(--tx2);
		display: grid;
		place-items: center;
		cursor: pointer;
	}

	.view-presets button:hover {
		background: var(--bg3);
		color: var(--ac);
	}

	.viewport-hints {
		position: absolute;
		left: 98px;
		bottom: calc(var(--dh, 92px) + 14px);
		padding: 4px 9px;
		border-radius: 8px;
		background: rgba(13, 15, 20, 0.52);
		color: var(--tx3);
		font: 600 10px Inter, system-ui, sans-serif;
		pointer-events: none;
		z-index: 4;
		white-space: nowrap;
	}

	@media (max-width: 600px) {
		.viewport-hints {
			display: none;
		}
	}

	.viewport-canvas {
		display: block;
		width: 100%;
		height: 100%;
		touch-action: none;
		cursor: grab;
	}

	.gl-error {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #ff9a9a;
		font: 600 13px Inter, system-ui, sans-serif;
		pointer-events: none;
	}

	.snap-toggle {
		position: absolute;
		bottom: calc(var(--dh) + 10px);
		left: 10px;
		z-index: 4;
		width: 30px;
		height: 30px;
		display: grid;
		place-items: center;
		padding: 0;
		border-radius: 10px;
		background: rgba(12, 12, 12, 0.66);
		border: 1px solid #1f1f1f;
		color: #6f7681;
		cursor: pointer;
	}

	.snap-toggle :global(svg) {
		width: 16px;
		height: 16px;
	}

	.snap-toggle:hover {
		color: #dfe3ea;
	}

	.snap-toggle.on {
		color: var(--ac);
		border-color: color-mix(in srgb, var(--ac) 40%, transparent);
		background: color-mix(in srgb, var(--ac) 12%, rgba(12, 12, 12, 0.66));
	}

	.snap-toggle.export-video {
		left: 46px;
		width: 44px;
		font: 700 9px Inter, system-ui, sans-serif;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.element-mode {
		position: absolute;
		top: 46px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		gap: 2px;
		padding: 2px;
		background: var(--bg0, #14161d);
		border: 1px solid var(--ln, #262a36);
		border-radius: 10px;
		z-index: 4;
	}

	.element-mode button {
		height: 26px;
		padding: 0 10px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--tx2, #9aa3b8);
		font: 600 11px Inter, system-ui, sans-serif;
		cursor: pointer;
	}

	.element-mode button.on {
		background: var(--ac, #3dd9a8);
		color: #0b0c10;
	}

	.brush-badge {
		position: absolute;
		bottom: 10px;
		left: 50%;
		transform: translateX(-50%);
		padding: 4px 10px;
		background: rgba(11, 12, 16, 0.72);
		border: 1px solid var(--ln, #262a36);
		border-radius: 10px;
		color: var(--tx2, #9aa3b8);
		font: 600 11px Inter, system-ui, sans-serif;
		pointer-events: none;
		z-index: 4;
	}
</style>
