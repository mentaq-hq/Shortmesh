import type { CameraBasis, OrbitCamera, Vec3 } from './math3d';
import { cameraBasis, worldPerPixel } from './math3d';
import { mat4FromTRS, mat4Invert, transformDir3, transformVec3, type Mat4 } from './glmath';
import type { Mesh } from './mesh';
import { meshBVH, raycastBVH } from './bvh';
import { triangleSoup, type WasmEngine } from './wasm';

export interface Ray {
	origin: Vec3;
	dir: Vec3;
}

export interface PickObject {
	id: string;
	mesh: Mesh;
	position: Vec3;
	rotation: Vec3;
	scale: Vec3;
	version?: number;
}

export interface ObjectHit {
	id: string;
	t: number;
	world: Vec3;
}

const EPSILON = 1e-6;

let engine: WasmEngine | null = null;
const engineMeshes = new WeakMap<Mesh, { handle: number; version: number; triangles: number }>();
const triangleCounts = new WeakMap<Mesh, number>();

/** Automatically frees WASM mesh handles when the JS Mesh is garbage collected. */
const handleRegistry =
	typeof FinalizationRegistry !== 'undefined'
		? new FinalizationRegistry<number>((handle) => {
				if (engine && handle) engine.free(handle);
			})
		: null;

export const ENGINE_TRIANGLE_THRESHOLD = 128;

export function setPickingEngine(next: WasmEngine | null) {
	engine = next;
}

export function pickingEngineLoaded(): boolean {
	return engine !== null;
}

function triangleCount(mesh: Mesh): number {
	let count = triangleCounts.get(mesh);
	if (count === undefined) {
		count = 0;
		for (const face of mesh.faces) count += Math.max(0, face.length - 2);
		triangleCounts.set(mesh, count);
	}
	return count;
}

function engineHandle(mesh: Mesh, version: number): number {
	if (!engine) return 0;
	let entry = engineMeshes.get(mesh);
	if (entry && entry.version === version) return entry.handle;
	if (!entry) {
		const soup = triangleSoup(mesh);
		const handle = engine.createMesh(soup.vertices, soup.triangles);
		if (handle) handleRegistry?.register(mesh, handle, mesh);
		entry = { handle, version, triangles: soup.triangles.length / 3 };
		engineMeshes.set(mesh, entry);
		return handle;
	}
	const vertices = new Float32Array(mesh.vertices.length * 3);
	for (let i = 0; i < mesh.vertices.length; i++) {
		vertices[i * 3] = mesh.vertices[i][0];
		vertices[i * 3 + 1] = mesh.vertices[i][1];
		vertices[i * 3 + 2] = mesh.vertices[i][2];
	}
	engine.refit(entry.handle, vertices);
	entry.version = version;
	return entry.handle;
}

export function cameraRay(camera: OrbitCamera, px: number, py: number, width: number, height: number, basis = cameraBasis(camera)): Ray {
	const ndcX = (px / Math.max(width, 1)) * 2 - 1;
	const ndcY = 1 - (py / Math.max(height, 1)) * 2;
	const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
	const aspect = width / Math.max(height, 1);
	const dir: Vec3 = [
		basis.forward[0] + basis.right[0] * ndcX * aspect * tanHalf + basis.up[0] * ndcY * tanHalf,
		basis.forward[1] + basis.right[1] * ndcX * aspect * tanHalf + basis.up[1] * ndcY * tanHalf,
		basis.forward[2] + basis.right[2] * ndcX * aspect * tanHalf + basis.up[2] * ndcY * tanHalf,
	];
	const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
	return { origin: [...basis.eye] as Vec3, dir: [dir[0] / len, dir[1] / len, dir[2] / len] };
}

