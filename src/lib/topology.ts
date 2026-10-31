import type { Vec3 } from './math3d';
import { computeRadius, finalizeMesh, type Face, type Mesh } from './mesh';

/**
 * Topology helpers for the editable mesh.
 *
 * The mesh is an indexed polygon soup, so the ring walk below rebuilds the
 * small amount of adjacency it needs instead of keeping a second structure in
 * sync with every edit.
 */

export interface MeshError {
	code: 'empty' | 'not-quad' | 'boundary' | 'degenerate' | 'no-edge' | 'limit';
	message: string;
}

export type LoopCutResult =
	| { ok: true; mesh: Mesh; edges: [number, number][]; faces: number }
	| { ok: false; error: MeshError };

function key(a: number, b: number): string {
	return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function faceKey(face: Face, index: number): string {
	return key(face[index], face[(index + 1) % face.length]);
}

/** edge key -> the faces that use it. */
function edgeFaces(faces: Face[]): Map<string, number[]> {
	const map = new Map<string, number[]>();
	faces.forEach((face, index) => {
		for (let i = 0; i < face.length; i++) {
			const k = faceKey(face, i);
			const bucket = map.get(k);
			if (bucket) bucket.push(index);
			else map.set(k, [index]);
		}
	});
	return map;
}

/** The opposite edge of a quad, or null when the face is not a quad. */
function oppositeEdge(face: Face, edge: string): [number, number] | null {
	if (face.length !== 4) return null;
	for (let i = 0; i < 4; i++) {
		if (faceKey(face, i) === edge) {
			const a = face[(i + 2) % 4];
			const b = face[(i + 3) % 4];
			return [a, b];
		}
	}
	return null;
}

interface RingFace {
	face: number;
	/** The far ring edge of the quad, the one the walk leaves through. */
	a: number;
	b: number;
	/** The edge the walk entered through. It is cut as well. */
	entryA: number;
	entryB: number;
}

/**
 * Cuts a new edge loop across a quad ring.
 *
 * The walk starts from `startEdge`, crosses one quad at a time through the
 * opposite edge, and stops at a boundary, a triangle, a pole or when the ring
 * closes. Every face on the ring is then split into `cuts + 1` quads.
 */
export function loopCut(mesh: Mesh, startEdge: number, cuts = 1): LoopCutResult {
	if (!mesh.faces.length) return { ok: false, error: { code: 'empty', message: 'The mesh has no faces.' } };
	if (!Number.isFinite(cuts) || cuts < 1) {
		return { ok: false, error: { code: 'degenerate', message: 'A loop cut needs at least one cut.' } };
	}
	const count = Math.floor(cuts);
	if (count > 12) {
		return { ok: false, error: { code: 'limit', message: 'At most 12 cuts per loop are supported.' } };
	}
	const edge = mesh.edges[startEdge];
	if (!edge) return { ok: false, error: { code: 'no-edge', message: 'Select an edge to cut across.' } };
	const adjacency = edgeFaces(mesh.faces);
	const startKey = key(edge[0], edge[1]);
	const owners = adjacency.get(startKey);
	if (!owners?.length) return { ok: false, error: { code: 'no-edge', message: 'That edge belongs to no face.' } };

	const ring: RingFace[] = [];
	const visited = new Set<number>();

	const walk = (fromFace: number, fromEdge: string): RingFace[] => {
		const walked: RingFace[] = [];
		let faceIndex = fromFace;
		let edgeKey = fromEdge;
		for (;;) {
			if (visited.has(faceIndex)) break;
			const face = mesh.faces[faceIndex];
			if (face.length !== 4) break;
			const opposite = oppositeEdge(face, edgeKey);
			if (!opposite) break;
			visited.add(faceIndex);
			const entry = mesh.faces[faceIndex].find((_, i) => faceKey(mesh.faces[faceIndex], i) === edgeKey);
			const entryA = entry ?? opposite[0];
			const entryB = mesh.faces[faceIndex][(mesh.faces[faceIndex].indexOf(entryA) + 1) % 4];
			walked.push({ face: faceIndex, a: opposite[0], b: opposite[1], entryA, entryB });
			const nextKey = key(opposite[0], opposite[1]);
			const nextOwners = adjacency.get(nextKey) ?? [];
			const nextFace = nextOwners.find((index) => index !== faceIndex);
			if (nextFace === undefined) break;
			faceIndex = nextFace;
			edgeKey = nextKey;
		}
		return walked;
	};

	// Both sides of the starting edge, otherwise the loop stops at the seam.
	const firstSide = walk(owners[0], startKey);
	const secondSide = owners.length > 1 ? walk(owners[1], startKey) : [];
	ring.push(...firstSide.reverse(), ...secondSide);
	if (!ring.length) {
		return { ok: false, error: { code: 'not-quad', message: 'Loop cut needs a ring of quads.' } };
	}

	// New vertices, one row per ring edge.
	const vertices: Vec3[] = mesh.vertices.map((vertex) => [vertex[0], vertex[1], vertex[2]] as Vec3);
	const insertions = new Map<string, number[]>();
	const cut = (a: number, b: number) => {
		const k = key(a, b);
		const existing = insertions.get(k);
		if (existing) return existing;
		const from = mesh.vertices[a];
		const to = mesh.vertices[b];
		const row: number[] = [];
		for (let i = 1; i <= count; i++) {
			const t = i / (count + 1);
			row.push(vertices.length);
			vertices.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t]);
		}
		insertions.set(k, row);
		return row;
	};

	for (const item of ring) {
		cut(item.a, item.b);
		cut(item.entryA, item.entryB);
	}

	/** The inserted vertices of an edge, ordered from `from` to `to`. */
	const rowFrom = (edgeA: number, edgeB: number): number[] => {
		const row = insertions.get(key(edgeA, edgeB)) ?? [];
		return edgeA < edgeB ? row : [...row].reverse();
	};

	const faces: Face[] = [];
	const faceSlot: number[] = [];
	const ringFaces = new Set(ring.map((item) => item.face));
	mesh.faces.forEach((face, index) => {
		if (!ringFaces.has(index)) {
			faces.push([...face]);
			faceSlot.push(mesh.faceSlot?.[index] ?? 0);
		}
	});

	for (const item of ring) {
		const face = mesh.faces[item.face];
		const slot = mesh.faceSlot?.[item.face] ?? 0;
		// The two ring edges are opposite, so the cycle is A, a, B, b.
		const index = face.findIndex((_, i) => faceKey(face, i) === key(item.a, item.b));
		const i1 = index < 0 ? 0 : index;
		const i2 = (i1 + 2) % 4;
		const a0 = face[i1];
		const a1 = face[(i1 + 1) % 4];
		const b0 = face[i2];
		const b1 = face[(i2 + 1) % 4];
		const aRow = rowFrom(a0, a1);
		const bRow = rowFrom(b0, b1);
		if (aRow.length !== count || bRow.length !== count) continue;

		const A = [a0, ...aRow, a1];
		const B = [b0, ...bRow, b1];
		for (let strip = 1; strip <= count + 1; strip++) {
			const quad: Face = [A[strip - 1], A[strip], B[count + 1 - strip], B[count + 2 - strip]];
			const unique = new Set(quad);
			if (unique.size < 4) continue;
			faces.push(quad);
			faceSlot.push(slot);
		}
	}

	const next = finalizeMesh({ vertices, faces, faceSlot, slots: mesh.slots, smooth: mesh.smooth ?? false }, mesh.smooth ?? false);
	next.radius = computeRadius(next.vertices);

	// The new loop edges are those whose both ends are inserted points.
	const inserted = new Set([...insertions.values()].flat());
	const loopEdges = next.edges.filter(([a, b]) => inserted.has(a) && inserted.has(b));
	return { ok: true, mesh: next, edges: loopEdges, faces: ring.length };
}

