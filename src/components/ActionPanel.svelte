<script lang="ts">
	import { get } from 'svelte/store';
	import { PRIMITIVES, defaultCreationParams, sceneStore, selectedObject } from '../stores/scene';
	import type { CreationParams, Material, SceneObject } from '../stores/scene';
	import { timelineStore } from '../stores/timeline';
	import { viewportStore } from '../stores/viewport';
	import { workspaceStore } from '../stores/workspace';
	import { uiStore } from '../stores/ui';
	import { toolStore } from '../stores/tools';
	import { brushStore, type BrushFalloff, type BrushKind } from '../stores/brush';
	import { physicsStore } from '../stores/physics';
	import { ICONS } from '../lib/constants';
	import { formatClock } from '../lib/time';
	import { exportSceneToOBJ, exportSceneToSTL, parseOBJ, parseSTL } from '../lib/io3d';
	import MaterialLibrary from './MaterialLibrary.svelte';

	const sculptBrushes: { kind: BrushKind; label: string; icon: string }[] = [
		{ kind: 'draw', label: 'Draw', icon: 'sculpt' },
		{ kind: 'clay', label: 'Clay', icon: 'layers' },
		{ kind: 'smooth', label: 'Smooth', icon: 'spark' },
		{ kind: 'inflate', label: 'Inflate', icon: 'sphere' },
		{ kind: 'grab', label: 'Grab', icon: 'move' },
		{ kind: 'snake_hook', label: 'Snake Hook', icon: 'arc' },
		{ kind: 'pinch', label: 'Pinch', icon: 'target' },
		{ kind: 'crease', label: 'Crease', icon: 'scissors' },
		{ kind: 'flatten', label: 'Flatten', icon: 'plane' },
		{ kind: 'fill', label: 'Fill', icon: 'cube' },
		{ kind: 'mask', label: 'Mask', icon: 'eye' },
		{ kind: 'simplify', label: 'Simplify', icon: 'grid' },
	];

	let lastCreatedId = $state<string | null>(null);
	let lastCreatedType = $state<string | null>(null);
	let creationParams = $state<CreationParams>({});

	function toast(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
		uiStore.showToast(message, type, 2400);
	}

	function addPrimitive(type: string) {
		if (type === 'import_device' || type === 'import_photo') {
			const fileInput = document.getElementById('tl-universal-file') as HTMLInputElement | null;
			if (fileInput) {
				fileInput.click();
				return;
			}
		}
		const vp = get(viewportStore);
		const spawnPos: [number, number, number] = (vp.cursorVisible && vp.cursorPosition) ? [...vp.cursorPosition] : [0, 0.5, 0];
		const defaults = defaultCreationParams(type);
		sceneStore.addPrimitive(type, spawnPos, defaults);
		const state = get(sceneStore);
		lastCreatedId = state.selectedId;
		lastCreatedType = type;
		creationParams = { ...defaults };
		if (type.startsWith('camera') && state.selectedId) viewportStore.setPIPCamera(state.selectedId, 1);
		toolStore.setTool('move');
		viewportStore.setGizmoMode('translate');
	}

	function updateCreationParam(key: keyof CreationParams, value: number | string) {
		if (!lastCreatedId) return;
		creationParams = { ...creationParams, [key]: value };
		sceneStore.updateCreationParams(creationParams);
	}

	function requireSelection(action: (object: SceneObject) => void, message = 'Select an object first.') {
		const object = get(selectedObject);
		if (!object) {
			toast(message, 'warning');
			return;
		}
		action(object);
	}

	function addKeyframe() {
		requireSelection((object) => {
			const timeline = get(timelineStore);
			const time = timeline.currentTime;
			sceneStore.animationEdit(() => {
				timelineStore.addKeyframe(object.id, {
					time,
					position: [...object.position] as [number, number, number],
					rotation: [...object.rotation] as [number, number, number],
					scale: [...object.scale] as [number, number, number],
				});
			});
			timelineStore.setShow(true);
			toast(`Key added at ${time.toFixed(2)}s.`, 'success');
		});
	}

	function removeKeyframe() {
		requireSelection((object) => {
			const timeline = get(timelineStore);
			const keys = timeline.keyframes.get(object.id) || [];
			if (!keys.length) {
				toast('This object has no keys.', 'warning');
				return;
			}
			const nearest = keys.reduce((best, key) =>
				Math.abs(key.time - timeline.currentTime) < Math.abs(best.time - timeline.currentTime) ? key : best,
			);
			sceneStore.animationEdit(() => timelineStore.removeKeyframe(object.id, nearest.time));
			toast('Nearest key removed.', 'success');
		});
	}

	function dropToFloor() {
		requireSelection((object) => {
			sceneStore.animationEdit(() => {
				timelineStore.addKeyframe(object.id, {
					time: 0,
					position: [...object.position] as [number, number, number],
					rotation: [...object.rotation] as [number, number, number],
					scale: [...object.scale] as [number, number, number],
				});
				timelineStore.addKeyframe(object.id, {
					time: 1,
					position: [object.position[0], 0.5, object.position[2]],
					rotation: [...object.rotation] as [number, number, number],
					scale: [...object.scale] as [number, number, number],
				});
			});
			timelineStore.setShow(true);
			timelineStore.setDuration(Math.max(1, get(timelineStore).duration));
			timelineStore.setTime(0);
			timelineStore.setPlaying(true);
			toast(`Dropping ${object.name}.`, 'success');
		});
	}

	function bakePhysics() {
		const state = get(sceneStore);
		const hasDynamic = state.objects.some((o) => o.physics.dynamic);
		if (!hasDynamic && state.selectedId) {
			sceneStore.setPhysics(state.selectedId, { dynamic: true });
		}
		const count = sceneStore.bakePhysicsToKeyframes(3, 15, get(physicsStore).gravity);
		if (!count) {
			toast('Set at least one object to Dynamic before baking physics.', 'warning');
			return;
		}
		timelineStore.setShow(true);
		timelineStore.setTime(0);
		timelineStore.setPlaying(true);
		toast(`Baked physics to keyframes for ${count} object${count === 1 ? '' : 's'}.`, 'success');
	}

	function downloadText(content: string, filename: string, mime = 'text/plain') {
		const blob = new Blob([content], { type: mime });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	function exportOBJ() {
		const objects = get(sceneStore).objects;
		if (!objects.length) {
			toast('Add an object before exporting.', 'warning');
			return;
		}
		downloadText(exportSceneToOBJ(objects), 'toon-studio-scene.obj');
		toast('Exported scene as .OBJ.', 'success');
	}

	function exportSTL() {
		const objects = get(sceneStore).objects;
		if (!objects.length) {
			toast('Add an object before exporting.', 'warning');
			return;
		}
		downloadText(exportSceneToSTL(objects), 'toon-studio-scene.stl');
		toast('Exported scene as .STL.', 'success');
	}

	async function import3DFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			const text = await file.text();
			const mesh = file.name.toLowerCase().endsWith('.stl') ? parseSTL(text) : parseOBJ(text);
			if (!mesh) {
				toast('Could not parse 3D geometry from that file.', 'warning');
				return;
			}
			sceneStore.importMeshObject(file.name, mesh);
			toast(`Imported ${file.name} (${mesh.vertices.length} verts).`, 'success');
		} catch {
			toast('Failed to read the 3D file.', 'error');
		} finally {
			input.value = '';
		}
	}

	function togglePiP() {
		const view = get(viewportStore);
		if (view.pipCamera) {
			viewportStore.setPIPCamera(null, 0);
			toast('Camera preview hidden.', 'info');
			return;
		}
		const state = get(sceneStore);
		const camera = state.objects.find((object) => object.type === 'camera');
		if (camera) {
			viewportStore.setPIPCamera(camera.id, 1);
			toast('Camera preview enabled.', 'success');
			return;
		}
		sceneStore.addPrimitive('camera');
		const selectedId = get(sceneStore).selectedId;
		if (selectedId) viewportStore.setPIPCamera(selectedId, 1);
		toast('Camera added with a live preview.', 'success');
	}

	function snapshot() {
		window.dispatchEvent(new CustomEvent('toon:capture'));
		toast('Saving a PNG snapshot…', 'success');
	}

	let editSubTab = $state<'Quick' | 'Mesh' | 'Transform' | 'Modifiers' | 'Object'>('Quick');
	let activeParam = $state<string | null>(null);
	let bevelWidth = $state(0.05);
	let bevelSegments = $state(1);
	let loopCuts = $state(1);
	let insetAmount = $state(0.18);
	let decimateRatio = $state(0.5);
	let solidifyThick = $state(0.12);
	let smoothIter = $state(2);
	let arrayCount = $state(3);
	let screwAngle = $state(360);
	let screwPitch = $state(0.5);
	let booleanOp = $state<'difference' | 'union' | 'intersect'>('difference');
	let axisConstraint = $state<'all' | 'x' | 'y' | 'z'>('all');
	let uniformScale = $state(true);
	let selectionMode = $state<'single' | 'box' | 'lasso'>('single');
	let extrudeAmount = $state(0.35);
	let allPrimitives = $state(false);
	let addSubTab = $state<'Mesh' | 'Curve' | 'Light' | 'Camera' | 'Empty' | 'Text' | 'Import' | 'More'>('Mesh');

	const shownPrimitives = $derived(allPrimitives ? PRIMITIVES : PRIMITIVES.slice(0, 4));

	function extrudeSelected(amount: number) {
		requireSelection((object) => {
			const state = get(sceneStore);
			const faces =
				state.markedObjectId === object.id && state.markedFaces.length ? state.markedFaces : state.selectedFaces;
			if (!faces.length) {
				toast('Select faces or mark a portion first.', 'warning');
				return;
			}
			sceneStore.extrudePortion(object.id, faces, amount);
			toast(amount >= 0 ? 'Portion pulled out.' : 'Portion pushed in.', 'success');
		});
	}

	function addStrip() {
		requireSelection((object) => {
			const timeline = get(timelineStore);
			sceneStore.animationEdit(() =>
				timelineStore.addStrip(object.id, timeline.currentTime),
			);
			timelineStore.setShow(true);
			toast('Action strip added.', 'success');
		});
	}

	function meshOp(op: string, params: Record<string, unknown> = {}) {
		requireSelection(() => {
			const failure = sceneStore.meshOp(op, params);
			if (failure) {
				toast(failure, 'warning');
				return;
			}
			const label = op === 'loopcut' ? 'Loop cut' : op === 'bevel' ? 'Bevel' : `${op[0].toUpperCase()}${op.slice(1)}`;
			toast(`${label} applied.`, 'success');
		});
	}

	function setMaterial(patch: Partial<Material>) {
		requireSelection((object) => sceneStore.setMaterial(object.id, patch));
	}

	function setPhysics(patch: Record<string, unknown>) {
		requireSelection((object) => sceneStore.setPhysics(object.id, patch));
	}

	function togglePhysicsRun() {
		const next = !get(physicsStore).running;
		physicsStore.setRunning(next);
		toast(next ? 'Physics running.' : 'Physics paused.', next ? 'success' : 'info');
	}

	function resetPhysics() {
		sceneStore.resetPhysics();
		physicsStore.setRunning(false);
		toast('Physics reset.', 'success');
	}

	const chip = $derived($workspaceStore.current);
	const chipIndex = $derived($workspaceStore.chipIndices[chip] ?? 0);
	const material = $derived($selectedObject?.material);
	const body = $derived($selectedObject?.physics);
	const keyCount = $derived(
		$selectedObject ? ($timelineStore.keyframes.get($selectedObject.id)?.length ?? 0) : 0,
	);

	$effect(() => {
		const workspace = $workspaceStore.current;
		const index = $workspaceStore.chipIndices[workspace] ?? 0;
		if (workspace === 'mod' && index === 4) timelineStore.setShow(true);
	});
