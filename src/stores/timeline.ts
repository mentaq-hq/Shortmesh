import { writable, get } from 'svelte/store';
import {
	CHANNEL_PATHS,
	FCurve,
	MAX_TIMELINE_SECONDS,
	TRANSFORM_CHANNELS,
	VISIBILITY_CHANNEL,
	eulerToQuatClosest,
	evaluateQuaternion,
	evaluateVector,
	evaluateVisibility,
	frameToTime,
	quatToEuler,
	timeToFrame,
	type BezTriple,
	type ChannelPath,
	type Interpolation,
	type Quat,
} from '../lib/fcurve';

/**
 * The pose that is stored at a keyframe.
 *
 * The shape is kept for the project file format, the channels themselves live
 * in the F-Curves of the timeline.
 */
export interface KeyframeData {
	time: number;
	position: [number, number, number];
	rotation: [number, number, number];
	scale: [number, number, number];
	visible?: boolean;
	interpolation?: Interpolation;
}

/** Per-object animation track metadata (lock, mute/hide, custom track name). */
export interface TrackMeta {
	objectId: string;
	name?: string;
	locked: boolean;
	hidden: boolean;
	muted: boolean;
}

/** Identifies a single selected keyframe on an object track. */
export interface KeyframeSelection {
	objectId: string;
	time: number;
}

/** Clipboard entry for copy/paste keyframe operations. */
export interface CopiedKeyframe {
	objectId: string;
	offset: number;
	pose: KeyframeData;
	channels: Record<string, BezTriple>;
}

/** A non linear action strip, Blender's `bActionStrip`. */
export interface NlaStrip {
	id: string;
	objectId: string;
	name: string;
	/** Start of the strip on the timeline, in seconds. */
	start: number;
	/** End of the strip on the timeline, in seconds. */
	end: number;
	/** First action frame the strip shows. */
	actionStart: number;
	/** Last action frame the strip shows. */
	actionEnd: number;
	/** Playback rate of the strip, 0.1 to 10. */
	speed: number;
	/** Runs the action backwards. */
	reversed: boolean;
	/** Holds the pose of the first action frame. */
	frozen: boolean;
	muted: boolean;
}

export interface TimelineState {
	currentTime: number;
	duration: number;
	startFrame: number;
	endFrame: number;
	playing: boolean;
	loop: boolean;
	easing: boolean;
	autoKey: boolean;
	snapToFrames: boolean;
	multiSelectMode: boolean;
	show: boolean;
	frameRate: number;
	/** Pose list per object, the dope sheet view of the animation. */
	keyframes: Map<string, KeyframeData[]>;
	/** F-Curves per object, keyed by channel path. */
	curves: Map<string, Map<string, FCurve>>;
	/** Per-object track state (locked, hidden, muted, name). */
	tracks: Map<string, TrackMeta>;
	/** Non linear action strips. */
	strips: NlaStrip[];
	/** Explicit layer placements, set by dragging a bar in time. */
	clips: Map<string, LayerClip>;
	selectedStripId: string | null;
	/** Primary keyframe selected in the dope sheet, if any. */
	selectedKey: KeyframeSelection | null;
	/** Multi-selected keyframes across one or more tracks. */
	selectedKeys: KeyframeSelection[];
	/** Copied keyframes ready to paste at the playhead. */
	clipboardKeys: CopiedKeyframe[];
	/** True while the user drags the playhead or scrolls the timeline. */
	isUserScrubbing: boolean;
	/** Width of one second on the timeline ruler, in pixels. */
	pxPerSecond: number;
}

/** The on-timeline lifetime of a layer that is not driven by a pose animation. */
export interface LayerClip {
	start: number;
	end: number;
}

export type EvaluatedTransform = {
	position?: [number, number, number];
	rotation?: [number, number, number];
	scale?: [number, number, number];
	visible?: boolean;
};

const initialState: TimelineState = {
	currentTime: 0,
	duration: 10,
	startFrame: 0,
	endFrame: 300,
	playing: false,
	loop: true,
	easing: true,
	autoKey: true,
	snapToFrames: false,
	multiSelectMode: false,
	show: false,
	frameRate: 30,
	keyframes: new Map(),
	curves: new Map(),
	tracks: new Map(),
	strips: [],
	clips: new Map(),
	selectedStripId: null,
	selectedKey: null,
	selectedKeys: [],
	clipboardKeys: [],
	isUserScrubbing: false,
	pxPerSecond: 60,
};

/**
 * Two key times closer than this are the same key.
 *
 * The value is below one frame at 120 fps, so a real frame step always
 * produces a distinct key, while float noise from pointer maths does not.
 */
export const KEY_EPSILON = 1e-3;

/** Rounds to the 1/10000 s precision used by the project file. */
export function roundTime(time: number): number {
	return Math.round(time * 10000) / 10000;
}

export function sameTime(a: number, b: number): boolean {
	return Math.abs(a - b) < KEY_EPSILON;
}

let stripCounter = 1;

