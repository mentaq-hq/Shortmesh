// Blender BMesh operator port: `bmo_bisect_plane` and `bmo_extrude`.
//
// The scissors tool draws a line across the screen. That line is unprojected
// into a 3D cutting plane, every triangle is classified by the signed distance
// to that plane and the triangles that straddle it are split along the exact
// intersection points. The resulting cut loop is capped so both halves stay
// watertight.

import type { Vec3 } from './math3d';
import { cross, dot, normalize, sub } from './math3d';
import { buildEdges, buildGroups, computeRadius, type Face, type MaterialSlot, type Mesh } from './mesh';

const EPSILON = 1e-7;
const WELD_QUANTUM = 1e5;

export interface CutPlane {
	normal: Vec3;
	dist: number;
}

export interface ScreenPoint {
	x: number;
	y: number;
}

export interface CameraFrame {
	eye: Vec3;
	forward: Vec3;
	right: Vec3;
	up: Vec3;
	fov: number;
}

export interface BisectResult {
	positive: Mesh;
	negative: Mesh;
	/** Number of triangles that were split by the plane. */
	splitTriangles: number;
	/** Vertices created by the cut. */
	cutVertices: number;
	/** Closed loops that describe the cut through the surface. */
	loops: Vec3[][];
}

function signOf(distance: number): number {
	if (distance > EPSILON) return 1;
	if (distance < -EPSILON) return -1;
	return 0;
}

function quantize(value: number): number {
	return Math.round(value * WELD_QUANTUM) / WELD_QUANTUM;
}

function pointKey(point: Vec3): string {
	return `${quantize(point[0])}:${quantize(point[1])}:${quantize(point[2])}`;
}

/** Builds a ray through a screen position for the given camera frame. */
export function screenRay(frame: CameraFrame, point: ScreenPoint, width: number, height: number) {
	const ndcX = (point.x / Math.max(width, 1)) * 2 - 1;
	const ndcY = 1 - (point.y / Math.max(height, 1)) * 2;
	const tanHalf = Math.tan((frame.fov * Math.PI) / 360);
	const aspect = width / Math.max(height, 1);
	const dir: Vec3 = [
		frame.forward[0] + frame.right[0] * ndcX * aspect * tanHalf + frame.up[0] * ndcY * tanHalf,
		frame.forward[1] + frame.right[1] * ndcX * aspect * tanHalf + frame.up[1] * ndcY * tanHalf,
		frame.forward[2] + frame.right[2] * ndcX * aspect * tanHalf + frame.up[2] * ndcY * tanHalf,
	];
	const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
	return { origin: frame.eye, dir: [dir[0] / len, dir[1] / len, dir[2] / len] as Vec3 };
}

/**
 * Turns a screen drawn segment into a cutting plane.
 *
 * The plane contains the drawn line at the requested view depth and its
 * normal lies inside the screen plane, so the cut is seen exactly where the
 * user drew it.
 */
export function cutPlaneFromScreenSegment(
	frame: CameraFrame,
	start: ScreenPoint,
	end: ScreenPoint,
	width: number,
	height: number,
	depth: number,
): CutPlane {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const length = Math.hypot(dx, dy) || 1;
	// Screen space perpendicular (screen y points down).
	const nx = dy / length;
	const ny = -dx / length;

	const normal = normalize([
		frame.right[0] * nx + frame.up[0] * -ny,
		frame.right[1] * nx + frame.up[1] * -ny,
		frame.right[2] * nx + frame.up[2] * -ny,
	]);

	const rayA = screenRay(frame, start, width, height);
	const depthA = depth / Math.max(dot(rayA.dir, frame.forward), 1e-6);
	const pointA: Vec3 = [
		rayA.origin[0] + rayA.dir[0] * depthA,
		rayA.origin[1] + rayA.dir[1] * depthA,
		rayA.origin[2] + rayA.dir[2] * depthA,
	];
	return { normal, dist: dot(normal, pointA) };
}

