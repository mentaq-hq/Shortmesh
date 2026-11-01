import { get } from 'svelte/store';
import type { Material, PhysicsBody, SceneObject } from '../stores/scene';
import { sceneStore } from '../stores/scene';
import { buildGroups, type GeometryGroup, type MaterialSlot, type Mesh } from './mesh';
import type { BezTriple } from '../lib/fcurve';
import type { KeyframeData, LayerClip, NlaStrip, TrackMeta } from '../stores/timeline';
import { MAX_TIMELINE_SECONDS } from '../lib/fcurve';
import { timelineStore } from '../stores/timeline';

export const PROJECT_FORMAT = 'toon-studio';
export const PROJECT_VERSION = 2;
const STORAGE_KEY = 'toon-studio.projects';
const AUTOSAVE_KEY = 'toon-studio.autosave';

export interface ProjectFile {
	format: typeof PROJECT_FORMAT;
	version: number;
	name: string;
	savedAt: string;
	scene: {
		objects: SceneObject[];
		selectedId: string | null;
		score: number;
	};
	timeline: {
		duration: number;
		startFrame?: number;
		endFrame?: number;
		snapToFrames?: boolean;
		loop: boolean;
		easing: boolean;
		frameRate: number;
		keyframes: Record<string, KeyframeData[]>;
		curves: Record<string, Record<string, BezTriple[]>>;
		tracks?: Record<string, TrackMeta>;
		strips: NlaStrip[];
		clips: Record<string, LayerClip>;
	};
}

export interface StoredProject {
	name: string;
	savedAt: string;
	project: ProjectFile;
}

function numberTuple(value: unknown, fallback: [number, number, number]): [number, number, number] {
	if (!Array.isArray(value) || value.length !== 3) return fallback;
	const tuple = value.map((item) => (typeof item === 'number' && Number.isFinite(item) ? item : 0));
	return [tuple[0], tuple[1], tuple[2]];
}