function nextStripId(): string {
	const existing = new Set(get(timelineStore).strips.map((strip) => strip.id));
	let id = `strip-${stripCounter++}`;
	while (existing.has(id)) id = `strip-${stripCounter++}`;
	return id;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/** Keeps non-finite input out of the animation data. */
function finiteTuple(
	value: [number, number, number] | undefined,
	fallback: [number, number, number],
): [number, number, number] {
	if (!Array.isArray(value) || value.length !== 3) return [...fallback];
	return value.every((item) => typeof item === 'number' && Number.isFinite(item))
		? [value[0], value[1], value[2]]
		: [...fallback];
}

/** Creates the curve map of an object when it does not exist yet. */
function ensureCurves(curves: Map<string, Map<string, FCurve>>, objectId: string): Map<string, FCurve> {
	let entry = curves.get(objectId);
	if (!entry) {
		entry = new Map();
		curves.set(objectId, entry);
	}
	return entry;
}

function ensureCurve(entry: Map<string, FCurve>, path: string): FCurve {
	let curve = entry.get(path);
	if (!curve) {
		curve = new FCurve(path);
		entry.set(path, curve);
	}
	return curve;
}

function ensureTrackMeta(tracks: Map<string, TrackMeta>, objectId: string): TrackMeta {
	let meta = tracks.get(objectId);
	if (!meta) {
		meta = { objectId, locked: false, hidden: false, muted: false };
		tracks.set(objectId, meta);
	}
	return meta;
}

/** Maps a time on a strip to the action time it shows. */
export function stripActionTime(strip: NlaStrip, time: number): number {
	if (strip.frozen) return strip.actionStart;
	const elapsed = Math.max(0, time - strip.start) * strip.speed;
	const value = strip.reversed ? strip.actionEnd - elapsed : strip.actionStart + elapsed;
	return clamp(value, Math.min(strip.actionStart, strip.actionEnd), Math.max(strip.actionStart, strip.actionEnd));
}

/** Longest keyframe time of an object, the length of its action. */
export function actionDuration(keys: KeyframeData[]): number {
	let duration = 0;
	for (const key of keys) duration = Math.max(duration, key.time);
	return duration;
}

/** A complete copy of the animation data, used by undo and redo. */
export interface AnimationSnapshot {
	keyframes: Record<string, KeyframeData[]>;
	curves: Record<string, Record<string, BezTriple[]>>;
	tracks?: Record<string, TrackMeta>;
	strips: NlaStrip[];
	clips: Record<string, LayerClip>;
	selectedStripId: string | null;
	selectedKey: KeyframeSelection | null;
	selectedKeys?: KeyframeSelection[];
	duration: number;
	startFrame?: number;
	endFrame?: number;
	snapToFrames?: boolean;
	loop: boolean;
	easing: boolean;
	frameRate: number;
}

function createTimelineStore() {
	const { subscribe, set, update } = writable<TimelineState>(initialState);
	/** Timeline time and wall clock at the moment playback was anchored. */
	let anchorTime = 0;
	let anchorWall = 0;
	let anchored = false;

	function anchorAt(time: number) {
		anchorTime = time;
		anchorWall = performance.now();
		anchored = true;
	}

	function stopClock() {
		anchored = false;
	}

	function startTimeOf(state: TimelineState): number {
		if (!state.startFrame || state.startFrame <= 0) return 0;
		return clamp(roundTime(state.startFrame / state.frameRate), 0, Math.max(0, state.duration - 1 / state.frameRate));
	}

	function writeTransformChannels(
		curves: Map<string, Map<string, FCurve>>,
		objectId: string,
		pose: KeyframeData,
		reference: Quat | null,
		interpolation?: Interpolation,
	) {
		const entry = ensureCurves(curves, objectId);
		for (const path of TRANSFORM_CHANNELS) {
			ensureCurve(entry, path);
		}
		const interp = interpolation ?? pose.interpolation;
		entry.get('location.x')?.insert(pose.time, pose.position[0], interp);
		entry.get('location.y')?.insert(pose.time, pose.position[1], interp);
		entry.get('location.z')?.insert(pose.time, pose.position[2], interp);
		entry.get('scale.x')?.insert(pose.time, pose.scale[0], interp);
		entry.get('scale.y')?.insert(pose.time, pose.scale[1], interp);
		entry.get('scale.z')?.insert(pose.time, pose.scale[2], interp);

		const quaternion = eulerToQuatClosest(pose.rotation, reference ?? [1, 0, 0, 0]);
		entry.get('rotation_quaternion.w')?.insert(pose.time, quaternion[0], interp);
		entry.get('rotation_quaternion.x')?.insert(pose.time, quaternion[1], interp);
		entry.get('rotation_quaternion.y')?.insert(pose.time, quaternion[2], interp);
		entry.get('rotation_quaternion.z')?.insert(pose.time, quaternion[3], interp);

		if (pose.visible !== undefined) {
			ensureCurve(entry, VISIBILITY_CHANNEL).insert(pose.time, pose.visible ? 1 : 0, interp ?? 'constant');
		} else if (entry.has(VISIBILITY_CHANNEL)) {
			const visCurve = entry.get(VISIBILITY_CHANNEL)!;
			const curVal = visCurve.evaluate(pose.time, true) ?? 1;
			visCurve.insert(pose.time, curVal >= 0.5 ? 1 : 0, interp ?? 'constant');
		}
	}

	function referenceQuaternion(curves: Map<string, Map<string, FCurve>>, objectId: string, time: number): Quat | null {
		const entry = curves.get(objectId);
		if (!entry) return null;
		return evaluateQuaternion(entry, time, true);
	}

	function removePoseAndCurvesAt(state: TimelineState, objectId: string, time: number) {
		const keys = state.keyframes.get(objectId) ?? [];
		const next = keys.filter((key) => !sameTime(key.time, time));
		if (next.length) state.keyframes.set(objectId, next);
		else state.keyframes.delete(objectId);
		const entry = state.curves.get(objectId);
		if (entry) {
			for (const path of CHANNEL_PATHS) entry.get(path)?.remove(time);
		}
	}

	return {
		subscribe,
		set,
		/** Snaps a time in seconds to the nearest frame if `snapToFrames` is enabled. */
		snapTime: (time: number): number => {
			const state = get(timelineStore);
			const clamped = clamp(time, 0, state.duration);
			if (!state.snapToFrames) return roundTime(clamped);
			return frameToTime(timeToFrame(clamped, state.frameRate), state.frameRate);
		},
		/** Moves the playhead inside the playback range. */
		setTime: (time: number) =>
			update((state) => {
				const next = clamp(time, 0, state.duration);
				state.currentTime = next;
				if (state.playing) anchorAt(next);
				return state;
			}),
		seek: (time: number) =>
			update((state) => {
				state.currentTime = clamp(time, 0, state.duration);
				state.playing = false;
				stopClock();
				return state;
			}),
		setFrame: (frame: number) =>
			update((state) => {
				const t = clamp(frameToTime(frame, state.frameRate), 0, state.duration);
				state.currentTime = t;
				if (state.playing) anchorAt(t);
				return state;
			}),
		getCurrentFrame: (): number => {
			const state = get(timelineStore);
			return timeToFrame(state.currentTime, state.frameRate);
		},
		setStartFrame: (frame: number) =>
			update((state) => {
				const maxStart = Math.max(0, state.endFrame - 1);
				state.startFrame = clamp(Math.round(frame), 0, maxStart);
				const minT = startTimeOf(state);
				if (state.currentTime < minT) state.currentTime = minT;
				return state;
			}),
		setEndFrame: (frame: number) =>
			update((state) => {
				const maxFrames = Math.round(MAX_TIMELINE_SECONDS * state.frameRate);
				state.endFrame = clamp(Math.round(frame), state.startFrame + 1, maxFrames);
				state.duration = clamp(roundTime(state.endFrame / state.frameRate), 0.1, MAX_TIMELINE_SECONDS);
				if (state.currentTime > state.duration) state.currentTime = state.duration;
				if (state.playing) anchorAt(state.currentTime);
				return state;
			}),
		setDuration: (duration: number) =>
			update((state) => {
				state.duration = clamp(duration, 0.1, MAX_TIMELINE_SECONDS);
				state.endFrame = Math.max(1, Math.round(state.duration * state.frameRate));
				if (state.startFrame >= state.endFrame) state.startFrame = Math.max(0, state.endFrame - 1);
				if (state.currentTime > state.duration) state.currentTime = state.duration;
				if (state.playing) anchorAt(state.currentTime);
				return state;
			}),
		setPlaying: (playing: boolean) =>
			update((state) => {
				if (playing === state.playing) return state;
				state.playing = playing;
				if (playing) {
					const startT = startTimeOf(state);
					if (state.currentTime >= state.duration || state.currentTime < startT) state.currentTime = startT;
					anchorAt(state.currentTime);
				} else {
					stopClock();
				}
				return state;
			}),
		togglePlay: () =>
			update((state) => {
				if (state.playing) {
					state.playing = false;
					stopClock();
					return state;
				}
				const startT = startTimeOf(state);
				if (state.currentTime >= state.duration || state.currentTime < startT) state.currentTime = startT;
				state.playing = true;
				anchorAt(state.currentTime);
				return state;
			}),
		/** Stops playback and rewinds the playhead to the start frame. */
		stop: () =>
			update((state) => {
				state.playing = false;
				stopClock();
				state.currentTime = startTimeOf(state);
				return state;
			}),
		/** Jumps to the first frame of the playback range and evaluates it. */
		goToStart: () =>
			update((state) => {
				const startT = startTimeOf(state);
				state.currentTime = startT;
				if (state.playing) anchorAt(startT);
				return state;
			}),
		/** Jumps to the end frame of the playback range. */
		goToEnd: () =>
			update((state) => {
				state.currentTime = state.duration;
				if (state.playing) anchorAt(state.duration);
				return state;
			}),
		resyncClock: () => {
			const state = get(timelineStore);
			if (state.playing) anchorAt(state.currentTime);
		},
		toggleLoop: () =>
			update((state) => {
				state.loop = !state.loop;
				return state;
			}),
		setLoop: (loop: boolean) =>
			update((state) => {
				state.loop = loop;
				return state;
			}),
		toggleEasing: () =>
			update((state) => {
				state.easing = !state.easing;
				return state;
			}),
		setEasing: (easing: boolean) =>
			update((state) => {
				state.easing = easing;
				return state;
			}),
		toggleAutoKey: () =>
			update((state) => {
				state.autoKey = !state.autoKey;
				return state;
			}),
		setAutoKey: (autoKey: boolean) =>
			update((state) => {
				state.autoKey = autoKey;
				return state;
			}),
		toggleSnapToFrames: () =>
			update((state) => {
				state.snapToFrames = !state.snapToFrames;
				return state;
			}),
		setSnapToFrames: (snap: boolean) =>
			update((state) => {
				state.snapToFrames = snap;
				return state;
			}),
		toggleMultiSelectMode: () =>
			update((state) => {
				state.multiSelectMode = !state.multiSelectMode;
				return state;
			}),
		setMultiSelectMode: (enabled: boolean) =>
			update((state) => {
				state.multiSelectMode = enabled;
				return state;
			}),
		toggleShow: () =>
			update((state) => {
				state.show = !state.show;
				return state;
			}),
		setShow: (show: boolean) =>
			update((state) => {
				state.show = show;
				return state;
			}),
		setFrameRate: (fps: number) =>
			update((state) => {
				state.frameRate = clamp(Math.round(fps), 1, 120);
				state.endFrame = Math.max(1, Math.round(state.duration * state.frameRate));
				if (state.startFrame >= state.endFrame) state.startFrame = Math.max(0, state.endFrame - 1);
				return state;
			}),
		setPxPerSecond: (value: number) =>
			update((state) => {
				state.pxPerSecond = clamp(value, 0.25, 400);
				return state;
			}),
		setUserScrubbing: (scrubbing: boolean) =>
			update((state) => {
				if (state.isUserScrubbing === scrubbing) return state;
				state.isUserScrubbing = scrubbing;
				return state;
			}),

		// ---- Track Management (Selection, Rename, Lock, Hide/Mute) ----------

		getTrackMeta: (objectId: string): TrackMeta => {
			const state = get(timelineStore);
			return state.tracks.get(objectId) ?? { objectId, locked: false, hidden: false, muted: false };
		},
		setTrackMeta: (objectId: string, patch: Partial<TrackMeta>) =>
			update((state) => {
				const meta = ensureTrackMeta(state.tracks, objectId);
				Object.assign(meta, patch, { objectId });
				return state;
			}),
		toggleTrackLock: (objectId: string) =>
			update((state) => {
				const meta = ensureTrackMeta(state.tracks, objectId);
				meta.locked = !meta.locked;
				return state;
			}),
		toggleTrackMute: (objectId: string) =>
			update((state) => {
				const meta = ensureTrackMeta(state.tracks, objectId);
				meta.muted = !meta.muted;
				return state;
			}),
		toggleTrackHidden: (objectId: string) =>
			update((state) => {
				const meta = ensureTrackMeta(state.tracks, objectId);
				meta.hidden = !meta.hidden;
				return state;
			}),

		// ---- Keyframe Operations --------------------------------------------

		addKeyframe: (objectId: string, keyframe: KeyframeData) =>
			update((state) => {
				if (!objectId || !Number.isFinite(keyframe.time)) return state;
				if (state.tracks.get(objectId)?.locked) return state;
				const rawTime = clamp(keyframe.time, 0, state.duration);
				const requested = state.snapToFrames
					? frameToTime(timeToFrame(rawTime, state.frameRate), state.frameRate)
					: roundTime(rawTime);
				const keys = state.keyframes.get(objectId) ?? [];
				const existing = keys.findIndex((key) => sameTime(key.time, requested));
				const time = existing >= 0 ? keys[existing].time : requested;
				const pose: KeyframeData = {
					time,
					position: finiteTuple(keyframe.position, [0, 0, 0]),
					rotation: finiteTuple(keyframe.rotation, [0, 0, 0]),
					scale: finiteTuple(keyframe.scale, [1, 1, 1]),
					...(keyframe.visible !== undefined ? { visible: Boolean(keyframe.visible) } : {}),
					...(keyframe.interpolation ? { interpolation: keyframe.interpolation } : {}),
				};
				if (existing >= 0) keys[existing] = pose;
				else keys.push(pose);
				keys.sort((a, b) => a.time - b.time);
				state.keyframes.set(objectId, keys);
				const reference = referenceQuaternion(state.curves, objectId, time);
				writeTransformChannels(state.curves, objectId, pose, reference, keyframe.interpolation);
				state.selectedKey = { objectId, time };
				state.selectedKeys = [{ objectId, time }];
				const clip = state.clips.get(objectId);
				if (clip) {
					const minT = Math.min(clip.start, keys[0].time);
					const maxT = Math.max(clip.end, keys[keys.length - 1].time, minT + 0.2);
					state.clips.set(objectId, { start: minT, end: Math.min(state.duration, maxT) });
				}
				return state;
			}),

		/** Edits an existing keyframe's values or interpolation at `time`. */
		updateKeyframe: (
			objectId: string,
			time: number,
			patch: Partial<KeyframeData> & { interpolation?: Interpolation },
		) =>
			update((state) => {
				if (state.tracks.get(objectId)?.locked) return state;
				const keys = state.keyframes.get(objectId);
				if (!keys) return state;
				const idx = keys.findIndex((k) => sameTime(k.time, time));
				if (idx < 0) return state;
				const existing = keys[idx];
				const updated: KeyframeData = {
					...existing,
					position: patch.position ? finiteTuple(patch.position, existing.position) : [...existing.position],
					rotation: patch.rotation ? finiteTuple(patch.rotation, existing.rotation) : [...existing.rotation],
					scale: patch.scale ? finiteTuple(patch.scale, existing.scale) : [...existing.scale],
					...(patch.visible !== undefined ? { visible: Boolean(patch.visible) } : {}),
					...(patch.interpolation ? { interpolation: patch.interpolation } : {}),
				};
				keys[idx] = updated;
				const reference = referenceQuaternion(state.curves, objectId, existing.time);
				writeTransformChannels(state.curves, objectId, updated, reference, patch.interpolation);
				return state;
			}),

		/** Records a visibility keyframe (`visible: true/false`) on `objectId` at `time`. */
		setVisibilityKeyframe: (objectId: string, time: number, visible: boolean, fallbackPose?: Omit<KeyframeData, 'time'>) =>
			update((state) => {
				if (!objectId || !Number.isFinite(time) || state.tracks.get(objectId)?.locked) return state;
				const t = state.snapToFrames
					? frameToTime(timeToFrame(clamp(time, 0, state.duration), state.frameRate), state.frameRate)
					: roundTime(clamp(time, 0, state.duration));
				const entry = ensureCurves(state.curves, objectId);
				ensureCurve(entry, VISIBILITY_CHANNEL).insert(t, visible ? 1 : 0, 'constant');

				const keys = state.keyframes.get(objectId) ?? [];
				const idx = keys.findIndex((k) => sameTime(k.time, t));
				if (idx >= 0) {
					keys[idx] = { ...keys[idx], visible };
				} else if (fallbackPose) {
					const pose: KeyframeData = {
						time: t,
						position: finiteTuple(fallbackPose.position, [0, 0, 0]),
						rotation: finiteTuple(fallbackPose.rotation, [0, 0, 0]),
						scale: finiteTuple(fallbackPose.scale, [1, 1, 1]),
						visible,
					};
					keys.push(pose);
					keys.sort((a, b) => a.time - b.time);
					state.keyframes.set(objectId, keys);
					const ref = referenceQuaternion(state.curves, objectId, t);
					writeTransformChannels(state.curves, objectId, pose, ref);
				}
				return state;
			}),

		/** Writes a single channel, used by the material opacity, colour, or visibility. */
		addChannelKeyframe: (objectId: string, path: ChannelPath, time: number, value: number, interpolation?: Interpolation) =>
			update((state) => {
				if (state.tracks.get(objectId)?.locked) return state;
				const entry = ensureCurves(state.curves, objectId);
				ensureCurve(entry, path).insert(clamp(time, 0, MAX_TIMELINE_SECONDS), value, interpolation);
				return state;
			}),

		/** Changes the interpolation of every key of a channel (or a specific keyTime). */
		setInterpolation: (objectId: string, path: ChannelPath, interpolation: Interpolation, keyTime?: number) =>
			update((state) => {
				if (state.tracks.get(objectId)?.locked) return state;
				const curve = state.curves.get(objectId)?.get(path);
				if (!curve) return state;
				for (const key of curve.keys) {
					if (keyTime === undefined || sameTime(key.time, keyTime)) {
						key.interpolation = interpolation;
					}
				}
				return state;
			}),

		/** Sets interpolation across all transform channels of `objectId` (at `keyTime` or all keys). */
		setObjectInterpolation: (objectId: string, interpolation: Interpolation, keyTime?: number) =>
			update((state) => {
				if (state.tracks.get(objectId)?.locked) return state;
				const entry = state.curves.get(objectId);
				if (entry) {
					for (const path of TRANSFORM_CHANNELS) {
						const curve = entry.get(path);
						if (!curve) continue;
						for (const key of curve.keys) {
							if (keyTime === undefined || sameTime(key.time, keyTime)) {
								key.interpolation = interpolation;
							}
						}
					}
				}
				const keys = state.keyframes.get(objectId);
				if (keys) {
					for (const k of keys) {
						if (keyTime === undefined || sameTime(k.time, keyTime)) {
							k.interpolation = interpolation;
						}
					}
				}
				return state;
			}),

		/** Interpolation of the selected key (or first key) of a channel. */
		interpolationOf: (objectId: string, path: ChannelPath, keyTime?: number): Interpolation => {
			const state = get(timelineStore);
			const curve = state.curves.get(objectId)?.get(path);
			if (!curve || !curve.keys.length) return 'bezier';
			if (keyTime !== undefined) {
				const match = curve.keys.find((k) => sameTime(k.time, keyTime));
				if (match) return match.interpolation;
			}
			return curve.keys[0]?.interpolation ?? 'bezier';
		},

		removeKeyframe: (objectId: string, time: number) =>
			update((state) => {
				if (state.tracks.get(objectId)?.locked) return state;
				removePoseAndCurvesAt(state, objectId, time);
				if (state.selectedKey?.objectId === objectId && sameTime(state.selectedKey.time, time)) {
					state.selectedKey = null;
				}
				state.selectedKeys = state.selectedKeys.filter(
					(sel) => !(sel.objectId === objectId && sameTime(sel.time, time)),
				);
				if (!state.selectedKey && state.selectedKeys.length) {
					state.selectedKey = { ...state.selectedKeys[state.selectedKeys.length - 1] };
				}
				return state;
			}),

		selectKeyframe: (objectId: string, time: number, additive = false) =>
			update((state) => {
				if (!objectId || !Number.isFinite(time)) return state;
				const clamped = clamp(time, 0, state.duration);
				const useMulti = additive || state.multiSelectMode;
				if (useMulti) {
					const idx = state.selectedKeys.findIndex(
						(k) => k.objectId === objectId && sameTime(k.time, clamped),
					);
					if (idx >= 0) {
						state.selectedKeys.splice(idx, 1);
						state.selectedKey = state.selectedKeys.length
							? { ...state.selectedKeys[state.selectedKeys.length - 1] }
							: null;
					} else {
						state.selectedKeys.push({ objectId, time: clamped });
						state.selectedKey = { objectId, time: clamped };
					}
				} else {
					state.selectedKey = { objectId, time: clamped };
					state.selectedKeys = [{ objectId, time: clamped }];
				}
				state.currentTime = clamped;
				state.playing = false;
				stopClock();
				return state;
			}),

		selectKeyframes: (selections: KeyframeSelection[]) =>
			update((state) => {
				const valid = selections
					.filter((s) => Boolean(s.objectId) && Number.isFinite(s.time))
					.map((s) => ({ objectId: s.objectId, time: clamp(s.time, 0, state.duration) }));
				state.selectedKeys = valid;
				state.selectedKey = valid.length ? { ...valid[valid.length - 1] } : null;
				return state;
			}),

		selectKeyframesInRange: (startTime: number, endTime: number, objectId?: string) =>
			update((state) => {
				const minT = Math.min(startTime, endTime) - KEY_EPSILON;
				const maxT = Math.max(startTime, endTime) + KEY_EPSILON;
				const found: KeyframeSelection[] = [];
				for (const [oid, keys] of state.keyframes) {
					if (objectId && oid !== objectId) continue;
					if (state.tracks.get(oid)?.locked) continue;
					for (const k of keys) {
						if (k.time >= minT && k.time <= maxT) {
							found.push({ objectId: oid, time: k.time });
						}
					}
				}
				state.selectedKeys = found;
				state.selectedKey = found.length ? { ...found[found.length - 1] } : null;
				return state;
			}),

		clearKeyframeSelection: () =>
			update((state) => {
				state.selectedKey = null;
				state.selectedKeys = [];
				return state;
			}),

		/** Deletes all selected keyframes (multi-selection or primary selectedKey). */
		deleteSelectedKey: () =>
			update((state) => {
				const targets: KeyframeSelection[] =
					state.selectedKeys.length > 0
						? [...state.selectedKeys]
						: state.selectedKey
							? [state.selectedKey]
							: [];
				if (!targets.length) return state;
				for (const target of targets) {
					if (state.tracks.get(target.objectId)?.locked) continue;
					removePoseAndCurvesAt(state, target.objectId, target.time);
				}
				state.selectedKey = null;
				state.selectedKeys = [];
				return state;
			}),

		moveKeyframe: (objectId: string, fromTime: number, toTime: number) =>
			update((state) => {
				if (state.tracks.get(objectId)?.locked) return state;
				const from = roundTime(fromTime);
				const rawTo = clamp(toTime, 0, state.duration);
				const to = state.snapToFrames
					? frameToTime(timeToFrame(rawTo, state.frameRate), state.frameRate)
					: roundTime(rawTo);
				if (sameTime(from, to)) return state;
				const keys = state.keyframes.get(objectId);
				if (!keys) return state;
				const index = keys.findIndex((key) => sameTime(key.time, from));
				if (index < 0) return state;

				const pose = keys[index];
				const moved: KeyframeData = {
					...pose,
					time: to,
					position: [...pose.position] as [number, number, number],
					rotation: [...pose.rotation] as [number, number, number],
					scale: [...pose.scale] as [number, number, number],
				};
				const next = keys.filter((key) => !sameTime(key.time, to));
				const source = next.findIndex((key) => sameTime(key.time, from));
				if (source < 0) return state;
				next[source] = moved;
				next.sort((a, b) => a.time - b.time);
				state.keyframes.set(objectId, next);

				const entry = state.curves.get(objectId);
				if (entry) {
					for (const path of CHANNEL_PATHS) {
						const curve = entry.get(path);
						if (!curve) continue;
						const srcIdx = curve.keys.findIndex((key) => sameTime(key.time, from));
						if (srcIdx < 0) continue;
						const target = curve.keys.findIndex((key, i) => i !== srcIdx && sameTime(key.time, to));
						if (target >= 0) curve.keys.splice(target, 1);
						const curveIndex = curve.keys.findIndex((key) => sameTime(key.time, from));
						if (curveIndex < 0) continue;
						curve.keys[curveIndex].time = to;
						curve.keys.sort((a, b) => a.time - b.time);
					}
				}

				if (state.selectedKey?.objectId === objectId && sameTime(state.selectedKey.time, from)) {
					state.selectedKey = { objectId, time: to };
					state.currentTime = clamp(to, 0, state.duration);
				}
				state.selectedKeys = state.selectedKeys.map((sel) =>
					sel.objectId === objectId && sameTime(sel.time, from) ? { objectId, time: to } : sel,
				);
				return state;
			}),

		/** Moves all currently multi-selected keyframes together by `deltaTime`. */
		moveSelectedKeyframes: (deltaTime: number) =>
			update((state) => {
				const targets =
					state.selectedKeys.length > 0
						? [...state.selectedKeys]
						: state.selectedKey
							? [state.selectedKey]
							: [];
				if (!targets.length || !Number.isFinite(deltaTime) || Math.abs(deltaTime) < 1e-6) return state;

				// Clamp delta so no selected key leaves [0, duration]
				let minTime = Infinity;
				let maxTime = -Infinity;
				for (const sel of targets) {
					if (state.tracks.get(sel.objectId)?.locked) continue;
					minTime = Math.min(minTime, sel.time);
					maxTime = Math.max(maxTime, sel.time);
				}
				if (!Number.isFinite(minTime)) return state;
				let delta = clamp(deltaTime, -minTime, state.duration - maxTime);
				if (state.snapToFrames) {
					delta = Math.round(delta * state.frameRate) / state.frameRate;
				}
				if (Math.abs(delta) < 1e-6) return state;

				// Sort descending when moving right, ascending when moving left to avoid self-collision
				const ordered = [...targets].sort((a, b) => (delta > 0 ? b.time - a.time : a.time - b.time));
				const newSelections: KeyframeSelection[] = [];

				for (const sel of ordered) {
					if (state.tracks.get(sel.objectId)?.locked) {
						newSelections.push(sel);
						continue;
					}
					const from = roundTime(sel.time);
					const to = roundTime(clamp(from + delta, 0, state.duration));
					const keys = state.keyframes.get(sel.objectId);
					if (!keys) continue;
					const idx = keys.findIndex((k) => sameTime(k.time, from));
					if (idx >= 0) {
						keys[idx] = {
							...keys[idx],
							time: to,
							position: [...keys[idx].position],
							rotation: [...keys[idx].rotation],
							scale: [...keys[idx].scale],
						};
						keys.sort((a, b) => a.time - b.time);
					}
					const entry = state.curves.get(sel.objectId);
					if (entry) {
						for (const path of CHANNEL_PATHS) {
							const curve = entry.get(path);
							if (!curve) continue;
							const cIdx = curve.keys.findIndex((k) => sameTime(k.time, from));
							if (cIdx >= 0) {
								curve.keys[cIdx].time = to;
								curve.keys.sort((a, b) => a.time - b.time);
							}
						}
					}
					newSelections.push({ objectId: sel.objectId, time: to });
				}
				state.selectedKeys = newSelections;
				if (state.selectedKey) {
					const primary = newSelections[newSelections.length - 1];
					if (primary) {
						state.selectedKey = { ...primary };
						state.currentTime = primary.time;
					}
				}
				return state;
			}),

		/** Copies selected keyframes (or keyframe at playhead for `objectId`) to the clipboard. */
		copySelectedKeys: (fallbackObjectId?: string): number => {
			let copiedCount = 0;
			update((state) => {
				let targets: KeyframeSelection[] =
					state.selectedKeys.length > 0
						? [...state.selectedKeys]
						: state.selectedKey
							? [state.selectedKey]
							: [];
				if (!targets.length && fallbackObjectId) {
					const keys = state.keyframes.get(fallbackObjectId) ?? [];
					const match = keys.find((k) => sameTime(k.time, state.currentTime)) ?? keys[0];
					if (match) targets = [{ objectId: fallbackObjectId, time: match.time }];
				}
				if (!targets.length) return state;

				const minTime = Math.min(...targets.map((t) => t.time));
				const clipboard: CopiedKeyframe[] = [];
				for (const target of targets) {
					const keys = state.keyframes.get(target.objectId) ?? [];
					const pose = keys.find((k) => sameTime(k.time, target.time));
					if (!pose) continue;
					const channels: Record<string, BezTriple> = {};
					const entry = state.curves.get(target.objectId);
					if (entry) {
						for (const [path, curve] of entry) {
							const k = curve.keys.find((ck) => sameTime(ck.time, target.time));
							if (k) {
								channels[path] = {
									...k,
									handleLeft: [k.handleLeft[0], k.handleLeft[1]],
									handleRight: [k.handleRight[0], k.handleRight[1]],
								};
							}
						}
					}
					clipboard.push({
						objectId: target.objectId,
						offset: roundTime(pose.time - minTime),
						pose: {
							...pose,
							position: [...pose.position],
							rotation: [...pose.rotation],
							scale: [...pose.scale],
						},
						channels,
					});
				}
				state.clipboardKeys = clipboard;
				copiedCount = clipboard.length;
				return state;
			});
			return copiedCount;
		},

		/** Pastes copied keyframes starting at `currentTime` (onto `targetObjectId` if single-object clipboard). */
		pasteKeysAtPlayhead: (targetObjectId?: string): number => {
			let pastedCount = 0;
			update((state) => {
				if (!state.clipboardKeys.length) return state;
				const sourceObjects = new Set(state.clipboardKeys.map((c) => c.objectId));
				const remapSingle = Boolean(targetObjectId && sourceObjects.size === 1);
				const newSelections: KeyframeSelection[] = [];

				for (const item of state.clipboardKeys) {
					const destObjId = remapSingle ? targetObjectId! : item.objectId;
					if (state.tracks.get(destObjId)?.locked) continue;
					const rawTime = clamp(state.currentTime + item.offset, 0, state.duration);
					const time = state.snapToFrames
						? frameToTime(timeToFrame(rawTime, state.frameRate), state.frameRate)
						: roundTime(rawTime);
					const keys = state.keyframes.get(destObjId) ?? [];
					const existingIdx = keys.findIndex((k) => sameTime(k.time, time));
					const pose: KeyframeData = {
						...item.pose,
						time,
						position: [...item.pose.position],
						rotation: [...item.pose.rotation],
						scale: [...item.pose.scale],
					};
					if (existingIdx >= 0) keys[existingIdx] = pose;
					else keys.push(pose);
					keys.sort((a, b) => a.time - b.time);
					state.keyframes.set(destObjId, keys);

					const ref = referenceQuaternion(state.curves, destObjId, time);
					writeTransformChannels(state.curves, destObjId, pose, ref, item.pose.interpolation);
					const entry = ensureCurves(state.curves, destObjId);
					for (const [path, bez] of Object.entries(item.channels)) {
						const curve = ensureCurve(entry, path);
						const inserted = curve.insert(time, bez.value, bez.interpolation);
						inserted.handleLeft = [bez.handleLeft[0], bez.handleLeft[1]];
						inserted.handleRight = [bez.handleRight[0], bez.handleRight[1]];
						inserted.autoLeft = bez.autoLeft;
						inserted.autoRight = bez.autoRight;
					}
					newSelections.push({ objectId: destObjId, time });
					pastedCount++;
				}
				if (newSelections.length) {
					state.selectedKeys = newSelections;
					state.selectedKey = { ...newSelections[newSelections.length - 1] };
				}
				return state;
			});
			return pastedCount;
		},

		/** Jumps to the previous keyframe before `currentTime`. */
		prevKeyframe: (objectId?: string): number | null => {
			let foundTime: number | null = null;
			let foundObj: string | null = null;
			update((state) => {
				for (const [oid, keys] of state.keyframes) {
					if (objectId && oid !== objectId) continue;
					if (state.tracks.get(oid)?.hidden) continue;
					for (const k of keys) {
						if (k.time < state.currentTime - KEY_EPSILON) {
							if (foundTime === null || k.time > foundTime) {
								foundTime = k.time;
								foundObj = oid;
							}
						}
					}
				}
				if (foundTime !== null && foundObj !== null) {
					state.currentTime = foundTime;
					state.selectedKey = { objectId: foundObj, time: foundTime };
					state.selectedKeys = [{ objectId: foundObj, time: foundTime }];
					state.playing = false;
					stopClock();
				}
				return state;
			});
			return foundTime;
		},

		/** Jumps to the next keyframe after `currentTime`. */
		nextKeyframe: (objectId?: string): number | null => {
			let foundTime: number | null = null;
			let foundObj: string | null = null;
			update((state) => {
				for (const [oid, keys] of state.keyframes) {
					if (objectId && oid !== objectId) continue;
					if (state.tracks.get(oid)?.hidden) continue;
					for (const k of keys) {
						if (k.time > state.currentTime + KEY_EPSILON) {
							if (foundTime === null || k.time < foundTime) {
								foundTime = k.time;
								foundObj = oid;
							}
						}
					}
				}
				if (foundTime !== null && foundObj !== null) {
					state.currentTime = foundTime;
					state.selectedKey = { objectId: foundObj, time: foundTime };
					state.selectedKeys = [{ objectId: foundObj, time: foundTime }];
					state.playing = false;
					stopClock();
				}
				return state;
			});
			return foundTime;
		},

		shiftLayer: (objectId: string, delta: number) =>
			update((state) => {
				if (state.tracks.get(objectId)?.locked) return state;
				const keys = state.keyframes.get(objectId) ?? [];
				const strips = state.strips.filter((strip) => strip.objectId === objectId);
				if ((!keys.length && !strips.length) || !Number.isFinite(delta)) return state;
				let first = Infinity;
				let last = -Infinity;
				for (const key of keys) {
					first = Math.min(first, key.time);
					last = Math.max(last, key.time);
				}
				for (const strip of strips) {
					first = Math.min(first, strip.start);
					last = Math.max(last, strip.end);
				}
				const shift = clamp(delta, -first, state.duration - last);
				if (Math.abs(shift) < 1e-6) return state;

				const moved = keys
					.map((key) => ({ ...key, time: roundTime(clamp(key.time + shift, 0, state.duration)) }))
					.sort((a, b) => a.time - b.time);
				state.keyframes.set(objectId, moved);

				const entry = state.curves.get(objectId);
				if (entry) {
					for (const curve of entry.values()) {
						for (const key of curve.keys) key.time = roundTime(clamp(key.time + shift, 0, state.duration));
						curve.keys.sort((a, b) => a.time - b.time);
					}
				}

				for (const strip of strips) {
					strip.start = roundTime(clamp(strip.start + shift, 0, state.duration));
					strip.end = roundTime(clamp(strip.end + shift, 0, state.duration));
				}

				if (state.selectedKey?.objectId === objectId) {
					state.selectedKey = {
						objectId,
						time: roundTime(clamp(state.selectedKey.time + shift, 0, state.duration)),
					};
				}
				state.selectedKeys = state.selectedKeys.map((sel) =>
					sel.objectId === objectId
						? { objectId, time: roundTime(clamp(sel.time + shift, 0, state.duration)) }
						: sel,
				);
				return state;
			}),

		/** Places a layer on the timeline. The clip is the real lifetime window. */
		setClip: (objectId: string, start: number, end: number) =>
			update((state) => {
				if (state.tracks.get(objectId)?.locked) return state;
				const from = roundTime(clamp(Math.min(start, end), 0, state.duration));
				const to = roundTime(clamp(Math.max(start, end), 0, state.duration));
				if (to - from < 0.1) return state;
				state.clips.set(objectId, { start: from, end: to });
				return state;
			}),

		/** Slides a clip in time, clamped to the timeline like `shiftLayer`. */
		shiftClip: (objectId: string, delta: number) =>
			update((state) => {
				if (state.tracks.get(objectId)?.locked) return state;
				const clip = state.clips.get(objectId);
				if (!clip || !Number.isFinite(delta)) return state;
				const shift = clamp(delta, -clip.start, state.duration - clip.end);
				if (Math.abs(shift) < 1e-6) return state;
				state.clips.set(objectId, {
					start: roundTime(clamp(clip.start + shift, 0, state.duration)),
					end: roundTime(clamp(clip.end + shift, 0, state.duration)),
				});
				return state;
			}),

		/** Sets the playback speed of the layer/clip, scaling its duration and keyframes proportionally. */
		setLayerSpeed: (objectId: string, multiplier: number) =>
			update((state) => {
				if (state.tracks.get(objectId)?.locked) return state;
				const mult = clamp(multiplier, 0.1, 10);
				const clip = state.clips.get(objectId) ?? { start: 0, end: 15 };
				const origDuration = Math.max(0.1, clip.end - clip.start);
				const newDuration = clamp(origDuration / mult, 0.1, MAX_TIMELINE_SECONDS);
				const newEnd = clamp(roundTime(clip.start + newDuration), clip.start + 0.1, state.duration);
				state.clips.set(objectId, { start: clip.start, end: newEnd });

				const keys = state.keyframes.get(objectId);
				if (keys && keys.length) {
					for (const k of keys) {
						if (k.time >= clip.start - KEY_EPSILON) {
							k.time = roundTime(clamp(clip.start + (k.time - clip.start) / mult, 0, state.duration));
						}
					}
					keys.sort((a, b) => a.time - b.time);
					const entry = state.curves.get(objectId);
					if (entry) {
						for (const curve of entry.values()) {
							for (const k of curve.keys) {
								if (k.time >= clip.start - KEY_EPSILON) {
									k.time = roundTime(clamp(clip.start + (k.time - clip.start) / mult, 0, state.duration));
								}
							}
							curve.keys.sort((a, b) => a.time - b.time);
						}
					}
				}

				for (const strip of state.strips) {
					if (strip.objectId === objectId) {
						strip.speed = mult;
						strip.end = roundTime(clamp(strip.start + (strip.end - strip.start) / mult, strip.start + 0.1, state.duration));
					}
				}
				return state;
			}),

		/** Reverses the keyframes / motion of the layer within its active clip range. */
		reverseLayer: (objectId: string) =>
			update((state) => {
				if (state.tracks.get(objectId)?.locked) return state;
				const clip = state.clips.get(objectId) ?? { start: 0, end: 15 };
				const keys = state.keyframes.get(objectId);
				if (keys && keys.length) {
					for (const k of keys) {
						if (k.time >= clip.start - KEY_EPSILON && k.time <= clip.end + KEY_EPSILON) {
							k.time = roundTime(clamp(clip.start + clip.end - k.time, 0, state.duration));
						}
					}
					keys.sort((a, b) => a.time - b.time);
					const entry = state.curves.get(objectId);
					if (entry) {
						for (const curve of entry.values()) {
							for (const k of curve.keys) {
								if (k.time >= clip.start - KEY_EPSILON && k.time <= clip.end + KEY_EPSILON) {
									k.time = roundTime(clamp(clip.start + clip.end - k.time, 0, state.duration));
								}
							}
							curve.keys.sort((a, b) => a.time - b.time);
						}
					}
				}

				for (const strip of state.strips) {
					if (strip.objectId === objectId) {
						strip.reversed = !strip.reversed;
					}
				}
				return state;
			}),

		/** Freezes playback/motion at `atTime` for `freezeDuration` seconds, creating a freeze frame hold. */
		freezeLayer: (objectId: string, atTime?: number, freezeDuration = 2.0) =>
			update((state) => {
				if (state.tracks.get(objectId)?.locked) return state;
				const t = atTime !== undefined ? atTime : state.currentTime;
				const dur = clamp(freezeDuration, 0.2, 30);
				const clip = state.clips.get(objectId) ?? { start: 0, end: 15 };
				state.clips.set(objectId, { start: clip.start, end: clamp(clip.end + dur, 0, state.duration) });

				const keys = state.keyframes.get(objectId) ?? [];
				for (const k of keys) {
					if (k.time > t + KEY_EPSILON) {
						k.time = roundTime(clamp(k.time + dur, 0, state.duration));
					}
				}
				const entry = state.curves.get(objectId);
				if (entry) {
					for (const curve of entry.values()) {
						for (const k of curve.keys) {
							if (k.time > t + KEY_EPSILON) {
								k.time = roundTime(clamp(k.time + dur, 0, state.duration));
							}
						}
						curve.keys.sort((a, b) => a.time - b.time);
					}
				}

				// Sample pose at t and insert constant hold key at t + dur
				if (keys.length) {
					const prevKey = keys.slice().reverse().find((k) => k.time <= t + KEY_EPSILON) ?? keys[0];
					const holdPose: KeyframeData = {
						time: roundTime(clamp(t + dur, 0, state.duration)),
						position: [...prevKey.position],
						rotation: [...prevKey.rotation],
						scale: [...prevKey.scale],
						interpolation: 'constant',
					};
					keys.push(holdPose);
					keys.sort((a, b) => a.time - b.time);
					const ref = referenceQuaternion(state.curves, objectId, holdPose.time);
					writeTransformChannels(state.curves, objectId, holdPose, ref, 'constant');
				}
				return state;
			}),

		removeKeyframesFor: (objectId: string) =>
			update((state) => {
				state.keyframes.delete(objectId);
				state.curves.delete(objectId);
				state.clips.delete(objectId);
				state.tracks.delete(objectId);
				state.strips = state.strips.filter((strip) => strip.objectId !== objectId);
				if (state.selectedStripId && !state.strips.some((strip) => strip.id === state.selectedStripId)) {
					state.selectedStripId = null;
				}
				if (state.selectedKey?.objectId === objectId) state.selectedKey = null;
				state.selectedKeys = state.selectedKeys.filter((s) => s.objectId !== objectId);
				return state;
			}),

		clearKeyframes: () =>
			update((state) => {
				state.keyframes = new Map();
				state.curves = new Map();
				state.tracks = new Map();
				state.strips = [];
				state.clips = new Map();
				state.selectedStripId = null;
				state.selectedKey = null;
				state.selectedKeys = [];
				state.startFrame = 0;
				return state;
			}),

		prevFrame: () =>
			update((state) => {
				const frameTime = 1 / state.frameRate;
				const startT = startTimeOf(state);
				state.currentTime = Math.max(startT, roundTime(state.currentTime - frameTime));
				if (state.playing) anchorAt(state.currentTime);
				return state;
			}),

		nextFrame: () =>
			update((state) => {
				const frameTime = 1 / state.frameRate;
				state.currentTime = Math.min(state.duration, state.currentTime + frameTime);
				if (state.playing) anchorAt(state.currentTime);
				return state;
			}),

		tick: (delta?: number): number => {
			const state = get(timelineStore);
			if (!state.playing) return state.currentTime;
			if (state.isUserScrubbing) return state.currentTime;
			const now = performance.now();
			const explicit = typeof delta === 'number' && Number.isFinite(delta);
			let time: number;
			if (explicit) {
				time = state.currentTime + Math.max(0, delta);
			} else {
				if (!anchored) anchorAt(state.currentTime);
				const elapsed = Math.max(0, (now - anchorWall) / 1000);
				if (elapsed > 0.5) {
					anchorAt(state.currentTime);
					return state.currentTime;
				}
				time = anchorTime + elapsed;
			}

			const duration = state.duration;
			const startT = startTimeOf(state);
			const span = duration - startT;
			if (duration <= 0 || span <= 0) {
				update((current) => {
					current.playing = false;
					current.currentTime = 0;
					return current;
				});
				stopClock();
				return 0;
			}

			let finished = false;
			if (time >= duration) {
				if (state.loop) {
					time = startT + ((time - startT) % span);
				} else {
					time = duration;
					finished = true;
				}
			}

			update((current) => {
				current.currentTime = time;
				if (finished) current.playing = false;
				return current;
			});
			if (finished) stopClock();
			else anchorAt(time);
			return time;
		},

		evaluate: (time: number, easing?: boolean): Map<string, EvaluatedTransform> => {
			const state = get(timelineStore);
			const useEasing = easing ?? state.easing;
			const transforms = new Map<string, EvaluatedTransform>();
			if (!state.curves.size) return transforms;
			const stripsByObject = new Map<string, NlaStrip[]>();
			for (const strip of state.strips) {
				if (strip.muted) continue;
				const list = stripsByObject.get(strip.objectId);
				if (list) list.push(strip);
				else stripsByObject.set(strip.objectId, [strip]);
			}
			for (const [objectId, curves] of state.curves) {
				const track = state.tracks.get(objectId);
				if (track?.muted) continue;
				const strips = stripsByObject.get(objectId);
				let actionTime = time;
				if (strips?.length) {
					let covered = false;
					for (const strip of strips) {
						if (time >= strip.start && time <= strip.end) {
							actionTime = stripActionTime(strip, time);
							covered = true;
						}
					}
					if (!covered) continue;
				}

				const position = evaluateVector(curves, 'location', actionTime, useEasing, 0);
				const quaternion = evaluateQuaternion(curves, actionTime, useEasing);
				const scale = evaluateVector(curves, 'scale', actionTime, useEasing, 1);
				const visible = evaluateVisibility(curves, actionTime, useEasing);
				if (!position && !quaternion && !scale && visible === null) continue;
				transforms.set(objectId, {
					position: position ?? undefined,
					rotation: quaternion ? quatToEuler(quaternion) : undefined,
					scale: scale ?? undefined,
					...(visible !== null ? { visible } : {}),
				});
			}
			return transforms;
		},

		// ---- Non linear action ----------------------------------------------

		addStrip: (objectId: string, start: number, end?: number) =>
			update((state) => {
				const keys = state.keyframes.get(objectId) ?? [];
				const duration = actionDuration(keys);
				const from = clamp(start, 0, state.duration);
				const to = clamp(end ?? from + Math.max(duration, 1), 0, state.duration);
				const strip: NlaStrip = {
					id: nextStripId(),
					objectId,
					name: keys.length ? `Action` : 'Strip',
					start: Math.min(from, to),
					end: Math.max(from, to),
					actionStart: 0,
					actionEnd: Math.max(duration, 1),
					speed: 1,
					reversed: false,
					frozen: false,
					muted: false,
				};
				state.strips.push(strip);
				state.selectedStripId = strip.id;
				return state;
			}),

		updateStrip: (id: string, patch: Partial<NlaStrip>) =>
			update((state) => {
				const strip = state.strips.find((item) => item.id === id);
				if (!strip) return state;
				Object.assign(strip, patch);
				strip.start = clamp(strip.start, 0, state.duration);
				strip.end = clamp(strip.end, 0, state.duration);
				if (strip.end < strip.start) strip.end = strip.start;
				strip.speed = clamp(strip.speed, 0.1, 10);
				return state;
			}),

		removeStrip: (id: string) =>
			update((state) => {
				state.strips = state.strips.filter((strip) => strip.id !== id);
				if (state.selectedStripId === id) state.selectedStripId = null;
				return state;
			}),

		selectStrip: (id: string | null) =>
			update((state) => {
				state.selectedStripId = id;
				return state;
			}),

		splitStripAtPlayhead: (id: string) =>
			update((state) => {
				const strip = state.strips.find((item) => item.id === id);
				if (!strip) return state;
				const playhead = state.currentTime;
				if (playhead <= strip.start + 1e-4 || playhead >= strip.end - 1e-4) return state;
				const splitAction = stripActionTime(strip, playhead);
				const second: NlaStrip = {
					...strip,
					id: nextStripId(),
					start: playhead,
				};
				strip.end = playhead;
				if (strip.reversed) {
					strip.actionStart = splitAction;
					second.actionEnd = splitAction;
				} else {
					strip.actionEnd = splitAction;
					second.actionStart = splitAction;
				}
				state.strips.push(second);
				state.selectedStripId = second.id;
				return state;
			}),

		duplicateStrip: (id: string) =>
			update((state) => {
				const strip = state.strips.find((item) => item.id === id);
				if (!strip) return state;
				const length = strip.end - strip.start;
				const copy: NlaStrip = {
					...strip,
					id: nextStripId(),
					start: clamp(strip.end, 0, state.duration),
					end: clamp(strip.end + length, 0, state.duration),
					name: `${strip.name} copy`,
				};
				state.strips.push(copy);
				state.selectedStripId = copy.id;
				return state;
			}),

		reverseStrip: (id: string) =>
			update((state) => {
				const strip = state.strips.find((item) => item.id === id);
				if (!strip) return state;
				strip.reversed = !strip.reversed;
				return state;
			}),

		freezeStrip: (id: string, frozen?: boolean) =>
			update((state) => {
				const strip = state.strips.find((item) => item.id === id);
				if (!strip) return state;
				strip.frozen = frozen ?? !strip.frozen;
				return state;
			}),

		setStripSpeed: (id: string, speed: number) =>
			update((state) => {
				const strip = state.strips.find((item) => item.id === id);
				if (!strip) return state;
				strip.speed = clamp(speed, 0.1, 10);
				return state;
			}),

		trimStrip: (id: string, edge: 'start' | 'end', delta: number) =>
			update((state) => {
				const strip = state.strips.find((item) => item.id === id);
				if (!strip) return state;
				if (edge === 'start') strip.start = clamp(strip.start + delta, 0, strip.end - 0.05);
				else strip.end = clamp(strip.end + delta, strip.start + 0.05, state.duration);
				return state;
			}),

		// ---- Serialisation ---------------------------------------------------

		snapshotAnimation: (): AnimationSnapshot => {
			const state = get(timelineStore);
			const keyframes: Record<string, KeyframeData[]> = {};
			for (const [objectId, keys] of state.keyframes) {
				keyframes[objectId] = keys.map((key) => ({
					time: key.time,
					position: [...key.position] as [number, number, number],
					rotation: [...key.rotation] as [number, number, number],
					scale: [...key.scale] as [number, number, number],
					...(key.visible !== undefined ? { visible: key.visible } : {}),
					...(key.interpolation ? { interpolation: key.interpolation } : {}),
				}));
			}
			const curves: Record<string, Record<string, BezTriple[]>> = {};
			for (const [objectId, entry] of state.curves) {
				const channels: Record<string, BezTriple[]> = {};
				for (const [path, curve] of entry) {
					if (!curve.keys.length) continue;
					channels[path] = curve.keys.map((key) => ({
						time: key.time,
						value: key.value,
						interpolation: key.interpolation,
						handleLeft: [key.handleLeft[0], key.handleLeft[1]],
						handleRight: [key.handleRight[0], key.handleRight[1]],
						autoLeft: key.autoLeft,
						autoRight: key.autoRight,
					}));
				}
				if (Object.keys(channels).length) curves[objectId] = channels;
			}
			const tracks: Record<string, TrackMeta> = {};
			for (const [objectId, meta] of state.tracks) {
				tracks[objectId] = { ...meta };
			}
			const clips: Record<string, LayerClip> = {};
			for (const [objectId, clip] of state.clips) clips[objectId] = { ...clip };
			return {
				keyframes,
				curves,
				tracks,
				strips: state.strips.map((strip) => ({ ...strip })),
				clips,
				selectedStripId: state.selectedStripId,
				selectedKey: state.selectedKey ? { ...state.selectedKey } : null,
				selectedKeys: state.selectedKeys.map((s) => ({ ...s })),
				duration: state.duration,
				startFrame: state.startFrame,
				endFrame: state.endFrame,
				snapToFrames: state.snapToFrames,
				loop: state.loop,
				easing: state.easing,
				frameRate: state.frameRate,
			};
		},

		restoreAnimation: (snapshot: AnimationSnapshot) =>
			update((state) => {
				state.clips = new Map();
				for (const [objectId, clip] of Object.entries(snapshot.clips ?? {})) {
					state.clips.set(objectId, { start: clip.start, end: clip.end });
				}
				state.tracks = new Map();
				for (const [objectId, meta] of Object.entries(snapshot.tracks ?? {})) {
					state.tracks.set(objectId, { ...meta, objectId });
				}
				state.keyframes = new Map();
				for (const [objectId, keys] of Object.entries(snapshot.keyframes)) {
					state.keyframes.set(
						objectId,
						keys.map((key) => ({
							time: key.time,
							position: [...key.position] as [number, number, number],
							rotation: [...key.rotation] as [number, number, number],
							scale: [...key.scale] as [number, number, number],
							...(key.visible !== undefined ? { visible: key.visible } : {}),
							...(key.interpolation ? { interpolation: key.interpolation } : {}),
						})),
					);
				}
				state.curves = new Map();
				for (const [objectId, channels] of Object.entries(snapshot.curves)) {
					const entry = new Map<string, FCurve>();
					for (const [path, keys] of Object.entries(channels)) {
						const curve = new FCurve(path);
						for (const key of keys) {
							curve.keys.push({
								...key,
								handleLeft: [key.handleLeft?.[0] ?? 0, key.handleLeft?.[1] ?? 0],
								handleRight: [key.handleRight?.[0] ?? 0, key.handleRight?.[1] ?? 0],
							});
						}
						entry.set(path, curve);
					}
					state.curves.set(objectId, entry);
				}
				state.strips = snapshot.strips.map((strip) => ({ ...strip }));
				state.selectedStripId =
					snapshot.selectedStripId && state.strips.some((strip) => strip.id === snapshot.selectedStripId)
						? snapshot.selectedStripId
						: null;
				state.selectedKey = snapshot.selectedKey ? { ...snapshot.selectedKey } : null;
				state.selectedKeys = snapshot.selectedKeys
					? snapshot.selectedKeys.map((s) => ({ ...s }))
					: state.selectedKey
						? [{ ...state.selectedKey }]
						: [];
				state.frameRate = clamp(Math.round(snapshot.frameRate), 1, 120);
				state.duration = clamp(snapshot.duration, 0.1, MAX_TIMELINE_SECONDS);
				state.startFrame = snapshot.startFrame ?? 0;
				state.endFrame = snapshot.endFrame ?? Math.max(1, Math.round(state.duration * state.frameRate));
				state.snapToFrames = Boolean(snapshot.snapToFrames);
				state.currentTime = clamp(state.currentTime, 0, state.duration);
				state.loop = snapshot.loop;
				state.easing = snapshot.easing;
				if (state.playing) anchorAt(state.currentTime);
				return state;
			}),

		serializeKeyframes: (): Record<string, KeyframeData[]> => {
			const state = get(timelineStore);
			return Object.fromEntries(state.keyframes.entries());
		},

		serializeCurves: (): Record<string, Record<string, BezTriple[]>> => {
			const state = get(timelineStore);
			const result: Record<string, Record<string, BezTriple[]>> = {};
			for (const [objectId, entry] of state.curves) {
				const channels: Record<string, BezTriple[]> = {};
				for (const [path, curve] of entry) {
					if (!curve.keys.length) continue;
					channels[path] = curve.keys.map((key) => ({
						time: key.time,
						value: key.value,
						interpolation: key.interpolation,
						handleLeft: [key.handleLeft[0], key.handleLeft[1]],
						handleRight: [key.handleRight[0], key.handleRight[1]],
						autoLeft: key.autoLeft,
						autoRight: key.autoRight,
					}));
				}
				if (Object.keys(channels).length) result[objectId] = channels;
			}
			return result;
		},

		loadCurves: (data: Record<string, Record<string, BezTriple[]>> | undefined) =>
			update((state) => {
				state.curves = new Map();
				for (const [objectId, channels] of Object.entries(data ?? {})) {
					const entry = new Map<string, FCurve>();
					for (const [path, keys] of Object.entries(channels)) {
						const curve = new FCurve(path);
						for (const key of keys) {
							curve.keys.push({
								...key,
								handleLeft: [key.handleLeft?.[0] ?? 0, key.handleLeft?.[1] ?? 0],
								handleRight: [key.handleRight?.[0] ?? 0, key.handleRight?.[1] ?? 0],
							});
						}
						entry.set(path, curve);
					}
					state.curves.set(objectId, entry);
				}
				return state;
			}),

		serializeTracks: (): Record<string, TrackMeta> => {
			const out: Record<string, TrackMeta> = {};
			for (const [objectId, meta] of get(timelineStore).tracks) {
				out[objectId] = { ...meta };
			}
			return out;
		},

		loadTracks: (data: Record<string, TrackMeta> | undefined) =>
			update((state) => {
				state.tracks = new Map();
				for (const [objectId, meta] of Object.entries(data ?? {})) {
					if (!meta || typeof meta !== 'object') continue;
					state.tracks.set(objectId, {
						objectId,
						name: typeof meta.name === 'string' ? meta.name : undefined,
						locked: meta.locked === true,
						hidden: meta.hidden === true,
						muted: meta.muted === true,
					});
				}
				return state;
			}),

		serializeStrips: (): NlaStrip[] => {
			const state = get(timelineStore);
			return state.strips.map((strip) => ({ ...strip }));
		},

		serializeClips: (): Record<string, LayerClip> => {
			const clips: Record<string, LayerClip> = {};
			for (const [objectId, clip] of get(timelineStore).clips) {
				clips[objectId] = { start: clip.start, end: clip.end };
			}
			return clips;
		},

		loadClips: (data: Record<string, LayerClip> | undefined) =>
			update((state) => {
				state.clips = new Map();
				for (const [objectId, clip] of Object.entries(data ?? {})) {
					if (!clip || !Number.isFinite(clip.start) || !Number.isFinite(clip.end)) continue;
					state.clips.set(objectId, {
						start: clamp(clip.start, 0, state.duration),
						end: clamp(clip.end, 0, state.duration),
					});
				}
				return state;
			}),

		loadStrips: (data: NlaStrip[] | undefined) =>
			update((state) => {
				state.strips = (data ?? []).map((strip) => ({ ...strip }));
				state.selectedStripId = null;
				return state;
			}),

		loadKeyframes: (data: Record<string, KeyframeData[]> | undefined) =>
			update((state) => {
				state.keyframes = new Map();
				state.curves = new Map();
				for (const [objectId, keys] of Object.entries(data ?? {})) {
					const sorted = [...keys].sort((a, b) => a.time - b.time);
					state.keyframes.set(objectId, sorted);
					for (const key of sorted) writeTransformChannels(state.curves, objectId, key, null, key.interpolation);
				}
				state.currentTime = 0;
				state.playing = false;
				state.selectedKey = null;
				state.selectedKeys = [];
				stopClock();
				return state;
			}),
	};
}

export const timelineStore = createTimelineStore();

export { MAX_TIMELINE_SECONDS, timeToFrame, frameToTime };
