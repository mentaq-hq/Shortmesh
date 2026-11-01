import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import {
	stripActionTime,
	timelineStore,
	type KeyframeData,
	type NlaStrip,
} from '../src/stores/timeline.ts';
import { TRANSFORM_CHANNELS } from '../src/lib/fcurve.ts';
import { sceneStore } from '../src/stores/scene.ts';
import { createProject, validateProject, applyProject } from '../src/lib/project.ts';

const state = () => get(timelineStore);

function resetTimeline() {
	timelineStore.clearKeyframes();
	timelineStore.setDuration(5);
	timelineStore.setLoop(true);
	timelineStore.setEasing(true);
	timelineStore.setFrameRate(30);
	timelineStore.setPlaying(false);
	timelineStore.setTime(0);
}

function pose(time: number, position: [number, number, number], scale: [number, number, number] = [1, 1, 1]): KeyframeData {
	return { time, position, rotation: [0, 0, 0], scale };
}

function setLinear(objectId: string) {
	for (const path of TRANSFORM_CHANNELS) timelineStore.setInterpolation(objectId, path, 'linear');
}

function channelTimes(objectId: string, path: string): number[] {
	return (state().curves.get(objectId)?.get(path)?.keys ?? []).map((key) => key.time);
}

function strip(overrides: Partial<NlaStrip> = {}): NlaStrip {
	return {
		id: 'strip-test',
		objectId: 'obj-a',
		name: 'Action',
		start: 0,
		end: 5,
		actionStart: 0,
		actionEnd: 10,
		speed: 1,
		reversed: false,
		frozen: false,
		muted: false,
		...overrides,
	};
}

// ---- Keyframes -------------------------------------------------------------

test('addKeyframe writes a pose and all ten transform channels', () => {
	resetTimeline();
	timelineStore.addKeyframe('obj-a', pose(1, [1, 2, 3], [2, 2, 2]));
	const entry = state().curves.get('obj-a');
	assert.ok(entry, 'the object has curves');
	assert.equal(entry!.size, 10);
	for (const path of TRANSFORM_CHANNELS) {
		assert.equal(entry!.get(path)!.keys.length, 1, `${path} has one key`);
	}
	assert.equal(state().keyframes.get('obj-a')!.length, 1);
	assert.deepEqual(state().selectedKey, { objectId: 'obj-a', time: 1 });
});

test('addKeyframe replaces a key within the epsilon instead of duplicating it', () => {
	resetTimeline();
	timelineStore.addKeyframe('obj-a', pose(1, [0, 0, 0]));
	timelineStore.addKeyframe('obj-a', pose(1.0004, [4, 0, 0]));
	const keys = state().keyframes.get('obj-a')!;
	assert.equal(keys.length, 1, 'one key');
	assert.deepEqual(keys[0].position, [4, 0, 0], 'the later value wins');
	assert.deepEqual(channelTimes('obj-a', 'location.x'), [1]);
});

test('addKeyframe rejects non-finite time and keeps the keys sorted', () => {
	resetTimeline();
	timelineStore.addKeyframe('obj-a', pose(Number.NaN, [0, 0, 0]));
	assert.equal(state().keyframes.get('obj-a'), undefined, 'no key for an invalid time');

	timelineStore.addKeyframe('obj-a', pose(2, [2, 0, 0]));
	timelineStore.addKeyframe('obj-a', pose(0, [0, 0, 0]));
	timelineStore.addKeyframe('obj-a', pose(1, [1, 0, 0]));
	assert.deepEqual(
		state().keyframes.get('obj-a')!.map((key) => key.time),
		[0, 1, 2],
	);
});

test('position and scale interpolate linearly between two keys', () => {
	resetTimeline();
	timelineStore.addKeyframe('obj-a', pose(0, [0, 0, 0], [1, 1, 1]));
	timelineStore.addKeyframe('obj-a', pose(2, [4, 2, -2], [3, 5, 1]));
	setLinear('obj-a');

	const half = timelineStore.evaluate(1, false).get('obj-a')!;
	assert.deepEqual(half.position, [2, 1, -1]);
	assert.deepEqual(half.scale, [2, 3, 1], 'scale is interpolated per component');

	const quarter = timelineStore.evaluate(0.5, false).get('obj-a')!;
	assert.deepEqual(quarter.position, [1, 0.5, -0.5]);
});

