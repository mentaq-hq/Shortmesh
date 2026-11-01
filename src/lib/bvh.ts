import type { Vec3 } from './math3d';
import type { Mesh } from './mesh';
import { rayTriangle, type Ray } from './picking';

/**
 * High-speed Bounding Volume Hierarchy (BVH) over mesh triangles.
 *
 * Optimizations:
 * - Precomputes per-triangle AABBs once during flatten() to speed up tree construction.
 * - Eliminates subarray view allocations in partialSort().
 * - Uses a pre-allocated static Int32Array traversal stack and inlined ray-triangle
 *   intersection with precomputed inverse ray directions (zero heap allocations per raycast).
 */
export interface MeshBVH {
	triangleCount: number;
	/** Nine floats per triangle: three corners. */
	positions: Float64Array;
	/** The face a triangle came from. */
	faceIndex: Int32Array;
	/** Three vertex indices per triangle. */
	triVerts: Int32Array;
	/** Triangle ids sorted so that every leaf owns a contiguous run. */
	order: Int32Array;
	/** Six floats per node: min xyz, max xyz. */
	bounds: Float64Array;
	left: Int32Array;
	right: Int32Array;
	start: Int32Array;
	count: Int32Array;
	nodeCount: number;
}

const LEAF_SIZE = 6;
const EPSILON = 1e-6;
const TRAVERSAL_STACK = new Int32Array(128);

export interface BVHHit {
	t: number;
	faceIndex: number;
	triangle: number;
}

function triangleCountOf(mesh: Mesh): number {
	let total = 0;
	const faces = mesh.faces;
	for (let i = 0; i < faces.length; i++) {
		const len = faces[i].length;
		if (len > 2) total += len - 2;
	}
	return total;
}

/** Flattens polygons into a triangle soup and precomputes per-triangle AABBs and centroids. */
function flatten(mesh: Mesh, count: number) {
	const positions = new Float64Array(count * 9);
	const triBounds = new Float64Array(count * 6);
	const centroids = new Float64Array(count * 3);
	const faceIndex = new Int32Array(count);
	const triVerts = new Int32Array(count * 3);
	const verts = mesh.vertices;
	const faces = mesh.faces;
	let triangle = 0;

	for (let f = 0; f < faces.length; f++) {
		const face = faces[f];
		const fLen = face.length;
		if (fLen < 3) continue;
		const i0 = face[0];
		const a = verts[i0];
		const ax = a[0], ay = a[1], az = a[2];

		for (let i = 1; i < fLen - 1; i++) {
			const i1 = face[i];
			const i2 = face[i + 1];
			const b = verts[i1];
			const c = verts[i2];
			const bx = b[0], by = b[1], bz = b[2];
			const cx = c[0], cy = c[1], cz = c[2];

			const at = triangle * 9;
			positions[at] = ax;
			positions[at + 1] = ay;
			positions[at + 2] = az;
			positions[at + 3] = bx;
			positions[at + 4] = by;
			positions[at + 5] = bz;
			positions[at + 6] = cx;
			positions[at + 7] = cy;
			positions[at + 8] = cz;

			const bt = triangle * 6;
			triBounds[bt] = ax < bx ? (ax < cx ? ax : cx) : (bx < cx ? bx : cx);
			triBounds[bt + 1] = ay < by ? (ay < cy ? ay : cy) : (by < cy ? by : cy);
			triBounds[bt + 2] = az < bz ? (az < cz ? az : cz) : (bz < cz ? bz : cz);
			triBounds[bt + 3] = ax > bx ? (ax > cx ? ax : cx) : (bx > cx ? bx : cx);
			triBounds[bt + 4] = ay > by ? (ay > cy ? ay : cy) : (by > cy ? by : cy);
			triBounds[bt + 5] = az > bz ? (az > cz ? az : cz) : (bz > cz ? bz : cz);

			const ct = triangle * 3;
			centroids[ct] = (ax + bx + cx) * (1 / 3);
			centroids[ct + 1] = (ay + by + cy) * (1 / 3);
			centroids[ct + 2] = (az + bz + cz) * (1 / 3);

			faceIndex[triangle] = f;
			triVerts[ct] = i0;
			triVerts[ct + 1] = i1;
			triVerts[ct + 2] = i2;
			triangle++;
		}
	}
	return { positions, triBounds, centroids, faceIndex, triVerts };
}