export function rayTriangle(origin: Vec3, dir: Vec3, a: Vec3, b: Vec3, c: Vec3): number | null {
	const e1x = b[0] - a[0];
	const e1y = b[1] - a[1];
	const e1z = b[2] - a[2];
	const e2x = c[0] - a[0];
	const e2y = c[1] - a[1];
	const e2z = c[2] - a[2];
	const px = dir[1] * e2z - dir[2] * e2y;
	const py = dir[2] * e2x - dir[0] * e2z;
	const pz = dir[0] * e2y - dir[1] * e2x;
	const det = e1x * px + e1y * py + e1z * pz;
	if (Math.abs(det) < EPSILON) return null;
	const inv = 1 / det;
	const tx = origin[0] - a[0];
	const ty = origin[1] - a[1];
	const tz = origin[2] - a[2];
	const u = (tx * px + ty * py + tz * pz) * inv;
	if (u < -EPSILON || u > 1 + EPSILON) return null;
	const qx = ty * e1z - tz * e1y;
	const qy = tz * e1x - tx * e1z;
	const qz = tx * e1y - ty * e1x;
	const v = (dir[0] * qx + dir[1] * qy + dir[2] * qz) * inv;
	if (v < -EPSILON || u + v > 1 + EPSILON) return null;
	const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
	return t > EPSILON ? t : null;
}

export function pickObjects(objects: PickObject[], ray: Ray): ObjectHit | null {
	let best: ObjectHit | null = null;
	for (const object of objects) {
		const model = mat4FromTRS(object.position, object.rotation, object.scale);
		const inverse = mat4Invert(model);
		const localRay: Ray = {
			origin: transformVec3(inverse, ray.origin),
			dir: transformDir3(inverse, ray.dir),
		};
		const handle =
			engine && triangleCount(object.mesh) >= ENGINE_TRIANGLE_THRESHOLD
				? engineHandle(object.mesh, object.version ?? 0)
				: 0;
		const hit = handle
			? engine!.raycast(handle, localRay.origin, localRay.dir)
			: raycastBVH(meshBVH(object.mesh, object.version ?? 0), localRay);
		if (!hit) continue;
		if (!best || hit.t < best.t) {
			const local: Vec3 = [
				localRay.origin[0] + localRay.dir[0] * hit.t,
				localRay.origin[1] + localRay.dir[1] * hit.t,
				localRay.origin[2] + localRay.dir[2] * hit.t,
			];
			best = { id: object.id, t: hit.t, world: transformVec3(model, local) };
		}
	}
	return best;
}

export interface ElementHit {
	kind: 'vertex' | 'edge' | 'face';
	index: number;
	world: Vec3;
	t: number;
}

function closestOnRay(ray: Ray, point: Vec3, dirSq = 1): { t: number; distance: number } {
	const vx = point[0] - ray.origin[0];
	const vy = point[1] - ray.origin[1];
	const vz = point[2] - ray.origin[2];
	const t = (vx * ray.dir[0] + vy * ray.dir[1] + vz * ray.dir[2]) / dirSq;
	const cx = ray.origin[0] + ray.dir[0] * t - point[0];
	const cy = ray.origin[1] + ray.dir[1] * t - point[1];
	const cz = ray.origin[2] + ray.dir[2] * t - point[2];
	return { t, distance: Math.hypot(cx, cy, cz) };
}