/** Newell's method: the area weighted normal of a polygon. */
export function polygonNormal(points: Vec3[]): Vec3 {
	let nx = 0;
	let ny = 0;
	let nz = 0;
	for (let i = 0; i < points.length; i++) {
		const a = points[i];
		const b = points[(i + 1) % points.length];
		nx += (a[1] - b[1]) * (a[2] + b[2]);
		ny += (a[2] - b[2]) * (a[0] + b[0]);
		nz += (a[0] - b[0]) * (a[1] + b[1]);
	}
	const len = Math.hypot(nx, ny, nz);
	if (len < 1e-12) return [0, 1, 0];
	return [nx / len, ny / len, nz / len];
}

interface ClipVertex {
	position: Vec3;
	distance: number;
	/** Index of the vertex in the source mesh, missing for cut points. */
	index?: number;
}

function clipPolygon(vertices: ClipVertex[], keepPositive: boolean): ClipVertex[] {
	const result: ClipVertex[] = [];
	const count = vertices.length;
	for (let i = 0; i < count; i++) {
		const current = vertices[i];
		const next = vertices[(i + 1) % count];
		const currentInside = keepPositive ? current.distance >= -EPSILON : current.distance <= EPSILON;
		const nextInside = keepPositive ? next.distance >= -EPSILON : next.distance <= EPSILON;
		if (currentInside) result.push(current);
		if (currentInside !== nextInside) {
			const denominator = current.distance - next.distance;
			if (Math.abs(denominator) > 1e-12) {
				const t = current.distance / denominator;
				result.push({
					position: [
						current.position[0] + (next.position[0] - current.position[0]) * t,
						current.position[1] + (next.position[1] - current.position[1]) * t,
						current.position[2] + (next.position[2] - current.position[2]) * t,
					],
					distance: 0,
				});
			}
		}
	}
	return result;
}

function polygonArea(points: Vec3[]): number {
	let area = 0;
	for (let i = 0; i < points.length; i++) {
		const a = points[i];
		const b = points[(i + 1) % points.length];
		area += a[0] * b[1] - b[0] * a[1];
	}
	return area / 2;
}

/** Signed area of a polygon; positive when the winding is counter clockwise. */
export function signedArea(points: Vec3[]): number {
	return polygonArea(points);
}

/**
 * Splits a mesh with a plane.
 *
 * Every triangle is classified with the signed distance
 * `d = dot(plane_normal, v) - plane_dist`. Triangles that straddle the plane
 * are split at `t = d0 / (d0 - d1)` and the cut loop is capped, so both
 * halves come out watertight.
 */
