import { writable, get } from 'svelte/store';
import { CHANNEL_PATHS, FCurve, MAX_TIMELINE_SECONDS, TRANSFORM_CHANNELS, VISIBILITY_CHANNEL, eulerToQuatClosest, evaluateQuaternion, evaluateVector, evaluateVisibility, frameToTime, quatToEuler, timeToFrame } from '../lib/fcurve';

/**
 * The pose that is stored at a keyframe.
 *
 * The shape is kept for the project file format, the channels themselves live
 * in the F-Curves of the timeline.
 */

/** Per-object animation track metadata (lock, mute/hide, custom track name). */

/** Identifies a single selected keyframe on an object track. */

/** Clipboard entry for copy/paste keyframe operations. */

/** A non linear action strip, Blender's `bActionStrip`. */

/** The on-timeline lifetime of a layer that is not driven by a pose animation. */

const initialState = {
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
  pxPerSecond: 60
};

/**
 * Two key times closer than this are the same key.
 *
 * The value is below one frame at 120 fps, so a real frame step always
 * produces a distinct key, while float noise from pointer maths does not.
 */
export const KEY_EPSILON = 1e-3;

/** Rounds to the 1/10000 s precision used by the project file. */
export function roundTime(time) {
  return Math.round(time * 10000) / 10000;
}
export function sameTime(a, b) {
  return Math.abs(a - b) < KEY_EPSILON;
}
let stripCounter = 1;
function nextStripId() {
  const existing = new Set(get(timelineStore).strips.map(strip => strip.id));
  let id = `strip-${stripCounter++}`;
  while (existing.has(id)) id = `strip-${stripCounter++}`;
  return id;
}
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Keeps non-finite input out of the animation data. */
function finiteTuple(value, fallback) {
  if (!Array.isArray(value) || value.length !== 3) return [...fallback];
  return value.every(item => typeof item === 'number' && Number.isFinite(item)) ? [value[0], value[1], value[2]] : [...fallback];
}

/** Creates the curve map of an object when it does not exist yet. */
function ensureCurves(curves, objectId) {
  let entry = curves.get(objectId);
  if (!entry) {
    entry = new Map();
    curves.set(objectId, entry);
  }
  return entry;
}
function ensureCurve(entry, path) {
  let curve = entry.get(path);
  if (!curve) {
    curve = new FCurve(path);
    entry.set(path, curve);
  }
  return curve;
}
function ensureTrackMeta(tracks, objectId) {
  let meta = tracks.get(objectId);
  if (!meta) {
    meta = {
      objectId,
      locked: false,
      hidden: false,
      muted: false
    };
    tracks.set(objectId, meta);
  }
  return meta;
}

/** Maps a time on a strip to the action time it shows. */
export function stripActionTime(strip, time) {
  if (strip.frozen) return strip.actionStart;
  const elapsed = Math.max(0, time - strip.start) * strip.speed;
  const value = strip.reversed ? strip.actionEnd - elapsed : strip.actionStart + elapsed;
  return clamp(value, Math.min(strip.actionStart, strip.actionEnd), Math.max(strip.actionStart, strip.actionEnd));
}

/** Longest keyframe time of an object, the length of its action. */
export function actionDuration(keys) {
  let duration = 0;
  for (const key of keys) duration = Math.max(duration, key.time);
  return duration;
}

/** A complete copy of the animation data, used by undo and redo. */

