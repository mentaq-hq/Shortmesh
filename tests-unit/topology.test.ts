import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cubeMesh, planeMesh, subdivide, type Mesh } from '../src/lib/mesh.ts';
import { loopCut } from '../src/lib/topology.ts';

function invariant(mesh: Mesh, label: string) {
	for (const face of mesh.faces) {
		assert.ok(face.length >= 3, `${label}: a face has fewer than three corners`);
		assert.equal(new Set(face).size, face.length, `${label}: a face repeats a vertex`);
		for (const index of face) {
			assert.ok(index >= 0 && index < mesh.vertices.length, `${label}: face index ${index} out of range`);
		}
	}
	for (const [a, b] of mesh.edges) {
		assert.ok(a < mesh.vertices.length && b < mesh.vertices.length, `${label}: edge out of range`);
	}
	assert.ok(Number.isFinite(mesh.radius) && mesh.radius > 0, `${label}: radius is not finite`);
}

test('a loop cut splits every quad of the ring', () => {
	const mesh = cubeMesh();
	const result = loopCut(mesh, 0, 1);
	assert.ok(result.ok, result.ok ? '' : result.error.message);
	if (!result.ok) return;
	assert.equal(result.faces, 4, 'a cube ring crosses four quads');
	assert.equal(result.mesh.vertices.length, mesh.vertices.length + 4);
	assert.equal(result.mesh.faces.length, mesh.faces.length + 4);
	assert.equal(result.edges.length, 4);
	invariant(result.mesh, 'cube');
});

test('two cuts make three strips per face', () => {
	const mesh = cubeMesh();
	const result = loopCut(mesh, 0, 2);
	assert.ok(result.ok);
	if (!result.ok) return;
	assert.equal(result.mesh.vertices.length, mesh.vertices.length + 8);
	assert.equal(result.mesh.faces.length, mesh.faces.length + 8);
	invariant(result.mesh, 'cube-2');
});

test('an open plane is cut once and stops at the boundary', () => {
	const mesh = planeMesh();
	const result = loopCut(mesh, 0, 1);
	assert.ok(result.ok);
	if (!result.ok) return;
	assert.equal(result.faces, 1, 'the plane has a single quad');
	assert.equal(result.mesh.faces.length, 2);
	invariant(result.mesh, 'plane');
});

test('a triangle ring is rejected instead of being corrupted', () => {
	const mesh: Mesh = {
		vertices: [
			[0, 0, 0],
			[1, 0, 0],
			[0, 1, 0],
		],
		faces: [[0, 1, 2]],
		edges: [[0, 1]],
		radius: 1,
		slots: [],
		faceSlot: [0],
		groups: [],
	};
	const result = loopCut(mesh, 0, 1);
	assert.equal(result.ok, false);
	if (!result.ok) assert.equal(result.error.code, 'not-quad');
});

test('invalid parameters are rejected', () => {
	const mesh = cubeMesh();
	assert.equal(loopCut(mesh, 0, 0).ok, false);
	assert.equal(loopCut(mesh, 0, Number.NaN).ok, false);
	assert.equal(loopCut(mesh, 0, 99).ok, false);
	assert.equal(loopCut(mesh, 500, 1).ok, false);
});

test('a cut mesh can be cut again and stays valid', () => {
	const mesh = cubeMesh();
	const first = loopCut(mesh, 0, 1);
	assert.ok(first.ok);
	if (!first.ok) return;
	const second = loopCut(first.mesh, 0, 1);
	assert.ok(second.ok, second.ok ? '' : second.error.message);
	if (!second.ok) return;
	invariant(second.mesh, 'cube-twice');
});

test('a subdivided mesh keeps its material assignment', () => {
	const base = cubeMesh();
	const mesh = subdivide(base, false);
	const result = loopCut(mesh, 0, 1);
	assert.ok(result.ok);
	if (!result.ok) return;
	assert.equal(result.mesh.faceSlot.length, result.mesh.faces.length);
	for (const slot of result.mesh.faceSlot) assert.ok(Number.isInteger(slot) && slot >= 0);
	invariant(result.mesh, 'subdivided');
});