function hexColor(value: unknown, fallback: string): string {
	return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function sanitizeMaterial(value: unknown): Material {
	const raw = (value || {}) as Partial<Material>;
	return {
		emissive: hexColor(raw.emissive, '#000000'),
		opacity: typeof raw.opacity === 'number' ? Math.min(1, Math.max(0, raw.opacity)) : 1,
		metalness: typeof raw.metalness === 'number' ? Math.min(1, Math.max(0, raw.metalness)) : 0.05,
		roughness: typeof raw.roughness === 'number' ? Math.min(1, Math.max(0, raw.roughness)) : 0.55,
	};
}

function sanitizePhysics(value: unknown): PhysicsBody {
	const raw = (value || {}) as Partial<PhysicsBody>;
	return {
		dynamic: raw.dynamic === true,
		velocity: numberTuple(raw.velocity, [0, 0, 0]),
		restitution: typeof raw.restitution === 'number' ? Math.min(1, Math.max(0, raw.restitution)) : 0.45,
		home: Array.isArray(raw.home) ? numberTuple(raw.home, [0, 0, 0]) : undefined,
	};
}

function sanitizeSlots(value: unknown): MaterialSlot[] {
	if (!Array.isArray(value)) return [];
	return value.map((raw, index) => {
		const slot = (raw || {}) as Partial<MaterialSlot> & Record<string, any>;
		return {
			name: typeof slot.name === 'string' && slot.name ? slot.name : `Slot ${index}`,
			color: hexColor(slot.color, '#9aa3b8'),
			emissive: hexColor(slot.emissive, '#000000'),
			emissiveStrength: typeof slot.emissiveStrength === 'number' ? Math.min(5, Math.max(0, slot.emissiveStrength)) : 1,
			metalness: typeof slot.metalness === 'number' ? Math.min(1, Math.max(0, slot.metalness)) : 0.05,
			roughness: typeof slot.roughness === 'number' ? Math.min(1, Math.max(0, slot.roughness)) : 0.55,
			opacity: typeof slot.opacity === 'number' ? Math.min(1, Math.max(0, slot.opacity)) : 1,
			uvRepeat: typeof slot.uvRepeat === 'number' ? Math.min(20, Math.max(0.1, slot.uvRepeat)) : 1,
			...(typeof slot.specular === 'number' ? { specular: Math.min(1, Math.max(0, slot.specular)) } : {}),
			...(typeof slot.normalStrength === 'number' ? { normalStrength: Math.min(3, Math.max(0, slot.normalStrength)) } : {}),
			...(typeof slot.blendMode === 'string' ? { blendMode: slot.blendMode } : {}),
			...(typeof slot.uvScaleY === 'number' ? { uvScaleY: slot.uvScaleY } : {}),
			...(typeof slot.uvOffsetX === 'number' ? { uvOffsetX: slot.uvOffsetX } : {}),
			...(typeof slot.uvOffsetY === 'number' ? { uvOffsetY: slot.uvOffsetY } : {}),
			...(typeof slot.uvRotation === 'number' ? { uvRotation: slot.uvRotation } : {}),
			...(typeof slot.texMapping === 'number' ? { texMapping: slot.texMapping } : {}),
			...(typeof slot.texStrength === 'number' ? { texStrength: slot.texStrength } : {}),
			presetId: typeof slot.presetId === 'string' ? slot.presetId : undefined,
			imageUrl: typeof slot.imageUrl === 'string' ? slot.imageUrl : undefined,
			...(typeof slot.roughnessUrl === 'string' ? { roughnessUrl: slot.roughnessUrl } : {}),
			...(typeof slot.normalUrl === 'string' ? { normalUrl: slot.normalUrl } : {}),
		};
	});
}

function sanitizeGroups(value: unknown): GeometryGroup[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((raw): raw is GeometryGroup => Boolean(raw) && typeof (raw as GeometryGroup).start === 'number')
		.map((raw) => ({
			start: Math.max(0, Math.round(raw.start)),
			count: Math.max(0, Math.round(raw.count)),
			materialIndex: Math.max(0, Math.round(raw.materialIndex)),
		}));
}

function sanitizeMesh(value: unknown): Mesh | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const raw = value as Partial<Mesh>;
	if (!Array.isArray(raw.vertices) || !Array.isArray(raw.faces)) return undefined;
	const vertices = raw.vertices
		.filter((vertex): vertex is [number, number, number] => Array.isArray(vertex) && vertex.length === 3 && vertex.every((item) => typeof item === 'number' && Number.isFinite(item)))
		.map((vertex) => [vertex[0], vertex[1], vertex[2]] as [number, number, number]);
	if (vertices.length < 3) return undefined;
	const faces = raw.faces
		.filter((face): face is number[] => Array.isArray(face) && face.length >= 3 && face.every((index) => Number.isInteger(index) && index >= 0 && index < vertices.length))
		.map((face) => face.map(Number));
	if (!faces.length) return undefined;
	const edges: [number, number][] = [];
	const seen = new Set<string>();
	for (const face of faces) {
		for (let i = 0; i < face.length; i++) {
			const a = face[i];
			const b = face[(i + 1) % face.length];
			const key = a < b ? `${a}:${b}` : `${b}:${a}`;
			if (seen.has(key)) continue;
			seen.add(key);
			edges.push([a, b]);
		}
	}
	let radius = 0.25;
	for (const vertex of vertices) radius = Math.max(radius, Math.hypot(vertex[0], vertex[1], vertex[2]));
	const colors = Array.isArray(raw.colors) && raw.colors.length >= vertices.length * 3
		? raw.colors.slice(0, vertices.length * 3).map((item) => (typeof item === 'number' && Number.isFinite(item) ? Math.min(1, Math.max(0, item)) : 1))
		: undefined;
	const uvs =
		Array.isArray(raw.uvs) && raw.uvs.length >= vertices.length
			? raw.uvs.slice(0, vertices.length).map((uv): [number, number] => {
					if (!Array.isArray(uv) || uv.length !== 2) return [0, 0];
					const u = typeof uv[0] === 'number' && Number.isFinite(uv[0]) ? uv[0] : 0;
					const v = typeof uv[1] === 'number' && Number.isFinite(uv[1]) ? uv[1] : 0;
					return [u, v];
				})
			: undefined;
	const slots = sanitizeSlots(raw.slots);
	const faceSlot = Array.isArray(raw.faceSlot)
		? raw.faceSlot.map((index) => (Number.isInteger(index) && index >= 0 ? index : 0))
		: faces.map(() => 0);
	while (faceSlot.length < faces.length) faceSlot.push(0);
	faceSlot.length = faces.length;
	const mesh: Mesh = { vertices, faces, edges, radius, colors, uvs, smooth: raw.smooth === true, slots, faceSlot, groups: [] };
	const parsedGroups = sanitizeGroups(raw.groups);
	mesh.groups = parsedGroups.length && parsedGroups.some((g) => g.count > 0) ? parsedGroups : buildGroups(mesh);
	return mesh;
}

