import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cubeMesh } from '../src/lib/mesh.ts';

test('cube has faces', () => {
	const mesh = cubeMesh();
	assert.ok(mesh.vertices.length >= 8);
	assert.ok(mesh.faces.length >= 6);
});