export function bisectMesh(mesh: Mesh, plane: CutPlane): BisectResult {
	const length = Math.hypot(plane.normal[0], plane.normal[1], plane.normal[2]) || 1;
	const normal = normalize(plane.normal);
	const dist = plane.dist / length;

	const vertices: Vec3[] = mesh.vertices.map((v) => [v[0], v[1], v[2]] as Vec3);
	const distances = vertices.map((v) => dot(normal, v) - dist);

	const cutVertexIndex = new Map<string, number>();

	const cutVertex = (position: Vec3): number => {
		const key = pointKey(position);
		const existing = cutVertexIndex.get(key);
		if (existing !== undefined) return existing;
		const index = vertices.length;
		vertices.push(position);
		distances.push(0);
		cutVertexIndex.set(key, index);
		return index;
	};

	const positiveFaces: number[][] = [];
	const negativeFaces: number[][] = [];
	const positiveSlots: number[] = [];
	const negativeSlots: number[] = [];
	const segments: [Vec3, Vec3][] = [];
	let splitTriangles = 0;

	mesh.faces.forEach((face, faceIndex) => {
		const slot = mesh.faceSlot?.[faceIndex] ?? 0;
		for (let i = 1; i < face.length - 1; i++) {
			const indices = [face[0], face[i], face[i + 1]];
			const corners: ClipVertex[] = indices.map((index) => ({
				position: mesh.vertices[index],
				distance: distances[index],
				index,
			}));
			const signs = corners.map((corner) => signOf(corner.distance));
			const hasPositive = signs.some((sign) => sign > 0);
			const hasNegative = signs.some((sign) => sign < 0);

			if (!hasPositive) {
				negativeFaces.push([...indices]);
				negativeSlots.push(slot);
				continue;
			}
			if (!hasNegative) {
				positiveFaces.push([...indices]);
				positiveSlots.push(slot);
				continue;
			}

			splitTriangles++;

			const positive = clipPolygon(corners, true);
			const negative = clipPolygon(corners, false);

			const cutPoints: Vec3[] = [];
			const emit = (polygon: ClipVertex[], target: number[][], slotTarget: number[]) => {
				const indicesOut: number[] = [];
				for (const corner of polygon) {
					indicesOut.push(corner.index ?? cutVertex(corner.position));
				}
				if (indicesOut.length < 3) return;
				for (let k = 1; k < indicesOut.length - 1; k++) {
					target.push([indicesOut[0], indicesOut[k], indicesOut[k + 1]]);
					slotTarget.push(slot);
				}
			};

			emit(positive, positiveFaces, positiveSlots);
			emit(negative, negativeFaces, negativeSlots);

			// The cut segment of this triangle connects the two points where the
			// plane crosses its edges.
			for (let e = 0; e < 3; e++) {
				const a = corners[e];
				const b = corners[(e + 1) % 3];
				const sa = signOf(a.distance);
				const sb = signOf(b.distance);
				if (sa === 0 || sb === 0 || sa === sb) continue;
				const denominator = a.distance - b.distance;
				if (Math.abs(denominator) < 1e-12) continue;
				const t = a.distance / denominator;
				cutPoints.push([
					a.position[0] + (b.position[0] - a.position[0]) * t,
					a.position[1] + (b.position[1] - a.position[1]) * t,
					a.position[2] + (b.position[2] - a.position[2]) * t,
				]);
			}
			if (cutPoints.length >= 2) {
				segments.push([cutPoints[0], cutPoints[1]]);
			}
		}
	});

	const loops = chainSegments(segments);

	const positiveLoop = loops.map((loop) => orientLoop(loop, normal, true));
	const negativeLoop = loops.map((loop) => orientLoop(loop, normal, false));

	const slots = mesh.slots ?? [];
	const positiveMesh = buildPart(vertices, positiveFaces, positiveSlots, positiveLoop, mesh.smooth ?? false, slots, cutVertex);
	const negativeMesh = buildPart(vertices, negativeFaces, negativeSlots, negativeLoop, mesh.smooth ?? false, slots, cutVertex);

	return {
		positive: positiveMesh,
		negative: negativeMesh,
		splitTriangles,
		cutVertices: cutVertexIndex.size,
		loops,
	};
}

function orientLoop(loop: Vec3[], normal: Vec3, positive: boolean): Vec3[] {
	const loopNormal = polygonNormal(loop);
	const aligned = dot(loopNormal, normal) >= 0;
	if (aligned === positive) return loop;
	return [...loop].reverse();
}

/** Chains cut segments into closed loops. */
function chainSegments(segments: [Vec3, Vec3][]): Vec3[][] {
	if (!segments.length) return [];
	const adjacency = new Map<string, { point: Vec3; links: string[] }>();
	const keyOf = (point: Vec3) => pointKey(point);

	const node = (point: Vec3): string => {
		const key = keyOf(point);
		let entry = adjacency.get(key);
		if (!entry) {
			entry = { point, links: [] };
			adjacency.set(key, entry);
		}
		return key;
	};

	const edgeKeys: [string, string][] = [];
	for (const [a, b] of segments) {
		const ka = node(a);
		const kb = node(b);
		if (ka === kb) continue;
		adjacency.get(ka)?.links.push(kb);
		adjacency.get(kb)?.links.push(ka);
		edgeKeys.push([ka, kb]);
	}

	const used = new Set<string>();
	const loops: Vec3[][] = [];
	for (const [ka, kb] of edgeKeys) {
		const edgeId = `${ka}|${kb}`;
		const reverseId = `${kb}|${ka}`;
		if (used.has(edgeId) || used.has(reverseId)) continue;
		const loop: Vec3[] = [adjacency.get(ka)!.point];
		let current = ka;
		let next = kb;
		let guard = 0;
		while (guard++ < 4096) {
			used.add(`${current}|${next}`);
			loop.push(adjacency.get(next)!.point);
			if (next === ka) break;
			const links = adjacency.get(next)?.links ?? [];
			const following = links.find((candidate) => {
				if (candidate === current) return false;
				return !used.has(`${next}|${candidate}`) && !used.has(`${candidate}|${next}`);
			});
			if (!following) break;
			current = next;
			next = following;
		}
		if (loop.length >= 3) {
			loop.pop();
			loops.push(loop);
		}
	}
	return loops;
}

