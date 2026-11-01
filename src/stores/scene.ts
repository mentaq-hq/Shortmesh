import { writable, derived, get } from 'svelte/store';
import { type Vec3, lookAtEuler, rotateEuler, clamp } from '../lib/math3d';
import {
	arrayMesh,
	assignFacesToSlot,
	bakeMeshVertexColors,
	buildGroups,
	cloneMesh,
	computeRadius,
	computeVertexNormals,
	deleteFaces as deleteMeshFaces,
	extrudeFaces,
	flipNormals,
	insetFaces,
	meshFor,
	mergeByDistance,
	smoothMeshVertices,
	solidifyMesh,
	subdivide,
	unwrapMeshUV,
	bridgeEdgeLoops,
	mergeVertices,
	deleteGeometry,
	dissolveGeometry,
	duplicateMeshGeometry,
	separateGeometry,
	mirrorMesh,
	decimateMesh,
	decimateLocal,
	screwSpinMesh,
	booleanMesh,
	joinMeshes,
	faceCenter,
	faceNormal,
	type MaterialSlot,
	type Mesh,
} from '../lib/mesh';
import {
	bisectMesh,
	classifyFacesByPlane,
	extrudeRegion,
	offsetMesh,
	type CutPlane,
} from '../lib/bisect';
import { presetById, presetToSlot, slotFromImage } from '../lib/materials';
import { aspectPlaneScale, primeLayerTexture, textTextureDataUrl } from '../lib/media';
import { bevelVertices, loopCut } from '../lib/topology';
import { timelineStore, type AnimationSnapshot } from './timeline';

export interface CameraProps {
	fov: number;
	targetId: string | null;
	targetOffset: [number, number, number];
	trackingMode: 'none' | 'look_at' | 'follow' | 'orbit';
	followDistance: number;
	followHeight: number;
	damping: number;
	active: boolean;
}

export interface Material {
	emissive: string;
	opacity: number;
	metalness: number;
	roughness: number;
}

export interface PhysicsBody {
	dynamic: boolean;
	velocity: [number, number, number];
	restitution: number;
	home?: [number, number, number];
}

export type ElementKind = 'vertex' | 'edge' | 'face';

export interface SceneObject {
	id: string;
	name: string;
	type: string;
	position: [number, number, number];
	rotation: [number, number, number];
	scale: [number, number, number];
	restPose?: {
		position: [number, number, number];
		rotation: [number, number, number];
		scale: [number, number, number];
	};
	color: string;
	material: Material;
	geometry?: Mesh;
	geometryVersion: number;
	colorVersion: number;
	selectionVersion: number;
	physics: PhysicsBody;
	visible: boolean;
	locked: boolean;
	timelineHidden?: boolean;
	selected: boolean;
	text?: string;
	depth: number;
	parent?: string;
	children: string[];
	cameraProps?: CameraProps;
}

export interface SceneState {
	objects: SceneObject[];
	selectedId: string | null;
	gameMode: boolean;
	score: number;
	editMode: boolean;
	elementMode: ElementKind;
	selectedVertices: number[];
	selectedEdges: number[];
	selectedFaces: number[];
	hover: { kind: ElementKind; index: number } | null;
	markedFaces: number[];
	markedObjectId: string | null;
	portionVersion: number;
}

export interface GameInput {
	up: boolean;
	down: boolean;
	left: boolean;
	right: boolean;
	jump: boolean;
}

export interface PrimitiveDefinition {
	type: string;
	label: string;
	icon: string;
	color: string;
	category?: 'Mesh' | 'Curve' | 'Light' | 'Camera' | 'Empty' | 'Text' | 'Import' | 'More';
}

export const STUDIO_WHITE = '#ffffff';

export const PRIMITIVES: PrimitiveDefinition[] = [
	// Mesh Primitives (Most used - show first)
	{ type: 'cube', label: 'Cube', icon: 'cube', color: STUDIO_WHITE, category: 'Mesh' },
	{ type: 'sphere', label: 'UV Sphere', icon: 'sphere', color: STUDIO_WHITE, category: 'Mesh' },
	{ type: 'icosphere', label: 'Ico Sphere', icon: 'sphere', color: STUDIO_WHITE, category: 'Mesh' },
	{ type: 'cylinder', label: 'Cylinder', icon: 'cylinder', color: STUDIO_WHITE, category: 'Mesh' },
	{ type: 'cone', label: 'Cone', icon: 'cone', color: STUDIO_WHITE, category: 'Mesh' },
	{ type: 'torus', label: 'Torus', icon: 'torus', color: STUDIO_WHITE, category: 'Mesh' },
	{ type: 'plane', label: 'Plane', icon: 'plane', color: STUDIO_WHITE, category: 'Mesh' },
	{ type: 'circle', label: 'Circle', icon: 'torus', color: STUDIO_WHITE, category: 'Mesh' },
	{ type: 'grid', label: 'Grid', icon: 'plane', color: STUDIO_WHITE, category: 'Mesh' },
	{ type: 'pyramid', label: 'Pyramid', icon: 'cone', color: STUDIO_WHITE, category: 'Mesh' },
	{ type: 'tube', label: 'Tube', icon: 'cylinder', color: STUDIO_WHITE, category: 'Mesh' },
	{ type: 'capsule', label: 'Capsule', icon: 'sphere', color: STUDIO_WHITE, category: 'Mesh' },

	// Curves
	{ type: 'curve_bezier', label: 'Bezier Curve', icon: 'curve', color: STUDIO_WHITE, category: 'Curve' },
	{ type: 'curve_circle', label: 'Bezier Circle', icon: 'torus', color: STUDIO_WHITE, category: 'Curve' },
	{ type: 'curve_path', label: 'Path', icon: 'curve', color: STUDIO_WHITE, category: 'Curve' },
	{ type: 'curve_nurbs', label: 'NURBS Curve', icon: 'curve', color: STUDIO_WHITE, category: 'Curve' },

	// Lights
	{ type: 'light', label: 'Point Light', icon: 'lamp', color: STUDIO_WHITE, category: 'Light' },
	{ type: 'light_sun', label: 'Sun Light', icon: 'lamp', color: STUDIO_WHITE, category: 'Light' },
	{ type: 'light_spot', label: 'Spot Light', icon: 'lamp', color: STUDIO_WHITE, category: 'Light' },
	{ type: 'light_area', label: 'Area Light', icon: 'lamp', color: STUDIO_WHITE, category: 'Light' },

	// Cameras
	{ type: 'camera', label: 'Perspective', icon: 'camera', color: STUDIO_WHITE, category: 'Camera' },
	{ type: 'camera_ortho', label: 'Orthographic', icon: 'camera', color: STUDIO_WHITE, category: 'Camera' },

	// Empties / Helpers
	{ type: 'empty_axes', label: 'Plain Axes', icon: 'move', color: STUDIO_WHITE, category: 'Empty' },
	{ type: 'empty_arrows', label: 'Arrows', icon: 'move', color: STUDIO_WHITE, category: 'Empty' },
	{ type: 'empty_cube', label: 'Cube Empty', icon: 'cube', color: STUDIO_WHITE, category: 'Empty' },
	{ type: 'empty_sphere', label: 'Sphere Empty', icon: 'sphere', color: STUDIO_WHITE, category: 'Empty' },
	{ type: 'empty_circle', label: 'Circle Empty', icon: 'torus', color: STUDIO_WHITE, category: 'Empty' },
	{ type: 'empty_image', label: 'Image Empty', icon: 'photo', color: STUDIO_WHITE, category: 'Empty' },

	// 3D Text
	{ type: 'text_3d', label: '3D Text', icon: 'text', color: STUDIO_WHITE, category: 'Text' },

	// Import & Asset Library
	{ type: 'import_device', label: 'Device Model', icon: 'cube', color: STUDIO_WHITE, category: 'Import' },
	{ type: 'import_photo', label: 'Reference Image', icon: 'photo', color: STUDIO_WHITE, category: 'Import' },
	{ type: 'asset_suzanne', label: 'Suzanne Monkey', icon: 'sphere', color: STUDIO_WHITE, category: 'Import' },
	{ type: 'asset_tree', label: 'Stylized Tree', icon: 'cylinder', color: STUDIO_WHITE, category: 'Import' },
	{ type: 'asset_car', label: 'Stylized Car', icon: 'cube', color: STUDIO_WHITE, category: 'Import' },
	{ type: 'asset_character', label: 'Character', icon: 'bone', color: STUDIO_WHITE, category: 'Import' },
	{ type: 'asset_chair', label: 'Modern Chair', icon: 'cube', color: STUDIO_WHITE, category: 'Import' },

	// Advanced / More
	{ type: 'bone', label: 'Armature Bone', icon: 'bone', color: STUDIO_WHITE, category: 'More' },
	{ type: 'metaball', label: 'Metaball', icon: 'sphere', color: STUDIO_WHITE, category: 'More' },
	{ type: 'lattice', label: 'Lattice Cage', icon: 'cube', color: STUDIO_WHITE, category: 'More' },
	{ type: 'forcefield', label: 'Force Field', icon: 'torus', color: STUDIO_WHITE, category: 'More' },
	{ type: 'speaker', label: 'Audio Speaker', icon: 'lamp', color: STUDIO_WHITE, category: 'More' },
	{ type: 'coin', label: 'Coin Plate', icon: 'torus', color: STUDIO_WHITE, category: 'More' },
];

export function defaultCreationParams(type: string): Record<string, any> {
	switch (type) {
		case 'sphere': return { segments: 32, rings: 16, radius: 0.5 };
		case 'icosphere': return { subdivisions: 1, radius: 0.5 };
		case 'cylinder': return { segments: 32, radius: 0.5, height: 1.0 };
		case 'cone': return { segments: 32, radius: 0.5, height: 1.0 };
		case 'torus': return { segments: 32, sides: 16, radius: 0.35, tube: 0.15 };
		case 'cube': return { sizeX: 1.0, sizeY: 1.0, sizeZ: 1.0 };
		case 'plane': return { sizeX: 2.4, sizeZ: 2.4 };
		case 'circle': return { segments: 32, radius: 0.5 };
		case 'grid': return { subdivX: 4, subdivY: 4, sizeX: 2.0, sizeY: 2.0 };
		case 'pyramid': return { sides: 4, radius: 0.5, height: 1.0 };
		case 'tube': return { segments: 24, innerRadius: 0.3, outerRadius: 0.5, height: 1.0 };
		case 'capsule': return { segments: 20, rings: 6, radius: 0.25, height: 0.6 };
		case 'light':
		case 'light_point': return { intensity: 1.0, color: '#ffffff', radius: 5.0 };
		case 'light_sun': return { intensity: 1.5, color: '#fff9e6', angle: 45 };
		case 'light_spot': return { intensity: 2.0, color: '#ffffff', spotAngle: 45, radius: 8.0 };
		case 'light_area': return { intensity: 1.2, color: '#ffffff', sizeX: 1.0, sizeY: 1.0 };
		case 'camera':
		case 'camera_perspective': return { fov: 45, near: 0.1, far: 100 };
		case 'camera_ortho': return { orthoScale: 4.0, near: 0.1, far: 100 };
		case 'text_3d': return { text: '3D Text', depth: 0.2, bevel: 0.02 };
		default: return {};
	}
}

export function iconForType(type: string): string {
	const mediaIcons: Record<string, string> = { text: 'text', image: 'photo', video: 'video' };
	return mediaIcons[type] ?? PRIMITIVES.find((primitive) => primitive.type === type)?.icon ?? 'cube';
}

const defaultMaterial = (): Material => ({ emissive: '#000000', opacity: 1, metalness: 0.04, roughness: 0.36 });
const defaultPhysics = (): PhysicsBody => ({ dynamic: false, velocity: [0, 0, 0], restitution: 0.45 });

const initialState: SceneState = {
	objects: [],
	selectedId: null,
	gameMode: false,
	score: 0,
	editMode: false,
	elementMode: 'vertex',
	selectedVertices: [],
	selectedEdges: [],
	selectedFaces: [],
	hover: null,
	markedFaces: [],
	markedObjectId: null,
	portionVersion: 0,
};

const gameInput: GameInput = { up: false, down: false, left: false, right: false, jump: false };

let idCounter = 1;
const MAX_HISTORY = 80;

/** Cached vertex adjacency per mesh to avoid O(E) rebuilds on every sculpt brush tick. */
const adjacencyCache = new WeakMap<Mesh, Map<number, number[]>>();
function meshAdjacency(mesh: Mesh): Map<number, number[]> {
	let adj = adjacencyCache.get(mesh);
	if (adj) return adj;
	adj = new Map<number, number[]>();
	for (const [a, b] of mesh.edges) {
		let la = adj.get(a);
		if (!la) { la = []; adj.set(a, la); }
		la.push(b);
		let lb = adj.get(b);
		if (!lb) { lb = []; adj.set(b, lb); }
		lb.push(a);
	}
	adjacencyCache.set(mesh, adj);
	return adj;
}

const objectIndexCache = new WeakMap();
function objectIndex(objects) {
	let idx = objectIndexCache.get(objects);
	if (idx && idx.size === objects.length) return idx;
	idx = new Map();
	for (const o of objects) idx.set(o.id, o);
	objectIndexCache.set(objects, idx);
	return idx;
}
const EPS = 1e-6;
function vecChanged(a, b) {
	return Math.abs(a[0]-b[0]) > EPS || Math.abs(a[1]-b[1]) > EPS || Math.abs(a[2]-b[2]) > EPS;
}
function assignVec3(a, b) {
	if (!vecChanged(a, b)) return false;
	a[0]=b[0]; a[1]=b[1]; a[2]=b[2];
	return true;
}
function assignEuler(t, n) { return assignVec3(t, n); }

type TRS = {
	position: [number, number, number];
	rotation: [number, number, number];
	scale: [number, number, number];
};

type HistoryEntry =
	| { kind: 'scene'; state: SceneState }
	| { kind: 'transform'; before: Record<string, TRS>; after: Record<string, TRS>; animBefore?: AnimationSnapshot; animAfter?: AnimationSnapshot }
	| { kind: 'animation'; before: AnimationSnapshot; after: AnimationSnapshot }
	| {
			kind: 'mesh';
			objectId: string;
			indices: number[];
			before: number[];
			after: number[];
			transforms: { before: Record<string, TRS>; after: Record<string, TRS> } | null;
		};

type TransformSnapshot = {
	mode: 'transform' | 'geometry';
	objectId: string | null;
	transforms: Record<string, TRS>;
	vertices: Float32Array | null;
};

let transformSnapshot: TransformSnapshot | null = null;
let animationSnapshot: AnimationSnapshot | null = null;

function nextId(): string {
	return `obj-${idCounter++}`;
}

