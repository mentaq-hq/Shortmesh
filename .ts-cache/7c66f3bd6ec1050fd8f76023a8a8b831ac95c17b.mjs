import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { stripActionTime, timelineStore } from '../src/stores/timeline.ts';
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
function pose(time, position, scale = [1, 1, 1]) {
  return {
    time,
    position,
    rotation: [0, 0, 0],
    scale
  };
}
function setLinear(objectId) {
  for (const path of TRANSFORM_CHANNELS) timelineStore.setInterpolation(objectId, path, 'linear');
}
function channelTimes(objectId, path) {
  return (state().curves.get(objectId)?.get(path)?.keys ?? []).map(key => key.time);
}
function strip(overrides = {}) {
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
    ...overrides
  };
}

// ---- Keyframes -------------------------------------------------------------

test('addKeyframe writes a pose and all ten transform channels', () => {
  resetTimeline();
  timelineStore.addKeyframe('obj-a', pose(1, [1, 2, 3], [2, 2, 2]));
  const entry = state().curves.get('obj-a');
  assert.ok(entry, 'the object has curves');
  assert.equal(entry.size, 10);
  for (const path of TRANSFORM_CHANNELS) {
    assert.equal(entry.get(path).keys.length, 1, `${path} has one key`);
  }
  assert.equal(state().keyframes.get('obj-a').length, 1);
  assert.deepEqual(state().selectedKey, {
    objectId: 'obj-a',
    time: 1
  });
});
test('addKeyframe replaces a key within the epsilon instead of duplicating it', () => {
  resetTimeline();
  timelineStore.addKeyframe('obj-a', pose(1, [0, 0, 0]));
  timelineStore.addKeyframe('obj-a', pose(1.0004, [4, 0, 0]));
  const keys = state().keyframes.get('obj-a');
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
  assert.deepEqual(state().keyframes.get('obj-a').map(key => key.time), [0, 1, 2]);
});
test('position and scale interpolate linearly between two keys', () => {
  resetTimeline();
  timelineStore.addKeyframe('obj-a', pose(0, [0, 0, 0], [1, 1, 1]));
  timelineStore.addKeyframe('obj-a', pose(2, [4, 2, -2], [3, 5, 1]));
  setLinear('obj-a');
  const half = timelineStore.evaluate(1, false).get('obj-a');
  assert.deepEqual(half.position, [2, 1, -1]);
  assert.deepEqual(half.scale, [2, 3, 1], 'scale is interpolated per component');
  const quarter = timelineStore.evaluate(0.5, false).get('obj-a');
  assert.deepEqual(quarter.position, [1, 0.5, -0.5]);
});
test('evaluation clamps to the first and the last key', () => {
  resetTimeline();
  timelineStore.addKeyframe('obj-a', pose(1, [1, 0, 0]));
  timelineStore.addKeyframe('obj-a', pose(2, [2, 0, 0]));
  assert.deepEqual(timelineStore.evaluate(0, true).get('obj-a').position, [1, 0, 0]);
  assert.deepEqual(timelineStore.evaluate(10, true).get('obj-a').position, [2, 0, 0]);
  assert.deepEqual(timelineStore.evaluate(1, true).get('obj-a').position, [1, 0, 0], 'exact key time');
});
test('a single key is a constant pose', () => {
  resetTimeline();
  timelineStore.addKeyframe('obj-a', pose(1, [3, 4, 5]));
  assert.deepEqual(timelineStore.evaluate(0, true).get('obj-a').position, [3, 4, 5]);
  assert.deepEqual(timelineStore.evaluate(99, true).get('obj-a').position, [3, 4, 5]);
});
test('rotation takes the shortest path instead of spinning the long way', () => {
  resetTimeline();
  timelineStore.addKeyframe('obj-a', {
    time: 0,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  });
  timelineStore.addKeyframe('obj-a', {
    time: 1,
    position: [0, 0, 0],
    rotation: [0, 0, Math.PI * 1.9],
    scale: [1, 1, 1]
  });
  setLinear('obj-a');
  const half = timelineStore.evaluate(0.5, false).get('obj-a');
  assert.ok(half.rotation);
  // 1.9 * PI is equivalent to -0.1 * PI, so the shortest arc ends at -0.05 * PI.
  assert.ok(Math.abs(half.rotation[2] - -0.05 * Math.PI) < 1e-6, `expected -0.05 PI, got ${half.rotation[2]}`);
});
test('the ease toggle changes real evaluated values', () => {
  resetTimeline();
  timelineStore.addKeyframe('obj-a', pose(0, [0, 0, 0]));
  timelineStore.addKeyframe('obj-a', pose(1, [10, 0, 0]));
  // Bezier keys are the default, so easing is active.
  const eased = timelineStore.evaluate(0.25, true).get('obj-a').position[0];
  const linear = timelineStore.evaluate(0.25, false).get('obj-a').position[0];
  assert.ok(Math.abs(linear - 2.5) < 1e-9, 'ease off is linear');
  assert.ok(Math.abs(eased - 1.5625) < 1e-6, 'auto handles produce smoothstep');
});
test('a missing scale channel falls back to 1, never to zero', () => {
  resetTimeline();
  timelineStore.addKeyframe('obj-a', pose(0, [0, 0, 0], [2, 2, 2]));
  const entry = state().curves.get('obj-a');
  entry.get('scale.y').keys = [];
  entry.get('scale.z').keys = [];
  const scale = timelineStore.evaluate(0, true).get('obj-a').scale;
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
  assert.deepEqual(state().selectedKey, {
    objectId: 'obj-a',
    time: 0
  });
});
test('moving a key moves every channel, the pose and the selection', () => {
  resetTimeline();
  timelineStore.addKeyframe('obj-a', pose(0, [0, 0, 0]));
  timelineStore.addKeyframe('obj-a', pose(2, [2, 0, 0]));
  timelineStore.selectKeyframe('obj-a', 0);
  timelineStore.moveKeyframe('obj-a', 0, 1);
  assert.deepEqual(channelTimes('obj-a', 'location.x'), [1, 2]);
  assert.equal(state().keyframes.get('obj-a')[0].time, 1);
  assert.deepEqual(channelTimes('obj-a', 'rotation_quaternion.z'), [1, 2]);
  assert.deepEqual(state().selectedKey, {
    objectId: 'obj-a',
    time: 1
  });
  assert.deepEqual(timelineStore.evaluate(1, true).get('obj-a').position, [0, 0, 0]);
});
test('moving a key clamps at zero and merges on a collision', () => {
  resetTimeline();
  timelineStore.addKeyframe('obj-a', pose(0, [0, 0, 0]));
  timelineStore.addKeyframe('obj-a', pose(1, [1, 0, 0]));
  timelineStore.addKeyframe('obj-a', pose(2, [2, 0, 0]));
  timelineStore.moveKeyframe('obj-a', 1, 2);
  assert.deepEqual(channelTimes('obj-a', 'location.x'), [0, 2], 'no duplicate key');
  assert.deepEqual(state().keyframes.get('obj-a').map(key => key.time), [0, 2]);
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
  assert.deepEqual(state().keyframes.get('obj-a').map(key => key.time), [0]);
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
  assert.deepEqual(timelineStore.evaluate(0, true).get('obj-a').position, [7, 0, 0]);
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
  assert.equal(state().keyframes.get('obj-a').length, 2, 'no duplicate keys');
  assert.equal([...state().curves.get('obj-a').values()][0].keys.length, 2);
});
test('the full key edit flow drives the scene transform', () => {
  resetTimeline();
  sceneStore.load([], null);
  sceneStore.addPrimitive('cube');
  const id = get(sceneStore).selectedId;
  const object = get(sceneStore).objects[0];

  // Key the cube on the floor at t = 0.
  timelineStore.setTime(0);
  timelineStore.addKeyframe(id, {
    time: 0,
    position: [...object.position],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  });

  // Move it and key the new pose at t = 2.
  sceneStore.setTransform(id, {
    position: [2, 0.5, 0]
  });
  timelineStore.setTime(2);
  const moved = get(sceneStore).objects[0];
  timelineStore.addKeyframe(id, {
    time: 2,
    position: [...moved.position],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  });
  setLinear(id);
  const atStart = timelineStore.evaluate(0, false).get(id);
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
  assert.equal(stripActionTime({
    ...base,
    speed: 2
  }, 2), 4);
  assert.equal(stripActionTime({
    ...base,
    reversed: true
  }, 2), 8);
  assert.equal(stripActionTime({
    ...base,
    frozen: true
  }, 4), 0, 'freeze holds the first action frame');
  assert.equal(stripActionTime({
    ...base,
    speed: 2
  }, 100), 10, 'clamps to the action end');
});
test('strips drive the evaluated transform only inside their range', () => {
  resetTimeline();
  timelineStore.addKeyframe('obj-a', pose(0, [0, 0, 0]));
  timelineStore.addKeyframe('obj-a', pose(2, [4, 0, 0]));
  setLinear('obj-a');
  timelineStore.addStrip('obj-a', 1, 3);
  const stripId = state().selectedStripId;
  timelineStore.updateStrip(stripId, {
    speed: 2,
    actionEnd: 2
  });

  // Inside the strip: action time runs twice as fast.
  assert.deepEqual(timelineStore.evaluate(1.5, false).get('obj-a').position, [2, 0, 0]);
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
  timelineStore.updateStrip(original.id, {
    actionStart: 0,
    actionEnd: 4,
    speed: 2,
    reversed: true
  });
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
  assert.equal(state().keyframes.get('obj-a').length, 1);
  sceneStore.undo();
  assert.equal(state().keyframes.get('obj-a'), undefined);
  assert.deepEqual(state().curves.get('obj-a'), undefined);
  sceneStore.redo();
  assert.equal(state().keyframes.get('obj-a').length, 1);
  assert.deepEqual(state().keyframes.get('obj-a')[0].position, [3, 0, 0]);
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
  const objectId = get(sceneStore).selectedId;
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
  assert.equal(state().keyframes.get(objectId).length, 2);
  assert.deepEqual(timelineStore.evaluate(1, false).get(objectId).position.map(value => Math.round(value * 10) / 10), [1, 0.5, 0]);
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
  assert.deepEqual(state().keyframes.get('obj-a').map(key => key.time), [1, 3], 'keys move by the same amount');
  assert.deepEqual(channelTimes('obj-a', 'location.x'), [1, 3], 'curves follow the poses');
  assert.deepEqual(timelineStore.evaluate(1, true).get('obj-a').position, [0, 0, 0]);
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
  assert.deepEqual(state().keyframes.get('obj-a').map(key => key.time), [0, 1], 'stops at zero');
  timelineStore.shiftLayer('obj-a', 99);
  assert.deepEqual(state().keyframes.get('obj-a').map(key => key.time), [4, 5], 'stops at the duration');
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
  assert.deepEqual(state().clips.get('obj-a'), {
    start: 1,
    end: 3
  });
  timelineStore.shiftClip('obj-a', -4);
  assert.deepEqual(state().clips.get('obj-a'), {
    start: 0,
    end: 2
  }, 'stops at zero');
  timelineStore.shiftClip('obj-a', 99);
  assert.deepEqual(state().clips.get('obj-a'), {
    start: 3,
    end: 5
  }, 'stops at the duration');
  timelineStore.setClip('obj-a', 4, 4);
  assert.deepEqual(state().clips.get('obj-a'), {
    start: 3,
    end: 5
  }, 'an empty clip is ignored');
});
test('a layer bar can be stretched to the end of the timeline', () => {
  resetTimeline();
  timelineStore.setDuration(5);
  timelineStore.setClip('obj-a', 0, 3);
  timelineStore.setClip('obj-a', 0, 5);
  assert.deepEqual(state().clips.get('obj-a'), {
    start: 0,
    end: 5
  }, 'the bar reaches the last second');
  timelineStore.setClip('obj-a', 0, 99);
  assert.deepEqual(state().clips.get('obj-a'), {
    start: 0,
    end: 5
  }, 'it stops at the duration');
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6W10sInNvdXJjZXMiOlsiYW5pbWF0aW9uLnRlc3QudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgdGVzdCB9IGZyb20gJ25vZGU6dGVzdCc7XG5pbXBvcnQgYXNzZXJ0IGZyb20gJ25vZGU6YXNzZXJ0L3N0cmljdCc7XG5pbXBvcnQgeyBnZXQgfSBmcm9tICdzdmVsdGUvc3RvcmUnO1xuaW1wb3J0IHtcblx0c3RyaXBBY3Rpb25UaW1lLFxuXHR0aW1lbGluZVN0b3JlLFxuXHR0eXBlIEtleWZyYW1lRGF0YSxcblx0dHlwZSBObGFTdHJpcCxcbn0gZnJvbSAnLi4vc3JjL3N0b3Jlcy90aW1lbGluZS50cyc7XG5pbXBvcnQgeyBUUkFOU0ZPUk1fQ0hBTk5FTFMgfSBmcm9tICcuLi9zcmMvbGliL2ZjdXJ2ZS50cyc7XG5pbXBvcnQgeyBzY2VuZVN0b3JlIH0gZnJvbSAnLi4vc3JjL3N0b3Jlcy9zY2VuZS50cyc7XG5pbXBvcnQgeyBjcmVhdGVQcm9qZWN0LCB2YWxpZGF0ZVByb2plY3QsIGFwcGx5UHJvamVjdCB9IGZyb20gJy4uL3NyYy9saWIvcHJvamVjdC50cyc7XG5cbmNvbnN0IHN0YXRlID0gKCkgPT4gZ2V0KHRpbWVsaW5lU3RvcmUpO1xuXG5mdW5jdGlvbiByZXNldFRpbWVsaW5lKCkge1xuXHR0aW1lbGluZVN0b3JlLmNsZWFyS2V5ZnJhbWVzKCk7XG5cdHRpbWVsaW5lU3RvcmUuc2V0RHVyYXRpb24oNSk7XG5cdHRpbWVsaW5lU3RvcmUuc2V0TG9vcCh0cnVlKTtcblx0dGltZWxpbmVTdG9yZS5zZXRFYXNpbmcodHJ1ZSk7XG5cdHRpbWVsaW5lU3RvcmUuc2V0RnJhbWVSYXRlKDMwKTtcblx0dGltZWxpbmVTdG9yZS5zZXRQbGF5aW5nKGZhbHNlKTtcblx0dGltZWxpbmVTdG9yZS5zZXRUaW1lKDApO1xufVxuXG5mdW5jdGlvbiBwb3NlKHRpbWU6IG51bWJlciwgcG9zaXRpb246IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSwgc2NhbGU6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSA9IFsxLCAxLCAxXSk6IEtleWZyYW1lRGF0YSB7XG5cdHJldHVybiB7IHRpbWUsIHBvc2l0aW9uLCByb3RhdGlvbjogWzAsIDAsIDBdLCBzY2FsZSB9O1xufVxuXG5mdW5jdGlvbiBzZXRMaW5lYXIob2JqZWN0SWQ6IHN0cmluZykge1xuXHRmb3IgKGNvbnN0IHBhdGggb2YgVFJBTlNGT1JNX0NIQU5ORUxTKSB0aW1lbGluZVN0b3JlLnNldEludGVycG9sYXRpb24ob2JqZWN0SWQsIHBhdGgsICdsaW5lYXInKTtcbn1cblxuZnVuY3Rpb24gY2hhbm5lbFRpbWVzKG9iamVjdElkOiBzdHJpbmcsIHBhdGg6IHN0cmluZyk6IG51bWJlcltdIHtcblx0cmV0dXJuIChzdGF0ZSgpLmN1cnZlcy5nZXQob2JqZWN0SWQpPy5nZXQocGF0aCk/LmtleXMgPz8gW10pLm1hcCgoa2V5KSA9PiBrZXkudGltZSk7XG59XG5cbmZ1bmN0aW9uIHN0cmlwKG92ZXJyaWRlczogUGFydGlhbDxObGFTdHJpcD4gPSB7fSk6IE5sYVN0cmlwIHtcblx0cmV0dXJuIHtcblx0XHRpZDogJ3N0cmlwLXRlc3QnLFxuXHRcdG9iamVjdElkOiAnb2JqLWEnLFxuXHRcdG5hbWU6ICdBY3Rpb24nLFxuXHRcdHN0YXJ0OiAwLFxuXHRcdGVuZDogNSxcblx0XHRhY3Rpb25TdGFydDogMCxcblx0XHRhY3Rpb25FbmQ6IDEwLFxuXHRcdHNwZWVkOiAxLFxuXHRcdHJldmVyc2VkOiBmYWxzZSxcblx0XHRmcm96ZW46IGZhbHNlLFxuXHRcdG11dGVkOiBmYWxzZSxcblx0XHQuLi5vdmVycmlkZXMsXG5cdH07XG59XG5cbi8vIC0tLS0gS2V5ZnJhbWVzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxudGVzdCgnYWRkS2V5ZnJhbWUgd3JpdGVzIGEgcG9zZSBhbmQgYWxsIHRlbiB0cmFuc2Zvcm0gY2hhbm5lbHMnLCAoKSA9PiB7XG5cdHJlc2V0VGltZWxpbmUoKTtcblx0dGltZWxpbmVTdG9yZS5hZGRLZXlmcmFtZSgnb2JqLWEnLCBwb3NlKDEsIFsxLCAyLCAzXSwgWzIsIDIsIDJdKSk7XG5cdGNvbnN0IGVudHJ5ID0gc3RhdGUoKS5jdXJ2ZXMuZ2V0KCdvYmotYScpO1xuXHRhc3NlcnQub2soZW50cnksICd0aGUgb2JqZWN0IGhhcyBjdXJ2ZXMnKTtcblx0YXNzZXJ0LmVxdWFsKGVudHJ5IS5zaXplLCAxMCk7XG5cdGZvciAoY29uc3QgcGF0aCBvZiBUUkFOU0ZPUk1fQ0hBTk5FTFMpIHtcblx0XHRhc3NlcnQuZXF1YWwoZW50cnkhLmdldChwYXRoKSEua2V5cy5sZW5ndGgsIDEsIGAke3BhdGh9IGhhcyBvbmUga2V5YCk7XG5cdH1cblx0YXNzZXJ0LmVxdWFsKHN0YXRlKCkua2V5ZnJhbWVzLmdldCgnb2JqLWEnKSEubGVuZ3RoLCAxKTtcblx0YXNzZXJ0LmRlZXBFcXVhbChzdGF0ZSgpLnNlbGVjdGVkS2V5LCB7IG9iamVjdElkOiAnb2JqLWEnLCB0aW1lOiAxIH0pO1xufSk7XG5cbnRlc3QoJ2FkZEtleWZyYW1lIHJlcGxhY2VzIGEga2V5IHdpdGhpbiB0aGUgZXBzaWxvbiBpbnN0ZWFkIG9mIGR1cGxpY2F0aW5nIGl0JywgKCkgPT4ge1xuXHRyZXNldFRpbWVsaW5lKCk7XG5cdHRpbWVsaW5lU3RvcmUuYWRkS2V5ZnJhbWUoJ29iai1hJywgcG9zZSgxLCBbMCwgMCwgMF0pKTtcblx0dGltZWxpbmVTdG9yZS5hZGRLZXlmcmFtZSgnb2JqLWEnLCBwb3NlKDEuMDAwNCwgWzQsIDAsIDBdKSk7XG5cdGNvbnN0IGtleXMgPSBzdGF0ZSgpLmtleWZyYW1lcy5nZXQoJ29iai1hJykhO1xuXHRhc3NlcnQuZXF1YWwoa2V5cy5sZW5ndGgsIDEsICdvbmUga2V5Jyk7XG5cdGFzc2VydC5kZWVwRXF1YWwoa2V5c1swXS5wb3NpdGlvbiwgWzQsIDAsIDBdLCAndGhlIGxhdGVyIHZhbHVlIHdpbnMnKTtcblx0YXNzZXJ0LmRlZXBFcXVhbChjaGFubmVsVGltZXMoJ29iai1hJywgJ2xvY2F0aW9uLngnKSwgWzFdKTtcbn0pO1xuXG50ZXN0KCdhZGRLZXlmcmFtZSByZWplY3RzIG5vbi1maW5pdGUgdGltZSBhbmQga2VlcHMgdGhlIGtleXMgc29ydGVkJywgKCkgPT4ge1xuXHRyZXNldFRpbWVsaW5lKCk7XG5cdHRpbWVsaW5lU3RvcmUuYWRkS2V5ZnJhbWUoJ29iai1hJywgcG9zZShOdW1iZXIuTmFOLCBbMCwgMCwgMF0pKTtcblx0YXNzZXJ0LmVxdWFsKHN0YXRlKCkua2V5ZnJhbWVzLmdldCgnb2JqLWEnKSwgdW5kZWZpbmVkLCAnbm8ga2V5IGZvciBhbiBpbnZhbGlkIHRpbWUnKTtcblxuXHR0aW1lbGluZVN0b3JlLmFkZEtleWZyYW1lKCdvYmotYScsIHBvc2UoMiwgWzIsIDAsIDBdKSk7XG5cdHRpbWVsaW5lU3RvcmUuYWRkS2V5ZnJhbWUoJ29iai1hJywgcG9zZSgwLCBbMCwgMCwgMF0pKTtcblx0dGltZWxpbmVTdG9yZS5hZGRLZXlmcmFtZSgnb2JqLWEnLCBwb3NlKDEsIFsxLCAwLCAwXSkpO1xuXHRhc3NlcnQuZGVlcEVxdWFsKFxuXHRcdHN0YXRlKCkua2V5ZnJhbWVzLmdldCgnb2JqLWEnKSEubWFwKChrZXkpID0+IGtleS50aW1lKSxcblx0XHRbMCwgMSwgMl0sXG5cdCk7XG59KTtcblxudGVzdCgncG9zaXRpb24gYW5kIHNjYWxlIGludGVycG9sYXRlIGxpbmVhcmx5IGJldHdlZW4gdHdvIGtleXMnLCAoKSA9PiB7XG5cdHJlc2V0VGltZWxpbmUoKTtcblx0dGltZWxpbmVTdG9yZS5hZGRLZXlmcmFtZSgnb2JqLWEnLCBwb3NlKDAsIFswLCAwLCAwXSwgWzEsIDEsIDFdKSk7XG5cdHRpbWVsaW5lU3RvcmUuYWRkS2V5ZnJhbWUoJ29iai1hJywgcG9zZSgyLCBbNCwgMiwgLTJdLCBbMywgNSwgMV0pKTtcblx0c2V0TGluZWFyKCdvYmotYScpO1xuXG5cdGNvbnN0IGhhbGYgPSB0aW1lbGluZVN0b3JlLmV2YWx1YXRlKDEsIGZhbHNlKS5nZXQoJ29iai1hJykhO1xuXHRhc3NlcnQuZGVlcEVxdWFsKGhhbGYucG9zaXRpb24sIFsyLCAxLCAtMV0pO1xuXHRhc3NlcnQuZGVlcEVxdWFsKGhhbGYuc2NhbGUsIFsyLCAzLCAxXSwgJ3NjYWxlIGlzIGludGVycG9sYXRlZCBwZXIgY29tcG9uZW50Jyk7XG5cblx0Y29uc3QgcXVhcnRlciA9IHRpbWVsaW5lU3RvcmUuZXZhbHVhdGUoMC41LCBmYWxzZSkuZ2V0KCdvYmotYScpITtcblx0YXNzZXJ0LmRlZXBFcXVhbChxdWFydGVyLnBvc2l0aW9uLCBbMSwgMC41LCAtMC41XSk7XG59KTtcblxudGVzdCgnZXZhbHVhdGlvbiBjbGFtcHMgdG8gdGhlIGZpcnN0IGFuZCB0aGUgbGFzdCBrZXknLCAoKSA9PiB7XG5cdHJlc2V0VGltZWxpbmUoKTtcblx0dGltZWxpbmVTdG9yZS5hZGRLZXlmcmFtZSgnb2JqLWEnLCBwb3NlKDEsIFsxLCAwLCAwXSkpO1xuXHR0aW1lbGluZVN0b3JlLmFkZEtleWZyYW1lKCdvYmotYScsIHBvc2UoMiwgWzIsIDAsIDBdKSk7XG5cdGFzc2VydC5kZWVwRXF1YWwodGltZWxpbmVTdG9yZS5ldmFsdWF0ZSgwLCB0cnVlKS5nZXQoJ29iai1hJykhLnBvc2l0aW9uLCBbMSwgMCwgMF0pO1xuXHRhc3NlcnQuZGVlcEVxdWFsKHRpbWVsaW5lU3RvcmUuZXZhbHVhdGUoMTAsIHRydWUpLmdldCgnb2JqLWEnKSEucG9zaXRpb24sIFsyLCAwLCAwXSk7XG5cdGFzc2VydC5kZWVwRXF1YWwodGltZWxpbmVTdG9yZS5ldmFsdWF0ZSgxLCB0cnVlKS5nZXQoJ29iai1hJykhLnBvc2l0aW9uLCBbMSwgMCwgMF0sICdleGFjdCBrZXkgdGltZScpO1xufSk7XG5cbnRlc3QoJ2Egc2luZ2xlIGtleSBpcyBhIGNvbnN0YW50IHBvc2UnLCAoKSA9PiB7XG5cdHJlc2V0VGltZWxpbmUoKTtcblx0dGltZWxpbmVTdG9yZS5hZGRLZXlmcmFtZSgnb2JqLWEnLCBwb3NlKDEsIFszLCA0LCA1XSkpO1xuXHRhc3NlcnQuZGVlcEVxdWFsKHRpbWVsaW5lU3RvcmUuZXZhbHVhdGUoMCwgdHJ1ZSkuZ2V0KCdvYmotYScpIS5wb3NpdGlvbiwgWzMsIDQsIDVdKTtcblx0YXNzZXJ0LmRlZXBFcXVhbCh0aW1lbGluZVN0b3JlLmV2YWx1YXRlKDk5LCB0cnVlKS5nZXQoJ29iai1hJykhLnBvc2l0aW9uLCBbMywgNCwgNV0pO1xufSk7XG5cbnRlc3QoJ3JvdGF0aW9uIHRha2VzIHRoZSBzaG9ydGVzdCBwYXRoIGluc3RlYWQgb2Ygc3Bpbm5pbmcgdGhlIGxvbmcgd2F5JywgKCkgPT4ge1xuXHRyZXNldFRpbWVsaW5lKCk7XG5cdHRpbWVsaW5lU3RvcmUuYWRkS2V5ZnJhbWUoJ29iai1hJywge1xuXHRcdHRpbWU6IDAsXG5cdFx0cG9zaXRpb246IFswLCAwLCAwXSxcblx0XHRyb3RhdGlvbjogWzAsIDAsIDBdLFxuXHRcdHNjYWxlOiBbMSwgMSwgMV0sXG5cdH0pO1xuXHR0aW1lbGluZVN0b3JlLmFkZEtleWZyYW1lKCdvYmotYScsIHtcblx0XHR0aW1lOiAxLFxuXHRcdHBvc2l0aW9uOiBbMCwgMCwgMF0sXG5cdFx0cm90YXRpb246IFswLCAwLCBNYXRoLlBJICogMS45XSxcblx0XHRzY2FsZTogWzEsIDEsIDFdLFxuXHR9KTtcblx0c2V0TGluZWFyKCdvYmotYScpO1xuXHRjb25zdCBoYWxmID0gdGltZWxpbmVTdG9yZS5ldmFsdWF0ZSgwLjUsIGZhbHNlKS5nZXQoJ29iai1hJykhO1xuXHRhc3NlcnQub2soaGFsZi5yb3RhdGlvbik7XG5cdC8vIDEuOSAqIFBJIGlzIGVxdWl2YWxlbnQgdG8gLTAuMSAqIFBJLCBzbyB0aGUgc2hvcnRlc3QgYXJjIGVuZHMgYXQgLTAuMDUgKiBQSS5cblx0YXNzZXJ0Lm9rKFxuXHRcdE1hdGguYWJzKGhhbGYucm90YXRpb24hWzJdIC0gLTAuMDUgKiBNYXRoLlBJKSA8IDFlLTYsXG5cdFx0YGV4cGVjdGVkIC0wLjA1IFBJLCBnb3QgJHtoYWxmLnJvdGF0aW9uIVsyXX1gLFxuXHQpO1xufSk7XG5cbnRlc3QoJ3RoZSBlYXNlIHRvZ2dsZSBjaGFuZ2VzIHJlYWwgZXZhbHVhdGVkIHZhbHVlcycsICgpID0+IHtcblx0cmVzZXRUaW1lbGluZSgpO1xuXHR0aW1lbGluZVN0b3JlLmFkZEtleWZyYW1lKCdvYmotYScsIHBvc2UoMCwgWzAsIDAsIDBdKSk7XG5cdHRpbWVsaW5lU3RvcmUuYWRkS2V5ZnJhbWUoJ29iai1hJywgcG9zZSgxLCBbMTAsIDAsIDBdKSk7XG5cdC8vIEJlemllciBrZXlzIGFyZSB0aGUgZGVmYXVsdCwgc28gZWFzaW5nIGlzIGFjdGl2ZS5cblx0Y29uc3QgZWFzZWQgPSB0aW1lbGluZVN0b3JlLmV2YWx1YXRlKDAuMjUsIHRydWUpLmdldCgnb2JqLWEnKSEucG9zaXRpb24hWzBdO1xuXHRjb25zdCBsaW5lYXIgPSB0aW1lbGluZVN0b3JlLmV2YWx1YXRlKDAuMjUsIGZhbHNlKS5nZXQoJ29iai1hJykhLnBvc2l0aW9uIVswXTtcblx0YXNzZXJ0Lm9rKE1hdGguYWJzKGxpbmVhciAtIDIuNSkgPCAxZS05LCAnZWFzZSBvZmYgaXMgbGluZWFyJyk7XG5cdGFzc2VydC5vayhNYXRoLmFicyhlYXNlZCAtIDEuNTYyNSkgPCAxZS02LCAnYXV0byBoYW5kbGVzIHByb2R1Y2Ugc21vb3Roc3RlcCcpO1xufSk7XG5cbnRlc3QoJ2EgbWlzc2luZyBzY2FsZSBjaGFubmVsIGZhbGxzIGJhY2sgdG8gMSwgbmV2ZXIgdG8gemVybycsICgpID0+IHtcblx0cmVzZXRUaW1lbGluZSgpO1xuXHR0aW1lbGluZVN0b3JlLmFkZEtleWZyYW1lKCdvYmotYScsIHBvc2UoMCwgWzAsIDAsIDBdLCBbMiwgMiwgMl0pKTtcblx0Y29uc3QgZW50cnkgPSBzdGF0ZSgpLmN1cnZlcy5nZXQoJ29iai1hJykhO1xuXHRlbnRyeS5nZXQoJ3NjYWxlLnknKSEua2V5cyA9IFtdO1xuXHRlbnRyeS5nZXQoJ3NjYWxlLnonKSEua2V5cyA9IFtdO1xuXHRjb25zdCBzY2FsZSA9IHRpbWVsaW5lU3RvcmUuZXZhbHVhdGUoMCwgdHJ1ZSkuZ2V0KCdvYmotYScpIS5zY2FsZSE7XG5cdGFzc2VydC5kZWVwRXF1YWwoc2NhbGUsIFsyLCAxLCAxXSk7XG59KTtcblxuLy8gLS0tLSBTZWxlY3Rpb24sIG1vdmUsIGRlbGV0ZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbnRlc3QoJ3NlbGVjdGluZyBhIGtleSBwYXJrcyB0aGUgcGxheWhlYWQgYW5kIHBhdXNlcyBwbGF5YmFjaycsICgpID0+IHtcblx0cmVzZXRUaW1lbGluZSgpO1xuXHR0aW1lbGluZVN0b3JlLmFkZEtleWZyYW1lKCdvYmotYScsIHBvc2UoMCwgWzAsIDAsIDBdKSk7XG5cdHRpbWVsaW5lU3RvcmUuYWRkS2V5ZnJhbWUoJ29iai1hJywgcG9zZSgyLCBbMiwgMCwgMF0pKTtcblx0dGltZWxpbmVTdG9yZS5zZXRUaW1lKDIpO1xuXHR0aW1lbGluZVN0b3JlLnNldFBsYXlpbmcodHJ1ZSk7XG5cdHRpbWVsaW5lU3RvcmUuc2VsZWN0S2V5ZnJhbWUoJ29iai1hJywgMCk7XG5cdGFzc2VydC5lcXVhbChzdGF0ZSgpLmN1cnJlbnRUaW1lLCAwKTtcblx0YXNzZXJ0LmVxdWFsKHN0YXRlKCkucGxheWluZywgZmFsc2UpO1xuXHRhc3NlcnQuZGVlcEVxdWFsKHN0YXRlKCkuc2VsZWN0ZWRLZXksIHsgb2JqZWN0SWQ6ICdvYmotYScsIHRpbWU6IDAgfSk7XG59KTtcblxudGVzdCgnbW92aW5nIGEga2V5IG1vdmVzIGV2ZXJ5IGNoYW5uZWwsIHRoZSBwb3NlIGFuZCB0aGUgc2VsZWN0aW9uJywgKCkgPT4ge1xuXHRyZXNldFRpbWVsaW5lKCk7XG5cdHRpbWVsaW5lU3RvcmUuYWRkS2V5ZnJhbWUoJ29iai1hJywgcG9zZSgwLCBbMCwgMCwgMF0pKTtcblx0dGltZWxpbmVTdG9yZS5hZGRLZXlmcmFtZSgnb2JqLWEnLCBwb3NlKDIsIFsyLCAwLCAwXSkpO1xuXHR0aW1lbGluZVN0b3JlLnNlbGVjdEtleWZyYW1lKCdvYmotYScsIDApO1xuXG5cdHRpbWVsaW5lU3RvcmUubW92ZUtleWZyYW1lKCdvYmotYScsIDAsIDEpO1xuXHRhc3NlcnQuZGVlcEVxdWFsKGNoYW5uZWxUaW1lcygnb2JqLWEnLCAnbG9jYXRpb24ueCcpLCBbMSwgMl0pO1xuXHRhc3NlcnQuZXF1YWwoc3RhdGUoKS5rZXlmcmFtZXMuZ2V0KCdvYmotYScpIVswXS50aW1lLCAxKTtcblx0YXNzZXJ0LmRlZXBFcXVhbChjaGFubmVsVGltZXMoJ29iai1hJywgJ3JvdGF0aW9uX3F1YXRlcm5pb24ueicpLCBbMSwgMl0pO1xuXHRhc3NlcnQuZGVlcEVxdWFsKHN0YXRlKCkuc2VsZWN0ZWRLZXksIHsgb2JqZWN0SWQ6ICdvYmotYScsIHRpbWU6IDEgfSk7XG5cdGFzc2VydC5kZWVwRXF1YWwodGltZWxpbmVTdG9yZS5ldmFsdWF0ZSgxLCB0cnVlKS5nZXQoJ29iai1hJykhLnBvc2l0aW9uLCBbMCwgMCwgMF0pO1xufSk7XG5cbnRlc3QoJ21vdmluZyBhIGtleSBjbGFtcHMgYXQgemVybyBhbmQgbWVyZ2VzIG9uIGEgY29sbGlzaW9uJywgKCkgPT4ge1xuXHRyZXNldFRpbWVsaW5lKCk7XG5cdHRpbWVsaW5lU3RvcmUuYWRkS2V5ZnJhbWUoJ29iai1hJywgcG9zZSgwLCBbMCwgMCwgMF0pKTtcblx0dGltZWxpbmVTdG9yZS5hZGRLZXlmcmFtZSgnb2JqLWEnLCBwb3NlKDEsIFsxLCAwLCAwXSkpO1xuXHR0aW1lbGluZVN0b3JlLmFkZEtleWZyYW1lKCdvYmotYScsIHBvc2UoMiwgWzIsIDAsIDBdKSk7XG5cblx0dGltZWxpbmVTdG9yZS5tb3ZlS2V5ZnJhbWUoJ29iai1hJywgMSwgMik7XG5cdGFzc2VydC5kZWVwRXF1YWwoY2hhbm5lbFRpbWVzKCdvYmotYScsICdsb2NhdGlvbi54JyksIFswLCAyXSwgJ25vIGR1cGxpY2F0ZSBrZXknKTtcblx0YXNzZXJ0LmRlZXBFcXVhbChzdGF0ZSgpLmtleWZyYW1lcy5nZXQoJ29iai1hJykhLm1hcCgoa2V5KSA9PiBrZXkudGltZSksIFswLCAyXSk7XG5cblx0dGltZWxpbmVTdG9yZS5tb3ZlS2V5ZnJhbWUoJ29iai1hJywgMCwgLTQpO1xuXHRhc3NlcnQuZGVlcEVxdWFsKGNoYW5uZWxUaW1lcygnb2JqLWEnLCAnbG9jYXRpb24ueCcpLCBbMCwgMl0sICduZWdhdGl2ZSB0aW1lIGNsYW1wcyB0byB6ZXJvJyk7XG59KTtcblxudGVzdCgnZGVsZXRpbmcgdGhlIHNlbGVjdGVkIGtleSBsZWF2ZXMgdGhlIG90aGVyIGtleXMgYW5kIGNoYW5uZWxzIGludGFjdCcsICgpID0+IHtcblx0cmVzZXRUaW1lbGluZSgpO1xuXHR0aW1lbGluZVN0b3JlLmFkZEtleWZyYW1lKCdvYmotYScsIHBvc2UoMCwgWzAsIDAsIDBdKSk7XG5cdHRpbWVsaW5lU3RvcmUuYWRkS2V5ZnJhbWUoJ29iai1hJywgcG9zZSgxLCBbMSwgMCwgMF0pKTtcblx0dGltZWxpbmVTdG9yZS5hZGRLZXlmcmFtZSgnb2JqLWInLCBwb3NlKDEsIFs1LCAwLCAwXSkpO1xuXG5cdHRpbWVsaW5lU3RvcmUuc2VsZWN0S2V5ZnJhbWUoJ29iai1hJywgMSk7XG5cdHRpbWVsaW5lU3RvcmUuZGVsZXRlU2VsZWN0ZWRLZXkoKTtcblxuXHRhc3NlcnQuZGVlcEVxdWFsKFxuXHRcdHN0YXRlKCkua2V5ZnJhbWVzLmdldCgnb2JqLWEnKSEubWFwKChrZXkpID0+IGtleS50aW1lKSxcblx0XHRbMF0sXG5cdCk7XG5cdGFzc2VydC5kZWVwRXF1YWwoY2hhbm5lbFRpbWVzKCdvYmotYScsICdsb2NhdGlvbi54JyksIFswXSk7XG5cdGFzc2VydC5kZWVwRXF1YWwoY2hhbm5lbFRpbWVzKCdvYmotYicsICdsb2NhdGlvbi54JyksIFsxXSwgJ290aGVyIG9iamVjdHMgdW50b3VjaGVkJyk7XG5cdGFzc2VydC5lcXVhbChzdGF0ZSgpLnNlbGVjdGVkS2V5LCBudWxsKTtcbn0pO1xuXG4vLyAtLS0tIFBsYXliYWNrIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbnRlc3QoJ3RpY2sgYWR2YW5jZXMgYnkgZWxhcHNlZCB0aW1lLCBzdG9wcyBhdCB0aGUgZW5kIGFuZCBjYW4gYmUgcGF1c2VkJywgKCkgPT4ge1xuXHRyZXNldFRpbWVsaW5lKCk7XG5cdHRpbWVsaW5lU3RvcmUuc2V0RHVyYXRpb24oMik7XG5cdHRpbWVsaW5lU3RvcmUuc2V0TG9vcChmYWxzZSk7XG5cdHRpbWVsaW5lU3RvcmUuc2V0VGltZSgwKTtcblx0dGltZWxpbmVTdG9yZS5zZXRQbGF5aW5nKHRydWUpO1xuXG5cdGFzc2VydC5lcXVhbCh0aW1lbGluZVN0b3JlLnRpY2soMC41KSwgMC41KTtcblx0YXNzZXJ0LmVxdWFsKHRpbWVsaW5lU3RvcmUudGljaygxKSwgMS41KTtcblx0YXNzZXJ0LmVxdWFsKHRpbWVsaW5lU3RvcmUudGljaygxKSwgMiwgJ2NsYW1wcyB0byB0aGUgZW5kJyk7XG5cdGFzc2VydC5lcXVhbChzdGF0ZSgpLnBsYXlpbmcsIGZhbHNlLCAncGxheWJhY2sgc3RvcHMgd2l0aG91dCBsb29wJyk7XG5cblx0Y29uc3Qgc3RvcHBlZCA9IHRpbWVsaW5lU3RvcmUudGljayg1KTtcblx0YXNzZXJ0LmVxdWFsKHN0b3BwZWQsIDIsICdhIHBhdXNlZCBjbG9jayBkb2VzIG5vdCBhZHZhbmNlJyk7XG59KTtcblxudGVzdCgnbG9vcGluZyB3cmFwcyB0byB0aGUgc3RhcnQgb2YgdGhlIHJlYWwgcGxheWJhY2sgcmFuZ2UnLCAoKSA9PiB7XG5cdHJlc2V0VGltZWxpbmUoKTtcblx0dGltZWxpbmVTdG9yZS5zZXREdXJhdGlvbigxKTtcblx0dGltZWxpbmVTdG9yZS5zZXRMb29wKHRydWUpO1xuXHR0aW1lbGluZVN0b3JlLnNldFRpbWUoMC44KTtcblx0dGltZWxpbmVTdG9yZS5zZXRQbGF5aW5nKHRydWUpO1xuXHRjb25zdCB0aW1lID0gdGltZWxpbmVTdG9yZS50aWNrKDAuMyk7XG5cdGFzc2VydC5vayhNYXRoLmFicyh0aW1lIC0gMC4xKSA8IDFlLTksIGBleHBlY3RlZCAwLjEsIGdvdCAke3RpbWV9YCk7XG5cdGFzc2VydC5lcXVhbChzdGF0ZSgpLnBsYXlpbmcsIHRydWUpO1xufSk7XG5cbnRlc3QoJ3BsYXkgZnJvbSB0aGUgZW5kIHJlc3RhcnRzIGF0IHplcm8sIHBhdXNlIGtlZXBzIHRoZSB0aW1lJywgKCkgPT4ge1xuXHRyZXNldFRpbWVsaW5lKCk7XG5cdHRpbWVsaW5lU3RvcmUuc2V0RHVyYXRpb24oMik7XG5cdHRpbWVsaW5lU3RvcmUuc2V0VGltZSgyKTtcblx0dGltZWxpbmVTdG9yZS50b2dnbGVQbGF5KCk7XG5cdGFzc2VydC5lcXVhbChzdGF0ZSgpLmN1cnJlbnRUaW1lLCAwLCAncGxheSBhdCB0aGUgZW5kIHJld2luZHMgZmlyc3QnKTtcblx0YXNzZXJ0LmVxdWFsKHN0YXRlKCkucGxheWluZywgdHJ1ZSk7XG5cdHRpbWVsaW5lU3RvcmUudGljaygwLjQpO1xuXHR0aW1lbGluZVN0b3JlLnRvZ2dsZVBsYXkoKTtcblx0YXNzZXJ0LmVxdWFsKHN0YXRlKCkucGxheWluZywgZmFsc2UpO1xuXHRhc3NlcnQub2soTWF0aC5hYnMoc3RhdGUoKS5jdXJyZW50VGltZSAtIDAuNCkgPCAxZS05LCAncGF1c2Uga2VlcHMgdGhlIHRpbWUnKTtcbn0pO1xuXG50ZXN0KCdzdGFydCByZXR1cm5zIHRvIHRoZSBmaXJzdCBmcmFtZSBhbmQgZXZhbHVhdGVzIHRoZSBmaXJzdCBwb3NlJywgKCkgPT4ge1xuXHRyZXNldFRpbWVsaW5lKCk7XG5cdHRpbWVsaW5lU3RvcmUuYWRkS2V5ZnJhbWUoJ29iai1hJywgcG9zZSgwLCBbNywgMCwgMF0pKTtcblx0dGltZWxpbmVTdG9yZS5hZGRLZXlmcmFtZSgnb2JqLWEnLCBwb3NlKDIsIFs5LCAwLCAwXSkpO1xuXHR0aW1lbGluZVN0b3JlLnNldFRpbWUoMS41KTtcblx0dGltZWxpbmVTdG9yZS5nb1RvU3RhcnQoKTtcblx0YXNzZXJ0LmVxdWFsKHN0YXRlKCkuY3VycmVudFRpbWUsIDApO1xuXHRhc3NlcnQuZGVlcEVxdWFsKHRpbWVsaW5lU3RvcmUuZXZhbHVhdGUoMCwgdHJ1ZSkuZ2V0KCdvYmotYScpIS5wb3NpdGlvbiwgWzcsIDAsIDBdKTtcbn0pO1xuXG50ZXN0KCduZXh0RnJhbWUgdXNlcyB0aGUgcHJvamVjdCBmcmFtZSByYXRlJywgKCkgPT4ge1xuXHRyZXNldFRpbWVsaW5lKCk7XG5cdHRpbWVsaW5lU3RvcmUuc2V0RnJhbWVSYXRlKDI0KTtcblx0dGltZWxpbmVTdG9yZS5zZXRUaW1lKDApO1xuXHR0aW1lbGluZVN0b3JlLm5leHRGcmFtZSgpO1xuXHRhc3NlcnQub2soTWF0aC5hYnMoc3RhdGUoKS5jdXJyZW50VGltZSAtIDEgLyAyNCkgPCAxZS05KTtcbn0pO1xuXG50ZXN0KCdwbGF5YmFjayBuZXZlciBjcmVhdGVzIHVuZG8gZW50cmllcycsICgpID0+IHtcblx0cmVzZXRUaW1lbGluZSgpO1xuXHR0aW1lbGluZVN0b3JlLmFkZEtleWZyYW1lKCdvYmotYScsIHBvc2UoMCwgWzAsIDAsIDBdKSk7XG5cdHRpbWVsaW5lU3RvcmUuYWRkS2V5ZnJhbWUoJ29iai1hJywgcG9zZSgxLCBbMSwgMCwgMF0pKTtcblx0Y29uc3QgYmVmb3JlID0gc2NlbmVTdG9yZS5oaXN0b3J5U2l6ZSgpLnBhc3Q7XG5cdHRpbWVsaW5lU3RvcmUuc2V0VGltZSgwKTtcblx0dGltZWxpbmVTdG9yZS5zZXRQbGF5aW5nKHRydWUpO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IDYwOyBpKyspIHRpbWVsaW5lU3RvcmUudGljaygxIC8gNjApO1xuXHR0aW1lbGluZVN0b3JlLnNldFBsYXlpbmcoZmFsc2UpO1xuXHRhc3NlcnQuZXF1YWwoc2NlbmVTdG9yZS5oaXN0b3J5U2l6ZSgpLnBhc3QsIGJlZm9yZSk7XG59KTtcblxudGVzdCgnc2V0VGltZSBjbGFtcHMgdG8gdGhlIHBsYXliYWNrIHJhbmdlJywgKCkgPT4ge1xuXHRyZXNldFRpbWVsaW5lKCk7XG5cdHRpbWVsaW5lU3RvcmUuc2V0RHVyYXRpb24oMyk7XG5cdHRpbWVsaW5lU3RvcmUuc2V0VGltZSgtMSk7XG5cdGFzc2VydC5lcXVhbChzdGF0ZSgpLmN1cnJlbnRUaW1lLCAwKTtcblx0dGltZWxpbmVTdG9yZS5zZXRUaW1lKDkpO1xuXHRhc3NlcnQuZXF1YWwoc3RhdGUoKS5jdXJyZW50VGltZSwgMyk7XG59KTtcblxudGVzdCgncGxheWJhY2sgZG9lcyBub3QgbXV0YXRlIHRoZSBhbmltYXRpb24gZGF0YScsICgpID0+IHtcblx0cmVzZXRUaW1lbGluZSgpO1xuXHR0aW1lbGluZVN0b3JlLmFkZEtleWZyYW1lKCdvYmotYScsIHBvc2UoMCwgWzAsIDAsIDBdKSk7XG5cdHRpbWVsaW5lU3RvcmUuYWRkS2V5ZnJhbWUoJ29iai1hJywgcG9zZSgyLCBbMiwgMCwgMF0pKTtcblx0Y29uc3QgYmVmb3JlID0gSlNPTi5zdHJpbmdpZnkodGltZWxpbmVTdG9yZS5zbmFwc2hvdEFuaW1hdGlvbigpKTtcblx0dGltZWxpbmVTdG9yZS5zZXRUaW1lKDApO1xuXHR0aW1lbGluZVN0b3JlLnNldFBsYXlpbmcodHJ1ZSk7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgMTAwMDsgaSsrKSB0aW1lbGluZVN0b3JlLnRpY2soMSAvIDYwKTtcblx0dGltZWxpbmVTdG9yZS5zZXRQbGF5aW5nKGZhbHNlKTtcblx0YXNzZXJ0LmVxdWFsKEpTT04uc3RyaW5naWZ5KHRpbWVsaW5lU3RvcmUuc25hcHNob3RBbmltYXRpb24oKSksIGJlZm9yZSwgJ2RhdGEgaXMgdW5jaGFuZ2VkJyk7XG5cdGFzc2VydC5lcXVhbChzdGF0ZSgpLmtleWZyYW1lcy5nZXQoJ29iai1hJykhLmxlbmd0aCwgMiwgJ25vIGR1cGxpY2F0ZSBrZXlzJyk7XG5cdGFzc2VydC5lcXVhbChbLi4uc3RhdGUoKS5jdXJ2ZXMuZ2V0KCdvYmotYScpIS52YWx1ZXMoKV1bMF0ua2V5cy5sZW5ndGgsIDIpO1xufSk7XG5cbnRlc3QoJ3RoZSBmdWxsIGtleSBlZGl0IGZsb3cgZHJpdmVzIHRoZSBzY2VuZSB0cmFuc2Zvcm0nLCAoKSA9PiB7XG5cdHJlc2V0VGltZWxpbmUoKTtcblx0c2NlbmVTdG9yZS5sb2FkKFtdLCBudWxsKTtcblx0c2NlbmVTdG9yZS5hZGRQcmltaXRpdmUoJ2N1YmUnKTtcblx0Y29uc3QgaWQgPSBnZXQoc2NlbmVTdG9yZSkuc2VsZWN0ZWRJZCE7XG5cdGNvbnN0IG9iamVjdCA9IGdldChzY2VuZVN0b3JlKS5vYmplY3RzWzBdO1xuXG5cdC8vIEtleSB0aGUgY3ViZSBvbiB0aGUgZmxvb3IgYXQgdCA9IDAuXG5cdHRpbWVsaW5lU3RvcmUuc2V0VGltZSgwKTtcblx0dGltZWxpbmVTdG9yZS5hZGRLZXlmcmFtZShpZCwge1xuXHRcdHRpbWU6IDAsXG5cdFx0cG9zaXRpb246IFsuLi5vYmplY3QucG9zaXRpb25dIGFzIFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSxcblx0XHRyb3RhdGlvbjogWzAsIDAsIDBdLFxuXHRcdHNjYWxlOiBbMSwgMSwgMV0sXG5cdH0pO1xuXG5cdC8vIE1vdmUgaXQgYW5kIGtleSB0aGUgbmV3IHBvc2UgYXQgdCA9IDIuXG5cdHNjZW5lU3RvcmUuc2V0VHJhbnNmb3JtKGlkLCB7IHBvc2l0aW9uOiBbMiwgMC41LCAwXSB9KTtcblx0dGltZWxpbmVTdG9yZS5zZXRUaW1lKDIpO1xuXHRjb25zdCBtb3ZlZCA9IGdldChzY2VuZVN0b3JlKS5vYmplY3RzWzBdO1xuXHR0aW1lbGluZVN0b3JlLmFkZEtleWZyYW1lKGlkLCB7XG5cdFx0dGltZTogMixcblx0XHRwb3NpdGlvbjogWy4uLm1vdmVkLnBvc2l0aW9uXSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sXG5cdFx0cm90YXRpb246IFswLCAwLCAwXSxcblx0XHRzY2FsZTogWzEsIDEsIDFdLFxuXHR9KTtcblx0c2V0TGluZWFyKGlkKTtcblxuXHRjb25zdCBhdFN0YXJ0ID0gdGltZWxpbmVTdG9yZS5ldmFsdWF0ZSgwLCBmYWxzZSkuZ2V0KGlkKSE7XG5cdHNjZW5lU3RvcmUuYXBwbHlBbmltYXRpb24odGltZWxpbmVTdG9yZS5ldmFsdWF0ZSgwLCBmYWxzZSkpO1xuXHRhc3NlcnQuZGVlcEVxdWFsKGF0U3RhcnQucG9zaXRpb24sIFswLCAwLjUsIDBdKTtcblx0YXNzZXJ0LmRlZXBFcXVhbChnZXQoc2NlbmVTdG9yZSkub2JqZWN0c1swXS5wb3NpdGlvbiwgWzAsIDAuNSwgMF0pO1xuXG5cdHRpbWVsaW5lU3RvcmUuc2V0VGltZSgxKTtcblx0c2NlbmVTdG9yZS5hcHBseUFuaW1hdGlvbih0aW1lbGluZVN0b3JlLmV2YWx1YXRlKDEsIGZhbHNlKSk7XG5cdGFzc2VydC5kZWVwRXF1YWwoZ2V0KHNjZW5lU3RvcmUpLm9iamVjdHNbMF0ucG9zaXRpb24sIFsxLCAwLjUsIDBdLCAnbWlkd2F5IHBvc2UnKTtcbn0pO1xuXG4vLyAtLS0tIFN0cmlwcyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbnRlc3QoJ3N0cmlwQWN0aW9uVGltZSBtYXBzIHNwZWVkLCByZXZlcnNlIGFuZCBmcmVlemUgdG8gYWN0aW9uIHRpbWUnLCAoKSA9PiB7XG5cdGNvbnN0IGJhc2UgPSBzdHJpcCgpO1xuXHRhc3NlcnQuZXF1YWwoc3RyaXBBY3Rpb25UaW1lKGJhc2UsIDIpLCAyKTtcblx0YXNzZXJ0LmVxdWFsKHN0cmlwQWN0aW9uVGltZSh7IC4uLmJhc2UsIHNwZWVkOiAyIH0sIDIpLCA0KTtcblx0YXNzZXJ0LmVxdWFsKHN0cmlwQWN0aW9uVGltZSh7IC4uLmJhc2UsIHJldmVyc2VkOiB0cnVlIH0sIDIpLCA4KTtcblx0YXNzZXJ0LmVxdWFsKHN0cmlwQWN0aW9uVGltZSh7IC4uLmJhc2UsIGZyb3plbjogdHJ1ZSB9LCA0KSwgMCwgJ2ZyZWV6ZSBob2xkcyB0aGUgZmlyc3QgYWN0aW9uIGZyYW1lJyk7XG5cdGFzc2VydC5lcXVhbChzdHJpcEFjdGlvblRpbWUoeyAuLi5iYXNlLCBzcGVlZDogMiB9LCAxMDApLCAxMCwgJ2NsYW1wcyB0byB0aGUgYWN0aW9uIGVuZCcpO1xufSk7XG5cbnRlc3QoJ3N0cmlwcyBkcml2ZSB0aGUgZXZhbHVhdGVkIHRyYW5zZm9ybSBvbmx5IGluc2lkZSB0aGVpciByYW5nZScsICgpID0+IHtcblx0cmVzZXRUaW1lbGluZSgpO1xuXHR0aW1lbGluZVN0b3JlLmFkZEtleWZyYW1lKCdvYmotYScsIHBvc2UoMCwgWzAsIDAsIDBdKSk7XG5cdHRpbWVsaW5lU3RvcmUuYWRkS2V5ZnJhbWUoJ29iai1hJywgcG9zZSgyLCBbNCwgMCwgMF0pKTtcblx0c2V0TGluZWFyKCdvYmotYScpO1xuXHR0aW1lbGluZVN0b3JlLmFkZFN0cmlwKCdvYmotYScsIDEsIDMpO1xuXHRjb25zdCBzdHJpcElkID0gc3RhdGUoKS5zZWxlY3RlZFN0cmlwSWQhO1xuXHR0aW1lbGluZVN0b3JlLnVwZGF0ZVN0cmlwKHN0cmlwSWQsIHsgc3BlZWQ6IDIsIGFjdGlvbkVuZDogMiB9KTtcblxuXHQvLyBJbnNpZGUgdGhlIHN0cmlwOiBhY3Rpb24gdGltZSBydW5zIHR3aWNlIGFzIGZhc3QuXG5cdGFzc2VydC5kZWVwRXF1YWwodGltZWxpbmVTdG9yZS5ldmFsdWF0ZSgxLjUsIGZhbHNlKS5nZXQoJ29iai1hJykhLnBvc2l0aW9uLCBbMiwgMCwgMF0pO1xuXHQvLyBPdXRzaWRlIHRoZSBzdHJpcCB0aGUgb2JqZWN0IGlzIG5vdCBkcml2ZW4gYnkgdGhpcyBhY3Rpb24gYXQgYWxsLlxuXHRhc3NlcnQuZXF1YWwodGltZWxpbmVTdG9yZS5ldmFsdWF0ZSgwLjUsIGZhbHNlKS5nZXQoJ29iai1hJyksIHVuZGVmaW5lZCk7XG5cdGFzc2VydC5lcXVhbCh0aW1lbGluZVN0b3JlLmV2YWx1YXRlKDQsIGZhbHNlKS5nZXQoJ29iai1hJyksIHVuZGVmaW5lZCk7XG59KTtcblxudGVzdCgnc3BsaXQgaXMgY29udGludW91cyBmb3IgZm9yd2FyZCwgcmV2ZXJzZWQgYW5kIHNwZWVkLXNjYWxlZCBzdHJpcHMnLCAoKSA9PiB7XG5cdHJlc2V0VGltZWxpbmUoKTtcblx0dGltZWxpbmVTdG9yZS5zZXREdXJhdGlvbigxMCk7XG5cdHRpbWVsaW5lU3RvcmUuYWRkS2V5ZnJhbWUoJ29iai1hJywgcG9zZSgwLCBbMCwgMCwgMF0pKTtcblx0dGltZWxpbmVTdG9yZS5hZGRLZXlmcmFtZSgnb2JqLWEnLCBwb3NlKDQsIFs0LCAwLCAwXSkpO1xuXHR0aW1lbGluZVN0b3JlLmFkZFN0cmlwKCdvYmotYScsIDAsIDQpO1xuXHRjb25zdCBvcmlnaW5hbCA9IHN0YXRlKCkuc3RyaXBzWzBdO1xuXHR0aW1lbGluZVN0b3JlLnVwZGF0ZVN0cmlwKG9yaWdpbmFsLmlkLCB7IGFjdGlvblN0YXJ0OiAwLCBhY3Rpb25FbmQ6IDQsIHNwZWVkOiAyLCByZXZlcnNlZDogdHJ1ZSB9KTtcblx0dGltZWxpbmVTdG9yZS5zZXRUaW1lKDEuNSk7XG5cdHRpbWVsaW5lU3RvcmUuc3BsaXRTdHJpcEF0UGxheWhlYWQob3JpZ2luYWwuaWQpO1xuXG5cdGNvbnN0IHN0cmlwcyA9IHN0YXRlKCkuc3RyaXBzO1xuXHRhc3NlcnQuZXF1YWwoc3RyaXBzLmxlbmd0aCwgMik7XG5cdGNvbnN0IGxlZnQgPSBzdHJpcHNbMF07XG5cdGNvbnN0IHJpZ2h0ID0gc3RyaXBzWzFdO1xuXHRhc3NlcnQuZXF1YWwobGVmdC5lbmQsIDEuNSk7XG5cdGFzc2VydC5lcXVhbChyaWdodC5zdGFydCwgMS41KTtcblx0Ly8gV2l0aCBzcGVlZCAyIGFuZCByZXZlcnNlZCwgMS41IHMgaW50byB0aGUgc3RyaXAgaXMgYWN0aW9uIHRpbWUgNCAtIDMgPSAxLlxuXHRhc3NlcnQuZXF1YWwobGVmdC5hY3Rpb25TdGFydCwgMSwgJ3RoZSBsZWZ0IGhhbGYgc3RvcHMgYXQgdGhlIGN1dCcpO1xuXHRhc3NlcnQuZXF1YWwocmlnaHQuYWN0aW9uRW5kLCAxLCAndGhlIHJpZ2h0IGhhbGYgc3RhcnRzIGl0cyBjb3VudGRvd24gYXQgdGhlIGN1dCcpO1xuXHRjb25zdCBiZWZvcmVDdXQgPSBzdHJpcEFjdGlvblRpbWUobGVmdCwgMS40OSk7XG5cdGNvbnN0IGFmdGVyQ3V0ID0gc3RyaXBBY3Rpb25UaW1lKHJpZ2h0LCAxLjUxKTtcblx0YXNzZXJ0Lm9rKE1hdGguYWJzKGJlZm9yZUN1dCAtIGFmdGVyQ3V0KSA8IDAuMDUsICdtb3Rpb24gY29udGludWVzIGFjcm9zcyB0aGUgY3V0Jyk7XG59KTtcblxudGVzdCgnZHVwbGljYXRlIGNyZWF0ZXMgYW4gaW5kZXBlbmRlbnQgc3RyaXAgbmV4dCB0byB0aGUgb3JpZ2luYWwnLCAoKSA9PiB7XG5cdHJlc2V0VGltZWxpbmUoKTtcblx0dGltZWxpbmVTdG9yZS5zZXREdXJhdGlvbigxMCk7XG5cdHRpbWVsaW5lU3RvcmUuYWRkS2V5ZnJhbWUoJ29iai1hJywgcG9zZSgwLCBbMCwgMCwgMF0pKTtcblx0dGltZWxpbmVTdG9yZS5hZGRLZXlmcmFtZSgnb2JqLWEnLCBwb3NlKDIsIFsyLCAwLCAwXSkpO1xuXHR0aW1lbGluZVN0b3JlLmFkZFN0cmlwKCdvYmotYScsIDEsIDMpO1xuXHRjb25zdCBvcmlnaW5hbCA9IHN0YXRlKCkuc3RyaXBzWzBdO1xuXHR0aW1lbGluZVN0b3JlLmR1cGxpY2F0ZVN0cmlwKG9yaWdpbmFsLmlkKTtcblx0Y29uc3Qgc3RyaXBzID0gc3RhdGUoKS5zdHJpcHM7XG5cdGFzc2VydC5lcXVhbChzdHJpcHMubGVuZ3RoLCAyKTtcblx0YXNzZXJ0Lm5vdEVxdWFsKHN0cmlwc1swXS5pZCwgc3RyaXBzWzFdLmlkKTtcblx0YXNzZXJ0LmVxdWFsKHN0cmlwc1sxXS5zdGFydCwgMyk7XG5cdGFzc2VydC5lcXVhbChzdHJpcHNbMV0uZW5kLCA1KTtcblx0YXNzZXJ0LmVxdWFsKHN0cmlwc1sxXS5hY3Rpb25TdGFydCwgb3JpZ2luYWwuYWN0aW9uU3RhcnQpO1xuXHRhc3NlcnQuZXF1YWwoc3RyaXBzWzFdLmFjdGlvbkVuZCwgb3JpZ2luYWwuYWN0aW9uRW5kKTtcbn0pO1xuXG50ZXN0KCdmcmVlemUgYW5kIHJldmVyc2UgY2hhbmdlIHBsYXliYWNrLCBkZWxldGUgcmVtb3ZlcyBvbmx5IHRoYXQgc3RyaXAnLCAoKSA9PiB7XG5cdHJlc2V0VGltZWxpbmUoKTtcblx0dGltZWxpbmVTdG9yZS5zZXREdXJhdGlvbigxMCk7XG5cdHRpbWVsaW5lU3RvcmUuYWRkS2V5ZnJhbWUoJ29iai1hJywgcG9zZSgwLCBbMCwgMCwgMF0pKTtcblx0dGltZWxpbmVTdG9yZS5hZGRLZXlmcmFtZSgnb2JqLWEnLCBwb3NlKDIsIFsyLCAwLCAwXSkpO1xuXHR0aW1lbGluZVN0b3JlLmFkZFN0cmlwKCdvYmotYScsIDAsIDIpO1xuXHRjb25zdCBpZCA9IHN0YXRlKCkuc3RyaXBzWzBdLmlkO1xuXG5cdHRpbWVsaW5lU3RvcmUuZnJlZXplU3RyaXAoaWQpO1xuXHRhc3NlcnQuZXF1YWwoc3RhdGUoKS5zdHJpcHNbMF0uZnJvemVuLCB0cnVlKTtcblx0YXNzZXJ0LmVxdWFsKHN0cmlwQWN0aW9uVGltZShzdGF0ZSgpLnN0cmlwc1swXSwgMS45KSwgMCk7XG5cblx0dGltZWxpbmVTdG9yZS5yZXZlcnNlU3RyaXAoaWQpO1xuXHRhc3NlcnQuZXF1YWwoc3RhdGUoKS5zdHJpcHNbMF0ucmV2ZXJzZWQsIHRydWUpO1xuXHR0aW1lbGluZVN0b3JlLmZyZWV6ZVN0cmlwKGlkLCBmYWxzZSk7XG5cdHRpbWVsaW5lU3RvcmUuc2V0U3RyaXBTcGVlZChpZCwgOTkpO1xuXHRhc3NlcnQuZXF1YWwoc3RhdGUoKS5zdHJpcHNbMF0uc3BlZWQsIDEwLCAnc3BlZWQgc3RheXMgd2l0aGluIDAuMXguLjEweCcpO1xuXG5cdHRpbWVsaW5lU3RvcmUucmVtb3ZlU3RyaXAoaWQpO1xuXHRhc3NlcnQuZXF1YWwoc3RhdGUoKS5zdHJpcHMubGVuZ3RoLCAwKTtcblx0YXNzZXJ0LmVxdWFsKHN0YXRlKCkuc2VsZWN0ZWRTdHJpcElkLCBudWxsKTtcbn0pO1xuXG4vLyAtLS0tIFVuZG8sIHJlZG8gYW5kIHBlcnNpc3RlbmNlIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxudGVzdCgnYW5pbWF0aW9uIGVkaXRzIGFyZSB1bmRvYWJsZSBhbmQgcmVkb2FibGUgYXMgb25lIHN0ZXAnLCAoKSA9PiB7XG5cdHJlc2V0VGltZWxpbmUoKTtcblx0c2NlbmVTdG9yZS5sb2FkKFtdLCBudWxsKTtcblx0Y29uc3QgYmVmb3JlID0gc2NlbmVTdG9yZS5oaXN0b3J5U2l6ZSgpLnBhc3Q7XG5cdHNjZW5lU3RvcmUuYW5pbWF0aW9uRWRpdCgoKSA9PiB0aW1lbGluZVN0b3JlLmFkZEtleWZyYW1lKCdvYmotYScsIHBvc2UoMCwgWzMsIDAsIDBdKSkpO1xuXHRhc3NlcnQuZXF1YWwoc2NlbmVTdG9yZS5oaXN0b3J5U2l6ZSgpLnBhc3QsIGJlZm9yZSArIDEpO1xuXHRhc3NlcnQuZXF1YWwoc3RhdGUoKS5rZXlmcmFtZXMuZ2V0KCdvYmotYScpIS5sZW5ndGgsIDEpO1xuXG5cdHNjZW5lU3RvcmUudW5kbygpO1xuXHRhc3NlcnQuZXF1YWwoc3RhdGUoKS5rZXlmcmFtZXMuZ2V0KCdvYmotYScpLCB1bmRlZmluZWQpO1xuXHRhc3NlcnQuZGVlcEVxdWFsKHN0YXRlKCkuY3VydmVzLmdldCgnb2JqLWEnKSwgdW5kZWZpbmVkKTtcblxuXHRzY2VuZVN0b3JlLnJlZG8oKTtcblx0YXNzZXJ0LmVxdWFsKHN0YXRlKCkua2V5ZnJhbWVzLmdldCgnb2JqLWEnKSEubGVuZ3RoLCAxKTtcblx0YXNzZXJ0LmRlZXBFcXVhbChzdGF0ZSgpLmtleWZyYW1lcy5nZXQoJ29iai1hJykhWzBdLnBvc2l0aW9uLCBbMywgMCwgMF0pO1xufSk7XG5cbnRlc3QoJ2Ega2V5IGRyYWcgaXMgb25lIHVuZG8gZW50cnksIG5vdCBvbmUgcGVyIHBvaW50ZXIgbW92ZScsICgpID0+IHtcblx0cmVzZXRUaW1lbGluZSgpO1xuXHR0aW1lbGluZVN0b3JlLmFkZEtleWZyYW1lKCdvYmotYScsIHBvc2UoMCwgWzAsIDAsIDBdKSk7XG5cdHRpbWVsaW5lU3RvcmUuYWRkS2V5ZnJhbWUoJ29iai1hJywgcG9zZSgyLCBbMiwgMCwgMF0pKTtcblx0Y29uc3QgYmVmb3JlID0gc2NlbmVTdG9yZS5oaXN0b3J5U2l6ZSgpLnBhc3Q7XG5cblx0c2NlbmVTdG9yZS5iZWdpbkFuaW1hdGlvbkVkaXQoKTtcblx0dGltZWxpbmVTdG9yZS5tb3ZlS2V5ZnJhbWUoJ29iai1hJywgMCwgMC41KTtcblx0dGltZWxpbmVTdG9yZS5tb3ZlS2V5ZnJhbWUoJ29iai1hJywgMC41LCAxKTtcblx0dGltZWxpbmVTdG9yZS5tb3ZlS2V5ZnJhbWUoJ29iai1hJywgMSwgMS41KTtcblx0c2NlbmVTdG9yZS5lbmRBbmltYXRpb25FZGl0KCk7XG5cblx0YXNzZXJ0LmVxdWFsKHNjZW5lU3RvcmUuaGlzdG9yeVNpemUoKS5wYXN0LCBiZWZvcmUgKyAxKTtcblx0c2NlbmVTdG9yZS51bmRvKCk7XG5cdGFzc2VydC5kZWVwRXF1YWwoY2hhbm5lbFRpbWVzKCdvYmotYScsICdsb2NhdGlvbi54JyksIFswLCAyXSk7XG5cblx0c2NlbmVTdG9yZS5yZWRvKCk7XG5cdGFzc2VydC5kZWVwRXF1YWwoY2hhbm5lbFRpbWVzKCdvYmotYScsICdsb2NhdGlvbi54JyksIFsxLjUsIDJdKTtcbn0pO1xuXG50ZXN0KCd1bmRvIG9mIGEgc3RyaXAgZWRpdCByZXN0b3JlcyB0aGUgc3RyaXAgbGlzdCcsICgpID0+IHtcblx0cmVzZXRUaW1lbGluZSgpO1xuXHR0aW1lbGluZVN0b3JlLnNldER1cmF0aW9uKDEwKTtcblx0dGltZWxpbmVTdG9yZS5hZGRLZXlmcmFtZSgnb2JqLWEnLCBwb3NlKDAsIFswLCAwLCAwXSkpO1xuXHR0aW1lbGluZVN0b3JlLmFkZFN0cmlwKCdvYmotYScsIDAsIDIpO1xuXHRzY2VuZVN0b3JlLmFuaW1hdGlvbkVkaXQoKCkgPT4gdGltZWxpbmVTdG9yZS5kdXBsaWNhdGVTdHJpcChzdGF0ZSgpLnN0cmlwc1swXS5pZCkpO1xuXHRhc3NlcnQuZXF1YWwoc3RhdGUoKS5zdHJpcHMubGVuZ3RoLCAyKTtcblx0c2NlbmVTdG9yZS51bmRvKCk7XG5cdGFzc2VydC5lcXVhbChzdGF0ZSgpLnN0cmlwcy5sZW5ndGgsIDEpO1xuXHRzY2VuZVN0b3JlLnJlZG8oKTtcblx0YXNzZXJ0LmVxdWFsKHN0YXRlKCkuc3RyaXBzLmxlbmd0aCwgMik7XG59KTtcblxudGVzdCgnc2F2aW5nIGFuZCByZWxvYWRpbmcgYSBwcm9qZWN0IGtlZXBzIGtleXMsIGN1cnZlcyBhbmQgc3RyaXBzJywgKCkgPT4ge1xuXHRyZXNldFRpbWVsaW5lKCk7XG5cdHNjZW5lU3RvcmUubG9hZChbXSwgbnVsbCk7XG5cdHNjZW5lU3RvcmUuYWRkUHJpbWl0aXZlKCdjdWJlJyk7XG5cdGNvbnN0IG9iamVjdElkID0gZ2V0KHNjZW5lU3RvcmUpLnNlbGVjdGVkSWQhO1xuXHR0aW1lbGluZVN0b3JlLnNldER1cmF0aW9uKDQuNSk7XG5cdHRpbWVsaW5lU3RvcmUuc2V0RnJhbWVSYXRlKDI1KTtcblx0dGltZWxpbmVTdG9yZS5hZGRLZXlmcmFtZShvYmplY3RJZCwgcG9zZSgwLCBbMCwgMC41LCAwXSkpO1xuXHR0aW1lbGluZVN0b3JlLmFkZEtleWZyYW1lKG9iamVjdElkLCBwb3NlKDIsIFsyLCAwLjUsIDBdKSk7XG5cdHRpbWVsaW5lU3RvcmUuYWRkU3RyaXAob2JqZWN0SWQsIDAsIDIpO1xuXG5cdGNvbnN0IHByb2plY3QgPSBjcmVhdGVQcm9qZWN0KCdBbmltYXRpb24gcm91bmQgdHJpcCcpO1xuXHRjb25zdCByZXN0b3JlZCA9IHZhbGlkYXRlUHJvamVjdChKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHByb2plY3QpKSk7XG5cdGFzc2VydC5lcXVhbChyZXN0b3JlZC50aW1lbGluZS5kdXJhdGlvbiwgNC41KTtcblx0YXNzZXJ0LmVxdWFsKHJlc3RvcmVkLnRpbWVsaW5lLmZyYW1lUmF0ZSwgMjUpO1xuXHRhc3NlcnQuZXF1YWwocmVzdG9yZWQudGltZWxpbmUua2V5ZnJhbWVzW29iamVjdElkXS5sZW5ndGgsIDIpO1xuXHRhc3NlcnQuZXF1YWwoT2JqZWN0LmtleXMocmVzdG9yZWQudGltZWxpbmUuY3VydmVzW29iamVjdElkXSkubGVuZ3RoLCAxMCk7XG5cdGFzc2VydC5lcXVhbChyZXN0b3JlZC50aW1lbGluZS5zdHJpcHMubGVuZ3RoLCAxKTtcblxuXHRyZXNldFRpbWVsaW5lKCk7XG5cdGFwcGx5UHJvamVjdChyZXN0b3JlZCk7XG5cdGFzc2VydC5lcXVhbChzdGF0ZSgpLmR1cmF0aW9uLCA0LjUpO1xuXHRhc3NlcnQuZXF1YWwoc3RhdGUoKS5mcmFtZVJhdGUsIDI1KTtcblx0YXNzZXJ0LmVxdWFsKHN0YXRlKCkua2V5ZnJhbWVzLmdldChvYmplY3RJZCkhLmxlbmd0aCwgMik7XG5cdGFzc2VydC5kZWVwRXF1YWwoXG5cdFx0dGltZWxpbmVTdG9yZS5ldmFsdWF0ZSgxLCBmYWxzZSkuZ2V0KG9iamVjdElkKSEucG9zaXRpb24hLm1hcCgodmFsdWUpID0+IE1hdGgucm91bmQodmFsdWUgKiAxMCkgLyAxMCksXG5cdFx0WzEsIDAuNSwgMF0sXG5cdCk7XG5cdGFzc2VydC5lcXVhbChzdGF0ZSgpLnN0cmlwcy5sZW5ndGgsIDEpO1xufSk7XG5cbnRlc3QoJ2FuaW1hdGlvbiBmb3IgYSBkZWxldGVkIG9iamVjdCBpcyBpZ25vcmVkIHNhZmVseScsICgpID0+IHtcblx0cmVzZXRUaW1lbGluZSgpO1xuXHRzY2VuZVN0b3JlLmxvYWQoW10sIG51bGwpO1xuXHR0aW1lbGluZVN0b3JlLmFkZEtleWZyYW1lKCdnaG9zdC1vYmplY3QnLCBwb3NlKDAsIFsxLCAxLCAxXSkpO1xuXHRjb25zdCBoaXN0b3J5QmVmb3JlID0gc2NlbmVTdG9yZS5oaXN0b3J5U2l6ZSgpLnBhc3Q7XG5cdHNjZW5lU3RvcmUuYXBwbHlBbmltYXRpb24odGltZWxpbmVTdG9yZS5ldmFsdWF0ZSgwLCB0cnVlKSk7XG5cdGFzc2VydC5lcXVhbChnZXQoc2NlbmVTdG9yZSkub2JqZWN0cy5sZW5ndGgsIDAsICdubyBvYmplY3QgaXMgY3JlYXRlZCBmb3IgYW4gb3JwaGFuIHRyYWNrJyk7XG5cdGFzc2VydC5lcXVhbChzY2VuZVN0b3JlLmhpc3RvcnlTaXplKCkucGFzdCwgaGlzdG9yeUJlZm9yZSwgJ2FwcGx5aW5nIGFuaW1hdGlvbiBpcyBub3QgYW4gdW5kbyBzdGVwJyk7XG59KTtcblxudGVzdCgnZHJhZ2dpbmcgYSBsYXllciBzbGlkZXMgZXZlcnkga2V5LCBjdXJ2ZSBhbmQgc3RyaXAgdG9nZXRoZXInLCAoKSA9PiB7XG5cdHJlc2V0VGltZWxpbmUoKTtcblx0dGltZWxpbmVTdG9yZS5hZGRLZXlmcmFtZSgnb2JqLWEnLCBwb3NlKDAsIFswLCAwLCAwXSkpO1xuXHR0aW1lbGluZVN0b3JlLmFkZEtleWZyYW1lKCdvYmotYScsIHBvc2UoMiwgWzIsIDAsIDBdKSk7XG5cblx0dGltZWxpbmVTdG9yZS5zaGlmdExheWVyKCdvYmotYScsIDEpO1xuXG5cdGFzc2VydC5kZWVwRXF1YWwoXG5cdFx0c3RhdGUoKS5rZXlmcmFtZXMuZ2V0KCdvYmotYScpIS5tYXAoKGtleSkgPT4ga2V5LnRpbWUpLFxuXHRcdFsxLCAzXSxcblx0XHQna2V5cyBtb3ZlIGJ5IHRoZSBzYW1lIGFtb3VudCcsXG5cdCk7XG5cdGFzc2VydC5kZWVwRXF1YWwoY2hhbm5lbFRpbWVzKCdvYmotYScsICdsb2NhdGlvbi54JyksIFsxLCAzXSwgJ2N1cnZlcyBmb2xsb3cgdGhlIHBvc2VzJyk7XG5cdGFzc2VydC5kZWVwRXF1YWwodGltZWxpbmVTdG9yZS5ldmFsdWF0ZSgxLCB0cnVlKS5nZXQoJ29iai1hJykhLnBvc2l0aW9uLCBbMCwgMCwgMF0pO1xufSk7XG5cbnRlc3QoJ2RyYWdnaW5nIGEgbGF5ZXIgbW92ZXMgaXRzIGFjdGlvbiBzdHJpcHMgdG9vJywgKCkgPT4ge1xuXHRyZXNldFRpbWVsaW5lKCk7XG5cdHRpbWVsaW5lU3RvcmUuYWRkS2V5ZnJhbWUoJ29iai1hJywgcG9zZSgwLCBbMCwgMCwgMF0pKTtcblx0dGltZWxpbmVTdG9yZS5hZGRLZXlmcmFtZSgnb2JqLWEnLCBwb3NlKDIsIFsyLCAwLCAwXSkpO1xuXHR0aW1lbGluZVN0b3JlLmFkZFN0cmlwKCdvYmotYScsIDAuNSwgMS41KTtcblx0YXNzZXJ0LmVxdWFsKHN0YXRlKCkuc3RyaXBzLmxlbmd0aCwgMSwgJ3RoZSBzdHJpcCBleGlzdHMgYmVmb3JlIHRoZSBkcmFnJyk7XG5cblx0dGltZWxpbmVTdG9yZS5zaGlmdExheWVyKCdvYmotYScsIDEpO1xuXHRjb25zdCBzdHJpcCA9IHN0YXRlKCkuc3RyaXBzWzBdO1xuXHRhc3NlcnQuZXF1YWwoc3RyaXAuc3RhcnQsIDEuNSk7XG5cdGFzc2VydC5lcXVhbChzdHJpcC5lbmQsIDIuNSk7XG59KTtcblxudGVzdCgnYSBsYXllciBjYW5ub3QgYmUgZHJhZ2dlZCBvdXQgb2YgdGhlIHRpbWVsaW5lJywgKCkgPT4ge1xuXHRyZXNldFRpbWVsaW5lKCk7XG5cdHRpbWVsaW5lU3RvcmUuc2V0RHVyYXRpb24oNSk7XG5cdHRpbWVsaW5lU3RvcmUuYWRkS2V5ZnJhbWUoJ29iai1hJywgcG9zZSgxLCBbMCwgMCwgMF0pKTtcblx0dGltZWxpbmVTdG9yZS5hZGRLZXlmcmFtZSgnb2JqLWEnLCBwb3NlKDIsIFsyLCAwLCAwXSkpO1xuXG5cdHRpbWVsaW5lU3RvcmUuc2hpZnRMYXllcignb2JqLWEnLCAtNCk7XG5cdGFzc2VydC5kZWVwRXF1YWwoc3RhdGUoKS5rZXlmcmFtZXMuZ2V0KCdvYmotYScpIS5tYXAoKGtleSkgPT4ga2V5LnRpbWUpLCBbMCwgMV0sICdzdG9wcyBhdCB6ZXJvJyk7XG5cblx0dGltZWxpbmVTdG9yZS5zaGlmdExheWVyKCdvYmotYScsIDk5KTtcblx0YXNzZXJ0LmRlZXBFcXVhbChzdGF0ZSgpLmtleWZyYW1lcy5nZXQoJ29iai1hJykhLm1hcCgoa2V5KSA9PiBrZXkudGltZSksIFs0LCA1XSwgJ3N0b3BzIGF0IHRoZSBkdXJhdGlvbicpO1xufSk7XG5cbnRlc3QoJ2EgbGF5ZXIgd2l0aG91dCBrZXlzIG9yIHN0cmlwcyBoYXMgbm90aGluZyB0byBkcmFnJywgKCkgPT4ge1xuXHRyZXNldFRpbWVsaW5lKCk7XG5cdGNvbnN0IGJlZm9yZSA9IHRpbWVsaW5lU3RvcmUuc25hcHNob3RBbmltYXRpb24oKTtcblx0dGltZWxpbmVTdG9yZS5zaGlmdExheWVyKCdvYmotZW1wdHknLCAyKTtcblx0YXNzZXJ0LmRlZXBFcXVhbCh0aW1lbGluZVN0b3JlLnNuYXBzaG90QW5pbWF0aW9uKCksIGJlZm9yZSk7XG59KTtcblxudGVzdCgnYSBsYXllciBjbGlwIGNhbiBiZSBwbGFjZWQgYW5kIHNsaWQsIGNsYW1wZWQgdG8gdGhlIHRpbWVsaW5lJywgKCkgPT4ge1xuXHRyZXNldFRpbWVsaW5lKCk7XG5cdHRpbWVsaW5lU3RvcmUuc2V0RHVyYXRpb24oNSk7XG5cdHRpbWVsaW5lU3RvcmUuc2V0Q2xpcCgnb2JqLWEnLCAxLCAzKTtcblx0YXNzZXJ0LmRlZXBFcXVhbChzdGF0ZSgpLmNsaXBzLmdldCgnb2JqLWEnKSwgeyBzdGFydDogMSwgZW5kOiAzIH0pO1xuXG5cdHRpbWVsaW5lU3RvcmUuc2hpZnRDbGlwKCdvYmotYScsIC00KTtcblx0YXNzZXJ0LmRlZXBFcXVhbChzdGF0ZSgpLmNsaXBzLmdldCgnb2JqLWEnKSwgeyBzdGFydDogMCwgZW5kOiAyIH0sICdzdG9wcyBhdCB6ZXJvJyk7XG5cblx0dGltZWxpbmVTdG9yZS5zaGlmdENsaXAoJ29iai1hJywgOTkpO1xuXHRhc3NlcnQuZGVlcEVxdWFsKHN0YXRlKCkuY2xpcHMuZ2V0KCdvYmotYScpLCB7IHN0YXJ0OiAzLCBlbmQ6IDUgfSwgJ3N0b3BzIGF0IHRoZSBkdXJhdGlvbicpO1xuXG5cdHRpbWVsaW5lU3RvcmUuc2V0Q2xpcCgnb2JqLWEnLCA0LCA0KTtcblx0YXNzZXJ0LmRlZXBFcXVhbChzdGF0ZSgpLmNsaXBzLmdldCgnb2JqLWEnKSwgeyBzdGFydDogMywgZW5kOiA1IH0sICdhbiBlbXB0eSBjbGlwIGlzIGlnbm9yZWQnKTtcbn0pO1xuXG50ZXN0KCdhIGxheWVyIGJhciBjYW4gYmUgc3RyZXRjaGVkIHRvIHRoZSBlbmQgb2YgdGhlIHRpbWVsaW5lJywgKCkgPT4ge1xuXHRyZXNldFRpbWVsaW5lKCk7XG5cdHRpbWVsaW5lU3RvcmUuc2V0RHVyYXRpb24oNSk7XG5cdHRpbWVsaW5lU3RvcmUuc2V0Q2xpcCgnb2JqLWEnLCAwLCAzKTtcblx0dGltZWxpbmVTdG9yZS5zZXRDbGlwKCdvYmotYScsIDAsIDUpO1xuXHRhc3NlcnQuZGVlcEVxdWFsKHN0YXRlKCkuY2xpcHMuZ2V0KCdvYmotYScpLCB7IHN0YXJ0OiAwLCBlbmQ6IDUgfSwgJ3RoZSBiYXIgcmVhY2hlcyB0aGUgbGFzdCBzZWNvbmQnKTtcblxuXHR0aW1lbGluZVN0b3JlLnNldENsaXAoJ29iai1hJywgMCwgOTkpO1xuXHRhc3NlcnQuZGVlcEVxdWFsKHN0YXRlKCkuY2xpcHMuZ2V0KCdvYmotYScpLCB7IHN0YXJ0OiAwLCBlbmQ6IDUgfSwgJ2l0IHN0b3BzIGF0IHRoZSBkdXJhdGlvbicpO1xufSk7XG4iXSwibWFwcGluZ3MiOiJBQUFBLFNBQVMsSUFBSSxRQUFRLFdBQVc7QUFDaEMsT0FBTyxNQUFNLE1BQU0sb0JBQW9CO0FBQ3ZDLFNBQVMsR0FBRyxRQUFRLGNBQWM7QUFDbEMsU0FDQyxlQUFlLEVBQ2YsYUFBYSxRQUdQLDJCQUEyQjtBQUNsQyxTQUFTLGtCQUFrQixRQUFRLHNCQUFzQjtBQUN6RCxTQUFTLFVBQVUsUUFBUSx3QkFBd0I7QUFDbkQsU0FBUyxhQUFhLEVBQUUsZUFBZSxFQUFFLFlBQVksUUFBUSx1QkFBdUI7QUFFcEYsTUFBTSxLQUFLLEdBQUcsTUFBTSxHQUFHLENBQUMsYUFBYSxDQUFDO0FBRXRDLFNBQVMsYUFBYSxHQUFHO0VBQ3hCLGFBQWEsQ0FBQyxjQUFjLENBQUMsQ0FBQztFQUM5QixhQUFhLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztFQUM1QixhQUFhLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQztFQUMzQixhQUFhLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQztFQUM3QixhQUFhLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQztFQUM5QixhQUFhLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQztFQUMvQixhQUFhLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztBQUN6QjtBQUVBLFNBQVMs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QUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsR0FBRyxDQUFDO0VBQzdDLE1BQU0sQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDO0VBQzdDLE1BQU0sQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztFQUM3RCxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDO0VBQ3hFLE1BQU0sQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztFQUVoRCxhQUFhLENBQUMsQ0FBQztFQUNmLFlBQVksQ0FBQyxRQUFRLENBQUM7RUFDdEIsTUFBTSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxHQUFHLENBQUM7RUFDbkMsTUFBTSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUM7RUFDbkMsTUFBTSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztFQUN4RCxNQUFNLENBQUMsU0FBUyxDQUNmLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBRSxRQUFRLENBQUUsR0FBRyxDQUFFLEtBQUssSUFBSyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUMsRUFDckcsQ0FBQyxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FDWCxDQUFDO0VBQ0QsTUFBTSxD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