function buildPart(
	vertices: Vec3[],
	faces: number[][],
	faceSlots: number[],
	loops: Vec3[][],
	smooth: boolean,
	slots: MaterialSlot[],
	resolve: (position: Vec3) => number,
): Mesh {
	const remap = new Map<number, number>();
	const nextVertices: Vec3[] = [];
	const translate = (index: number): number => {
		const existing = remap.get(index);
		if (existing !== undefined) return existing;
		const target = nextVertices.length;
		nextVertices.push(vertices[index]);
		remap.set(index, target);
		return target;
	};

	const nextFaces: number[][] = faces.map((face) => face.map(translate));
	const faceSlot = faces.map((_, index) => faceSlots[index] ?? 0);
	for (const loop of loops) {
		nextFaces.push(loop.map((point) => translate(resolve(point))));
		faceSlot.push(0);
	}
	const result: Mesh = {
		vertices: nextVertices,
		faces: nextFaces,
		edges: buildEdges(nextFaces),
		radius: computeRadius(nextVertices),
		smooth,
		slots: slots.map((slot) => ({ ...slot })),
		faceSlot,
		groups: [],
	};
	result.groups = buildGroups(result);
	return result;
}

/**
 * Moves the whole positive half along the plane normal.
 *
 * The scissors tool offsets the two halves by a small amount so the cut is
 * clearly visible in the viewport.
 */
export function offsetMesh(mesh: Mesh, offset: Vec3): Mesh {
	return {
		...mesh,
		vertices: mesh.vertices.map((v) => [v[0] + offset[0], v[1] + offset[1], v[2] + offset[2]] as Vec3),
	};
}

/**
 * Classifies every face of a mesh against a plane.
 *
 * Used by the knife mark mode, which keeps a single object but moves the
 * sliced side into its own material slot.
 */
export function classifyFacesByPlane(mesh: Mesh, plane: CutPlane): { positive: number[]; negative: number[] } {
	const length = Math.hypot(plane.normal[0], plane.normal[1], plane.normal[2]) || 1;
	const normal = normalize(plane.normal);
	const dist = plane.dist / length;
	const positive: number[] = [];
	const negative: number[] = [];
	mesh.faces.forEach((face, index) => {
		let above = 0;
		let below = 0;
		for (const vertexIndex of face) {
			const distance = dot(normal, mesh.vertices[vertexIndex]) - dist;
			if (distance > EPSILON) above++;
			if (distance < -EPSILON) below++;
		}
		if (above && !below) positive.push(index);
		else if (below && !above) negative.push(index);
		else if (above && below) {
			// The face straddles the plane: assign it to the side of its centre.
			const centre = faceCentre(mesh, face);
			if (dot(normal, centre) - dist >= 0) positive.push(index);
			else negative.push(index);
		}
	});
	return { positive, negative };
}

/**
 * Extrudes a region of faces along its average normal.
 *
 * Blender's `bmo_extrude` duplicates the selected faces and bridges them with
 * side wall quads. A negative distance pushes the region inwards.
 */