export function buildMeshBVH(mesh: Mesh): MeshBVH {
	const triangleCount = triangleCountOf(mesh);
	const { positions, triBounds, centroids, faceIndex, triVerts } = flatten(mesh, triangleCount);
	const order = new Int32Array(triangleCount);
	for (let i = 0; i < triangleCount; i++) order[i] = i;

	const maxNodes = Math.max(1, triangleCount * 2);
	const bounds = new Float64Array(maxNodes * 6);
	const left = new Int32Array(maxNodes);
	const right = new Int32Array(maxNodes);
	const start = new Int32Array(maxNodes);
	const count = new Int32Array(maxNodes);
	let nodeCount = 0;

	function partialSort(from: number, len: number, k: number, axis: number) {
		let lo = from;
		let hi = from + len - 1;
		const target = from + k;
		while (lo < hi) {
			const pivot = centroids[order[(lo + hi) >> 1] * 3 + axis];
			let i = lo;
			let j = hi;
			while (i <= j) {
				while (centroids[order[i] * 3 + axis] < pivot) i++;
				while (centroids[order[j] * 3 + axis] > pivot) j--;
				if (i <= j) {
					const tmp = order[i];
					order[i] = order[j];
					order[j] = tmp;
					i++;
					j--;
				}
			}
			if (target <= j) hi = j;
			else if (target >= i) lo = i;
			else break;
		}
	}

	function makeNode(from: number, length: number): number {
		const node = nodeCount++;
		start[node] = from;
		count[node] = length;
		left[node] = -1;
		right[node] = -1;

		let minX = Infinity, minY = Infinity, minZ = Infinity;
		let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
		let cMinX = Infinity, cMinY = Infinity, cMinZ = Infinity;
		let cMaxX = -Infinity, cMaxY = -Infinity, cMaxZ = -Infinity;

		const end = from + length;
		for (let i = from; i < end; i++) {
			const t = order[i];
			const bt = t * 6;
			const bMinX = triBounds[bt], bMinY = triBounds[bt + 1], bMinZ = triBounds[bt + 2];
			const bMaxX = triBounds[bt + 3], bMaxY = triBounds[bt + 4], bMaxZ = triBounds[bt + 5];
			if (bMinX < minX) minX = bMinX;
			if (bMinY < minY) minY = bMinY;
			if (bMinZ < minZ) minZ = bMinZ;
			if (bMaxX > maxX) maxX = bMaxX;
			if (bMaxY > maxY) maxY = bMaxY;
			if (bMaxZ > maxZ) maxZ = bMaxZ;

			const ct = t * 3;
			const cx = centroids[ct], cy = centroids[ct + 1], cz = centroids[ct + 2];
			if (cx < cMinX) cMinX = cx;
			if (cy < cMinY) cMinY = cy;
			if (cz < cMinZ) cMinZ = cz;
			if (cx > cMaxX) cMaxX = cx;
			if (cy > cMaxY) cMaxY = cy;
			if (cz > cMaxZ) cMaxZ = cz;
		}

		const nb = node * 6;
		bounds[nb] = minX;
		bounds[nb + 1] = minY;
		bounds[nb + 2] = minZ;
		bounds[nb + 3] = maxX;
		bounds[nb + 4] = maxY;
		bounds[nb + 5] = maxZ;

		if (length <= LEAF_SIZE) return node;

		const extentX = cMaxX - cMinX;
		const extentY = cMaxY - cMinY;
		const extentZ = cMaxZ - cMinZ;
		const axis = extentX >= extentY && extentX >= extentZ ? 0 : extentY >= extentZ ? 1 : 2;
		const half = length >> 1;
		partialSort(from, length, half, axis);

		left[node] = makeNode(from, half);
		right[node] = makeNode(from + half, length - half);
		return node;
	}

	if (triangleCount > 0) makeNode(0, triangleCount);
	else {
		start[0] = 0;
		count[0] = 0;
		nodeCount = 1;
	}

	return {
		triangleCount,
		positions,
		faceIndex,
		triVerts,
		order,
		bounds,
		left,
		right,
		start,
		count,
		nodeCount,
	};
}

