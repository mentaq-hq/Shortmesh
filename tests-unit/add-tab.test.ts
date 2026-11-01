import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { sceneStore, PRIMITIVES, defaultCreationParams } from '../src/stores/scene';
import {
	icoSphereMesh,
	circleMesh,
	gridMesh,
	pyramidMesh,
	tubeMesh,
	capsuleMesh,
	bezierCurveMesh,
	bezierCircleMesh,
	pathCurveMesh,
	nurbsCurveMesh,
	pointLightMesh,
	sunLightMesh,
	spotLightMesh,
	areaLightMesh,
	perspectiveCameraMesh,
	orthoCameraMesh,
	emptyAxesMesh,
	emptyArrowsMesh,
	emptyCubeMesh,
	emptySphereMesh,
	emptyCircleMesh,
	emptyImageMesh,
	text3dMesh,
	metaballMesh,
	latticeMesh,
	forceFieldMesh,
	speakerMesh,
	suzanneMesh,
	treeMesh,
	carMesh,
	characterMesh,
	chairMesh,
	meshFor
} from '../src/lib/mesh';

test('Add Tab: All Mesh Primitives generate valid, non-empty 3D geometry', () => {
	const ico = icoSphereMesh(1, 0.5);
	assert.ok(ico.vertices.length >= 12, 'Ico sphere should have >= 12 vertices');
	assert.ok(ico.faces.length >= 20, 'Ico sphere should have >= 20 faces');
	assert.ok(ico.radius > 0, 'Ico sphere radius should be positive');

	const circle = circleMesh(32, 0.5);
	assert.equal(circle.vertices.length, 33, 'Circle should have center + 32 vertices');
	assert.equal(circle.faces.length, 32, 'Circle should have 32 faces');

	const grid = gridMesh(4, 4, 2, 2);
	assert.equal(grid.vertices.length, 25, 'Grid 4x4 should have 25 vertices');
	assert.equal(grid.faces.length, 16, 'Grid 4x4 should have 16 quad faces');

	const pyr = pyramidMesh(4, 0.5, 1.0);
	assert.equal(pyr.vertices.length, 6, 'Pyramid with 4 sides should have apex + 4 base + 1 center');
	assert.equal(pyr.faces.length, 8, 'Pyramid with 4 sides should have 4 side faces + 4 base faces');

	const tube = tubeMesh(24, 0.3, 0.5, 1.0);
	assert.ok(tube.vertices.length >= 96, 'Tube should have outer and inner rings');
	assert.ok(tube.faces.length >= 96, 'Tube should have walls and rims');

	const cap = capsuleMesh(20, 6, 0.25, 0.6);
	assert.ok(cap.vertices.length > 50, 'Capsule should have vertices across domes');
	assert.ok(cap.faces.length > 50, 'Capsule should have faces across domes');
});

test('Add Tab: Curves, Lights, Cameras, Empties, Text, More and Assets generate valid meshes', () => {
	// Curves
	assert.ok(bezierCurveMesh().vertices.length > 0);
	assert.ok(bezierCircleMesh().vertices.length > 0);
	assert.ok(pathCurveMesh().vertices.length > 0);
	assert.ok(nurbsCurveMesh().vertices.length > 0);

	// Lights
	assert.ok(pointLightMesh().vertices.length > 0);
	assert.ok(sunLightMesh().vertices.length > 0);
	assert.ok(spotLightMesh().vertices.length > 0);
	assert.ok(areaLightMesh().vertices.length > 0);

	// Cameras
	assert.ok(perspectiveCameraMesh().vertices.length > 0);
	assert.ok(orthoCameraMesh().vertices.length > 0);

	// Empties
	assert.ok(emptyAxesMesh().vertices.length > 0);
	assert.ok(emptyArrowsMesh().vertices.length > 0);
	assert.ok(emptyCubeMesh().vertices.length > 0);
	assert.ok(emptySphereMesh().vertices.length > 0);
	assert.ok(emptyCircleMesh().vertices.length > 0);
	assert.ok(emptyImageMesh().vertices.length > 0);

	// Text & More
	assert.ok(text3dMesh().vertices.length > 0);
	assert.ok(metaballMesh().vertices.length > 0);
	assert.ok(latticeMesh().vertices.length > 0);
	assert.ok(forceFieldMesh().vertices.length > 0);
	assert.ok(speakerMesh().vertices.length > 0);

	// Assets
	assert.ok(suzanneMesh().vertices.length > 0);
	assert.ok(treeMesh().vertices.length > 0);
	assert.ok(carMesh().vertices.length > 0);
	assert.ok(characterMesh().vertices.length > 0);
	assert.ok(chairMesh().vertices.length > 0);
});

test('Add Tab: meshFor resolver handles all primitive types', () => {
	const types = [
		'cube', 'sphere', 'icosphere', 'cylinder', 'cone', 'torus', 'plane',
		'circle', 'grid', 'pyramid', 'tube', 'capsule',
		'curve_bezier', 'curve_circle', 'curve_path', 'curve_nurbs',
		'light', 'light_sun', 'light_spot', 'light_area',
		'camera', 'camera_ortho',
		'empty_axes', 'empty_arrows', 'empty_cube', 'empty_sphere', 'empty_circle', 'empty_image',
		'text_3d', 'metaball', 'lattice', 'forcefield', 'speaker',
		'asset_suzanne', 'asset_tree', 'asset_car', 'asset_character', 'asset_chair'
	];

	for (const type of types) {
		const mesh = meshFor(type);
		assert.ok(mesh !== null, `meshFor('${type}') must return a Mesh`);
		assert.ok(mesh.vertices.length > 0, `meshFor('${type}') must have vertices`);
		assert.ok(mesh.faces.length > 0, `meshFor('${type}') must have faces`);
	}
});