test('evaluation clamps to the first and the last key', () => {
	resetTimeline();
	timelineStore.addKeyframe('obj-a', pose(1, [1, 0, 0]));
	timelineStore.addKeyframe('obj-a', pose(2, [2, 0, 0]));
	assert.deepEqual(timelineStore.evaluate(0, true).get('obj-a')!.position, [1, 0, 0]);
	assert.deepEqual(timelineStore.evaluate(10, true).get('obj-a')!.position, [2, 0, 0]);
	assert.deepEqual(timelineStore.evaluate(1, true).get('obj-a')!.position, [1, 0, 0], 'exact key time');
});

test('a single key is a constant pose', () => {
	resetTimeline();
	timelineStore.addKeyframe('obj-a', pose(1, [3, 4, 5]));
	assert.deepEqual(timelineStore.evaluate(0, true).get('obj-a')!.position, [3, 4, 5]);
	assert.deepEqual(timelineStore.evaluate(99, true).get('obj-a')!.position, [3, 4, 5]);
});

test('rotation takes the shortest path instead of spinning the long way', () => {
	resetTimeline();
	timelineStore.addKeyframe('obj-a', {
		time: 0,
		position: [0, 0, 0],
		rotation: [0, 0, 0],
		scale: [1, 1, 1],
	});
	timelineStore.addKeyframe('obj-a', {
		time: 1,
		position: [0, 0, 0],
		rotation: [0, 0, Math.PI * 1.9],
		scale: [1, 1, 1],
	});
	setLinear('obj-a');
	const half = timelineStore.evaluate(0.5, false).get('obj-a')!;
	assert.ok(half.rotation);
	// 1.9 * PI is equivalent to -0.1 * PI, so the shortest arc ends at -0.05 * PI.
	assert.ok(
		Math.abs(half.rotation![2] - -0.05 * Math.PI) < 1e-6,
		`expected -0.05 PI, got ${half.rotation![2]}`,
	);
});

test('the ease toggle changes real evaluated values', () => {
	resetTimeline();
	timelineStore.addKeyframe('obj-a', pose(0, [0, 0, 0]));
	timelineStore.addKeyframe('obj-a', pose(1, [10, 0, 0]));
	// Bezier keys are the default, so easing is active.
	const eased = timelineStore.evaluate(0.25, true).get('obj-a')!.position![0];
	const linear = timelineStore.evaluate(0.25, false).get('obj-a')!.position![0];
	assert.ok(Math.abs(linear - 2.5) < 1e-9, 'ease off is linear');
	assert.ok(Math.abs(eased - 1.5625) < 1e-6, 'auto handles produce smoothstep');
});

test('a missing scale channel falls back to 1, never to zero', () => {
	resetTimeline();
	timelineStore.addKeyframe('obj-a', pose(0, [0, 0, 0], [2, 2, 2]));
	const entry = state().curves.get('obj-a')!;
	entry.get('scale.y')!.keys = [];
	entry.get('scale.z')!.keys = [];
	const scale = timelineStore.evaluate(0, true).get('obj-a')!.scale!;
	assert.deepEqual(scale, [2, 1, 1]);
});

// ---- Selection, move, delete ----------------------------------------------

test('selecting a key parks the playhead and pauses playback', () => {
	resetTimeline();
	timelineStore.addKeyframe('obj-a', pose(0, [0, 0, 0]));
	timelineStore.addKeyframe('obj-a', pose(2, [2, 0, 0]));
	timelineStore.setTime(2);
	timelineStore.setPlaying(true);
	timelineStore.selectKeyframe('obj-a', 0);
	assert.equal(state().currentTime, 0);
	assert.equal(state().playing, false);
	assert.deepEqual(state().selectedKey, { objectId: 'obj-a', time: 0 });
});

