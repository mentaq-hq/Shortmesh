import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import {
	cubeMesh,
	planeMesh,
	cylinderMesh,
	sphereMesh,
	finalizeMesh,
	bridgeEdgeLoops,
	mergeVertices,
	deleteGeometry,
	dissolveGeometry,
	duplicateMeshGeometry,
	separateGeometry,
	mirrorMesh,
	decimateMesh,
	screwSpinMesh,
	booleanMesh,
	joinMeshes,
	type Mesh,
	type Face,
} from '../src/lib/mesh.ts';
import type { Vec3 } from '../src/lib/math3d.ts';
import { sceneStore } from '../src/stores/scene.ts';
import { toolStore } from '../src/stores/tools.ts';

test('bridgeEdgeLoops connects two rings of vertices with quads', () => {
	const plane1 = planeMesh();
	const plane2 = planeMesh();
	const p2Verts = plane2.vertices.map((v) => [v[0], v[1] + 2, v[2]] as Vec3);
	const combined = finalizeMesh({
		vertices: [...plane1.vertices, ...p2Verts],
		faces: [[0, 1, 2, 3], [4, 5, 6, 7]],
		edges: [],
		radius: 0,
	});
	assert.equal(combined.faces.length, 2);

	const bridged = bridgeEdgeLoops(combined, [0, 1, 2, 3], [4, 5, 6, 7]);
	assert.equal(bridged.faces.length, 6);
});

test('mergeVertices collapses selected vertices at center, first, last, and distance', () => {
	const cube = cubeMesh();
	assert.equal(cube.vertices.length, 8);

	const mergedCenter = mergeVertices(cube, [0, 1], 'center');
	assert.equal(mergedCenter.vertices.length, 7);
	assert.ok(mergedCenter.faces.every((f) => f.length >= 3));

	const mergedFirst = mergeVertices(cube, [0, 1], 'first');
	assert.equal(mergedFirst.vertices.length, 7);

	const mergedDist = mergeVertices(cube, [0, 1], 'distance', 10.0);
	assert.equal(mergedDist.vertices.length, 7);
});

test('deleteGeometry removes vertices, edges, or faces cleanly without corrupting mesh', () => {
	const cube = cubeMesh();
	const delFace = deleteGeometry(cube, 'face', [0]);
	assert.equal(delFace.faces.length, 5);

	const delVert = deleteGeometry(cube, 'vertex', [0]);
	assert.ok(delVert.faces.length < 6);
	assert.ok(delVert.vertices.every((v) => v !== undefined));
});

test('dissolveGeometry merges faces when dissolving shared edge', () => {
	const cube = cubeMesh();
	const edgeIdx = 0;
	const dissolved = dissolveGeometry(cube, 'edge', [edgeIdx]);
	assert.ok(dissolved.faces.length < cube.faces.length);
});

test('duplicateMeshGeometry clones geometry in Edit mode and keeps new parts selected', () => {
	const cube = cubeMesh();
	const dup = duplicateMeshGeometry(cube, 'face', [0]);
	assert.equal(dup.mesh.faces.length, 7);
	assert.equal(dup.newFaceIndices.length, 1);
	assert.ok(dup.newVertexIndices.length > 0);
});

test('separateGeometry splits mesh into remaining and separated parts', () => {
	const cube = cubeMesh();
	const sep = separateGeometry(cube, [0]);
	assert.equal(sep.remainingMesh.faces.length, 5);
	assert.equal(sep.separatedMesh.faces.length, 1);
});

test('mirrorMesh mirrors mesh across X axis and welds near center', () => {
	const cube = cubeMesh();
	const mirrored = mirrorMesh(cube, 'x');
	assert.equal(mirrored.faces.length, 12);
});

test('decimateMesh simplifies geometry to target face count', () => {
	const cyl = cylinderMesh(16);
	const initialFaces = cyl.faces.length;
	const decimated = decimateMesh(cyl, 0.5);
	assert.ok(decimated.faces.length < initialFaces);
});

test('screwSpinMesh revolves geometry into cylindrical/helical form', () => {
	const plane = planeMesh();
	const spun = screwSpinMesh(plane, 'z', 360, 8, 1);
	assert.ok(spun.faces.length > plane.faces.length);
	assert.ok(spun.vertices.length > plane.vertices.length);
});