/** Zero-allocation slab test with precomputed inverse ray directions. */
function slabFast(
	bounds: Float64Array,
	node: number,
	ox: number,
	oy: number,
	oz: number,
	dx: number,
	dy: number,
	dz: number,
	invX: number,
	invY: number,
	invZ: number,
	maxT: number,
): number {
	const at = node * 6;
	let tMin = 0;
	let tMax = maxT;

	const loX = bounds[at], hiX = bounds[at + 3];
	if (Math.abs(dx) < 1e-12) {
		if (ox < loX || ox > hiX) return -1;
	} else {
		let t1 = (loX - ox) * invX;
		let t2 = (hiX - ox) * invX;
		if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
		if (t1 > tMin) tMin = t1;
		if (t2 < tMax) tMax = t2;
		if (tMin > tMax) return -1;
	}

	const loY = bounds[at + 1], hiY = bounds[at + 4];
	if (Math.abs(dy) < 1e-12) {
		if (oy < loY || oy > hiY) return -1;
	} else {
		let t1 = (loY - oy) * invY;
		let t2 = (hiY - oy) * invY;
		if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
		if (t1 > tMin) tMin = t1;
		if (t2 < tMax) tMax = t2;
		if (tMin > tMax) return -1;
	}

	const loZ = bounds[at + 2], hiZ = bounds[at + 5];
	if (Math.abs(dz) < 1e-12) {
		if (oz < loZ || oz > hiZ) return -1;
	} else {
		let t1 = (loZ - oz) * invZ;
		let t2 = (hiZ - oz) * invZ;
		if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
		if (t1 > tMin) tMin = t1;
		if (t2 < tMax) tMax = t2;
		if (tMin > tMax) return -1;
	}

	return tMin;
}

/** Zero-allocation Möller–Trumbore ray-triangle test reading directly from the flat buffer. */
function rayTriangleFlat(
	ox: number,
	oy: number,
	oz: number,
	dx: number,
	dy: number,
	dz: number,
	positions: Float64Array,
	at: number,
): number {
	const ax = positions[at], ay = positions[at + 1], az = positions[at + 2];
	const e1x = positions[at + 3] - ax;
	const e1y = positions[at + 4] - ay;
	const e1z = positions[at + 5] - az;
	const e2x = positions[at + 6] - ax;
	const e2y = positions[at + 7] - ay;
	const e2z = positions[at + 8] - az;
	const px = dy * e2z - dz * e2y;
	const py = dz * e2x - dx * e2z;
	const pz = dx * e2y - dy * e2x;
	const det = e1x * px + e1y * py + e1z * pz;
	if (det > -EPSILON && det < EPSILON) return -1;
	const inv = 1 / det;
	const tx = ox - ax;
	const ty = oy - ay;
	const tz = oz - az;
	const u = (tx * px + ty * py + tz * pz) * inv;
	if (u < -EPSILON || u > 1 + EPSILON) return -1;
	const qx = ty * e1z - tz * e1y;
	const qy = tz * e1x - tx * e1z;
	const qz = tx * e1y - ty * e1x;
	const v = (dx * qx + dy * qy + dz * qz) * inv;
	if (v < -EPSILON || u + v > 1 + EPSILON) return -1;
	const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
	return t > EPSILON ? t : -1;
}

/**
 * Nearest triangle along the ray. Zero allocations during traversal.
 */