test('moving a key moves every channel, the pose and the selection', () => {
	resetTimeline();
	timelineStore.addKeyframe('obj-a', pose(0, [0, 0, 0]));
	timelineStore.addKeyframe('obj-a', pose(2, [2, 0, 0]));
	timelineStore.selectKeyframe('obj-a', 0);

	timelineStore.moveKeyframe('obj-a', 0, 1);
	assert.deepEqual(channelTimes('obj-a', 'location.x'), [1, 2]);
	assert.equal(state().keyframes.get('obj-a')![0].time, 1);
	assert.deepEqual(channelTimes('obj-a', 'rotation_quaternion.z'), [1, 2]);
	assert.deepEqual(state().selectedKey, { objectId: 'obj-a', time: 1 });
	assert.deepEqual(timelineStore.evaluate(1, true).get('obj-a')!.position, [0, 0, 0]);
});

test('moving a key clamps at zero and merges on a collision', () => {
	resetTimeline();
	timelineStore.addKeyframe('obj-a', pose(0, [0, 0, 0]));
	timelineStore.addKeyframe('obj-a', pose(1, [1, 0, 0]));
	timelineStore.addKeyframe('obj-a', pose(2, [2, 0, 0]));

	timelineStore.moveKeyframe('obj-a', 1, 2);
	assert.deepEqual(channelTimes('obj-a', 'location.x'), [0, 2], 'no duplicate key');
	assert.deepEqual(state().keyframes.get('obj-a')!.map((key) => key.time), [0, 2]);

	timelineStore.moveKeyframe('obj-a', 0, -4);
	assert.deepEqual(channelTimes('obj-a', 'location.x'), [0, 2], 'negative time clamps to zero');
});

test('deleting the selected key leaves the other keys and channels intact', () => {
	resetTimeline();
	timelineStore.addKeyframe('obj-a', pose(0, [0, 0, 0]));
	timelineStore.addKeyframe('obj-a', pose(1, [1, 0, 0]));
	timelineStore.addKeyframe('obj-b', pose(1, [5, 0, 0]));

	timelineStore.selectKeyframe('obj-a', 1);
	timelineStore.deleteSelectedKey();

	assert.deepEqual(
		state().keyframes.get('obj-a')!.map((key) => key.time),
		[0],
	);
	assert.deepEqual(channelTimes('obj-a', 'location.x'), [0]);
	assert.deepEqual(channelTimes('obj-b', 'location.x'), [1], 'other objects untouched');
	assert.equal(state().selectedKey, null);
});

// ---- Playback --------------------------------------------------------------

test('tick advances by elapsed time, stops at the end and can be paused', () => {
	resetTimeline();
	timelineStore.setDuration(2);
	timelineStore.setLoop(false);
	timelineStore.setTime(0);
	timelineStore.setPlaying(true);

	assert.equal(timelineStore.tick(0.5), 0.5);
	assert.equal(timelineStore.tick(1), 1.5);
	assert.equal(timelineStore.tick(1), 2, 'clamps to the end');
	assert.equal(state().playing, false, 'playback stops without loop');

	const stopped = timelineStore.tick(5);
	assert.equal(stopped, 2, 'a paused clock does not advance');
});

test('looping wraps to the start of the real playback range', () => {
	resetTimeline();
	timelineStore.setDuration(1);
	timelineStore.setLoop(true);
	timelineStore.setTime(0.8);
	timelineStore.setPlaying(true);
	const time = timelineStore.tick(0.3);
	assert.ok(Math.abs(time - 0.1) < 1e-9, `expected 0.1, got ${time}`);
	assert.equal(state().playing, true);
});

test('play from the end restarts at zero, pause keeps the time', () => {
	resetTimeline();
	timelineStore.setDuration(2);
	timelineStore.setTime(2);
	timelineStore.togglePlay();
	assert.equal(state().currentTime, 0, 'play at the end rewinds first');
	assert.equal(state().playing, true);
	timelineStore.tick(0.4);
	timelineStore.togglePlay();
	assert.equal(state().playing, false);
	assert.ok(Math.abs(state().currentTime - 0.4) < 1e-9, 'pause keeps the time');
});