test('booleanMesh computes union, difference, and intersect', () => {
	const c1 = cubeMesh();
	const c2 = cubeMesh();
	c2.vertices.forEach((v) => { v[0] += 0.5; });
	const diff = booleanMesh(c1, c2, 'difference');
	assert.ok(diff.faces.length > 0);
	const union = booleanMesh(c1, c2, 'union');
	assert.ok(union.faces.length > 0);
});

test('joinMeshes merges multiple objects into a single mesh', () => {
	const c1 = cubeMesh();
	const c2 = cubeMesh();
	const joined = joinMeshes([
		{ mesh: c1, position: [0, 0, 0] },
		{ mesh: c2, position: [3, 0, 0] },
	]);
	assert.equal(joined.faces.length, 12);
	assert.equal(joined.vertices.length, 16);
});

test('sceneStore Selection Tools: selectLinked, selectLoop, selectRing, invertSelection, selectSimilar', () => {
	sceneStore.clear();
	sceneStore.addPrimitive('cube');
	const objId = get(sceneStore).selectedId!;
	sceneStore.setEditMode(true);
	sceneStore.setElementMode('vertex');
	sceneStore.selectElement('vertex', 0);

	// Invert selection
	sceneStore.invertSelection();
	let state = get(sceneStore);
	assert.equal(state.selectedVertices.length, 7);

	// Select Linked
	sceneStore.selectLinked();
	state = get(sceneStore);
	assert.equal(state.selectedVertices.length, 8);

	// Select Similar
	sceneStore.selectElement('vertex', 0);
	sceneStore.selectSimilar('valence');
	state = get(sceneStore);
	assert.equal(state.selectedVertices.length, 8); // All cube vertices have valence 3
});

test('sceneStore Object Tools: setOrigin, applyTransformation, clearTransformation, setParent', () => {
	sceneStore.clear();
	sceneStore.addPrimitive('cube');
	const objId = get(sceneStore).selectedId!;
	sceneStore.setTransform(objId, { position: [2, 3, 4], scale: [2, 2, 2] });

	// Apply Transformation
	sceneStore.applyTransformation('all');
	let obj = get(sceneStore).objects.find((o) => o.id === objId)!;
	assert.deepEqual(obj.position, [0, 0, 0]);
	assert.deepEqual(obj.scale, [1, 1, 1]);
	assert.ok(obj.geometry!.vertices.some((v) => v[0] > 1));

	// Clear Transformation
	sceneStore.setTransform(objId, { position: [5, 5, 5] });
	sceneStore.clearTransformation('location');
	obj = get(sceneStore).objects.find((o) => o.id === objId)!;
	assert.deepEqual(obj.position, [0, 0, 0]);

	// Set Parent / Clear Parent
	sceneStore.addPrimitive('sphere');
	const childId = get(sceneStore).selectedId!;
	sceneStore.setParent(childId, objId);
	let child = get(sceneStore).objects.find((o) => o.id === childId)!;
	let parent = get(sceneStore).objects.find((o) => o.id === objId)!;
	assert.equal(child.parent, objId);
	assert.ok(parent.children.includes(childId));

	sceneStore.clearParent(childId);
	child = get(sceneStore).objects.find((o) => o.id === childId)!;
	parent = get(sceneStore).objects.find((o) => o.id === objId)!;
	assert.equal(child.parent, undefined);
	assert.ok(!parent.children.includes(childId));
});

test('sceneStore meshOp extensions: bridge, merge, dissolve, decimate, mirror, screw', () => {
	sceneStore.clear();
	sceneStore.addPrimitive('cube');
	const objId = get(sceneStore).selectedId!;
	sceneStore.setEditMode(true);

	// Decimate
	sceneStore.meshOp('decimate', { ratio: 0.5 });
	let obj = get(sceneStore).objects.find((o) => o.id === objId)!;
	assert.ok(obj.geometry!.faces.length > 0);

	// Undo restores
	sceneStore.undo();
	obj = get(sceneStore).objects.find((o) => o.id === objId)!;
	assert.equal(obj.geometry!.faces.length, 6);

	// Mirror
	sceneStore.meshOp('mirror', { axis: 'x' });
	obj = get(sceneStore).objects.find((o) => o.id === objId)!;
	assert.equal(obj.geometry!.faces.length, 12);

	// Undo restores
	sceneStore.undo();
	obj = get(sceneStore).objects.find((o) => o.id === objId)!;
	assert.equal(obj.geometry!.faces.length, 6);
});