test('Add Tab: PRIMITIVES catalog covers all required categories', () => {
	const categories = ['Mesh', 'Curve', 'Light', 'Camera', 'Empty', 'Text', 'Import', 'More'];
	for (const cat of categories) {
		const inCat = PRIMITIVES.filter(p => p.category === cat);
		assert.ok(inCat.length > 0, `Category ${cat} must contain primitive definitions`);
	}

	// Verify required Mesh primitives
	const meshTypes = PRIMITIVES.filter(p => p.category === 'Mesh').map(p => p.type);
	const requiredMesh = ['cube', 'sphere', 'icosphere', 'cylinder', 'cone', 'torus', 'plane', 'circle', 'grid', 'pyramid', 'tube', 'capsule'];
	for (const req of requiredMesh) {
		assert.ok(meshTypes.includes(req), `Mesh category must include ${req}`);
	}
});

test('Add Tab: Adding primitive selects object, spawns at cursor/view position, and records undo', () => {
	const countBefore = get(sceneStore).objects.length;
	const cursorPosition: [number, number, number] = [1.5, 0.8, -2.0];

	// Add icosphere at cursor position
	sceneStore.addPrimitive('icosphere', cursorPosition);

	const stateAfter = get(sceneStore);
	assert.equal(stateAfter.objects.length, countBefore + 1, 'Object count should increase by 1');
	const newObj = stateAfter.objects.find(o => o.id === stateAfter.selectedId);
	assert.ok(newObj, 'Newly added object must exist and be selected');
	assert.equal(newObj.selected, true, 'Object selected flag must be true');
	assert.deepEqual(newObj.position, cursorPosition, 'Object position must match cursor spawn position');
	assert.equal(newObj.type, 'icosphere');

	// Undo should remove the object
	sceneStore.undo();
	const stateUndone = get(sceneStore);
	assert.equal(stateUndone.objects.length, countBefore, 'Undo must remove the added object');
	assert.ok(!stateUndone.objects.some(o => o.id === newObj.id), 'Object must not exist in scene after undo');

	// Redo should restore it
	sceneStore.redo();
	const stateRedone = get(sceneStore);
	assert.equal(stateRedone.objects.length, countBefore + 1, 'Redo must restore the added object');
	assert.ok(stateRedone.objects.some(o => o.id === newObj.id), 'Object must exist in scene after redo');
});

test('Add Tab: updateCreationParams dynamically modifies mesh geometry with undo', () => {
	// Add a cylinder
	sceneStore.addPrimitive('cylinder', [0, 0.5, 0]);
	let state = get(sceneStore);
	const cyl = state.objects.find(o => o.id === state.selectedId)!;
	assert.ok(cyl);
	const initialVertCount = cyl.geometry ? cyl.geometry.vertices.length : 0;

	// Modify segments from 32 to 16
	sceneStore.updateCreationParams({ segments: 16, height: 2.0 });
	state = get(sceneStore);
	const updatedCyl = state.objects.find(o => o.id === state.selectedId)!;
	assert.equal(updatedCyl.creationParams?.segments, 16);
	assert.equal(updatedCyl.creationParams?.height, 2.0);
	assert.ok(updatedCyl.geometry);
	// 16 segments top + 16 bottom = 32 vertices
	assert.equal(updatedCyl.geometry.vertices.length, 32);

	// Undo restores previous parameters and geometry
	sceneStore.undo();
	state = get(sceneStore);
	const revertedCyl = state.objects.find(o => o.id === state.selectedId)!;
	assert.equal(revertedCyl.creationParams?.segments, 32);
});

test('Add Tab: Adding lights and cameras initializes specialized properties', () => {
	// Add Spot Light
	sceneStore.addPrimitive('light_spot', [0, 3, 0], { intensity: 2.5, color: '#ffddaa', spotAngle: 60 });
	let state = get(sceneStore);
	const light = state.objects.find(o => o.id === state.selectedId)!;
	assert.ok(light.lightProps, 'Light object must have lightProps initialized');
	assert.equal(light.lightProps.type, 'spot');
	assert.equal(light.lightProps.intensity, 2.5);
	assert.equal(light.lightProps.color, '#ffddaa');

	// Add Perspective Camera
	sceneStore.addPrimitive('camera', [0, 2, 5], { fov: 60 });
	state = get(sceneStore);
	const cam = state.objects.find(o => o.id === state.selectedId)!;
	assert.ok(cam.cameraProps, 'Camera object must have cameraProps initialized');
	assert.equal(cam.cameraProps.fov, 60);
	assert.equal(cam.cameraProps.ortho, false);

	// Add Orthographic Camera
	sceneStore.addPrimitive('camera_ortho', [0, 2, 5], { orthoScale: 6.0 });
	state = get(sceneStore);
	const orthoCam = state.objects.find(o => o.id === state.selectedId)!;
	assert.ok(orthoCam.cameraProps, 'Orthographic camera must have cameraProps');
	assert.equal(orthoCam.cameraProps.ortho, true);
	assert.equal(orthoCam.cameraProps.orthoScale, 6.0);
});
