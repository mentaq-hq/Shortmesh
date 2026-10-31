import { test } from "node:test";
import assert from "node:assert/strict";
import { clipHidesLayer, layerRange, layerTint, mediaVisible, mediaWindow } from "../src/lib/layers.ts";

test("a layer with no data fills the whole timeline", () => {
  assert.deepEqual(layerRange([], [], 5), { start: 0, end: 5 });
});

test("a single key is a constant pose and still fills the timeline", () => {
  assert.deepEqual(layerRange([1.25], [], 5), { start: 0, end: 5 });
});

test("two or more keys span the first to the last key, in time order", () => {
  assert.deepEqual(layerRange([3, 1, 2], [], 5), { start: 1, end: 3 });
  assert.deepEqual(layerRange([0.5, 2.5], [], 5), { start: 0.5, end: 2.5 });
});

test("action strips win over keys because they are explicit in and out points", () => {
  const strips = [
    { start: 2, end: 3 },
    { start: 0.5, end: 1.25 },
  ];
  assert.deepEqual(layerRange([1, 4], strips, 5), { start: 0.5, end: 3 });
});

test("the bar never runs past the timeline duration", () => {
  assert.deepEqual(layerRange([0, 9], [], 5), { start: 0, end: 5 });
  assert.deepEqual(layerRange([7], [], 5), { start: 0, end: 5 });
});

test("a zero length range is widened to a tappable minimum", () => {
  assert.deepEqual(layerRange([2, 2], [], 5), { start: 2, end: 2.2 });
});

test("layer tints separate the media types CapCut colours differently", () => {
  const text = layerTint("text");
  const image = layerTint("image");
  const mesh = layerTint("cube");
  assert.notEqual(text.bar, image.bar);
  assert.notEqual(text.bar, mesh.bar);
  assert.equal(layerTint("light").bar, layerTint("light").bar);
  assert.equal(mesh.edge.startsWith("#"), true);
});

test('a clippable layer lives for three seconds until it is placed', () => {
	assert.deepEqual(layerRange([], [], 5, null, true), { start: 0, end: 3 });
	assert.deepEqual(layerRange([], [], 2, null, true), { start: 0, end: 2 });
	assert.deepEqual(layerRange([], [], 5, null, false), { start: 0, end: 5 });
});

test('a stored clip is the real placement of the layer', () => {
	assert.deepEqual(layerRange([], [], 5, { start: 1.5, end: 3 }, true), { start: 1.5, end: 3 });
	assert.deepEqual(layerRange([0, 4], [{ start: 0, end: 1 }], 5, { start: 2, end: 2.5 }, false), { start: 2, end: 2.5 });
});

test('a media window hides the layer outside its clip', () => {
	const window = mediaWindow('text', { start: 1, end: 2.5 }, 5);
	assert.deepEqual(window, { start: 1, end: 2.5 });
	assert.equal(mediaVisible('text', { start: 1, end: 2.5 }, 5, 0.9), false);
	assert.equal(mediaVisible('text', { start: 1, end: 2.5 }, 5, 1), true);
	assert.equal(mediaVisible('text', { start: 1, end: 2.5 }, 5, 2.49), true);
	assert.equal(mediaVisible('text', { start: 1, end: 2.5 }, 5, 2.5), false);
	assert.deepEqual(mediaWindow('cube', null, 5), { start: 0, end: 3 }, 'meshes can carry a clip');
	assert.equal(clipHidesLayer('cube'), false, 'a mesh clip never hides the mesh');
	assert.equal(clipHidesLayer('text'), true, 'a text clip controls visibility');
	assert.equal(mediaWindow('light', null, 5), null, 'lights keep the whole timeline');
	assert.equal(mediaWindow('camera', null, 5), null, 'cameras keep the whole timeline');
	assert.equal(mediaVisible('image', null, 5, 9), false, 'default image clip ends at 3 s');
});