export interface BevelResult {
	ok: true;
	mesh: Mesh;
	vertices: number;
	faces: number;
}

/**
 * Chamfers the selected corners.
 *
 * Every incident edge of a corner gets one point a short way along it, the
 * corner is replaced by those points inside each face, and the points are
 * joined into a new face. The offset is clamped to 45% of the shortest
 * incident edge so the points of two neighbouring corners can never cross.
 *
 * This is a corner bevel: it does not create rounded edge strips, so it is
 * reported as such instead of pretending to be a full edge bevel.
 */
export function bevelVertices(mesh: Mesh, vertexIndices: number[], width: number, segments = 1): BevelResult | { ok: false; error: MeshError } {
	if (!vertexIndices.length) return { ok: false, error: { code: 'empty', message: 'Select at least one vertex to bevel.' } };
	if (!Number.isFinite(width) || width <= 0) {
		return { ok: false, error: { code: 'degenerate', message: 'The bevel width must be a positive number.' } };
	}
	if (segments < 1 || !Number.isFinite(segments)) {
		return { ok: false, error: { code: 'degenerate', message: 'The segment count must be at least one.' } };
	}
	const selected = new Set(vertexIndices.filter((index) => mesh.vertices[index]));
	if (!selected.size) return { ok: false, error: { code: 'empty', message: 'None of the selected vertices exist.' } };

	const vertices: Vec3[] = mesh.vertices.map((vertex) => [vertex[0], vertex[1], vertex[2]] as Vec3);
	const incident = new Map<number, number[]>();
	mesh.faces.forEach((face, faceIndex) => {
		for (const index of face) {
			if (!selected.has(index)) continue;
			const bucket = incident.get(index);
			if (bucket) bucket.push(faceIndex);
			else incident.set(index, [faceIndex]);
		}
	});

	// One point per incident edge, shared by the faces on both sides.
	const offsets = new Map<string, number>();
	const cornerPoints = new Map<number, number[]>();
	const cornerNormal = new Map<number, Vec3>();

	for (const corner of selected) {
		const faces = incident.get(corner) ?? [];
		if (faces.length < 3) continue;
		const points: number[] = [];
		const normal: Vec3 = [0, 0, 0];
		for (const faceIndex of faces) {
			const face = mesh.faces[faceIndex];
			const at = face.indexOf(corner);
			if (at < 0) continue;
			const prev = face[(at - 1 + face.length) % face.length];
			const next = face[(at + 1) % face.length];
			for (const other of [prev, next]) {
				// Each end of an edge gets its own point: two neighbouring
				// corners must not share one offset.
				const k = `${corner}:${other}`;
				if (offsets.has(k)) continue;
				const from = mesh.vertices[corner];
				const to = mesh.vertices[other];
				const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
				if (length < 1e-9) continue;
				const distance = Math.min(width, length * 0.45);
				const t = distance / length;
				const index = vertices.length;
				vertices.push([
					from[0] + (to[0] - from[0]) * t,
					from[1] + (to[1] - from[1]) * t,
					from[2] + (to[2] - from[2]) * t,
				]);
				offsets.set(k, index);
				points.push(index);
			}
		}
		if (points.length < 3) continue;
		cornerPoints.set(corner, [...new Set(points)]);

		// The average of the incident face normals orients the new cap.
		for (const faceIndex of faces) {
			const face = mesh.faces[faceIndex];
			const at = face.indexOf(corner);
			if (at < 0) continue;
			const a = mesh.vertices[face[(at - 1 + face.length) % face.length]];
			const b = mesh.vertices[corner];
			const c = mesh.vertices[face[(at + 1) % face.length]];
			const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
			const v: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
			const cross: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
			normal[0] += cross[0];
			normal[1] += cross[1];
			normal[2] += cross[2];
		}
		cornerNormal.set(corner, normal);
	}

	if (!cornerPoints.size) {
		return { ok: false, error: { code: 'degenerate', message: 'Those corners have too few surrounding faces.' } };
	}

	const pointOf = (a: number, b: number) => offsets.get(`${a}:${b}`);

	const faces: Face[] = [];
	const faceSlot: number[] = [];
	mesh.faces.forEach((face, faceIndex) => {
		const slot = mesh.faceSlot?.[faceIndex] ?? 0;
		let any = false;
		const rebuilt: number[] = [];
		for (let i = 0; i < face.length; i++) {
			const vertex = face[i];
			if (!cornerPoints.has(vertex)) {
				rebuilt.push(vertex);
				continue;
			}
			const prev = face[(i - 1 + face.length) % face.length];
			const next = face[(i + 1) % face.length];
			const before = pointOf(vertex, prev);
			const after = pointOf(vertex, next);
			if (before === undefined || after === undefined) {
				rebuilt.push(vertex);
				continue;
			}
			any = true;
			rebuilt.push(before, after);
		}
		if (!any) {
			faces.push([...face]);
			faceSlot.push(slot);
			return;
		}
		if (new Set(rebuilt).size >= 3) {
			faces.push(rebuilt);
			faceSlot.push(slot);
		}
	});

	for (const [corner, points] of cornerPoints) {
		const normal = cornerNormal.get(corner) ?? [0, 1, 0];
		const length = Math.hypot(normal[0], normal[1], normal[2]) || 1;
		const n: Vec3 = [normal[0] / length, normal[1] / length, normal[2] / length];
		const helper: Vec3 = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
		const right: Vec3 = [n[1] * helper[2] - n[2] * helper[1], n[2] * helper[0] - n[0] * helper[2], n[0] * helper[1] - n[1] * helper[0]];
		const rightLength = Math.hypot(right[0], right[1], right[2]) || 1;
		const u: Vec3 = [right[0] / rightLength, right[1] / rightLength, right[2] / rightLength];
		const v: Vec3 = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
		const origin = mesh.vertices[corner];
		const ring = [...new Set(points)].sort((a, b) => {
			const pa = vertices[a];
			const pb = vertices[b];
			const da = Math.atan2(
				(pa[0] - origin[0]) * v[0] + (pa[1] - origin[1]) * v[1] + (pa[2] - origin[2]) * v[2],
				(pa[0] - origin[0]) * u[0] + (pa[1] - origin[1]) * u[1] + (pa[2] - origin[2]) * u[2],
			);
			const db = Math.atan2(
				(pb[0] - origin[0]) * v[0] + (pb[1] - origin[1]) * v[1] + (pb[2] - origin[2]) * v[2],
				(pb[0] - origin[0]) * u[0] + (pb[1] - origin[1]) * u[1] + (pb[2] - origin[2]) * u[2],
			);
			return da - db;
		});
		if (ring.length >= 3) {
			faces.push(ring);
			faceSlot.push(mesh.faceSlot?.[incident.get(corner)?.[0] ?? 0] ?? 0);
		}
	}

	// The bevelled corners are gone; drop them instead of leaving unused
	// vertices behind for picking and export to trip over.
	const used = new Map<number, number>();
	const compactVertices: Vec3[] = [];
	const remap = (index: number): number => {
		const found = used.get(index);
		if (found !== undefined) return found;
		const next = compactVertices.length;
		used.set(index, next);
		compactVertices.push(vertices[index]);
		return next;
	};
	const compactFaces = faces.map((face) => face.map(remap));

	const next = finalizeMesh(
		{ vertices: compactVertices, faces: compactFaces, faceSlot, slots: mesh.slots, smooth: mesh.smooth ?? false },
		mesh.smooth ?? false,
	);
	next.radius = computeRadius(next.vertices);
	return { ok: true, mesh: next, vertices: cornerPoints.size, faces: next.faces.length };
}
