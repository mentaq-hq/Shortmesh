import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { sceneStore } from '../src/stores/scene.ts';
import { timelineStore } from '../src/stores/timeline.ts';
import { exportSceneToOBJ, exportSceneToSTL, parseOBJ, parseSTL } from '../src/lib/io3d.ts';
import {
	cubeMesh,
	sphereMesh,
	cylinderMesh,
	coneMesh,
	torusMesh,
	planeMesh,
	coinMesh,
	boneMesh,
	faceNormal,
	faceCenter,
} from '../src/lib/mesh.ts';

test('All 3D primitives have 100% outward-pointing CCW normals and high-resolution geometry', () => {
	const primitives = [
		['cube', cubeMesh()],
		['sphere', sphereMesh()],
		['cylinder', cylinderMesh()],
		['cone', coneMesh()],
		['torus', torusMesh()],
		['plane', planeMesh()],
		['coin', coinMesh()],
		['bone', boneMesh()],
	] as const;

	for (const [name, mesh] of primitives) {
		assert.ok(mesh.vertices.length >= 4, `${name} has vertices`);
		assert.ok(mesh.faces.length >= 1, `${name} has faces`);
		for (let i = 0; i < mesh.faces.length; i++) {
			const f = mesh.faces[i];
			const n = faceNormal(mesh, f);
			const c = faceCenter(mesh, f);
			let dot: number;
			if (name === 'plane') {
				dot = n[1];
			} else if (name === 'torus') {
				const rXZ = Math.hypot(c[0], c[2]) || 1;
				const tubeCenter = [(c[0] / rXZ) * 0.35, 0, (c[2] / rXZ) * 0.35];
				dot = n[0] * (c[0] - tubeCenter[0]) + n[1] * (c[1] - tubeCenter[1]) + n[2] * (c[2] - tubeCenter[2]);
			} else {
				dot = n[0] * c[0] + n[1] * c[1] + n[2] * c[2];
			}
			assert.ok(dot > 0, `${name} face ${i} must point outward (dot=${dot})`);
		}
	}
	assert.ok(sphereMesh().faces.length >= 1000, 'sphere is high-resolution');
	assert.ok(cylinderMesh().faces.length >= 50, 'cylinder is high-resolution');
	assert.ok(coinMesh().faces.length >= 50, 'coin/round plate is high-resolution');
});

test('Array, Solidify, Smooth, UV Unwrap and Vertex Bake modifiers work and undo cleanly', () => {
	sceneStore.clear();
	sceneStore.addPrimitive('cube');
	const obj0 = get(sceneStore).objects[0];
	assert.ok(obj0);
	const baseVerts = 8;

	// Array modifier (3 copies -> 24 vertices)
	assert.equal(sceneStore.meshOp('array', { amount: 3 }), null);
	assert.equal(get(sceneStore).objects[0].geometry?.vertices.length, baseVerts * 3);

	// Undo restores original cube
	sceneStore.undo();
	assert.equal(get(sceneStore).objects[0].geometry?.vertices.length ?? baseVerts, baseVerts);

	// Solidify modifier doubles vertices into inner + outer shell
	assert.equal(sceneStore.meshOp('solidify', { amount: 0.15 }), null);
	assert.equal(get(sceneStore).objects[0].geometry?.vertices.length, baseVerts * 2);

	// Smooth modifier relaxes vertices without changing count
	assert.equal(sceneStore.meshOp('smooth', { amount: 2 }), null);
	assert.equal(get(sceneStore).objects[0].geometry?.vertices.length, baseVerts * 2);

	// UV unwrap modes populate explicit per-vertex UVs
	for (const mode of ['unwrap-box', 'unwrap-planar', 'unwrap-cylindrical', 'unwrap-spherical']) {
		assert.equal(sceneStore.meshOp(mode), null);
		const mesh = get(sceneStore).objects[0].geometry!;
		assert.equal(mesh.uvs?.length, mesh.vertices.length);
	}

	// Vertex color baking modes populate RGB vertex colors
	for (const bake of ['bake-ao', 'bake-light', 'bake-gradient', 'bake-curvature']) {
		assert.equal(sceneStore.meshOp(bake), null);
		const mesh = get(sceneStore).objects[0].geometry!;
		assert.equal(mesh.colors?.length, mesh.vertices.length * 3);
	}
});

