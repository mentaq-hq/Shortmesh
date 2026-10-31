import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMeshBVH, meshBVH, raycastBVH, verticesInSphere } from '../src/lib/bvh.ts';
import { rayTriangle } from '../src/lib/picking.ts';
import { cubeMesh, sphereMesh, type Mesh } from '../src/lib/mesh.ts';
import type { Vec3 } from '../src/lib/math3d.ts';

function bruteForce(mesh: Mesh, origin: Vec3, dir: Vec3): number | null {
	let best: number | null = null;
	for (const face of mesh.faces) {
		for (let i = 1; i < face.length - 1; i++) {
			const t = rayTriangle(origin, dir, mesh.vertices[face[0]], mesh.vertices[face[i]], mesh.vertices[face[i + 1]]);
			if (t === null) continue;
			if (best === null || t < best) best = t;
		}
	}
	return best;
}

function normalize(v: Vec3): Vec3 {
	const length = Math.hypot(v[0], v[1], v[2]) || 1;
	return [v[0] / length, v[1] / length, v[2] / length];
}

test('the BVH hits the same triangle as a full scan', () => {
	const mesh = sphereMesh(24, 16);
	const bvh = buildMeshBVH(mesh);
	let hits = 0;
	for (let i = 0; i < 200; i++) {
		const angle = i * 0.37;
		const height = -1 + (i / 200) * 2;
		const origin: Vec3 = [Math.cos(angle) * 4, height * 1.5, Math.sin(angle) * 4];
		const dir = normalize([-origin[0], -origin[1] * 0.4, -origin[2]]);
		const expected = bruteForce(mesh, origin, dir);
		const actual = raycastBVH(bvh, { origin, dir });
		if (expected === null) {
			assert.equal(actual, null, `ray ${i} should miss`);
			continue;
		}
		hits++;
		assert.ok(actual, `ray ${i} should hit`);
		assert.ok(Math.abs(actual.t - expected) < 1e-4, `ray ${i}: ${actual.t} vs ${expected}`);
	}
	assert.ok(hits > 100, `expected a good share of rays to hit, got ${hits}`);
});

test('rays that miss the mesh do not walk every triangle', () => {
	const mesh = cubeMesh();
	const bvh = buildMeshBVH(mesh);
	assert.equal(raycastBVH(bvh, { origin: [5, 5, 5], dir: normalize([1, 1, 1]) }), null);
	assert.equal(raycastBVH(bvh, { origin: [0, 0, 5], dir: [0, 1e-14, -1] }).t > 0, true);
});

test('degenerate triangles never report a hit', () => {
	const mesh: Mesh = {
		vertices: [
			[0, 0, 0],
			[1, 0, 0],
			[2, 0, 0],
		],
		faces: [[0, 1, 2]],
		edges: [],
		radius: 1,
	};
	const bvh = buildMeshBVH(mesh);
	assert.equal(raycastBVH(bvh, { origin: [0.5, 1, 0], dir: [0, -1, 0] }), null);
});

test('an empty mesh is safe to build and query', () => {
	const mesh: Mesh = { vertices: [], faces: [], edges: [], radius: 0 };
	const bvh = buildMeshBVH(mesh);
	assert.equal(bvh.triangleCount, 0);
	assert.equal(raycastBVH(bvh, { origin: [0, 0, 0], dir: [0, 0, -1] }), null);
	assert.deepEqual(verticesInSphere(bvh, [0, 0, 0], [], 1), []);
});

test('a sphere query matches a linear scan', () => {
	const mesh = sphereMesh(20, 12);
	const bvh = buildMeshBVH(mesh);
	const centre: Vec3 = [0.2, 0.1, 0.05];
	const radius = 0.45;
	const found = new Set(verticesInSphere(bvh, centre, mesh.vertices, radius));
	const expected = new Set<number>();
	mesh.vertices.forEach((vertex, index) => {
		const dx = vertex[0] - centre[0];
		const dy = vertex[1] - centre[1];
		const dz = vertex[2] - centre[2];
		if (dx * dx + dy * dy + dz * dz <= radius * radius) expected.add(index);
	});
	assert.deepEqual([...found].sort((a, b) => a - b), [...expected].sort((a, b) => a - b));
});

test('the cache rebuilds when the geometry version moves', () => {
	const mesh = cubeMesh();
	const first = meshBVH(mesh, 1);
	assert.equal(meshBVH(mesh, 1), first);
	const second = meshBVH(mesh, 2);
	assert.notEqual(second, first);
});

test('large meshes stay fast enough to pick every pointer move', () => {
	const mesh = sphereMesh(120, 80);
	const bvh = buildMeshBVH(mesh);
	assert.ok(bvh.triangleCount > 15000, `mesh has ${bvh.triangleCount} triangles`);
	const origin: Vec3 = [0, 0, 4];
	const dir: Vec3 = [0, 0, -1];
	const started = performance.now();
	let hits = 0;
	for (let i = 0; i < 2000; i++) {
		if (raycastBVH(bvh, { origin, dir })) hits++;
	}
	const perQuery = (performance.now() - started) / 2000;
	assert.equal(hits, 2000);
	assert.ok(perQuery < 1, `BVH query took ${perQuery.toFixed(3)}ms`);
});

test('the hierarchy agrees with a full scan on a sphere', () => {
	// Regression: triangle corners were once rounded to float32 inside the
	// hierarchy, so grazing rays hit slivers the exact geometry misses.
	const mesh = sphereMesh(36, 22);
	const bvh = buildMeshBVH(mesh);
	for (let i = 0; i < 240; i++) {
		const angle = (i / 240) * Math.PI * 2;
		const origin: Vec3 = [Math.cos(angle) * 4, Math.sin(i * 1.7) * 1.4, Math.sin(angle) * 4];
		const length = Math.hypot(origin[0], origin[1], origin[2]);
		const dir: Vec3 = [-origin[0] / length, -origin[1] / length, -origin[2] / length];
		const expected = bruteForce(mesh, origin, dir);
		const hit = raycastBVH(bvh, { origin, dir });
		if (expected === null) {
			assert.equal(hit, null, `ray ${i} should miss`);
			continue;
		}
		assert.ok(hit, `ray ${i} should hit`);
		assert.ok(Math.abs(hit.t - expected) < 1e-9, `ray ${i}: ${hit.t} vs ${expected}`);
		// The reported triangle must be the one the ray actually crossed.
		const at = hit.triangle * 9;
		const inside = rayTriangle(
			origin,
			dir,
			[bvh.positions[at], bvh.positions[at + 1], bvh.positions[at + 2]],
			[bvh.positions[at + 3], bvh.positions[at + 4], bvh.positions[at + 5]],
			[bvh.positions[at + 6], bvh.positions[at + 7], bvh.positions[at + 8]],
		);
		assert.ok(inside !== null && Math.abs(inside - hit.t) < 1e-9, `ray ${i}: wrong triangle`);
	}
});