export function createProject(name = 'Untitled'): ProjectFile {
	const scene = sceneStore.serialize();
	const timeline = get(timelineStore);
	return {
		format: PROJECT_FORMAT,
		version: PROJECT_VERSION,
		name,
		savedAt: new Date().toISOString(),
		scene,
		timeline: {
			duration: timeline.duration,
			startFrame: timeline.startFrame,
			endFrame: timeline.endFrame,
			snapToFrames: timeline.snapToFrames,
			loop: timeline.loop,
			easing: timeline.easing,
			frameRate: timeline.frameRate,
			keyframes: timelineStore.serializeKeyframes(),
			curves: timelineStore.serializeCurves(),
			tracks: timelineStore.serializeTracks(),
			strips: timelineStore.serializeStrips(),
			clips: timelineStore.serializeClips(),
		},
	};
}

export function validateProject(input: unknown): ProjectFile {
	if (!input || typeof input !== 'object') throw new Error('Project file is empty or invalid.');
	const data = input as Partial<ProjectFile>;
	if (data.format !== PROJECT_FORMAT) throw new Error('Not a Toon Studio project file.');
	if (typeof data.version !== 'number' || data.version > PROJECT_VERSION) {
		throw new Error('This project was created by a newer version of Toon Studio.');
	}
	const scene = data.scene;
	if (!scene || !Array.isArray(scene.objects)) throw new Error('Project is missing its scene data.');
	const objects: SceneObject[] = scene.objects.map((raw, index) => {
		const object = raw as Partial<SceneObject> & Record<string, any>;
		if (!object || typeof object !== 'object') throw new Error(`Invalid object at index ${index}.`);
		const type = typeof object.type === 'string' ? object.type : 'cube';
		const pos = numberTuple(object.position, [0, 0.5, 0]);
		const rot = numberTuple(object.rotation, [0, 0, 0]);
		const scl = numberTuple(object.scale, [1, 1, 1]);
		return {
			id: typeof object.id === 'string' ? object.id : `obj-${index + 1}`,
			name: typeof object.name === 'string' ? object.name : `${type} ${index + 1}`,
			type,
			position: pos,
			rotation: rot,
			scale: scl,
			restPose:
				object.restPose && typeof object.restPose === 'object'
					? {
							position: numberTuple(object.restPose.position, pos),
							rotation: numberTuple(object.restPose.rotation, rot),
							scale: numberTuple(object.restPose.scale, scl),
						}
					: undefined,
			color: hexColor(object.color, '#ebeff5'),
			material: sanitizeMaterial(object.material),
			physics: sanitizePhysics(object.physics),
			geometry: sanitizeMesh(object.geometry),
			geometryVersion: typeof object.geometryVersion === 'number' ? object.geometryVersion : 1,
			colorVersion: typeof object.colorVersion === 'number' ? object.colorVersion : 1,
			selectionVersion: typeof object.selectionVersion === 'number' ? object.selectionVersion : 1,
			visible: object.visible !== false,
			locked: object.locked === true,
			selected: object.selected === true,
			text: typeof object.text === 'string' ? object.text.slice(0, 2000) : undefined,
			depth: typeof object.depth === 'number' ? object.depth : 0,
			parent: typeof object.parent === 'string' ? object.parent : undefined,
			children: Array.isArray(object.children) ? object.children.filter((child): child is string => typeof child === 'string') : [],
			...(object.creationParams && typeof object.creationParams === 'object' ? { creationParams: { ...object.creationParams } } : {}),
			...(object.lightProps && typeof object.lightProps === 'object' ? { lightProps: { ...object.lightProps } } : {}),
			cameraProps: object.cameraProps && typeof object.cameraProps === 'object' ? {
				fov: typeof object.cameraProps.fov === 'number' ? object.cameraProps.fov : 50,
				near: typeof (object.cameraProps as any).near === 'number' ? (object.cameraProps as any).near : 0.1,
				far: typeof (object.cameraProps as any).far === 'number' ? (object.cameraProps as any).far : 100,
				ortho: Boolean((object.cameraProps as any).ortho),
				orthoScale: typeof (object.cameraProps as any).orthoScale === 'number' ? (object.cameraProps as any).orthoScale : 4,
				targetId: typeof object.cameraProps.targetId === 'string' ? object.cameraProps.targetId : null,
				targetOffset: numberTuple(object.cameraProps.targetOffset, [0, 0.5, 0]),
				trackingMode: (['none', 'look_at', 'follow', 'orbit'].includes((object.cameraProps as any).trackingMode)
					? (object.cameraProps as any).trackingMode
					: 'look_at'),
				followDistance: typeof object.cameraProps.followDistance === 'number' ? object.cameraProps.followDistance : 4.5,
				followHeight: typeof object.cameraProps.followHeight === 'number' ? object.cameraProps.followHeight : 1.8,
				damping: typeof object.cameraProps.damping === 'number' ? object.cameraProps.damping : 0.1,
				active: object.cameraProps.active !== false,
			} : undefined,
		};
	});
	const timeline = (data.timeline || {}) as Partial<ProjectFile['timeline']>;
	const keyframes: Record<string, KeyframeData[]> = {};
	if (timeline.keyframes && typeof timeline.keyframes === 'object') {
		for (const [objectId, keys] of Object.entries(timeline.keyframes)) {
			if (!Array.isArray(keys)) continue;
			keyframes[objectId] = keys
				.filter((key): key is KeyframeData => Boolean(key) && typeof key.time === 'number')
				.map((key) => ({
					time: Number.isFinite(key.time) ? key.time : 0,
					position: numberTuple(key.position, [0, 0, 0]),
					rotation: numberTuple(key.rotation, [0, 0, 0]),
					scale: numberTuple(key.scale, [1, 1, 1]),
					...(typeof key.visible === 'boolean' ? { visible: key.visible } : {}),
					...(key.interpolation === 'constant' || key.interpolation === 'linear' || key.interpolation === 'bezier'
						? { interpolation: key.interpolation }
						: {}),
				}))
				.sort((a, b) => a.time - b.time);
		}
	}
	const curves: Record<string, Record<string, BezTriple[]>> = {};
	if (timeline.curves && typeof timeline.curves === 'object') {
		for (const [objectId, channels] of Object.entries(timeline.curves)) {
			const sanitized: Record<string, BezTriple[]> = {};
			for (const [path, keys] of Object.entries(channels || {})) {
				if (!Array.isArray(keys)) continue;
				sanitized[path] = keys
					.filter((key): key is BezTriple => Boolean(key) && typeof key.time === 'number' && Number.isFinite(key.time))
					.map((key): BezTriple => ({
						time: Math.min(MAX_TIMELINE_SECONDS, Math.max(0, key.time)),
						value: typeof key.value === 'number' && Number.isFinite(key.value) ? key.value : 0,
						interpolation: key.interpolation === 'constant' || key.interpolation === 'linear' ? key.interpolation : 'bezier',
						handleLeft: Array.isArray(key.handleLeft) ? [Number(key.handleLeft[0]) || 0, Number(key.handleLeft[1]) || 0] : [-1 / 3, 0],
						handleRight: Array.isArray(key.handleRight) ? [Number(key.handleRight[0]) || 0, Number(key.handleRight[1]) || 0] : [1 / 3, 0],
						autoLeft: key.autoLeft !== false,
						autoRight: key.autoRight !== false,
					}))
					.sort((a, b) => a.time - b.time);
			}
			if (Object.keys(sanitized).length) curves[objectId] = sanitized;
		}
	}
	const tracks: Record<string, TrackMeta> = {};
	if (timeline.tracks && typeof timeline.tracks === 'object' && !Array.isArray(timeline.tracks)) {
		for (const [objectId, raw] of Object.entries(timeline.tracks as Record<string, Partial<TrackMeta>>)) {
			if (!raw || typeof raw !== 'object') continue;
			tracks[objectId] = {
				objectId,
				name: typeof raw.name === 'string' ? raw.name : undefined,
				locked: raw.locked === true,
				hidden: raw.hidden === true,
				muted: raw.muted === true,
			};
		}
	}
	const strips: NlaStrip[] = Array.isArray(timeline.strips)
		? timeline.strips
				.filter((strip): strip is NlaStrip => Boolean(strip) && typeof strip.id === 'string')
				.map((strip) => ({
					id: strip.id,
					objectId: typeof strip.objectId === 'string' ? strip.objectId : '',
					name: typeof strip.name === 'string' ? strip.name : 'Strip',
					start: Math.min(MAX_TIMELINE_SECONDS, Math.max(0, Number(strip.start) || 0)),
					end: Math.min(MAX_TIMELINE_SECONDS, Math.max(0, Number(strip.end) || 0)),
					actionStart: Number(strip.actionStart) || 0,
					actionEnd: Number(strip.actionEnd) || 0,
					speed: Math.min(10, Math.max(0.1, Number(strip.speed) || 1)),
					reversed: strip.reversed === true,
					frozen: strip.frozen === true,
					muted: strip.muted === true,
				}))
			: [];
	const clips: Record<string, LayerClip> = {};
	if (timeline.clips && typeof timeline.clips === 'object' && !Array.isArray(timeline.clips)) {
		for (const [objectId, raw] of Object.entries(timeline.clips as Record<string, Partial<LayerClip>>)) {
			if (!raw || typeof raw !== 'object') continue;
			const start = Number(raw.start);
			const end = Number(raw.end);
			if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
			clips[objectId] = {
				start: Math.min(MAX_TIMELINE_SECONDS, Math.max(0, start)),
				end: Math.min(MAX_TIMELINE_SECONDS, Math.max(0, end)),
			};
		}
	}
	const fps = typeof timeline.frameRate === 'number' ? Math.min(120, Math.max(1, timeline.frameRate)) : 30;
	const dur =
		typeof timeline.duration === 'number'
			? Math.min(MAX_TIMELINE_SECONDS, Math.max(0.1, timeline.duration))
			: MAX_TIMELINE_SECONDS;
	const startFrame = typeof timeline.startFrame === 'number' ? Math.max(0, Math.round(timeline.startFrame)) : 0;
	const endFrame =
		typeof timeline.endFrame === 'number'
			? Math.max(startFrame + 1, Math.round(timeline.endFrame))
			: Math.max(1, Math.round(dur * fps));
	return {
		format: PROJECT_FORMAT,
		version: PROJECT_VERSION,
		name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Untitled',
		savedAt: typeof data.savedAt === 'string' ? data.savedAt : new Date().toISOString(),
		scene: {
			objects,
			selectedId: typeof scene.selectedId === 'string' ? scene.selectedId : null,
			score: typeof scene.score === 'number' ? scene.score : 0,
		},
		timeline: {
			duration: dur,
			startFrame,
			endFrame,
			snapToFrames: timeline.snapToFrames === true,
			loop: timeline.loop !== false,
			easing: timeline.easing !== false,
			frameRate: fps,
			keyframes,
			curves,
			tracks,
			strips,
			clips,
		},
	};
}