test('start returns to the first frame and evaluates the first pose', () => {
	resetTimeline();
	timelineStore.addKeyframe('obj-a', pose(0, [7, 0, 0]));
	timelineStore.addKeyframe('obj-a', pose(2, [9, 0, 0]));
	timelineStore.setTime(1.5);
	timelineStore.goToStart();
	assert.equal(state().currentTime, 0);
	assert.deepEqual(timelineStore.evaluate(0, true).get('obj-a')!.position, [7, 0, 0]);
});

test('nextFrame uses the project frame rate', () => {
	resetTimeline();
	timelineStore.setFrameRate(24);
	timelineStore.setTime(0);
	timelineStore.nextFrame();
	assert.ok(Math.abs(state().currentTime - 1 / 24) < 1e-9);
});

test('playback never creates undo entries', () => {
	resetTimeline();
	timelineStore.addKeyframe('obj-a', pose(0, [0, 0, 0]));
	timelineStore.addKeyframe('obj-a', pose(1, [1, 0, 0]));
	const before = sceneStore.historySize().past;
	timelineStore.setTime(0);
	timelineStore.setPlaying(true);
	for (let i = 0; i < 60; i++) timelineStore.tick(1 / 60);
	timelineStore.setPlaying(false);
	assert.equal(sceneStore.historySize().past, before);
});

test('setTime clamps to the playback range', () => {
	resetTimeline();
	timelineStore.setDuration(3);
	timelineStore.setTime(-1);
	assert.equal(state().currentTime, 0);
	timelineStore.setTime(9);
	assert.equal(state().currentTime, 3);
});

test('playback does not mutate the animation data', () => {
	resetTimeline();
	timelineStore.addKeyframe('obj-a', pose(0, [0, 0, 0]));
	timelineStore.addKeyframe('obj-a', pose(2, [2, 0, 0]));
	const before = JSON.stringify(timelineStore.snapshotAnimation());
	timelineStore.setTime(0);
	timelineStore.setPlaying(true);
	for (let i = 0; i < 1000; i++) timelineStore.tick(1 / 60);
	timelineStore.setPlaying(false);
	assert.equal(JSON.stringify(timelineStore.snapshotAnimation()), before, 'data is unchanged');
	assert.equal(state().keyframes.get('obj-a')!.length, 2, 'no duplicate keys');
	assert.equal([...state().curves.get('obj-a')!.values()][0].keys.length, 2);
});

test('the full key edit flow drives the scene transform', () => {
	resetTimeline();
	sceneStore.load([], null);
	sceneStore.addPrimitive('cube');
	const id = get(sceneStore).selectedId!;
	const object = get(sceneStore).objects[0];

	// Key the cube on the floor at t = 0.
	timelineStore.setTime(0);
	timelineStore.addKeyframe(id, {
		time: 0,
		position: [...object.position] as [number, number, number],
		rotation: [0, 0, 0],
		scale: [1, 1, 1],
	});

	// Move it and key the new pose at t = 2.
	sceneStore.setTransform(id, { position: [2, 0.5, 0] });
	timelineStore.setTime(2);
	const moved = get(sceneStore).objects[0];
	timelineStore.addKeyframe(id, {
		time: 2,
		position: [...moved.position] as [number, number, number],
		rotation: [0, 0, 0],
		scale: [1, 1, 1],
	});
	setLinear(id);

	const atStart = timelineStore.evaluate(0, false).get(id)!;
	sceneStore.applyAnimation(timelineStore.evaluate(0, false));
	assert.deepEqual(atStart.position, [0, 0.5, 0]);
	assert.deepEqual(get(sceneStore).objects[0].position, [0, 0.5, 0]);

	timelineStore.setTime(1);
	sceneStore.applyAnimation(timelineStore.evaluate(1, false));
	assert.deepEqual(get(sceneStore).objects[0].position, [1, 0.5, 0], 'midway pose');
});

// ---- Strips ----------------------------------------------------------------