function cloneObject(object: SceneObject): SceneObject {
	return {
		...object,
		position: [...object.position] as [number, number, number],
		rotation: [...object.rotation] as [number, number, number],
		scale: [...object.scale] as [number, number, number],
		restPose: object.restPose
			? {
					position: [...object.restPose.position] as [number, number, number],
					rotation: [...object.restPose.rotation] as [number, number, number],
					scale: [...object.restPose.scale] as [number, number, number],
				}
			: undefined,
		children: [...object.children],
		material: { ...object.material },
		physics: {
			...object.physics,
			velocity: [...object.physics.velocity] as [number, number, number],
			home: object.physics.home ? ([...object.physics.home] as [number, number, number]) : undefined,
		},
		geometry: object.geometry ? cloneMesh(object.geometry) : undefined,
	};
}

function cloneObjects(objects: SceneObject[]): SceneObject[] {
	return objects.map(cloneObject);
}

function cloneState(state: SceneState): SceneState {
	return {
		...state,
		objects: cloneObjects(state.objects),
		selectedVertices: [...state.selectedVertices],
		selectedEdges: [...state.selectedEdges],
		selectedFaces: [...state.selectedFaces],
		hover: state.hover ? { ...state.hover } : null,
		markedFaces: [...state.markedFaces],
		markedObjectId: state.markedObjectId,
		portionVersion: state.portionVersion,
	};
}

function uniqueName(objects: SceneObject[], base: string): string {
	const names = new Set(objects.map((object) => object.name));
	if (!names.has(base)) return base;
	let index = 1;
	while (names.has(`${base}.${String(index).padStart(3, '0')}`)) index++;
	return `${base}.${String(index).padStart(3, '0')}`;
}

function defaultTransform(type: string, index: number) {
	if (type === 'plane') return { position: [0, 0.02, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [2.4, 1, 2.4] as [number, number, number] };
	if (type === 'light') return { position: [2.5, 3.5, 2.5] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number] };
	if (type === 'camera') return { position: [3.2, 2.2, 4.2] as [number, number, number], rotation: [-0.25, 0.65, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number] };
	const angle = index * 2.399963;
	const radius = index === 0 ? 0 : 1.25 * Math.sqrt(index);
	return {
		position: [Math.cos(angle) * radius, type === 'coin' ? 0.5 : 0.5, Math.sin(angle) * radius] as [number, number, number],
		rotation: [0, 0, 0] as [number, number, number],
		scale: (type === 'coin' ? [1.1, 1, 1.1] : [1, 1, 1]) as [number, number, number],
	};
}

function uniqueSorted(values: number[]): number[] {
	return [...new Set(values)].sort((a, b) => a - b);
}

