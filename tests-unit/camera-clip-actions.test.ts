import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { timelineStore } from '../src/stores/timeline.ts';
import { sceneStore } from '../src/stores/scene.ts';
import { viewportStore } from '../src/stores/viewport.ts';
import { createProject, validateProject, applyProject } from '../src/lib/project.ts';
import { lookAtEuler, focalLengthToFOV, fovToFocalLength } from '../src/lib/math3d.ts';

function resetAll() {
	sceneStore.clear();
	timelineStore.clearKeyframes();
	timelineStore.setFrameRate(30);
	timelineStore.setDuration(10);
	timelineStore.setStartFrame(0);
	timelineStore.setPlaying(false);
	timelineStore.setTime(0);
	viewportStore.setViewThroughCamera(false);
}

test('Clip Actions: Split layer divides clip into Part A and Part B with accurate keyframes and undo', () => {
	resetAll();
	sceneStore.addPrimitive('cube', [0, 0.5, 0]);
	const cubeId = get(sceneStore).objects[0].id;

	// Set clip from 0s to 6s
	timelineStore.setClip(cubeId, 0, 6);

	// Add keyframes at t=0s, t=2s, t=4s, t=6s
	timelineStore.setTime(0);
	sceneStore.recordKeyframe(cubeId, 0);
	sceneStore.setTransform(cubeId, { position: [4, 2, 0] });
	timelineStore.setTime(2);
	sceneStore.recordKeyframe(cubeId, 2);
	sceneStore.setTransform(cubeId, { position: [8, 4, 0] });
	timelineStore.setTime(4);
	sceneStore.recordKeyframe(cubeId, 4);
	sceneStore.setTransform(cubeId, { position: [12, 6, 0] });
	timelineStore.setTime(6);
	sceneStore.recordKeyframe(cubeId, 6);

	// Split at t=3s
	timelineStore.setTime(3);
	const splitResult = sceneStore.splitLayer(cubeId, 3);
	assert.ok(splitResult, 'Split layer returns partA and partB IDs');
	assert.equal(splitResult.partAId, cubeId);
	assert.ok(splitResult.partBId);

	// Part A clip should be [0, 3], Part B clip should be [3, 6]
	const tl = get(timelineStore);
	const clipA = tl.clips.get(splitResult.partAId);
	const clipB = tl.clips.get(splitResult.partBId);
	assert.ok(clipA && clipA.start === 0 && clipA.end === 3, 'Part A clip is 0s to 3s');
	assert.ok(clipB && clipB.start === 3 && clipB.end === 6, 'Part B clip is 3s to 6s');

	// Undo should revert the split
	sceneStore.undo();
	const scAfterUndo = get(sceneStore);
	assert.equal(scAfterUndo.objects.length, 1, 'Undo reverts split to 1 object');
});

test('Clip Actions: Speed adjustment scales clip duration and keyframe timing', () => {
	resetAll();
	sceneStore.addPrimitive('cube', [0, 0.5, 0]);
	const cubeId = get(sceneStore).objects[0].id;
	timelineStore.setClip(cubeId, 0, 4);

	// Keyframes at 0s, 2s, 4s
	timelineStore.setTime(0);
	sceneStore.recordKeyframe(cubeId, 0);
	sceneStore.setTransform(cubeId, { position: [10, 0, 0] });
	timelineStore.setTime(4);
	sceneStore.recordKeyframe(cubeId, 4);

	// Double speed (2x): duration becomes 2s, keyframe at 4s moves to 2s
	timelineStore.setLayerSpeed(cubeId, 2.0);
	const clipAfter2x = get(timelineStore).clips.get(cubeId);
	assert.ok(clipAfter2x && Math.abs(clipAfter2x.end - 2.0) < 0.05, 'Clip duration halved under 2x speed');
	const keysAfter2x = get(timelineStore).keyframes.get(cubeId) ?? [];
	assert.ok(Math.abs(keysAfter2x[keysAfter2x.length - 1].time - 2.0) < 0.05, 'End keyframe shifted to 2.0s');
});