test('stripActionTime maps speed, reverse and freeze to action time', () => {
	const base = strip();
	assert.equal(stripActionTime(base, 2), 2);
	assert.equal(stripActionTime({ ...base, speed: 2 }, 2), 4);
	assert.equal(stripActionTime({ ...base, reversed: true }, 2), 8);
	assert.equal(stripActionTime({ ...base, frozen: true }, 4), 0, 'freeze holds the first action frame');
	assert.equal(stripActionTime({ ...base, speed: 2 }, 100), 10, 'clamps to the action end');
});

test('strips drive the evaluated transform only inside their range', () => {
	resetTimeline();
	timelineStore.addKeyframe('obj-a', pose(0, [0, 0, 0]));
	timelineStore.addKeyframe('obj-a', pose(2, [4, 0, 0]));
	setLinear('obj-a');
	timelineStore.addStrip('obj-a', 1, 3);
	const stripId = state().selectedStripId!;
	timelineStore.updateStrip(stripId, { speed: 2, actionEnd: 2 });

	// Inside the strip: action time runs twice as fast.
	assert.deepEqual(timelineStore.evaluate(1.5, false).get('obj-a')!.position, [2, 0, 0]);
	// Outside the strip the object is not driven by this action at all.
	assert.equal(timelineStore.evaluate(0.5, false).get('obj-a'), undefined);
	assert.equal(timelineStore.evaluate(4, false).get('obj-a'), undefined);
});

test('split is continuous for forward, reversed and speed-scaled strips', () => {
	resetTimeline();
	timelineStore.setDuration(10);
	timelineStore.addKeyframe('obj-a', pose(0, [0, 0, 0]));
	timelineStore.addKeyframe('obj-a', pose(4, [4, 0, 0]));
	timelineStore.addStrip('obj-a', 0, 4);
	const original = state().strips[0];
	timelineStore.updateStrip(original.id, { actionStart: 0, actionEnd: 4, speed: 2, reversed: true });
	timelineStore.setTime(1.5);
	timelineStore.splitStripAtPlayhead(original.id);

	const strips = state().strips;
	assert.equal(strips.length, 2);
	const left = strips[0];
	const right = strips[1];
	assert.equal(left.end, 1.5);
	assert.equal(right.start, 1.5);
	// With speed 2 and reversed, 1.5 s into the strip is action time 4 - 3 = 1.
	assert.equal(left.actionStart, 1, 'the left half stops at the cut');
	assert.equal(right.actionEnd, 1, 'the right half starts its countdown at the cut');
	const beforeCut = stripActionTime(left, 1.49);
	const afterCut = stripActionTime(right, 1.51);
	assert.ok(Math.abs(beforeCut - afterCut) < 0.05, 'motion continues across the cut');
});

test('duplicate creates an independent strip next to the original', () => {
	resetTimeline();
	timelineStore.setDuration(10);
	timelineStore.addKeyframe('obj-a', pose(0, [0, 0, 0]));
	timelineStore.addKeyframe('obj-a', pose(2, [2, 0, 0]));
	timelineStore.addStrip('obj-a', 1, 3);
	const original = state().strips[0];
	timelineStore.duplicateStrip(original.id);
	const strips = state().strips;
	assert.equal(strips.length, 2);
	assert.notEqual(strips[0].id, strips[1].id);
	assert.equal(strips[1].start, 3);
	assert.equal(strips[1].end, 5);
	assert.equal(strips[1].actionStart, original.actionStart);
	assert.equal(strips[1].actionEnd, original.actionEnd);
});

test('freeze and reverse change playback, delete removes only that strip', () => {
	resetTimeline();
	timelineStore.setDuration(10);
	timelineStore.addKeyframe('obj-a', pose(0, [0, 0, 0]));
	timelineStore.addKeyframe('obj-a', pose(2, [2, 0, 0]));
	timelineStore.addStrip('obj-a', 0, 2);
	const id = state().strips[0].id;

	timelineStore.freezeStrip(id);
	assert.equal(state().strips[0].frozen, true);
	assert.equal(stripActionTime(state().strips[0], 1.9), 0);

	timelineStore.reverseStrip(id);
	assert.equal(state().strips[0].reversed, true);
	timelineStore.freezeStrip(id, false);
	timelineStore.setStripSpeed(id, 99);
	assert.equal(state().strips[0].speed, 10, 'speed stays within 0.1x..10x');

	timelineStore.removeStrip(id);
	assert.equal(state().strips.length, 0);
	assert.equal(state().selectedStripId, null);
});

