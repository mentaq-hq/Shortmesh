import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { sceneStore } from '../src/stores/scene.ts';

const state = () => get(sceneStore);

test('a drag is one undo step and moves every selected object', () => {
	sceneStore.load([], null);
	sceneStore.addPrimitive('cube');
	sceneStore.addPrimitive('sphere');
	const objects = state().objects;
	assert.equal(objects.length, 2);
	for (const object of objects) object.selected = true;
	sceneStore.setTransforms([{ id: objects[1].id, position: [2, 0, 0] }]);

	const before = objects.map((object) => [...object.position]);
	sceneStore.beginTransform();
	sceneStore.setTransforms([
		{ id: objects[0].id, position: [1, 0, 0] },
		{ id: objects[1].id, position: [3, 0, 0] },
	]);
	sceneStore.endTransform();

	assert.deepEqual(state().objects[0].position, [1, 0, 0]);
	assert.deepEqual(state().objects[1].position, [3, 0, 0]);
	const afterDrag = sceneStore.historySize().past;

	sceneStore.undo();
	assert.deepEqual(state().objects[0].position, before[0], 'the first object returns');
	assert.deepEqual(state().objects[1].position, before[1], 'the second object returns');
	assert.equal(sceneStore.historySize().past, afterDrag - 1);
	assert.equal(sceneStore.historySize().future, 1);

	sceneStore.redo();
	assert.deepEqual(state().objects[0].position, [1, 0, 0]);
	assert.deepEqual(state().objects[1].position, [3, 0, 0]);
});

test('a drag that does not move anything does not fill the history', () => {
	sceneStore.load([], null);
	sceneStore.addPrimitive('cube');
	const before = sceneStore.historySize().past;
	sceneStore.beginTransform();
	sceneStore.endTransform();
	assert.equal(sceneStore.historySize().past, before);
});

test('a vertex edit stores only the vertices that moved', () => {
	sceneStore.load([], null);
	sceneStore.addPrimitive('cube');
	sceneStore.setEditMode(true);
	const id = state().selectedId!;
	sceneStore.beginTransform('geometry');
	const mesh = state().objects.find((object) => object.id === id)!.geometry!;
	const original = mesh.vertices[0][0];
	mesh.vertices[0][0] = original + 0.5;
	sceneStore.endTransform();

	sceneStore.undo();
	const restored = state().objects.find((object) => object.id === id)!.geometry!;
	assert.equal(restored.vertices[0][0], original);
	sceneStore.redo();
	const redone = state().objects.find((object) => object.id === id)!.geometry!;
	assert.equal(redone.vertices[0][0], original + 0.5);
});

test('structural edits still undo as whole steps', () => {
	sceneStore.load([], null);
	sceneStore.addPrimitive('cube');
	assert.equal(state().objects.length, 1);
	sceneStore.deleteSelected();
	assert.equal(state().objects.length, 0);
	sceneStore.undo();
	assert.equal(state().objects.length, 1, 'the deleted object comes back');
	sceneStore.redo();
	assert.equal(state().objects.length, 0);
});

test('undo after save keeps the object count consistent', () => {
	sceneStore.load([], null);
	sceneStore.addPrimitive('cube');
	sceneStore.addPrimitive('cylinder');
	const snapshot = JSON.parse(JSON.stringify(state().objects));
	sceneStore.duplicateSelected();
	assert.equal(state().objects.length, 3);
	sceneStore.undo();
	assert.equal(state().objects.length, 2);
	assert.deepEqual(
		state().objects.map((object) => object.id),
		snapshot.map((object: { id: string }) => object.id),
	);
});
