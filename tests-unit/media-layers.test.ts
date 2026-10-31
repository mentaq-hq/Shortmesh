import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { sceneStore } from '../src/stores/scene.ts';
import { applyProject, createProject, validateProject } from '../src/lib/project.ts';
import { timelineStore } from '../src/stores/timeline.ts';
import { aspectPlaneScale } from '../src/lib/media.ts';

const state = () => get(sceneStore);
const tinyPng =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('a media plane keeps the source aspect ratio inside its width', () => {
	assert.deepEqual(aspectPlaneScale(1600, 900), [2.4, 1.35, 1]);
	assert.deepEqual(aspectPlaneScale(900, 1600), [2.4, 4.266666666666667, 1]);
	assert.deepEqual(aspectPlaneScale(0, 0), [2.4, 1.35, 1], 'invalid sizes fall back to 16:9');
});

test('a text layer is a real plane object with a caption and one undo step', () => {
	sceneStore.load([], null);
	sceneStore.addTextLayer('Hello studio');
	const objects = state().objects;
	assert.equal(objects.length, 1);
	const layer = objects[0];
	assert.equal(layer.type, 'text');
	assert.equal(layer.text, 'Hello studio');
	assert.equal(layer.name, 'Hello studio');
	assert.equal(layer.selected, true);
	assert.equal(layer.geometry?.vertices.length, 4, 'the plane mesh is materialised');
	assert.deepEqual(layer.geometry?.uvs, [
		[0, 1],
		[1, 1],
		[1, 0],
		[0, 0],
	]);
	assert.deepEqual(layer.scale, [2.4, 1.2, 1]);
	assert.equal(state().selectedId, layer.id);

	sceneStore.undo();
	assert.equal(state().objects.length, 0, 'adding a text layer is undoable');
});

test('editing a caption renames the layer and can be undone', () => {
	sceneStore.load([], null);
	sceneStore.addTextLayer('First');
	const id = state().objects[0].id;
	const past = sceneStore.historySize().past;
	sceneStore.setTextContent(id, 'Second title');
	assert.equal(state().objects[0].text, 'Second title');
	assert.equal(state().objects[0].name, 'Second title');
	assert.equal(sceneStore.historySize().past, past + 1, 'the edit is one step');

	sceneStore.setTextContent(id, 'Second title');
	assert.equal(sceneStore.historySize().past, past + 1, 'the same caption makes no history entry');

	sceneStore.undo();
	assert.equal(state().objects[0].text, 'First');
	assert.equal(state().objects[0].name, 'First');
});

test('an image layer stores the file in its material slot', () => {
	sceneStore.load([], null);
	sceneStore.addImageLayer(tinyPng, 1600, 900, 'backdrop.png');
	const layer = state().objects[0];
	assert.equal(layer.type, 'image');
	assert.equal(layer.name, 'backdrop');
	assert.equal(layer.geometry?.slots[0]?.imageUrl, tinyPng);
	assert.deepEqual(layer.scale, [2.4, 1.35, 1]);

	sceneStore.undo();
	assert.equal(state().objects.length, 0);
});

test('a non-image data URL is rejected without polluting history', () => {
	sceneStore.load([], null);
	const before = sceneStore.historySize().past;
	sceneStore.addImageLayer('data:text/plain;base64,aGk=', 10, 10);
	assert.equal(state().objects.length, 0);
	assert.equal(sceneStore.historySize().past, before);
});

test('a project round trip keeps text layers and their caption', () => {
	sceneStore.load([], null);
	sceneStore.addTextLayer('Saved caption');
	const project = createProject('Media');
	const loaded = validateProject(JSON.parse(JSON.stringify(project)));
	assert.equal(loaded.scene.objects.length, 1);
	assert.equal(loaded.scene.objects[0].type, 'text');
	assert.equal(loaded.scene.objects[0].text, 'Saved caption');
	assert.equal(loaded.scene.objects[0].geometry?.vertices.length, 4);
	assert.deepEqual(loaded.scene.objects[0].geometry?.uvs, [
		[0, 1],
		[1, 1],
		[1, 0],
		[0, 0],
	]);
});

test('a layer clip survives a project round trip', () => {
	sceneStore.load([], null);
	timelineStore.clearKeyframes();
	timelineStore.setDuration(6);
	timelineStore.setClip('obj-text', 1.5, 4);

	const project = createProject('Clip project');
	const restored = validateProject(JSON.parse(JSON.stringify(project)));
	assert.deepEqual(restored.timeline.clips, { 'obj-text': { start: 1.5, end: 4 } });

	applyProject(restored);
	assert.deepEqual(get(timelineStore).clips.get('obj-text'), { start: 1.5, end: 4 });
});
