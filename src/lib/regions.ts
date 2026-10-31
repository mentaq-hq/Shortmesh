// Blender edit-mode face region detection.
//
// A tap on a mesh picks one triangle; from there a breadth first flood fill
// walks the triangles that share an edge with it and whose normal still points
// in roughly the same direction. The result is the coplanar portion the user
// marked, which is what the material slots are applied to.

import type { Vec3 } from './math3d';
import { dot } from './math3d';
import type { Mesh } from './mesh';

export const REGION_NORMAL_THRESHOLD = 0.85;

/** Face normal of every face of the mesh. */
export function faceNormals(mesh: Mesh): Vec3[] {
	return mesh.faces.map((face) => {
		const a = mesh.vertices[face[0]];
		const b = mesh.vertices[face[1]];
		const c = mesh.vertices[face[2]];
		const ux = b[0] - a[0];
		const uy = b[1] - a[1];
		const uz = b[2] - a[2];
		const vx = c[0] - a[0];
		const vy = c[1] - a[1];
		const vz = c[2] - a[2];
		const nx = uy * vz - uz * vy;
		const ny = uz * vx - ux * vz;
		const nz = ux * vy - uy * vx;
		const len = Math.hypot(nx, ny, nz) || 1;
		return [nx / len, ny / len, nz / len] as Vec3;
	});
}

function edgeKey(a: number, b: number): string {
	return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** Maps every edge to the faces that use it. */
export function edgeAdjacency(mesh: Mesh): Map<string, number[]> {
	const adjacency = new Map<string, number[]>();
	mesh.faces.forEach((face, faceIndex) => {
		for (let i = 0; i < face.length; i++) {
			const a = face[i];
			const b = face[(i + 1) % face.length];
			const key = edgeKey(a, b);
			const list = adjacency.get(key);
			if (list) list.push(faceIndex);
			else adjacency.set(key, [faceIndex]);
		}
	});
	return adjacency;
}

/**
 * Breadth first flood fill over the coplanar region that contains `startFace`.
 *
 * A neighbouring triangle joins the region when it shares an edge with an
 * already accepted triangle and its normal still satisfies
 * `dot(reference_normal, neighbour_normal) >= threshold`.
 */
export function detectCoplanarRegion(
	mesh: Mesh,
	startFace: number,
	threshold: number = REGION_NORMAL_THRESHOLD,
): number[] {
	if (startFace < 0 || startFace >= mesh.faces.length) return [];
	const normals = faceNormals(mesh);
	const adjacency = edgeAdjacency(mesh);
	const reference = normals[startFace];

	const visited = new Set<number>();
	const region: number[] = [];
	const queue: number[] = [startFace];
	let head = 0;
	visited.add(startFace);

	while (head < queue.length) {
		const faceIndex = queue[head++];
		region.push(faceIndex);
		const face = mesh.faces[faceIndex];
		for (let i = 0; i < face.length; i++) {
			const a = face[i];
			const b = face[(i + 1) % face.length];
			const neighbours = adjacency.get(edgeKey(a, b)) ?? [];
			for (const neighbour of neighbours) {
				if (visited.has(neighbour)) continue;
				if (dot(reference, normals[neighbour]) < threshold) continue;
				visited.add(neighbour);
				queue.push(neighbour);
			}
		}
	}

	return region.sort((a, b) => a - b);
}

/**
 * Builds a standalone mesh that only contains the given faces.
 *
 * The result is used for the glowing selection overlay of a marked portion.
 */
export function regionOverlayMesh(mesh: Mesh, faceIndices: number[]): Mesh {
	const remap = new Map<number, number>();
	const vertices: Vec3[] = [];
	const faces: number[][] = [];

	for (const faceIndex of faceIndices) {
		const face = mesh.faces[faceIndex];
		if (!face) continue;
		const mapped = face.map((index) => {
			const existing = remap.get(index);
			if (existing !== undefined) return existing;
			const target = vertices.length;
			const v = mesh.vertices[index];
			vertices.push([v[0], v[1], v[2]] as Vec3);
			remap.set(index, target);
			return target;
		});
		faces.push(mapped);
	}

	return {
		vertices,
		faces,
		edges: [],
		radius: 0.5,
		smooth: mesh.smooth ?? false,
		slots: (mesh.slots ?? []).map((slot) => ({ ...slot })),
		faceSlot: faces.map((_, index) => mesh.faceSlot?.[faceIndices[index]] ?? 0),
		groups: [],
	};
}