// ---- Undo, redo and persistence -------------------------------------------

test('animation edits are undoable and redoable as one step', () => {
	resetTimeline();
	sceneStore.load([], null);
	const before = sceneStore.historySize().past;
	sceneStore.animationEdit(() => timelineStore.addKeyframe('obj-a', pose(0, [3, 0, 0])));
	assert.equal(sceneStore.historySize().past, before + 1);
	assert.equal(state().keyframes.get('obj-a')!.length, 1);

	sceneStore.undo();
	assert.equal(state().keyframes.get('obj-a'), undefined);
	assert.deepEqual(state().curves.get('obj-a'), undefined);

	sceneStore.redo();
	assert.equal(state().keyframes.get('obj-a')!.length, 1);
	assert.deepEqual(state().keyframes.get('obj-a')![0].position, [3, 0, 0]);
});

test('a key drag is one undo entry, not one per pointer move', () => {
	resetTimeline();
	timelineStore.addKeyframe('obj-a', pose(0, [0, 0, 0]));
	timelineStore.addKeyframe('obj-a', pose(2, [2, 0, 0]));
	const before = sceneStore.historySize().past;

	sceneStore.beginAnimationEdit();
	timelineStore.moveKeyframe('obj-a', 0, 0.5);
	timelineStore.moveKeyframe('obj-a', 0.5, 1);
	timelineStore.moveKeyframe('obj-a', 1, 1.5);
	sceneStore.endAnimationEdit();

	assert.equal(sceneStore.historySize().past, before + 1);
	sceneStore.undo();
	assert.deepEqual(channelTimes('obj-a', 'location.x'), [0, 2]);

	sceneStore.redo();
	assert.deepEqual(channelTimes('obj-a', 'location.x'), [1.5, 2]);
});

test('undo of a strip edit restores the strip list', () => {
	resetTimeline();
	timelineStore.setDuration(10);
	timelineStore.addKeyframe('obj-a', pose(0, [0, 0, 0]));
	timelineStore.addStrip('obj-a', 0, 2);
	sceneStore.animationEdit(() => timelineStore.duplicateStrip(state().strips[0].id));
	assert.equal(state().strips.length, 2);
	sceneStore.undo();
	assert.equal(state().strips.length, 1);
	sceneStore.redo();
	assert.equal(state().strips.length, 2);
});

test('saving and reloading a project keeps keys, curves and strips', () => {
	resetTimeline();
	sceneStore.load([], null);
	sceneStore.addPrimitive('cube');
	const objectId = get(sceneStore).selectedId!;
	timelineStore.setDuration(4.5);
	timelineStore.setFrameRate(25);
	timelineStore.addKeyframe(objectId, pose(0, [0, 0.5, 0]));
	timelineStore.addKeyframe(objectId, pose(2, [2, 0.5, 0]));
	timelineStore.addStrip(objectId, 0, 2);

	const project = createProject('Animation round trip');
	const restored = validateProject(JSON.parse(JSON.stringify(project)));
	assert.equal(restored.timeline.duration, 4.5);
	assert.equal(restored.timeline.frameRate, 25);
	assert.equal(restored.timeline.keyframes[objectId].length, 2);
	assert.equal(Object.keys(restored.timeline.curves[objectId]).length, 10);
	assert.equal(restored.timeline.strips.length, 1);

	resetTimeline();
	applyProject(restored);
	assert.equal(state().duration, 4.5);
	assert.equal(state().frameRate, 25);
	assert.equal(state().keyframes.get(objectId)!.length, 2);
	assert.deepEqual(
		timelineStore.evaluate(1, false).get(objectId)!.position!.map((value) => Math.round(value * 10) / 10),
		[1, 0.5, 0],
	);
	assert.equal(state().strips.length, 1);
});