</script>

<div class="ap-crossover-bar" data-testid="crossover-bar">
	<button class="ap-cross-pill" class:on={chip === 'mod' && chipIndex === 0} onclick={() => workspaceStore.setChip('mod', 0)}>{@html ICONS.plus}<span>+ Primitives</span></button>
	<button class="ap-cross-pill" class:on={chip === 'mod' && chipIndex === 1} onclick={() => { workspaceStore.setChip('mod', 1); sceneStore.setEditMode(true); }}>{@html ICONS.pencil}<span>Edit Tools</span></button>
	<button class="ap-cross-pill" class:on={chip === 'mod' && chipIndex === 3} onclick={() => workspaceStore.setChip('mod', 3)}>{@html ICONS.bone}<span>Rig Bones</span></button>
	<button class="ap-cross-pill" class:on={chip === 'mod' && chipIndex === 2} onclick={() => workspaceStore.setChip('mod', 2)}>{@html ICONS.sculpt}<span>Sculpt</span></button>
	<button class="ap-cross-pill" class:on={chip === 'mod' && chipIndex === 5} onclick={() => workspaceStore.setChip('mod', 5)}>{@html ICONS.eye}<span>Materials</span></button>
	<button class="ap-cross-pill" onclick={() => workspaceStore.setChip('mod', 0)}>{@html ICONS.spark}<span>All-in-One</span></button>
</div>

