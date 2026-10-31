import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cubeMesh, type Mesh } from '../src/lib/mesh.ts';
import { bevelVertices } from '../src/lib/topology.ts';

function invariant(mesh: Mesh, label: string) {
	for (const face of mesh.faces) {
		assert.ok(face.length >= 3, `${label}: short face`);
		assert.equal(new Set(face).size, face.length, `${label}: repeated vertex in a face`);
		for (const index of face) assert.ok(index >= 0 && index < mesh.vertices.length, `${label}: index out of range`);
	}
	assert.equal(mesh.faceSlot.length, mesh.faces.length, `${label}: slot table drifted`);
}

test('bevelling every corner of a cube closes the surface', () => {
	const mesh = cubeMesh();
	const result = bevelVertices(mesh, mesh.vertices.map((_, index) => index), 0.2);
	assert.ok(result.ok, result.ok ? '' : result.error.message);
	if (!result.ok) return;
	assert.equal(result.vertices, 8);
	assert.equal(result.mesh.vertices.length, 24, 'three points per corner');
	assert.equal(result.mesh.faces.length, 14, 'six faces plus eight caps');
	invariant(result.mesh, 'cube-bevel');
	// Euler characteristic: V - E + F = 2 for a closed surface.
	assert.equal(result.mesh.vertices.length - result.mesh.edges.length + result.mesh.faces.length, 2);
});

test('a wide bevel is clamped instead of crossing nearby corners', () => {
	const mesh = cubeMesh();
	const result = bevelVertices(mesh, [0, 1], 100);
	assert.ok(result.ok);
	if (!result.ok) return;
	invariant(result.mesh, 'clamped');
	for (const face of result.mesh.faces) {
		const points = face.map((index) => result.mesh.vertices[index]);
		const area = points.reduce((sum, point, index) => {
			const next = points[(index + 1) % points.length];
			return sum + point[0] * next[2] - next[0] * point[2];
		}, 0);
		assert.ok(Number.isFinite(area), 'a clamped bevel produced a NaN face');
	}
});

test('invalid input is rejected and the scene is untouched', () => {
	const mesh = cubeMesh();
	const before = JSON.stringify(mesh);
	assert.equal(bevelVertices(mesh, [], 0.1).ok, false);
	assert.equal(bevelVertices(mesh, [0], 0).ok, false);
	assert.equal(bevelVertices(mesh, [0], Number.NaN).ok, false);
	assert.equal(bevelVertices(mesh, [999], 0.1).ok, false);
	assert.equal(JSON.stringify(mesh), before, 'a rejected bevel must not mutate the input');
});