test('Edit Mode element translation moves selected vertices and records undo', () => {
	sceneStore.clear();
	sceneStore.addPrimitive('cube');
	sceneStore.setEditMode(true);
	sceneStore.selectElement('vertex', 0, false);
	const beforeX = get(sceneStore).objects[0].geometry!.vertices[0][0];

	sceneStore.beginTransform('geometry');
	sceneStore.translateSelectedElements([0.5, 0, 0]);
	sceneStore.endTransform();

	const movedX = get(sceneStore).objects[0].geometry!.vertices[0][0];
	assert.ok(Math.abs(movedX - (beforeX + 0.5)) < 1e-5);

	sceneStore.undo();
	const restoredX = get(sceneStore).objects[0].geometry!.vertices[0][0];
	assert.ok(Math.abs(restoredX - beforeX) < 1e-5);
});

test('OBJ and STL 3D mesh export and import round-trip', () => {
	sceneStore.clear();
	sceneStore.addPrimitive('cube', [1, 2, 3]);
	const objects = get(sceneStore).objects;

	const objText = exportSceneToOBJ(objects);
	assert.ok(objText.includes('o Cube'));
	const parsedObj = parseOBJ(objText);
	assert.ok(parsedObj);
	assert.equal(parsedObj.vertices.length, 8);
	assert.equal(parsedObj.faces.length, 6);

	const stlText = exportSceneToSTL(objects);
	assert.ok(stlText.includes('solid toon_studio'));
	const parsedStl = parseSTL(stlText);
	assert.ok(parsedStl);
	assert.equal(parsedStl.faces.length, 12); // 6 quads = 12 triangles

	sceneStore.importMeshObject('imported.obj', parsedObj);
	assert.equal(get(sceneStore).objects.length, 2);
	assert.equal(get(sceneStore).objects[1].name, 'imported');
});

test('Physics baking writes real trajectory keyframes to the timeline', () => {
	sceneStore.clear();
	timelineStore.clearKeyframes();
	sceneStore.addPrimitive('sphere', [0, 3, 0]);
	const id = get(sceneStore).objects[0].id;
	sceneStore.setPhysics(id, { dynamic: true, restitution: 0.6 });

	const count = sceneStore.bakePhysicsToKeyframes(1.0, 10, 9.8);
	assert.equal(count, 1);
	const keys = get(timelineStore).keyframes.get(id) ?? [];
	assert.ok(keys.length >= 10);
	assert.ok(keys[keys.length - 1].position[1] < keys[0].position[1]);
});

test('Smart recordKeyframe, Auto-Key on transform, and layer reordering work seamlessly', () => {
	sceneStore.clear();
	timelineStore.clearKeyframes();
	timelineStore.setDuration(10);
	timelineStore.setTime(0);
	timelineStore.setShow(true);
	timelineStore.setAutoKey(true);

	sceneStore.addPrimitive('cube', [0, 0.5, 0]);
	sceneStore.addPrimitive('cylinder', [2, 0.5, 0]);
	const cubeId = get(sceneStore).objects[0].id;
	const cylId = get(sceneStore).objects[1].id;

	// Scrub to 2.0s and transform Cube: Auto-Key should anchor t=0 at [0, 0.5, 0] and t=2 at [4, 0.5, 0]
	timelineStore.setTime(2.0);
	sceneStore.selectObject(cubeId);
	sceneStore.beginTransform('transform');
	sceneStore.setTransforms([{ id: cubeId, position: [4, 0.5, 0] }]);
	sceneStore.endTransform();

	const cubeKeys = get(timelineStore).keyframes.get(cubeId) ?? [];
	assert.equal(cubeKeys.length, 2, 'Auto-Key created start key at 0s and moved key at 2s');
	assert.deepEqual(cubeKeys[0].position, [0, 0.5, 0]);
	assert.deepEqual(cubeKeys[1].position, [4, 0.5, 0]);

	// Midpoint evaluation at t=1.0s interpolates between [0,0.5,0] and [4,0.5,0]
	const mid = timelineStore.evaluate(1.0, false).get(cubeId)!;
	assert.ok(Math.abs(mid.position![0] - 2.0) < 1e-4);

	// Reorder layers
	sceneStore.reorderObject(cylId, -1);
	assert.equal(get(sceneStore).objects[0].id, cylId);
	assert.equal(get(sceneStore).objects[1].id, cubeId);
});

test('Rig bone chain creates linked parent-child hierarchy', () => {
	sceneStore.clear();
	sceneStore.addBoneChain(3);
	const objs = get(sceneStore).objects;
	assert.equal(objs.length, 3);
	assert.equal(objs[0].type, 'bone');
	assert.equal(objs[1].parent, objs[0].id);
	assert.equal(objs[2].parent, objs[1].id);
	assert.ok(objs[0].children.includes(objs[1].id));
});