function createSceneStore() {
	const { subscribe, set, update } = writable<SceneState>(initialState);
	const past: HistoryEntry[] = [];
	const future: HistoryEntry[] = [];

	function pushHistory(state: SceneState) {
		past.push({ kind: 'scene', state: cloneState(state) });
		if (past.length > MAX_HISTORY) past.shift();
		future.length = 0;
	}

	function trimHistory() {
		if (past.length > MAX_HISTORY) past.length = MAX_HISTORY;
		if (future.length > MAX_HISTORY) future.length = MAX_HISTORY;
	}

	function animationDataKey(snapshot: AnimationSnapshot): string {
		return JSON.stringify({
			keyframes: snapshot.keyframes,
			curves: snapshot.curves,
			strips: snapshot.strips,
			clips: snapshot.clips,
			duration: snapshot.duration,
			loop: snapshot.loop,
			easing: snapshot.easing,
			frameRate: snapshot.frameRate,
		});
	}

	function captureTransforms(state: SceneState): Record<string, TRS> {
		const out: Record<string, TRS> = {};
		for (const object of state.objects) {
			out[object.id] = {
				position: [...object.position] as [number, number, number],
				rotation: [...object.rotation] as [number, number, number],
				scale: [...object.scale] as [number, number, number],
			};
		}
		return out;
	}

	function sameTransform(a: TRS | undefined, b: TRS | undefined): boolean {
		if (!a || !b) return a === b;
		for (let i = 0; i < 3; i++) {
			if (Math.abs(a.position[i] - b.position[i]) > 1e-6) return false;
			if (Math.abs(a.rotation[i] - b.rotation[i]) > 1e-6) return false;
			if (Math.abs(a.scale[i] - b.scale[i]) > 1e-6) return false;
		}
		return true;
	}

	function diffTransforms(before: Record<string, TRS>, after: Record<string, TRS>) {
		const changedBefore: Record<string, TRS> = {};
		const changedAfter: Record<string, TRS> = {};
		let count = 0;
		for (const id of Object.keys(after)) {
			if (sameTransform(before[id], after[id])) continue;
			changedBefore[id] = before[id];
			changedAfter[id] = after[id];
			count++;
		}
		return count ? { before: changedBefore, after: changedAfter } : null;
	}

	function restoreSnapshot(state: SceneState, snapshot: SceneState) {
		state.objects = snapshot.objects;
		state.selectedId = snapshot.selectedId;
		state.editMode = snapshot.editMode;
		state.elementMode = snapshot.elementMode;
		state.selectedVertices = snapshot.selectedVertices;
		state.selectedEdges = snapshot.selectedEdges;
		state.selectedFaces = snapshot.selectedFaces;
		state.markedFaces = snapshot.markedFaces;
		state.markedObjectId = snapshot.markedObjectId;
	}

	function applyTransforms(state: SceneState, transforms: Record<string, TRS>) {
		for (const object of state.objects) {
			const trs = transforms[object.id];
			if (!trs) continue;
			object.position = [...trs.position] as [number, number, number];
			object.rotation = [...trs.rotation] as [number, number, number];
			object.scale = [...trs.scale] as [number, number, number];
		}
	}

	function slotFromObject(object: SceneObject): MaterialSlot {
		return {
			name: object.name,
			color: object.color,
			emissive: object.material.emissive,
			emissiveStrength: 1,
			metalness: object.material.metalness,
			roughness: object.material.roughness,
			opacity: object.material.opacity,
			uvRepeat: 1,
		};
	}

	function materializeGeometry(object: SceneObject): Mesh {
		if (!object.geometry) {
			const base = cloneMesh(meshFor(object.type) ?? meshFor('cube')!);
			base.slots = [slotFromObject(object)];
			base.faceSlot = base.faces.map(() => 0);
			base.groups = buildGroups(base);
			object.geometry = base;
		}
		if (!object.geometry.slots.length) object.geometry.slots = [slotFromObject(object)];
		if (object.geometry.faceSlot.length !== object.geometry.faces.length) {
			object.geometry.faceSlot = object.geometry.faces.map((_, index) => object.geometry?.faceSlot[index] ?? 0);
			object.geometry.groups = buildGroups(object.geometry);
		}
		return object.geometry;
	}

	function newObject(state: SceneState, type: string, label: string): SceneObject {
		return {
			id: nextId(),
			name: uniqueName(state.objects, label),
			type,
			position: [0, 0, 0],
			rotation: [0, 0, 0],
			scale: [1, 1, 1],
			restPose: {
				position: [0, 0, 0],
				rotation: [0, 0, 0],
				scale: [1, 1, 1],
			},
			color: STUDIO_WHITE,
			material: defaultMaterial(),
			geometryVersion: 1,
			colorVersion: 1,
			selectionVersion: 1,
			physics: defaultPhysics(),
			visible: true,
			locked: false,
			selected: true,
			depth: 0,
			children: [],
		};
	}

	function refreshObject(id: string) {
		update((state) => {
			const object = state.objects.find((item) => item.id === id);
			if (!object) return state;
			object.colorVersion++;
			object.selectionVersion++;
			return state;
		});
	}

	function useTextureSlot(object: SceneObject, dataUrl: string, width: number, height: number) {
		const mesh = materializeGeometry(object);
		mesh.slots[0] = {
			...mesh.slots[0],
			name: object.name,
			color: '#ffffff',
			metalness: 0,
			roughness: 0.92,
			emissive: '#ffffff',
			emissiveStrength: 0.3,
			imageUrl: dataUrl,
			uvRepeat: 1,
		};
		object.scale = aspectPlaneScale(width, height);
		object.restPose = {
			position: [...object.position] as [number, number, number],
			rotation: [...object.rotation] as [number, number, number],
			scale: [...object.scale] as [number, number, number],
		};
		primeLayerTexture(dataUrl, () => refreshObject(object.id));
	}

	return {
		subscribe,
		set,
		addPrimitive: (type: string, position?: Vec3, params?: Record<string, any>) =>
			update((state) => {
				pushHistory(state);
				const definition = PRIMITIVES.find((p) => p.type === type);
				const id = nextId();
				const transform = defaultTransform(type, state.objects.length);
				const pos = position ? ([...position] as [number, number, number]) : transform.position;
				const initParams = params ? { ...params } : defaultCreationParams(type);
				const initialMesh = meshFor(type, initParams);
				const object: SceneObject = {
					id,
					name: uniqueName(state.objects, definition?.label || type),
					type,
					position: [...pos] as [number, number, number],
					rotation: [...transform.rotation] as [number, number, number],
					scale: [...transform.scale] as [number, number, number],
					restPose: {
						position: [...pos] as [number, number, number],
						rotation: [...transform.rotation] as [number, number, number],
						scale: [...transform.scale] as [number, number, number],
					},
					color: STUDIO_WHITE,
					material: defaultMaterial(),
					geometry: initialMesh ? cloneMesh(initialMesh) : undefined,
					geometryVersion: 1,
					colorVersion: 1,
					selectionVersion: 1,
					physics: defaultPhysics(),
					visible: true,
					locked: false,
					selected: true,
					depth: 0,
					children: [],
					creationParams: initParams,
				};
				if (type === 'light' || type.startsWith('light_')) {
					object.lightProps = {
						type: (type.replace('light_', '') || 'point') as any,
						intensity: initParams.intensity ?? 1.0,
						color: initParams.color ?? '#ffffff',
						distance: initParams.radius ?? 10,
						angle: initParams.spotAngle ? (initParams.spotAngle * Math.PI) / 180 : Math.PI / 4,
					};
				}
				if (type === 'camera' || type.startsWith('camera_')) {
					object.cameraProps = {
						fov: initParams.fov ?? 45,
						near: initParams.near ?? 0.1,
						far: initParams.far ?? 100,
						ortho: type === 'camera_ortho',
						orthoScale: initParams.orthoScale ?? 4.0,
						trackingMode: 'none',
						trackingTargetId: null,
					};
				}
				state.objects.forEach((item) => (item.selected = false));
				state.objects.push(object);
				state.selectedId = id;
				state.editMode = false;
				state.selectedVertices = [];
				state.selectedEdges = [];
				state.selectedFaces = [];
				return state;
			}),

		recreateLastObject: (_id: string, params: Record<string, any>) => sceneStore.updateCreationParams(params),
		mutateRig: (fn: (state: SceneState) => void, record = true) => update((state) => { if (record) pushHistory(state); fn(state); return state; }),
		updateCreationParams: (params: Record<string, any>) =>
			update((state) => {
				const obj = state.objects.find((o) => o.id === state.selectedId);
				if (!obj) return state;
				pushHistory(state);
				obj.creationParams = { ...(obj.creationParams || defaultCreationParams(obj.type)), ...params };
				const newMesh = meshFor(obj.type, obj.creationParams);
				if (newMesh) {
					obj.geometry = cloneMesh(newMesh);
					obj.geometryVersion = (obj.geometryVersion || 1) + 1;
				}
				if (obj.lightProps) {
					if (params.intensity !== undefined) obj.lightProps.intensity = params.intensity;
					if (params.color !== undefined) obj.lightProps.color = params.color;
				}
				if (obj.cameraProps) {
					if (params.fov !== undefined) obj.cameraProps.fov = params.fov;
					if (params.orthoScale !== undefined) obj.cameraProps.orthoScale = params.orthoScale;
				}
				return state;
			}),

		/** Imports a custom 3D mesh (.OBJ / .STL) into the scene. */
		importMeshObject: (name: string, mesh: Mesh) =>
			update((state) => {
				pushHistory(state);
				const clean = name.replace(/\.[^.]+$/, '').trim() || 'Imported_Mesh';
				const object = newObject(state, 'cube', clean);
				object.position = [0, 0.5, 0];
				object.restPose = {
					position: [0, 0.5, 0],
					rotation: [0, 0, 0],
					scale: [1, 1, 1],
				};
				const copy = cloneMesh(mesh);
				if (!copy.slots.length) copy.slots = [slotFromObject(object)];
				copy.faceSlot = copy.faces.map((_, idx) => copy.faceSlot[idx] ?? 0);
				copy.groups = buildGroups(copy);
				object.geometry = copy;
				state.objects.forEach((item) => (item.selected = false));
				state.objects.push(object);
				state.selectedId = object.id;
				state.editMode = false;
				return state;
			}),

		addTextLayer: (text: string) =>
			update((state) => {
				pushHistory(state);
				const caption = text.replace(/\s+/g, ' ').trim() || 'Text';
				const object = newObject(state, 'text', caption.slice(0, 24));
				object.text = caption;
				object.position = [0, 1.45, 0.6];
				object.rotation = [Math.PI / 2, 0, 0];
				object.material = { ...defaultMaterial(), metalness: 0, roughness: 0.9 };
				const url = textTextureDataUrl(caption);
				if (url) useTextureSlot(object, url, 1024, 512);
				else {
					materializeGeometry(object);
					object.scale = [2.4, 1.2, 1];
					object.restPose = {
						position: [...object.position] as [number, number, number],
						rotation: [...object.rotation] as [number, number, number],
						scale: [...object.scale] as [number, number, number],
					};
				}
				state.objects.forEach((item) => (item.selected = false));
				state.objects.push(object);
				state.selectedId = object.id;
				state.editMode = false;
				return state;
			}),

		addImageLayer: (dataUrl: string, width: number, height: number, name = 'Image') =>
			update((state) => {
				if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return state;
				pushHistory(state);
				const label = name.replace(/\.[^.]+$/, '').trim() || 'Image';
				const object = newObject(state, 'image', label);
				object.position = [0, 1.45, 0.6];
				object.rotation = [Math.PI / 2, 0, 0];
				object.material = { ...defaultMaterial(), metalness: 0, roughness: 0.8 };
				useTextureSlot(object, dataUrl, width, height);
				state.objects.forEach((item) => (item.selected = false));
				state.objects.push(object);
				state.selectedId = object.id;
				state.editMode = false;
				return state;
			}),

		setTextContent: (id: string, text: string) =>
			update((state) => {
				const object = state.objects.find((item) => item.id === id);
				if (!object || object.type !== 'text') return state;
				const caption = text.replace(/\s+/g, ' ').trim() || 'Text';
				if (caption === object.text) return state;
				pushHistory(state);
				object.text = caption;
				object.name = uniqueName(state.objects.filter((item) => item.id !== id), caption.slice(0, 24));
				const url = textTextureDataUrl(caption);
				if (url) {
					const mesh = materializeGeometry(object);
					mesh.slots[0] = { ...mesh.slots[0], color: '#ffffff', imageUrl: url };
					primeLayerTexture(url, () => refreshObject(id));
				}
				object.colorVersion++;
				return state;
			}),

		/** Moves a layer up (-1) or down (+1) in the scene object/timeline layer stack. */
		reorderObject: (id: string, delta: number) =>
			update((state) => {
				const idx = state.objects.findIndex((o) => o.id === id);
				if (idx < 0) return state;
				const target = Math.max(0, Math.min(state.objects.length - 1, idx + delta));
				if (target === idx) return state;
				pushHistory(state);
				const [item] = state.objects.splice(idx, 1);
				state.objects.splice(target, 0, item);
				return state;
			}),

		/**
		 * Smart keyframe recorder for the UI '+ Key' button:
		 * - If adding the very first keyframe at t > 0, automatically anchors the object's
		 *   initial restPose at t = 0 so pressing Play immediately animates from 0s to t.
		 * - If clicking '+ Key' at t = 0 when a key at t = 0 already exists and the object
		 *   has been moved, automatically places the new key at t + 1.5s so an animation is created.
		 */
		recordKeyframe: (id: string, explicitTime?: number): number => {
			const state = get(sceneStore);
			const object = state.objects.find((o) => o.id === id);
			if (!object) return 0;
			const tl = get(timelineStore);
			let targetTime = explicitTime ?? tl.currentTime;
			const existingKeys = tl.keyframes.get(id) ?? [];
			const currentPose: TRS = {
				position: [...object.position] as [number, number, number],
				rotation: [...object.rotation] as [number, number, number],
				scale: [...object.scale] as [number, number, number],
			};
			const restPose: TRS = object.restPose ?? currentPose;

			animationSnapshot = timelineStore.snapshotAnimation();
			if (existingKeys.length === 0 && targetTime > 0.02) {
				// Anchor t = 0 with restPose so 0s -> targetTime animates immediately
				timelineStore.addKeyframe(id, {
					time: 0,
					position: [...restPose.position],
					rotation: [...restPose.rotation],
					scale: [...restPose.scale],
				});
				timelineStore.addKeyframe(id, {
					time: targetTime,
					position: [...currentPose.position],
					rotation: [...currentPose.rotation],
					scale: [...currentPose.scale],
				});
			} else if (
				existingKeys.length === 1 &&
				Math.abs(existingKeys[0].time - targetTime) < 0.02 &&
				!sameTransform(existingKeys[0], currentPose)
			) {
				// User moved object without moving playhead first: advance playhead by 1.5s and key there
				targetTime = Math.min(tl.duration, existingKeys[0].time + 1.5);
				timelineStore.setTime(targetTime);
				timelineStore.addKeyframe(id, {
					time: targetTime,
					position: [...currentPose.position],
					rotation: [...currentPose.rotation],
					scale: [...currentPose.scale],
				});
			} else {
				timelineStore.addKeyframe(id, {
					time: targetTime,
					position: [...currentPose.position],
					rotation: [...currentPose.rotation],
					scale: [...currentPose.scale],
				});
				if (existingKeys.length === 0 && targetTime <= 0.02) {
					object.restPose = {
						position: [...currentPose.position],
						rotation: [...currentPose.rotation],
						scale: [...currentPose.scale],
					};
				}
			}
			const before = animationSnapshot;
			animationSnapshot = null;
			if (before) {
				const after = timelineStore.snapshotAnimation();
				if (animationDataKey(before) !== animationDataKey(after)) {
					past.push({ kind: 'animation', before, after });
					trimHistory();
					future.length = 0;
				}
			}
			return targetTime;
		},

		refreshObject: (id: string) => refreshObject(id),
		addObject: (object: SceneObject) =>
			update((state) => {
				pushHistory(state);
				state.objects.push(cloneObject(object));
				return state;
			}),
		removeObject: (id: string) =>
			update((state) => {
				pushHistory(state);
				state.objects = state.objects.filter((o) => o.id !== id);
				if (state.selectedId === id) state.selectedId = null;
				return state;
			}),
		selectObject: (id: string | null, additive = false) =>
			update((state) => {
				if (state.selectedId !== id) {
					state.selectedVertices = [];
					state.selectedEdges = [];
					state.selectedFaces = [];
					state.hover = null;
				}
				if (additive && id) {
					const object = state.objects.find((item) => item.id === id);
					if (!object || object.locked) return state;
					object.selected = !object.selected;
					if (object.selected) state.selectedId = id;
					else if (state.selectedId === id) {
						state.selectedId = [...state.objects].reverse().find((item) => item.selected)?.id ?? null;
					}
				} else {
					state.selectedId = id;
					state.objects.forEach((object) => (object.selected = object.id === id));
				}
				for (const object of state.objects) object.selectionVersion++;
				return state;
			}),
		selectAll: () =>
			update((state) => {
				let last: string | null = null;
				for (const object of state.objects) {
					if (object.locked) continue;
					object.selected = true;
					last = object.id;
					object.selectionVersion++;
				}
				state.selectedId = last ?? state.selectedId;
				return state;
			}),
		setTransforms: (
			entries: { id: string; position?: [number, number, number]; rotation?: [number, number, number]; scale?: [number, number, number] }[],
		) =>
			update((state) => {
				for (const entry of entries) {
					const object = state.objects.find((item) => item.id === entry.id);
					if (!object) continue;
					if (entry.position) object.position = [...entry.position] as [number, number, number];
					if (entry.rotation) object.rotation = [...entry.rotation] as [number, number, number];
					if (entry.scale) object.scale = [...entry.scale] as [number, number, number];
				}
				return state;
			}),
		toggleVisibility: (id: string) =>
			update((state) => {
				const object = state.objects.find((o) => o.id === id);
				if (!object) return state;
				object.visible = !object.visible;
				timelineStore.setTrackMeta(id, { hidden: !object.visible });
				const tl = get(timelineStore);
				const hasVisCurve = Boolean(tl.curves.get(id)?.get('visible')?.keys.length);
				if (tl.autoKey && (hasVisCurve || (tl.keyframes.get(id)?.length ?? 0) > 0)) {
					timelineStore.setVisibilityKeyframe(id, tl.currentTime, object.visible, {
						position: [...object.position] as [number, number, number],
						rotation: [...object.rotation] as [number, number, number],
						scale: [...object.scale] as [number, number, number],
					});
				}
				return state;
			}),
		toggleLock: (id: string) =>
			update((state) => {
				const object = state.objects.find((o) => o.id === id);
				if (!object) return state;
				object.locked = !object.locked;
				timelineStore.setTrackMeta(id, { locked: object.locked });
				if (object.locked && state.selectedId === id) {
					object.selected = false;
					state.selectedId = null;
				}
				return state;
			}),
		deleteObject: (id: string) =>
			update((state) => {
				pushHistory(state);
				state.objects = state.objects.filter((o) => o.id !== id);
				for (const obj of state.objects) {
					if (obj.parent === id) delete obj.parent;
					if (obj.children.includes(id)) obj.children = obj.children.filter((cid) => cid !== id);
					if (obj.cameraProps?.targetId === id) obj.cameraProps.targetId = null;
				}
				if (state.selectedId === id) state.selectedId = null;
				return state;
			}),
		deleteSelected: () =>
			update((state) => {
				const doomed = new Set(state.objects.filter((o) => o.selected && !o.locked).map((o) => o.id));
				if (state.selectedId && !doomed.size) doomed.add(state.selectedId);
				if (!doomed.size) return state;
				pushHistory(state);
				state.objects = state.objects.filter((o) => !doomed.has(o.id));
				for (const obj of state.objects) {
					if (obj.parent && doomed.has(obj.parent)) delete obj.parent;
					if (obj.children.length) obj.children = obj.children.filter((cid) => !doomed.has(cid));
					if (obj.cameraProps?.targetId && doomed.has(obj.cameraProps.targetId)) obj.cameraProps.targetId = null;
				}
				state.selectedId = null;
				state.editMode = false;
				return state;
			}),
		renameObject: (id: string, name: string) =>
			update((state) => {
				const object = state.objects.find((o) => o.id === id);
				if (!object) return state;
				const clean = name.trim().slice(0, 60);
				if (!clean || clean === object.name) return state;
				pushHistory(state);
				object.name = clean;
				timelineStore.setTrackMeta(id, { name: clean });
				return state;
			}),

		duplicateObject: (id: string) =>
			update((state) => {
				const source = state.objects.find((o) => o.id === id);
				if (!source) return state;
				pushHistory(state);
				const copy = cloneObject(source);
				copy.id = nextId();
				copy.name = uniqueName(state.objects, source.name);
				copy.position = [source.position[0] + 0.35, source.position[1], source.position[2] + 0.35];
				copy.selected = false;
				state.objects.forEach((o) => (o.selected = false));
				state.objects.push(copy);
				state.selectedId = copy.id;
				return state;
			}),

		duplicateSelected: () =>
			update((state) => {
				const sources = state.objects.filter((o) => o.selected);
				if (!sources.length) {
					const active = state.objects.find((o) => o.id === state.selectedId);
					if (active) sources.push(active);
				}
				if (!sources.length) return state;
				pushHistory(state);
				state.objects.forEach((o) => (o.selected = false));
				let last: string | null = null;
				for (const source of sources) {
					const copy = cloneObject(source);
					copy.id = nextId();
					copy.name = uniqueName(state.objects, source.name);
					copy.position = [source.position[0] + 0.7, source.position[1], source.position[2] + 0.7];
					copy.selected = true;
					state.objects.push(copy);
					last = copy.id;
				}
				state.selectedId = last;
				return state;
			}),
		mirrorSelected: (axis: 'x' | 'y' | 'z' = 'x') =>
			update((state) => {
				const object = state.objects.find((o) => o.id === state.selectedId);
				if (!object) return state;
				pushHistory(state);
				const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
				object.scale[index] *= -1;
				return state;
			}),
		setColor: (id: string, color: string) =>
			update((state) => {
				const object = state.objects.find((o) => o.id === id);
				if (!object) return state;
				pushHistory(state);
				object.color = color;
				const slots = object.geometry?.slots;
				if (slots?.length) {
					object.geometry = { ...object.geometry, slots: slots.map((slot, index) => (index === 0 ? { ...slot, color } : slot)) } as Mesh;
					object.colorVersion++;
				}
				return state;
			}),
		setMaterial: (id: string, patch: Partial<Material>) =>
			update((state) => {
				const object = state.objects.find((o) => o.id === id);
				if (!object) return state;
				pushHistory(state);
				object.material = { ...object.material, ...patch };
				const slots = object.geometry?.slots;
				if (slots?.length) {
					object.geometry = {
						...object.geometry,
						slots: slots.map((slot, index) =>
							index === 0
								? {
										...slot,
										emissive: patch.emissive ?? slot.emissive,
										opacity: patch.opacity ?? slot.opacity,
										metalness: patch.metalness ?? slot.metalness,
										roughness: patch.roughness ?? slot.roughness,
									}
								: slot,
						),
					} as Mesh;
					object.colorVersion++;
				}
				return state;
			}),
		paintObject: (id: string, color: string) =>
			update((state) => {
				const object = state.objects.find((o) => o.id === id);
				if (!object) return state;
				pushHistory(state);
				object.color = color;
				return state;
			}),
		setTransform: (id: string, patch: Partial<Pick<SceneObject, 'position' | 'rotation' | 'scale'>>) =>
			update((state) => {
				const object = state.objects.find((o) => o.id === id);
				if (!object) return state;
				if (patch.position) object.position = [...patch.position] as [number, number, number];
				if (patch.rotation) object.rotation = [...patch.rotation] as [number, number, number];
				if (patch.scale) object.scale = [...patch.scale] as [number, number, number];
				return state;
			}),
		setPhysics: (id: string, patch: Partial<PhysicsBody>) =>
			update((state) => {
				const object = state.objects.find((o) => o.id === id);
				if (!object) return state;
				pushHistory(state);
				object.physics = { ...object.physics, ...patch };
				if (object.physics.dynamic && !object.physics.home) object.physics.home = [...object.position] as [number, number, number];
				if (patch.dynamic === false) object.physics.velocity = [0, 0, 0];
				return state;
			}),
		stepPhysics: (dt: number, gravity = 9.8) =>
			update((state) => {
				const dyn: SceneObject[] = [];
				for (const object of state.objects) {
					if (!object.physics.dynamic || object.type === 'light' || object.type === 'camera') continue;
					dyn.push(object);
					const halfHeight = Math.max(0.1, (object.geometry?.radius ?? meshFor(object.type)?.radius ?? 0.5) * Math.abs(object.scale[1]));
					const velocity = object.physics.velocity;
					velocity[1] -= gravity * dt;
					const position = [...object.position] as [number, number, number];
					position[0] += velocity[0] * dt;
					position[1] += velocity[1] * dt;
					position[2] += velocity[2] * dt;
					if (position[1] <= halfHeight) {
						position[1] = halfHeight;
						velocity[1] = -velocity[1] * object.physics.restitution;
						velocity[0] *= 0.86;
						velocity[2] *= 0.86;
						if (Math.abs(velocity[1]) < 0.35) velocity[1] = 0;
					}
					object.position = position;
				}
				// Object-to-object elastic sphere collisions
				for (let i = 0; i < dyn.length; i++) {
					for (let j = i + 1; j < dyn.length; j++) {
						const a = dyn[i];
						const b = dyn[j];
						const ra = Math.max(0.2, (a.geometry?.radius ?? 0.5) * Math.max(Math.abs(a.scale[0]), Math.abs(a.scale[2])) * 0.75);
						const rb = Math.max(0.2, (b.geometry?.radius ?? 0.5) * Math.max(Math.abs(b.scale[0]), Math.abs(b.scale[2])) * 0.75);
						const dx = b.position[0] - a.position[0];
						const dy = b.position[1] - a.position[1];
						const dz = b.position[2] - a.position[2];
						const dist = Math.hypot(dx, dy, dz);
						const minDist = ra + rb;
						if (dist > 1e-5 && dist < minDist) {
							const nx = dx / dist, ny = dy / dist, nz = dz / dist;
							const overlap = (minDist - dist) * 0.5;
							a.position = [a.position[0] - nx * overlap, a.position[1] - ny * overlap, a.position[2] - nz * overlap];
							b.position = [b.position[0] + nx * overlap, b.position[1] + ny * overlap, b.position[2] + nz * overlap];
							const rvx = b.physics.velocity[0] - a.physics.velocity[0];
							const rvy = b.physics.velocity[1] - a.physics.velocity[1];
							const rvz = b.physics.velocity[2] - a.physics.velocity[2];
							const velAlongNormal = rvx * nx + rvy * ny + rvz * nz;
							if (velAlongNormal < 0) {
								const e = Math.min(a.physics.restitution, b.physics.restitution);
								const jImp = (-(1 + e) * velAlongNormal) * 0.5;
								a.physics.velocity[0] -= jImp * nx;
								a.physics.velocity[1] -= jImp * ny;
								a.physics.velocity[2] -= jImp * nz;
								b.physics.velocity[0] += jImp * nx;
								b.physics.velocity[1] += jImp * ny;
								b.physics.velocity[2] += jImp * nz;
							}
						}
					}
				}
				return state;
			}),
		resetPhysics: () =>
			update((state) => {
				pushHistory(state);
				for (const object of state.objects) {
					if (!object.physics.dynamic) continue;
					object.physics.velocity = [0, 0, 0];
					if (object.physics.home) object.position = [...object.physics.home] as [number, number, number];
				}
				return state;
			}),

		/** Simulates physics and bakes the resulting trajectory into real timeline keyframes. */
		bakePhysicsToKeyframes: (duration = 3, fps = 15, gravity = 9.8): number => {
			const state = get(sceneStore);
			const dynamicObjects = state.objects.filter((o) => o.physics.dynamic && o.type !== 'light' && o.type !== 'camera');
			if (!dynamicObjects.length) return 0;
			const beforeAnim = timelineStore.snapshotAnimation();
			const sim = dynamicObjects.map((o) => ({
				id: o.id,
				pos: [...o.position] as [number, number, number],
				rot: [...o.rotation] as [number, number, number],
				scl: [...o.scale] as [number, number, number],
				vel: [...o.physics.velocity] as [number, number, number],
				rest: o.physics.restitution,
				halfH: Math.max(0.1, (o.geometry?.radius ?? meshFor(o.type)?.radius ?? 0.5) * Math.abs(o.scale[1])),
			}));
			const dt = 1 / fps;
			const steps = Math.max(2, Math.round(duration * fps));
			timelineStore.setDuration(Math.max(duration, get(timelineStore).duration));
			for (let step = 0; step <= steps; step++) {
				const t = step * dt;
				for (const item of sim) {
					timelineStore.addKeyframe(item.id, {
						time: t,
						position: [...item.pos],
						rotation: [...item.rot],
						scale: [...item.scl],
					});
					item.vel[1] -= gravity * dt;
					item.pos[0] += item.vel[0] * dt;
					item.pos[1] += item.vel[1] * dt;
					item.pos[2] += item.vel[2] * dt;
					if (item.pos[1] <= item.halfH) {
						item.pos[1] = item.halfH;
						item.vel[1] = -item.vel[1] * item.rest;
						item.vel[0] *= 0.86;
						item.vel[2] *= 0.86;
						if (Math.abs(item.vel[1]) < 0.25) item.vel[1] = 0;
					}
				}
			}
			const afterAnim = timelineStore.snapshotAnimation();
			if (animationDataKey(beforeAnim) !== animationDataKey(afterAnim)) {
				past.push({ kind: 'animation', before: beforeAnim, after: afterAnim });
				trimHistory();
				future.length = 0;
			}
			return dynamicObjects.length;
		},

		/** Adds a connected Bone chain for rigging. */
		addBoneChain: (countOrPos: number | Vec3 = 3, maybeCount?: number) =>
			update((state) => {
				pushHistory(state);
				state.objects.forEach((o) => (o.selected = false));
				let parentId: string | undefined;
				let lastId: string | null = null;
				const count = typeof countOrPos === 'number' ? countOrPos : (typeof maybeCount === 'number' ? maybeCount : 3);
				for (let i = 0; i < count; i++) {
					const obj = newObject(state, 'bone', `Bone.${String(i + 1).padStart(2, '0')}`);
					obj.position = [0, 0.3 + i * 0.45, 0];
					obj.restPose = {
						position: [...obj.position] as [number, number, number],
						rotation: [0, 0, 0],
						scale: [1, 1, 1],
					};
					obj.depth = i;
					obj.parent = parentId;
					obj.selected = i === count - 1;
					if (parentId) {
						const p = state.objects.find((o) => o.id === parentId);
						if (p) p.children.push(obj.id);
					}
					state.objects.push(obj);
					parentId = obj.id;
					lastId = obj.id;
				}
				state.selectedId = lastId;
				return state;
			}),

		// ---- Animation history ----------------------------------------------

		beginAnimationEdit: () => {
			animationSnapshot = timelineStore.snapshotAnimation();
		},
		endAnimationEdit: () => {
			const before = animationSnapshot;
			animationSnapshot = null;
			if (!before) return;
			const after = timelineStore.snapshotAnimation();
			if (animationDataKey(before) === animationDataKey(after)) return;
			past.push({ kind: 'animation', before, after });
			trimHistory();
			future.length = 0;
		},
		animationEdit: (mutate: () => void) => {
			animationSnapshot = timelineStore.snapshotAnimation();
			mutate();
			const before = animationSnapshot;
			animationSnapshot = null;
			if (!before) return;
			const after = timelineStore.snapshotAnimation();
			if (animationDataKey(before) === animationDataKey(after)) return;
			past.push({ kind: 'animation', before, after });
			trimHistory();
			future.length = 0;
		},

		beginTransform: (mode: 'transform' | 'geometry' = 'transform') => {
			const state = get(sceneStore);
			const object = state.objects.find((item) => item.id === state.selectedId) ?? null;
			const mesh = mode === 'geometry' && object ? materializeGeometry(object) : null;
			transformSnapshot = {
				mode,
				objectId: object?.id ?? null,
				transforms: captureTransforms(state),
				vertices: mesh ? Float32Array.from(mesh.vertices.flat()) : null,
			};
		},
		endTransform: () => {
			const start = transformSnapshot;
			if (!start) return;
			transformSnapshot = null;
			const state = get(sceneStore);
			const after = captureTransforms(state);
			const moved = diffTransforms(start.transforms, after);

			if (start.mode === 'geometry' && start.objectId && start.vertices) {
				const object = state.objects.find((item) => item.id === start.objectId);
				if (!object) return;
				const mesh = object.geometry;
				if (!mesh) return;
				const before = start.vertices;
				const indices: number[] = [];
				const beforeValues: number[] = [];
				const afterValues: number[] = [];
				const count = Math.min(mesh.vertices.length, before.length / 3);
				for (let i = 0; i < count; i++) {
					const x = mesh.vertices[i][0];
					const y = mesh.vertices[i][1];
					const z = mesh.vertices[i][2];
					if (x === before[i * 3] && y === before[i * 3 + 1] && z === before[i * 3 + 2]) continue;
					indices.push(i);
					beforeValues.push(before[i * 3], before[i * 3 + 1], before[i * 3 + 2]);
					afterValues.push(x, y, z);
				}
				if (!indices.length) return;
				object.geometryVersion++;
				past.push({
					kind: 'mesh',
					objectId: start.objectId,
					indices,
					before: beforeValues,
					after: afterValues,
					transforms: moved,
				});
				trimHistory();
				future.length = 0;
				return;
			}

			if (!moved) return;
			const animBefore = timelineStore.snapshotAnimation();
			// Update restPose or Auto-Key when timeline is active or object already has keyframes
			const tl = get(timelineStore);
			for (const id of Object.keys(moved.after)) {
				const obj = state.objects.find((o) => o.id === id);
				const keys = tl.keyframes.get(id) ?? [];
				const beforePose = moved.before[id];
				const afterPose = moved.after[id];
				if (obj && keys.length === 0 && tl.currentTime <= 0.02) {
					obj.restPose = {
						position: [...afterPose.position],
						rotation: [...afterPose.rotation],
						scale: [...afterPose.scale],
					};
				}
				if (tl.autoKey && (tl.show || keys.length > 0)) {
					if (keys.length === 0 && tl.currentTime > 0.02) {
						const startPose = obj?.restPose ?? beforePose;
						timelineStore.addKeyframe(id, {
							time: 0,
							position: [...startPose.position],
							rotation: [...startPose.rotation],
							scale: [...startPose.scale],
						});
						timelineStore.addKeyframe(id, {
							time: tl.currentTime,
							position: [...afterPose.position],
							rotation: [...afterPose.rotation],
							scale: [...afterPose.scale],
						});
					} else {
						timelineStore.addKeyframe(id, {
							time: tl.currentTime,
							position: [...afterPose.position],
							rotation: [...afterPose.rotation],
							scale: [...afterPose.scale],
						});
					}
				}
			}
			const animAfter = timelineStore.snapshotAnimation();
			const hasAnimChange = animationDataKey(animBefore) !== animationDataKey(animAfter);
			past.push({
				kind: 'transform',
				before: moved.before,
				after: moved.after,
				...(hasAnimChange ? { animBefore, animAfter } : {}),
			});
			trimHistory();
			future.length = 0;
		},

		setTimelineHidden: (ids: Set<string>) => {
			const current = get(sceneStore);
			let changed = false;
			for (const object of current.objects) {
				if (Boolean(object.timelineHidden) !== ids.has(object.id)) {
					changed = true;
					break;
				}
			}
			if (!changed) return;
			update((state) => {
				for (const object of state.objects) {
					object.timelineHidden = ids.has(object.id);
				}
				return state;
			});
		},

		applyAnimation: (transforms: Map<string, { position?: [number, number, number]; rotation?: [number, number, number]; scale?: [number, number, number]; visible?: boolean }>) =>
			update((state) => {
				for (const object of state.objects) {
					const transform = transforms.get(object.id);
					if (!transform) continue;
					if (transform.position) {
						object.position[0] = transform.position[0];
						object.position[1] = transform.position[1];
						object.position[2] = transform.position[2];
					}
					if (transform.rotation) {
						object.rotation[0] = transform.rotation[0];
						object.rotation[1] = transform.rotation[1];
						object.rotation[2] = transform.rotation[2];
					}
					if (transform.scale) {
						object.scale[0] = transform.scale[0];
						object.scale[1] = transform.scale[1];
						object.scale[2] = transform.scale[2];
					}
					if (transform.visible !== undefined) {
						object.visible = transform.visible;
					}
				}
				return state;
			}),
		undo: () => {
			const animation = past[past.length - 1];
			if (animation?.kind === 'animation') {
				past.pop();
				timelineStore.restoreAnimation(animation.before);
				future.push(animation);
				return;
			}
			update((state) => {
				const previous = past.pop();
				if (!previous) return state;
				if (previous.kind === 'scene') {
					future.push({ kind: 'scene', state: cloneState(state) });
					restoreSnapshot(state, previous.state);
					return state;
				}
				if (previous.kind === 'transform') {
					applyTransforms(state, previous.before);
					if (previous.animBefore) timelineStore.restoreAnimation(previous.animBefore);
					future.push(previous);
					return state;
				}
				if (previous.kind === 'animation') return state;
				const object = state.objects.find((item) => item.id === previous.objectId);
				if (!object?.geometry) return state;
				const mesh = object.geometry;
				for (let i = 0; i < previous.indices.length; i++) {
					const vertex = mesh.vertices[previous.indices[i]];
					if (!vertex) continue;
					vertex[0] = previous.before[i * 3];
					vertex[1] = previous.before[i * 3 + 1];
					vertex[2] = previous.before[i * 3 + 2];
				}
				mesh.radius = computeRadius(mesh.vertices);
				mesh.normals = undefined;
				if (previous.transforms) applyTransforms(state, previous.transforms.before);
				object.geometryVersion++;
				future.push(previous);
				return state;
			});
		},
		redo: () => {
			const animation = future[future.length - 1];
			if (animation?.kind === 'animation') {
				future.pop();
				timelineStore.restoreAnimation(animation.after);
				past.push(animation);
				return;
			}
			update((state) => {
				const next = future.pop();
				if (!next) return state;
				if (next.kind === 'scene') {
					past.push({ kind: 'scene', state: cloneState(state) });
					restoreSnapshot(state, next.state);
					return state;
				}
				if (next.kind === 'transform') {
					applyTransforms(state, next.after);
					if (next.animAfter) timelineStore.restoreAnimation(next.animAfter);
					past.push(next);
					return state;
				}
				if (next.kind === 'animation') return state;
				const object = state.objects.find((item) => item.id === next.objectId);
				if (!object?.geometry) return state;
				const mesh = object.geometry;
				for (let i = 0; i < next.indices.length; i++) {
					const vertex = mesh.vertices[next.indices[i]];
					if (!vertex) continue;
					vertex[0] = next.after[i * 3];
					vertex[1] = next.after[i * 3 + 1];
					vertex[2] = next.after[i * 3 + 2];
				}
				mesh.radius = computeRadius(mesh.vertices);
				mesh.normals = undefined;
				if (next.transforms) applyTransforms(state, next.transforms.after);
				object.geometryVersion++;
				past.push(next);
				return state;
			});
		},
		canUndo: () => past.length > 0,
		canRedo: () => future.length > 0,
		historySize: () => ({ past: past.length, future: future.length }),
		toggleGameMode: () =>
			update((state) => {
				state.gameMode = !state.gameMode;
				return state;
			}),
		addScore: (amount = 1) =>
			update((state) => {
				state.score += amount;
				return state;
			}),
		setScore: (score: number) =>
			update((state) => {
				state.score = Math.max(0, Math.round(score));
				return state;
			}),
		resetScore: () =>
			update((state) => {
				state.score = 0;
				return state;
			}),
		resetGameInput: () => {
			gameInput.up = false;
			gameInput.down = false;
			gameInput.left = false;
			gameInput.right = false;
			gameInput.jump = false;
		},
		setGameInput: (direction: keyof GameInput, pressed: boolean) => {
			gameInput[direction] = pressed;
		},
		setJump: (pressed: boolean) => {
			gameInput.jump = pressed;
		},
		getGameInput: (): GameInput => ({ ...gameInput }),

		// ---- Edit mode ----
		setEditMode: (editMode: boolean) =>
			update((state) => {
				if (state.editMode === editMode) return state;
				state.editMode = editMode;
				state.selectedVertices = [];
				state.selectedEdges = [];
				state.selectedFaces = [];
				state.hover = null;
				if (editMode) {
					const object = state.objects.find((o) => o.id === state.selectedId);
					if (object && object.type !== 'light' && object.type !== 'camera') {
						materializeGeometry(object);
						object.geometryVersion++;
					}
				}
				for (const object of state.objects) object.selectionVersion++;
				return state;
			}),
		setElementMode: (elementMode: ElementKind) =>
			update((state) => {
				state.elementMode = elementMode;
				state.selectedVertices = [];
				state.selectedEdges = [];
				state.selectedFaces = [];
				for (const object of state.objects) object.selectionVersion++;
				return state;
			}),
		setHover: (hover: SceneState['hover']) =>
			update((state) => {
				const previous = state.hover;
				if (previous?.kind === hover?.kind && previous?.index === hover?.index) return state;
				state.hover = hover;
				const object = state.objects.find((o) => o.id === state.selectedId);
				if (object) object.selectionVersion++;
				return state;
			}),
		selectElement: (kind: ElementKind, index: number, additive: boolean) =>
			update((state) => {
				const key = kind === 'vertex' ? 'selectedVertices' : kind === 'edge' ? 'selectedEdges' : 'selectedFaces';
				const current = state[key];
				const exists = current.includes(index);
				state.selectedVertices = kind === 'vertex' ? state.selectedVertices : [];
				state.selectedEdges = kind === 'edge' ? state.selectedEdges : [];
				state.selectedFaces = kind === 'face' ? state.selectedFaces : [];
				if (additive && exists) state[key] = current.filter((value) => value !== index);
				else if (additive) state[key] = uniqueSorted([...current, index]);
				else state[key] = [index];
				const object = state.objects.find((o) => o.id === state.selectedId);
				if (object) object.selectionVersion++;
				return state;
			}),
		selectElements: (kind: ElementKind, indices: number[], additive: boolean) =>
			update((state) => {
				const key = kind === 'vertex' ? 'selectedVertices' : kind === 'edge' ? 'selectedEdges' : 'selectedFaces';
				state.selectedVertices = kind === 'vertex' ? state.selectedVertices : [];
				state.selectedEdges = kind === 'edge' ? state.selectedEdges : [];
				state.selectedFaces = kind === 'face' ? state.selectedFaces : [];
				state[key] = additive ? uniqueSorted([...state[key], ...indices]) : uniqueSorted(indices);
				const object = state.objects.find((o) => o.id === state.selectedId);
				if (object) object.selectionVersion++;
				return state;
			}),
		clearElementSelection: () =>
			update((state) => {
				state.selectedVertices = [];
				state.selectedEdges = [];
				state.selectedFaces = [];
				const object = state.objects.find((o) => o.id === state.selectedId);
				if (object) object.selectionVersion++;
				return state;
			}),

		/** Translates/scales the currently selected vertices, edges, or faces in Edit Mode. */
		translateSelectedElements: (delta: Vec3) =>
			update((state) => {
				const object = state.objects.find((o) => o.id === state.selectedId);
				if (!object || !object.geometry) return state;
				const mesh = object.geometry;
				const vIndices = new Set<number>();
				for (const v of state.selectedVertices) vIndices.add(v);
				for (const e of state.selectedEdges) {
					const edge = mesh.edges[e];
					if (edge) { vIndices.add(edge[0]); vIndices.add(edge[1]); }
				}
				for (const f of state.selectedFaces) {
					const face = mesh.faces[f];
					if (face) for (const v of face) vIndices.add(v);
				}
				if (!vIndices.size) return state;
				for (const idx of vIndices) {
					const v = mesh.vertices[idx];
					if (!v) continue;
					v[0] += delta[0];
					v[1] += delta[1];
					v[2] += delta[2];
				}
				mesh.radius = computeRadius(mesh.vertices);
				if (mesh.smooth) mesh.normals = computeVertexNormals(mesh);
				else mesh.normals = undefined;
				object.geometryVersion++;
				return state;
			}),

		// ---- Mesh operations ----
		meshOp: (op: string, params: Record<string, any> = {}) => {
			let failure: string | null = null;
			update((state) => {
				const object = state.objects.find((o) => o.id === state.selectedId);
				if (!object || object.type === 'light' || object.type === 'camera') return state;
				const mesh = materializeGeometry(object);
				let next: Mesh | null = null;
				let nextEdges: [number, number][] | null = null;
				let nextVerts: number[] | null = null;
				let nextFaces: number[] | null = null;
				pushHistory(state);
				switch (op) {
					case 'subdivide':
						next = subdivide(mesh, mesh.smooth ?? true);
						break;
					case 'extrude': {
						const facesToExtrude = state.selectedFaces.length
							? state.selectedFaces
							: mesh.faces.length ? [0] : [];
						if (!facesToExtrude.length) {
							past.pop();
							return state;
						}
						next = extrudeFaces(mesh, facesToExtrude, params.amount ?? 0.35);
						break;
					}
					case 'inset': {
						const facesToInset = state.selectedFaces.length
							? state.selectedFaces
							: mesh.faces.length ? [0] : [];
						if (!facesToInset.length) {
							past.pop();
							return state;
						}
						next = insetFaces(mesh, facesToInset, params.amount ?? 0.18);
						break;
					}
					case 'delete':
						if (state.selectedFaces.length) {
							if (state.selectedFaces.length >= mesh.faces.length) {
								past.pop();
								return state;
							}
							next = deleteMeshFaces(mesh, state.selectedFaces);
						} else if (state.elementMode === 'edge' && state.selectedEdges.length) {
							next = deleteGeometry(mesh, 'edge', state.selectedEdges);
						} else if (state.elementMode === 'vertex' && state.selectedVertices.length) {
							next = deleteGeometry(mesh, 'vertex', state.selectedVertices);
						} else {
							past.pop();
							return state;
						}
						break;
					case 'duplicate': {
						const indices =
							state.elementMode === 'face'
								? (state.selectedFaces.length ? state.selectedFaces : [0])
								: state.elementMode === 'edge'
									? (state.selectedEdges.length ? state.selectedEdges : [0])
									: (state.selectedVertices.length ? state.selectedVertices : mesh.vertices.map((_, i) => i));
						const dup = duplicateMeshGeometry(mesh, state.elementMode, indices);
						next = dup.mesh;
						nextVerts = dup.newVertexIndices;
						nextFaces = dup.newFaceIndices;
						break;
					}
					case 'merge':
						next = mergeByDistance(mesh, params.amount ?? 0.001);
						break;
					case 'flip':
						next = flipNormals(mesh);
						break;
					case 'array':
						next = arrayMesh(mesh, params.amount ?? params.count ?? 3, params.offset ?? [1.25, 0, 0]);
						break;
					case 'solidify':
						next = solidifyMesh(mesh, params.amount ?? 0.12);
						break;
					case 'smooth':
						next = smoothMeshVertices(mesh, Math.max(1, Math.round(params.amount ?? params.iterations ?? 2)), params.factor ?? 0.5);
						break;
					case 'unwrap-box':
						next = unwrapMeshUV(mesh, 'box', params.amount ?? 1);
						break;
					case 'unwrap-planar':
						next = unwrapMeshUV(mesh, 'planar', params.amount ?? 1);
						break;
					case 'unwrap-cylindrical':
						next = unwrapMeshUV(mesh, 'cylindrical', params.amount ?? 1);
						break;
					case 'unwrap-spherical':
						next = unwrapMeshUV(mesh, 'spherical', params.amount ?? 1);
						break;
					case 'bake-ao':
						next = bakeMeshVertexColors(mesh, 'ao');
						break;
					case 'bake-light':
						next = bakeMeshVertexColors(mesh, 'light');
						break;
					case 'bake-gradient':
						next = bakeMeshVertexColors(mesh, 'gradient');
						break;
					case 'bake-curvature':
						next = bakeMeshVertexColors(mesh, 'curvature');
						break;
					case 'loopcut': {
						const start = state.selectedEdges[0] ?? 0;
						const cut = loopCut(mesh, start, params.amount ?? params.cuts ?? 1);
						if (!cut.ok) {
							failure = cut.error.message;
							past.pop();
							return state;
						}
						next = cut.mesh;
						nextEdges = cut.edges;
						break;
					}
					case 'bevel': {
						const corners = state.selectedVertices.length
							? state.selectedVertices
							: mesh.vertices.map((_, index) => index);
						const bevelled = bevelVertices(mesh, corners, params.amount ?? 0.05, params.segments ?? 1);
						if (!bevelled.ok) {
							failure = bevelled.error.message;
							past.pop();
							return state;
						}
						next = bevelled.mesh;
						break;
					}
					case 'bridge': {
						if (state.selectedFaces.length >= 2) {
							const f1 = mesh.faces[state.selectedFaces[0]];
							const f2 = mesh.faces[state.selectedFaces[1]];
							next = bridgeEdgeLoops(mesh, f1, f2);
						} else if (state.selectedEdges.length >= 2) {
							const e1 = mesh.edges[state.selectedEdges[0]];
							const e2 = mesh.edges[state.selectedEdges[1]];
							next = bridgeEdgeLoops(mesh, [e1[0], e1[1]], [e2[0], e2[1]]);
						} else {
							// Bridge boundary loops or opposite faces
							const f1 = mesh.faces[0];
							const f2 = mesh.faces[mesh.faces.length - 1];
							next = bridgeEdgeLoops(mesh, f1, f2);
						}
						break;
					}
					case 'merge-center':
					case 'merge-first':
					case 'merge-last':
					case 'merge-collapse': {
						const mode = op === 'merge-first' ? 'first' : op === 'merge-last' ? 'last' : op === 'merge-collapse' ? 'collapse' : 'center';
						const verts = state.selectedVertices.length ? state.selectedVertices : mesh.vertices.map((_, i) => i);
						next = mergeVertices(mesh, verts, mode);
						break;
					}
					case 'dissolve': {
						if (state.elementMode === 'face' && state.selectedFaces.length) {
							next = dissolveGeometry(mesh, 'face', state.selectedFaces);
						} else if (state.elementMode === 'edge' && state.selectedEdges.length) {
							next = dissolveGeometry(mesh, 'edge', state.selectedEdges);
						} else if (state.elementMode === 'vertex' && state.selectedVertices.length) {
							next = dissolveGeometry(mesh, 'vertex', state.selectedVertices);
						} else {
							past.pop();
							return state;
						}
						break;
					}
					case 'separate': {
						if (!state.selectedFaces.length) {
							past.pop();
							return state;
						}
						const sep = separateGeometry(mesh, state.selectedFaces);
						next = sep.remainingMesh;
						// Add separated mesh as a new object
						const newId = 'obj_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
						const newObj: SceneObject = {
							...object,
							id: newId,
							name: object.name + '_sep',
							geometry: sep.separatedMesh,
							geometryVersion: 1,
							colorVersion: 1,
							selectionVersion: 1,
							position: [...object.position] as [number, number, number],
							children: [],
						};
						state.objects.push(newObj);
						break;
					}
					case 'decimate': {
						next = decimateMesh(mesh, params.ratio ?? params.amount ?? 0.5);
						break;
					}
					case 'mirror': {
						next = mirrorMesh(mesh, params.axis ?? 'x', params.threshold ?? 0.001);
						break;
					}
					case 'screw': {
						next = screwSpinMesh(
							mesh,
							params.axis ?? 'z',
							params.angle ?? 360,
							params.steps ?? 16,
							params.pitch ?? params.amount ?? 0.5
						);
						break;
					}
					case 'boolean': {
						// Target object from params or next available mesh object
						const targetObj = state.objects.find((o) => o.id !== object.id && o.geometry);
						if (targetObj && targetObj.geometry) {
							next = booleanMesh(mesh, targetObj.geometry, params.op ?? 'difference');
						} else {
							past.pop();
							return state;
						}
						break;
					}
					default:
						past.pop();
						return state;
				}
				if (!next) {
					past.pop();
					return state;
				}
				object.geometry = next;
				object.geometryVersion++;
				object.colorVersion++;
				object.selectionVersion++;
				state.selectedVertices = [];
				state.selectedEdges = [];
				state.selectedFaces = [];
				if (nextEdges) {
					state.selectedEdges = nextEdges
						.map((edge) => next!.edges.findIndex((candidate) => candidate[0] === edge[0] && candidate[1] === edge[1]))
						.filter((index) => index >= 0);
					state.elementMode = 'edge';
				} else if (nextVerts || nextFaces) {
					if (state.elementMode === 'face' && nextFaces?.length) state.selectedFaces = nextFaces;
					else if (nextVerts?.length) state.selectedVertices = nextVerts;
				} else if (op === 'bevel') {
					state.elementMode = 'vertex';
				}
				return state;
			});
			return failure;
		},

		// ---- Sculpt / paint (Optimized in-place vertex updates) ----
		applyBrush: (
			kind: string,
			localPoint: Vec3,
			radius: number,
			strength: number,
			symmetry: { x: boolean; y: boolean; z: boolean } | null,
			delta: Vec3 = [0, 0, 0],
			push = true,
			options?:
				| ((point: Vec3) => Vec3)
				| {
						hardness?: number;
						inverted?: boolean;
						falloff?: 'smooth' | 'linear' | 'hard';
						pressure?: number;
						strokeVector?: Vec3;
						hitNormal?: Vec3;
				  },
		) =>
			update((state) => {
				const object = state.objects.find((o) => o.id === state.selectedId);
				if (!object || object.type === 'light' || object.type === 'camera') return state;
				if (push) pushHistory(state);
				const mesh = materializeGeometry(object);
				if (!mesh.normals || mesh.normals.length !== mesh.vertices.length) {
					mesh.normals = computeVertexNormals(mesh);
				}
				const normals = mesh.normals;
				let affectedCount = 0;
				const centres: Vec3[] = [localPoint];
				if (symmetry) {
					if (symmetry.x) centres.push([-localPoint[0], localPoint[1], localPoint[2]]);
					if (symmetry.y) centres.push([localPoint[0], -localPoint[1], localPoint[2]]);
					if (symmetry.z) centres.push([localPoint[0], localPoint[1], -localPoint[2]]);
					if (symmetry.x && symmetry.y) centres.push([-localPoint[0], -localPoint[1], localPoint[2]]);
					if (symmetry.x && symmetry.z) centres.push([-localPoint[0], localPoint[1], -localPoint[2]]);
					if (symmetry.y && symmetry.z) centres.push([localPoint[0], -localPoint[1], -localPoint[2]]);
					if (symmetry.x && symmetry.y && symmetry.z) centres.push([-localPoint[0], -localPoint[1], -localPoint[2]]);
				}
				if (kind === 'simplify') {
					for (let c = 0; c < centres.length; c++) {
						const simplified = decimateLocal(mesh, centres[c], radius);
						if (simplified !== mesh && simplified.vertices.length < mesh.vertices.length) {
							object.geometry = simplified;
							affectedCount++;
						}
					}
					if (affectedCount) {
						object.geometryVersion++;
						object.selectionVersion++;
						object.colorVersion++;
					} else if (push) {
						past.pop();
					}
					return state;
				}
				let hardness = 0.5;
				let inverted = false;
				let falloffType: 'smooth' | 'linear' | 'hard' = 'smooth';
				let pressure = 1;
				let strokeVec: Vec3 | null = null;
				let hitNorm: Vec3 | null = null;
				if (typeof options === 'object' && options !== null) {
					if (options.hardness !== undefined) hardness = options.hardness;
					if (options.inverted !== undefined) inverted = options.inverted;
					if (options.falloff !== undefined) falloffType = options.falloff;
					if (options.pressure !== undefined) pressure = options.pressure;
					if (options.strokeVector) strokeVec = options.strokeVector;
					if (options.hitNormal) hitNorm = options.hitNormal;
				}
				const sign = inverted ? -1 : 1;
				const effStrength = strength * Math.max(0.05, Math.min(2, pressure));
				const neighbours = kind === 'smooth' || kind === 'clay' ? meshAdjacency(mesh) : null;
				const r2 = radius * radius;
				const invRadius = 1 / Math.max(1e-6, radius);
				const verts = mesh.vertices;
				const vLen = verts.length;

				if (kind === 'mask') {
					if (!mesh.mask || mesh.mask.length !== vLen) mesh.mask = new Array(vLen).fill(0);
					for (let c = 0; c < centres.length; c++) {
						const centre = centres[c];
						const cx = centre[0], cy = centre[1], cz = centre[2];
						for (let i = 0; i < vLen; i++) {
							const v = verts[i];
							const dx = v[0] - cx, dy = v[1] - cy, dz = v[2] - cz;
							const d2 = dx * dx + dy * dy + dz * dz;
							if (d2 > r2) continue;
							affectedCount++;
							const t = 1 - Math.sqrt(d2) * invRadius;
							const deltaMask = t * t * effStrength * sign;
							mesh.mask[i] = Math.min(1, Math.max(0, mesh.mask[i] + deltaMask));
						}
					}
					if (affectedCount) object.colorVersion++;
					else if (push) past.pop();
					return state;
				}

				for (let c = 0; c < centres.length; c++) {
					const centre = centres[c];
					const cx = centre[0], cy = centre[1], cz = centre[2];
					for (let i = 0; i < vLen; i++) {
						const v = verts[i];
						const dx = v[0] - cx, dy = v[1] - cy, dz = v[2] - cz;
						const d2 = dx * dx + dy * dy + dz * dz;
						if (d2 > r2) continue;
						const maskVal = mesh.mask?.[i] ?? 0;
						const unmasked = Math.max(0, 1 - maskVal);
						if (unmasked <= 1e-4) continue;
						affectedCount++;
						const dist = Math.sqrt(d2);
						const t = 1 - dist * invRadius;
						let falloff: number;
						if (falloffType === 'linear') {
							falloff = t;
						} else if (falloffType === 'hard') {
							falloff = dist < 0.85 * radius ? 1 : 6.6 * (1 - dist * invRadius);
						} else {
							const cosine = 0.5 * (1 + Math.cos((1 - t) * Math.PI));
							const exp = Math.max(0.1, 2.2 * (1 - hardness) + 0.3);
							falloff = Math.pow(cosine, exp);
						}
						const amount = falloff * effStrength * unmasked;
						if (kind === 'draw') {
							const n = normals[i] ?? [0, 1, 0];
							const disp = 0.12 * amount * sign;
							v[0] += n[0] * disp;
							v[1] += n[1] * disp;
							v[2] += n[2] * disp;
						} else if (kind === 'clay') {
							const n = hitNorm ?? normals[i] ?? [0, 1, 0];
							const planeDist = (0.14 * sign * effStrength * falloff - (dx * n[0] + dy * n[1] + dz * n[2])) * Math.min(1, 0.85 * amount);
							v[0] += n[0] * planeDist;
							v[1] += n[1] * planeDist;
							v[2] += n[2] * planeDist;
						} else if (kind === 'smooth') {
							const list = neighbours?.get(i);
							if (!list || !list.length) continue;
							let ax = 0, ay = 0, az = 0;
							for (let k = 0; k < list.length; k++) {
								const nb = verts[list[k]];
								ax += nb[0];
								ay += nb[1];
								az += nb[2];
							}
							const invL = 1 / list.length;
							const kFactor = Math.min(1, amount);
							v[0] += (ax * invL - v[0]) * kFactor;
							v[1] += (ay * invL - v[1]) * kFactor;
							v[2] += (az * invL - v[2]) * kFactor;
						} else if (kind === 'inflate') {
							const n = normals[i] ?? [0, 1, 0];
							const disp = 0.15 * amount * sign;
							v[0] += n[0] * disp;
							v[1] += n[1] * disp;
							v[2] += n[2] * disp;
						} else if (kind === 'grab') {
							v[0] += delta[0] * amount;
							v[1] += delta[1] * amount;
							v[2] += delta[2] * amount;
						} else if (kind === 'snake_hook') {
							const sv = !strokeVec || (strokeVec[0] === 0 && strokeVec[1] === 0 && strokeVec[2] === 0) ? delta : strokeVec;
							const scaleHook = 1.35;
							v[0] += sv[0] * amount * scaleHook;
							v[1] += sv[1] * amount * scaleHook;
							v[2] += sv[2] * amount * scaleHook;
						} else if (kind === 'pinch') {
							const kFactor = Math.min(0.7, 0.8 * amount) * sign;
							v[0] -= dx * kFactor;
							v[1] -= dy * kFactor;
							v[2] -= dz * kFactor;
						} else if (kind === 'crease') {
							const pinchFactor = Math.min(0.65, 0.7 * amount);
							v[0] -= dx * pinchFactor;
							v[1] -= dy * pinchFactor;
							v[2] -= dz * pinchFactor;
							const n = normals[i] ?? [0, 1, 0];
							const indent = 0.12 * amount * (inverted ? 1 : -1);
							v[0] += n[0] * indent;
							v[1] += n[1] * indent;
							v[2] += n[2] * indent;
						} else if (kind === 'flatten') {
							const n = hitNorm ?? normals[i] ?? [0, 1, 0];
							const distance = (dx * n[0] + dy * n[1] + dz * n[2]) * Math.min(1, amount);
							v[0] -= n[0] * distance;
							v[1] -= n[1] * distance;
							v[2] -= n[2] * distance;
						} else if (kind === 'fill') {
							const n = hitNorm ?? normals[i] ?? [0, 1, 0];
							const distance = dx * n[0] + dy * n[1] + dz * n[2];
							if (sign > 0 && distance < 0) {
								const kFactor = distance * Math.min(1, amount);
								v[0] -= n[0] * kFactor;
								v[1] -= n[1] * kFactor;
								v[2] -= n[2] * kFactor;
							} else if (sign < 0 && distance < 0) {
								const kFactor = Math.abs(distance) * Math.min(0.5, 0.5 * amount);
								v[0] -= n[0] * kFactor;
								v[1] -= n[1] * kFactor;
								v[2] -= n[2] * kFactor;
							}
						}
					}
				}
				if (!affectedCount) {
					if (push) past.pop();
					return state;
				}
				mesh.radius = computeRadius(verts);
				mesh.normals = computeVertexNormals(mesh);
				object.geometryVersion++;
				return state;
			}),

		clearMask: (id?: string) =>
			update((state) => {
				const targetId = id ?? state.selectedId;
				const object = state.objects.find((o) => o.id === targetId);
				if (!object || !object.geometry) return state;
				pushHistory(state);
				if (object.geometry.mask) object.geometry.mask.fill(0);
				object.colorVersion++;
				return state;
			}),

		invertMask: (id?: string) =>
			update((state) => {
				const targetId = id ?? state.selectedId;
				const object = state.objects.find((o) => o.id === targetId);
				if (!object || !object.geometry) return state;
				pushHistory(state);
				const vLen = object.geometry.vertices.length;
				if (object.geometry.mask && object.geometry.mask.length === vLen) {
					for (let i = 0; i < vLen; i++) {
						object.geometry.mask[i] = Math.max(0, Math.min(1, 1 - (object.geometry.mask[i] ?? 0)));
					}
				} else {
					object.geometry.mask = new Array(vLen).fill(1);
				}
				object.colorVersion++;
				return state;
			}),

		blurMask: (id?: string) =>
			update((state) => {
				const targetId = id ?? state.selectedId;
				const object = state.objects.find((o) => o.id === targetId);
				if (!object || !object.geometry) return state;
				const mesh = object.geometry;
				const vLen = mesh.vertices.length;
				if (!mesh.mask || mesh.mask.length !== vLen) return state;
				pushHistory(state);
				const adj = meshAdjacency(mesh);
				const next = new Array(vLen).fill(0);
				for (let i = 0; i < vLen; i++) {
					const nbs = adj.get(i);
					if (!nbs || !nbs.length) {
						next[i] = mesh.mask[i];
						continue;
					}
					let sum = 2 * mesh.mask[i];
					for (const nb of nbs) sum += mesh.mask[nb] ?? 0;
					next[i] = sum / (nbs.length + 2);
				}
				mesh.mask = next;
				object.colorVersion++;
				return state;
			}),

		bindArmature: (id?: string) =>
			update((state) => {
				const targetId = id ?? state.selectedId;
				const object = state.objects.find((o) => o.id === targetId);
				if (!object) return state;
				const rootBone = state.objects.find((o) => o.type === 'bone' && !o.parent) ?? state.objects.find((o) => o.type === 'bone');
				if (rootBone && rootBone.id !== object.id) {
					pushHistory(state);
					object.parent = rootBone.id;
					if (!rootBone.children.includes(object.id)) rootBone.children.push(object.id);
				}
				return state;
			}),
		paintVertices: (
			localPoint: Vec3,
			radius: number,
			color: [number, number, number],
			strength = 1,
			push = true,
		) =>
			update((state) => {
				const object = state.objects.find((o) => o.id === state.selectedId);
				if (!object || object.type === 'light' || object.type === 'camera') return state;
				if (push) pushHistory(state);
				const mesh = materializeGeometry(object);
				if (!mesh.colors || mesh.colors.length !== mesh.vertices.length * 3) mesh.colors = new Array(mesh.vertices.length * 3).fill(1);
				let touched = false;
				const r2 = radius * radius;
				const invRadius = 1 / Math.max(1e-6, radius);
				const lx = localPoint[0], ly = localPoint[1], lz = localPoint[2];
				for (let i = 0; i < mesh.vertices.length; i++) {
					const v = mesh.vertices[i];
					const dx = v[0] - lx, dy = v[1] - ly, dz = v[2] - lz;
					const d2 = dx * dx + dy * dy + dz * dz;
					if (d2 > r2) continue;
					const t = 1 - Math.sqrt(d2) * invRadius;
					const falloff = t * t * strength;
					const i3 = i * 3;
					mesh.colors[i3] += (color[0] - mesh.colors[i3]) * falloff;
					mesh.colors[i3 + 1] += (color[1] - mesh.colors[i3 + 1]) * falloff;
					mesh.colors[i3 + 2] += (color[2] - mesh.colors[i3 + 2]) * falloff;
					touched = true;
				}
				if (touched) object.colorVersion++;
				else if (push) past.pop();
				return state;
			}),
		fillVertexColor: (hex: string) =>
			update((state) => {
				const object = state.objects.find((o) => o.id === state.selectedId);
				if (!object || object.type === 'light' || object.type === 'camera') return state;
				pushHistory(state);
				const mesh = materializeGeometry(object);
				const r = parseInt(hex.slice(1, 3), 16) / 255;
				const g = parseInt(hex.slice(3, 5), 16) / 255;
				const b = parseInt(hex.slice(5, 7), 16) / 255;
				mesh.colors = new Array(mesh.vertices.length * 3);
				for (let i = 0; i < mesh.vertices.length; i++) {
					mesh.colors[i * 3] = r;
					mesh.colors[i * 3 + 1] = g;
					mesh.colors[i * 3 + 2] = b;
				}
				object.colorVersion++;
				return state;
			}),

		// ---- Marked portions and material slots ----

		markPortion: (objectId: string, faces: number[]) =>
			update((state) => {
				state.markedObjectId = objectId;
				state.markedFaces = [...new Set(faces)].sort((a, b) => a - b);
				state.portionVersion++;
				return state;
			}),

		clearPortion: () =>
			update((state) => {
				state.markedFaces = [];
				state.markedObjectId = null;
				state.portionVersion++;
				return state;
			}),

		applyMaterialPreset: (objectId: string, presetId: string) =>
			update((state) => {
				const object = state.objects.find((o) => o.id === objectId);
				if (!object) return state;
				const preset = presetById(presetId);
				if (!preset) return state;
				pushHistory(state);
				const slot = presetToSlot(preset);
				const mesh = materializeGeometry(object);
				const marked = state.markedObjectId === objectId && state.markedFaces.length ? state.markedFaces : null;
				if (marked) {
					const slotIndex = mesh.slots.length;
					const next = assignFacesToSlot(mesh, marked, slotIndex);
					next.slots = [...mesh.slots];
					next.slots[slotIndex] = slot;
					object.geometry = next;
				} else {
					const next = assignFacesToSlot(mesh, mesh.faces.map((_, index) => index), 0);
					next.slots = [...mesh.slots];
					next.slots[0] = slot;
					object.geometry = next;
					object.color = preset.color;
					object.material = {
						emissive: preset.emissive,
						opacity: preset.opacity,
						metalness: preset.metalness,
						roughness: preset.roughness,
					};
				}
				object.geometryVersion++;
				object.colorVersion++;
				object.selectionVersion++;
				return state;
			}),

		applyMaterialImage: (objectId: string, dataUrl: string, name: string) =>
			update((state) => {
				const object = state.objects.find((o) => o.id === objectId);
				if (!object) return state;
				pushHistory(state);
				const mesh = materializeGeometry(object);
				const next = slotFromImage(name, dataUrl);
				const marked = state.markedObjectId === objectId && state.markedFaces.length ? state.markedFaces : null;
				if (marked) {
					const slotIndex = mesh.slots.length;
					const updated = assignFacesToSlot(mesh, marked, slotIndex);
					updated.slots = [...mesh.slots, next];
					object.geometry = updated;
				} else {
					const updated = assignFacesToSlot(mesh, mesh.faces.map((_, index) => index), 0);
					updated.slots = [...mesh.slots];
					updated.slots[0] = next;
					object.geometry = updated;
					object.color = next.color;
				}
				object.geometryVersion++;
				object.colorVersion++;
				return state;
			}),

		updateMaterialSlot: (objectId: string, slotIndex: number, patch: Partial<MaterialSlot>) =>
			update((state) => {
				const object = state.objects.find((o) => o.id === objectId);
				if (!object) return state;
				pushHistory(state);
				const mesh = materializeGeometry(object);
				const slots = [...mesh.slots];
				while (slots.length <= slotIndex) slots.push({ ...slots[0] ?? slotFromObject(object), name: `Slot ${slots.length}` });
				slots[slotIndex] = { ...slots[slotIndex], ...patch };
				object.geometry = { ...mesh, slots };
				object.geometryVersion++;
				object.colorVersion++;
				return state;
			}),

		addMaterialSlot: (objectId: string, name = 'Slot') =>
			update((state) => {
				const object = state.objects.find((o) => o.id === objectId);
				if (!object) return state;
				pushHistory(state);
				const mesh = materializeGeometry(object);
				const slots = [...mesh.slots, { ...slotFromObject(object), name }];
				object.geometry = { ...mesh, slots };
				object.geometryVersion++;
				return state;
			}),

		cutObject: (objectId: string, plane: CutPlane, mode: 'split' | 'mark') =>
			update((state) => {
				const object = state.objects.find((o) => o.id === objectId);
				if (!object) return state;
				const mesh = materializeGeometry(object);
				pushHistory(state);
				if (mode === 'mark') {
					const { negative } = classifyFacesByPlane(mesh, plane);
					if (!negative.length) {
						past.pop();
						return state;
					}
					const slotIndex = mesh.slots.length;
					const next = assignFacesToSlot(mesh, negative, slotIndex);
					next.slots = [...mesh.slots];
					next.slots[slotIndex] = { ...slotFromObject(object), name: 'Cut Surface', color: '#ff7a6b' };
					object.geometry = next;
					object.geometryVersion++;
					object.colorVersion++;
					return state;
				}

				const result = bisectMesh(mesh, plane);
				if (!result.positive.faces.length || !result.negative.faces.length) {
					past.pop();
					return state;
				}
				const gap = 0.12;
				const negative = offsetMesh(result.negative, [
					plane.normal[0] * gap,
					plane.normal[1] * gap,
					plane.normal[2] * gap,
				]);
				const names = new Set(state.objects.map((item) => item.name));
				const pickName = (base: string) => {
					let candidate = base;
					let index = 1;
					while (names.has(candidate)) {
						candidate = `${base}.${String(index).padStart(3, '0')}`;
						index++;
					}
					names.add(candidate);
					return candidate;
				};
				const baseName = object.name;
				const nameA = pickName(`${baseName}_Part_A`);
				const nameB = pickName(`${baseName}_Part_B`);

				object.name = nameA;
				const positive = { ...result.positive, slots: mesh.slots.map((slot) => ({ ...slot })), faceSlot: [...(result.positive.faceSlot ?? [])] };
				positive.groups = buildGroups(positive);
				object.geometry = positive;

				const copy = cloneObject(object);
				copy.id = nextId();
				copy.name = nameB;
				const negativeMesh = { ...negative, slots: mesh.slots.map((slot) => ({ ...slot })), faceSlot: [...(negative.faceSlot ?? [])] };
				negativeMesh.groups = buildGroups(negativeMesh);
				copy.geometry = negativeMesh;
				copy.selected = false;
				state.objects.push(copy);

				object.geometryVersion++;
				object.colorVersion++;
				return state;
			}),

		extrudePortion: (objectId: string, faces: number[], distance: number) =>
			update((state) => {
				const object = state.objects.find((o) => o.id === objectId);
				if (!object) return state;
				const mesh = materializeGeometry(object);
				if (!faces.length) return state;
				pushHistory(state);
				object.geometry = extrudeRegion(mesh, faces, distance);
				object.geometryVersion++;
				object.colorVersion++;
				return state;
			}),

		serialize: () => {
			const state = get(sceneStore);
			return {
				objects: cloneObjects(state.objects),
				selectedId: state.selectedId,
				score: state.score,
			};
		},
		load: (objects: SceneObject[], selectedId: string | null = null) =>
			update((state) => {
				pushHistory(state);
				let maxId = 0;
				for (const object of objects) {
					const match = /^obj-(\d+)$/.exec(object.id);
					if (match) maxId = Math.max(maxId, Number(match[1]));
				}
				idCounter = Math.max(idCounter, maxId + 1);
				state.objects = cloneObjects(objects).map((obj) => ({
					...obj,
					restPose: obj.restPose ?? {
						position: [...obj.position] as [number, number, number],
						rotation: [...obj.rotation] as [number, number, number],
						scale: [...obj.scale] as [number, number, number],
					},
				}));
				state.selectedId = selectedId;
				state.editMode = false;
				state.selectedVertices = [];
				state.selectedEdges = [];
				state.selectedFaces = [];
				state.objects.forEach((object) => (object.selected = object.id === selectedId));
				for (const object of state.objects) {
					const url = object.geometry?.slots?.find((slot) => slot.imageUrl)?.imageUrl;
					if (url) primeLayerTexture(url, () => refreshObject(object.id));
				}
				return state;
			}),
		setCameraProps: (id: string, patch: Partial<CameraProps>) =>
			update((state) => {
				const object = state.objects.find((o) => o.id === id);
				if (!object || object.type !== 'camera') return state;
				object.cameraProps = {
					...object.cameraProps ?? {
						fov: 50,
						targetId: null,
						targetOffset: [0, 0.5, 0],
						trackingMode: 'look_at',
						followDistance: 4.5,
						followHeight: 1.8,
						damping: 0.1,
						active: true,
					},
					...patch,
				};
				if (patch.active) {
					for (const other of state.objects) {
						if (other.id !== id && other.cameraProps) other.cameraProps.active = false;
					}
				}
				return state;
			}),

		updateCameraTracking: (dt = 0.016, currentTime = 0) => {
			const snap = get(sceneStore);
			const hasTrackingCam = snap.objects.some((o) => (o.type === 'camera' || o.type.startsWith('camera_')) && o.cameraProps && o.cameraProps.trackingMode !== 'none' && Boolean(o.cameraProps.targetId));
			if (!hasTrackingCam) return;
			const index = objectIndex(snap.objects);
			let moves = false;
			for (const object of snap.objects) {
				if ((object.type !== 'camera' && !object.type.startsWith('camera_')) || !object.cameraProps || object.cameraProps.trackingMode === 'none') continue;
				const targetId = object.cameraProps.targetId;
				if (!targetId) continue;
				const target = index.get(targetId);
				if (!target) continue;
				const offset = object.cameraProps.targetOffset ?? [0, 0.5, 0];
				const targetCenter = [target.position[0]+offset[0], target.position[1]+offset[1], target.position[2]+offset[2]];
				const mode = object.cameraProps.trackingMode;
				if (mode === 'look_at') { if (vecChanged(object.rotation, lookAtEuler(object.position, targetCenter))) { moves = true; break; } }
				else if (mode === 'follow') {
					const dist = object.cameraProps.followDistance ?? 4.5;
					const h = object.cameraProps.followHeight ?? 1.8;
					const behind = rotateEuler([0, 0, dist], target.rotation);
					const damp = clamp(object.cameraProps.damping ?? 0.15, 0.01, 1);
					const next = [object.position[0] + (targetCenter[0]+behind[0]-object.position[0])*damp, object.position[1] + (targetCenter[1]+h-object.position[1])*damp, object.position[2] + (targetCenter[2]+behind[2]-object.position[2])*damp];
					if (vecChanged(object.position, next)) { moves = true; break; }
				} else if (mode === 'orbit') {
					const dist = object.cameraProps.followDistance ?? 4.5;
					const h = object.cameraProps.followHeight ?? 1.8;
					const theta = currentTime * 0.75;
					const next = [targetCenter[0]+Math.sin(theta)*dist, targetCenter[1]+h, targetCenter[2]+Math.cos(theta)*dist];
					if (vecChanged(object.position, next)) { moves = true; break; }
				}
			}
			if (!moves) return;
			update((state) => {
				const stateIndex = objectIndex(state.objects);
				for (const object of state.objects) {
					if ((object.type !== 'camera' && !object.type.startsWith('camera_')) || !object.cameraProps || object.cameraProps.trackingMode === 'none') continue;
					const targetId = object.cameraProps.targetId;
					if (!targetId) continue;
					const target = stateIndex.get(targetId);
					if (!target) continue;
					const offset = object.cameraProps.targetOffset ?? [0, 0.5, 0];
					const targetCenter = [target.position[0]+offset[0], target.position[1]+offset[1], target.position[2]+offset[2]];
					if (object.cameraProps.trackingMode === 'look_at') {
						assignEuler(object.rotation, lookAtEuler(object.position, targetCenter));
					} else if (object.cameraProps.trackingMode === 'follow') {
						const dist = object.cameraProps.followDistance ?? 4.5;
						const h = object.cameraProps.followHeight ?? 1.8;
						const behind = rotateEuler([0, 0, dist], target.rotation);
						const damp = clamp(object.cameraProps.damping ?? 0.15, 0.01, 1);
						assignVec3(object.position, [object.position[0]+(targetCenter[0]+behind[0]-object.position[0])*damp, object.position[1]+(targetCenter[1]+h-object.position[1])*damp, object.position[2]+(targetCenter[2]+behind[2]-object.position[2])*damp]);
						assignEuler(object.rotation, lookAtEuler(object.position, targetCenter));
					} else if (object.cameraProps.trackingMode === 'orbit') {
						const dist = object.cameraProps.followDistance ?? 4.5;
						const h = object.cameraProps.followHeight ?? 1.8;
						const theta = currentTime * 0.75;
						assignVec3(object.position, [targetCenter[0]+Math.sin(theta)*dist, targetCenter[1]+h, targetCenter[2]+Math.cos(theta)*dist]);
						assignEuler(object.rotation, lookAtEuler(object.position, targetCenter));
					}
				}
				return state;
			});
		},

		splitLayer: (id: string, time?: number): { partAId: string; partBId: string } | null => {
			let result: { partAId: string; partBId: string } | null = null;
			update((state) => {
				const orig = state.objects.find((o) => o.id === id);
				if (!orig) return state;
				const tl = get(timelineStore);
				const splitTime = time !== undefined ? time : tl.currentTime;
				const clip = tl.clips.get(id) ?? { start: 0, end: 15 };
				if (splitTime <= clip.start + 0.05 || splitTime >= clip.end - 0.05) return state;

				pushHistory(state);
				timelineStore.setClip(id, clip.start, splitTime);

				const newId = nextId();
				const copy = cloneObject(orig);
				copy.id = newId;
				copy.name = uniqueName(state.objects, orig.name + ' Part 2');
				copy.selected = true;
				orig.selected = false;
				state.objects.push(copy);
				state.selectedId = newId;

				timelineStore.setClip(newId, splitTime, clip.end);

				// Split keyframes
				const allKeys = tl.keyframes.get(id) ?? [];
				const keysA = allKeys.filter((k) => k.time <= splitTime);
				const keysB = allKeys.filter((k) => k.time >= splitTime);

				const evalMap = timelineStore.evaluate(splitTime, tl.easing);
				const cutTransform = evalMap.get(id);
				const cutPose = {
					time: splitTime,
					position: cutTransform?.position ? [...cutTransform.position] as [number, number, number] : [...orig.position],
					rotation: cutTransform?.rotation ? [...cutTransform.rotation] as [number, number, number] : [...orig.rotation],
					scale: cutTransform?.scale ? [...cutTransform.scale] as [number, number, number] : [...orig.scale],
				};
				if (!keysA.some((k) => Math.abs(k.time - splitTime) < 0.001)) keysA.push({ ...cutPose });
				if (!keysB.some((k) => Math.abs(k.time - splitTime) < 0.001)) keysB.unshift({ ...cutPose });

				timelineStore.loadKeyframes({
					...timelineStore.serializeKeyframes(),
					[id]: keysA,
					[newId]: keysB,
				});

				result = { partAId: id, partBId: newId };
				return state;
			});
			return result;
		},

		replaceObjectGeometry: (id: string, newType: string) =>
			update((state) => {
				const object = state.objects.find((o) => o.id === id);
				if (!object || object.locked) return state;
				pushHistory(state);
				object.type = newType;
				const newMesh = cloneMesh(meshFor(newType) ?? meshFor('cube')!);
				if (object.geometry?.slots?.length) {
					newMesh.slots = [...object.geometry.slots];
					newMesh.faceSlot = newMesh.faces.map(() => 0);
					newMesh.groups = buildGroups(newMesh);
				}
				object.geometry = newMesh;
				object.geometryVersion++;
				object.colorVersion++;
				object.selectionVersion++;
				return state;
			}),

		replaceObjectMedia: (id: string, dataUrl: string, width = 1280, height = 720) =>
			update((state) => {
				const object = state.objects.find((o) => o.id === id);
				if (!object || object.locked) return state;
				pushHistory(state);
				useTextureSlot(object, dataUrl, width, height);
				object.geometryVersion++;
				object.colorVersion++;
				return state;
			}),

		setObjectOpacity: (id: string, opacity: number) =>
			update((state) => {
				const object = state.objects.find((o) => o.id === id);
				if (!object || object.locked) return state;
				const val = clamp(opacity, 0, 1);
				object.material.opacity = val;
				if (object.geometry?.slots?.length) {
					for (const slot of object.geometry.slots) slot.opacity = val;
				}
				object.colorVersion++;
				const tl = get(timelineStore);
				if (tl.autoKey) {
					timelineStore.addChannelKeyframe(id, 'material.opacity', tl.currentTime, val);
				}
				return state;
			}),
		// ---- Edit Tab Selection Tools ----
		selectLinked: () =>
			update((state) => {
				const object = state.objects.find((o) => o.id === state.selectedId);
				if (!object || !object.geometry) return state;
				const mesh = object.geometry;
				const adj = new Map<number, number[]>();
				mesh.faces.forEach((f, fIdx) => {
					for (const vi of f) {
						if (!adj.has(vi)) adj.set(vi, []);
						adj.get(vi)!.push(fIdx);
					}
				});
				const visitedFaces = new Set<number>(state.selectedFaces);
				const visitedVerts = new Set<number>(state.selectedVertices);
				const queue: number[] = [...state.selectedVertices];
				for (const fIdx of state.selectedFaces) {
					for (const vi of mesh.faces[fIdx]) {
						if (!visitedVerts.has(vi)) {
							visitedVerts.add(vi);
							queue.push(vi);
						}
					}
				}
				if (!queue.length && mesh.vertices.length) {
					queue.push(0);
					visitedVerts.add(0);
				}
				while (queue.length > 0) {
					const vi = queue.pop()!;
					const faces = adj.get(vi) || [];
					for (const fIdx of faces) {
						if (!visitedFaces.has(fIdx)) {
							visitedFaces.add(fIdx);
							for (const otherVi of mesh.faces[fIdx]) {
								if (!visitedVerts.has(otherVi)) {
									visitedVerts.add(otherVi);
									queue.push(otherVi);
								}
							}
						}
					}
				}
				state.selectedVertices = [...visitedVerts];
				state.selectedFaces = [...visitedFaces];
				object.selectionVersion++;
				return state;
			}),

		selectLoop: () =>
			update((state) => {
				const object = state.objects.find((o) => o.id === state.selectedId);
				if (!object || !object.geometry) return state;
				const mesh = object.geometry;
				if (state.elementMode === 'edge') {
					const start = state.selectedEdges[0] ?? 0;
					if (!mesh.edges[start]) return state;
					const edgeIndexByKey = new Map<string, number>();
					mesh.edges.forEach(([a, b], idx) => {
						edgeIndexByKey.set(a < b ? `${a}:${b}` : `${b}:${a}`, idx);
					});
					const selected = new Set<number>(state.selectedEdges.length ? state.selectedEdges : [start]);
					const queue: number[] = [...selected];
					while (queue.length > 0) {
						const curIdx = queue.pop()!;
						const curEdge = mesh.edges[curIdx];
						if (!curEdge) continue;
						for (const f of mesh.faces) {
							if (f.length !== 4) continue;
							for (let i = 0; i < 4; i++) {
								const a = f[i], b = f[(i + 1) % 4];
								if ((a === curEdge[0] && b === curEdge[1]) || (a === curEdge[1] && b === curEdge[0])) {
									const oppA = f[(i + 2) % 4], oppB = f[(i + 3) % 4];
									const oppKey = oppA < oppB ? `${oppA}:${oppB}` : `${oppB}:${oppA}`;
									const oppEdgeIdx = edgeIndexByKey.get(oppKey);
									if (oppEdgeIdx !== undefined && !selected.has(oppEdgeIdx)) {
										selected.add(oppEdgeIdx);
										queue.push(oppEdgeIdx);
									}
								}
							}
						}
					}
					state.selectedEdges = [...selected];
				} else if (state.elementMode === 'face') {
					const start = state.selectedFaces[0] ?? 0;
					const selected = new Set<number>(state.selectedFaces);
					mesh.faces.forEach((f, idx) => {
						if (Math.abs(idx - start) <= 3) selected.add(idx);
					});
					state.selectedFaces = [...selected];
				}
				object.selectionVersion++;
				return state;
			}),

		selectRing: () =>
			update((state) => {
				const object = state.objects.find((o) => o.id === state.selectedId);
				if (!object || !object.geometry) return state;
				const mesh = object.geometry;
				if (state.elementMode === 'edge') {
					const start = state.selectedEdges[0] ?? 0;
					const edge = mesh.edges[start];
					if (!edge) return state;
					const edgeIndexByKey = new Map<string, number>();
					mesh.edges.forEach(([a, b], idx) => {
						edgeIndexByKey.set(a < b ? `${a}:${b}` : `${b}:${a}`, idx);
					});
					const selected = new Set<number>(state.selectedEdges.length ? state.selectedEdges : [start]);
					mesh.faces.forEach((f) => {
						if (f.length === 4) {
							for (let i = 0; i < 4; i++) {
								const a = f[i], b = f[(i + 1) % 4];
								if ((a === edge[0] && b === edge[1]) || (a === edge[1] && b === edge[0])) {
									const s1a = f[(i + 1) % 4], s1b = f[(i + 2) % 4];
									const s2a = f[(i + 3) % 4], s2b = f[i];
									const sideA = edgeIndexByKey.get(s1a < s1b ? `${s1a}:${s1b}` : `${s1b}:${s1a}`);
									const sideB = edgeIndexByKey.get(s2a < s2b ? `${s2a}:${s2b}` : `${s2b}:${s2a}`);
									if (sideA !== undefined) selected.add(sideA);
									if (sideB !== undefined) selected.add(sideB);
								}
							}
						}
					});
					state.selectedEdges = [...selected];
				}
				object.selectionVersion++;
				return state;
			}),

		invertSelection: () =>
			update((state) => {
				const object = state.objects.find((o) => o.id === state.selectedId);
				if (!object || !object.geometry) return state;
				const mesh = object.geometry;
				if (state.elementMode === 'vertex') {
					const current = new Set(state.selectedVertices);
					state.selectedVertices = mesh.vertices.map((_, i) => i).filter((i) => !current.has(i));
				} else if (state.elementMode === 'edge') {
					const current = new Set(state.selectedEdges);
					state.selectedEdges = mesh.edges.map((_, i) => i).filter((i) => !current.has(i));
				} else if (state.elementMode === 'face') {
					const current = new Set(state.selectedFaces);
					state.selectedFaces = mesh.faces.map((_, i) => i).filter((i) => !current.has(i));
				}
				object.selectionVersion++;
				return state;
			}),

		selectSimilar: (_criteria: 'valence' | 'length' | 'area' | 'normal' = 'normal') =>
			update((state) => {
				const object = state.objects.find((o) => o.id === state.selectedId);
				if (!object || !object.geometry) return state;
				const mesh = object.geometry;
				if (state.elementMode === 'vertex') {
					const vIdx = state.selectedVertices[0] ?? 0;
					const degrees = new Int32Array(mesh.vertices.length);
					for (const [a, b] of mesh.edges) {
						if (a >= 0 && a < degrees.length) degrees[a]++;
						if (b >= 0 && b < degrees.length) degrees[b]++;
					}
					const valence = degrees[vIdx] ?? 0;
					const matched: number[] = [];
					for (let i = 0; i < degrees.length; i++) {
						if (degrees[i] === valence) matched.push(i);
					}
					state.selectedVertices = matched;
				} else if (state.elementMode === 'edge') {
					const eIdx = state.selectedEdges[0] ?? 0;
					const edge = mesh.edges[eIdx];
					if (edge) {
						const v0 = mesh.vertices[edge[0]], v1 = mesh.vertices[edge[1]];
						const targetLen = Math.hypot(v0[0] - v1[0], v0[1] - v1[1], v0[2] - v1[2]);
						const matched: number[] = [];
						mesh.edges.forEach((e, idx) => {
							const ev0 = mesh.vertices[e[0]], ev1 = mesh.vertices[e[1]];
							const len = Math.hypot(ev0[0] - ev1[0], ev0[1] - ev1[1], ev0[2] - ev1[2]);
							if (Math.abs(len - targetLen) < 0.05 * targetLen + 1e-4) matched.push(idx);
						});
						state.selectedEdges = matched;
					}
				} else if (state.elementMode === 'face') {
					const fIdx = state.selectedFaces[0] ?? 0;
					const face = mesh.faces[fIdx];
					if (face) {
						const n0 = faceNormal(mesh, face);
						const matched: number[] = [];
						mesh.faces.forEach((f, idx) => {
							const n = faceNormal(mesh, f);
							const dotProd = n0[0] * n[0] + n0[1] * n[1] + n0[2] * n[2];
							if (dotProd > 0.85) matched.push(idx);
						});
						state.selectedFaces = matched;
					}
				}
				object.selectionVersion++;
				return state;
			}),

		boxSelect: (rect: { minX: number; minY: number; maxX: number; maxY: number }, projectFn: (v: Vec3) => { x: number; y: number } | null) =>
			update((state) => {
				const object = state.objects.find((o) => o.id === state.selectedId);
				if (!object || !object.geometry) return state;
				const mesh = object.geometry;
				if (state.elementMode === 'vertex') {
					const sel: number[] = [];
					mesh.vertices.forEach((v, idx) => {
						const pt = projectFn(v);
						if (pt && pt.x >= rect.minX && pt.x <= rect.maxX && pt.y >= rect.minY && pt.y <= rect.maxY) {
							sel.push(idx);
						}
					});
					state.selectedVertices = sel;
				} else if (state.elementMode === 'face') {
					const sel: number[] = [];
					mesh.faces.forEach((f, idx) => {
						const c = faceCenter(mesh, f);
						const pt = projectFn(c);
						if (pt && pt.x >= rect.minX && pt.x <= rect.maxX && pt.y >= rect.minY && pt.y <= rect.maxY) {
							sel.push(idx);
						}
					});
					state.selectedFaces = sel;
				} else if (state.elementMode === 'edge') {
					const sel: number[] = [];
					mesh.edges.forEach((e, idx) => {
						const v0 = mesh.vertices[e[0]], v1 = mesh.vertices[e[1]];
						const mid: Vec3 = [(v0[0] + v1[0]) / 2, (v0[1] + v1[1]) / 2, (v0[2] + v1[2]) / 2];
						const pt = projectFn(mid);
						if (pt && pt.x >= rect.minX && pt.x <= rect.maxX && pt.y >= rect.minY && pt.y <= rect.maxY) {
							sel.push(idx);
						}
					});
					state.selectedEdges = sel;
				}
				object.selectionVersion++;
				return state;
			}),

		// ---- Edit Tab Object Level Tools ----
		setOrigin: (mode: 'geometry' | 'cursor' | 'center', cursorPosition: Vec3 = [0, 0, 0]) =>
			update((state) => {
				const object = state.objects.find((o) => o.id === state.selectedId);
				if (!object) return state;
				const mesh = materializeGeometry(object);
				pushHistory(state);
				if (mode === 'geometry') {
					let minX = Infinity, minY = Infinity, minZ = Infinity;
					let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
					for (const v of mesh.vertices) {
						if (v[0] < minX) minX = v[0]; if (v[0] > maxX) maxX = v[0];
						if (v[1] < minY) minY = v[1]; if (v[1] > maxY) maxY = v[1];
						if (v[2] < minZ) minZ = v[2]; if (v[2] > maxZ) maxZ = v[2];
					}
					const cx = (minX + maxX) / 2;
					const cy = (minY + maxY) / 2;
					const cz = (minZ + maxZ) / 2;
					mesh.vertices.forEach((v) => {
						v[0] -= cx; v[1] -= cy; v[2] -= cz;
					});
					const rot = rotateEuler([cx * object.scale[0], cy * object.scale[1], cz * object.scale[2]], object.rotation);
					object.position = [object.position[0] + rot[0], object.position[1] + rot[1], object.position[2] + rot[2]];
				} else if (mode === 'cursor') {
					const dx = cursorPosition[0] - object.position[0];
					const dy = cursorPosition[1] - object.position[1];
					const dz = cursorPosition[2] - object.position[2];
					mesh.vertices.forEach((v) => {
						v[0] -= dx / object.scale[0];
						v[1] -= dy / object.scale[1];
						v[2] -= dz / object.scale[2];
					});
					object.position = [...cursorPosition] as [number, number, number];
				} else {
					mesh.vertices.forEach((v) => {
						v[0] += object.position[0] / object.scale[0];
						v[1] += object.position[1] / object.scale[1];
						v[2] += object.position[2] / object.scale[2];
					});
					object.position = [0, 0, 0];
				}
				mesh.radius = computeRadius(mesh.vertices);
				object.geometryVersion++;
				return state;
			}),

		applyTransformation: (type: 'location' | 'rotation' | 'scale' | 'all') =>
			update((state) => {
				const object = state.objects.find((o) => o.id === state.selectedId);
				if (!object) return state;
				const mesh = materializeGeometry(object);
				pushHistory(state);
				if (type === 'scale' || type === 'all') {
					mesh.vertices.forEach((v) => {
						v[0] *= object.scale[0];
						v[1] *= object.scale[1];
						v[2] *= object.scale[2];
					});
					object.scale = [1, 1, 1];
				}
				if (type === 'rotation' || type === 'all') {
					mesh.vertices = mesh.vertices.map((v) => rotateEuler(v, object.rotation));
					object.rotation = [0, 0, 0];
				}
				if (type === 'location' || type === 'all') {
					mesh.vertices.forEach((v) => {
						v[0] += object.position[0];
						v[1] += object.position[1];
						v[2] += object.position[2];
					});
					object.position = [0, 0, 0];
				}
				mesh.radius = computeRadius(mesh.vertices);
				if (mesh.smooth || mesh.normals) mesh.normals = computeVertexNormals(mesh);
				object.geometryVersion++;
				return state;
			}),

		clearTransformation: (type: 'location' | 'rotation' | 'scale' | 'all') =>
			update((state) => {
				const object = state.objects.find((o) => o.id === state.selectedId);
				if (!object) return state;
				pushHistory(state);
				if (type === 'location' || type === 'all') object.position = [0, 0, 0];
				if (type === 'rotation' || type === 'all') object.rotation = [0, 0, 0];
				if (type === 'scale' || type === 'all') object.scale = [1, 1, 1];
				return state;
			}),

		setParent: (childId: string, parentId: string) =>
			update((state) => {
				const child = state.objects.find((o) => o.id === childId);
				const parent = state.objects.find((o) => o.id === parentId);
				if (!child || !parent || child.id === parent.id) return state;
				// Guard against circular hierarchy cycles
				let cursor: SceneObject | undefined = parent;
				const visited = new Set<string>();
				while (cursor?.parent) {
					if (cursor.parent === childId || visited.has(cursor.id)) return state;
					visited.add(cursor.id);
					cursor = state.objects.find((o) => o.id === cursor!.parent);
				}
				pushHistory(state);
				if (child.parent && child.parent !== parentId) {
					const oldParent = state.objects.find((o) => o.id === child.parent);
					if (oldParent) oldParent.children = oldParent.children.filter((id) => id !== childId);
				}
				child.parent = parentId;
				if (!parent.children.includes(childId)) parent.children.push(childId);
				return state;
			}),

		clearParent: (childId: string) =>
			update((state) => {
				const child = state.objects.find((o) => o.id === childId);
				if (!child || !child.parent) return state;
				pushHistory(state);
				const parent = state.objects.find((o) => o.id === child.parent);
				if (parent) {
					parent.children = parent.children.filter((id) => id !== childId);
				}
				delete child.parent;
				return state;
			}),

		joinSelected: () =>
			update((state) => {
				const active = state.objects.find((o) => o.id === state.selectedId);
				if (!active || !active.geometry) return state;
				const otherSelected = state.objects.filter((o) => o.selected && o.id !== active.id && o.geometry);
				if (!otherSelected.length) return state;
				pushHistory(state);
				const meshesToJoin = [
					{ mesh: active.geometry, position: [0, 0, 0] as Vec3, scale: [1, 1, 1] as Vec3 },
					...otherSelected.map((o) => ({
						mesh: o.geometry!,
						position: [
							(o.position[0] - active.position[0]) / active.scale[0],
							(o.position[1] - active.position[1]) / active.scale[1],
							(o.position[2] - active.position[2]) / active.scale[2],
						] as Vec3,
						scale: [
							o.scale[0] / active.scale[0],
							o.scale[1] / active.scale[1],
							o.scale[2] / active.scale[2],
						] as Vec3,
					})),
				];
				active.geometry = joinMeshes(meshesToJoin);
				active.geometryVersion++;
				const otherIds = new Set(otherSelected.map((o) => o.id));
				state.objects = state.objects.filter((o) => !otherIds.has(o.id));
				return state;
			}),

		clear: () =>
			update((state) => {
				pushHistory(state);
				state.objects = [];
				state.selectedId = null;
				state.score = 0;
				state.editMode = false;
				state.selectedVertices = [];
				state.selectedEdges = [];
				state.selectedFaces = [];
				return state;
			}),
	};
}

export const sceneStore = createSceneStore();

export const selectedObject = derived(sceneStore, ($scene) => $scene.objects.find((o) => o.id === $scene.selectedId) || null);