export function raycastBVH(bvh: MeshBVH, ray: Ray, maxT = Infinity): BVHHit | null {
	if (bvh.triangleCount === 0) return null;
	const ox = ray.origin[0], oy = ray.origin[1], oz = ray.origin[2];
	const dx = ray.dir[0], dy = ray.dir[1], dz = ray.dir[2];
	const invX = Math.abs(dx) >= 1e-12 ? 1 / dx : 0;
	const invY = Math.abs(dy) >= 1e-12 ? 1 / dy : 0;
	const invZ = Math.abs(dz) >= 1e-12 ? 1 / dz : 0;

	const bounds = bvh.bounds;
	const left = bvh.left;
	const right = bvh.right;
	const start = bvh.start;
	const count = bvh.count;
	const order = bvh.order;
	const positions = bvh.positions;

	if (slabFast(bounds, 0, ox, oy, oz, dx, dy, dz, invX, invY, invZ, maxT) < 0) return null;

	let bestT = maxT;
	let bestTri = -1;
	let sp = 0;
	TRAVERSAL_STACK[sp++] = 0;

	while (sp > 0) {
		const node = TRAVERSAL_STACK[--sp];
		const l = left[node];
		if (l < 0) {
			const from = start[node];
			const to = from + count[node];
			for (let i = from; i < to; i++) {
				const triangle = order[i];
				const t = rayTriangleFlat(ox, oy, oz, dx, dy, dz, positions, triangle * 9);
				if (t > 0 && t < bestT) {
					bestT = t;
					bestTri = triangle;
				}
			}
			continue;
		}
		const r = right[node];
		const a = slabFast(bounds, l, ox, oy, oz, dx, dy, dz, invX, invY, invZ, bestT);
		const b = slabFast(bounds, r, ox, oy, oz, dx, dy, dz, invX, invY, invZ, bestT);
		if (a < 0 && b < 0) continue;
		if (a < 0) {
			TRAVERSAL_STACK[sp++] = r;
		} else if (b < 0) {
			TRAVERSAL_STACK[sp++] = l;
		} else if (a <= b) {
			TRAVERSAL_STACK[sp++] = r;
			TRAVERSAL_STACK[sp++] = l;
		} else {
			TRAVERSAL_STACK[sp++] = l;
			TRAVERSAL_STACK[sp++] = r;
		}
	}
	void rayTriangle;
	return bestTri >= 0 ? { t: bestT, faceIndex: bvh.faceIndex[bestTri], triangle: bestTri } : null;
}

/** Every vertex that falls inside a sphere, used by proportional editing and sculpting. */
export function verticesInSphere(bvh: MeshBVH, center: Vec3, vertices: Vec3[], radius: number): number[] {
	if (bvh.triangleCount === 0) return [];
	const found = new Set<number>();
	const r2 = radius * radius;
	const cx = center[0], cy = center[1], cz = center[2];
	const bounds = bvh.bounds;
	const left = bvh.left;
	const right = bvh.right;
	const start = bvh.start;
	const count = bvh.count;
	const order = bvh.order;
	const triVerts = bvh.triVerts;

	let sp = 0;
	TRAVERSAL_STACK[sp++] = 0;
	while (sp > 0) {
		const node = TRAVERSAL_STACK[--sp];
		const at = node * 6;
		const dx = cx < bounds[at] ? bounds[at] - cx : cx > bounds[at + 3] ? cx - bounds[at + 3] : 0;
		const dy = cy < bounds[at + 1] ? bounds[at + 1] - cy : cy > bounds[at + 4] ? cy - bounds[at + 4] : 0;
		const dz = cz < bounds[at + 2] ? bounds[at + 2] - cz : cz > bounds[at + 5] ? cz - bounds[at + 5] : 0;
		if (dx * dx + dy * dy + dz * dz > r2) continue;
		const l = left[node];
		if (l < 0) {
			const from = start[node];
			const to = from + count[node];
			for (let i = from; i < to; i++) {
				const t3 = order[i] * 3;
				for (let corner = 0; corner < 3; corner++) {
					const vertex = triVerts[t3 + corner];
					const point = vertices[vertex];
					if (!point) continue;
					const vx = point[0] - cx;
					const vy = point[1] - cy;
					const vz = point[2] - cz;
					if (vx * vx + vy * vy + vz * vz <= r2) found.add(vertex);
				}
			}
			continue;
		}
		TRAVERSAL_STACK[sp++] = l;
		TRAVERSAL_STACK[sp++] = right[node];
	}
	return [...found];
}

const cache = new WeakMap<Mesh, { version: number; bvh: MeshBVH }>();

/**
 * The hierarchy of a mesh, rebuilt only when the geometry version moves.
 */
export function meshBVH(mesh: Mesh, version = 0): MeshBVH {
	const entry = cache.get(mesh);
	if (entry && entry.version === version) return entry.bvh;
	const bvh = buildMeshBVH(mesh);
	cache.set(mesh, { version, bvh });
	return bvh;
}

export function invalidateBVH(mesh: Mesh): void {
	cache.delete(mesh);
}
