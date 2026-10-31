import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import {
	timelineStore,
	timeToFrame,
	frameToTime,
	type KeyframeData,
} from '../src/stores/timeline.ts';
import { TRANSFORM_CHANNELS, VISIBILITY_CHANNEL } from '../src/lib/fcurve.ts';
import { sceneStore } from '../src/stores/scene.ts';
import { createProject, validateProject, applyProject } from '../src/lib/project.ts';

function resetAll() {
	sceneStore.clear();
	timelineStore.clearKeyframes();
	timelineStore.setFrameRate(30);
	timelineStore.setDuration(5);
	timelineStore.setStartFrame(0);
	timelineStore.setSnapToFrames(false);
	timelineStore.setMultiSelectMode(false);
	timelineStore.setLoop(true);
	timelineStore.setEasing(true);
	timelineStore.setAutoKey(true);
	timelineStore.setPlaying(false);
	timelineStore.setTime(0);
}

test('Part 1 Acceptance: Animate a cube between two positions, scrub, play, edit keyframe, move keyframe to change timing, save & reload', () => {
	resetAll();
	sceneStore.addPrimitive('cube', [0, 0.5, 0]);
	const cubeId = get(sceneStore).objects[0].id;
	assert.match(cubeId, /^obj-\d+$/, 'Cube has a stable object ID');

	// 1. Keyframe cube at frame 0 (t=0s) at [0, 0.5, 0] and frame 60 (t=2s) at [4, 2.5, -2]
	timelineStore.setTime(0);
	sceneStore.recordKeyframe(cubeId, 0);

	sceneStore.setTransform(cubeId, { position: [4, 2.5, -2], rotation: [0, Math.PI / 2, 0], scale: [2, 2, 2] });
	timelineStore.setTime(2);
	sceneStore.recordKeyframe(cubeId, 2);

	timelineStore.setObjectInterpolation(cubeId, 'linear');

	// 2. Scrub to t=1.0s (midpoint) and verify viewport transform evaluation
	timelineStore.seek(1.0);
	sceneStore.applyAnimation(timelineStore.evaluate(1.0, false));
	const midCube = get(sceneStore).objects[0];
	assert.ok(Math.abs(midCube.position[0] - 2.0) < 1e-5, 'Midpoint X is 2.0');
	assert.ok(Math.abs(midCube.position[1] - 1.5) < 1e-5, 'Midpoint Y is 1.5');
	assert.ok(Math.abs(midCube.position[2] - -1.0) < 1e-5, 'Midpoint Z is -1.0');
	assert.ok(Math.abs(midCube.scale[0] - 1.5) < 1e-5, 'Midpoint scale X is 1.5');

	// 3. Play the animation via playback clock ticks
	timelineStore.setTime(0);
	timelineStore.setPlaying(true);
	const tAfterHalfSec = timelineStore.tick(0.5);
	sceneStore.applyAnimation(timelineStore.evaluate(tAfterHalfSec, false));
	assert.ok(Math.abs(get(sceneStore).objects[0].position[0] - 1.0) < 1e-5, 'At t=0.5s, X is 1.0');
	timelineStore.stop();
	assert.equal(get(timelineStore).playing, false, 'Stop pauses playback');
	assert.equal(get(timelineStore).currentTime, 0, 'Stop resets playhead to startFrame');

	// 4. Edit keyframe at t=2s to position [6, 0.5, 0]
	timelineStore.updateKeyframe(cubeId, 2, { position: [6, 0.5, 0] });
	sceneStore.applyAnimation(timelineStore.evaluate(1.0, false));
	assert.ok(Math.abs(get(sceneStore).objects[0].position[0] - 3.0) < 1e-5, 'Edited keyframe updates midpoint X to 3.0');

	// 5. Move keyframe from t=2s to t=4s -> must change motion timing (at t=1s, 25% of 6 = 1.5)
	timelineStore.moveKeyframe(cubeId, 2, 4);
	sceneStore.applyAnimation(timelineStore.evaluate(1.0, false));
	assert.ok(
		Math.abs(get(sceneStore).objects[0].position[0] - 1.5) < 1e-5,
		`Moving keyframe from 2s to 4s changes position at 1s from 3.0 to 1.5 (got ${get(sceneStore).objects[0].position[0]})`,
	);

	// 6. Save and reload project -> verify animation still works with identical IDs and timing
	const savedProject = createProject('Part 1 Acceptance Test');
	const jsonString = JSON.stringify(savedProject);
	resetAll();
	const validated = validateProject(JSON.parse(jsonString));
	applyProject(validated);

	const reloadedCube = get(sceneStore).objects.find((o) => o.id === cubeId);
	assert.ok(reloadedCube, 'Stable object ID preserved after save/reload');
	timelineStore.seek(2.0);
	sceneStore.applyAnimation(timelineStore.evaluate(2.0, false));
	assert.ok(
		Math.abs(get(sceneStore).objects[0].position[0] - 3.0) < 1e-5,
		'Reloaded project evaluates midpoint at t=2.0s (halfway to moved 4.0s key) as X=3.0',
	);
});