export function applyProject(project: ProjectFile) {
	const data = validateProject(project);
	sceneStore.load(data.scene.objects, data.scene.selectedId);
	sceneStore.setScore(data.scene.score);
	timelineStore.loadKeyframes(data.timeline.keyframes);
	if (Object.keys(data.timeline.curves).length) timelineStore.loadCurves(data.timeline.curves);
	if (data.timeline.tracks) timelineStore.loadTracks(data.timeline.tracks);
	timelineStore.setFrameRate(data.timeline.frameRate);
	timelineStore.setDuration(data.timeline.duration);
	if (typeof data.timeline.startFrame === 'number') timelineStore.setStartFrame(data.timeline.startFrame);
	timelineStore.setSnapToFrames(Boolean(data.timeline.snapToFrames));
	timelineStore.loadStrips(data.timeline.strips);
	timelineStore.loadClips(data.timeline.clips);
	timelineStore.setLoop(data.timeline.loop);
	timelineStore.setEasing(data.timeline.easing);
	// Evaluate initial frame so viewport transforms match the loaded animation at t=0 / startFrame
	const evaluated = timelineStore.evaluate(get(timelineStore).currentTime, data.timeline.easing);
	if (evaluated.size) sceneStore.applyAnimation(evaluated);
}

export function downloadProject(project: ProjectFile) {
	const json = JSON.stringify(project, null, 2);
	const blob = new Blob([json], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = `${project.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'toon-project'}.tsf.json`;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readProjectFile(file: File): Promise<ProjectFile> {
	const text = await file.text();
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error('The selected file is not valid JSON.');
	}
	return validateProject(parsed);
}

function readStore(): StoredProject[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function writeStore(projects: StoredProject[]) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
	} catch {
		// Ignore quota or sandbox storage errors
	}
}

export function listSavedProjects(): StoredProject[] {
	return readStore().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function saveToBrowser(project: ProjectFile) {
	const projects = readStore().filter((entry) => entry.name !== project.name);
	projects.push({ name: project.name, savedAt: project.savedAt, project });
	writeStore(projects.slice(-20));
}

export function deleteSavedProject(name: string) {
	writeStore(readStore().filter((entry) => entry.name !== name));
}

export function saveAutosave(project: ProjectFile) {
	try {
		localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(project));
	} catch {
		// Storage can be unavailable in private browsing; autosave is best-effort.
	}
}

export function loadAutosave(): ProjectFile | null {
	try {
		const raw = localStorage.getItem(AUTOSAVE_KEY);
		if (!raw) return null;
		return validateProject(JSON.parse(raw));
	} catch {
		return null;
	}
}