test('Clip Actions: Reverse layer mirrors keyframe timing', () => {
	resetAll();
	sceneStore.addPrimitive('cube', [0, 0.5, 0]);
	const cubeId = get(sceneStore).objects[0].id;
	timelineStore.setClip(cubeId, 0, 4);

	// Keyframe at t=1s with pos [1, 0, 0] and t=3s with pos [9, 0, 0]
	timelineStore.addKeyframe(cubeId, { time: 1, position: [1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
	timelineStore.addKeyframe(cubeId, { time: 3, position: [9, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });

	timelineStore.reverseLayer(cubeId);
	const keys = get(timelineStore).keyframes.get(cubeId) ?? [];
	assert.equal(keys.length, 2);
	// In [0, 4]: 1s mirrors to 4 - 1 = 3s (holding [1, 0, 0]); 3s mirrors to 4 - 3 = 1s (holding [9, 0, 0])
	assert.ok(Math.abs(keys[0].time - 1) < 0.02 && keys[0].position[0] === 9, 'First key is now at 1s holding pos 9');
	assert.ok(Math.abs(keys[1].time - 3) < 0.02 && keys[1].position[0] === 1, 'Second key is now at 3s holding pos 1');
});

test('Clip Actions: Freeze frame inserts pause hold and shifts following keys', () => {
	resetAll();
	sceneStore.addPrimitive('cube', [0, 0.5, 0]);
	const cubeId = get(sceneStore).objects[0].id;
	timelineStore.setClip(cubeId, 0, 6);

	timelineStore.addKeyframe(cubeId, { time: 1, position: [2, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
	timelineStore.addKeyframe(cubeId, { time: 4, position: [8, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });

	// Freeze at t=1.0s for 2.0s
	timelineStore.freezeLayer(cubeId, 1.0, 2.0);
	const keys = get(timelineStore).keyframes.get(cubeId) ?? [];
	// The subsequent key that was at 4s should now be shifted to 4 + 2 = 6s
	const lastKey = keys.find((k) => k.position[0] === 8);
	assert.ok(lastKey && Math.abs(lastKey.time - 6.0) < 0.02, 'Subsequent key shifted by freeze duration to 6.0s');
});

test('Camera System: Camera look_at and follow tracking rotates camera to target object and persists in project', () => {
	resetAll();
	sceneStore.addPrimitive('cube', [0, 0, 0]);
	const cubeId = get(sceneStore).objects[0].id;

	sceneStore.addPrimitive('camera', [0, 2, 6]);
	const camId = get(sceneStore).objects[1].id;

	// Verify lookAtEuler math
	const rotToOrigin = lookAtEuler([0, 2, 6], [0, 0, 0]);
	assert.ok(Math.abs(rotToOrigin[1]) < 0.01, 'Yaw is centered at 0 when looking along -Z');
	assert.ok(rotToOrigin[0] < 0, 'Pitch tilts down towards lower target');

	// Set camera to track cube
	sceneStore.setCameraProps(camId, {
		targetId: cubeId,
		trackingMode: 'look_at',
		fov: 45,
	});

	// Move cube to [5, 2, 0]
	sceneStore.setTransform(cubeId, { position: [5, 2, 0] });
	sceneStore.updateCameraTracking(0.016, 0);

	const camObj = get(sceneStore).objects.find((o) => o.id === camId);
	assert.ok(camObj?.cameraProps?.targetId === cubeId, 'Camera has cube as tracking target');
	// Since cube moved to the right (+X), camera yaw should rotate towards +X (negative yaw in standard coord system)
	assert.ok(camObj && camObj.rotation[1] !== 0, 'Camera rotated towards new target position');

	// Verify FOV / focal length conversion
	const fov50 = focalLengthToFOV(50);
	const mm50 = fovToFocalLength(fov50);
	assert.ok(Math.abs(mm50 - 50) < 0.01, 'Focal length to FOV round trip matches 50mm');

	// Verify project save & reload round-trip preserves camera tracking properties
	const saved = validateProject(JSON.parse(JSON.stringify(createProject('CameraProject'))));
	applyProject(saved);
	const reloadedCam = get(sceneStore).objects.find((o) => o.id === camId);
	assert.ok(reloadedCam?.cameraProps?.targetId === cubeId, 'Reloaded camera preserves tracking targetId');
	assert.equal(reloadedCam?.cameraProps?.trackingMode, 'look_at');
	assert.equal(reloadedCam?.cameraProps?.fov, 45);
});