export function pickElement(
	mesh: Mesh,
	model: Mat4,
	ray: Ray,
	kind: 'vertex' | 'edge' | 'face',
	threshold: number,
	version = 0,
): ElementHit | null {
	const inverse = mat4Invert(model);
	const localOrigin = transformVec3(inverse, ray.origin);
	const localDir = transformDir3(inverse, ray.dir);
	const localDirSq = localDir[0] * localDir[0] + localDir[1] * localDir[1] + localDir[2] * localDir[2] || 1;
	const localRay: Ray = { origin: localOrigin, dir: localDir };
	const toWorld = (point: Vec3): Vec3 => transformVec3(model, point);

	let best: ElementHit | null = null;

	if (kind === 'face') {
		const useEngine = engine && triangleCount(mesh) >= ENGINE_TRIANGLE_THRESHOLD;
		const handle = useEngine ? engineHandle(mesh, version) : 0;
		const hit = handle ? engine!.raycast(handle, localRay.origin, localRay.dir) : raycastBVH(meshBVH(mesh, version), localRay);
		if (!hit) return null;
		return {
			kind: 'face',
			index: 'faceIndex' in hit ? hit.faceIndex : hit.face,
			t: hit.t,
			world: [ray.origin[0] + ray.dir[0] * hit.t, ray.origin[1] + ray.dir[1] * hit.t, ray.origin[2] + ray.dir[2] * hit.t],
		};
	}

	if (kind === 'vertex') {
		for (let i = 0; i < mesh.vertices.length; i++) {
			const { t, distance } = closestOnRay(localRay, mesh.vertices[i], localDirSq);
			if (t < 0 || distance > threshold) continue;
			if (!best || t < best.t) best = { kind: 'vertex', index: i, t, world: toWorld(mesh.vertices[i]) };
		}
		return best;
	}

	for (let i = 0; i < mesh.edges.length; i++) {
		const [a, b] = mesh.edges[i];
		const va = mesh.vertices[a];
		const vb = mesh.vertices[b];
		const abx = vb[0] - va[0];
		const aby = vb[1] - va[1];
		const abz = vb[2] - va[2];
		const wx = localOrigin[0] - va[0];
		const wy = localOrigin[1] - va[1];
		const wz = localOrigin[2] - va[2];
		const dirDotAb = localDir[0] * abx + localDir[1] * aby + localDir[2] * abz;
		const dirDotW = localDir[0] * wx + localDir[1] * wy + localDir[2] * wz;
		const abDotW = abx * wx + aby * wy + abz * wz;
		const abDotAb = abx * abx + aby * aby + abz * abz;
		const denom = localDirSq * abDotAb - dirDotAb * dirDotAb;
		let s = 0;
		if (Math.abs(denom) > EPSILON) s = Math.min(1, Math.max(0, (localDirSq * abDotW - dirDotAb * dirDotW) / denom));
		const point: Vec3 = [va[0] + abx * s, va[1] + aby * s, va[2] + abz * s];
		const { t, distance } = closestOnRay(localRay, point, localDirSq);
		if (t < 0 || distance > threshold) continue;
		if (!best || t < best.t) best = { kind: 'edge', index: i, t, world: toWorld(point) };
	}
	return best;
}

export interface ScreenPoint {
	x: number;
	y: number;
	depth: number;
	visible: boolean;
}

export function projectWorld(point: Vec3, basis: CameraBasis, fov: number, width: number, height: number): ScreenPoint {
	const dx = point[0] - basis.eye[0];
	const dy = point[1] - basis.eye[1];
	const dz = point[2] - basis.eye[2];
	const depth = dx * basis.forward[0] + dy * basis.forward[1] + dz * basis.forward[2];
	const x = dx * basis.right[0] + dy * basis.right[1] + dz * basis.right[2];
	const y = dx * basis.up[0] + dy * basis.up[1] + dz * basis.up[2];
	const tanHalf = Math.tan((fov * Math.PI) / 360);
	const aspect = width / Math.max(height, 1);
	if (depth <= 0.001) return { x: 0, y: 0, depth, visible: false };
	const ndcX = x / (depth * tanHalf * aspect);
	const ndcY = y / (depth * tanHalf);
	return {
		x: (ndcX + 1) * 0.5 * width,
		y: (1 - ndcY) * 0.5 * height,
		depth,
		visible: true,
	};
}

export function rayWorldThreshold(camera: OrbitCamera, distanceAlongRay: number, height: number, pixels = 14): number {
	return worldPerPixel(Math.max(0.01, distanceAlongRay), camera.fov, height) * pixels;
}