export function extrudeRegion(mesh: Mesh, faceIndices: number[], distance: number): Mesh {
	if (!faceIndices.length) return mesh;
	const selected = new Set(faceIndices);
	const valid = faceIndices.filter((index) => index >= 0 && index < mesh.faces.length);
	if (!valid.length) return mesh;

	let nx = 0;
	let ny = 0;
	let nz = 0;
	for (const index of valid) {
		const face = mesh.faces[index];
		const a = mesh.vertices[face[0]];
		const b = mesh.vertices[face[1]];
		const c = mesh.vertices[face[2]];
		const ux = b[0] - a[0];
		const uy = b[1] - a[1];
		const uz = b[2] - a[2];
		const vx = c[0] - a[0];
		const vy = c[1] - a[1];
		const vz = c[2] - a[2];
		nx += uy * vz - uz * vy;
		ny += uz * vx - ux * vz;
		nz += ux * vy - uy * vx;
	}
	const length = Math.hypot(nx, ny, nz) || 1;
	const normal: Vec3 = [nx / length, ny / length, nz / length];

	const vertices = mesh.vertices.map((v) => [v[0], v[1], v[2]] as Vec3);
	const copyIndex = new Map<number, number>();
	const copyVertex = (index: number): number => {
		const existing = copyIndex.get(index);
		if (existing !== undefined) return existing;
		const v = vertices[index];
		const target = vertices.length;
		vertices.push([v[0] + normal[0] * distance, v[1] + normal[1] * distance, v[2] + normal[2] * distance]);
		copyIndex.set(index, target);
		return target;
	};

	const boundary: [number, number][] = [];
	for (const index of valid) {
		const face = mesh.faces[index];
		for (let i = 0; i < face.length; i++) {
			const a = face[i];
			const b = face[(i + 1) % face.length];
			let shared = 0;
			for (const other of valid) {
				const otherFace = mesh.faces[other];
				for (let j = 0; j < otherFace.length; j++) {
					const p = otherFace[j];
					const q = otherFace[(j + 1) % otherFace.length];
					if ((p === a && q === b) || (p === b && q === a)) shared++;
				}
			}
			if (shared < 2) boundary.push([a, b]);
		}
	}

	const faces: number[][] = [];
	mesh.faces.forEach((face, index) => {
		if (selected.has(index)) faces.push(face.map(copyVertex));
		else faces.push([...face]);
	});
	for (const [a, b] of boundary) faces.push([a, b, copyVertex(b), copyVertex(a)]);

	const result: Mesh = {
		vertices,
		faces,
		edges: buildEdges(faces),
		radius: computeRadius(vertices),
		smooth: mesh.smooth ?? false,
		slots: (mesh.slots ?? []).map((slot) => ({ ...slot })),
		faceSlot: [...(mesh.faceSlot ?? [])],
		groups: [],
	};
	while (result.faceSlot.length < faces.length) result.faceSlot.push(0);
	result.groups = buildGroups(result);
	return result;
}

/** Returns the point of a triangle that sits deepest along the plane normal. */
function faceCentre(mesh: Mesh, face: Face): Vec3 {
	let x = 0;
	let y = 0;
	let z = 0;
	for (const index of face) {
		const vertex = mesh.vertices[index];
		x += vertex[0];
		y += vertex[1];
		z += vertex[2];
	}
	const count = face.length || 1;
	return [x / count, y / count, z / count];
}

export function deepestPoint(mesh: Mesh, face: Face, normal: Vec3): Vec3 {
	void normal;
	return faceCentre(mesh, face);
}

/** Distance from a point to the cutting plane. */
export function signedDistance(plane: CutPlane, point: Vec3): number {
	const length = Math.hypot(plane.normal[0], plane.normal[1], plane.normal[2]) || 1;
	const normal: Vec3 = [plane.normal[0] / length, plane.normal[1] / length, plane.normal[2] / length];
	return dot(normal, point) - plane.dist / length;
}

/** Builds a plane that faces the camera and passes through a world point. */
export function planeFacingCamera(point: Vec3, frame: CameraFrame): CutPlane {
	const normal = normalize(frame.forward);
	return { normal, dist: dot(normal, point) };
}

/** Convenience helper: a plane whose normal is the cross product of two edges. */
export function planeFromEdges(a: Vec3, b: Vec3, c: Vec3): CutPlane {
	const normal = normalize(cross(sub(b, a), sub(c, a)));
	return { normal, dist: dot(normal, a) };
}