{#if chip === 'mod'}
	{#if chipIndex === 0}
		<div class="ap-crossover-bar add-sub-nav" data-testid="add-sub-nav">
			<button class="ap-cross-pill" class:on={addSubTab === 'Mesh'} onclick={() => (addSubTab = 'Mesh')}><span>Mesh</span></button>
			<button class="ap-cross-pill" class:on={addSubTab === 'Curve'} onclick={() => (addSubTab = 'Curve')}><span>Curve</span></button>
			<button class="ap-cross-pill" class:on={addSubTab === 'Light'} onclick={() => (addSubTab = 'Light')}><span>Light</span></button>
			<button class="ap-cross-pill" class:on={addSubTab === 'Camera'} onclick={() => (addSubTab = 'Camera')}><span>Camera</span></button>
			<button class="ap-cross-pill" class:on={addSubTab === 'Empty'} onclick={() => (addSubTab = 'Empty')}><span>Empty</span></button>
			<button class="ap-cross-pill" class:on={addSubTab === 'Text'} onclick={() => (addSubTab = 'Text')}><span>Text</span></button>
			<button class="ap-cross-pill" class:on={addSubTab === 'Import'} onclick={() => (addSubTab = 'Import')}><span>Import</span></button>
			<button class="ap-cross-pill" class:on={addSubTab === 'More'} onclick={() => (addSubTab = 'More')}><span>More</span></button>
		</div>

		{#if lastCreatedId && $selectedObject?.id === lastCreatedId && lastCreatedType && Object.keys(creationParams).length > 0}
			<div class="edit-param-drawer" data-testid="add-param-drawer">
				<span class="param-title">{lastCreatedType.toUpperCase()}:</span>
				{#if creationParams.radius !== undefined}
					<label class="arange">Radius<input type="range" min="0.1" max="3" step="0.05" value={creationParams.radius} oninput={(e) => updateCreationParam('radius', Number(e.currentTarget.value))} /></label>
				{/if}
				{#if creationParams.height !== undefined}
					<label class="arange">Height<input type="range" min="0.1" max="4" step="0.05" value={creationParams.height} oninput={(e) => updateCreationParam('height', Number(e.currentTarget.value))} /></label>
				{/if}
				{#if creationParams.segments !== undefined}
					<label class="arange">Segs<input type="range" min="3" max="64" step="1" value={creationParams.segments} oninput={(e) => updateCreationParam('segments', Number(e.currentTarget.value))} /></label>
				{/if}
				{#if creationParams.rings !== undefined}
					<label class="arange">Rings<input type="range" min="3" max="32" step="1" value={creationParams.rings} oninput={(e) => updateCreationParam('rings', Number(e.currentTarget.value))} /></label>
				{/if}
				{#if creationParams.subdivisions !== undefined}
					<label class="arange">Subdiv<input type="range" min="1" max="16" step="1" value={creationParams.subdivisions} oninput={(e) => updateCreationParam('subdivisions', Number(e.currentTarget.value))} /></label>
				{/if}
				{#if creationParams.depth !== undefined}
					<label class="arange">Depth<input type="range" min="0.02" max="1" step="0.02" value={creationParams.depth} oninput={(e) => updateCreationParam('depth', Number(e.currentTarget.value))} /></label>
				{/if}
				<button class="pa" onclick={() => { lastCreatedId = null; lastCreatedType = null; }}>Done</button>
			</div>
		{/if}

		<div class="ap primitives" data-testid="primitive-panel">
			{#each PRIMITIVES.filter(p => p.category === addSubTab) as primitive}
				<button
					class="pa"
					class:on={$selectedObject?.type === primitive.type}
					onclick={() => addPrimitive(primitive.type)}
					title={primitive.label}
					aria-label={primitive.label}
					data-testid="add-{primitive.type}"
				>
					{@html ICONS[primitive.icon] || ICONS.cube}
					<span>{primitive.label}</span>
				</button>
			{/each}
			{#if addSubTab === 'Camera'}
				<button class="pa" onclick={() => {
					const cam = $sceneStore.objects.find(o => o.type.startsWith('camera'));
					if (cam) viewportStore.setPIPCamera(cam.id, 1);
				}} data-testid="cam-toggle-view">
					{@html ICONS.camera}<span>View Camera</span>
				</button>
			{:else if addSubTab === 'Text'}
				<button class="pa" onclick={() => sceneStore.addTextLayer('Text Layer')} data-testid="add-text-layer">
					{@html ICONS.text}<span>Text Layer</span>
				</button>
			{:else if addSubTab === 'More'}
				<button class="pa" onclick={() => sceneStore.addBoneChain(3)} data-testid="add-bone-chain">
					{@html ICONS.bone}<span>3-Bone Chain</span>
				</button>
			{/if}
		</div>
	{:else if chipIndex === 1}
		<div class="ap">
			<button class="pa" onclick={() => sceneStore.duplicateSelected()} title="Duplicate (Ctrl+D)" data-testid="duplicate">{@html ICONS.plus}<span>Duplicate</span></button>
			<button class="pa" onclick={() => sceneStore.deleteSelected()} title="Delete (Del)" data-testid="delete">{@html ICONS.trash}<span>Delete</span></button>
			<button class="pa" onclick={() => sceneStore.mirrorSelected('x')} title="Mirror on X">{@html ICONS.scale}<span>Mirror X</span></button>
			<button class="pa" onclick={() => sceneStore.mirrorSelected('y')} title="Mirror on Y">{@html ICONS.scale}<span>Mirror Y</span></button>
		</div>
	{:else if chipIndex === 2}
		{@render SculptControls()}
	{:else if chipIndex === 3}
		<div class="ap">
			<button class="pa" onclick={() => addPrimitive('bone')} title="Add bone" data-testid="add-bone">{@html ICONS.bone}<span>Bone</span></button>
			<button class="pa" onclick={() => sceneStore.addBoneChain(3)} title="Add 3-bone chain">{@html ICONS.rig}<span>Bone Chain</span></button>
			<button class="pa" onclick={() => requireSelection((o) => { sceneStore.bindArmature(o.id); toast('Bound skin to armature!', 'success'); })} title="Bind Skin">{@html ICONS.layers}<span>Bind Skin</span></button>
			<button class="pa" onclick={() => sceneStore.mirrorSelected('x')} title="Mirror rig on X">{@html ICONS.scale}<span>Mirror X</span></button>
		</div>
	{:else if chipIndex === 4}
		<div class="ap anim" data-testid="anim-panel">
			<button
				class="pa"
				class:on={$timelineStore.show}
				onclick={() => timelineStore.setShow(!$timelineStore.show)}
				title="Toggle Timeline"
				data-testid="anim-timeline"
			>
				{@html ICONS.timeline}<span>{$timelineStore.show ? 'Hide Timeline' : 'Show Timeline'}</span>
			</button>
			<button
				class="pa"
				onclick={() => {
					let cam = $sceneStore.objects.find((o) => o.type.startsWith('camera'));
					if (!cam) { sceneStore.addPrimitive('camera', [0, 2.5, 6]); cam = $sceneStore.objects.find((o) => o.type.startsWith('camera')); }
					const target = $sceneStore.objects.find((o) => o.id === $sceneStore.selectedId && !o.type.startsWith('camera')) ?? $sceneStore.objects.find((o) => !o.type.startsWith('camera') && !o.type.startsWith('light'));
					if (cam && target) { sceneStore.setCameraProps(cam.id, { targetId: target.id, trackingMode: 'look_at' }); toast(`Camera tracking ${target.name}`, 'success'); }
				}}
				title="Camera Tracking"
			>
				{@html ICONS.camera}<span>Camera Tracking</span>
			</button>
			<button
				class="pa"
				class:on={$viewportStore.viewThroughCamera}
				onclick={() => viewportStore.toggleViewThroughCamera()}
				title="View Through Camera"
			>
				{@html ICONS.eye}<span>View Through Cam</span>
			</button>
			<button
				class="pa"
				onclick={() => {
					const st = get(sceneStore);
					if (!st.objects.some((o) => o.physics.dynamic) && st.selectedId) sceneStore.setPhysics(st.selectedId, { dynamic: true });
					const cnt = sceneStore.bakePhysicsToKeyframes(5, 15, get(physicsStore).gravity);
					if (cnt) { timelineStore.setShow(true); timelineStore.setTime(0); toast(`Baked physics trajectory for ${cnt} object(s).`, 'success'); }
				}}
				title="Bake Physics to Keys"
			>
				{@html ICONS.spark}<span>Bake Physics to Keys</span>
			</button>
			<button
				class="pa"
				onclick={() => requireSelection((o) => {
					sceneStore.animationEdit(() => {
						timelineStore.addKeyframe(o.id, { time: 0, position: [...o.position] as [number,number,number], rotation: [0,0,0], scale: [...o.scale] as [number,number,number] });
						timelineStore.addKeyframe(o.id, { time: 4, position: [...o.position] as [number,number,number], rotation: [0,Math.PI*2,0], scale: [...o.scale] as [number,number,number] });
					});
					toast('Added Spin driver keys!', 'success');
				})}
				title="Driver: Spin"
			>
				{@html ICONS.rotate}<span>Driver: Spin</span>
			</button>
			<button
				class="pa"
				onclick={() => requireSelection((o) => {
					sceneStore.animationEdit(() => {
						timelineStore.addKeyframe(o.id, { time: 0, position: [...o.position] as [number,number,number], rotation: [...o.rotation] as [number,number,number], scale: [...o.scale] as [number,number,number] });
						timelineStore.addKeyframe(o.id, { time: 1, position: [o.position[0], o.position[1]+1.5, o.position[2]], rotation: [...o.rotation] as [number,number,number], scale: [...o.scale] as [number,number,number] });
						timelineStore.addKeyframe(o.id, { time: 2, position: [...o.position] as [number,number,number], rotation: [...o.rotation] as [number,number,number], scale: [...o.scale] as [number,number,number] });
					});
					toast('Added Bounce driver keys!', 'success');
				})}
				title="Driver: Bounce"
			>
				{@html ICONS.arc}<span>Driver: Bounce</span>
			</button>
		</div>
	{:else}
		{@render ShadeControls({ setMaterial, material })}
	{/if}
{:else if chip === 'edt'}
		<div class="ap-crossover-bar" data-testid="edit-sub-nav">
			<button class="ap-cross-pill" class:on={editSubTab === 'Quick'} onclick={() => (editSubTab = 'Quick')} data-testid="sub-quick">{@html ICONS.spark}<span>Quick Access</span></button>
			<button class="ap-cross-pill" class:on={editSubTab === 'Mesh'} onclick={() => (editSubTab = 'Mesh')} data-testid="sub-mesh">{@html ICONS.cube}<span>Mesh Tools</span></button>
			<button class="ap-cross-pill" class:on={editSubTab === 'Transform'} onclick={() => (editSubTab = 'Transform')} data-testid="sub-transform">{@html ICONS.target}<span>Transform</span></button>
			<button class="ap-cross-pill" class:on={editSubTab === 'Modifiers'} onclick={() => (editSubTab = 'Modifiers')} data-testid="sub-modifiers">{@html ICONS.layers}<span>Modifiers</span></button>
			<button class="ap-cross-pill" class:on={editSubTab === 'Object'} onclick={() => (editSubTab = 'Object')} data-testid="sub-object">{@html ICONS.frame}<span>Object Level</span></button>
		</div>

		{#if activeParam}
			<div class="edit-param-drawer" data-testid="param-drawer">
				<span class="param-title">{activeParam.toUpperCase()}:</span>
				{#if activeParam === 'extrude'}
					<label class="arange">Dist<input type="range" min="-1" max="1" step="0.02" bind:value={extrudeAmount} /></label>
					<button class="pa on" onclick={() => { meshOp('extrude', { amount: extrudeAmount }); activeParam = null; }}>Apply</button>
				{:else if activeParam === 'bevel'}
					<label class="arange">Width<input type="range" min="0.01" max="0.3" step="0.01" bind:value={bevelWidth} /></label>
					<label class="arange">Seg<input type="range" min="1" max="6" step="1" bind:value={bevelSegments} /></label>
					<button class="pa on" onclick={() => { meshOp('bevel', { amount: bevelWidth, segments: bevelSegments }); activeParam = null; }}>Apply</button>
				{:else if activeParam === 'loopcut'}
					<label class="arange">Cuts<input type="range" min="1" max="8" step="1" bind:value={loopCuts} /></label>
					<button class="pa on" onclick={() => { meshOp('loopcut', { amount: loopCuts, cuts: loopCuts }); activeParam = null; }}>Apply</button>
				{:else if activeParam === 'inset'}
					<label class="arange">Thick<input type="range" min="0.02" max="0.5" step="0.02" bind:value={insetAmount} /></label>
					<button class="pa on" onclick={() => { meshOp('inset', { amount: insetAmount }); activeParam = null; }}>Apply</button>
				{:else if activeParam === 'decimate'}
					<label class="arange">Ratio<input type="range" min="0.1" max="0.9" step="0.05" bind:value={decimateRatio} /></label>
					<button class="pa on" onclick={() => { meshOp('decimate', { ratio: decimateRatio }); activeParam = null; }}>Apply</button>
				{:else if activeParam === 'solidify'}
					<label class="arange">Thick<input type="range" min="0.02" max="0.5" step="0.02" bind:value={solidifyThick} /></label>
					<button class="pa on" onclick={() => { meshOp('solidify', { amount: solidifyThick }); activeParam = null; }}>Apply</button>
				{:else if activeParam === 'smooth'}
					<label class="arange">Iter<input type="range" min="1" max="6" step="1" bind:value={smoothIter} /></label>
					<button class="pa on" onclick={() => { meshOp('smooth', { amount: smoothIter }); activeParam = null; }}>Apply</button>
				{:else if activeParam === 'screw'}
					<label class="arange">Pitch<input type="range" min="0" max="2" step="0.1" bind:value={screwPitch} /></label>
					<button class="pa on" onclick={() => { meshOp('screw', { pitch: screwPitch, angle: screwAngle }); activeParam = null; }}>Apply</button>
				{/if}
				<button class="pa" onclick={() => (activeParam = null)}>Cancel</button>
			</div>
		{/if}

		{#if editSubTab === 'Quick'}
			<div class="ap" data-testid="quick-access-tools">
				<!-- 1. Move -->
				<button class="pa" class:on={$toolStore.current === 'move'} onclick={() => { toolStore.setTool('move'); viewportStore.setGizmoMode('translate'); }} data-testid="qa-move">
					{@html ICONS.move || ICONS.target}<span>Move</span>
				</button>
				<!-- 2. Rotate -->
				<button class="pa" class:on={$toolStore.current === 'rotate'} onclick={() => { toolStore.setTool('rotate'); viewportStore.setGizmoMode('rotate'); }} data-testid="qa-rotate">
					{@html ICONS.rotate}<span>Rotate</span>
				</button>
				<!-- 3. Scale -->
				<button class="pa" class:on={$toolStore.current === 'scale'} onclick={() => { toolStore.setTool('scale'); viewportStore.setGizmoMode('scale'); }} data-testid="qa-scale">
					{@html ICONS.scale}<span>Scale</span>
				</button>
				<!-- 4. Extrude -->
				<button class="pa" onclick={() => (activeParam = activeParam === 'extrude' ? null : 'extrude')} data-testid="qa-extrude">
					{@html ICONS.plus}<span>Extrude</span>
				</button>
				<!-- 5. Bevel -->
				<button class="pa" onclick={() => (activeParam = activeParam === 'bevel' ? null : 'bevel')} data-testid="qa-bevel">
					{@html ICONS.cube}<span>Bevel</span>
				</button>
				<!-- 6. Loop Cut -->
				<button class="pa" onclick={() => (activeParam = activeParam === 'loopcut' ? null : 'loopcut')} data-testid="qa-loopcut">
					{@html ICONS.scissors}<span>Loop Cut</span>
				</button>
				<!-- 7. Delete -->
				<button class="pa" onclick={() => { if ($sceneStore.editMode) { meshOp('delete'); } else { sceneStore.deleteSelected(); } }} data-testid="qa-delete">
					{@html ICONS.trash}<span>Delete</span>
				</button>
				<!-- 8. Duplicate -->
				<button class="pa" onclick={() => { if ($sceneStore.editMode) { meshOp('duplicate'); } else { sceneStore.duplicateSelected(); } }} data-testid="qa-duplicate">
					{@html ICONS.layers}<span>Duplicate</span>
				</button>
			</div>
		{:else if editSubTab === 'Mesh'}
			<div class="ap" data-testid="mesh-tools">
				<div class="asg">
					<button class="s" class:on={$sceneStore.elementMode === 'vertex'} onclick={() => sceneStore.setElementMode('vertex')} data-testid="mode-vertex">Vertex</button>
					<button class="s" class:on={$sceneStore.elementMode === 'edge'} onclick={() => sceneStore.setElementMode('edge')} data-testid="mode-edge">Edge</button>
					<button class="s" class:on={$sceneStore.elementMode === 'face'} onclick={() => sceneStore.setElementMode('face')} data-testid="mode-face">Face</button>
				</div>
				<div class="asg">
					<button class="s" onclick={() => sceneStore.invertSelection()} title="Invert Selection">Invert</button>
					<button class="s" onclick={() => sceneStore.selectLinked()} title="Select Linked">Linked</button>
					<button class="s" onclick={() => sceneStore.selectLoop()} title="Select Loop">Loop</button>
					<button class="s" onclick={() => sceneStore.selectRing()} title="Select Ring">Ring</button>
					<button class="s" onclick={() => sceneStore.selectSimilar('normal')} title="Select Similar">Similar</button>
				</div>
				<button class="pa" onclick={() => (activeParam = 'extrude')}>Extrude</button>
				<button class="pa" onclick={() => (activeParam = 'inset')}>Inset</button>
				<button class="pa" onclick={() => (activeParam = 'bevel')}>Bevel</button>
				<button class="pa" onclick={() => (activeParam = 'loopcut')}>Loop Cut</button>
				<button class="pa" class:on={$toolStore.current === 'cut'} onclick={() => toolStore.setTool('cut')}>Knife</button>
				<button class="pa" onclick={() => meshOp('bridge')}>Bridge</button>
				<button class="pa" onclick={() => meshOp('merge-center')}>Merge Center</button>
				<button class="pa" onclick={() => meshOp('merge-first')}>Merge First</button>
				<button class="pa" onclick={() => meshOp('merge-last')}>Merge Last</button>
				<button class="pa" onclick={() => meshOp('dissolve')}>Dissolve</button>
				<button class="pa" onclick={() => meshOp('delete')}>Delete</button>
				<button class="pa" onclick={() => meshOp('duplicate')}>Duplicate</button>
				<button class="pa" onclick={() => meshOp('separate')}>Separate</button>
				<button class="pa" onclick={() => sceneStore.joinSelected()}>Join</button>
			</div>
		{:else if editSubTab === 'Transform'}
			<div class="ap" data-testid="transform-tools">
				<div class="asg">
					<button class="s" class:on={$viewportStore.gizmoMode === 'translate'} onclick={() => { toolStore.setTool('move'); viewportStore.setGizmoMode('translate'); }}>Move</button>
					<button class="s" class:on={$viewportStore.gizmoMode === 'rotate'} onclick={() => { toolStore.setTool('rotate'); viewportStore.setGizmoMode('rotate'); }}>Rotate</button>
					<button class="s" class:on={$viewportStore.gizmoMode === 'scale'} onclick={() => { toolStore.setTool('scale'); viewportStore.setGizmoMode('scale'); }}>Scale</button>
					<button class="s" class:on={$viewportStore.gizmoMode === 'universal'} onclick={() => { toolStore.setTool('universal'); viewportStore.setGizmoMode('universal'); }}>Universal</button>
				</div>
				<div class="asg">
					<button class="s" class:on={axisConstraint === 'all'} onclick={() => (axisConstraint = 'all')}>All Axes</button>
					<button class="s" class:on={axisConstraint === 'x'} onclick={() => (axisConstraint = 'x')}>X</button>
					<button class="s" class:on={axisConstraint === 'y'} onclick={() => (axisConstraint = 'y')}>Y</button>
					<button class="s" class:on={axisConstraint === 'z'} onclick={() => (axisConstraint = 'z')}>Z</button>
				</div>
				<button class="pa" class:on={uniformScale} onclick={() => (uniformScale = !uniformScale)}>
					<span>{uniformScale ? 'Uniform Scale' : 'Non-Uniform'}</span>
				</button>
			</div>
		{:else if editSubTab === 'Modifiers'}
			<div class="ap" data-testid="modifiers-tools">
				<button class="pa" onclick={() => meshOp('subdivide')}>Subdivision</button>
				<button class="pa" onclick={() => (activeParam = 'smooth')}>Smooth/Relax</button>
				<button class="pa" onclick={() => (activeParam = 'decimate')}>Decimate</button>
				<button class="pa" onclick={() => (activeParam = 'solidify')}>Solidify</button>
				<button class="pa" onclick={() => meshOp('boolean', { op: 'difference' })}>Boolean Diff</button>
				<button class="pa" onclick={() => meshOp('boolean', { op: 'union' })}>Boolean Union</button>
				<button class="pa" onclick={() => meshOp('mirror', { axis: 'x' })}>Mirror X</button>
				<button class="pa" onclick={() => meshOp('mirror', { axis: 'y' })}>Mirror Y</button>
				<button class="pa" onclick={() => meshOp('mirror', { axis: 'z' })}>Mirror Z</button>
				<button class="pa" onclick={() => meshOp('array', { amount: 3 })}>Array</button>
				<button class="pa" onclick={() => (activeParam = 'screw')}>Screw/Spin</button>
			</div>
		{:else if editSubTab === 'Object'}
			<div class="ap" data-testid="object-tools">
				<button class="pa" class:on={$sceneStore.editMode} onclick={() => sceneStore.setEditMode(!$sceneStore.editMode)}>
					<span>{$sceneStore.editMode ? 'Exit Edit Mode' : 'Enter Edit Mode'}</span>
				</button>
				<button class="pa" onclick={() => sceneStore.setOrigin('geometry')}>Origin to Geometry</button>
				<button class="pa" onclick={() => sceneStore.setOrigin('cursor')}>Origin to Cursor</button>
				<button class="pa" onclick={() => sceneStore.setOrigin('center')}>Origin to Center</button>
				<button class="pa" onclick={() => sceneStore.applyTransformation('all')}>Apply All Transforms</button>
				<button class="pa" onclick={() => sceneStore.clearTransformation('all')}>Clear Transforms</button>
				<button class="pa" onclick={() => sceneStore.joinSelected()}>Join Objects</button>
			</div>
		{/if}
	{:else if chip === 'scl'}
	{#if chipIndex === 1}
		<div class="ap">
			<button class="pa" onclick={() => meshOp('subdivide')}>{@html ICONS.spark}<span>Dyntopo Subdivide</span></button>
			<button class="pa" onclick={() => meshOp('merge', { amount: 0.05 })}>{@html ICONS.scale}<span>Voxel Simplify</span></button>
			<button class="pa" onclick={() => meshOp('smooth', { amount: 2 })}>{@html ICONS.sculpt}<span>Relax Mesh</span></button>
		</div>
	{:else if chipIndex === 2}
		<div class="ap">
			<button class="pa" onclick={() => meshOp('subdivide')}>{@html ICONS.layers}<span>Add Multires Level</span></button>
			<button class="pa" onclick={() => meshOp('smooth', { amount: 1 })}>{@html ICONS.sculpt}<span>Smooth Level</span></button>
			<button class="pa" onclick={() => meshOp('bevel', { amount: 0.04 })}>{@html ICONS.cube}<span>Chamfer Polish</span></button>
		</div>
	{:else}
		{@render SculptControls()}
	{/if}
{:else if chip === 'uvp'}
	{#if chipIndex === 0}
		<div class="ap">
			<button class="pa" onclick={() => meshOp('unwrap-box')} data-testid="uv-box">{@html ICONS.cube}<span>Box UV</span></button>
			<button class="pa" onclick={() => meshOp('unwrap-planar')} data-testid="uv-planar">{@html ICONS.plane}<span>Planar UV</span></button>
			<button class="pa" onclick={() => meshOp('unwrap-cylindrical')} data-testid="uv-cyl">{@html ICONS.cylinder}<span>Cylinder UV</span></button>
			<button class="pa" onclick={() => meshOp('unwrap-spherical')} data-testid="uv-sphere">{@html ICONS.sphere}<span>Sphere UV</span></button>
			<input class="scolor" type="color" value={$brushStore.color} oninput={(e) => brushStore.setColor(e.currentTarget.value)} aria-label="Paint color" data-testid="paint-color" />
			<button class="pa" onclick={() => requireSelection((o) => { sceneStore.fillVertexColor(get(brushStore).color); void o; })} data-testid="paint-fill">{@html ICONS.eye}<span>Fill Color</span></button>
		</div>
	{:else if chipIndex === 1}
		<div class="ap">
			<button class="pa" onclick={() => meshOp('unwrap-box', { amount: 1 })}>{@html ICONS.frame}<span>Pack 1×</span></button>
			<button class="pa" onclick={() => meshOp('unwrap-box', { amount: 2 })}>{@html ICONS.frame}<span>Tile 2×</span></button>
			<button class="pa" onclick={() => meshOp('unwrap-box', { amount: 4 })}>{@html ICONS.frame}<span>Tile 4×</span></button>
			<button class="pa" onclick={() => requireSelection(() => sceneStore.meshOp('subdivide'))}>{@html ICONS.cube}<span>Add Density</span></button>
		</div>
	{:else if chipIndex === 2}
		<div class="ap">
			<input class="scolor" type="color" value={$brushStore.color} oninput={(e) => brushStore.setColor(e.currentTarget.value)} aria-label="Paint color" data-testid="paint-color" />
			<label class="arange">Size<input type="range" min="0.1" max="3" step="0.05" value={$brushStore.radius} oninput={(e) => brushStore.setRadius(Number(e.currentTarget.value))} data-testid="paint-radius" /></label>
			<label class="arange">Power<input type="range" min="0.05" max="1" step="0.05" value={$brushStore.strength} oninput={(e) => brushStore.setStrength(Number(e.currentTarget.value))} data-testid="paint-strength" /></label>
			<button class="pa" onclick={() => requireSelection((o) => { sceneStore.fillVertexColor(get(brushStore).color); void o; })} data-testid="paint-fill">{@html ICONS.eye}<span>Fill Color</span></button>
			<button class="pa" onclick={() => requireSelection((o) => { sceneStore.paintObject(o.id, get(brushStore).color); })} data-testid="paint-object">{@html ICONS.cube}<span>Paint Object</span></button>
		</div>
	{:else}
		<div class="ap">
			<button class="pa" onclick={() => meshOp('bake-ao')} data-testid="bake-ao">{@html ICONS.spark}<span>Bake AO</span></button>
			<button class="pa" onclick={() => meshOp('bake-light')} data-testid="bake-light">{@html ICONS.lamp}<span>Bake Sun Light</span></button>
			<button class="pa" onclick={() => meshOp('bake-curvature')} data-testid="bake-curvature">{@html ICONS.target}<span>Bake Cavity</span></button>
			<button class="pa" onclick={() => meshOp('bake-gradient')} data-testid="bake-gradient">{@html ICONS.layers}<span>Bake Gradient</span></button>
		</div>
	{/if}
{:else if chip === 'shd'}
	{#if chipIndex === 1}
		<MaterialLibrary />
	{:else if chipIndex === 2}
		<div class="ap">
			<button class="pa" class:on={$viewportStore.overlays.grid} onclick={() => viewportStore.toggleOverlay('grid')}>{@html ICONS.layers}<span>Grid</span></button>
			<button class="pa" class:on={$viewportStore.overlays.axes} onclick={() => viewportStore.toggleOverlay('axes')}>{@html ICONS.move}<span>Axes</span></button>
			<button class="pa" class:on={$viewportStore.overlays.wireframe} onclick={() => viewportStore.toggleOverlay('wireframe')}>{@html ICONS.wire}<span>Wire Overlay</span></button>
			<button class="pa" class:on={$viewportStore.cursorVisible} onclick={() => viewportStore.toggleCursor()}>{@html ICONS.target}<span>3D Cursor</span></button>
			{@render ShadeControls({ setMaterial, material })}
		</div>
	{:else}
		{@render ShadeControls({ setMaterial, material })}
	{/if}
{:else if chip === 'rig'}
	<div class="ap">
		<button class="pa" onclick={() => addPrimitive('bone')} data-testid="add-bone">{@html ICONS.bone}<span>Add Bone</span></button>
		<button class="pa" onclick={() => sceneStore.addBoneChain(3)} data-testid="add-bone-chain">{@html ICONS.rig}<span>3-Bone Chain</span></button>
		<button class="pa" onclick={() => requireSelection((o) => { sceneStore.bindArmature(o.id); toast('Bound skin to armature!', 'success'); })} data-testid="bind-armature">{@html ICONS.layers}<span>Bind Skin</span></button>
		<button class="pa" onclick={() => sceneStore.mirrorSelected('x')}>{@html ICONS.scale}<span>Mirror X</span></button>
		<button class="pa" onclick={() => toolStore.runCommand('spin')}>{@html ICONS.rotate}<span>Pose Turntable</span></button>
		<button class="pa" onclick={() => toolStore.runCommand('bounce')}>{@html ICONS.down}<span>Pose Bounce</span></button>
	</div>
{:else if chip === 'ani'}
	{#if chipIndex === 3}
		<div class="ap">
			<button class="pa" onclick={() => toolStore.runCommand('spin')}>{@html ICONS.rotate}<span>Driver: Spin</span></button>
			<button class="pa" onclick={() => toolStore.runCommand('bounce')}>{@html ICONS.down}<span>Driver: Bounce</span></button>
			<button class="pa" onclick={() => toolStore.runCommand('orbit')}>{@html ICONS.orbit}<span>Driver: Orbit</span></button>
			<button class="pa" onclick={dropToFloor}>{@html ICONS.gravity_chip}<span>Driver: Drop</span></button>
		</div>
	{:else}
		<div class="ap">
			<button class="pa" onclick={addKeyframe} data-testid="add-key">{@html ICONS.key}<span>Add Key</span></button>
			<button class="pa" onclick={removeKeyframe}>{@html ICONS.close}<span>Remove Key</span></button>
			<button class="pa" onclick={() => timelineStore.setShow(!$timelineStore.show)}>{@html ICONS.key}<span>Timeline</span></button>
			<button class="pa" class:on={$timelineStore.loop} onclick={() => timelineStore.toggleLoop()}>{@html ICONS.play}<span>Loop</span></button>
			<button class="pa" class:on={$timelineStore.easing} onclick={() => timelineStore.toggleEasing()}>{@html ICONS.arc}<span>Ease</span></button>
			<button class="pa" onclick={() => timelineStore.setShow(true)} data-testid="timeline-open">{@html ICONS.key}<span>Open Timeline</span></button>
			<button class="pa" onclick={() => addStrip()} data-testid="nla-add-strip">{@html ICONS.arc}<span>Add Strip</span></button>
		</div>
	{/if}
{:else if chip === 'phy'}
	<div class="ap">
		<button class="pa" class:on={body?.dynamic} onclick={() => setPhysics({ dynamic: !body?.dynamic })} data-testid="dynamic">{@html ICONS.cube}<span>{body?.dynamic ? 'Dynamic' : 'Static'}</span></button>
		<label class="arange">Bounce<input type="range" min="0" max="0.95" step="0.05" value={body?.restitution ?? 0.45} oninput={(e) => setPhysics({ restitution: Number(e.currentTarget.value) })} data-testid="restitution" /></label>
		<label class="arange">Gravity<input type="range" min="0" max="25" step="0.5" value={$physicsStore.gravity} oninput={(e) => physicsStore.setGravity(Number(e.currentTarget.value))} data-testid="gravity" /></label>
		<button class="pa" class:on={$physicsStore.running} onclick={togglePhysicsRun} data-testid="physics-run">{@html $physicsStore.running ? ICONS.pause : ICONS.play}<span>{$physicsStore.running ? 'Pause' : 'Run'}</span></button>
		<button class="pa" onclick={resetPhysics} data-testid="physics-reset">{@html ICONS.refresh}<span>Reset</span></button>
		<button class="pa" onclick={bakePhysics} data-testid="physics-bake">{@html ICONS.key}<span>Bake Keys</span></button>
		<button class="pa" onclick={dropToFloor} data-testid="drop-floor">{@html ICONS.down}<span>Drop Key</span></button>
	</div>
{:else if chip === 'gam'}
	<div class="ap">
		<button class="pa" class:on={$sceneStore.gameMode} onclick={() => sceneStore.toggleGameMode()} data-testid="game-mode">{@html ICONS.play}<span>{$sceneStore.gameMode ? 'Stop' : 'Play'}</span></button>
		<button class="pa" onclick={() => addPrimitive('coin')}>{@html ICONS.torus}<span>Add Coin</span></button>
		<button class="pa" onclick={() => addPrimitive('plane')}>{@html ICONS.plane}<span>Add Floor</span></button>
		<button class="pa" onclick={() => sceneStore.resetScore()}>{@html ICONS.refresh}<span>Score 0</span></button>
	</div>
{:else if chip === 'ren'}
	{#if chipIndex === 1}
		<div class="ap">
			<div class="asg">
				{#each [[1280, 720], [1920, 1080], [2560, 1440]] as [w, h]}
					<button class="s" class:on={$viewportStore.resolution[0] === w} onclick={() => viewportStore.setResolution([w, h])}>{w}×{h}</button>
				{/each}
			</div>
			<button class="pa" onclick={snapshot} data-testid="snapshot">{@html ICONS.photo_chip}<span>Snapshot</span></button>
		</div>
	{:else}
		<div class="ap">
			<button class="pa" onclick={snapshot} data-testid="snapshot">{@html ICONS.photo_chip}<span>Photo</span></button>
			<button class="pa" onclick={togglePiP} data-testid="pip">{@html ICONS.eye}<span>PiP</span></button>
			<button class="pa" onclick={() => addPrimitive('light')}>{@html ICONS.lamp}<span>Light</span></button>
			<button class="pa" onclick={() => uiStore.openDialog('save')} data-testid="save">{@html ICONS.save}<span>Save</span></button>
			<button class="pa" onclick={() => uiStore.openDialog('open')} data-testid="open">{@html ICONS.upload}<span>Open</span></button>
			<button class="pa" onclick={exportOBJ} data-testid="export-obj">{@html ICONS.download}<span>Export .OBJ</span></button>
			<button class="pa" onclick={exportSTL} data-testid="export-stl">{@html ICONS.download}<span>Export .STL</span></button>
			<label class="pa" style="cursor:pointer;">
				{@html ICONS.upload}<span>Import 3D</span>
				<input type="file" accept=".obj,.stl" style="display:none;" onchange={import3DFile} data-testid="import-3d" />
			</label>
		</div>
	{/if}
{:else if chip === 'age'}
	<div class="ap">
		<button class="pa" onclick={() => toolStore.runCommand('add cube')}>{@html ICONS.cube}<span>Cube</span></button>
		<button class="pa" onclick={() => toolStore.runCommand('spin')}>{@html ICONS.rotate}<span>Spin</span></button>
		<button class="pa" onclick={() => toolStore.runCommand('bounce')}>{@html ICONS.down}<span>Bounce</span></button>
		<button class="pa" onclick={() => toolStore.runCommand('orbit')}>{@html ICONS.rotate}<span>Orbit</span></button>
		<button class="pa" onclick={() => toolStore.runCommand('drop')}>{@html ICONS.gravity_chip}<span>Drop</span></button>
	</div>
{/if}

{#snippet SculptControls()}
	<div class="sculpt-header" data-testid="sculpt-header">
		<div class="sculpt-sliders">
			<label class="arange" title="Brush Radius">
				<span>Size</span>
				<input type="range" min="0.05" max="2.5" step="0.05" value={$brushStore.radius} oninput={(e) => brushStore.setRadius(Number(e.currentTarget.value))} data-testid="brush-radius" />
				<span class="val">{$brushStore.radius.toFixed(2)}</span>
			</label>
			<label class="arange" title="Brush Strength">
				<span>Strength</span>
				<input type="range" min="0.02" max="1" step="0.02" value={$brushStore.strength} oninput={(e) => brushStore.setStrength(Number(e.currentTarget.value))} data-testid="brush-strength" />
				<span class="val">{Math.round($brushStore.strength * 100)}%</span>
			</label>
			<label class="arange" title="Brush Hardness">
				<span>Hardness</span>
				<input type="range" min="0" max="1" step="0.05" value={$brushStore.hardness} oninput={(e) => brushStore.setHardness(Number(e.currentTarget.value))} data-testid="brush-hardness" />
				<span class="val">{Math.round($brushStore.hardness * 100)}%</span>
			</label>
		</div>
		<div class="sculpt-toggles">
			<div class="asg" title="Falloff Curve">
				{#each (['smooth', 'linear', 'hard'] as BrushFalloff[]) as f}
					<button class="s" class:on={$brushStore.falloff === f} onclick={() => brushStore.setFalloff(f)}>{f === 'smooth' ? 'Smooth' : f === 'linear' ? 'Linear' : 'Sharp'}</button>
				{/each}
			</div>
			<button class="pa" class:on={$brushStore.inverted} onclick={() => brushStore.toggleInverted()} title="Invert Brush (Add / Subtract)">
				<span>{$brushStore.inverted ? '− Sub' : '+ Add'}</span>
			</button>
			<div class="asg" title="Mirror Symmetry">
				<button class="s" class:on={$brushStore.symmetryX} onclick={() => brushStore.toggleSymmetry('x')}>Sym X</button>
				<button class="s" class:on={$brushStore.symmetryY} onclick={() => brushStore.toggleSymmetry('y')}>Sym Y</button>
				<button class="s" class:on={$brushStore.symmetryZ} onclick={() => brushStore.toggleSymmetry('z')}>Sym Z</button>
			</div>
			{#if $brushStore.kind === 'mask'}
				<div class="asg" title="Mask Operations">
					<button class="s" onclick={() => requireSelection((o) => sceneStore.clearMask(o.id))}>Clear</button>
					<button class="s" onclick={() => requireSelection((o) => sceneStore.invertMask(o.id))}>Invert</button>
					<button class="s" onclick={() => requireSelection((o) => sceneStore.blurMask(o.id))}>Blur</button>
				</div>
			{/if}
		</div>
	</div>
	<div class="ap" data-testid="sculpt-brushes">
		{#each sculptBrushes as brush}
			<button
				class="pa"
				class:on={$brushStore.kind === brush.kind}
				onclick={() => brushStore.setKind(brush.kind)}
				data-testid="brush-{brush.kind}"
			>
				{@html ICONS[brush.icon] || ICONS.sculpt}
				<span>{brush.label}</span>
			</button>
		{/each}
	</div>
{/snippet}

{#snippet ShadeControls(props: {
	setMaterial: (patch: Partial<Material>) => void;
	material: { emissive: string; opacity: number; metalness: number; roughness: number } | undefined;
})}
	<div class="ap">
		<div class="asg">
			<button class="s" class:on={$viewportStore.shadingMode === 'wireframe'} onclick={() => viewportStore.setShadingMode('wireframe')}>Wire</button>
			<button class="s" class:on={$viewportStore.shadingMode === 'solid'} onclick={() => viewportStore.setShadingMode('solid')}>Solid</button>
			<button class="s" class:on={$viewportStore.shadingMode === 'material'} onclick={() => viewportStore.setShadingMode('material')}>Material</button>
			<button class="s" class:on={$viewportStore.shadingMode === 'rendered'} onclick={() => viewportStore.setShadingMode('rendered')}>Rendered</button>
			<button class="s" class:on={$viewportStore.shadingMode === 'toon'} onclick={() => viewportStore.setShadingMode('toon')}>Toon</button>
		</div>
		<button class="pa" class:on={$viewportStore.xray} onclick={() => viewportStore.toggleXray()} title="X-ray">{@html ICONS.eye}<span>X-ray</span></button>
		<label class="arange">Rough<input type="range" min="0" max="1" step="0.05" value={props.material?.roughness ?? 0.42} oninput={(e) => props.setMaterial({ roughness: Number(e.currentTarget.value) })} data-testid="mat-roughness" /></label>
		<label class="arange">Metal<input type="range" min="0" max="1" step="0.05" value={props.material?.metalness ?? 0.05} oninput={(e) => props.setMaterial({ metalness: Number(e.currentTarget.value) })} data-testid="mat-metalness" /></label>
		<label class="arange">Fade<input type="range" min="0.1" max="1" step="0.05" value={props.material?.opacity ?? 1} oninput={(e) => props.setMaterial({ opacity: Number(e.currentTarget.value) })} data-testid="mat-opacity" /></label>
		<input class="scolor" type="color" value={props.material?.emissive ?? '#000000'} aria-label="Emissive" oninput={(e) => props.setMaterial({ emissive: e.currentTarget.value })} data-testid="mat-emissive" />
	</div>
{/snippet}

<style>
	.ap {
		display: flex;
		gap: 6px;
		align-items: center;
		padding: 6px 10px;
		overflow-x: auto;
		border-top: 1px solid var(--ln);
		scrollbar-width: none;
	}

	.ap::-webkit-scrollbar {
		display: none;
	}

	.primitives {
		justify-content: space-around;
		gap: 0;
		padding: 2px 8px;
		border-bottom: 1px solid var(--ln);
	}

	.pc {
		flex: none;
		width: 40px;
		height: 40px;
		display: grid;
		place-items: center;
		padding: 0;
		background: transparent;
		border: 0;
		border-radius: 12px;
		color: var(--tx2);
		cursor: pointer;
	}

	.pc :global(svg) {
		width: 22px;
		height: 22px;
	}

	.pc:hover {
		background: #21252f;
		color: var(--tx);
	}

	.pc.on {
		background: rgba(61, 219, 176, 0.14);
		color: var(--ac);
	}

	.anim-readout {
		flex: none;
		height: 30px;
		display: flex;
		align-items: center;
		padding: 0 4px;
		color: var(--tx3);
		font: 600 10px system-ui, -apple-system, sans-serif;
		white-space: nowrap;
	}

	.pa {
		flex: none;
		display: flex;
		align-items: center;
		gap: 5px;
		height: 30px;
		padding: 0 11px;
		background: #181b24;
		border: 1px solid var(--ln);
		border-radius: 11px;
		color: var(--tx);
		font: 600 11px system-ui, -apple-system, sans-serif;
		cursor: pointer;
		white-space: nowrap;
	}

	.pa :global(svg) {
		width: 17px;
		height: 17px;
		color: var(--tx2);
	}

	.pa span {
		white-space: nowrap;
	}

	.pa:active,
	.pa.on {
		background: color-mix(in srgb, var(--ac) 16%, var(--bg2));
		border-color: var(--ac);
	}

	.pa.on :global(svg) {
		color: var(--ac);
	}

	.asg {
		flex: none;
		display: flex;
		gap: 2px;
		padding: 2px;
		background: var(--bg0);
		border: 1px solid var(--ln);
		border-radius: 10px;
	}

	.asg .s {
		height: 28px;
		padding: 0 9px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--tx2);
		font: 600 11px Inter, system-ui, sans-serif;
		cursor: pointer;
	}

	.asg .s.on {
		background: var(--ac);
		color: #0b0c10;
	}

	.scolor {
		flex: none;
		width: 26px;
		height: 24px;
		padding: 0;
		border: 1px solid var(--ln2);
		border-radius: 6px;
		background: var(--bg2);
		cursor: pointer;
	}

	.arange {
		flex: none;
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--tx2);
		font: 600 10.5px Inter, system-ui, sans-serif;
	}

	.arange input {
		width: 72px;
	}
</style>