test('Linear, Constant, and Bezier interpolation modes produce distinct, mathematically accurate curves', () => {
	resetAll();
	sceneStore.addPrimitive('cube', [0, 0, 0]);
	const id = get(sceneStore).objects[0].id;
	timelineStore.addKeyframe(id, { time: 0, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
	timelineStore.addKeyframe(id, { time: 2, position: [10, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });

	// 1. Constant (step) interpolation holds value 0 until t=2
	timelineStore.setObjectInterpolation(id, 'constant');
	assert.equal(timelineStore.interpolationOf(id, 'location.x'), 'constant');
	assert.equal(timelineStore.evaluate(0.5, true).get(id)!.position![0], 0);
	assert.equal(timelineStore.evaluate(1.99, true).get(id)!.position![0], 0);
	assert.equal(timelineStore.evaluate(2.0, true).get(id)!.position![0], 10);

	// 2. Linear interpolation moves at constant velocity (t=0.5 -> 25% = 2.5)
	timelineStore.setObjectInterpolation(id, 'linear');
	assert.equal(timelineStore.interpolationOf(id, 'location.x'), 'linear');
	const linQuarter = timelineStore.evaluate(0.5, true).get(id)!.position![0];
	assert.ok(Math.abs(linQuarter - 2.5) < 1e-6, `Linear at 25% should be 2.5, got ${linQuarter}`);

	// 3. Bezier interpolation eases in and out (at 25% time, smoothstep is 0.25^2 * (3 - 0.5) = 0.15625 -> 1.5625)
	timelineStore.setObjectInterpolation(id, 'bezier');
	assert.equal(timelineStore.interpolationOf(id, 'location.x'), 'bezier');
	const bezQuarter = timelineStore.evaluate(0.5, true).get(id)!.position![0];
	assert.ok(Math.abs(bezQuarter - 1.5625) < 1e-6, `Bezier at 25% should be 1.5625, got ${bezQuarter}`);
});

test('Visibility channel animation evaluates and updates scene object visibility', () => {
	resetAll();
	sceneStore.addPrimitive('cube', [0, 0.5, 0]);
	const id = get(sceneStore).objects[0].id;

	timelineStore.setVisibilityKeyframe(id, 0, true, { position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
	timelineStore.setVisibilityKeyframe(id, 1, false, { position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
	timelineStore.setVisibilityKeyframe(id, 2, true, { position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });

	sceneStore.applyAnimation(timelineStore.evaluate(0.5, true));
	assert.equal(get(sceneStore).objects[0].visible, true, 'Visible at t=0.5s');

	sceneStore.applyAnimation(timelineStore.evaluate(1.5, true));
	assert.equal(get(sceneStore).objects[0].visible, false, 'Hidden at t=1.5s');

	sceneStore.applyAnimation(timelineStore.evaluate(2.1, true));
	assert.equal(get(sceneStore).objects[0].visible, true, 'Visible again at t=2.1s');
});

test('Keyframe multi-selection, moving multiple keyframes, copy/paste, prev/next keyframe, and frame snapping', () => {
	resetAll();
	timelineStore.setFrameRate(30);
	timelineStore.setDuration(10);
	sceneStore.addPrimitive('cube', [0, 0, 0]);
	const id = get(sceneStore).objects[0].id;

	timelineStore.addKeyframe(id, { time: 0, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
	timelineStore.addKeyframe(id, { time: 1, position: [2, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
	timelineStore.addKeyframe(id, { time: 2, position: [4, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });

	// Prev / Next keyframe navigation
	timelineStore.setTime(0);
	assert.equal(timelineStore.nextKeyframe(id), 1);
	assert.equal(get(timelineStore).currentTime, 1);
	assert.equal(timelineStore.nextKeyframe(id), 2);
	assert.equal(get(timelineStore).currentTime, 2);
	assert.equal(timelineStore.prevKeyframe(id), 1);
	assert.equal(get(timelineStore).currentTime, 1);
	assert.equal(timelineStore.prevKeyframe(id), 0);
	assert.equal(get(timelineStore).currentTime, 0);

	// Multi-select keyframes at t=1 and t=2 and move both by +1s
	timelineStore.selectKeyframe(id, 1, false);
	timelineStore.selectKeyframe(id, 2, true);
	assert.equal(get(timelineStore).selectedKeys.length, 2, 'Two keyframes multi-selected');

	timelineStore.moveSelectedKeyframes(1.0);
	const movedTimes = get(timelineStore).keyframes.get(id)!.map((k) => k.time);
	assert.deepEqual(movedTimes, [0, 2, 3], 'Both selected keyframes moved by +1.0s to 2s and 3s');

	// Copy selected keyframes (at 2s and 3s) and paste at t=5s -> should paste at 5s and 6s
	const copied = timelineStore.copySelectedKeys(id);
	assert.equal(copied, 2);
	timelineStore.setTime(5);
	const pasted = timelineStore.pasteKeysAtPlayhead(id);
	assert.equal(pasted, 2);
	assert.deepEqual(
		get(timelineStore).keyframes.get(id)!.map((k) => k.time),
		[0, 2, 3, 5, 6],
		'Copied keyframes pasted at 5s and 6s with relative offset preserved',
	);

	// Frame snapping
	timelineStore.setSnapToFrames(true);
	const snapped = timelineStore.snapTime(1.012); // At 30fps, frame 30 is 1.0000s, frame 31 is 1.0333s
	assert.equal(snapped, 1);
	assert.equal(timeToFrame(1.5, 30), 45);
	assert.equal(frameToTime(45, 30), 1.5);
});

test('Start/End frames, frame stepping, track locking, muting, and Auto-Key with undo/redo', () => {
	resetAll();
	timelineStore.setFrameRate(24);
	timelineStore.setStartFrame(12); // 0.5s
	timelineStore.setEndFrame(48);   // 2.0s
	assert.equal(get(timelineStore).duration, 2);
	assert.equal(get(timelineStore). currentTime, 0.5, 'Current time clamped to startFrame (0.5s)');

	timelineStore.nextFrame();
	assert.equal(timeToFrame(get(timelineStore).currentTime, 24), 13);
	timelineStore.prevFrame();
	assert.equal(timeToFrame(get(timelineStore).currentTime, 24), 12);
	timelineStore.prevFrame();
	assert.equal(timeToFrame(get(timelineStore).currentTime, 24), 12, 'Clamps at startFrame');

	// Auto-Key stores actual transform values and undoes/redoes in 1 step
	timelineStore.setStartFrame(0);
	timelineStore.setTime(0);
	timelineStore.setShow(true);
	timelineStore.setAutoKey(true);

	sceneStore.addPrimitive('cube', [1, 2, 3]);
	const id = get(sceneStore).objects[0].id;
	timelineStore.setTime(1.0);
	sceneStore.beginTransform('transform');
	sceneStore.setTransforms([{ id, position: [5, 6, 7], rotation: [0.2, 0.4, 0.6], scale: [1.5, 2.0, 2.5] }]);
	sceneStore.endTransform();

	const keys = get(timelineStore).keyframes.get(id)!;
	assert.equal(keys.length, 2, 'Auto-Key recorded restPose at 0s and new transform at 1s');
	assert.deepEqual(keys[1].position, [5, 6, 7]);
	assert.deepEqual(keys[1].scale, [1.5, 2.0, 2.5]);

	// Undo restores both transform and keyframes in a single step
	sceneStore.undo();
	assert.deepEqual(get(sceneStore).objects[0].position, [1, 2, 3]);
	assert.equal(get(timelineStore).keyframes.get(id), undefined);

	sceneStore.redo();
	assert.deepEqual(get(sceneStore).objects[0].position, [5, 6, 7]);
	assert.equal(get(timelineStore).keyframes.get(id)?.length, 2);

	// Track lock prevents keyframe modification
	timelineStore.toggleTrackLock(id);
	assert.equal(timelineStore.getTrackMeta(id).locked, true);
	timelineStore.removeKeyframe(id, 1.0);
	assert.equal(get(timelineStore).keyframes.get(id)?.length, 2, 'Locked track blocks keyframe deletion');
	timelineStore.toggleTrackLock(id);

	// Track mute skips evaluation for that track
	timelineStore.toggleTrackMute(id);
	assert.equal(timelineStore.evaluate(0.5, false).get(id), undefined, 'Muted track is skipped during evaluation');
	timelineStore.toggleTrackMute(id);
	assert.ok(timelineStore.evaluate(0.5, false).get(id), 'Unmuted track evaluates normally');
});