function createTimelineStore() {
  const {
    subscribe,
    set,
    update
  } = writable(initialState);
  /** Timeline time and wall clock at the moment playback was anchored. */
  let anchorTime = 0;
  let anchorWall = 0;
  let anchored = false;
  function anchorAt(time) {
    anchorTime = time;
    anchorWall = performance.now();
    anchored = true;
  }
  function stopClock() {
    anchored = false;
  }
  function startTimeOf(state) {
    if (!state.startFrame || state.startFrame <= 0) return 0;
    return clamp(roundTime(state.startFrame / state.frameRate), 0, Math.max(0, state.duration - 1 / state.frameRate));
  }
  function writeTransformChannels(curves, objectId, pose, reference, interpolation) {
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
      const visCurve = entry.get(VISIBILITY_CHANNEL);
      const curVal = visCurve.evaluate(pose.time, true) ?? 1;
      visCurve.insert(pose.time, curVal >= 0.5 ? 1 : 0, interp ?? 'constant');
    }
  }
  function referenceQuaternion(curves, objectId, time) {
    const entry = curves.get(objectId);
    if (!entry) return null;
    return evaluateQuaternion(entry, time, true);
  }
  function removePoseAndCurvesAt(state, objectId, time) {
    const keys = state.keyframes.get(objectId) ?? [];
    const next = keys.filter(key => !sameTime(key.time, time));
    if (next.length) state.keyframes.set(objectId, next);else state.keyframes.delete(objectId);
    const entry = state.curves.get(objectId);
    if (entry) {
      for (const path of CHANNEL_PATHS) entry.get(path)?.remove(time);
    }
  }
  return {
    subscribe,
    set,
    /** Snaps a time in seconds to the nearest frame if `snapToFrames` is enabled. */
    snapTime: time => {
      const state = get(timelineStore);
      const clamped = clamp(time, 0, state.duration);
      if (!state.snapToFrames) return roundTime(clamped);
      return frameToTime(timeToFrame(clamped, state.frameRate), state.frameRate);
    },
    /** Moves the playhead inside the playback range. */
    setTime: time => update(state => {
      const next = clamp(time, 0, state.duration);
      state.currentTime = next;
      if (state.playing) anchorAt(next);
      return state;
    }),
    seek: time => update(state => {
      state.currentTime = clamp(time, 0, state.duration);
      state.playing = false;
      stopClock();
      return state;
    }),
    setFrame: frame => update(state => {
      const t = clamp(frameToTime(frame, state.frameRate), 0, state.duration);
      state.currentTime = t;
      if (state.playing) anchorAt(t);
      return state;
    }),
    getCurrentFrame: () => {
      const state = get(timelineStore);
      return timeToFrame(state.currentTime, state.frameRate);
    },
    setStartFrame: frame => update(state => {
      const maxStart = Math.max(0, state.endFrame - 1);
      state.startFrame = clamp(Math.round(frame), 0, maxStart);
      const minT = startTimeOf(state);
      if (state.currentTime < minT) state.currentTime = minT;
      return state;
    }),
    setEndFrame: frame => update(state => {
      const maxFrames = Math.round(MAX_TIMELINE_SECONDS * state.frameRate);
      state.endFrame = clamp(Math.round(frame), state.startFrame + 1, maxFrames);
      state.duration = clamp(roundTime(state.endFrame / state.frameRate), 0.1, MAX_TIMELINE_SECONDS);
      if (state.currentTime > state.duration) state.currentTime = state.duration;
      if (state.playing) anchorAt(state.currentTime);
      return state;
    }),
    setDuration: duration => update(state => {
      state.duration = clamp(duration, 0.1, MAX_TIMELINE_SECONDS);
      state.endFrame = Math.max(1, Math.round(state.duration * state.frameRate));
      if (state.startFrame >= state.endFrame) state.startFrame = Math.max(0, state.endFrame - 1);
      if (state.currentTime > state.duration) state.currentTime = state.duration;
      if (state.playing) anchorAt(state.currentTime);
      return state;
    }),
    setPlaying: playing => update(state => {
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
    togglePlay: () => update(state => {
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
    stop: () => update(state => {
      state.playing = false;
      stopClock();
      state.currentTime = startTimeOf(state);
      return state;
    }),
    /** Jumps to the first frame of the playback range and evaluates it. */
    goToStart: () => update(state => {
      const startT = startTimeOf(state);
      state.currentTime = startT;
      if (state.playing) anchorAt(startT);
      return state;
    }),
    /** Jumps to the end frame of the playback range. */
    goToEnd: () => update(state => {
      state.currentTime = state.duration;
      if (state.playing) anchorAt(state.duration);
      return state;
    }),
    resyncClock: () => {
      const state = get(timelineStore);
      if (state.playing) anchorAt(state.currentTime);
    },
    toggleLoop: () => update(state => {
      state.loop = !state.loop;
      return state;
    }),
    setLoop: loop => update(state => {
      state.loop = loop;
      return state;
    }),
    toggleEasing: () => update(state => {
      state.easing = !state.easing;
      return state;
    }),
    setEasing: easing => update(state => {
      state.easing = easing;
      return state;
    }),
    toggleAutoKey: () => update(state => {
      state.autoKey = !state.autoKey;
      return state;
    }),
    setAutoKey: autoKey => update(state => {
      state.autoKey = autoKey;
      return state;
    }),
    toggleSnapToFrames: () => update(state => {
      state.snapToFrames = !state.snapToFrames;
      return state;
    }),
    setSnapToFrames: snap => update(state => {
      state.snapToFrames = snap;
      return state;
    }),
    toggleMultiSelectMode: () => update(state => {
      state.multiSelectMode = !state.multiSelectMode;
      return state;
    }),
    setMultiSelectMode: enabled => update(state => {
      state.multiSelectMode = enabled;
      return state;
    }),
    toggleShow: () => update(state => {
      state.show = !state.show;
      return state;
    }),
    setShow: show => update(state => {
      state.show = show;
      return state;
    }),
    setFrameRate: fps => update(state => {
      state.frameRate = clamp(Math.round(fps), 1, 120);
      state.endFrame = Math.max(1, Math.round(state.duration * state.frameRate));
      if (state.startFrame >= state.endFrame) state.startFrame = Math.max(0, state.endFrame - 1);
      return state;
    }),
    setPxPerSecond: value => update(state => {
      state.pxPerSecond = clamp(value, 0.25, 400);
      return state;
    }),
    setUserScrubbing: scrubbing => update(state => {
      if (state.isUserScrubbing === scrubbing) return state;
      state.isUserScrubbing = scrubbing;
      return state;
    }),
    // ---- Track Management (Selection, Rename, Lock, Hide/Mute) ----------

    getTrackMeta: objectId => {
      const state = get(timelineStore);
      return state.tracks.get(objectId) ?? {
        objectId,
        locked: false,
        hidden: false,
        muted: false
      };
    },
    setTrackMeta: (objectId, patch) => update(state => {
      const meta = ensureTrackMeta(state.tracks, objectId);
      Object.assign(meta, patch, {
        objectId
      });
      return state;
    }),
    toggleTrackLock: objectId => update(state => {
      const meta = ensureTrackMeta(state.tracks, objectId);
      meta.locked = !meta.locked;
      return state;
    }),
    toggleTrackMute: objectId => update(state => {
      const meta = ensureTrackMeta(state.tracks, objectId);
      meta.muted = !meta.muted;
      return state;
    }),
    toggleTrackHidden: objectId => update(state => {
      const meta = ensureTrackMeta(state.tracks, objectId);
      meta.hidden = !meta.hidden;
      return state;
    }),
    // ---- Keyframe Operations --------------------------------------------

    addKeyframe: (objectId, keyframe) => update(state => {
      if (!objectId || !Number.isFinite(keyframe.time)) return state;
      if (state.tracks.get(objectId)?.locked) return state;
      const rawTime = clamp(keyframe.time, 0, state.duration);
      const requested = state.snapToFrames ? frameToTime(timeToFrame(rawTime, state.frameRate), state.frameRate) : roundTime(rawTime);
      const keys = state.keyframes.get(objectId) ?? [];
      const existing = keys.findIndex(key => sameTime(key.time, requested));
      const time = existing >= 0 ? keys[existing].time : requested;
      const pose = {
        time,
        position: finiteTuple(keyframe.position, [0, 0, 0]),
        rotation: finiteTuple(keyframe.rotation, [0, 0, 0]),
        scale: finiteTuple(keyframe.scale, [1, 1, 1]),
        ...(keyframe.visible !== undefined ? {
          visible: Boolean(keyframe.visible)
        } : {}),
        ...(keyframe.interpolation ? {
          interpolation: keyframe.interpolation
        } : {})
      };
      if (existing >= 0) keys[existing] = pose;else keys.push(pose);
      keys.sort((a, b) => a.time - b.time);
      state.keyframes.set(objectId, keys);
      const reference = referenceQuaternion(state.curves, objectId, time);
      writeTransformChannels(state.curves, objectId, pose, reference, keyframe.interpolation);
      state.selectedKey = {
        objectId,
        time
      };
      state.selectedKeys = [{
        objectId,
        time
      }];
      const clip = state.clips.get(objectId);
      if (clip) {
        const minT = Math.min(clip.start, keys[0].time);
        const maxT = Math.max(clip.end, keys[keys.length - 1].time, minT + 0.2);
        state.clips.set(objectId, {
          start: minT,
          end: Math.min(state.duration, maxT)
        });
      }
      return state;
    }),
    /** Edits an existing keyframe's values or interpolation at `time`. */
    updateKeyframe: (objectId, time, patch) => update(state => {
      if (state.tracks.get(objectId)?.locked) return state;
      const keys = state.keyframes.get(objectId);
      if (!keys) return state;
      const idx = keys.findIndex(k => sameTime(k.time, time));
      if (idx < 0) return state;
      const existing = keys[idx];
      const updated = {
        ...existing,
        position: patch.position ? finiteTuple(patch.position, existing.position) : [...existing.position],
        rotation: patch.rotation ? finiteTuple(patch.rotation, existing.rotation) : [...existing.rotation],
        scale: patch.scale ? finiteTuple(patch.scale, existing.scale) : [...existing.scale],
        ...(patch.visible !== undefined ? {
          visible: Boolean(patch.visible)
        } : {}),
        ...(patch.interpolation ? {
          interpolation: patch.interpolation
        } : {})
      };
      keys[idx] = updated;
      const reference = referenceQuaternion(state.curves, objectId, existing.time);
      writeTransformChannels(state.curves, objectId, updated, reference, patch.interpolation);
      return state;
    }),
    /** Records a visibility keyframe (`visible: true/false`) on `objectId` at `time`. */
    setVisibilityKeyframe: (objectId, time, visible, fallbackPose) => update(state => {
      if (!objectId || !Number.isFinite(time) || state.tracks.get(objectId)?.locked) return state;
      const t = state.snapToFrames ? frameToTime(timeToFrame(clamp(time, 0, state.duration), state.frameRate), state.frameRate) : roundTime(clamp(time, 0, state.duration));
      const entry = ensureCurves(state.curves, objectId);
      ensureCurve(entry, VISIBILITY_CHANNEL).insert(t, visible ? 1 : 0, 'constant');
      const keys = state.keyframes.get(objectId) ?? [];
      const idx = keys.findIndex(k => sameTime(k.time, t));
      if (idx >= 0) {
        keys[idx] = {
          ...keys[idx],
          visible
        };
      } else if (fallbackPose) {
        const pose = {
          time: t,
          position: finiteTuple(fallbackPose.position, [0, 0, 0]),
          rotation: finiteTuple(fallbackPose.rotation, [0, 0, 0]),
          scale: finiteTuple(fallbackPose.scale, [1, 1, 1]),
          visible
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
    addChannelKeyframe: (objectId, path, time, value, interpolation) => update(state => {
      if (state.tracks.get(objectId)?.locked) return state;
      const entry = ensureCurves(state.curves, objectId);
      ensureCurve(entry, path).insert(clamp(time, 0, MAX_TIMELINE_SECONDS), value, interpolation);
      return state;
    }),
    /** Changes the interpolation of every key of a channel (or a specific keyTime). */
    setInterpolation: (objectId, path, interpolation, keyTime) => update(state => {
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
    setObjectInterpolation: (objectId, interpolation, keyTime) => update(state => {
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
    interpolationOf: (objectId, path, keyTime) => {
      const state = get(timelineStore);
      const curve = state.curves.get(objectId)?.get(path);
      if (!curve || !curve.keys.length) return 'bezier';
      if (keyTime !== undefined) {
        const match = curve.keys.find(k => sameTime(k.time, keyTime));
        if (match) return match.interpolation;
      }
      return curve.keys[0]?.interpolation ?? 'bezier';
    },
    removeKeyframe: (objectId, time) => update(state => {
      if (state.tracks.get(objectId)?.locked) return state;
      removePoseAndCurvesAt(state, objectId, time);
      if (state.selectedKey?.objectId === objectId && sameTime(state.selectedKey.time, time)) {
        state.selectedKey = null;
      }
      state.selectedKeys = state.selectedKeys.filter(sel => !(sel.objectId === objectId && sameTime(sel.time, time)));
      if (!state.selectedKey && state.selectedKeys.length) {
        state.selectedKey = {
          ...state.selectedKeys[state.selectedKeys.length - 1]
        };
      }
      return state;
    }),
    selectKeyframe: (objectId, time, additive = false) => update(state => {
      if (!objectId || !Number.isFinite(time)) return state;
      const clamped = clamp(time, 0, state.duration);
      const useMulti = additive || state.multiSelectMode;
      if (useMulti) {
        const idx = state.selectedKeys.findIndex(k => k.objectId === objectId && sameTime(k.time, clamped));
        if (idx >= 0) {
          state.selectedKeys.splice(idx, 1);
          state.selectedKey = state.selectedKeys.length ? {
            ...state.selectedKeys[state.selectedKeys.length - 1]
          } : null;
        } else {
          state.selectedKeys.push({
            objectId,
            time: clamped
          });
          state.selectedKey = {
            objectId,
            time: clamped
          };
        }
      } else {
        state.selectedKey = {
          objectId,
          time: clamped
        };
        state.selectedKeys = [{
          objectId,
          time: clamped
        }];
      }
      state.currentTime = clamped;
      state.playing = false;
      stopClock();
      return state;
    }),
    selectKeyframes: selections => update(state => {
      const valid = selections.filter(s => Boolean(s.objectId) && Number.isFinite(s.time)).map(s => ({
        objectId: s.objectId,
        time: clamp(s.time, 0, state.duration)
      }));
      state.selectedKeys = valid;
      state.selectedKey = valid.length ? {
        ...valid[valid.length - 1]
      } : null;
      return state;
    }),
    selectKeyframesInRange: (startTime, endTime, objectId) => update(state => {
      const minT = Math.min(startTime, endTime) - KEY_EPSILON;
      const maxT = Math.max(startTime, endTime) + KEY_EPSILON;
      const found = [];
      for (const [oid, keys] of state.keyframes) {
        if (objectId && oid !== objectId) continue;
        if (state.tracks.get(oid)?.locked) continue;
        for (const k of keys) {
          if (k.time >= minT && k.time <= maxT) {
            found.push({
              objectId: oid,
              time: k.time
            });
          }
        }
      }
      state.selectedKeys = found;
      state.selectedKey = found.length ? {
        ...found[found.length - 1]
      } : null;
      return state;
    }),
    clearKeyframeSelection: () => update(state => {
      state.selectedKey = null;
      state.selectedKeys = [];
      return state;
    }),
    /** Deletes all selected keyframes (multi-selection or primary selectedKey). */
    deleteSelectedKey: () => update(state => {
      const targets = state.selectedKeys.length > 0 ? [...state.selectedKeys] : state.selectedKey ? [state.selectedKey] : [];
      if (!targets.length) return state;
      for (const target of targets) {
        if (state.tracks.get(target.objectId)?.locked) continue;
        removePoseAndCurvesAt(state, target.objectId, target.time);
      }
      state.selectedKey = null;
      state.selectedKeys = [];
      return state;
    }),
    moveKeyframe: (objectId, fromTime, toTime) => update(state => {
      if (state.tracks.get(objectId)?.locked) return state;
      const from = roundTime(fromTime);
      const rawTo = clamp(toTime, 0, state.duration);
      const to = state.snapToFrames ? frameToTime(timeToFrame(rawTo, state.frameRate), state.frameRate) : roundTime(rawTo);
      if (sameTime(from, to)) return state;
      const keys = state.keyframes.get(objectId);
      if (!keys) return state;
      const index = keys.findIndex(key => sameTime(key.time, from));
      if (index < 0) return state;
      const pose = keys[index];
      const moved = {
        ...pose,
        time: to,
        position: [...pose.position],
        rotation: [...pose.rotation],
        scale: [...pose.scale]
      };
      const next = keys.filter(key => !sameTime(key.time, to));
      const source = next.findIndex(key => sameTime(key.time, from));
      if (source < 0) return state;
      next[source] = moved;
      next.sort((a, b) => a.time - b.time);
      state.keyframes.set(objectId, next);
      const entry = state.curves.get(objectId);
      if (entry) {
        for (const path of CHANNEL_PATHS) {
          const curve = entry.get(path);
          if (!curve) continue;
          const srcIdx = curve.keys.findIndex(key => sameTime(key.time, from));
          if (srcIdx < 0) continue;
          const target = curve.keys.findIndex((key, i) => i !== srcIdx && sameTime(key.time, to));
          if (target >= 0) curve.keys.splice(target, 1);
          const curveIndex = curve.keys.findIndex(key => sameTime(key.time, from));
          if (curveIndex < 0) continue;
          curve.keys[curveIndex].time = to;
          curve.keys.sort((a, b) => a.time - b.time);
        }
      }
      if (state.selectedKey?.objectId === objectId && sameTime(state.selectedKey.time, from)) {
        state.selectedKey = {
          objectId,
          time: to
        };
        state.currentTime = clamp(to, 0, state.duration);
      }
      state.selectedKeys = state.selectedKeys.map(sel => sel.objectId === objectId && sameTime(sel.time, from) ? {
        objectId,
        time: to
      } : sel);
      return state;
    }),
    /** Moves all currently multi-selected keyframes together by `deltaTime`. */
    moveSelectedKeyframes: deltaTime => update(state => {
      const targets = state.selectedKeys.length > 0 ? [...state.selectedKeys] : state.selectedKey ? [state.selectedKey] : [];
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
      const ordered = [...targets].sort((a, b) => delta > 0 ? b.time - a.time : a.time - b.time);
      const newSelections = [];
      for (const sel of ordered) {
        if (state.tracks.get(sel.objectId)?.locked) {
          newSelections.push(sel);
          continue;
        }
        const from = roundTime(sel.time);
        const to = roundTime(clamp(from + delta, 0, state.duration));
        const keys = state.keyframes.get(sel.objectId);
        if (!keys) continue;
        const idx = keys.findIndex(k => sameTime(k.time, from));
        if (idx >= 0) {
          keys[idx] = {
            ...keys[idx],
            time: to,
            position: [...keys[idx].position],
            rotation: [...keys[idx].rotation],
            scale: [...keys[idx].scale]
          };
          keys.sort((a, b) => a.time - b.time);
        }
        const entry = state.curves.get(sel.objectId);
        if (entry) {
          for (const path of CHANNEL_PATHS) {
            const curve = entry.get(path);
            if (!curve) continue;
            const cIdx = curve.keys.findIndex(k => sameTime(k.time, from));
            if (cIdx >= 0) {
              curve.keys[cIdx].time = to;
              curve.keys.sort((a, b) => a.time - b.time);
            }
          }
        }
        newSelections.push({
          objectId: sel.objectId,
          time: to
        });
      }
      state.selectedKeys = newSelections;
      if (state.selectedKey) {
        const primary = newSelections[newSelections.length - 1];
        if (primary) {
          state.selectedKey = {
            ...primary
          };
          state.currentTime = primary.time;
        }
      }
      return state;
    }),
    /** Copies selected keyframes (or keyframe at playhead for `objectId`) to the clipboard. */
    copySelectedKeys: fallbackObjectId => {
      let copiedCount = 0;
      update(state => {
        let targets = state.selectedKeys.length > 0 ? [...state.selectedKeys] : state.selectedKey ? [state.selectedKey] : [];
        if (!targets.length && fallbackObjectId) {
          const keys = state.keyframes.get(fallbackObjectId) ?? [];
          const match = keys.find(k => sameTime(k.time, state.currentTime)) ?? keys[0];
          if (match) targets = [{
            objectId: fallbackObjectId,
            time: match.time
          }];
        }
        if (!targets.length) return state;
        const minTime = Math.min(...targets.map(t => t.time));
        const clipboard = [];
        for (const target of targets) {
          const keys = state.keyframes.get(target.objectId) ?? [];
          const pose = keys.find(k => sameTime(k.time, target.time));
          if (!pose) continue;
          const channels = {};
          const entry = state.curves.get(target.objectId);
          if (entry) {
            for (const [path, curve] of entry) {
              const k = curve.keys.find(ck => sameTime(ck.time, target.time));
              if (k) {
                channels[path] = {
                  ...k,
                  handleLeft: [k.handleLeft[0], k.handleLeft[1]],
                  handleRight: [k.handleRight[0], k.handleRight[1]]
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
              scale: [...pose.scale]
            },
            channels
          });
        }
        state.clipboardKeys = clipboard;
        copiedCount = clipboard.length;
        return state;
      });
      return copiedCount;
    },
    /** Pastes copied keyframes starting at `currentTime` (onto `targetObjectId` if single-object clipboard). */
    pasteKeysAtPlayhead: targetObjectId => {
      let pastedCount = 0;
      update(state => {
        if (!state.clipboardKeys.length) return state;
        const sourceObjects = new Set(state.clipboardKeys.map(c => c.objectId));
        const remapSingle = Boolean(targetObjectId && sourceObjects.size === 1);
        const newSelections = [];
        for (const item of state.clipboardKeys) {
          const destObjId = remapSingle ? targetObjectId : item.objectId;
          if (state.tracks.get(destObjId)?.locked) continue;
          const rawTime = clamp(state.currentTime + item.offset, 0, state.duration);
          const time = state.snapToFrames ? frameToTime(timeToFrame(rawTime, state.frameRate), state.frameRate) : roundTime(rawTime);
          const keys = state.keyframes.get(destObjId) ?? [];
          const existingIdx = keys.findIndex(k => sameTime(k.time, time));
          const pose = {
            ...item.pose,
            time,
            position: [...item.pose.position],
            rotation: [...item.pose.rotation],
            scale: [...item.pose.scale]
          };
          if (existingIdx >= 0) keys[existingIdx] = pose;else keys.push(pose);
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
          newSelections.push({
            objectId: destObjId,
            time
          });
          pastedCount++;
        }
        if (newSelections.length) {
          state.selectedKeys = newSelections;
          state.selectedKey = {
            ...newSelections[newSelections.length - 1]
          };
        }
        return state;
      });
      return pastedCount;
    },
    /** Jumps to the previous keyframe before `currentTime`. */
    prevKeyframe: objectId => {
      let foundTime = null;
      let foundObj = null;
      update(state => {
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
          state.selectedKey = {
            objectId: foundObj,
            time: foundTime
          };
          state.selectedKeys = [{
            objectId: foundObj,
            time: foundTime
          }];
          state.playing = false;
          stopClock();
        }
        return state;
      });
      return foundTime;
    },
    /** Jumps to the next keyframe after `currentTime`. */
    nextKeyframe: objectId => {
      let foundTime = null;
      let foundObj = null;
      update(state => {
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
          state.selectedKey = {
            objectId: foundObj,
            time: foundTime
          };
          state.selectedKeys = [{
            objectId: foundObj,
            time: foundTime
          }];
          state.playing = false;
          stopClock();
        }
        return state;
      });
      return foundTime;
    },
    shiftLayer: (objectId, delta) => update(state => {
      if (state.tracks.get(objectId)?.locked) return state;
      const keys = state.keyframes.get(objectId) ?? [];
      const strips = state.strips.filter(strip => strip.objectId === objectId);
      if (!keys.length && !strips.length || !Number.isFinite(delta)) return state;
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
      const moved = keys.map(key => ({
        ...key,
        time: roundTime(clamp(key.time + shift, 0, state.duration))
      })).sort((a, b) => a.time - b.time);
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
          time: roundTime(clamp(state.selectedKey.time + shift, 0, state.duration))
        };
      }
      state.selectedKeys = state.selectedKeys.map(sel => sel.objectId === objectId ? {
        objectId,
        time: roundTime(clamp(sel.time + shift, 0, state.duration))
      } : sel);
      return state;
    }),
    /** Places a layer on the timeline. The clip is the real lifetime window. */
    setClip: (objectId, start, end) => update(state => {
      if (state.tracks.get(objectId)?.locked) return state;
      const from = roundTime(clamp(Math.min(start, end), 0, state.duration));
      const to = roundTime(clamp(Math.max(start, end), 0, state.duration));
      if (to - from < 0.1) return state;
      state.clips.set(objectId, {
        start: from,
        end: to
      });
      return state;
    }),
    /** Slides a clip in time, clamped to the timeline like `shiftLayer`. */
    shiftClip: (objectId, delta) => update(state => {
      if (state.tracks.get(objectId)?.locked) return state;
      const clip = state.clips.get(objectId);
      if (!clip || !Number.isFinite(delta)) return state;
      const shift = clamp(delta, -clip.start, state.duration - clip.end);
      if (Math.abs(shift) < 1e-6) return state;
      state.clips.set(objectId, {
        start: roundTime(clamp(clip.start + shift, 0, state.duration)),
        end: roundTime(clamp(clip.end + shift, 0, state.duration))
      });
      return state;
    }),
    /** Sets the playback speed of the layer/clip, scaling its duration and keyframes proportionally. */
    setLayerSpeed: (objectId, multiplier) => update(state => {
      if (state.tracks.get(objectId)?.locked) return state;
      const mult = clamp(multiplier, 0.1, 10);
      const clip = state.clips.get(objectId) ?? {
        start: 0,
        end: 15
      };
      const origDuration = Math.max(0.1, clip.end - clip.start);
      const newDuration = clamp(origDuration / mult, 0.1, MAX_TIMELINE_SECONDS);
      const newEnd = clamp(roundTime(clip.start + newDuration), clip.start + 0.1, state.duration);
      state.clips.set(objectId, {
        start: clip.start,
        end: newEnd
      });
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
    reverseLayer: objectId => update(state => {
      if (state.tracks.get(objectId)?.locked) return state;
      const clip = state.clips.get(objectId) ?? {
        start: 0,
        end: 15
      };
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
    freezeLayer: (objectId, atTime, freezeDuration = 2.0) => update(state => {
      if (state.tracks.get(objectId)?.locked) return state;
      const t = atTime !== undefined ? atTime : state.currentTime;
      const dur = clamp(freezeDuration, 0.2, 30);
      const clip = state.clips.get(objectId) ?? {
        start: 0,
        end: 15
      };
      state.clips.set(objectId, {
        start: clip.start,
        end: clamp(clip.end + dur, 0, state.duration)
      });
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
        const prevKey = keys.slice().reverse().find(k => k.time <= t + KEY_EPSILON) ?? keys[0];
        const holdPose = {
          time: roundTime(clamp(t + dur, 0, state.duration)),
          position: [...prevKey.position],
          rotation: [...prevKey.rotation],
          scale: [...prevKey.scale],
          interpolation: 'constant'
        };
        keys.push(holdPose);
        keys.sort((a, b) => a.time - b.time);
        const ref = referenceQuaternion(state.curves, objectId, holdPose.time);
        writeTransformChannels(state.curves, objectId, holdPose, ref, 'constant');
      }
      return state;
    }),
    removeKeyframesFor: objectId => update(state => {
      state.keyframes.delete(objectId);
      state.curves.delete(objectId);
      state.clips.delete(objectId);
      state.tracks.delete(objectId);
      state.strips = state.strips.filter(strip => strip.objectId !== objectId);
      if (state.selectedStripId && !state.strips.some(strip => strip.id === state.selectedStripId)) {
        state.selectedStripId = null;
      }
      if (state.selectedKey?.objectId === objectId) state.selectedKey = null;
      state.selectedKeys = state.selectedKeys.filter(s => s.objectId !== objectId);
      return state;
    }),
    clearKeyframes: () => update(state => {
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
    prevFrame: () => update(state => {
      const frameTime = 1 / state.frameRate;
      const startT = startTimeOf(state);
      state.currentTime = Math.max(startT, roundTime(state.currentTime - frameTime));
      if (state.playing) anchorAt(state.currentTime);
      return state;
    }),
    nextFrame: () => update(state => {
      const frameTime = 1 / state.frameRate;
      state.currentTime = Math.min(state.duration, state.currentTime + frameTime);
      if (state.playing) anchorAt(state.currentTime);
      return state;
    }),
    tick: delta => {
      const state = get(timelineStore);
      if (!state.playing) return state.currentTime;
      if (state.isUserScrubbing) return state.currentTime;
      const now = performance.now();
      const explicit = typeof delta === 'number' && Number.isFinite(delta);
      let time;
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
        update(current => {
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
          time = startT + (time - startT) % span;
        } else {
          time = duration;
          finished = true;
        }
      }
      update(current => {
        current.currentTime = time;
        if (finished) current.playing = false;
        return current;
      });
      if (finished) stopClock();else anchorAt(time);
      return time;
    },
    evaluate: (time, easing) => {
      const state = get(timelineStore);
      const useEasing = easing ?? state.easing;
      const transforms = new Map();
      if (!state.curves.size) return transforms;
      const stripsByObject = new Map();
      for (const strip of state.strips) {
        if (strip.muted) continue;
        const list = stripsByObject.get(strip.objectId);
        if (list) list.push(strip);else stripsByObject.set(strip.objectId, [strip]);
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
          ...(visible !== null ? {
            visible
          } : {})
        });
      }
      return transforms;
    },
    // ---- Non linear action ----------------------------------------------

    addStrip: (objectId, start, end) => update(state => {
      const keys = state.keyframes.get(objectId) ?? [];
      const duration = actionDuration(keys);
      const from = clamp(start, 0, state.duration);
      const to = clamp(end ?? from + Math.max(duration, 1), 0, state.duration);
      const strip = {
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
        muted: false
      };
      state.strips.push(strip);
      state.selectedStripId = strip.id;
      return state;
    }),
    updateStrip: (id, patch) => update(state => {
      const strip = state.strips.find(item => item.id === id);
      if (!strip) return state;
      Object.assign(strip, patch);
      strip.start = clamp(strip.start, 0, state.duration);
      strip.end = clamp(strip.end, 0, state.duration);
      if (strip.end < strip.start) strip.end = strip.start;
      strip.speed = clamp(strip.speed, 0.1, 10);
      return state;
    }),
    removeStrip: id => update(state => {
      state.strips = state.strips.filter(strip => strip.id !== id);
      if (state.selectedStripId === id) state.selectedStripId = null;
      return state;
    }),
    selectStrip: id => update(state => {
      state.selectedStripId = id;
      return state;
    }),
    splitStripAtPlayhead: id => update(state => {
      const strip = state.strips.find(item => item.id === id);
      if (!strip) return state;
      const playhead = state.currentTime;
      if (playhead <= strip.start + 1e-4 || playhead >= strip.end - 1e-4) return state;
      const splitAction = stripActionTime(strip, playhead);
      const second = {
        ...strip,
        id: nextStripId(),
        start: playhead
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
    duplicateStrip: id => update(state => {
      const strip = state.strips.find(item => item.id === id);
      if (!strip) return state;
      const length = strip.end - strip.start;
      const copy = {
        ...strip,
        id: nextStripId(),
        start: clamp(strip.end, 0, state.duration),
        end: clamp(strip.end + length, 0, state.duration),
        name: `${strip.name} copy`
      };
      state.strips.push(copy);
      state.selectedStripId = copy.id;
      return state;
    }),
    reverseStrip: id => update(state => {
      const strip = state.strips.find(item => item.id === id);
      if (!strip) return state;
      strip.reversed = !strip.reversed;
      return state;
    }),
    freezeStrip: (id, frozen) => update(state => {
      const strip = state.strips.find(item => item.id === id);
      if (!strip) return state;
      strip.frozen = frozen ?? !strip.frozen;
      return state;
    }),
    setStripSpeed: (id, speed) => update(state => {
      const strip = state.strips.find(item => item.id === id);
      if (!strip) return state;
      strip.speed = clamp(speed, 0.1, 10);
      return state;
    }),
    trimStrip: (id, edge, delta) => update(state => {
      const strip = state.strips.find(item => item.id === id);
      if (!strip) return state;
      if (edge === 'start') strip.start = clamp(strip.start + delta, 0, strip.end - 0.05);else strip.end = clamp(strip.end + delta, strip.start + 0.05, state.duration);
      return state;
    }),
    // ---- Serialisation ---------------------------------------------------

    snapshotAnimation: () => {
      const state = get(timelineStore);
      const keyframes = {};
      for (const [objectId, keys] of state.keyframes) {
        keyframes[objectId] = keys.map(key => ({
          time: key.time,
          position: [...key.position],
          rotation: [...key.rotation],
          scale: [...key.scale],
          ...(key.visible !== undefined ? {
            visible: key.visible
          } : {}),
          ...(key.interpolation ? {
            interpolation: key.interpolation
          } : {})
        }));
      }
      const curves = {};
      for (const [objectId, entry] of state.curves) {
        const channels = {};
        for (const [path, curve] of entry) {
          if (!curve.keys.length) continue;
          channels[path] = curve.keys.map(key => ({
            time: key.time,
            value: key.value,
            interpolation: key.interpolation,
            handleLeft: [key.handleLeft[0], key.handleLeft[1]],
            handleRight: [key.handleRight[0], key.handleRight[1]],
            autoLeft: key.autoLeft,
            autoRight: key.autoRight
          }));
        }
        if (Object.keys(channels).length) curves[objectId] = channels;
      }
      const tracks = {};
      for (const [objectId, meta] of state.tracks) {
        tracks[objectId] = {
          ...meta
        };
      }
      const clips = {};
      for (const [objectId, clip] of state.clips) clips[objectId] = {
        ...clip
      };
      return {
        keyframes,
        curves,
        tracks,
        strips: state.strips.map(strip => ({
          ...strip
        })),
        clips,
        selectedStripId: state.selectedStripId,
        selectedKey: state.selectedKey ? {
          ...state.selectedKey
        } : null,
        selectedKeys: state.selectedKeys.map(s => ({
          ...s
        })),
        duration: state.duration,
        startFrame: state.startFrame,
        endFrame: state.endFrame,
        snapToFrames: state.snapToFrames,
        loop: state.loop,
        easing: state.easing,
        frameRate: state.frameRate
      };
    },
    restoreAnimation: snapshot => update(state => {
      state.clips = new Map();
      for (const [objectId, clip] of Object.entries(snapshot.clips ?? {})) {
        state.clips.set(objectId, {
          start: clip.start,
          end: clip.end
        });
      }
      state.tracks = new Map();
      for (const [objectId, meta] of Object.entries(snapshot.tracks ?? {})) {
        state.tracks.set(objectId, {
          ...meta,
          objectId
        });
      }
      state.keyframes = new Map();
      for (const [objectId, keys] of Object.entries(snapshot.keyframes)) {
        state.keyframes.set(objectId, keys.map(key => ({
          time: key.time,
          position: [...key.position],
          rotation: [...key.rotation],
          scale: [...key.scale],
          ...(key.visible !== undefined ? {
            visible: key.visible
          } : {}),
          ...(key.interpolation ? {
            interpolation: key.interpolation
          } : {})
        })));
      }
      state.curves = new Map();
      for (const [objectId, channels] of Object.entries(snapshot.curves)) {
        const entry = new Map();
        for (const [path, keys] of Object.entries(channels)) {
          const curve = new FCurve(path);
          for (const key of keys) {
            curve.keys.push({
              ...key,
              handleLeft: [key.handleLeft?.[0] ?? 0, key.handleLeft?.[1] ?? 0],
              handleRight: [key.handleRight?.[0] ?? 0, key.handleRight?.[1] ?? 0]
            });
          }
          entry.set(path, curve);
        }
        state.curves.set(objectId, entry);
      }
      state.strips = snapshot.strips.map(strip => ({
        ...strip
      }));
      state.selectedStripId = snapshot.selectedStripId && state.strips.some(strip => strip.id === snapshot.selectedStripId) ? snapshot.selectedStripId : null;
      state.selectedKey = snapshot.selectedKey ? {
        ...snapshot.selectedKey
      } : null;
      state.selectedKeys = snapshot.selectedKeys ? snapshot.selectedKeys.map(s => ({
        ...s
      })) : state.selectedKey ? [{
        ...state.selectedKey
      }] : [];
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
    serializeKeyframes: () => {
      const state = get(timelineStore);
      return Object.fromEntries(state.keyframes.entries());
    },
    serializeCurves: () => {
      const state = get(timelineStore);
      const result = {};
      for (const [objectId, entry] of state.curves) {
        const channels = {};
        for (const [path, curve] of entry) {
          if (!curve.keys.length) continue;
          channels[path] = curve.keys.map(key => ({
            time: key.time,
            value: key.value,
            interpolation: key.interpolation,
            handleLeft: [key.handleLeft[0], key.handleLeft[1]],
            handleRight: [key.handleRight[0], key.handleRight[1]],
            autoLeft: key.autoLeft,
            autoRight: key.autoRight
          }));
        }
        if (Object.keys(channels).length) result[objectId] = channels;
      }
      return result;
    },
    loadCurves: data => update(state => {
      state.curves = new Map();
      for (const [objectId, channels] of Object.entries(data ?? {})) {
        const entry = new Map();
        for (const [path, keys] of Object.entries(channels)) {
          const curve = new FCurve(path);
          for (const key of keys) {
            curve.keys.push({
              ...key,
              handleLeft: [key.handleLeft?.[0] ?? 0, key.handleLeft?.[1] ?? 0],
              handleRight: [key.handleRight?.[0] ?? 0, key.handleRight?.[1] ?? 0]
            });
          }
          entry.set(path, curve);
        }
        state.curves.set(objectId, entry);
      }
      return state;
    }),
    serializeTracks: () => {
      const out = {};
      for (const [objectId, meta] of get(timelineStore).tracks) {
        out[objectId] = {
          ...meta
        };
      }
      return out;
    },
    loadTracks: data => update(state => {
      state.tracks = new Map();
      for (const [objectId, meta] of Object.entries(data ?? {})) {
        if (!meta || typeof meta !== 'object') continue;
        state.tracks.set(objectId, {
          objectId,
          name: typeof meta.name === 'string' ? meta.name : undefined,
          locked: meta.locked === true,
          hidden: meta.hidden === true,
          muted: meta.muted === true
        });
      }
      return state;
    }),
    serializeStrips: () => {
      const state = get(timelineStore);
      return state.strips.map(strip => ({
        ...strip
      }));
    },
    serializeClips: () => {
      const clips = {};
      for (const [objectId, clip] of get(timelineStore).clips) {
        clips[objectId] = {
          start: clip.start,
          end: clip.end
        };
      }
      return clips;
    },
    loadClips: data => update(state => {
      state.clips = new Map();
      for (const [objectId, clip] of Object.entries(data ?? {})) {
        if (!clip || !Number.isFinite(clip.start) || !Number.isFinite(clip.end)) continue;
        state.clips.set(objectId, {
          start: clamp(clip.start, 0, state.duration),
          end: clamp(clip.end, 0, state.duration)
        });
      }
      return state;
    }),
    loadStrips: data => update(state => {
      state.strips = (data ?? []).map(strip => ({
        ...strip
      }));
      state.selectedStripId = null;
      return state;
    }),
    loadKeyframes: data => update(state => {
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
    })
  };
}
export const timelineStore = createTimelineStore();
export { MAX_TIMELINE_SECONDS, timeToFrame, frameToTime };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6W10sInNvdXJjZXMiOlsidGltZWxpbmUudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgd3JpdGFibGUsIGdldCB9IGZyb20gJ3N2ZWx0ZS9zdG9yZSc7XG5pbXBvcnQge1xuXHRDSEFOTkVMX1BBVEhTLFxuXHRGQ3VydmUsXG5cdE1BWF9USU1FTElORV9TRUNPTkRTLFxuXHRUUkFOU0ZPUk1fQ0hBTk5FTFMsXG5cdFZJU0lCSUxJVFlfQ0hBTk5FTCxcblx0ZXVsZXJUb1F1YXRDbG9zZXN0LFxuXHRldmFsdWF0ZVF1YXRlcm5pb24sXG5cdGV2YWx1YXRlVmVjdG9yLFxuXHRldmFsdWF0ZVZpc2liaWxpdHksXG5cdGZyYW1lVG9UaW1lLFxuXHRxdWF0VG9FdWxlcixcblx0dGltZVRvRnJhbWUsXG5cdHR5cGUgQmV6VHJpcGxlLFxuXHR0eXBlIENoYW5uZWxQYXRoLFxuXHR0eXBlIEludGVycG9sYXRpb24sXG5cdHR5cGUgUXVhdCxcbn0gZnJvbSAnLi4vbGliL2ZjdXJ2ZSc7XG5cbi8qKlxuICogVGhlIHBvc2UgdGhhdCBpcyBzdG9yZWQgYXQgYSBrZXlmcmFtZS5cbiAqXG4gKiBUaGUgc2hhcGUgaXMga2VwdCBmb3IgdGhlIHByb2plY3QgZmlsZSBmb3JtYXQsIHRoZSBjaGFubmVscyB0aGVtc2VsdmVzIGxpdmVcbiAqIGluIHRoZSBGLUN1cnZlcyBvZiB0aGUgdGltZWxpbmUuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgS2V5ZnJhbWVEYXRhIHtcblx0dGltZTogbnVtYmVyO1xuXHRwb3NpdGlvbjogW251bWJlciwgbnVtYmVyLCBudW1iZXJdO1xuXHRyb3RhdGlvbjogW251bWJlciwgbnVtYmVyLCBudW1iZXJdO1xuXHRzY2FsZTogW251bWJlciwgbnVtYmVyLCBudW1iZXJdO1xuXHR2aXNpYmxlPzogYm9vbGVhbjtcblx0aW50ZXJwb2xhdGlvbj86IEludGVycG9sYXRpb247XG59XG5cbi8qKiBQZXItb2JqZWN0IGFuaW1hdGlvbiB0cmFjayBtZXRhZGF0YSAobG9jaywgbXV0ZS9oaWRlLCBjdXN0b20gdHJhY2sgbmFtZSkuICovXG5leHBvcnQgaW50ZXJmYWNlIFRyYWNrTWV0YSB7XG5cdG9iamVjdElkOiBzdHJpbmc7XG5cdG5hbWU/OiBzdHJpbmc7XG5cdGxvY2tlZDogYm9vbGVhbjtcblx0aGlkZGVuOiBib29sZWFuO1xuXHRtdXRlZDogYm9vbGVhbjtcbn1cblxuLyoqIElkZW50aWZpZXMgYSBzaW5nbGUgc2VsZWN0ZWQga2V5ZnJhbWUgb24gYW4gb2JqZWN0IHRyYWNrLiAqL1xuZXhwb3J0IGludGVyZmFjZSBLZXlmcmFtZVNlbGVjdGlvbiB7XG5cdG9iamVjdElkOiBzdHJpbmc7XG5cdHRpbWU6IG51bWJlcjtcbn1cblxuLyoqIENsaXBib2FyZCBlbnRyeSBmb3IgY29weS9wYXN0ZSBrZXlmcmFtZSBvcGVyYXRpb25zLiAqL1xuZXhwb3J0IGludGVyZmFjZSBDb3BpZWRLZXlmcmFtZSB7XG5cdG9iamVjdElkOiBzdHJpbmc7XG5cdG9mZnNldDogbnVtYmVyO1xuXHRwb3NlOiBLZXlmcmFtZURhdGE7XG5cdGNoYW5uZWxzOiBSZWNvcmQ8c3RyaW5nLCBCZXpUcmlwbGU+O1xufVxuXG4vKiogQSBub24gbGluZWFyIGFjdGlvbiBzdHJpcCwgQmxlbmRlcidzIGBiQWN0aW9uU3RyaXBgLiAqL1xuZXhwb3J0IGludGVyZmFjZSBObGFTdHJpcCB7XG5cdGlkOiBzdHJpbmc7XG5cdG9iamVjdElkOiBzdHJpbmc7XG5cdG5hbWU6IHN0cmluZztcblx0LyoqIFN0YXJ0IG9mIHRoZSBzdHJpcCBvbiB0aGUgdGltZWxpbmUsIGluIHNlY29uZHMuICovXG5cdHN0YXJ0OiBudW1iZXI7XG5cdC8qKiBFbmQgb2YgdGhlIHN0cmlwIG9uIHRoZSB0aW1lbGluZSwgaW4gc2Vjb25kcy4gKi9cblx0ZW5kOiBudW1iZXI7XG5cdC8qKiBGaXJzdCBhY3Rpb24gZnJhbWUgdGhlIHN0cmlwIHNob3dzLiAqL1xuXHRhY3Rpb25TdGFydDogbnVtYmVyO1xuXHQvKiogTGFzdCBhY3Rpb24gZnJhbWUgdGhlIHN0cmlwIHNob3dzLiAqL1xuXHRhY3Rpb25FbmQ6IG51bWJlcjtcblx0LyoqIFBsYXliYWNrIHJhdGUgb2YgdGhlIHN0cmlwLCAwLjEgdG8gMTAuICovXG5cdHNwZWVkOiBudW1iZXI7XG5cdC8qKiBSdW5zIHRoZSBhY3Rpb24gYmFja3dhcmRzLiAqL1xuXHRyZXZlcnNlZDogYm9vbGVhbjtcblx0LyoqIEhvbGRzIHRoZSBwb3NlIG9mIHRoZSBmaXJzdCBhY3Rpb24gZnJhbWUuICovXG5cdGZyb3plbjogYm9vbGVhbjtcblx0bXV0ZWQ6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGltZWxpbmVTdGF0ZSB7XG5cdGN1cnJlbnRUaW1lOiBudW1iZXI7XG5cdGR1cmF0aW9uOiBudW1iZXI7XG5cdHN0YXJ0RnJhbWU6IG51bWJlcjtcblx0ZW5kRnJhbWU6IG51bWJlcjtcblx0cGxheWluZzogYm9vbGVhbjtcblx0bG9vcDogYm9vbGVhbjtcblx0ZWFzaW5nOiBib29sZWFuO1xuXHRhdXRvS2V5OiBib29sZWFuO1xuXHRzbmFwVG9GcmFtZXM6IGJvb2xlYW47XG5cdG11bHRpU2VsZWN0TW9kZTogYm9vbGVhbjtcblx0c2hvdzogYm9vbGVhbjtcblx0ZnJhbWVSYXRlOiBudW1iZXI7XG5cdC8qKiBQb3NlIGxpc3QgcGVyIG9iamVjdCwgdGhlIGRvcGUgc2hlZXQgdmlldyBvZiB0aGUgYW5pbWF0aW9uLiAqL1xuXHRrZXlmcmFtZXM6IE1hcDxzdHJpbmcsIEtleWZyYW1lRGF0YVtdPjtcblx0LyoqIEYtQ3VydmVzIHBlciBvYmplY3QsIGtleWVkIGJ5IGNoYW5uZWwgcGF0aC4gKi9cblx0Y3VydmVzOiBNYXA8c3RyaW5nLCBNYXA8c3RyaW5nLCBGQ3VydmU+Pjtcblx0LyoqIFBlci1vYmplY3QgdHJhY2sgc3RhdGUgKGxvY2tlZCwgaGlkZGVuLCBtdXRlZCwgbmFtZSkuICovXG5cdHRyYWNrczogTWFwPHN0cmluZywgVHJhY2tNZXRhPjtcblx0LyoqIE5vbiBsaW5lYXIgYWN0aW9uIHN0cmlwcy4gKi9cblx0c3RyaXBzOiBObGFTdHJpcFtdO1xuXHQvKiogRXhwbGljaXQgbGF5ZXIgcGxhY2VtZW50cywgc2V0IGJ5IGRyYWdnaW5nIGEgYmFyIGluIHRpbWUuICovXG5cdGNsaXBzOiBNYXA8c3RyaW5nLCBMYXllckNsaXA+O1xuXHRzZWxlY3RlZFN0cmlwSWQ6IHN0cmluZyB8IG51bGw7XG5cdC8qKiBQcmltYXJ5IGtleWZyYW1lIHNlbGVjdGVkIGluIHRoZSBkb3BlIHNoZWV0LCBpZiBhbnkuICovXG5cdHNlbGVjdGVkS2V5OiBLZXlmcmFtZVNlbGVjdGlvbiB8IG51bGw7XG5cdC8qKiBNdWx0aS1zZWxlY3RlZCBrZXlmcmFtZXMgYWNyb3NzIG9uZSBvciBtb3JlIHRyYWNrcy4gKi9cblx0c2VsZWN0ZWRLZXlzOiBLZXlmcmFtZVNlbGVjdGlvbltdO1xuXHQvKiogQ29waWVkIGtleWZyYW1lcyByZWFkeSB0byBwYXN0ZSBhdCB0aGUgcGxheWhlYWQuICovXG5cdGNsaXBib2FyZEtleXM6IENvcGllZEtleWZyYW1lW107XG5cdC8qKiBUcnVlIHdoaWxlIHRoZSB1c2VyIGRyYWdzIHRoZSBwbGF5aGVhZCBvciBzY3JvbGxzIHRoZSB0aW1lbGluZS4gKi9cblx0aXNVc2VyU2NydWJiaW5nOiBib29sZWFuO1xuXHQvKiogV2lkdGggb2Ygb25lIHNlY29uZCBvbiB0aGUgdGltZWxpbmUgcnVsZXIsIGluIHBpeGVscy4gKi9cblx0cHhQZXJTZWNvbmQ6IG51bWJlcjtcbn1cblxuLyoqIFRoZSBvbi10aW1lbGluZSBsaWZldGltZSBvZiBhIGxheWVyIHRoYXQgaXMgbm90IGRyaXZlbiBieSBhIHBvc2UgYW5pbWF0aW9uLiAqL1xuZXhwb3J0IGludGVyZmFjZSBMYXllckNsaXAge1xuXHRzdGFydDogbnVtYmVyO1xuXHRlbmQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IHR5cGUgRXZhbHVhdGVkVHJhbnNmb3JtID0ge1xuXHRwb3NpdGlvbj86IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXTtcblx0cm90YXRpb24/OiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl07XG5cdHNjYWxlPzogW251bWJlciwgbnVtYmVyLCBudW1iZXJdO1xuXHR2aXNpYmxlPzogYm9vbGVhbjtcbn07XG5cbmNvbnN0IGluaXRpYWxTdGF0ZTogVGltZWxpbmVTdGF0ZSA9IHtcblx0Y3VycmVudFRpbWU6IDAsXG5cdGR1cmF0aW9uOiAxMCxcblx0c3RhcnRGcmFtZTogMCxcblx0ZW5kRnJhbWU6IDMwMCxcblx0cGxheWluZzogZmFsc2UsXG5cdGxvb3A6IHRydWUsXG5cdGVhc2luZzogdHJ1ZSxcblx0YXV0b0tleTogdHJ1ZSxcblx0c25hcFRvRnJhbWVzOiBmYWxzZSxcblx0bXVsdGlTZWxlY3RNb2RlOiBmYWxzZSxcblx0c2hvdzogZmFsc2UsXG5cdGZyYW1lUmF0ZTogMzAsXG5cdGtleWZyYW1lczogbmV3IE1hcCgpLFxuXHRjdXJ2ZXM6IG5ldyBNYXAoKSxcblx0dHJhY2tzOiBuZXcgTWFwKCksXG5cdHN0cmlwczogW10sXG5cdGNsaXBzOiBuZXcgTWFwKCksXG5cdHNlbGVjdGVkU3RyaXBJZDogbnVsbCxcblx0c2VsZWN0ZWRLZXk6IG51bGwsXG5cdHNlbGVjdGVkS2V5czogW10sXG5cdGNsaXBib2FyZEtleXM6IFtdLFxuXHRpc1VzZXJTY3J1YmJpbmc6IGZhbHNlLFxuXHRweFBlclNlY29uZDogNjAsXG59O1xuXG4vKipcbiAqIFR3byBrZXkgdGltZXMgY2xvc2VyIHRoYW4gdGhpcyBhcmUgdGhlIHNhbWUga2V5LlxuICpcbiAqIFRoZSB2YWx1ZSBpcyBiZWxvdyBvbmUgZnJhbWUgYXQgMTIwIGZwcywgc28gYSByZWFsIGZyYW1lIHN0ZXAgYWx3YXlzXG4gKiBwcm9kdWNlcyBhIGRpc3RpbmN0IGtleSwgd2hpbGUgZmxvYXQgbm9pc2UgZnJvbSBwb2ludGVyIG1hdGhzIGRvZXMgbm90LlxuICovXG5leHBvcnQgY29uc3QgS0VZX0VQU0lMT04gPSAxZS0zO1xuXG4vKiogUm91bmRzIHRvIHRoZSAxLzEwMDAwIHMgcHJlY2lzaW9uIHVzZWQgYnkgdGhlIHByb2plY3QgZmlsZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiByb3VuZFRpbWUodGltZTogbnVtYmVyKTogbnVtYmVyIHtcblx0cmV0dXJuIE1hdGgucm91bmQodGltZSAqIDEwMDAwKSAvIDEwMDAwO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2FtZVRpbWUoYTogbnVtYmVyLCBiOiBudW1iZXIpOiBib29sZWFuIHtcblx0cmV0dXJuIE1hdGguYWJzKGEgLSBiKSA8IEtFWV9FUFNJTE9OO1xufVxuXG5sZXQgc3RyaXBDb3VudGVyID0gMTtcblxuZnVuY3Rpb24gbmV4dFN0cmlwSWQoKTogc3RyaW5nIHtcblx0Y29uc3QgZXhpc3RpbmcgPSBuZXcgU2V0KGdldCh0aW1lbGluZVN0b3JlKS5zdHJpcHMubWFwKChzdHJpcCkgPT4gc3RyaXAuaWQpKTtcblx0bGV0IGlkID0gYHN0cmlwLSR7c3RyaXBDb3VudGVyKyt9YDtcblx0d2hpbGUgKGV4aXN0aW5nLmhhcyhpZCkpIGlkID0gYHN0cmlwLSR7c3RyaXBDb3VudGVyKyt9YDtcblx0cmV0dXJuIGlkO1xufVxuXG5mdW5jdGlvbiBjbGFtcCh2YWx1ZTogbnVtYmVyLCBtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiBudW1iZXIge1xuXHRyZXR1cm4gTWF0aC5taW4obWF4LCBNYXRoLm1heChtaW4sIHZhbHVlKSk7XG59XG5cbi8qKiBLZWVwcyBub24tZmluaXRlIGlucHV0IG91dCBvZiB0aGUgYW5pbWF0aW9uIGRhdGEuICovXG5mdW5jdGlvbiBmaW5pdGVUdXBsZShcblx0dmFsdWU6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSB8IHVuZGVmaW5lZCxcblx0ZmFsbGJhY2s6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSxcbik6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSB7XG5cdGlmICghQXJyYXkuaXNBcnJheSh2YWx1ZSkgfHwgdmFsdWUubGVuZ3RoICE9PSAzKSByZXR1cm4gWy4uLmZhbGxiYWNrXTtcblx0cmV0dXJuIHZhbHVlLmV2ZXJ5KChpdGVtKSA9PiB0eXBlb2YgaXRlbSA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzRmluaXRlKGl0ZW0pKVxuXHRcdD8gW3ZhbHVlWzBdLCB2YWx1ZVsxXSwgdmFsdWVbMl1dXG5cdFx0OiBbLi4uZmFsbGJhY2tdO1xufVxuXG4vKiogQ3JlYXRlcyB0aGUgY3VydmUgbWFwIG9mIGFuIG9iamVjdCB3aGVuIGl0IGRvZXMgbm90IGV4aXN0IHlldC4gKi9cbmZ1bmN0aW9uIGVuc3VyZUN1cnZlcyhjdXJ2ZXM6IE1hcDxzdHJpbmcsIE1hcDxzdHJpbmcsIEZDdXJ2ZT4+LCBvYmplY3RJZDogc3RyaW5nKTogTWFwPHN0cmluZywgRkN1cnZlPiB7XG5cdGxldCBlbnRyeSA9IGN1cnZlcy5nZXQob2JqZWN0SWQpO1xuXHRpZiAoIWVudHJ5KSB7XG5cdFx0ZW50cnkgPSBuZXcgTWFwKCk7XG5cdFx0Y3VydmVzLnNldChvYmplY3RJZCwgZW50cnkpO1xuXHR9XG5cdHJldHVybiBlbnRyeTtcbn1cblxuZnVuY3Rpb24gZW5zdXJlQ3VydmUoZW50cnk6IE1hcDxzdHJpbmcsIEZDdXJ2ZT4sIHBhdGg6IHN0cmluZyk6IEZDdXJ2ZSB7XG5cdGxldCBjdXJ2ZSA9IGVudHJ5LmdldChwYXRoKTtcblx0aWYgKCFjdXJ2ZSkge1xuXHRcdGN1cnZlID0gbmV3IEZDdXJ2ZShwYXRoKTtcblx0XHRlbnRyeS5zZXQocGF0aCwgY3VydmUpO1xuXHR9XG5cdHJldHVybiBjdXJ2ZTtcbn1cblxuZnVuY3Rpb24gZW5zdXJlVHJhY2tNZXRhKHRyYWNrczogTWFwPHN0cmluZywgVHJhY2tNZXRhPiwgb2JqZWN0SWQ6IHN0cmluZyk6IFRyYWNrTWV0YSB7XG5cdGxldCBtZXRhID0gdHJhY2tzLmdldChvYmplY3RJZCk7XG5cdGlmICghbWV0YSkge1xuXHRcdG1ldGEgPSB7IG9iamVjdElkLCBsb2NrZWQ6IGZhbHNlLCBoaWRkZW46IGZhbHNlLCBtdXRlZDogZmFsc2UgfTtcblx0XHR0cmFja3Muc2V0KG9iamVjdElkLCBtZXRhKTtcblx0fVxuXHRyZXR1cm4gbWV0YTtcbn1cblxuLyoqIE1hcHMgYSB0aW1lIG9uIGEgc3RyaXAgdG8gdGhlIGFjdGlvbiB0aW1lIGl0IHNob3dzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN0cmlwQWN0aW9uVGltZShzdHJpcDogTmxhU3RyaXAsIHRpbWU6IG51bWJlcik6IG51bWJlciB7XG5cdGlmIChzdHJpcC5mcm96ZW4pIHJldHVybiBzdHJpcC5hY3Rpb25TdGFydDtcblx0Y29uc3QgZWxhcHNlZCA9IE1hdGgubWF4KDAsIHRpbWUgLSBzdHJpcC5zdGFydCkgKiBzdHJpcC5zcGVlZDtcblx0Y29uc3QgdmFsdWUgPSBzdHJpcC5yZXZlcnNlZCA/IHN0cmlwLmFjdGlvbkVuZCAtIGVsYXBzZWQgOiBzdHJpcC5hY3Rpb25TdGFydCArIGVsYXBzZWQ7XG5cdHJldHVybiBjbGFtcCh2YWx1ZSwgTWF0aC5taW4oc3RyaXAuYWN0aW9uU3RhcnQsIHN0cmlwLmFjdGlvbkVuZCksIE1hdGgubWF4KHN0cmlwLmFjdGlvblN0YXJ0LCBzdHJpcC5hY3Rpb25FbmQpKTtcbn1cblxuLyoqIExvbmdlc3Qga2V5ZnJhbWUgdGltZSBvZiBhbiBvYmplY3QsIHRoZSBsZW5ndGggb2YgaXRzIGFjdGlvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhY3Rpb25EdXJhdGlvbihrZXlzOiBLZXlmcmFtZURhdGFbXSk6IG51bWJlciB7XG5cdGxldCBkdXJhdGlvbiA9IDA7XG5cdGZvciAoY29uc3Qga2V5IG9mIGtleXMpIGR1cmF0aW9uID0gTWF0aC5tYXgoZHVyYXRpb24sIGtleS50aW1lKTtcblx0cmV0dXJuIGR1cmF0aW9uO1xufVxuXG4vKiogQSBjb21wbGV0ZSBjb3B5IG9mIHRoZSBhbmltYXRpb24gZGF0YSwgdXNlZCBieSB1bmRvIGFuZCByZWRvLiAqL1xuZXhwb3J0IGludGVyZmFjZSBBbmltYXRpb25TbmFwc2hvdCB7XG5cdGtleWZyYW1lczogUmVjb3JkPHN0cmluZywgS2V5ZnJhbWVEYXRhW10+O1xuXHRjdXJ2ZXM6IFJlY29yZDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIEJlelRyaXBsZVtdPj47XG5cdHRyYWNrcz86IFJlY29yZDxzdHJpbmcsIFRyYWNrTWV0YT47XG5cdHN0cmlwczogTmxhU3RyaXBbXTtcblx0Y2xpcHM6IFJlY29yZDxzdHJpbmcsIExheWVyQ2xpcD47XG5cdHNlbGVjdGVkU3RyaXBJZDogc3RyaW5nIHwgbnVsbDtcblx0c2VsZWN0ZWRLZXk6IEtleWZyYW1lU2VsZWN0aW9uIHwgbnVsbDtcblx0c2VsZWN0ZWRLZXlzPzogS2V5ZnJhbWVTZWxlY3Rpb25bXTtcblx0ZHVyYXRpb246IG51bWJlcjtcblx0c3RhcnRGcmFtZT86IG51bWJlcjtcblx0ZW5kRnJhbWU/OiBudW1iZXI7XG5cdHNuYXBUb0ZyYW1lcz86IGJvb2xlYW47XG5cdGxvb3A6IGJvb2xlYW47XG5cdGVhc2luZzogYm9vbGVhbjtcblx0ZnJhbWVSYXRlOiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVRpbWVsaW5lU3RvcmUoKSB7XG5cdGNvbnN0IHsgc3Vic2NyaWJlLCBzZXQsIHVwZGF0ZSB9ID0gd3JpdGFibGU8VGltZWxpbmVTdGF0ZT4oaW5pdGlhbFN0YXRlKTtcblx0LyoqIFRpbWVsaW5lIHRpbWUgYW5kIHdhbGwgY2xvY2sgYXQgdGhlIG1vbWVudCBwbGF5YmFjayB3YXMgYW5jaG9yZWQuICovXG5cdGxldCBhbmNob3JUaW1lID0gMDtcblx0bGV0IGFuY2hvcldhbGwgPSAwO1xuXHRsZXQgYW5jaG9yZWQgPSBmYWxzZTtcblxuXHRmdW5jdGlvbiBhbmNob3JBdCh0aW1lOiBudW1iZXIpIHtcblx0XHRhbmNob3JUaW1lID0gdGltZTtcblx0XHRhbmNob3JXYWxsID0gcGVyZm9ybWFuY2Uubm93KCk7XG5cdFx0YW5jaG9yZWQgPSB0cnVlO1xuXHR9XG5cblx0ZnVuY3Rpb24gc3RvcENsb2NrKCkge1xuXHRcdGFuY2hvcmVkID0gZmFsc2U7XG5cdH1cblxuXHRmdW5jdGlvbiBzdGFydFRpbWVPZihzdGF0ZTogVGltZWxpbmVTdGF0ZSk6IG51bWJlciB7XG5cdFx0aWYgKCFzdGF0ZS5zdGFydEZyYW1lIHx8IHN0YXRlLnN0YXJ0RnJhbWUgPD0gMCkgcmV0dXJuIDA7XG5cdFx0cmV0dXJuIGNsYW1wKHJvdW5kVGltZShzdGF0ZS5zdGFydEZyYW1lIC8gc3RhdGUuZnJhbWVSYXRlKSwgMCwgTWF0aC5tYXgoMCwgc3RhdGUuZHVyYXRpb24gLSAxIC8gc3RhdGUuZnJhbWVSYXRlKSk7XG5cdH1cblxuXHRmdW5jdGlvbiB3cml0ZVRyYW5zZm9ybUNoYW5uZWxzKFxuXHRcdGN1cnZlczogTWFwPHN0cmluZywgTWFwPHN0cmluZywgRkN1cnZlPj4sXG5cdFx0b2JqZWN0SWQ6IHN0cmluZyxcblx0XHRwb3NlOiBLZXlmcmFtZURhdGEsXG5cdFx0cmVmZXJlbmNlOiBRdWF0IHwgbnVsbCxcblx0XHRpbnRlcnBvbGF0aW9uPzogSW50ZXJwb2xhdGlvbixcblx0KSB7XG5cdFx0Y29uc3QgZW50cnkgPSBlbnN1cmVDdXJ2ZXMoY3VydmVzLCBvYmplY3RJZCk7XG5cdFx0Zm9yIChjb25zdCBwYXRoIG9mIFRSQU5TRk9STV9DSEFOTkVMUykge1xuXHRcdFx0ZW5zdXJlQ3VydmUoZW50cnksIHBhdGgpO1xuXHRcdH1cblx0XHRjb25zdCBpbnRlcnAgPSBpbnRlcnBvbGF0aW9uID8/IHBvc2UuaW50ZXJwb2xhdGlvbjtcblx0XHRlbnRyeS5nZXQoJ2xvY2F0aW9uLngnKT8uaW5zZXJ0KHBvc2UudGltZSwgcG9zZS5wb3NpdGlvblswXSwgaW50ZXJwKTtcblx0XHRlbnRyeS5nZXQoJ2xvY2F0aW9uLnknKT8uaW5zZXJ0KHBvc2UudGltZSwgcG9zZS5wb3NpdGlvblsxXSwgaW50ZXJwKTtcblx0XHRlbnRyeS5nZXQoJ2xvY2F0aW9uLnonKT8uaW5zZXJ0KHBvc2UudGltZSwgcG9zZS5wb3NpdGlvblsyXSwgaW50ZXJwKTtcblx0XHRlbnRyeS5nZXQoJ3NjYWxlLngnKT8uaW5zZXJ0KHBvc2UudGltZSwgcG9zZS5zY2FsZVswXSwgaW50ZXJwKTtcblx0XHRlbnRyeS5nZXQoJ3NjYWxlLnknKT8uaW5zZXJ0KHBvc2UudGltZSwgcG9zZS5zY2FsZVsxXSwgaW50ZXJwKTtcblx0XHRlbnRyeS5nZXQoJ3NjYWxlLnonKT8uaW5zZXJ0KHBvc2UudGltZSwgcG9zZS5zY2FsZVsyXSwgaW50ZXJwKTtcblxuXHRcdGNvbnN0IHF1YXRlcm5pb24gPSBldWxlclRvUXVhdENsb3Nlc3QocG9zZS5yb3RhdGlvbiwgcmVmZXJlbmNlID8/IFsxLCAwLCAwLCAwXSk7XG5cdFx0ZW50cnkuZ2V0KCdyb3RhdGlvbl9xdWF0ZXJuaW9uLncnKT8uaW5zZXJ0KHBvc2UudGltZSwgcXVhdGVybmlvblswXSwgaW50ZXJwKTtcblx0XHRlbnRyeS5nZXQoJ3JvdGF0aW9uX3F1YXRlcm5pb24ueCcpPy5pbnNlcnQocG9zZS50aW1lLCBxdWF0ZXJuaW9uWzFdLCBpbnRlcnApO1xuXHRcdGVudHJ5LmdldCgncm90YXRpb25fcXVhdGVybmlvbi55Jyk/Lmluc2VydChwb3NlLnRpbWUsIHF1YXRlcm5pb25bMl0sIGludGVycCk7XG5cdFx0ZW50cnkuZ2V0KCdyb3RhdGlvbl9xdWF0ZXJuaW9uLnonKT8uaW5zZXJ0KHBvc2UudGltZSwgcXVhdGVybmlvblszXSwgaW50ZXJwKTtcblxuXHRcdGlmIChwb3NlLnZpc2libGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0ZW5zdXJlQ3VydmUoZW50cnksIFZJU0lCSUxJVFlfQ0hBTk5FTCkuaW5zZXJ0KHBvc2UudGltZSwgcG9zZS52aXNpYmxlID8gMSA6IDAsIGludGVycCA/PyAnY29uc3RhbnQnKTtcblx0XHR9IGVsc2UgaWYgKGVudHJ5LmhhcyhWSVNJQklMSVRZX0NIQU5ORUwpKSB7XG5cdFx0XHRjb25zdCB2aXNDdXJ2ZSA9IGVudHJ5LmdldChWSVNJQklMSVRZX0NIQU5ORUwpITtcblx0XHRcdGNvbnN0IGN1clZhbCA9IHZpc0N1cnZlLmV2YWx1YXRlKHBvc2UudGltZSwgdHJ1ZSkgPz8gMTtcblx0XHRcdHZpc0N1cnZlLmluc2VydChwb3NlLnRpbWUsIGN1clZhbCA+PSAwLjUgPyAxIDogMCwgaW50ZXJwID8/ICdjb25zdGFudCcpO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIHJlZmVyZW5jZVF1YXRlcm5pb24oY3VydmVzOiBNYXA8c3RyaW5nLCBNYXA8c3RyaW5nLCBGQ3VydmU+Piwgb2JqZWN0SWQ6IHN0cmluZywgdGltZTogbnVtYmVyKTogUXVhdCB8IG51bGwge1xuXHRcdGNvbnN0IGVudHJ5ID0gY3VydmVzLmdldChvYmplY3RJZCk7XG5cdFx0aWYgKCFlbnRyeSkgcmV0dXJuIG51bGw7XG5cdFx0cmV0dXJuIGV2YWx1YXRlUXVhdGVybmlvbihlbnRyeSwgdGltZSwgdHJ1ZSk7XG5cdH1cblxuXHRmdW5jdGlvbiByZW1vdmVQb3NlQW5kQ3VydmVzQXQoc3RhdGU6IFRpbWVsaW5lU3RhdGUsIG9iamVjdElkOiBzdHJpbmcsIHRpbWU6IG51bWJlcikge1xuXHRcdGNvbnN0IGtleXMgPSBzdGF0ZS5rZXlmcmFtZXMuZ2V0KG9iamVjdElkKSA/PyBbXTtcblx0XHRjb25zdCBuZXh0ID0ga2V5cy5maWx0ZXIoKGtleSkgPT4gIXNhbWVUaW1lKGtleS50aW1lLCB0aW1lKSk7XG5cdFx0aWYgKG5leHQubGVuZ3RoKSBzdGF0ZS5rZXlmcmFtZXMuc2V0KG9iamVjdElkLCBuZXh0KTtcblx0XHRlbHNlIHN0YXRlLmtleWZyYW1lcy5kZWxldGUob2JqZWN0SWQpO1xuXHRcdGNvbnN0IGVudHJ5ID0gc3RhdGUuY3VydmVzLmdldChvYmplY3RJZCk7XG5cdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRmb3IgKGNvbnN0IHBhdGggb2YgQ0hBTk5FTF9QQVRIUykgZW50cnkuZ2V0KHBhdGgpPy5yZW1vdmUodGltZSk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHtcblx0XHRzdWJzY3JpYmUsXG5cdFx0c2V0LFxuXHRcdC8qKiBTbmFwcyBhIHRpbWUgaW4gc2Vjb25kcyB0byB0aGUgbmVhcmVzdCBmcmFtZSBpZiBgc25hcFRvRnJhbWVzYCBpcyBlbmFibGVkLiAqL1xuXHRcdHNuYXBUaW1lOiAodGltZTogbnVtYmVyKTogbnVtYmVyID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gZ2V0KHRpbWVsaW5lU3RvcmUpO1xuXHRcdFx0Y29uc3QgY2xhbXBlZCA9IGNsYW1wKHRpbWUsIDAsIHN0YXRlLmR1cmF0aW9uKTtcblx0XHRcdGlmICghc3RhdGUuc25hcFRvRnJhbWVzKSByZXR1cm4gcm91bmRUaW1lKGNsYW1wZWQpO1xuXHRcdFx0cmV0dXJuIGZyYW1lVG9UaW1lKHRpbWVUb0ZyYW1lKGNsYW1wZWQsIHN0YXRlLmZyYW1lUmF0ZSksIHN0YXRlLmZyYW1lUmF0ZSk7XG5cdFx0fSxcblx0XHQvKiogTW92ZXMgdGhlIHBsYXloZWFkIGluc2lkZSB0aGUgcGxheWJhY2sgcmFuZ2UuICovXG5cdFx0c2V0VGltZTogKHRpbWU6IG51bWJlcikgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0Y29uc3QgbmV4dCA9IGNsYW1wKHRpbWUsIDAsIHN0YXRlLmR1cmF0aW9uKTtcblx0XHRcdFx0c3RhdGUuY3VycmVudFRpbWUgPSBuZXh0O1xuXHRcdFx0XHRpZiAoc3RhdGUucGxheWluZykgYW5jaG9yQXQobmV4dCk7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXHRcdHNlZWs6ICh0aW1lOiBudW1iZXIpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdHN0YXRlLmN1cnJlbnRUaW1lID0gY2xhbXAodGltZSwgMCwgc3RhdGUuZHVyYXRpb24pO1xuXHRcdFx0XHRzdGF0ZS5wbGF5aW5nID0gZmFsc2U7XG5cdFx0XHRcdHN0b3BDbG9jaygpO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblx0XHRzZXRGcmFtZTogKGZyYW1lOiBudW1iZXIpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHQgPSBjbGFtcChmcmFtZVRvVGltZShmcmFtZSwgc3RhdGUuZnJhbWVSYXRlKSwgMCwgc3RhdGUuZHVyYXRpb24pO1xuXHRcdFx0XHRzdGF0ZS5jdXJyZW50VGltZSA9IHQ7XG5cdFx0XHRcdGlmIChzdGF0ZS5wbGF5aW5nKSBhbmNob3JBdCh0KTtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cdFx0Z2V0Q3VycmVudEZyYW1lOiAoKTogbnVtYmVyID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gZ2V0KHRpbWVsaW5lU3RvcmUpO1xuXHRcdFx0cmV0dXJuIHRpbWVUb0ZyYW1lKHN0YXRlLmN1cnJlbnRUaW1lLCBzdGF0ZS5mcmFtZVJhdGUpO1xuXHRcdH0sXG5cdFx0c2V0U3RhcnRGcmFtZTogKGZyYW1lOiBudW1iZXIpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG1heFN0YXJ0ID0gTWF0aC5tYXgoMCwgc3RhdGUuZW5kRnJhbWUgLSAxKTtcblx0XHRcdFx0c3RhdGUuc3RhcnRGcmFtZSA9IGNsYW1wKE1hdGgucm91bmQoZnJhbWUpLCAwLCBtYXhTdGFydCk7XG5cdFx0XHRcdGNvbnN0IG1pblQgPSBzdGFydFRpbWVPZihzdGF0ZSk7XG5cdFx0XHRcdGlmIChzdGF0ZS5jdXJyZW50VGltZSA8IG1pblQpIHN0YXRlLmN1cnJlbnRUaW1lID0gbWluVDtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cdFx0c2V0RW5kRnJhbWU6IChmcmFtZTogbnVtYmVyKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBtYXhGcmFtZXMgPSBNYXRoLnJvdW5kKE1BWF9USU1FTElORV9TRUNPTkRTICogc3RhdGUuZnJhbWVSYXRlKTtcblx0XHRcdFx0c3RhdGUuZW5kRnJhbWUgPSBjbGFtcChNYXRoLnJvdW5kKGZyYW1lKSwgc3RhdGUuc3RhcnRGcmFtZSArIDEsIG1heEZyYW1lcyk7XG5cdFx0XHRcdHN0YXRlLmR1cmF0aW9uID0gY2xhbXAocm91bmRUaW1lKHN0YXRlLmVuZEZyYW1lIC8gc3RhdGUuZnJhbWVSYXRlKSwgMC4xLCBNQVhfVElNRUxJTkVfU0VDT05EUyk7XG5cdFx0XHRcdGlmIChzdGF0ZS5jdXJyZW50VGltZSA+IHN0YXRlLmR1cmF0aW9uKSBzdGF0ZS5jdXJyZW50VGltZSA9IHN0YXRlLmR1cmF0aW9uO1xuXHRcdFx0XHRpZiAoc3RhdGUucGxheWluZykgYW5jaG9yQXQoc3RhdGUuY3VycmVudFRpbWUpO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblx0XHRzZXREdXJhdGlvbjogKGR1cmF0aW9uOiBudW1iZXIpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdHN0YXRlLmR1cmF0aW9uID0gY2xhbXAoZHVyYXRpb24sIDAuMSwgTUFYX1RJTUVMSU5FX1NFQ09ORFMpO1xuXHRcdFx0XHRzdGF0ZS5lbmRGcmFtZSA9IE1hdGgubWF4KDEsIE1hdGgucm91bmQoc3RhdGUuZHVyYXRpb24gKiBzdGF0ZS5mcmFtZVJhdGUpKTtcblx0XHRcdFx0aWYgKHN0YXRlLnN0YXJ0RnJhbWUgPj0gc3RhdGUuZW5kRnJhbWUpIHN0YXRlLnN0YXJ0RnJhbWUgPSBNYXRoLm1heCgwLCBzdGF0ZS5lbmRGcmFtZSAtIDEpO1xuXHRcdFx0XHRpZiAoc3RhdGUuY3VycmVudFRpbWUgPiBzdGF0ZS5kdXJhdGlvbikgc3RhdGUuY3VycmVudFRpbWUgPSBzdGF0ZS5kdXJhdGlvbjtcblx0XHRcdFx0aWYgKHN0YXRlLnBsYXlpbmcpIGFuY2hvckF0KHN0YXRlLmN1cnJlbnRUaW1lKTtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cdFx0c2V0UGxheWluZzogKHBsYXlpbmc6IGJvb2xlYW4pID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGlmIChwbGF5aW5nID09PSBzdGF0ZS5wbGF5aW5nKSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdHN0YXRlLnBsYXlpbmcgPSBwbGF5aW5nO1xuXHRcdFx0XHRpZiAocGxheWluZykge1xuXHRcdFx0XHRcdGNvbnN0IHN0YXJ0VCA9IHN0YXJ0VGltZU9mKHN0YXRlKTtcblx0XHRcdFx0XHRpZiAoc3RhdGUuY3VycmVudFRpbWUgPj0gc3RhdGUuZHVyYXRpb24gfHwgc3RhdGUuY3VycmVudFRpbWUgPCBzdGFydFQpIHN0YXRlLmN1cnJlbnRUaW1lID0gc3RhcnRUO1xuXHRcdFx0XHRcdGFuY2hvckF0KHN0YXRlLmN1cnJlbnRUaW1lKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzdG9wQ2xvY2soKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblx0XHR0b2dnbGVQbGF5OiAoKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRpZiAoc3RhdGUucGxheWluZykge1xuXHRcdFx0XHRcdHN0YXRlLnBsYXlpbmcgPSBmYWxzZTtcblx0XHRcdFx0XHRzdG9wQ2xvY2soKTtcblx0XHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgc3RhcnRUID0gc3RhcnRUaW1lT2Yoc3RhdGUpO1xuXHRcdFx0XHRpZiAoc3RhdGUuY3VycmVudFRpbWUgPj0gc3RhdGUuZHVyYXRpb24gfHwgc3RhdGUuY3VycmVudFRpbWUgPCBzdGFydFQpIHN0YXRlLmN1cnJlbnRUaW1lID0gc3RhcnRUO1xuXHRcdFx0XHRzdGF0ZS5wbGF5aW5nID0gdHJ1ZTtcblx0XHRcdFx0YW5jaG9yQXQoc3RhdGUuY3VycmVudFRpbWUpO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblx0XHQvKiogU3RvcHMgcGxheWJhY2sgYW5kIHJld2luZHMgdGhlIHBsYXloZWFkIHRvIHRoZSBzdGFydCBmcmFtZS4gKi9cblx0XHRzdG9wOiAoKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRzdGF0ZS5wbGF5aW5nID0gZmFsc2U7XG5cdFx0XHRcdHN0b3BDbG9jaygpO1xuXHRcdFx0XHRzdGF0ZS5jdXJyZW50VGltZSA9IHN0YXJ0VGltZU9mKHN0YXRlKTtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cdFx0LyoqIEp1bXBzIHRvIHRoZSBmaXJzdCBmcmFtZSBvZiB0aGUgcGxheWJhY2sgcmFuZ2UgYW5kIGV2YWx1YXRlcyBpdC4gKi9cblx0XHRnb1RvU3RhcnQ6ICgpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHN0YXJ0VCA9IHN0YXJ0VGltZU9mKHN0YXRlKTtcblx0XHRcdFx0c3RhdGUuY3VycmVudFRpbWUgPSBzdGFydFQ7XG5cdFx0XHRcdGlmIChzdGF0ZS5wbGF5aW5nKSBhbmNob3JBdChzdGFydFQpO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblx0XHQvKiogSnVtcHMgdG8gdGhlIGVuZCBmcmFtZSBvZiB0aGUgcGxheWJhY2sgcmFuZ2UuICovXG5cdFx0Z29Ub0VuZDogKCkgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0c3RhdGUuY3VycmVudFRpbWUgPSBzdGF0ZS5kdXJhdGlvbjtcblx0XHRcdFx0aWYgKHN0YXRlLnBsYXlpbmcpIGFuY2hvckF0KHN0YXRlLmR1cmF0aW9uKTtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cdFx0cmVzeW5jQ2xvY2s6ICgpID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gZ2V0KHRpbWVsaW5lU3RvcmUpO1xuXHRcdFx0aWYgKHN0YXRlLnBsYXlpbmcpIGFuY2hvckF0KHN0YXRlLmN1cnJlbnRUaW1lKTtcblx0XHR9LFxuXHRcdHRvZ2dsZUxvb3A6ICgpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdHN0YXRlLmxvb3AgPSAhc3RhdGUubG9vcDtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cdFx0c2V0TG9vcDogKGxvb3A6IGJvb2xlYW4pID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdHN0YXRlLmxvb3AgPSBsb29wO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblx0XHR0b2dnbGVFYXNpbmc6ICgpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdHN0YXRlLmVhc2luZyA9ICFzdGF0ZS5lYXNpbmc7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXHRcdHNldEVhc2luZzogKGVhc2luZzogYm9vbGVhbikgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0c3RhdGUuZWFzaW5nID0gZWFzaW5nO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblx0XHR0b2dnbGVBdXRvS2V5OiAoKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRzdGF0ZS5hdXRvS2V5ID0gIXN0YXRlLmF1dG9LZXk7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXHRcdHNldEF1dG9LZXk6IChhdXRvS2V5OiBib29sZWFuKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRzdGF0ZS5hdXRvS2V5ID0gYXV0b0tleTtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cdFx0dG9nZ2xlU25hcFRvRnJhbWVzOiAoKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRzdGF0ZS5zbmFwVG9GcmFtZXMgPSAhc3RhdGUuc25hcFRvRnJhbWVzO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblx0XHRzZXRTbmFwVG9GcmFtZXM6IChzbmFwOiBib29sZWFuKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRzdGF0ZS5zbmFwVG9GcmFtZXMgPSBzbmFwO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblx0XHR0b2dnbGVNdWx0aVNlbGVjdE1vZGU6ICgpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdHN0YXRlLm11bHRpU2VsZWN0TW9kZSA9ICFzdGF0ZS5tdWx0aVNlbGVjdE1vZGU7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXHRcdHNldE11bHRpU2VsZWN0TW9kZTogKGVuYWJsZWQ6IGJvb2xlYW4pID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdHN0YXRlLm11bHRpU2VsZWN0TW9kZSA9IGVuYWJsZWQ7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXHRcdHRvZ2dsZVNob3c6ICgpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdHN0YXRlLnNob3cgPSAhc3RhdGUuc2hvdztcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cdFx0c2V0U2hvdzogKHNob3c6IGJvb2xlYW4pID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdHN0YXRlLnNob3cgPSBzaG93O1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblx0XHRzZXRGcmFtZVJhdGU6IChmcHM6IG51bWJlcikgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0c3RhdGUuZnJhbWVSYXRlID0gY2xhbXAoTWF0aC5yb3VuZChmcHMpLCAxLCAxMjApO1xuXHRcdFx0XHRzdGF0ZS5lbmRGcmFtZSA9IE1hdGgubWF4KDEsIE1hdGgucm91bmQoc3RhdGUuZHVyYXRpb24gKiBzdGF0ZS5mcmFtZVJhdGUpKTtcblx0XHRcdFx0aWYgKHN0YXRlLnN0YXJ0RnJhbWUgPj0gc3RhdGUuZW5kRnJhbWUpIHN0YXRlLnN0YXJ0RnJhbWUgPSBNYXRoLm1heCgwLCBzdGF0ZS5lbmRGcmFtZSAtIDEpO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblx0XHRzZXRQeFBlclNlY29uZDogKHZhbHVlOiBudW1iZXIpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdHN0YXRlLnB4UGVyU2Vjb25kID0gY2xhbXAodmFsdWUsIDAuMjUsIDQwMCk7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXHRcdHNldFVzZXJTY3J1YmJpbmc6IChzY3J1YmJpbmc6IGJvb2xlYW4pID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGlmIChzdGF0ZS5pc1VzZXJTY3J1YmJpbmcgPT09IHNjcnViYmluZykgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRzdGF0ZS5pc1VzZXJTY3J1YmJpbmcgPSBzY3J1YmJpbmc7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXG5cdFx0Ly8gLS0tLSBUcmFjayBNYW5hZ2VtZW50IChTZWxlY3Rpb24sIFJlbmFtZSwgTG9jaywgSGlkZS9NdXRlKSAtLS0tLS0tLS0tXG5cblx0XHRnZXRUcmFja01ldGE6IChvYmplY3RJZDogc3RyaW5nKTogVHJhY2tNZXRhID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gZ2V0KHRpbWVsaW5lU3RvcmUpO1xuXHRcdFx0cmV0dXJuIHN0YXRlLnRyYWNrcy5nZXQob2JqZWN0SWQpID8/IHsgb2JqZWN0SWQsIGxvY2tlZDogZmFsc2UsIGhpZGRlbjogZmFsc2UsIG11dGVkOiBmYWxzZSB9O1xuXHRcdH0sXG5cdFx0c2V0VHJhY2tNZXRhOiAob2JqZWN0SWQ6IHN0cmluZywgcGF0Y2g6IFBhcnRpYWw8VHJhY2tNZXRhPikgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0Y29uc3QgbWV0YSA9IGVuc3VyZVRyYWNrTWV0YShzdGF0ZS50cmFja3MsIG9iamVjdElkKTtcblx0XHRcdFx0T2JqZWN0LmFzc2lnbihtZXRhLCBwYXRjaCwgeyBvYmplY3RJZCB9KTtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cdFx0dG9nZ2xlVHJhY2tMb2NrOiAob2JqZWN0SWQ6IHN0cmluZykgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0Y29uc3QgbWV0YSA9IGVuc3VyZVRyYWNrTWV0YShzdGF0ZS50cmFja3MsIG9iamVjdElkKTtcblx0XHRcdFx0bWV0YS5sb2NrZWQgPSAhbWV0YS5sb2NrZWQ7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXHRcdHRvZ2dsZVRyYWNrTXV0ZTogKG9iamVjdElkOiBzdHJpbmcpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG1ldGEgPSBlbnN1cmVUcmFja01ldGEoc3RhdGUudHJhY2tzLCBvYmplY3RJZCk7XG5cdFx0XHRcdG1ldGEubXV0ZWQgPSAhbWV0YS5tdXRlZDtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cdFx0dG9nZ2xlVHJhY2tIaWRkZW46IChvYmplY3RJZDogc3RyaW5nKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBtZXRhID0gZW5zdXJlVHJhY2tNZXRhKHN0YXRlLnRyYWNrcywgb2JqZWN0SWQpO1xuXHRcdFx0XHRtZXRhLmhpZGRlbiA9ICFtZXRhLmhpZGRlbjtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cblx0XHQvLyAtLS0tIEtleWZyYW1lIE9wZXJhdGlvbnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRcdGFkZEtleWZyYW1lOiAob2JqZWN0SWQ6IHN0cmluZywga2V5ZnJhbWU6IEtleWZyYW1lRGF0YSkgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0aWYgKCFvYmplY3RJZCB8fCAhTnVtYmVyLmlzRmluaXRlKGtleWZyYW1lLnRpbWUpKSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdGlmIChzdGF0ZS50cmFja3MuZ2V0KG9iamVjdElkKT8ubG9ja2VkKSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdGNvbnN0IHJhd1RpbWUgPSBjbGFtcChrZXlmcmFtZS50aW1lLCAwLCBzdGF0ZS5kdXJhdGlvbik7XG5cdFx0XHRcdGNvbnN0IHJlcXVlc3RlZCA9IHN0YXRlLnNuYXBUb0ZyYW1lc1xuXHRcdFx0XHRcdD8gZnJhbWVUb1RpbWUodGltZVRvRnJhbWUocmF3VGltZSwgc3RhdGUuZnJhbWVSYXRlKSwgc3RhdGUuZnJhbWVSYXRlKVxuXHRcdFx0XHRcdDogcm91bmRUaW1lKHJhd1RpbWUpO1xuXHRcdFx0XHRjb25zdCBrZXlzID0gc3RhdGUua2V5ZnJhbWVzLmdldChvYmplY3RJZCkgPz8gW107XG5cdFx0XHRcdGNvbnN0IGV4aXN0aW5nID0ga2V5cy5maW5kSW5kZXgoKGtleSkgPT4gc2FtZVRpbWUoa2V5LnRpbWUsIHJlcXVlc3RlZCkpO1xuXHRcdFx0XHRjb25zdCB0aW1lID0gZXhpc3RpbmcgPj0gMCA/IGtleXNbZXhpc3RpbmddLnRpbWUgOiByZXF1ZXN0ZWQ7XG5cdFx0XHRcdGNvbnN0IHBvc2U6IEtleWZyYW1lRGF0YSA9IHtcblx0XHRcdFx0XHR0aW1lLFxuXHRcdFx0XHRcdHBvc2l0aW9uOiBmaW5pdGVUdXBsZShrZXlmcmFtZS5wb3NpdGlvbiwgWzAsIDAsIDBdKSxcblx0XHRcdFx0XHRyb3RhdGlvbjogZmluaXRlVHVwbGUoa2V5ZnJhbWUucm90YXRpb24sIFswLCAwLCAwXSksXG5cdFx0XHRcdFx0c2NhbGU6IGZpbml0ZVR1cGxlKGtleWZyYW1lLnNjYWxlLCBbMSwgMSwgMV0pLFxuXHRcdFx0XHRcdC4uLihrZXlmcmFtZS52aXNpYmxlICE9PSB1bmRlZmluZWQgPyB7IHZpc2libGU6IEJvb2xlYW4oa2V5ZnJhbWUudmlzaWJsZSkgfSA6IHt9KSxcblx0XHRcdFx0XHQuLi4oa2V5ZnJhbWUuaW50ZXJwb2xhdGlvbiA/IHsgaW50ZXJwb2xhdGlvbjoga2V5ZnJhbWUuaW50ZXJwb2xhdGlvbiB9IDoge30pLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRpZiAoZXhpc3RpbmcgPj0gMCkga2V5c1tleGlzdGluZ10gPSBwb3NlO1xuXHRcdFx0XHRlbHNlIGtleXMucHVzaChwb3NlKTtcblx0XHRcdFx0a2V5cy5zb3J0KChhLCBiKSA9PiBhLnRpbWUgLSBiLnRpbWUpO1xuXHRcdFx0XHRzdGF0ZS5rZXlmcmFtZXMuc2V0KG9iamVjdElkLCBrZXlzKTtcblx0XHRcdFx0Y29uc3QgcmVmZXJlbmNlID0gcmVmZXJlbmNlUXVhdGVybmlvbihzdGF0ZS5jdXJ2ZXMsIG9iamVjdElkLCB0aW1lKTtcblx0XHRcdFx0d3JpdGVUcmFuc2Zvcm1DaGFubmVscyhzdGF0ZS5jdXJ2ZXMsIG9iamVjdElkLCBwb3NlLCByZWZlcmVuY2UsIGtleWZyYW1lLmludGVycG9sYXRpb24pO1xuXHRcdFx0XHRzdGF0ZS5zZWxlY3RlZEtleSA9IHsgb2JqZWN0SWQsIHRpbWUgfTtcblx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRLZXlzID0gW3sgb2JqZWN0SWQsIHRpbWUgfV07XG5cdFx0XHRcdGNvbnN0IGNsaXAgPSBzdGF0ZS5jbGlwcy5nZXQob2JqZWN0SWQpO1xuXHRcdFx0XHRpZiAoY2xpcCkge1xuXHRcdFx0XHRcdGNvbnN0IG1pblQgPSBNYXRoLm1pbihjbGlwLnN0YXJ0LCBrZXlzWzBdLnRpbWUpO1xuXHRcdFx0XHRcdGNvbnN0IG1heFQgPSBNYXRoLm1heChjbGlwLmVuZCwga2V5c1trZXlzLmxlbmd0aCAtIDFdLnRpbWUsIG1pblQgKyAwLjIpO1xuXHRcdFx0XHRcdHN0YXRlLmNsaXBzLnNldChvYmplY3RJZCwgeyBzdGFydDogbWluVCwgZW5kOiBNYXRoLm1pbihzdGF0ZS5kdXJhdGlvbiwgbWF4VCkgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cblx0XHQvKiogRWRpdHMgYW4gZXhpc3Rpbmcga2V5ZnJhbWUncyB2YWx1ZXMgb3IgaW50ZXJwb2xhdGlvbiBhdCBgdGltZWAuICovXG5cdFx0dXBkYXRlS2V5ZnJhbWU6IChcblx0XHRcdG9iamVjdElkOiBzdHJpbmcsXG5cdFx0XHR0aW1lOiBudW1iZXIsXG5cdFx0XHRwYXRjaDogUGFydGlhbDxLZXlmcmFtZURhdGE+ICYgeyBpbnRlcnBvbGF0aW9uPzogSW50ZXJwb2xhdGlvbiB9LFxuXHRcdCkgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0aWYgKHN0YXRlLnRyYWNrcy5nZXQob2JqZWN0SWQpPy5sb2NrZWQpIHJldHVybiBzdGF0ZTtcblx0XHRcdFx0Y29uc3Qga2V5cyA9IHN0YXRlLmtleWZyYW1lcy5nZXQob2JqZWN0SWQpO1xuXHRcdFx0XHRpZiAoIWtleXMpIHJldHVybiBzdGF0ZTtcblx0XHRcdFx0Y29uc3QgaWR4ID0ga2V5cy5maW5kSW5kZXgoKGspID0+IHNhbWVUaW1lKGsudGltZSwgdGltZSkpO1xuXHRcdFx0XHRpZiAoaWR4IDwgMCkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRjb25zdCBleGlzdGluZyA9IGtleXNbaWR4XTtcblx0XHRcdFx0Y29uc3QgdXBkYXRlZDogS2V5ZnJhbWVEYXRhID0ge1xuXHRcdFx0XHRcdC4uLmV4aXN0aW5nLFxuXHRcdFx0XHRcdHBvc2l0aW9uOiBwYXRjaC5wb3NpdGlvbiA/IGZpbml0ZVR1cGxlKHBhdGNoLnBvc2l0aW9uLCBleGlzdGluZy5wb3NpdGlvbikgOiBbLi4uZXhpc3RpbmcucG9zaXRpb25dLFxuXHRcdFx0XHRcdHJvdGF0aW9uOiBwYXRjaC5yb3RhdGlvbiA/IGZpbml0ZVR1cGxlKHBhdGNoLnJvdGF0aW9uLCBleGlzdGluZy5yb3RhdGlvbikgOiBbLi4uZXhpc3Rpbmcucm90YXRpb25dLFxuXHRcdFx0XHRcdHNjYWxlOiBwYXRjaC5zY2FsZSA/IGZpbml0ZVR1cGxlKHBhdGNoLnNjYWxlLCBleGlzdGluZy5zY2FsZSkgOiBbLi4uZXhpc3Rpbmcuc2NhbGVdLFxuXHRcdFx0XHRcdC4uLihwYXRjaC52aXNpYmxlICE9PSB1bmRlZmluZWQgPyB7IHZpc2libGU6IEJvb2xlYW4ocGF0Y2gudmlzaWJsZSkgfSA6IHt9KSxcblx0XHRcdFx0XHQuLi4ocGF0Y2guaW50ZXJwb2xhdGlvbiA/IHsgaW50ZXJwb2xhdGlvbjogcGF0Y2guaW50ZXJwb2xhdGlvbiB9IDoge30pLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRrZXlzW2lkeF0gPSB1cGRhdGVkO1xuXHRcdFx0XHRjb25zdCByZWZlcmVuY2UgPSByZWZlcmVuY2VRdWF0ZXJuaW9uKHN0YXRlLmN1cnZlcywgb2JqZWN0SWQsIGV4aXN0aW5nLnRpbWUpO1xuXHRcdFx0XHR3cml0ZVRyYW5zZm9ybUNoYW5uZWxzKHN0YXRlLmN1cnZlcywgb2JqZWN0SWQsIHVwZGF0ZWQsIHJlZmVyZW5jZSwgcGF0Y2guaW50ZXJwb2xhdGlvbik7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXG5cdFx0LyoqIFJlY29yZHMgYSB2aXNpYmlsaXR5IGtleWZyYW1lIChgdmlzaWJsZTogdHJ1ZS9mYWxzZWApIG9uIGBvYmplY3RJZGAgYXQgYHRpbWVgLiAqL1xuXHRcdHNldFZpc2liaWxpdHlLZXlmcmFtZTogKG9iamVjdElkOiBzdHJpbmcsIHRpbWU6IG51bWJlciwgdmlzaWJsZTogYm9vbGVhbiwgZmFsbGJhY2tQb3NlPzogT21pdDxLZXlmcmFtZURhdGEsICd0aW1lJz4pID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGlmICghb2JqZWN0SWQgfHwgIU51bWJlci5pc0Zpbml0ZSh0aW1lKSB8fCBzdGF0ZS50cmFja3MuZ2V0KG9iamVjdElkKT8ubG9ja2VkKSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdGNvbnN0IHQgPSBzdGF0ZS5zbmFwVG9GcmFtZXNcblx0XHRcdFx0XHQ/IGZyYW1lVG9UaW1lKHRpbWVUb0ZyYW1lKGNsYW1wKHRpbWUsIDAsIHN0YXRlLmR1cmF0aW9uKSwgc3RhdGUuZnJhbWVSYXRlKSwgc3RhdGUuZnJhbWVSYXRlKVxuXHRcdFx0XHRcdDogcm91bmRUaW1lKGNsYW1wKHRpbWUsIDAsIHN0YXRlLmR1cmF0aW9uKSk7XG5cdFx0XHRcdGNvbnN0IGVudHJ5ID0gZW5zdXJlQ3VydmVzKHN0YXRlLmN1cnZlcywgb2JqZWN0SWQpO1xuXHRcdFx0XHRlbnN1cmVDdXJ2ZShlbnRyeSwgVklTSUJJTElUWV9DSEFOTkVMKS5pbnNlcnQodCwgdmlzaWJsZSA/IDEgOiAwLCAnY29uc3RhbnQnKTtcblxuXHRcdFx0XHRjb25zdCBrZXlzID0gc3RhdGUua2V5ZnJhbWVzLmdldChvYmplY3RJZCkgPz8gW107XG5cdFx0XHRcdGNvbnN0IGlkeCA9IGtleXMuZmluZEluZGV4KChrKSA9PiBzYW1lVGltZShrLnRpbWUsIHQpKTtcblx0XHRcdFx0aWYgKGlkeCA+PSAwKSB7XG5cdFx0XHRcdFx0a2V5c1tpZHhdID0geyAuLi5rZXlzW2lkeF0sIHZpc2libGUgfTtcblx0XHRcdFx0fSBlbHNlIGlmIChmYWxsYmFja1Bvc2UpIHtcblx0XHRcdFx0XHRjb25zdCBwb3NlOiBLZXlmcmFtZURhdGEgPSB7XG5cdFx0XHRcdFx0XHR0aW1lOiB0LFxuXHRcdFx0XHRcdFx0cG9zaXRpb246IGZpbml0ZVR1cGxlKGZhbGxiYWNrUG9zZS5wb3NpdGlvbiwgWzAsIDAsIDBdKSxcblx0XHRcdFx0XHRcdHJvdGF0aW9uOiBmaW5pdGVUdXBsZShmYWxsYmFja1Bvc2Uucm90YXRpb24sIFswLCAwLCAwXSksXG5cdFx0XHRcdFx0XHRzY2FsZTogZmluaXRlVHVwbGUoZmFsbGJhY2tQb3NlLnNjYWxlLCBbMSwgMSwgMV0pLFxuXHRcdFx0XHRcdFx0dmlzaWJsZSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGtleXMucHVzaChwb3NlKTtcblx0XHRcdFx0XHRrZXlzLnNvcnQoKGEsIGIpID0+IGEudGltZSAtIGIudGltZSk7XG5cdFx0XHRcdFx0c3RhdGUua2V5ZnJhbWVzLnNldChvYmplY3RJZCwga2V5cyk7XG5cdFx0XHRcdFx0Y29uc3QgcmVmID0gcmVmZXJlbmNlUXVhdGVybmlvbihzdGF0ZS5jdXJ2ZXMsIG9iamVjdElkLCB0KTtcblx0XHRcdFx0XHR3cml0ZVRyYW5zZm9ybUNoYW5uZWxzKHN0YXRlLmN1cnZlcywgb2JqZWN0SWQsIHBvc2UsIHJlZik7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cblx0XHQvKiogV3JpdGVzIGEgc2luZ2xlIGNoYW5uZWwsIHVzZWQgYnkgdGhlIG1hdGVyaWFsIG9wYWNpdHksIGNvbG91ciwgb3IgdmlzaWJpbGl0eS4gKi9cblx0XHRhZGRDaGFubmVsS2V5ZnJhbWU6IChvYmplY3RJZDogc3RyaW5nLCBwYXRoOiBDaGFubmVsUGF0aCwgdGltZTogbnVtYmVyLCB2YWx1ZTogbnVtYmVyLCBpbnRlcnBvbGF0aW9uPzogSW50ZXJwb2xhdGlvbikgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0aWYgKHN0YXRlLnRyYWNrcy5nZXQob2JqZWN0SWQpPy5sb2NrZWQpIHJldHVybiBzdGF0ZTtcblx0XHRcdFx0Y29uc3QgZW50cnkgPSBlbnN1cmVDdXJ2ZXMoc3RhdGUuY3VydmVzLCBvYmplY3RJZCk7XG5cdFx0XHRcdGVuc3VyZUN1cnZlKGVudHJ5LCBwYXRoKS5pbnNlcnQoY2xhbXAodGltZSwgMCwgTUFYX1RJTUVMSU5FX1NFQ09ORFMpLCB2YWx1ZSwgaW50ZXJwb2xhdGlvbik7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXG5cdFx0LyoqIENoYW5nZXMgdGhlIGludGVycG9sYXRpb24gb2YgZXZlcnkga2V5IG9mIGEgY2hhbm5lbCAob3IgYSBzcGVjaWZpYyBrZXlUaW1lKS4gKi9cblx0XHRzZXRJbnRlcnBvbGF0aW9uOiAob2JqZWN0SWQ6IHN0cmluZywgcGF0aDogQ2hhbm5lbFBhdGgsIGludGVycG9sYXRpb246IEludGVycG9sYXRpb24sIGtleVRpbWU/OiBudW1iZXIpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGlmIChzdGF0ZS50cmFja3MuZ2V0KG9iamVjdElkKT8ubG9ja2VkKSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdGNvbnN0IGN1cnZlID0gc3RhdGUuY3VydmVzLmdldChvYmplY3RJZCk/LmdldChwYXRoKTtcblx0XHRcdFx0aWYgKCFjdXJ2ZSkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBjdXJ2ZS5rZXlzKSB7XG5cdFx0XHRcdFx0aWYgKGtleVRpbWUgPT09IHVuZGVmaW5lZCB8fCBzYW1lVGltZShrZXkudGltZSwga2V5VGltZSkpIHtcblx0XHRcdFx0XHRcdGtleS5pbnRlcnBvbGF0aW9uID0gaW50ZXJwb2xhdGlvbjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cblx0XHQvKiogU2V0cyBpbnRlcnBvbGF0aW9uIGFjcm9zcyBhbGwgdHJhbnNmb3JtIGNoYW5uZWxzIG9mIGBvYmplY3RJZGAgKGF0IGBrZXlUaW1lYCBvciBhbGwga2V5cykuICovXG5cdFx0c2V0T2JqZWN0SW50ZXJwb2xhdGlvbjogKG9iamVjdElkOiBzdHJpbmcsIGludGVycG9sYXRpb246IEludGVycG9sYXRpb24sIGtleVRpbWU/OiBudW1iZXIpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGlmIChzdGF0ZS50cmFja3MuZ2V0KG9iamVjdElkKT8ubG9ja2VkKSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdGNvbnN0IGVudHJ5ID0gc3RhdGUuY3VydmVzLmdldChvYmplY3RJZCk7XG5cdFx0XHRcdGlmIChlbnRyeSkge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgcGF0aCBvZiBUUkFOU0ZPUk1fQ0hBTk5FTFMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGN1cnZlID0gZW50cnkuZ2V0KHBhdGgpO1xuXHRcdFx0XHRcdFx0aWYgKCFjdXJ2ZSkgY29udGludWU7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBjdXJ2ZS5rZXlzKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChrZXlUaW1lID09PSB1bmRlZmluZWQgfHwgc2FtZVRpbWUoa2V5LnRpbWUsIGtleVRpbWUpKSB7XG5cdFx0XHRcdFx0XHRcdFx0a2V5LmludGVycG9sYXRpb24gPSBpbnRlcnBvbGF0aW9uO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGtleXMgPSBzdGF0ZS5rZXlmcmFtZXMuZ2V0KG9iamVjdElkKTtcblx0XHRcdFx0aWYgKGtleXMpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGsgb2Yga2V5cykge1xuXHRcdFx0XHRcdFx0aWYgKGtleVRpbWUgPT09IHVuZGVmaW5lZCB8fCBzYW1lVGltZShrLnRpbWUsIGtleVRpbWUpKSB7XG5cdFx0XHRcdFx0XHRcdGsuaW50ZXJwb2xhdGlvbiA9IGludGVycG9sYXRpb247XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXG5cdFx0LyoqIEludGVycG9sYXRpb24gb2YgdGhlIHNlbGVjdGVkIGtleSAob3IgZmlyc3Qga2V5KSBvZiBhIGNoYW5uZWwuICovXG5cdFx0aW50ZXJwb2xhdGlvbk9mOiAob2JqZWN0SWQ6IHN0cmluZywgcGF0aDogQ2hhbm5lbFBhdGgsIGtleVRpbWU/OiBudW1iZXIpOiBJbnRlcnBvbGF0aW9uID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gZ2V0KHRpbWVsaW5lU3RvcmUpO1xuXHRcdFx0Y29uc3QgY3VydmUgPSBzdGF0ZS5jdXJ2ZXMuZ2V0KG9iamVjdElkKT8uZ2V0KHBhdGgpO1xuXHRcdFx0aWYgKCFjdXJ2ZSB8fCAhY3VydmUua2V5cy5sZW5ndGgpIHJldHVybiAnYmV6aWVyJztcblx0XHRcdGlmIChrZXlUaW1lICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29uc3QgbWF0Y2ggPSBjdXJ2ZS5rZXlzLmZpbmQoKGspID0+IHNhbWVUaW1lKGsudGltZSwga2V5VGltZSkpO1xuXHRcdFx0XHRpZiAobWF0Y2gpIHJldHVybiBtYXRjaC5pbnRlcnBvbGF0aW9uO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGN1cnZlLmtleXNbMF0/LmludGVycG9sYXRpb24gPz8gJ2Jlemllcic7XG5cdFx0fSxcblxuXHRcdHJlbW92ZUtleWZyYW1lOiAob2JqZWN0SWQ6IHN0cmluZywgdGltZTogbnVtYmVyKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRpZiAoc3RhdGUudHJhY2tzLmdldChvYmplY3RJZCk/LmxvY2tlZCkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRyZW1vdmVQb3NlQW5kQ3VydmVzQXQoc3RhdGUsIG9iamVjdElkLCB0aW1lKTtcblx0XHRcdFx0aWYgKHN0YXRlLnNlbGVjdGVkS2V5Py5vYmplY3RJZCA9PT0gb2JqZWN0SWQgJiYgc2FtZVRpbWUoc3RhdGUuc2VsZWN0ZWRLZXkudGltZSwgdGltZSkpIHtcblx0XHRcdFx0XHRzdGF0ZS5zZWxlY3RlZEtleSA9IG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRLZXlzID0gc3RhdGUuc2VsZWN0ZWRLZXlzLmZpbHRlcihcblx0XHRcdFx0XHQoc2VsKSA9PiAhKHNlbC5vYmplY3RJZCA9PT0gb2JqZWN0SWQgJiYgc2FtZVRpbWUoc2VsLnRpbWUsIHRpbWUpKSxcblx0XHRcdFx0KTtcblx0XHRcdFx0aWYgKCFzdGF0ZS5zZWxlY3RlZEtleSAmJiBzdGF0ZS5zZWxlY3RlZEtleXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRLZXkgPSB7IC4uLnN0YXRlLnNlbGVjdGVkS2V5c1tzdGF0ZS5zZWxlY3RlZEtleXMubGVuZ3RoIC0gMV0gfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblxuXHRcdHNlbGVjdEtleWZyYW1lOiAob2JqZWN0SWQ6IHN0cmluZywgdGltZTogbnVtYmVyLCBhZGRpdGl2ZSA9IGZhbHNlKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRpZiAoIW9iamVjdElkIHx8ICFOdW1iZXIuaXNGaW5pdGUodGltZSkpIHJldHVybiBzdGF0ZTtcblx0XHRcdFx0Y29uc3QgY2xhbXBlZCA9IGNsYW1wKHRpbWUsIDAsIHN0YXRlLmR1cmF0aW9uKTtcblx0XHRcdFx0Y29uc3QgdXNlTXVsdGkgPSBhZGRpdGl2ZSB8fCBzdGF0ZS5tdWx0aVNlbGVjdE1vZGU7XG5cdFx0XHRcdGlmICh1c2VNdWx0aSkge1xuXHRcdFx0XHRcdGNvbnN0IGlkeCA9IHN0YXRlLnNlbGVjdGVkS2V5cy5maW5kSW5kZXgoXG5cdFx0XHRcdFx0XHQoaykgPT4gay5vYmplY3RJZCA9PT0gb2JqZWN0SWQgJiYgc2FtZVRpbWUoay50aW1lLCBjbGFtcGVkKSxcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdGlmIChpZHggPj0gMCkge1xuXHRcdFx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRLZXlzLnNwbGljZShpZHgsIDEpO1xuXHRcdFx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRLZXkgPSBzdGF0ZS5zZWxlY3RlZEtleXMubGVuZ3RoXG5cdFx0XHRcdFx0XHRcdD8geyAuLi5zdGF0ZS5zZWxlY3RlZEtleXNbc3RhdGUuc2VsZWN0ZWRLZXlzLmxlbmd0aCAtIDFdIH1cblx0XHRcdFx0XHRcdFx0OiBudWxsO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRzdGF0ZS5zZWxlY3RlZEtleXMucHVzaCh7IG9iamVjdElkLCB0aW1lOiBjbGFtcGVkIH0pO1xuXHRcdFx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRLZXkgPSB7IG9iamVjdElkLCB0aW1lOiBjbGFtcGVkIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHN0YXRlLnNlbGVjdGVkS2V5ID0geyBvYmplY3RJZCwgdGltZTogY2xhbXBlZCB9O1xuXHRcdFx0XHRcdHN0YXRlLnNlbGVjdGVkS2V5cyA9IFt7IG9iamVjdElkLCB0aW1lOiBjbGFtcGVkIH1dO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHN0YXRlLmN1cnJlbnRUaW1lID0gY2xhbXBlZDtcblx0XHRcdFx0c3RhdGUucGxheWluZyA9IGZhbHNlO1xuXHRcdFx0XHRzdG9wQ2xvY2soKTtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cblx0XHRzZWxlY3RLZXlmcmFtZXM6IChzZWxlY3Rpb25zOiBLZXlmcmFtZVNlbGVjdGlvbltdKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCB2YWxpZCA9IHNlbGVjdGlvbnNcblx0XHRcdFx0XHQuZmlsdGVyKChzKSA9PiBCb29sZWFuKHMub2JqZWN0SWQpICYmIE51bWJlci5pc0Zpbml0ZShzLnRpbWUpKVxuXHRcdFx0XHRcdC5tYXAoKHMpID0+ICh7IG9iamVjdElkOiBzLm9iamVjdElkLCB0aW1lOiBjbGFtcChzLnRpbWUsIDAsIHN0YXRlLmR1cmF0aW9uKSB9KSk7XG5cdFx0XHRcdHN0YXRlLnNlbGVjdGVkS2V5cyA9IHZhbGlkO1xuXHRcdFx0XHRzdGF0ZS5zZWxlY3RlZEtleSA9IHZhbGlkLmxlbmd0aCA/IHsgLi4udmFsaWRbdmFsaWQubGVuZ3RoIC0gMV0gfSA6IG51bGw7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXG5cdFx0c2VsZWN0S2V5ZnJhbWVzSW5SYW5nZTogKHN0YXJ0VGltZTogbnVtYmVyLCBlbmRUaW1lOiBudW1iZXIsIG9iamVjdElkPzogc3RyaW5nKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBtaW5UID0gTWF0aC5taW4oc3RhcnRUaW1lLCBlbmRUaW1lKSAtIEtFWV9FUFNJTE9OO1xuXHRcdFx0XHRjb25zdCBtYXhUID0gTWF0aC5tYXgoc3RhcnRUaW1lLCBlbmRUaW1lKSArIEtFWV9FUFNJTE9OO1xuXHRcdFx0XHRjb25zdCBmb3VuZDogS2V5ZnJhbWVTZWxlY3Rpb25bXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtvaWQsIGtleXNdIG9mIHN0YXRlLmtleWZyYW1lcykge1xuXHRcdFx0XHRcdGlmIChvYmplY3RJZCAmJiBvaWQgIT09IG9iamVjdElkKSBjb250aW51ZTtcblx0XHRcdFx0XHRpZiAoc3RhdGUudHJhY2tzLmdldChvaWQpPy5sb2NrZWQpIGNvbnRpbnVlO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgayBvZiBrZXlzKSB7XG5cdFx0XHRcdFx0XHRpZiAoay50aW1lID49IG1pblQgJiYgay50aW1lIDw9IG1heFQpIHtcblx0XHRcdFx0XHRcdFx0Zm91bmQucHVzaCh7IG9iamVjdElkOiBvaWQsIHRpbWU6IGsudGltZSB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRLZXlzID0gZm91bmQ7XG5cdFx0XHRcdHN0YXRlLnNlbGVjdGVkS2V5ID0gZm91bmQubGVuZ3RoID8geyAuLi5mb3VuZFtmb3VuZC5sZW5ndGggLSAxXSB9IDogbnVsbDtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cblx0XHRjbGVhcktleWZyYW1lU2VsZWN0aW9uOiAoKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRzdGF0ZS5zZWxlY3RlZEtleSA9IG51bGw7XG5cdFx0XHRcdHN0YXRlLnNlbGVjdGVkS2V5cyA9IFtdO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblxuXHRcdC8qKiBEZWxldGVzIGFsbCBzZWxlY3RlZCBrZXlmcmFtZXMgKG11bHRpLXNlbGVjdGlvbiBvciBwcmltYXJ5IHNlbGVjdGVkS2V5KS4gKi9cblx0XHRkZWxldGVTZWxlY3RlZEtleTogKCkgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0czogS2V5ZnJhbWVTZWxlY3Rpb25bXSA9XG5cdFx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRLZXlzLmxlbmd0aCA+IDBcblx0XHRcdFx0XHRcdD8gWy4uLnN0YXRlLnNlbGVjdGVkS2V5c11cblx0XHRcdFx0XHRcdDogc3RhdGUuc2VsZWN0ZWRLZXlcblx0XHRcdFx0XHRcdFx0PyBbc3RhdGUuc2VsZWN0ZWRLZXldXG5cdFx0XHRcdFx0XHRcdDogW107XG5cdFx0XHRcdGlmICghdGFyZ2V0cy5sZW5ndGgpIHJldHVybiBzdGF0ZTtcblx0XHRcdFx0Zm9yIChjb25zdCB0YXJnZXQgb2YgdGFyZ2V0cykge1xuXHRcdFx0XHRcdGlmIChzdGF0ZS50cmFja3MuZ2V0KHRhcmdldC5vYmplY3RJZCk/LmxvY2tlZCkgY29udGludWU7XG5cdFx0XHRcdFx0cmVtb3ZlUG9zZUFuZEN1cnZlc0F0KHN0YXRlLCB0YXJnZXQub2JqZWN0SWQsIHRhcmdldC50aW1lKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzdGF0ZS5zZWxlY3RlZEtleSA9IG51bGw7XG5cdFx0XHRcdHN0YXRlLnNlbGVjdGVkS2V5cyA9IFtdO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblxuXHRcdG1vdmVLZXlmcmFtZTogKG9iamVjdElkOiBzdHJpbmcsIGZyb21UaW1lOiBudW1iZXIsIHRvVGltZTogbnVtYmVyKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRpZiAoc3RhdGUudHJhY2tzLmdldChvYmplY3RJZCk/LmxvY2tlZCkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRjb25zdCBmcm9tID0gcm91bmRUaW1lKGZyb21UaW1lKTtcblx0XHRcdFx0Y29uc3QgcmF3VG8gPSBjbGFtcCh0b1RpbWUsIDAsIHN0YXRlLmR1cmF0aW9uKTtcblx0XHRcdFx0Y29uc3QgdG8gPSBzdGF0ZS5zbmFwVG9GcmFtZXNcblx0XHRcdFx0XHQ/IGZyYW1lVG9UaW1lKHRpbWVUb0ZyYW1lKHJhd1RvLCBzdGF0ZS5mcmFtZVJhdGUpLCBzdGF0ZS5mcmFtZVJhdGUpXG5cdFx0XHRcdFx0OiByb3VuZFRpbWUocmF3VG8pO1xuXHRcdFx0XHRpZiAoc2FtZVRpbWUoZnJvbSwgdG8pKSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdGNvbnN0IGtleXMgPSBzdGF0ZS5rZXlmcmFtZXMuZ2V0KG9iamVjdElkKTtcblx0XHRcdFx0aWYgKCFrZXlzKSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdGNvbnN0IGluZGV4ID0ga2V5cy5maW5kSW5kZXgoKGtleSkgPT4gc2FtZVRpbWUoa2V5LnRpbWUsIGZyb20pKTtcblx0XHRcdFx0aWYgKGluZGV4IDwgMCkgcmV0dXJuIHN0YXRlO1xuXG5cdFx0XHRcdGNvbnN0IHBvc2UgPSBrZXlzW2luZGV4XTtcblx0XHRcdFx0Y29uc3QgbW92ZWQ6IEtleWZyYW1lRGF0YSA9IHtcblx0XHRcdFx0XHQuLi5wb3NlLFxuXHRcdFx0XHRcdHRpbWU6IHRvLFxuXHRcdFx0XHRcdHBvc2l0aW9uOiBbLi4ucG9zZS5wb3NpdGlvbl0gYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdLFxuXHRcdFx0XHRcdHJvdGF0aW9uOiBbLi4ucG9zZS5yb3RhdGlvbl0gYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdLFxuXHRcdFx0XHRcdHNjYWxlOiBbLi4ucG9zZS5zY2FsZV0gYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRjb25zdCBuZXh0ID0ga2V5cy5maWx0ZXIoKGtleSkgPT4gIXNhbWVUaW1lKGtleS50aW1lLCB0bykpO1xuXHRcdFx0XHRjb25zdCBzb3VyY2UgPSBuZXh0LmZpbmRJbmRleCgoa2V5KSA9PiBzYW1lVGltZShrZXkudGltZSwgZnJvbSkpO1xuXHRcdFx0XHRpZiAoc291cmNlIDwgMCkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRuZXh0W3NvdXJjZV0gPSBtb3ZlZDtcblx0XHRcdFx0bmV4dC5zb3J0KChhLCBiKSA9PiBhLnRpbWUgLSBiLnRpbWUpO1xuXHRcdFx0XHRzdGF0ZS5rZXlmcmFtZXMuc2V0KG9iamVjdElkLCBuZXh0KTtcblxuXHRcdFx0XHRjb25zdCBlbnRyeSA9IHN0YXRlLmN1cnZlcy5nZXQob2JqZWN0SWQpO1xuXHRcdFx0XHRpZiAoZW50cnkpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHBhdGggb2YgQ0hBTk5FTF9QQVRIUykge1xuXHRcdFx0XHRcdFx0Y29uc3QgY3VydmUgPSBlbnRyeS5nZXQocGF0aCk7XG5cdFx0XHRcdFx0XHRpZiAoIWN1cnZlKSBjb250aW51ZTtcblx0XHRcdFx0XHRcdGNvbnN0IHNyY0lkeCA9IGN1cnZlLmtleXMuZmluZEluZGV4KChrZXkpID0+IHNhbWVUaW1lKGtleS50aW1lLCBmcm9tKSk7XG5cdFx0XHRcdFx0XHRpZiAoc3JjSWR4IDwgMCkgY29udGludWU7XG5cdFx0XHRcdFx0XHRjb25zdCB0YXJnZXQgPSBjdXJ2ZS5rZXlzLmZpbmRJbmRleCgoa2V5LCBpKSA9PiBpICE9PSBzcmNJZHggJiYgc2FtZVRpbWUoa2V5LnRpbWUsIHRvKSk7XG5cdFx0XHRcdFx0XHRpZiAodGFyZ2V0ID49IDApIGN1cnZlLmtleXMuc3BsaWNlKHRhcmdldCwgMSk7XG5cdFx0XHRcdFx0XHRjb25zdCBjdXJ2ZUluZGV4ID0gY3VydmUua2V5cy5maW5kSW5kZXgoKGtleSkgPT4gc2FtZVRpbWUoa2V5LnRpbWUsIGZyb20pKTtcblx0XHRcdFx0XHRcdGlmIChjdXJ2ZUluZGV4IDwgMCkgY29udGludWU7XG5cdFx0XHRcdFx0XHRjdXJ2ZS5rZXlzW2N1cnZlSW5kZXhdLnRpbWUgPSB0bztcblx0XHRcdFx0XHRcdGN1cnZlLmtleXMuc29ydCgoYSwgYikgPT4gYS50aW1lIC0gYi50aW1lKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoc3RhdGUuc2VsZWN0ZWRLZXk/Lm9iamVjdElkID09PSBvYmplY3RJZCAmJiBzYW1lVGltZShzdGF0ZS5zZWxlY3RlZEtleS50aW1lLCBmcm9tKSkge1xuXHRcdFx0XHRcdHN0YXRlLnNlbGVjdGVkS2V5ID0geyBvYmplY3RJZCwgdGltZTogdG8gfTtcblx0XHRcdFx0XHRzdGF0ZS5jdXJyZW50VGltZSA9IGNsYW1wKHRvLCAwLCBzdGF0ZS5kdXJhdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRLZXlzID0gc3RhdGUuc2VsZWN0ZWRLZXlzLm1hcCgoc2VsKSA9PlxuXHRcdFx0XHRcdHNlbC5vYmplY3RJZCA9PT0gb2JqZWN0SWQgJiYgc2FtZVRpbWUoc2VsLnRpbWUsIGZyb20pID8geyBvYmplY3RJZCwgdGltZTogdG8gfSA6IHNlbCxcblx0XHRcdFx0KTtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cblx0XHQvKiogTW92ZXMgYWxsIGN1cnJlbnRseSBtdWx0aS1zZWxlY3RlZCBrZXlmcmFtZXMgdG9nZXRoZXIgYnkgYGRlbHRhVGltZWAuICovXG5cdFx0bW92ZVNlbGVjdGVkS2V5ZnJhbWVzOiAoZGVsdGFUaW1lOiBudW1iZXIpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRhcmdldHMgPVxuXHRcdFx0XHRcdHN0YXRlLnNlbGVjdGVkS2V5cy5sZW5ndGggPiAwXG5cdFx0XHRcdFx0XHQ/IFsuLi5zdGF0ZS5zZWxlY3RlZEtleXNdXG5cdFx0XHRcdFx0XHQ6IHN0YXRlLnNlbGVjdGVkS2V5XG5cdFx0XHRcdFx0XHRcdD8gW3N0YXRlLnNlbGVjdGVkS2V5XVxuXHRcdFx0XHRcdFx0XHQ6IFtdO1xuXHRcdFx0XHRpZiAoIXRhcmdldHMubGVuZ3RoIHx8ICFOdW1iZXIuaXNGaW5pdGUoZGVsdGFUaW1lKSB8fCBNYXRoLmFicyhkZWx0YVRpbWUpIDwgMWUtNikgcmV0dXJuIHN0YXRlO1xuXG5cdFx0XHRcdC8vIENsYW1wIGRlbHRhIHNvIG5vIHNlbGVjdGVkIGtleSBsZWF2ZXMgWzAsIGR1cmF0aW9uXVxuXHRcdFx0XHRsZXQgbWluVGltZSA9IEluZmluaXR5O1xuXHRcdFx0XHRsZXQgbWF4VGltZSA9IC1JbmZpbml0eTtcblx0XHRcdFx0Zm9yIChjb25zdCBzZWwgb2YgdGFyZ2V0cykge1xuXHRcdFx0XHRcdGlmIChzdGF0ZS50cmFja3MuZ2V0KHNlbC5vYmplY3RJZCk/LmxvY2tlZCkgY29udGludWU7XG5cdFx0XHRcdFx0bWluVGltZSA9IE1hdGgubWluKG1pblRpbWUsIHNlbC50aW1lKTtcblx0XHRcdFx0XHRtYXhUaW1lID0gTWF0aC5tYXgobWF4VGltZSwgc2VsLnRpbWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghTnVtYmVyLmlzRmluaXRlKG1pblRpbWUpKSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdGxldCBkZWx0YSA9IGNsYW1wKGRlbHRhVGltZSwgLW1pblRpbWUsIHN0YXRlLmR1cmF0aW9uIC0gbWF4VGltZSk7XG5cdFx0XHRcdGlmIChzdGF0ZS5zbmFwVG9GcmFtZXMpIHtcblx0XHRcdFx0XHRkZWx0YSA9IE1hdGgucm91bmQoZGVsdGEgKiBzdGF0ZS5mcmFtZVJhdGUpIC8gc3RhdGUuZnJhbWVSYXRlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChNYXRoLmFicyhkZWx0YSkgPCAxZS02KSByZXR1cm4gc3RhdGU7XG5cblx0XHRcdFx0Ly8gU29ydCBkZXNjZW5kaW5nIHdoZW4gbW92aW5nIHJpZ2h0LCBhc2NlbmRpbmcgd2hlbiBtb3ZpbmcgbGVmdCB0byBhdm9pZCBzZWxmLWNvbGxpc2lvblxuXHRcdFx0XHRjb25zdCBvcmRlcmVkID0gWy4uLnRhcmdldHNdLnNvcnQoKGEsIGIpID0+IChkZWx0YSA+IDAgPyBiLnRpbWUgLSBhLnRpbWUgOiBhLnRpbWUgLSBiLnRpbWUpKTtcblx0XHRcdFx0Y29uc3QgbmV3U2VsZWN0aW9uczogS2V5ZnJhbWVTZWxlY3Rpb25bXSA9IFtdO1xuXG5cdFx0XHRcdGZvciAoY29uc3Qgc2VsIG9mIG9yZGVyZWQpIHtcblx0XHRcdFx0XHRpZiAoc3RhdGUudHJhY2tzLmdldChzZWwub2JqZWN0SWQpPy5sb2NrZWQpIHtcblx0XHRcdFx0XHRcdG5ld1NlbGVjdGlvbnMucHVzaChzZWwpO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGZyb20gPSByb3VuZFRpbWUoc2VsLnRpbWUpO1xuXHRcdFx0XHRcdGNvbnN0IHRvID0gcm91bmRUaW1lKGNsYW1wKGZyb20gKyBkZWx0YSwgMCwgc3RhdGUuZHVyYXRpb24pKTtcblx0XHRcdFx0XHRjb25zdCBrZXlzID0gc3RhdGUua2V5ZnJhbWVzLmdldChzZWwub2JqZWN0SWQpO1xuXHRcdFx0XHRcdGlmICgha2V5cykgY29udGludWU7XG5cdFx0XHRcdFx0Y29uc3QgaWR4ID0ga2V5cy5maW5kSW5kZXgoKGspID0+IHNhbWVUaW1lKGsudGltZSwgZnJvbSkpO1xuXHRcdFx0XHRcdGlmIChpZHggPj0gMCkge1xuXHRcdFx0XHRcdFx0a2V5c1tpZHhdID0ge1xuXHRcdFx0XHRcdFx0XHQuLi5rZXlzW2lkeF0sXG5cdFx0XHRcdFx0XHRcdHRpbWU6IHRvLFxuXHRcdFx0XHRcdFx0XHRwb3NpdGlvbjogWy4uLmtleXNbaWR4XS5wb3NpdGlvbl0sXG5cdFx0XHRcdFx0XHRcdHJvdGF0aW9uOiBbLi4ua2V5c1tpZHhdLnJvdGF0aW9uXSxcblx0XHRcdFx0XHRcdFx0c2NhbGU6IFsuLi5rZXlzW2lkeF0uc2NhbGVdLFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdGtleXMuc29ydCgoYSwgYikgPT4gYS50aW1lIC0gYi50aW1lKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgZW50cnkgPSBzdGF0ZS5jdXJ2ZXMuZ2V0KHNlbC5vYmplY3RJZCk7XG5cdFx0XHRcdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHBhdGggb2YgQ0hBTk5FTF9QQVRIUykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBjdXJ2ZSA9IGVudHJ5LmdldChwYXRoKTtcblx0XHRcdFx0XHRcdFx0aWYgKCFjdXJ2ZSkgY29udGludWU7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNJZHggPSBjdXJ2ZS5rZXlzLmZpbmRJbmRleCgoaykgPT4gc2FtZVRpbWUoay50aW1lLCBmcm9tKSk7XG5cdFx0XHRcdFx0XHRcdGlmIChjSWR4ID49IDApIHtcblx0XHRcdFx0XHRcdFx0XHRjdXJ2ZS5rZXlzW2NJZHhdLnRpbWUgPSB0bztcblx0XHRcdFx0XHRcdFx0XHRjdXJ2ZS5rZXlzLnNvcnQoKGEsIGIpID0+IGEudGltZSAtIGIudGltZSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bmV3U2VsZWN0aW9ucy5wdXNoKHsgb2JqZWN0SWQ6IHNlbC5vYmplY3RJZCwgdGltZTogdG8gfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRLZXlzID0gbmV3U2VsZWN0aW9ucztcblx0XHRcdFx0aWYgKHN0YXRlLnNlbGVjdGVkS2V5KSB7XG5cdFx0XHRcdFx0Y29uc3QgcHJpbWFyeSA9IG5ld1NlbGVjdGlvbnNbbmV3U2VsZWN0aW9ucy5sZW5ndGggLSAxXTtcblx0XHRcdFx0XHRpZiAocHJpbWFyeSkge1xuXHRcdFx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRLZXkgPSB7IC4uLnByaW1hcnkgfTtcblx0XHRcdFx0XHRcdHN0YXRlLmN1cnJlbnRUaW1lID0gcHJpbWFyeS50aW1lO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblxuXHRcdC8qKiBDb3BpZXMgc2VsZWN0ZWQga2V5ZnJhbWVzIChvciBrZXlmcmFtZSBhdCBwbGF5aGVhZCBmb3IgYG9iamVjdElkYCkgdG8gdGhlIGNsaXBib2FyZC4gKi9cblx0XHRjb3B5U2VsZWN0ZWRLZXlzOiAoZmFsbGJhY2tPYmplY3RJZD86IHN0cmluZyk6IG51bWJlciA9PiB7XG5cdFx0XHRsZXQgY29waWVkQ291bnQgPSAwO1xuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRsZXQgdGFyZ2V0czogS2V5ZnJhbWVTZWxlY3Rpb25bXSA9XG5cdFx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRLZXlzLmxlbmd0aCA+IDBcblx0XHRcdFx0XHRcdD8gWy4uLnN0YXRlLnNlbGVjdGVkS2V5c11cblx0XHRcdFx0XHRcdDogc3RhdGUuc2VsZWN0ZWRLZXlcblx0XHRcdFx0XHRcdFx0PyBbc3RhdGUuc2VsZWN0ZWRLZXldXG5cdFx0XHRcdFx0XHRcdDogW107XG5cdFx0XHRcdGlmICghdGFyZ2V0cy5sZW5ndGggJiYgZmFsbGJhY2tPYmplY3RJZCkge1xuXHRcdFx0XHRcdGNvbnN0IGtleXMgPSBzdGF0ZS5rZXlmcmFtZXMuZ2V0KGZhbGxiYWNrT2JqZWN0SWQpID8/IFtdO1xuXHRcdFx0XHRcdGNvbnN0IG1hdGNoID0ga2V5cy5maW5kKChrKSA9PiBzYW1lVGltZShrLnRpbWUsIHN0YXRlLmN1cnJlbnRUaW1lKSkgPz8ga2V5c1swXTtcblx0XHRcdFx0XHRpZiAobWF0Y2gpIHRhcmdldHMgPSBbeyBvYmplY3RJZDogZmFsbGJhY2tPYmplY3RJZCwgdGltZTogbWF0Y2gudGltZSB9XTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXRhcmdldHMubGVuZ3RoKSByZXR1cm4gc3RhdGU7XG5cblx0XHRcdFx0Y29uc3QgbWluVGltZSA9IE1hdGgubWluKC4uLnRhcmdldHMubWFwKCh0KSA9PiB0LnRpbWUpKTtcblx0XHRcdFx0Y29uc3QgY2xpcGJvYXJkOiBDb3BpZWRLZXlmcmFtZVtdID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgdGFyZ2V0IG9mIHRhcmdldHMpIHtcblx0XHRcdFx0XHRjb25zdCBrZXlzID0gc3RhdGUua2V5ZnJhbWVzLmdldCh0YXJnZXQub2JqZWN0SWQpID8/IFtdO1xuXHRcdFx0XHRcdGNvbnN0IHBvc2UgPSBrZXlzLmZpbmQoKGspID0+IHNhbWVUaW1lKGsudGltZSwgdGFyZ2V0LnRpbWUpKTtcblx0XHRcdFx0XHRpZiAoIXBvc2UpIGNvbnRpbnVlO1xuXHRcdFx0XHRcdGNvbnN0IGNoYW5uZWxzOiBSZWNvcmQ8c3RyaW5nLCBCZXpUcmlwbGU+ID0ge307XG5cdFx0XHRcdFx0Y29uc3QgZW50cnkgPSBzdGF0ZS5jdXJ2ZXMuZ2V0KHRhcmdldC5vYmplY3RJZCk7XG5cdFx0XHRcdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IFtwYXRoLCBjdXJ2ZV0gb2YgZW50cnkpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgayA9IGN1cnZlLmtleXMuZmluZCgoY2spID0+IHNhbWVUaW1lKGNrLnRpbWUsIHRhcmdldC50aW1lKSk7XG5cdFx0XHRcdFx0XHRcdGlmIChrKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y2hhbm5lbHNbcGF0aF0gPSB7XG5cdFx0XHRcdFx0XHRcdFx0XHQuLi5rLFxuXHRcdFx0XHRcdFx0XHRcdFx0aGFuZGxlTGVmdDogW2suaGFuZGxlTGVmdFswXSwgay5oYW5kbGVMZWZ0WzFdXSxcblx0XHRcdFx0XHRcdFx0XHRcdGhhbmRsZVJpZ2h0OiBbay5oYW5kbGVSaWdodFswXSwgay5oYW5kbGVSaWdodFsxXV0sXG5cdFx0XHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjbGlwYm9hcmQucHVzaCh7XG5cdFx0XHRcdFx0XHRvYmplY3RJZDogdGFyZ2V0Lm9iamVjdElkLFxuXHRcdFx0XHRcdFx0b2Zmc2V0OiByb3VuZFRpbWUocG9zZS50aW1lIC0gbWluVGltZSksXG5cdFx0XHRcdFx0XHRwb3NlOiB7XG5cdFx0XHRcdFx0XHRcdC4uLnBvc2UsXG5cdFx0XHRcdFx0XHRcdHBvc2l0aW9uOiBbLi4ucG9zZS5wb3NpdGlvbl0sXG5cdFx0XHRcdFx0XHRcdHJvdGF0aW9uOiBbLi4ucG9zZS5yb3RhdGlvbl0sXG5cdFx0XHRcdFx0XHRcdHNjYWxlOiBbLi4ucG9zZS5zY2FsZV0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0Y2hhbm5lbHMsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0c3RhdGUuY2xpcGJvYXJkS2V5cyA9IGNsaXBib2FyZDtcblx0XHRcdFx0Y29waWVkQ291bnQgPSBjbGlwYm9hcmQubGVuZ3RoO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiBjb3BpZWRDb3VudDtcblx0XHR9LFxuXG5cdFx0LyoqIFBhc3RlcyBjb3BpZWQga2V5ZnJhbWVzIHN0YXJ0aW5nIGF0IGBjdXJyZW50VGltZWAgKG9udG8gYHRhcmdldE9iamVjdElkYCBpZiBzaW5nbGUtb2JqZWN0IGNsaXBib2FyZCkuICovXG5cdFx0cGFzdGVLZXlzQXRQbGF5aGVhZDogKHRhcmdldE9iamVjdElkPzogc3RyaW5nKTogbnVtYmVyID0+IHtcblx0XHRcdGxldCBwYXN0ZWRDb3VudCA9IDA7XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGlmICghc3RhdGUuY2xpcGJvYXJkS2V5cy5sZW5ndGgpIHJldHVybiBzdGF0ZTtcblx0XHRcdFx0Y29uc3Qgc291cmNlT2JqZWN0cyA9IG5ldyBTZXQoc3RhdGUuY2xpcGJvYXJkS2V5cy5tYXAoKGMpID0+IGMub2JqZWN0SWQpKTtcblx0XHRcdFx0Y29uc3QgcmVtYXBTaW5nbGUgPSBCb29sZWFuKHRhcmdldE9iamVjdElkICYmIHNvdXJjZU9iamVjdHMuc2l6ZSA9PT0gMSk7XG5cdFx0XHRcdGNvbnN0IG5ld1NlbGVjdGlvbnM6IEtleWZyYW1lU2VsZWN0aW9uW10gPSBbXTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2Ygc3RhdGUuY2xpcGJvYXJkS2V5cykge1xuXHRcdFx0XHRcdGNvbnN0IGRlc3RPYmpJZCA9IHJlbWFwU2luZ2xlID8gdGFyZ2V0T2JqZWN0SWQhIDogaXRlbS5vYmplY3RJZDtcblx0XHRcdFx0XHRpZiAoc3RhdGUudHJhY2tzLmdldChkZXN0T2JqSWQpPy5sb2NrZWQpIGNvbnRpbnVlO1xuXHRcdFx0XHRcdGNvbnN0IHJhd1RpbWUgPSBjbGFtcChzdGF0ZS5jdXJyZW50VGltZSArIGl0ZW0ub2Zmc2V0LCAwLCBzdGF0ZS5kdXJhdGlvbik7XG5cdFx0XHRcdFx0Y29uc3QgdGltZSA9IHN0YXRlLnNuYXBUb0ZyYW1lc1xuXHRcdFx0XHRcdFx0PyBmcmFtZVRvVGltZSh0aW1lVG9GcmFtZShyYXdUaW1lLCBzdGF0ZS5mcmFtZVJhdGUpLCBzdGF0ZS5mcmFtZVJhdGUpXG5cdFx0XHRcdFx0XHQ6IHJvdW5kVGltZShyYXdUaW1lKTtcblx0XHRcdFx0XHRjb25zdCBrZXlzID0gc3RhdGUua2V5ZnJhbWVzLmdldChkZXN0T2JqSWQpID8/IFtdO1xuXHRcdFx0XHRcdGNvbnN0IGV4aXN0aW5nSWR4ID0ga2V5cy5maW5kSW5kZXgoKGspID0+IHNhbWVUaW1lKGsudGltZSwgdGltZSkpO1xuXHRcdFx0XHRcdGNvbnN0IHBvc2U6IEtleWZyYW1lRGF0YSA9IHtcblx0XHRcdFx0XHRcdC4uLml0ZW0ucG9zZSxcblx0XHRcdFx0XHRcdHRpbWUsXG5cdFx0XHRcdFx0XHRwb3NpdGlvbjogWy4uLml0ZW0ucG9zZS5wb3NpdGlvbl0sXG5cdFx0XHRcdFx0XHRyb3RhdGlvbjogWy4uLml0ZW0ucG9zZS5yb3RhdGlvbl0sXG5cdFx0XHRcdFx0XHRzY2FsZTogWy4uLml0ZW0ucG9zZS5zY2FsZV0sXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRpZiAoZXhpc3RpbmdJZHggPj0gMCkga2V5c1tleGlzdGluZ0lkeF0gPSBwb3NlO1xuXHRcdFx0XHRcdGVsc2Uga2V5cy5wdXNoKHBvc2UpO1xuXHRcdFx0XHRcdGtleXMuc29ydCgoYSwgYikgPT4gYS50aW1lIC0gYi50aW1lKTtcblx0XHRcdFx0XHRzdGF0ZS5rZXlmcmFtZXMuc2V0KGRlc3RPYmpJZCwga2V5cyk7XG5cblx0XHRcdFx0XHRjb25zdCByZWYgPSByZWZlcmVuY2VRdWF0ZXJuaW9uKHN0YXRlLmN1cnZlcywgZGVzdE9iaklkLCB0aW1lKTtcblx0XHRcdFx0XHR3cml0ZVRyYW5zZm9ybUNoYW5uZWxzKHN0YXRlLmN1cnZlcywgZGVzdE9iaklkLCBwb3NlLCByZWYsIGl0ZW0ucG9zZS5pbnRlcnBvbGF0aW9uKTtcblx0XHRcdFx0XHRjb25zdCBlbnRyeSA9IGVuc3VyZUN1cnZlcyhzdGF0ZS5jdXJ2ZXMsIGRlc3RPYmpJZCk7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBbcGF0aCwgYmV6XSBvZiBPYmplY3QuZW50cmllcyhpdGVtLmNoYW5uZWxzKSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgY3VydmUgPSBlbnN1cmVDdXJ2ZShlbnRyeSwgcGF0aCk7XG5cdFx0XHRcdFx0XHRjb25zdCBpbnNlcnRlZCA9IGN1cnZlLmluc2VydCh0aW1lLCBiZXoudmFsdWUsIGJlei5pbnRlcnBvbGF0aW9uKTtcblx0XHRcdFx0XHRcdGluc2VydGVkLmhhbmRsZUxlZnQgPSBbYmV6LmhhbmRsZUxlZnRbMF0sIGJlei5oYW5kbGVMZWZ0WzFdXTtcblx0XHRcdFx0XHRcdGluc2VydGVkLmhhbmRsZVJpZ2h0ID0gW2Jlei5oYW5kbGVSaWdodFswXSwgYmV6LmhhbmRsZVJpZ2h0WzFdXTtcblx0XHRcdFx0XHRcdGluc2VydGVkLmF1dG9MZWZ0ID0gYmV6LmF1dG9MZWZ0O1xuXHRcdFx0XHRcdFx0aW5zZXJ0ZWQuYXV0b1JpZ2h0ID0gYmV6LmF1dG9SaWdodDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bmV3U2VsZWN0aW9ucy5wdXNoKHsgb2JqZWN0SWQ6IGRlc3RPYmpJZCwgdGltZSB9KTtcblx0XHRcdFx0XHRwYXN0ZWRDb3VudCsrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChuZXdTZWxlY3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRcdHN0YXRlLnNlbGVjdGVkS2V5cyA9IG5ld1NlbGVjdGlvbnM7XG5cdFx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRLZXkgPSB7IC4uLm5ld1NlbGVjdGlvbnNbbmV3U2VsZWN0aW9ucy5sZW5ndGggLSAxXSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHBhc3RlZENvdW50O1xuXHRcdH0sXG5cblx0XHQvKiogSnVtcHMgdG8gdGhlIHByZXZpb3VzIGtleWZyYW1lIGJlZm9yZSBgY3VycmVudFRpbWVgLiAqL1xuXHRcdHByZXZLZXlmcmFtZTogKG9iamVjdElkPzogc3RyaW5nKTogbnVtYmVyIHwgbnVsbCA9PiB7XG5cdFx0XHRsZXQgZm91bmRUaW1lOiBudW1iZXIgfCBudWxsID0gbnVsbDtcblx0XHRcdGxldCBmb3VuZE9iajogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGZvciAoY29uc3QgW29pZCwga2V5c10gb2Ygc3RhdGUua2V5ZnJhbWVzKSB7XG5cdFx0XHRcdFx0aWYgKG9iamVjdElkICYmIG9pZCAhPT0gb2JqZWN0SWQpIGNvbnRpbnVlO1xuXHRcdFx0XHRcdGlmIChzdGF0ZS50cmFja3MuZ2V0KG9pZCk/LmhpZGRlbikgY29udGludWU7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBrIG9mIGtleXMpIHtcblx0XHRcdFx0XHRcdGlmIChrLnRpbWUgPCBzdGF0ZS5jdXJyZW50VGltZSAtIEtFWV9FUFNJTE9OKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChmb3VuZFRpbWUgPT09IG51bGwgfHwgay50aW1lID4gZm91bmRUaW1lKSB7XG5cdFx0XHRcdFx0XHRcdFx0Zm91bmRUaW1lID0gay50aW1lO1xuXHRcdFx0XHRcdFx0XHRcdGZvdW5kT2JqID0gb2lkO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChmb3VuZFRpbWUgIT09IG51bGwgJiYgZm91bmRPYmogIT09IG51bGwpIHtcblx0XHRcdFx0XHRzdGF0ZS5jdXJyZW50VGltZSA9IGZvdW5kVGltZTtcblx0XHRcdFx0XHRzdGF0ZS5zZWxlY3RlZEtleSA9IHsgb2JqZWN0SWQ6IGZvdW5kT2JqLCB0aW1lOiBmb3VuZFRpbWUgfTtcblx0XHRcdFx0XHRzdGF0ZS5zZWxlY3RlZEtleXMgPSBbeyBvYmplY3RJZDogZm91bmRPYmosIHRpbWU6IGZvdW5kVGltZSB9XTtcblx0XHRcdFx0XHRzdGF0ZS5wbGF5aW5nID0gZmFsc2U7XG5cdFx0XHRcdFx0c3RvcENsb2NrKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gZm91bmRUaW1lO1xuXHRcdH0sXG5cblx0XHQvKiogSnVtcHMgdG8gdGhlIG5leHQga2V5ZnJhbWUgYWZ0ZXIgYGN1cnJlbnRUaW1lYC4gKi9cblx0XHRuZXh0S2V5ZnJhbWU6IChvYmplY3RJZD86IHN0cmluZyk6IG51bWJlciB8IG51bGwgPT4ge1xuXHRcdFx0bGV0IGZvdW5kVGltZTogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5cdFx0XHRsZXQgZm91bmRPYmo6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtvaWQsIGtleXNdIG9mIHN0YXRlLmtleWZyYW1lcykge1xuXHRcdFx0XHRcdGlmIChvYmplY3RJZCAmJiBvaWQgIT09IG9iamVjdElkKSBjb250aW51ZTtcblx0XHRcdFx0XHRpZiAoc3RhdGUudHJhY2tzLmdldChvaWQpPy5oaWRkZW4pIGNvbnRpbnVlO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgayBvZiBrZXlzKSB7XG5cdFx0XHRcdFx0XHRpZiAoay50aW1lID4gc3RhdGUuY3VycmVudFRpbWUgKyBLRVlfRVBTSUxPTikge1xuXHRcdFx0XHRcdFx0XHRpZiAoZm91bmRUaW1lID09PSBudWxsIHx8IGsudGltZSA8IGZvdW5kVGltZSkge1xuXHRcdFx0XHRcdFx0XHRcdGZvdW5kVGltZSA9IGsudGltZTtcblx0XHRcdFx0XHRcdFx0XHRmb3VuZE9iaiA9IG9pZDtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZm91bmRUaW1lICE9PSBudWxsICYmIGZvdW5kT2JqICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0c3RhdGUuY3VycmVudFRpbWUgPSBmb3VuZFRpbWU7XG5cdFx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRLZXkgPSB7IG9iamVjdElkOiBmb3VuZE9iaiwgdGltZTogZm91bmRUaW1lIH07XG5cdFx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRLZXlzID0gW3sgb2JqZWN0SWQ6IGZvdW5kT2JqLCB0aW1lOiBmb3VuZFRpbWUgfV07XG5cdFx0XHRcdFx0c3RhdGUucGxheWluZyA9IGZhbHNlO1xuXHRcdFx0XHRcdHN0b3BDbG9jaygpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIGZvdW5kVGltZTtcblx0XHR9LFxuXG5cdFx0c2hpZnRMYXllcjogKG9iamVjdElkOiBzdHJpbmcsIGRlbHRhOiBudW1iZXIpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGlmIChzdGF0ZS50cmFja3MuZ2V0KG9iamVjdElkKT8ubG9ja2VkKSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdGNvbnN0IGtleXMgPSBzdGF0ZS5rZXlmcmFtZXMuZ2V0KG9iamVjdElkKSA/PyBbXTtcblx0XHRcdFx0Y29uc3Qgc3RyaXBzID0gc3RhdGUuc3RyaXBzLmZpbHRlcigoc3RyaXApID0+IHN0cmlwLm9iamVjdElkID09PSBvYmplY3RJZCk7XG5cdFx0XHRcdGlmICgoIWtleXMubGVuZ3RoICYmICFzdHJpcHMubGVuZ3RoKSB8fCAhTnVtYmVyLmlzRmluaXRlKGRlbHRhKSkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRsZXQgZmlyc3QgPSBJbmZpbml0eTtcblx0XHRcdFx0bGV0IGxhc3QgPSAtSW5maW5pdHk7XG5cdFx0XHRcdGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcblx0XHRcdFx0XHRmaXJzdCA9IE1hdGgubWluKGZpcnN0LCBrZXkudGltZSk7XG5cdFx0XHRcdFx0bGFzdCA9IE1hdGgubWF4KGxhc3QsIGtleS50aW1lKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IHN0cmlwIG9mIHN0cmlwcykge1xuXHRcdFx0XHRcdGZpcnN0ID0gTWF0aC5taW4oZmlyc3QsIHN0cmlwLnN0YXJ0KTtcblx0XHRcdFx0XHRsYXN0ID0gTWF0aC5tYXgobGFzdCwgc3RyaXAuZW5kKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBzaGlmdCA9IGNsYW1wKGRlbHRhLCAtZmlyc3QsIHN0YXRlLmR1cmF0aW9uIC0gbGFzdCk7XG5cdFx0XHRcdGlmIChNYXRoLmFicyhzaGlmdCkgPCAxZS02KSByZXR1cm4gc3RhdGU7XG5cblx0XHRcdFx0Y29uc3QgbW92ZWQgPSBrZXlzXG5cdFx0XHRcdFx0Lm1hcCgoa2V5KSA9PiAoeyAuLi5rZXksIHRpbWU6IHJvdW5kVGltZShjbGFtcChrZXkudGltZSArIHNoaWZ0LCAwLCBzdGF0ZS5kdXJhdGlvbikpIH0pKVxuXHRcdFx0XHRcdC5zb3J0KChhLCBiKSA9PiBhLnRpbWUgLSBiLnRpbWUpO1xuXHRcdFx0XHRzdGF0ZS5rZXlmcmFtZXMuc2V0KG9iamVjdElkLCBtb3ZlZCk7XG5cblx0XHRcdFx0Y29uc3QgZW50cnkgPSBzdGF0ZS5jdXJ2ZXMuZ2V0KG9iamVjdElkKTtcblx0XHRcdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBjdXJ2ZSBvZiBlbnRyeS52YWx1ZXMoKSkge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgY3VydmUua2V5cykga2V5LnRpbWUgPSByb3VuZFRpbWUoY2xhbXAoa2V5LnRpbWUgKyBzaGlmdCwgMCwgc3RhdGUuZHVyYXRpb24pKTtcblx0XHRcdFx0XHRcdGN1cnZlLmtleXMuc29ydCgoYSwgYikgPT4gYS50aW1lIC0gYi50aW1lKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRmb3IgKGNvbnN0IHN0cmlwIG9mIHN0cmlwcykge1xuXHRcdFx0XHRcdHN0cmlwLnN0YXJ0ID0gcm91bmRUaW1lKGNsYW1wKHN0cmlwLnN0YXJ0ICsgc2hpZnQsIDAsIHN0YXRlLmR1cmF0aW9uKSk7XG5cdFx0XHRcdFx0c3RyaXAuZW5kID0gcm91bmRUaW1lKGNsYW1wKHN0cmlwLmVuZCArIHNoaWZ0LCAwLCBzdGF0ZS5kdXJhdGlvbikpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHN0YXRlLnNlbGVjdGVkS2V5Py5vYmplY3RJZCA9PT0gb2JqZWN0SWQpIHtcblx0XHRcdFx0XHRzdGF0ZS5zZWxlY3RlZEtleSA9IHtcblx0XHRcdFx0XHRcdG9iamVjdElkLFxuXHRcdFx0XHRcdFx0dGltZTogcm91bmRUaW1lKGNsYW1wKHN0YXRlLnNlbGVjdGVkS2V5LnRpbWUgKyBzaGlmdCwgMCwgc3RhdGUuZHVyYXRpb24pKSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHN0YXRlLnNlbGVjdGVkS2V5cyA9IHN0YXRlLnNlbGVjdGVkS2V5cy5tYXAoKHNlbCkgPT5cblx0XHRcdFx0XHRzZWwub2JqZWN0SWQgPT09IG9iamVjdElkXG5cdFx0XHRcdFx0XHQ/IHsgb2JqZWN0SWQsIHRpbWU6IHJvdW5kVGltZShjbGFtcChzZWwudGltZSArIHNoaWZ0LCAwLCBzdGF0ZS5kdXJhdGlvbikpIH1cblx0XHRcdFx0XHRcdDogc2VsLFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblxuXHRcdC8qKiBQbGFjZXMgYSBsYXllciBvbiB0aGUgdGltZWxpbmUuIFRoZSBjbGlwIGlzIHRoZSByZWFsIGxpZmV0aW1lIHdpbmRvdy4gKi9cblx0XHRzZXRDbGlwOiAob2JqZWN0SWQ6IHN0cmluZywgc3RhcnQ6IG51bWJlciwgZW5kOiBudW1iZXIpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGlmIChzdGF0ZS50cmFja3MuZ2V0KG9iamVjdElkKT8ubG9ja2VkKSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdGNvbnN0IGZyb20gPSByb3VuZFRpbWUoY2xhbXAoTWF0aC5taW4oc3RhcnQsIGVuZCksIDAsIHN0YXRlLmR1cmF0aW9uKSk7XG5cdFx0XHRcdGNvbnN0IHRvID0gcm91bmRUaW1lKGNsYW1wKE1hdGgubWF4KHN0YXJ0LCBlbmQpLCAwLCBzdGF0ZS5kdXJhdGlvbikpO1xuXHRcdFx0XHRpZiAodG8gLSBmcm9tIDwgMC4xKSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdHN0YXRlLmNsaXBzLnNldChvYmplY3RJZCwgeyBzdGFydDogZnJvbSwgZW5kOiB0byB9KTtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cblx0XHQvKiogU2xpZGVzIGEgY2xpcCBpbiB0aW1lLCBjbGFtcGVkIHRvIHRoZSB0aW1lbGluZSBsaWtlIGBzaGlmdExheWVyYC4gKi9cblx0XHRzaGlmdENsaXA6IChvYmplY3RJZDogc3RyaW5nLCBkZWx0YTogbnVtYmVyKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRpZiAoc3RhdGUudHJhY2tzLmdldChvYmplY3RJZCk/LmxvY2tlZCkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRjb25zdCBjbGlwID0gc3RhdGUuY2xpcHMuZ2V0KG9iamVjdElkKTtcblx0XHRcdFx0aWYgKCFjbGlwIHx8ICFOdW1iZXIuaXNGaW5pdGUoZGVsdGEpKSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdGNvbnN0IHNoaWZ0ID0gY2xhbXAoZGVsdGEsIC1jbGlwLnN0YXJ0LCBzdGF0ZS5kdXJhdGlvbiAtIGNsaXAuZW5kKTtcblx0XHRcdFx0aWYgKE1hdGguYWJzKHNoaWZ0KSA8IDFlLTYpIHJldHVybiBzdGF0ZTtcblx0XHRcdFx0c3RhdGUuY2xpcHMuc2V0KG9iamVjdElkLCB7XG5cdFx0XHRcdFx0c3RhcnQ6IHJvdW5kVGltZShjbGFtcChjbGlwLnN0YXJ0ICsgc2hpZnQsIDAsIHN0YXRlLmR1cmF0aW9uKSksXG5cdFx0XHRcdFx0ZW5kOiByb3VuZFRpbWUoY2xhbXAoY2xpcC5lbmQgKyBzaGlmdCwgMCwgc3RhdGUuZHVyYXRpb24pKSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXG5cdFx0LyoqIFNldHMgdGhlIHBsYXliYWNrIHNwZWVkIG9mIHRoZSBsYXllci9jbGlwLCBzY2FsaW5nIGl0cyBkdXJhdGlvbiBhbmQga2V5ZnJhbWVzIHByb3BvcnRpb25hbGx5LiAqL1xuXHRcdHNldExheWVyU3BlZWQ6IChvYmplY3RJZDogc3RyaW5nLCBtdWx0aXBsaWVyOiBudW1iZXIpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGlmIChzdGF0ZS50cmFja3MuZ2V0KG9iamVjdElkKT8ubG9ja2VkKSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdGNvbnN0IG11bHQgPSBjbGFtcChtdWx0aXBsaWVyLCAwLjEsIDEwKTtcblx0XHRcdFx0Y29uc3QgY2xpcCA9IHN0YXRlLmNsaXBzLmdldChvYmplY3RJZCkgPz8geyBzdGFydDogMCwgZW5kOiAxNSB9O1xuXHRcdFx0XHRjb25zdCBvcmlnRHVyYXRpb24gPSBNYXRoLm1heCgwLjEsIGNsaXAuZW5kIC0gY2xpcC5zdGFydCk7XG5cdFx0XHRcdGNvbnN0IG5ld0R1cmF0aW9uID0gY2xhbXAob3JpZ0R1cmF0aW9uIC8gbXVsdCwgMC4xLCBNQVhfVElNRUxJTkVfU0VDT05EUyk7XG5cdFx0XHRcdGNvbnN0IG5ld0VuZCA9IGNsYW1wKHJvdW5kVGltZShjbGlwLnN0YXJ0ICsgbmV3RHVyYXRpb24pLCBjbGlwLnN0YXJ0ICsgMC4xLCBzdGF0ZS5kdXJhdGlvbik7XG5cdFx0XHRcdHN0YXRlLmNsaXBzLnNldChvYmplY3RJZCwgeyBzdGFydDogY2xpcC5zdGFydCwgZW5kOiBuZXdFbmQgfSk7XG5cblx0XHRcdFx0Y29uc3Qga2V5cyA9IHN0YXRlLmtleWZyYW1lcy5nZXQob2JqZWN0SWQpO1xuXHRcdFx0XHRpZiAoa2V5cyAmJiBrZXlzLmxlbmd0aCkge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgayBvZiBrZXlzKSB7XG5cdFx0XHRcdFx0XHRpZiAoay50aW1lID49IGNsaXAuc3RhcnQgLSBLRVlfRVBTSUxPTikge1xuXHRcdFx0XHRcdFx0XHRrLnRpbWUgPSByb3VuZFRpbWUoY2xhbXAoY2xpcC5zdGFydCArIChrLnRpbWUgLSBjbGlwLnN0YXJ0KSAvIG11bHQsIDAsIHN0YXRlLmR1cmF0aW9uKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGtleXMuc29ydCgoYSwgYikgPT4gYS50aW1lIC0gYi50aW1lKTtcblx0XHRcdFx0XHRjb25zdCBlbnRyeSA9IHN0YXRlLmN1cnZlcy5nZXQob2JqZWN0SWQpO1xuXHRcdFx0XHRcdGlmIChlbnRyeSkge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBjdXJ2ZSBvZiBlbnRyeS52YWx1ZXMoKSkge1xuXHRcdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGsgb2YgY3VydmUua2V5cykge1xuXHRcdFx0XHRcdFx0XHRcdGlmIChrLnRpbWUgPj0gY2xpcC5zdGFydCAtIEtFWV9FUFNJTE9OKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRrLnRpbWUgPSByb3VuZFRpbWUoY2xhbXAoY2xpcC5zdGFydCArIChrLnRpbWUgLSBjbGlwLnN0YXJ0KSAvIG11bHQsIDAsIHN0YXRlLmR1cmF0aW9uKSk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGN1cnZlLmtleXMuc29ydCgoYSwgYikgPT4gYS50aW1lIC0gYi50aW1lKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRmb3IgKGNvbnN0IHN0cmlwIG9mIHN0YXRlLnN0cmlwcykge1xuXHRcdFx0XHRcdGlmIChzdHJpcC5vYmplY3RJZCA9PT0gb2JqZWN0SWQpIHtcblx0XHRcdFx0XHRcdHN0cmlwLnNwZWVkID0gbXVsdDtcblx0XHRcdFx0XHRcdHN0cmlwLmVuZCA9IHJvdW5kVGltZShjbGFtcChzdHJpcC5zdGFydCArIChzdHJpcC5lbmQgLSBzdHJpcC5zdGFydCkgLyBtdWx0LCBzdHJpcC5zdGFydCArIDAuMSwgc3RhdGUuZHVyYXRpb24pKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cblx0XHQvKiogUmV2ZXJzZXMgdGhlIGtleWZyYW1lcyAvIG1vdGlvbiBvZiB0aGUgbGF5ZXIgd2l0aGluIGl0cyBhY3RpdmUgY2xpcCByYW5nZS4gKi9cblx0XHRyZXZlcnNlTGF5ZXI6IChvYmplY3RJZDogc3RyaW5nKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRpZiAoc3RhdGUudHJhY2tzLmdldChvYmplY3RJZCk/LmxvY2tlZCkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRjb25zdCBjbGlwID0gc3RhdGUuY2xpcHMuZ2V0KG9iamVjdElkKSA/PyB7IHN0YXJ0OiAwLCBlbmQ6IDE1IH07XG5cdFx0XHRcdGNvbnN0IGtleXMgPSBzdGF0ZS5rZXlmcmFtZXMuZ2V0KG9iamVjdElkKTtcblx0XHRcdFx0aWYgKGtleXMgJiYga2V5cy5sZW5ndGgpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGsgb2Yga2V5cykge1xuXHRcdFx0XHRcdFx0aWYgKGsudGltZSA+PSBjbGlwLnN0YXJ0IC0gS0VZX0VQU0lMT04gJiYgay50aW1lIDw9IGNsaXAuZW5kICsgS0VZX0VQU0lMT04pIHtcblx0XHRcdFx0XHRcdFx0ay50aW1lID0gcm91bmRUaW1lKGNsYW1wKGNsaXAuc3RhcnQgKyBjbGlwLmVuZCAtIGsudGltZSwgMCwgc3RhdGUuZHVyYXRpb24pKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0a2V5cy5zb3J0KChhLCBiKSA9PiBhLnRpbWUgLSBiLnRpbWUpO1xuXHRcdFx0XHRcdGNvbnN0IGVudHJ5ID0gc3RhdGUuY3VydmVzLmdldChvYmplY3RJZCk7XG5cdFx0XHRcdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGN1cnZlIG9mIGVudHJ5LnZhbHVlcygpKSB7XG5cdFx0XHRcdFx0XHRcdGZvciAoY29uc3QgayBvZiBjdXJ2ZS5rZXlzKSB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGsudGltZSA+PSBjbGlwLnN0YXJ0IC0gS0VZX0VQU0lMT04gJiYgay50aW1lIDw9IGNsaXAuZW5kICsgS0VZX0VQU0lMT04pIHtcblx0XHRcdFx0XHRcdFx0XHRcdGsudGltZSA9IHJvdW5kVGltZShjbGFtcChjbGlwLnN0YXJ0ICsgY2xpcC5lbmQgLSBrLnRpbWUsIDAsIHN0YXRlLmR1cmF0aW9uKSk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGN1cnZlLmtleXMuc29ydCgoYSwgYikgPT4gYS50aW1lIC0gYi50aW1lKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRmb3IgKGNvbnN0IHN0cmlwIG9mIHN0YXRlLnN0cmlwcykge1xuXHRcdFx0XHRcdGlmIChzdHJpcC5vYmplY3RJZCA9PT0gb2JqZWN0SWQpIHtcblx0XHRcdFx0XHRcdHN0cmlwLnJldmVyc2VkID0gIXN0cmlwLnJldmVyc2VkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblxuXHRcdC8qKiBGcmVlemVzIHBsYXliYWNrL21vdGlvbiBhdCBgYXRUaW1lYCBmb3IgYGZyZWV6ZUR1cmF0aW9uYCBzZWNvbmRzLCBjcmVhdGluZyBhIGZyZWV6ZSBmcmFtZSBob2xkLiAqL1xuXHRcdGZyZWV6ZUxheWVyOiAob2JqZWN0SWQ6IHN0cmluZywgYXRUaW1lPzogbnVtYmVyLCBmcmVlemVEdXJhdGlvbiA9IDIuMCkgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0aWYgKHN0YXRlLnRyYWNrcy5nZXQob2JqZWN0SWQpPy5sb2NrZWQpIHJldHVybiBzdGF0ZTtcblx0XHRcdFx0Y29uc3QgdCA9IGF0VGltZSAhPT0gdW5kZWZpbmVkID8gYXRUaW1lIDogc3RhdGUuY3VycmVudFRpbWU7XG5cdFx0XHRcdGNvbnN0IGR1ciA9IGNsYW1wKGZyZWV6ZUR1cmF0aW9uLCAwLjIsIDMwKTtcblx0XHRcdFx0Y29uc3QgY2xpcCA9IHN0YXRlLmNsaXBzLmdldChvYmplY3RJZCkgPz8geyBzdGFydDogMCwgZW5kOiAxNSB9O1xuXHRcdFx0XHRzdGF0ZS5jbGlwcy5zZXQob2JqZWN0SWQsIHsgc3RhcnQ6IGNsaXAuc3RhcnQsIGVuZDogY2xhbXAoY2xpcC5lbmQgKyBkdXIsIDAsIHN0YXRlLmR1cmF0aW9uKSB9KTtcblxuXHRcdFx0XHRjb25zdCBrZXlzID0gc3RhdGUua2V5ZnJhbWVzLmdldChvYmplY3RJZCkgPz8gW107XG5cdFx0XHRcdGZvciAoY29uc3QgayBvZiBrZXlzKSB7XG5cdFx0XHRcdFx0aWYgKGsudGltZSA+IHQgKyBLRVlfRVBTSUxPTikge1xuXHRcdFx0XHRcdFx0ay50aW1lID0gcm91bmRUaW1lKGNsYW1wKGsudGltZSArIGR1ciwgMCwgc3RhdGUuZHVyYXRpb24pKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZW50cnkgPSBzdGF0ZS5jdXJ2ZXMuZ2V0KG9iamVjdElkKTtcblx0XHRcdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBjdXJ2ZSBvZiBlbnRyeS52YWx1ZXMoKSkge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBrIG9mIGN1cnZlLmtleXMpIHtcblx0XHRcdFx0XHRcdFx0aWYgKGsudGltZSA+IHQgKyBLRVlfRVBTSUxPTikge1xuXHRcdFx0XHRcdFx0XHRcdGsudGltZSA9IHJvdW5kVGltZShjbGFtcChrLnRpbWUgKyBkdXIsIDAsIHN0YXRlLmR1cmF0aW9uKSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGN1cnZlLmtleXMuc29ydCgoYSwgYikgPT4gYS50aW1lIC0gYi50aW1lKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBTYW1wbGUgcG9zZSBhdCB0IGFuZCBpbnNlcnQgY29uc3RhbnQgaG9sZCBrZXkgYXQgdCArIGR1clxuXHRcdFx0XHRpZiAoa2V5cy5sZW5ndGgpIHtcblx0XHRcdFx0XHRjb25zdCBwcmV2S2V5ID0ga2V5cy5zbGljZSgpLnJldmVyc2UoKS5maW5kKChrKSA9PiBrLnRpbWUgPD0gdCArIEtFWV9FUFNJTE9OKSA/PyBrZXlzWzBdO1xuXHRcdFx0XHRcdGNvbnN0IGhvbGRQb3NlOiBLZXlmcmFtZURhdGEgPSB7XG5cdFx0XHRcdFx0XHR0aW1lOiByb3VuZFRpbWUoY2xhbXAodCArIGR1ciwgMCwgc3RhdGUuZHVyYXRpb24pKSxcblx0XHRcdFx0XHRcdHBvc2l0aW9uOiBbLi4ucHJldktleS5wb3NpdGlvbl0sXG5cdFx0XHRcdFx0XHRyb3RhdGlvbjogWy4uLnByZXZLZXkucm90YXRpb25dLFxuXHRcdFx0XHRcdFx0c2NhbGU6IFsuLi5wcmV2S2V5LnNjYWxlXSxcblx0XHRcdFx0XHRcdGludGVycG9sYXRpb246ICdjb25zdGFudCcsXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRrZXlzLnB1c2goaG9sZFBvc2UpO1xuXHRcdFx0XHRcdGtleXMuc29ydCgoYSwgYikgPT4gYS50aW1lIC0gYi50aW1lKTtcblx0XHRcdFx0XHRjb25zdCByZWYgPSByZWZlcmVuY2VRdWF0ZXJuaW9uKHN0YXRlLmN1cnZlcywgb2JqZWN0SWQsIGhvbGRQb3NlLnRpbWUpO1xuXHRcdFx0XHRcdHdyaXRlVHJhbnNmb3JtQ2hhbm5lbHMoc3RhdGUuY3VydmVzLCBvYmplY3RJZCwgaG9sZFBvc2UsIHJlZiwgJ2NvbnN0YW50Jyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cblx0XHRyZW1vdmVLZXlmcmFtZXNGb3I6IChvYmplY3RJZDogc3RyaW5nKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRzdGF0ZS5rZXlmcmFtZXMuZGVsZXRlKG9iamVjdElkKTtcblx0XHRcdFx0c3RhdGUuY3VydmVzLmRlbGV0ZShvYmplY3RJZCk7XG5cdFx0XHRcdHN0YXRlLmNsaXBzLmRlbGV0ZShvYmplY3RJZCk7XG5cdFx0XHRcdHN0YXRlLnRyYWNrcy5kZWxldGUob2JqZWN0SWQpO1xuXHRcdFx0XHRzdGF0ZS5zdHJpcHMgPSBzdGF0ZS5zdHJpcHMuZmlsdGVyKChzdHJpcCkgPT4gc3RyaXAub2JqZWN0SWQgIT09IG9iamVjdElkKTtcblx0XHRcdFx0aWYgKHN0YXRlLnNlbGVjdGVkU3RyaXBJZCAmJiAhc3RhdGUuc3RyaXBzLnNvbWUoKHN0cmlwKSA9PiBzdHJpcC5pZCA9PT0gc3RhdGUuc2VsZWN0ZWRTdHJpcElkKSkge1xuXHRcdFx0XHRcdHN0YXRlLnNlbGVjdGVkU3RyaXBJZCA9IG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHN0YXRlLnNlbGVjdGVkS2V5Py5vYmplY3RJZCA9PT0gb2JqZWN0SWQpIHN0YXRlLnNlbGVjdGVkS2V5ID0gbnVsbDtcblx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRLZXlzID0gc3RhdGUuc2VsZWN0ZWRLZXlzLmZpbHRlcigocykgPT4gcy5vYmplY3RJZCAhPT0gb2JqZWN0SWQpO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblxuXHRcdGNsZWFyS2V5ZnJhbWVzOiAoKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRzdGF0ZS5rZXlmcmFtZXMgPSBuZXcgTWFwKCk7XG5cdFx0XHRcdHN0YXRlLmN1cnZlcyA9IG5ldyBNYXAoKTtcblx0XHRcdFx0c3RhdGUudHJhY2tzID0gbmV3IE1hcCgpO1xuXHRcdFx0XHRzdGF0ZS5zdHJpcHMgPSBbXTtcblx0XHRcdFx0c3RhdGUuY2xpcHMgPSBuZXcgTWFwKCk7XG5cdFx0XHRcdHN0YXRlLnNlbGVjdGVkU3RyaXBJZCA9IG51bGw7XG5cdFx0XHRcdHN0YXRlLnNlbGVjdGVkS2V5ID0gbnVsbDtcblx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRLZXlzID0gW107XG5cdFx0XHRcdHN0YXRlLnN0YXJ0RnJhbWUgPSAwO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblxuXHRcdHByZXZGcmFtZTogKCkgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0Y29uc3QgZnJhbWVUaW1lID0gMSAvIHN0YXRlLmZyYW1lUmF0ZTtcblx0XHRcdFx0Y29uc3Qgc3RhcnRUID0gc3RhcnRUaW1lT2Yoc3RhdGUpO1xuXHRcdFx0XHRzdGF0ZS5jdXJyZW50VGltZSA9IE1hdGgubWF4KHN0YXJ0VCwgcm91bmRUaW1lKHN0YXRlLmN1cnJlbnRUaW1lIC0gZnJhbWVUaW1lKSk7XG5cdFx0XHRcdGlmIChzdGF0ZS5wbGF5aW5nKSBhbmNob3JBdChzdGF0ZS5jdXJyZW50VGltZSk7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXG5cdFx0bmV4dEZyYW1lOiAoKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBmcmFtZVRpbWUgPSAxIC8gc3RhdGUuZnJhbWVSYXRlO1xuXHRcdFx0XHRzdGF0ZS5jdXJyZW50VGltZSA9IE1hdGgubWluKHN0YXRlLmR1cmF0aW9uLCBzdGF0ZS5jdXJyZW50VGltZSArIGZyYW1lVGltZSk7XG5cdFx0XHRcdGlmIChzdGF0ZS5wbGF5aW5nKSBhbmNob3JBdChzdGF0ZS5jdXJyZW50VGltZSk7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXG5cdFx0dGljazogKGRlbHRhPzogbnVtYmVyKTogbnVtYmVyID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gZ2V0KHRpbWVsaW5lU3RvcmUpO1xuXHRcdFx0aWYgKCFzdGF0ZS5wbGF5aW5nKSByZXR1cm4gc3RhdGUuY3VycmVudFRpbWU7XG5cdFx0XHRpZiAoc3RhdGUuaXNVc2VyU2NydWJiaW5nKSByZXR1cm4gc3RhdGUuY3VycmVudFRpbWU7XG5cdFx0XHRjb25zdCBub3cgPSBwZXJmb3JtYW5jZS5ub3coKTtcblx0XHRcdGNvbnN0IGV4cGxpY2l0ID0gdHlwZW9mIGRlbHRhID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNGaW5pdGUoZGVsdGEpO1xuXHRcdFx0bGV0IHRpbWU6IG51bWJlcjtcblx0XHRcdGlmIChleHBsaWNpdCkge1xuXHRcdFx0XHR0aW1lID0gc3RhdGUuY3VycmVudFRpbWUgKyBNYXRoLm1heCgwLCBkZWx0YSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoIWFuY2hvcmVkKSBhbmNob3JBdChzdGF0ZS5jdXJyZW50VGltZSk7XG5cdFx0XHRcdGNvbnN0IGVsYXBzZWQgPSBNYXRoLm1heCgwLCAobm93IC0gYW5jaG9yV2FsbCkgLyAxMDAwKTtcblx0XHRcdFx0aWYgKGVsYXBzZWQgPiAwLjUpIHtcblx0XHRcdFx0XHRhbmNob3JBdChzdGF0ZS5jdXJyZW50VGltZSk7XG5cdFx0XHRcdFx0cmV0dXJuIHN0YXRlLmN1cnJlbnRUaW1lO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRpbWUgPSBhbmNob3JUaW1lICsgZWxhcHNlZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZHVyYXRpb24gPSBzdGF0ZS5kdXJhdGlvbjtcblx0XHRcdGNvbnN0IHN0YXJ0VCA9IHN0YXJ0VGltZU9mKHN0YXRlKTtcblx0XHRcdGNvbnN0IHNwYW4gPSBkdXJhdGlvbiAtIHN0YXJ0VDtcblx0XHRcdGlmIChkdXJhdGlvbiA8PSAwIHx8IHNwYW4gPD0gMCkge1xuXHRcdFx0XHR1cGRhdGUoKGN1cnJlbnQpID0+IHtcblx0XHRcdFx0XHRjdXJyZW50LnBsYXlpbmcgPSBmYWxzZTtcblx0XHRcdFx0XHRjdXJyZW50LmN1cnJlbnRUaW1lID0gMDtcblx0XHRcdFx0XHRyZXR1cm4gY3VycmVudDtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHN0b3BDbG9jaygpO1xuXHRcdFx0XHRyZXR1cm4gMDtcblx0XHRcdH1cblxuXHRcdFx0bGV0IGZpbmlzaGVkID0gZmFsc2U7XG5cdFx0XHRpZiAodGltZSA+PSBkdXJhdGlvbikge1xuXHRcdFx0XHRpZiAoc3RhdGUubG9vcCkge1xuXHRcdFx0XHRcdHRpbWUgPSBzdGFydFQgKyAoKHRpbWUgLSBzdGFydFQpICUgc3Bhbik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGltZSA9IGR1cmF0aW9uO1xuXHRcdFx0XHRcdGZpbmlzaGVkID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR1cGRhdGUoKGN1cnJlbnQpID0+IHtcblx0XHRcdFx0Y3VycmVudC5jdXJyZW50VGltZSA9IHRpbWU7XG5cdFx0XHRcdGlmIChmaW5pc2hlZCkgY3VycmVudC5wbGF5aW5nID0gZmFsc2U7XG5cdFx0XHRcdHJldHVybiBjdXJyZW50O1xuXHRcdFx0fSk7XG5cdFx0XHRpZiAoZmluaXNoZWQpIHN0b3BDbG9jaygpO1xuXHRcdFx0ZWxzZSBhbmNob3JBdCh0aW1lKTtcblx0XHRcdHJldHVybiB0aW1lO1xuXHRcdH0sXG5cblx0XHRldmFsdWF0ZTogKHRpbWU6IG51bWJlciwgZWFzaW5nPzogYm9vbGVhbik6IE1hcDxzdHJpbmcsIEV2YWx1YXRlZFRyYW5zZm9ybT4gPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBnZXQodGltZWxpbmVTdG9yZSk7XG5cdFx0XHRjb25zdCB1c2VFYXNpbmcgPSBlYXNpbmcgPz8gc3RhdGUuZWFzaW5nO1xuXHRcdFx0Y29uc3QgdHJhbnNmb3JtcyA9IG5ldyBNYXA8c3RyaW5nLCBFdmFsdWF0ZWRUcmFuc2Zvcm0+KCk7XG5cdFx0XHRpZiAoIXN0YXRlLmN1cnZlcy5zaXplKSByZXR1cm4gdHJhbnNmb3Jtcztcblx0XHRcdGNvbnN0IHN0cmlwc0J5T2JqZWN0ID0gbmV3IE1hcDxzdHJpbmcsIE5sYVN0cmlwW10+KCk7XG5cdFx0XHRmb3IgKGNvbnN0IHN0cmlwIG9mIHN0YXRlLnN0cmlwcykge1xuXHRcdFx0XHRpZiAoc3RyaXAubXV0ZWQpIGNvbnRpbnVlO1xuXHRcdFx0XHRjb25zdCBsaXN0ID0gc3RyaXBzQnlPYmplY3QuZ2V0KHN0cmlwLm9iamVjdElkKTtcblx0XHRcdFx0aWYgKGxpc3QpIGxpc3QucHVzaChzdHJpcCk7XG5cdFx0XHRcdGVsc2Ugc3RyaXBzQnlPYmplY3Quc2V0KHN0cmlwLm9iamVjdElkLCBbc3RyaXBdKTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgW29iamVjdElkLCBjdXJ2ZXNdIG9mIHN0YXRlLmN1cnZlcykge1xuXHRcdFx0XHRjb25zdCB0cmFjayA9IHN0YXRlLnRyYWNrcy5nZXQob2JqZWN0SWQpO1xuXHRcdFx0XHRpZiAodHJhY2s/Lm11dGVkKSBjb250aW51ZTtcblx0XHRcdFx0Y29uc3Qgc3RyaXBzID0gc3RyaXBzQnlPYmplY3QuZ2V0KG9iamVjdElkKTtcblx0XHRcdFx0bGV0IGFjdGlvblRpbWUgPSB0aW1lO1xuXHRcdFx0XHRpZiAoc3RyaXBzPy5sZW5ndGgpIHtcblx0XHRcdFx0XHRsZXQgY292ZXJlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdGZvciAoY29uc3Qgc3RyaXAgb2Ygc3RyaXBzKSB7XG5cdFx0XHRcdFx0XHRpZiAodGltZSA+PSBzdHJpcC5zdGFydCAmJiB0aW1lIDw9IHN0cmlwLmVuZCkge1xuXHRcdFx0XHRcdFx0XHRhY3Rpb25UaW1lID0gc3RyaXBBY3Rpb25UaW1lKHN0cmlwLCB0aW1lKTtcblx0XHRcdFx0XHRcdFx0Y292ZXJlZCA9IHRydWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICghY292ZXJlZCkgY29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBwb3NpdGlvbiA9IGV2YWx1YXRlVmVjdG9yKGN1cnZlcywgJ2xvY2F0aW9uJywgYWN0aW9uVGltZSwgdXNlRWFzaW5nLCAwKTtcblx0XHRcdFx0Y29uc3QgcXVhdGVybmlvbiA9IGV2YWx1YXRlUXVhdGVybmlvbihjdXJ2ZXMsIGFjdGlvblRpbWUsIHVzZUVhc2luZyk7XG5cdFx0XHRcdGNvbnN0IHNjYWxlID0gZXZhbHVhdGVWZWN0b3IoY3VydmVzLCAnc2NhbGUnLCBhY3Rpb25UaW1lLCB1c2VFYXNpbmcsIDEpO1xuXHRcdFx0XHRjb25zdCB2aXNpYmxlID0gZXZhbHVhdGVWaXNpYmlsaXR5KGN1cnZlcywgYWN0aW9uVGltZSwgdXNlRWFzaW5nKTtcblx0XHRcdFx0aWYgKCFwb3NpdGlvbiAmJiAhcXVhdGVybmlvbiAmJiAhc2NhbGUgJiYgdmlzaWJsZSA9PT0gbnVsbCkgY29udGludWU7XG5cdFx0XHRcdHRyYW5zZm9ybXMuc2V0KG9iamVjdElkLCB7XG5cdFx0XHRcdFx0cG9zaXRpb246IHBvc2l0aW9uID8/IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRyb3RhdGlvbjogcXVhdGVybmlvbiA/IHF1YXRUb0V1bGVyKHF1YXRlcm5pb24pIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHNjYWxlOiBzY2FsZSA/PyB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Li4uKHZpc2libGUgIT09IG51bGwgPyB7IHZpc2libGUgfSA6IHt9KSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJhbnNmb3Jtcztcblx0XHR9LFxuXG5cdFx0Ly8gLS0tLSBOb24gbGluZWFyIGFjdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0XHRhZGRTdHJpcDogKG9iamVjdElkOiBzdHJpbmcsIHN0YXJ0OiBudW1iZXIsIGVuZD86IG51bWJlcikgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0Y29uc3Qga2V5cyA9IHN0YXRlLmtleWZyYW1lcy5nZXQob2JqZWN0SWQpID8/IFtdO1xuXHRcdFx0XHRjb25zdCBkdXJhdGlvbiA9IGFjdGlvbkR1cmF0aW9uKGtleXMpO1xuXHRcdFx0XHRjb25zdCBmcm9tID0gY2xhbXAoc3RhcnQsIDAsIHN0YXRlLmR1cmF0aW9uKTtcblx0XHRcdFx0Y29uc3QgdG8gPSBjbGFtcChlbmQgPz8gZnJvbSArIE1hdGgubWF4KGR1cmF0aW9uLCAxKSwgMCwgc3RhdGUuZHVyYXRpb24pO1xuXHRcdFx0XHRjb25zdCBzdHJpcDogTmxhU3RyaXAgPSB7XG5cdFx0XHRcdFx0aWQ6IG5leHRTdHJpcElkKCksXG5cdFx0XHRcdFx0b2JqZWN0SWQsXG5cdFx0XHRcdFx0bmFtZToga2V5cy5sZW5ndGggPyBgQWN0aW9uYCA6ICdTdHJpcCcsXG5cdFx0XHRcdFx0c3RhcnQ6IE1hdGgubWluKGZyb20sIHRvKSxcblx0XHRcdFx0XHRlbmQ6IE1hdGgubWF4KGZyb20sIHRvKSxcblx0XHRcdFx0XHRhY3Rpb25TdGFydDogMCxcblx0XHRcdFx0XHRhY3Rpb25FbmQ6IE1hdGgubWF4KGR1cmF0aW9uLCAxKSxcblx0XHRcdFx0XHRzcGVlZDogMSxcblx0XHRcdFx0XHRyZXZlcnNlZDogZmFsc2UsXG5cdFx0XHRcdFx0ZnJvemVuOiBmYWxzZSxcblx0XHRcdFx0XHRtdXRlZDogZmFsc2UsXG5cdFx0XHRcdH07XG5cdFx0XHRcdHN0YXRlLnN0cmlwcy5wdXNoKHN0cmlwKTtcblx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRTdHJpcElkID0gc3RyaXAuaWQ7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXG5cdFx0dXBkYXRlU3RyaXA6IChpZDogc3RyaW5nLCBwYXRjaDogUGFydGlhbDxObGFTdHJpcD4pID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHN0cmlwID0gc3RhdGUuc3RyaXBzLmZpbmQoKGl0ZW0pID0+IGl0ZW0uaWQgPT09IGlkKTtcblx0XHRcdFx0aWYgKCFzdHJpcCkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRPYmplY3QuYXNzaWduKHN0cmlwLCBwYXRjaCk7XG5cdFx0XHRcdHN0cmlwLnN0YXJ0ID0gY2xhbXAoc3RyaXAuc3RhcnQsIDAsIHN0YXRlLmR1cmF0aW9uKTtcblx0XHRcdFx0c3RyaXAuZW5kID0gY2xhbXAoc3RyaXAuZW5kLCAwLCBzdGF0ZS5kdXJhdGlvbik7XG5cdFx0XHRcdGlmIChzdHJpcC5lbmQgPCBzdHJpcC5zdGFydCkgc3RyaXAuZW5kID0gc3RyaXAuc3RhcnQ7XG5cdFx0XHRcdHN0cmlwLnNwZWVkID0gY2xhbXAoc3RyaXAuc3BlZWQsIDAuMSwgMTApO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblxuXHRcdHJlbW92ZVN0cmlwOiAoaWQ6IHN0cmluZykgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0c3RhdGUuc3RyaXBzID0gc3RhdGUuc3RyaXBzLmZpbHRlcigoc3RyaXApID0+IHN0cmlwLmlkICE9PSBpZCk7XG5cdFx0XHRcdGlmIChzdGF0ZS5zZWxlY3RlZFN0cmlwSWQgPT09IGlkKSBzdGF0ZS5zZWxlY3RlZFN0cmlwSWQgPSBudWxsO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblxuXHRcdHNlbGVjdFN0cmlwOiAoaWQ6IHN0cmluZyB8IG51bGwpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdHN0YXRlLnNlbGVjdGVkU3RyaXBJZCA9IGlkO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblxuXHRcdHNwbGl0U3RyaXBBdFBsYXloZWFkOiAoaWQ6IHN0cmluZykgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0Y29uc3Qgc3RyaXAgPSBzdGF0ZS5zdHJpcHMuZmluZCgoaXRlbSkgPT4gaXRlbS5pZCA9PT0gaWQpO1xuXHRcdFx0XHRpZiAoIXN0cmlwKSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdGNvbnN0IHBsYXloZWFkID0gc3RhdGUuY3VycmVudFRpbWU7XG5cdFx0XHRcdGlmIChwbGF5aGVhZCA8PSBzdHJpcC5zdGFydCArIDFlLTQgfHwgcGxheWhlYWQgPj0gc3RyaXAuZW5kIC0gMWUtNCkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRjb25zdCBzcGxpdEFjdGlvbiA9IHN0cmlwQWN0aW9uVGltZShzdHJpcCwgcGxheWhlYWQpO1xuXHRcdFx0XHRjb25zdCBzZWNvbmQ6IE5sYVN0cmlwID0ge1xuXHRcdFx0XHRcdC4uLnN0cmlwLFxuXHRcdFx0XHRcdGlkOiBuZXh0U3RyaXBJZCgpLFxuXHRcdFx0XHRcdHN0YXJ0OiBwbGF5aGVhZCxcblx0XHRcdFx0fTtcblx0XHRcdFx0c3RyaXAuZW5kID0gcGxheWhlYWQ7XG5cdFx0XHRcdGlmIChzdHJpcC5yZXZlcnNlZCkge1xuXHRcdFx0XHRcdHN0cmlwLmFjdGlvblN0YXJ0ID0gc3BsaXRBY3Rpb247XG5cdFx0XHRcdFx0c2Vjb25kLmFjdGlvbkVuZCA9IHNwbGl0QWN0aW9uO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHN0cmlwLmFjdGlvbkVuZCA9IHNwbGl0QWN0aW9uO1xuXHRcdFx0XHRcdHNlY29uZC5hY3Rpb25TdGFydCA9IHNwbGl0QWN0aW9uO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHN0YXRlLnN0cmlwcy5wdXNoKHNlY29uZCk7XG5cdFx0XHRcdHN0YXRlLnNlbGVjdGVkU3RyaXBJZCA9IHNlY29uZC5pZDtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cblx0XHRkdXBsaWNhdGVTdHJpcDogKGlkOiBzdHJpbmcpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHN0cmlwID0gc3RhdGUuc3RyaXBzLmZpbmQoKGl0ZW0pID0+IGl0ZW0uaWQgPT09IGlkKTtcblx0XHRcdFx0aWYgKCFzdHJpcCkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRjb25zdCBsZW5ndGggPSBzdHJpcC5lbmQgLSBzdHJpcC5zdGFydDtcblx0XHRcdFx0Y29uc3QgY29weTogTmxhU3RyaXAgPSB7XG5cdFx0XHRcdFx0Li4uc3RyaXAsXG5cdFx0XHRcdFx0aWQ6IG5leHRTdHJpcElkKCksXG5cdFx0XHRcdFx0c3RhcnQ6IGNsYW1wKHN0cmlwLmVuZCwgMCwgc3RhdGUuZHVyYXRpb24pLFxuXHRcdFx0XHRcdGVuZDogY2xhbXAoc3RyaXAuZW5kICsgbGVuZ3RoLCAwLCBzdGF0ZS5kdXJhdGlvbiksXG5cdFx0XHRcdFx0bmFtZTogYCR7c3RyaXAubmFtZX0gY29weWAsXG5cdFx0XHRcdH07XG5cdFx0XHRcdHN0YXRlLnN0cmlwcy5wdXNoKGNvcHkpO1xuXHRcdFx0XHRzdGF0ZS5zZWxlY3RlZFN0cmlwSWQgPSBjb3B5LmlkO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblxuXHRcdHJldmVyc2VTdHJpcDogKGlkOiBzdHJpbmcpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHN0cmlwID0gc3RhdGUuc3RyaXBzLmZpbmQoKGl0ZW0pID0+IGl0ZW0uaWQgPT09IGlkKTtcblx0XHRcdFx0aWYgKCFzdHJpcCkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRzdHJpcC5yZXZlcnNlZCA9ICFzdHJpcC5yZXZlcnNlZDtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cblx0XHRmcmVlemVTdHJpcDogKGlkOiBzdHJpbmcsIGZyb3plbj86IGJvb2xlYW4pID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHN0cmlwID0gc3RhdGUuc3RyaXBzLmZpbmQoKGl0ZW0pID0+IGl0ZW0uaWQgPT09IGlkKTtcblx0XHRcdFx0aWYgKCFzdHJpcCkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRzdHJpcC5mcm96ZW4gPSBmcm96ZW4gPz8gIXN0cmlwLmZyb3plbjtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cblx0XHRzZXRTdHJpcFNwZWVkOiAoaWQ6IHN0cmluZywgc3BlZWQ6IG51bWJlcikgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0Y29uc3Qgc3RyaXAgPSBzdGF0ZS5zdHJpcHMuZmluZCgoaXRlbSkgPT4gaXRlbS5pZCA9PT0gaWQpO1xuXHRcdFx0XHRpZiAoIXN0cmlwKSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdHN0cmlwLnNwZWVkID0gY2xhbXAoc3BlZWQsIDAuMSwgMTApO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblxuXHRcdHRyaW1TdHJpcDogKGlkOiBzdHJpbmcsIGVkZ2U6ICdzdGFydCcgfCAnZW5kJywgZGVsdGE6IG51bWJlcikgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0Y29uc3Qgc3RyaXAgPSBzdGF0ZS5zdHJpcHMuZmluZCgoaXRlbSkgPT4gaXRlbS5pZCA9PT0gaWQpO1xuXHRcdFx0XHRpZiAoIXN0cmlwKSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdGlmIChlZGdlID09PSAnc3RhcnQnKSBzdHJpcC5zdGFydCA9IGNsYW1wKHN0cmlwLnN0YXJ0ICsgZGVsdGEsIDAsIHN0cmlwLmVuZCAtIDAuMDUpO1xuXHRcdFx0XHRlbHNlIHN0cmlwLmVuZCA9IGNsYW1wKHN0cmlwLmVuZCArIGRlbHRhLCBzdHJpcC5zdGFydCArIDAuMDUsIHN0YXRlLmR1cmF0aW9uKTtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cblx0XHQvLyAtLS0tIFNlcmlhbGlzYXRpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0XHRzbmFwc2hvdEFuaW1hdGlvbjogKCk6IEFuaW1hdGlvblNuYXBzaG90ID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gZ2V0KHRpbWVsaW5lU3RvcmUpO1xuXHRcdFx0Y29uc3Qga2V5ZnJhbWVzOiBSZWNvcmQ8c3RyaW5nLCBLZXlmcmFtZURhdGFbXT4gPSB7fTtcblx0XHRcdGZvciAoY29uc3QgW29iamVjdElkLCBrZXlzXSBvZiBzdGF0ZS5rZXlmcmFtZXMpIHtcblx0XHRcdFx0a2V5ZnJhbWVzW29iamVjdElkXSA9IGtleXMubWFwKChrZXkpID0+ICh7XG5cdFx0XHRcdFx0dGltZToga2V5LnRpbWUsXG5cdFx0XHRcdFx0cG9zaXRpb246IFsuLi5rZXkucG9zaXRpb25dIGFzIFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSxcblx0XHRcdFx0XHRyb3RhdGlvbjogWy4uLmtleS5yb3RhdGlvbl0gYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdLFxuXHRcdFx0XHRcdHNjYWxlOiBbLi4ua2V5LnNjYWxlXSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sXG5cdFx0XHRcdFx0Li4uKGtleS52aXNpYmxlICE9PSB1bmRlZmluZWQgPyB7IHZpc2libGU6IGtleS52aXNpYmxlIH0gOiB7fSksXG5cdFx0XHRcdFx0Li4uKGtleS5pbnRlcnBvbGF0aW9uID8geyBpbnRlcnBvbGF0aW9uOiBrZXkuaW50ZXJwb2xhdGlvbiB9IDoge30pLFxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjdXJ2ZXM6IFJlY29yZDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIEJlelRyaXBsZVtdPj4gPSB7fTtcblx0XHRcdGZvciAoY29uc3QgW29iamVjdElkLCBlbnRyeV0gb2Ygc3RhdGUuY3VydmVzKSB7XG5cdFx0XHRcdGNvbnN0IGNoYW5uZWxzOiBSZWNvcmQ8c3RyaW5nLCBCZXpUcmlwbGVbXT4gPSB7fTtcblx0XHRcdFx0Zm9yIChjb25zdCBbcGF0aCwgY3VydmVdIG9mIGVudHJ5KSB7XG5cdFx0XHRcdFx0aWYgKCFjdXJ2ZS5rZXlzLmxlbmd0aCkgY29udGludWU7XG5cdFx0XHRcdFx0Y2hhbm5lbHNbcGF0aF0gPSBjdXJ2ZS5rZXlzLm1hcCgoa2V5KSA9PiAoe1xuXHRcdFx0XHRcdFx0dGltZToga2V5LnRpbWUsXG5cdFx0XHRcdFx0XHR2YWx1ZToga2V5LnZhbHVlLFxuXHRcdFx0XHRcdFx0aW50ZXJwb2xhdGlvbjoga2V5LmludGVycG9sYXRpb24sXG5cdFx0XHRcdFx0XHRoYW5kbGVMZWZ0OiBba2V5LmhhbmRsZUxlZnRbMF0sIGtleS5oYW5kbGVMZWZ0WzFdXSxcblx0XHRcdFx0XHRcdGhhbmRsZVJpZ2h0OiBba2V5LmhhbmRsZVJpZ2h0WzBdLCBrZXkuaGFuZGxlUmlnaHRbMV1dLFxuXHRcdFx0XHRcdFx0YXV0b0xlZnQ6IGtleS5hdXRvTGVmdCxcblx0XHRcdFx0XHRcdGF1dG9SaWdodDoga2V5LmF1dG9SaWdodCxcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKE9iamVjdC5rZXlzKGNoYW5uZWxzKS5sZW5ndGgpIGN1cnZlc1tvYmplY3RJZF0gPSBjaGFubmVscztcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRyYWNrczogUmVjb3JkPHN0cmluZywgVHJhY2tNZXRhPiA9IHt9O1xuXHRcdFx0Zm9yIChjb25zdCBbb2JqZWN0SWQsIG1ldGFdIG9mIHN0YXRlLnRyYWNrcykge1xuXHRcdFx0XHR0cmFja3Nbb2JqZWN0SWRdID0geyAuLi5tZXRhIH07XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjbGlwczogUmVjb3JkPHN0cmluZywgTGF5ZXJDbGlwPiA9IHt9O1xuXHRcdFx0Zm9yIChjb25zdCBbb2JqZWN0SWQsIGNsaXBdIG9mIHN0YXRlLmNsaXBzKSBjbGlwc1tvYmplY3RJZF0gPSB7IC4uLmNsaXAgfTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGtleWZyYW1lcyxcblx0XHRcdFx0Y3VydmVzLFxuXHRcdFx0XHR0cmFja3MsXG5cdFx0XHRcdHN0cmlwczogc3RhdGUuc3RyaXBzLm1hcCgoc3RyaXApID0+ICh7IC4uLnN0cmlwIH0pKSxcblx0XHRcdFx0Y2xpcHMsXG5cdFx0XHRcdHNlbGVjdGVkU3RyaXBJZDogc3RhdGUuc2VsZWN0ZWRTdHJpcElkLFxuXHRcdFx0XHRzZWxlY3RlZEtleTogc3RhdGUuc2VsZWN0ZWRLZXkgPyB7IC4uLnN0YXRlLnNlbGVjdGVkS2V5IH0gOiBudWxsLFxuXHRcdFx0XHRzZWxlY3RlZEtleXM6IHN0YXRlLnNlbGVjdGVkS2V5cy5tYXAoKHMpID0+ICh7IC4uLnMgfSkpLFxuXHRcdFx0XHRkdXJhdGlvbjogc3RhdGUuZHVyYXRpb24sXG5cdFx0XHRcdHN0YXJ0RnJhbWU6IHN0YXRlLnN0YXJ0RnJhbWUsXG5cdFx0XHRcdGVuZEZyYW1lOiBzdGF0ZS5lbmRGcmFtZSxcblx0XHRcdFx0c25hcFRvRnJhbWVzOiBzdGF0ZS5zbmFwVG9GcmFtZXMsXG5cdFx0XHRcdGxvb3A6IHN0YXRlLmxvb3AsXG5cdFx0XHRcdGVhc2luZzogc3RhdGUuZWFzaW5nLFxuXHRcdFx0XHRmcmFtZVJhdGU6IHN0YXRlLmZyYW1lUmF0ZSxcblx0XHRcdH07XG5cdFx0fSxcblxuXHRcdHJlc3RvcmVBbmltYXRpb246IChzbmFwc2hvdDogQW5pbWF0aW9uU25hcHNob3QpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdHN0YXRlLmNsaXBzID0gbmV3IE1hcCgpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtvYmplY3RJZCwgY2xpcF0gb2YgT2JqZWN0LmVudHJpZXMoc25hcHNob3QuY2xpcHMgPz8ge30pKSB7XG5cdFx0XHRcdFx0c3RhdGUuY2xpcHMuc2V0KG9iamVjdElkLCB7IHN0YXJ0OiBjbGlwLnN0YXJ0LCBlbmQ6IGNsaXAuZW5kIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHN0YXRlLnRyYWNrcyA9IG5ldyBNYXAoKTtcblx0XHRcdFx0Zm9yIChjb25zdCBbb2JqZWN0SWQsIG1ldGFdIG9mIE9iamVjdC5lbnRyaWVzKHNuYXBzaG90LnRyYWNrcyA/PyB7fSkpIHtcblx0XHRcdFx0XHRzdGF0ZS50cmFja3Muc2V0KG9iamVjdElkLCB7IC4uLm1ldGEsIG9iamVjdElkIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHN0YXRlLmtleWZyYW1lcyA9IG5ldyBNYXAoKTtcblx0XHRcdFx0Zm9yIChjb25zdCBbb2JqZWN0SWQsIGtleXNdIG9mIE9iamVjdC5lbnRyaWVzKHNuYXBzaG90LmtleWZyYW1lcykpIHtcblx0XHRcdFx0XHRzdGF0ZS5rZXlmcmFtZXMuc2V0KFxuXHRcdFx0XHRcdFx0b2JqZWN0SWQsXG5cdFx0XHRcdFx0XHRrZXlzLm1hcCgoa2V5KSA9PiAoe1xuXHRcdFx0XHRcdFx0XHR0aW1lOiBrZXkudGltZSxcblx0XHRcdFx0XHRcdFx0cG9zaXRpb246IFsuLi5rZXkucG9zaXRpb25dIGFzIFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSxcblx0XHRcdFx0XHRcdFx0cm90YXRpb246IFsuLi5rZXkucm90YXRpb25dIGFzIFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSxcblx0XHRcdFx0XHRcdFx0c2NhbGU6IFsuLi5rZXkuc2NhbGVdIGFzIFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSxcblx0XHRcdFx0XHRcdFx0Li4uKGtleS52aXNpYmxlICE9PSB1bmRlZmluZWQgPyB7IHZpc2libGU6IGtleS52aXNpYmxlIH0gOiB7fSksXG5cdFx0XHRcdFx0XHRcdC4uLihrZXkuaW50ZXJwb2xhdGlvbiA/IHsgaW50ZXJwb2xhdGlvbjoga2V5LmludGVycG9sYXRpb24gfSA6IHt9KSxcblx0XHRcdFx0XHRcdH0pKSxcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHN0YXRlLmN1cnZlcyA9IG5ldyBNYXAoKTtcblx0XHRcdFx0Zm9yIChjb25zdCBbb2JqZWN0SWQsIGNoYW5uZWxzXSBvZiBPYmplY3QuZW50cmllcyhzbmFwc2hvdC5jdXJ2ZXMpKSB7XG5cdFx0XHRcdFx0Y29uc3QgZW50cnkgPSBuZXcgTWFwPHN0cmluZywgRkN1cnZlPigpO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgW3BhdGgsIGtleXNdIG9mIE9iamVjdC5lbnRyaWVzKGNoYW5uZWxzKSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgY3VydmUgPSBuZXcgRkN1cnZlKHBhdGgpO1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xuXHRcdFx0XHRcdFx0XHRjdXJ2ZS5rZXlzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdC4uLmtleSxcblx0XHRcdFx0XHRcdFx0XHRoYW5kbGVMZWZ0OiBba2V5LmhhbmRsZUxlZnQ/LlswXSA/PyAwLCBrZXkuaGFuZGxlTGVmdD8uWzFdID8/IDBdLFxuXHRcdFx0XHRcdFx0XHRcdGhhbmRsZVJpZ2h0OiBba2V5LmhhbmRsZVJpZ2h0Py5bMF0gPz8gMCwga2V5LmhhbmRsZVJpZ2h0Py5bMV0gPz8gMF0sXG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0ZW50cnkuc2V0KHBhdGgsIGN1cnZlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0c3RhdGUuY3VydmVzLnNldChvYmplY3RJZCwgZW50cnkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHN0YXRlLnN0cmlwcyA9IHNuYXBzaG90LnN0cmlwcy5tYXAoKHN0cmlwKSA9PiAoeyAuLi5zdHJpcCB9KSk7XG5cdFx0XHRcdHN0YXRlLnNlbGVjdGVkU3RyaXBJZCA9XG5cdFx0XHRcdFx0c25hcHNob3Quc2VsZWN0ZWRTdHJpcElkICYmIHN0YXRlLnN0cmlwcy5zb21lKChzdHJpcCkgPT4gc3RyaXAuaWQgPT09IHNuYXBzaG90LnNlbGVjdGVkU3RyaXBJZClcblx0XHRcdFx0XHRcdD8gc25hcHNob3Quc2VsZWN0ZWRTdHJpcElkXG5cdFx0XHRcdFx0XHQ6IG51bGw7XG5cdFx0XHRcdHN0YXRlLnNlbGVjdGVkS2V5ID0gc25hcHNob3Quc2VsZWN0ZWRLZXkgPyB7IC4uLnNuYXBzaG90LnNlbGVjdGVkS2V5IH0gOiBudWxsO1xuXHRcdFx0XHRzdGF0ZS5zZWxlY3RlZEtleXMgPSBzbmFwc2hvdC5zZWxlY3RlZEtleXNcblx0XHRcdFx0XHQ/IHNuYXBzaG90LnNlbGVjdGVkS2V5cy5tYXAoKHMpID0+ICh7IC4uLnMgfSkpXG5cdFx0XHRcdFx0OiBzdGF0ZS5zZWxlY3RlZEtleVxuXHRcdFx0XHRcdFx0PyBbeyAuLi5zdGF0ZS5zZWxlY3RlZEtleSB9XVxuXHRcdFx0XHRcdFx0OiBbXTtcblx0XHRcdFx0c3RhdGUuZnJhbWVSYXRlID0gY2xhbXAoTWF0aC5yb3VuZChzbmFwc2hvdC5mcmFtZVJhdGUpLCAxLCAxMjApO1xuXHRcdFx0XHRzdGF0ZS5kdXJhdGlvbiA9IGNsYW1wKHNuYXBzaG90LmR1cmF0aW9uLCAwLjEsIE1BWF9USU1FTElORV9TRUNPTkRTKTtcblx0XHRcdFx0c3RhdGUuc3RhcnRGcmFtZSA9IHNuYXBzaG90LnN0YXJ0RnJhbWUgPz8gMDtcblx0XHRcdFx0c3RhdGUuZW5kRnJhbWUgPSBzbmFwc2hvdC5lbmRGcmFtZSA/PyBNYXRoLm1heCgxLCBNYXRoLnJvdW5kKHN0YXRlLmR1cmF0aW9uICogc3RhdGUuZnJhbWVSYXRlKSk7XG5cdFx0XHRcdHN0YXRlLnNuYXBUb0ZyYW1lcyA9IEJvb2xlYW4oc25hcHNob3Quc25hcFRvRnJhbWVzKTtcblx0XHRcdFx0c3RhdGUuY3VycmVudFRpbWUgPSBjbGFtcChzdGF0ZS5jdXJyZW50VGltZSwgMCwgc3RhdGUuZHVyYXRpb24pO1xuXHRcdFx0XHRzdGF0ZS5sb29wID0gc25hcHNob3QubG9vcDtcblx0XHRcdFx0c3RhdGUuZWFzaW5nID0gc25hcHNob3QuZWFzaW5nO1xuXHRcdFx0XHRpZiAoc3RhdGUucGxheWluZykgYW5jaG9yQXQoc3RhdGUuY3VycmVudFRpbWUpO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblxuXHRcdHNlcmlhbGl6ZUtleWZyYW1lczogKCk6IFJlY29yZDxzdHJpbmcsIEtleWZyYW1lRGF0YVtdPiA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IGdldCh0aW1lbGluZVN0b3JlKTtcblx0XHRcdHJldHVybiBPYmplY3QuZnJvbUVudHJpZXMoc3RhdGUua2V5ZnJhbWVzLmVudHJpZXMoKSk7XG5cdFx0fSxcblxuXHRcdHNlcmlhbGl6ZUN1cnZlczogKCk6IFJlY29yZDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIEJlelRyaXBsZVtdPj4gPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBnZXQodGltZWxpbmVTdG9yZSk7XG5cdFx0XHRjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIEJlelRyaXBsZVtdPj4gPSB7fTtcblx0XHRcdGZvciAoY29uc3QgW29iamVjdElkLCBlbnRyeV0gb2Ygc3RhdGUuY3VydmVzKSB7XG5cdFx0XHRcdGNvbnN0IGNoYW5uZWxzOiBSZWNvcmQ8c3RyaW5nLCBCZXpUcmlwbGVbXT4gPSB7fTtcblx0XHRcdFx0Zm9yIChjb25zdCBbcGF0aCwgY3VydmVdIG9mIGVudHJ5KSB7XG5cdFx0XHRcdFx0aWYgKCFjdXJ2ZS5rZXlzLmxlbmd0aCkgY29udGludWU7XG5cdFx0XHRcdFx0Y2hhbm5lbHNbcGF0aF0gPSBjdXJ2ZS5rZXlzLm1hcCgoa2V5KSA9PiAoe1xuXHRcdFx0XHRcdFx0dGltZToga2V5LnRpbWUsXG5cdFx0XHRcdFx0XHR2YWx1ZToga2V5LnZhbHVlLFxuXHRcdFx0XHRcdFx0aW50ZXJwb2xhdGlvbjoga2V5LmludGVycG9sYXRpb24sXG5cdFx0XHRcdFx0XHRoYW5kbGVMZWZ0OiBba2V5LmhhbmRsZUxlZnRbMF0sIGtleS5oYW5kbGVMZWZ0WzFdXSxcblx0XHRcdFx0XHRcdGhhbmRsZVJpZ2h0OiBba2V5LmhhbmRsZVJpZ2h0WzBdLCBrZXkuaGFuZGxlUmlnaHRbMV1dLFxuXHRcdFx0XHRcdFx0YXV0b0xlZnQ6IGtleS5hdXRvTGVmdCxcblx0XHRcdFx0XHRcdGF1dG9SaWdodDoga2V5LmF1dG9SaWdodCxcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKE9iamVjdC5rZXlzKGNoYW5uZWxzKS5sZW5ndGgpIHJlc3VsdFtvYmplY3RJZF0gPSBjaGFubmVscztcblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSxcblxuXHRcdGxvYWRDdXJ2ZXM6IChkYXRhOiBSZWNvcmQ8c3RyaW5nLCBSZWNvcmQ8c3RyaW5nLCBCZXpUcmlwbGVbXT4+IHwgdW5kZWZpbmVkKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRzdGF0ZS5jdXJ2ZXMgPSBuZXcgTWFwKCk7XG5cdFx0XHRcdGZvciAoY29uc3QgW29iamVjdElkLCBjaGFubmVsc10gb2YgT2JqZWN0LmVudHJpZXMoZGF0YSA/PyB7fSkpIHtcblx0XHRcdFx0XHRjb25zdCBlbnRyeSA9IG5ldyBNYXA8c3RyaW5nLCBGQ3VydmU+KCk7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBbcGF0aCwga2V5c10gb2YgT2JqZWN0LmVudHJpZXMoY2hhbm5lbHMpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjdXJ2ZSA9IG5ldyBGQ3VydmUocGF0aCk7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG5cdFx0XHRcdFx0XHRcdGN1cnZlLmtleXMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdFx0Li4ua2V5LFxuXHRcdFx0XHRcdFx0XHRcdGhhbmRsZUxlZnQ6IFtrZXkuaGFuZGxlTGVmdD8uWzBdID8/IDAsIGtleS5oYW5kbGVMZWZ0Py5bMV0gPz8gMF0sXG5cdFx0XHRcdFx0XHRcdFx0aGFuZGxlUmlnaHQ6IFtrZXkuaGFuZGxlUmlnaHQ/LlswXSA/PyAwLCBrZXkuaGFuZGxlUmlnaHQ/LlsxXSA/PyAwXSxcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRlbnRyeS5zZXQocGF0aCwgY3VydmUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRzdGF0ZS5jdXJ2ZXMuc2V0KG9iamVjdElkLCBlbnRyeSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cblx0XHRzZXJpYWxpemVUcmFja3M6ICgpOiBSZWNvcmQ8c3RyaW5nLCBUcmFja01ldGE+ID0+IHtcblx0XHRcdGNvbnN0IG91dDogUmVjb3JkPHN0cmluZywgVHJhY2tNZXRhPiA9IHt9O1xuXHRcdFx0Zm9yIChjb25zdCBbb2JqZWN0SWQsIG1ldGFdIG9mIGdldCh0aW1lbGluZVN0b3JlKS50cmFja3MpIHtcblx0XHRcdFx0b3V0W29iamVjdElkXSA9IHsgLi4ubWV0YSB9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG91dDtcblx0XHR9LFxuXG5cdFx0bG9hZFRyYWNrczogKGRhdGE6IFJlY29yZDxzdHJpbmcsIFRyYWNrTWV0YT4gfCB1bmRlZmluZWQpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdHN0YXRlLnRyYWNrcyA9IG5ldyBNYXAoKTtcblx0XHRcdFx0Zm9yIChjb25zdCBbb2JqZWN0SWQsIG1ldGFdIG9mIE9iamVjdC5lbnRyaWVzKGRhdGEgPz8ge30pKSB7XG5cdFx0XHRcdFx0aWYgKCFtZXRhIHx8IHR5cGVvZiBtZXRhICE9PSAnb2JqZWN0JykgY29udGludWU7XG5cdFx0XHRcdFx0c3RhdGUudHJhY2tzLnNldChvYmplY3RJZCwge1xuXHRcdFx0XHRcdFx0b2JqZWN0SWQsXG5cdFx0XHRcdFx0XHRuYW1lOiB0eXBlb2YgbWV0YS5uYW1lID09PSAnc3RyaW5nJyA/IG1ldGEubmFtZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGxvY2tlZDogbWV0YS5sb2NrZWQgPT09IHRydWUsXG5cdFx0XHRcdFx0XHRoaWRkZW46IG1ldGEuaGlkZGVuID09PSB0cnVlLFxuXHRcdFx0XHRcdFx0bXV0ZWQ6IG1ldGEubXV0ZWQgPT09IHRydWUsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cblx0XHRzZXJpYWxpemVTdHJpcHM6ICgpOiBObGFTdHJpcFtdID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gZ2V0KHRpbWVsaW5lU3RvcmUpO1xuXHRcdFx0cmV0dXJuIHN0YXRlLnN0cmlwcy5tYXAoKHN0cmlwKSA9PiAoeyAuLi5zdHJpcCB9KSk7XG5cdFx0fSxcblxuXHRcdHNlcmlhbGl6ZUNsaXBzOiAoKTogUmVjb3JkPHN0cmluZywgTGF5ZXJDbGlwPiA9PiB7XG5cdFx0XHRjb25zdCBjbGlwczogUmVjb3JkPHN0cmluZywgTGF5ZXJDbGlwPiA9IHt9O1xuXHRcdFx0Zm9yIChjb25zdCBbb2JqZWN0SWQsIGNsaXBdIG9mIGdldCh0aW1lbGluZVN0b3JlKS5jbGlwcykge1xuXHRcdFx0XHRjbGlwc1tvYmplY3RJZF0gPSB7IHN0YXJ0OiBjbGlwLnN0YXJ0LCBlbmQ6IGNsaXAuZW5kIH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gY2xpcHM7XG5cdFx0fSxcblxuXHRcdGxvYWRDbGlwczogKGRhdGE6IFJlY29yZDxzdHJpbmcsIExheWVyQ2xpcD4gfCB1bmRlZmluZWQpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdHN0YXRlLmNsaXBzID0gbmV3IE1hcCgpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtvYmplY3RJZCwgY2xpcF0gb2YgT2JqZWN0LmVudHJpZXMoZGF0YSA/PyB7fSkpIHtcblx0XHRcdFx0XHRpZiAoIWNsaXAgfHwgIU51bWJlci5pc0Zpbml0ZShjbGlwLnN0YXJ0KSB8fCAhTnVtYmVyLmlzRmluaXRlKGNsaXAuZW5kKSkgY29udGludWU7XG5cdFx0XHRcdFx0c3RhdGUuY2xpcHMuc2V0KG9iamVjdElkLCB7XG5cdFx0XHRcdFx0XHRzdGFydDogY2xhbXAoY2xpcC5zdGFydCwgMCwgc3RhdGUuZHVyYXRpb24pLFxuXHRcdFx0XHRcdFx0ZW5kOiBjbGFtcChjbGlwLmVuZCwgMCwgc3RhdGUuZHVyYXRpb24pLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXG5cdFx0bG9hZFN0cmlwczogKGRhdGE6IE5sYVN0cmlwW10gfCB1bmRlZmluZWQpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdHN0YXRlLnN0cmlwcyA9IChkYXRhID8/IFtdKS5tYXAoKHN0cmlwKSA9PiAoeyAuLi5zdHJpcCB9KSk7XG5cdFx0XHRcdHN0YXRlLnNlbGVjdGVkU3RyaXBJZCA9IG51bGw7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXG5cdFx0bG9hZEtleWZyYW1lczogKGRhdGE6IFJlY29yZDxzdHJpbmcsIEtleWZyYW1lRGF0YVtdPiB8IHVuZGVmaW5lZCkgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0c3RhdGUua2V5ZnJhbWVzID0gbmV3IE1hcCgpO1xuXHRcdFx0XHRzdGF0ZS5jdXJ2ZXMgPSBuZXcgTWFwKCk7XG5cdFx0XHRcdGZvciAoY29uc3QgW29iamVjdElkLCBrZXlzXSBvZiBPYmplY3QuZW50cmllcyhkYXRhID8/IHt9KSkge1xuXHRcdFx0XHRcdGNvbnN0IHNvcnRlZCA9IFsuLi5rZXlzXS5zb3J0KChhLCBiKSA9PiBhLnRpbWUgLSBiLnRpbWUpO1xuXHRcdFx0XHRcdHN0YXRlLmtleWZyYW1lcy5zZXQob2JqZWN0SWQsIHNvcnRlZCk7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBrZXkgb2Ygc29ydGVkKSB3cml0ZVRyYW5zZm9ybUNoYW5uZWxzKHN0YXRlLmN1cnZlcywgb2JqZWN0SWQsIGtleSwgbnVsbCwga2V5LmludGVycG9sYXRpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHN0YXRlLmN1cnJlbnRUaW1lID0gMDtcblx0XHRcdFx0c3RhdGUucGxheWluZyA9IGZhbHNlO1xuXHRcdFx0XHRzdGF0ZS5zZWxlY3RlZEtleSA9IG51bGw7XG5cdFx0XHRcdHN0YXRlLnNlbGVjdGVkS2V5cyA9IFtdO1xuXHRcdFx0XHRzdG9wQ2xvY2soKTtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cdH07XG59XG5cbmV4cG9ydCBjb25zdCB0aW1lbGluZVN0b3JlID0gY3JlYXRlVGltZWxpbmVTdG9yZSgpO1xuXG5leHBvcnQgeyBNQVhfVElNRUxJTkVfU0VDT05EUywgdGltZVRvRnJhbWUsIGZyYW1lVG9UaW1lIH07XG4iXSwibWFwcGluZ3MiOiJBQUFBLFNBQVMsUUFBUSxFQUFFLEdBQUcsUUFBUSxjQUFjO0FBQzVDLFNBQ0MsYUFBYSxFQUNiLE1BQU0sRUFDTixvQkFBb0IsRUFDcEIsa0JBQWtCLEVBQ2xCLGtCQUFrQixFQUNsQixrQkFBa0IsRUFDbEIsa0JBQWtCLEVBQ2xCLGNBQWMsRUFDZCxrQkFBa0IsRUFDbEIsV0FBVyxFQUNYLFdBQVcsRUFDWCxXQUFXLFFBS0wsZUFBZTs7QUFFdEI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQVVBOztBQVNBOztBQU1BOztBQVFBOztBQTBEQTs7QUFhQSxNQUFNLFlBQTJCLEdBQUc7RUFDbkMsV0FBVyxFQUFFLENBQUM7RUFDZCxRQUFRLEVBQUUsRUFBRTtFQUNaLFVBQVUsRUFBRSxDQUFDO0VBQ2IsUUFBUSxFQUFFLEdBQUc7RUFDYixPQUFPLEVBQUUsS0FBSztFQUNkLElB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TUFBTSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLEtBQUssTUFBTSxJQUFJLFFBQVEsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1VBQ3ZGLElBQUksTUFBTSxJQUFJLENBQUMsRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1VBQzdDLE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFFLEdBQUcsSUFBSyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztVQUMxRSxJQUFJLFVBQVUsR0FBRyxDQUFDLEVBQUU7VUFDcEIsS0FBSyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLEdBQUcsRUFBRTtVQUNoQyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO1FBQzNDO01BQ0Q7TUFFQSxJQUFJLEtBQUssQ0FBQyxXQUFXLEVBQUUsUUFBUSxLQUFLLFFBQVEsSUFBSSxRQUFRLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQUU7UUFDdkYsS0FBSyxDQUFDLFdBQVcsR0FBRztVQUFFLFFBQVE7VUFBRSxJQUFJLEVBQUU7UUFBRyxDQUFDO1FBQzFDLEtBQUssQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQztNQUNqRDtNQUNBLEtBQUssQ0FBQyxZQUFZLEdBQUcsS0FBSyxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUUsR0FBRyxJQUMvQyxHQUFHLENBQUMsUUFBUSxLQUFLLFFBQVEsSUFBSSxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMs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QUFJLElBQUksSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFO1FBQ3hCLEtBQUssTUFBTSxDQUFDLElBQUksSUFBSSxFQUFFO1VBQ3JCLElBQUksQ0FBQyxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsS0FBSyxHQUFHLFdBQVcsSUFBSSxDQUFDLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxHQUFHLEdBQUcsV0FBVyxFQUFFO1lBQzNFLENBQUMsQ0FBQyxJQUFJLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1VBQzdFO1FBQ0Q7UUFDQSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7UUFDcEMsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDO1FBQ3hDLElBQUksS0FBSyxFQUFFO1VBQ1YsS0FBSyxNQUFNLEtBQUssSUFBSSxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRTtZQUNuQyxLQUFLLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxJQUFJLEVBQUU7Y0FDM0IsSUFBSSxDQUFDLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxLQUFLLEdBQUcsV0FBVyxJQUFJLENBQUMsQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLEdBQUcsR0FBRyxXQUFXLEVBQUU7Z0JBQzNFLENBQUMsQ0FBQyxJQUFJLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO2NBQzdFO1lBQ0Q7WUFDQSxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUks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