test('animation for a deleted object is ignored safely', () => {
	resetTimeline();
	sceneStore.load([], null);
	timelineStore.addKeyframe('ghost-object', pose(0, [1, 1, 1]));
	const historyBefore = sceneStore.historySize().past;
	sceneStore.applyAnimation(timelineStore.evaluate(0, true));
	assert.equal(get(sceneStore).objects.length, 0, 'no object is created for an orphan track');
	assert.equal(sceneStore.historySize().past, historyBefore, 'applying animation is not an undo step');
});

test('dragging a layer slides every key, curve and strip together', () => {
	resetTimeline();
	timelineStore.addKeyframe('obj-a', pose(0, [0, 0, 0]));
	timelineStore.addKeyframe('obj-a', pose(2, [2, 0, 0]));

	timelineStore.shiftLayer('obj-a', 1);

	assert.deepEqual(
		state().keyframes.get('obj-a')!.map((key) => key.time),
		[1, 3],
		'keys move by the same amount',
	);
	assert.deepEqual(channelTimes('obj-a', 'location.x'), [1, 3], 'curves follow the poses');
	assert.deepEqual(timelineStore.evaluate(1, true).get('obj-a')!.position, [0, 0, 0]);
});

test('dragging a layer moves its action strips too', () => {
	resetTimeline();
	timelineStore.addKeyframe('obj-a', pose(0, [0, 0, 0]));
	timelineStore.addKeyframe('obj-a', pose(2, [2, 0, 0]));
	timelineStore.addStrip('obj-a', 0.5, 1.5);
	assert.equal(state().strips.length, 1, 'the strip exists before the drag');

	timelineStore.shiftLayer('obj-a', 1);
	const strip = state().strips[0];
	assert.equal(strip.start, 1.5);
	assert.equal(strip.end, 2.5);
});

test('a layer cannot be dragged out of the timeline', () => {
	resetTimeline();
	timelineStore.setDuration(5);
	timelineStore.addKeyframe('obj-a', pose(1, [0, 0, 0]));
	timelineStore.addKeyframe('obj-a', pose(2, [2, 0, 0]));

	timelineStore.shiftLayer('obj-a', -4);
	assert.deepEqual(state().keyframes.get('obj-a')!.map((key) => key.time), [0, 1], 'stops at zero');

	timelineStore.shiftLayer('obj-a', 99);
	assert.deepEqual(state().keyframes.get('obj-a')!.map((key) => key.time), [4, 5], 'stops at the duration');
});

test('a layer without keys or strips has nothing to drag', () => {
	resetTimeline();
	const before = timelineStore.snapshotAnimation();
	timelineStore.shiftLayer('obj-empty', 2);
	assert.deepEqual(timelineStore.snapshotAnimation(), before);
});

test('a layer clip can be placed and slid, clamped to the timeline', () => {
	resetTimeline();
	timelineStore.setDuration(5);
	timelineStore.setClip('obj-a', 1, 3);
	assert.deepEqual(state().clips.get('obj-a'), { start: 1, end: 3 });

	timelineStore.shiftClip('obj-a', -4);
	assert.deepEqual(state().clips.get('obj-a'), { start: 0, end: 2 }, 'stops at zero');

	timelineStore.shiftClip('obj-a', 99);
	assert.deepEqual(state().clips.get('obj-a'), { start: 3, end: 5 }, 'stops at the duration');

	timelineStore.setClip('obj-a', 4, 4);
	assert.deepEqual(state().clips.get('obj-a'), { start: 3, end: 5 }, 'an empty clip is ignored');
});

test('a layer bar can be stretched to the end of the timeline', () => {
	resetTimeline();
	timelineStore.setDuration(5);
	timelineStore.setClip('obj-a', 0, 3);
	timelineStore.setClip('obj-a', 0, 5);
	assert.deepEqual(state().clips.get('obj-a'), { start: 0, end: 5 }, 'the bar reaches the last second');

	timelineStore.setClip('obj-a', 0, 99);
	assert.deepEqual(state().clips.get('obj-a'), { start: 0, end: 5 }, 'it stops at the duration');
});
