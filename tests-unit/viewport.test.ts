import { test } from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";
import { viewportStore } from "../src/stores/viewport.ts";

test("3D cursor defaults hidden at origin", () => {
	const s = get(viewportStore);
	assert.deepEqual(s.cursorPosition, [0, 0, 0]);
	assert.equal(s.cursorVisible, false);
});

test("setCursor moves cursor", () => {
	viewportStore.setCursor([1, 2, 3]);
	assert.deepEqual(get(viewportStore).cursorPosition, [1, 2, 3]);
});

test("toggleCursor flips visibility", () => {
	viewportStore.setCursorVisible(false);
	viewportStore.toggleCursor();
	assert.equal(get(viewportStore).cursorVisible, true);
	viewportStore.toggleCursor();
	assert.equal(get(viewportStore).cursorVisible, false);
});

test("viewport split accepts 1/2/4", () => {
	viewportStore.setViewportSplit(2);
	assert.equal(get(viewportStore).viewportSplit, 2);
	viewportStore.setViewportSplit(4);
	assert.equal(get(viewportStore).viewportSplit, 4);
	viewportStore.setViewportSplit(1);
});

test("render region can be set and cleared", () => {
	viewportStore.setRenderRegion([0.1, 0.2, 0.5, 0.5]);
	assert.deepEqual(get(viewportStore).renderRegion, [0.1, 0.2, 0.5, 0.5]);
	viewportStore.setRenderRegion(null);
	assert.equal(get(viewportStore).renderRegion, null);
});