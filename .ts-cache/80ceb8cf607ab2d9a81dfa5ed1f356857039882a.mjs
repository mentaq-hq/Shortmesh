// Blender `fcurve.cc` port: BezTriple keyframes, FCurve evaluation and the
// channel layout used by the multi-layer timeline.
//
// Performance optimizations:
// - Fast-path O(1) Bezier time inversion when handles sit at the standard 1/3 span.
// - Fast-path clamped smoothstep evaluation when handle Y offsets are zero.
// - Direct keyframe lookup in evaluateQuaternion() when channel key times align,
//   eliminating 8 redundant binary searches per object per frame.

/** The timeline is a full hour long, from 00:00:00 to 01:00:00. */
export const MAX_TIMELINE_SECONDS = 3600;
export const VISIBILITY_CHANNEL = 'visible';
export const CHANNEL_PATHS = ['location.x', 'location.y', 'location.z', 'rotation_quaternion.w', 'rotation_quaternion.x', 'rotation_quaternion.y', 'rotation_quaternion.z', 'scale.x', 'scale.y', 'scale.z', 'visible', 'material.opacity', 'material.color.r', 'material.color.g', 'material.color.b'];
export const TRANSFORM_CHANNELS = ['location.x', 'location.y', 'location.z', 'rotation_quaternion.w', 'rotation_quaternion.x', 'rotation_quaternion.y', 'rotation_quaternion.z', 'scale.x', 'scale.y', 'scale.z'];
export const MATERIAL_CHANNELS = ['material.opacity', 'material.color.r', 'material.color.g', 'material.color.b'];

/** Converts a timeline time (seconds) to the nearest integer frame number at `fps`. */
export function timeToFrame(time, fps) {
  const rate = Math.max(1, fps);
  return Math.round(Math.max(0, time) * rate);
}

/** Converts a frame number to timeline time (seconds) at `fps`. */
export function frameToTime(frame, fps) {
  const rate = Math.max(1, fps);
  return Math.round(Math.max(0, frame) / rate * 10000) / 10000;
}
export function makeBezTriple(time, value, interpolation = 'bezier') {
  return {
    time,
    value,
    interpolation,
    handleLeft: [-1 / 3, 0],
    handleRight: [1 / 3, 0],
    autoLeft: true,
    autoRight: true
  };
}

/** Index of the first key whose time is greater than or equal to `time`. */
export function lowerBound(keys, time) {
  let low = 0;
  let high = keys.length;
  while (low < high) {
    const mid = low + high >>> 1;
    if (keys[mid].time < time) low = mid + 1;else high = mid;
  }
  return low;
}

/** Index of the last key whose time is less than or equal to `time`. */
export function upperBound(keys, time) {
  let low = 0;
  let high = keys.length;
  while (low < high) {
    const mid = low + high >>> 1;
    if (keys[mid].time <= time) low = mid + 1;else high = mid;
  }
  return low - 1;
}
function cubic(value0, value1, value2, value3, t) {
  const u = 1 - t;
  const u2 = u * u;
  const u3 = u2 * u;
  const t2 = t * t;
  const t3 = t2 * t;
  return u3 * value0 + 3 * u2 * t * value1 + 3 * u * t2 * value2 + t3 * value3;
}
function cubicDerivative(value0, value1, value2, value3, t) {
  const u = 1 - t;
  return 3 * u * u * (value1 - value0) + 6 * u * t * (value2 - value1) + 3 * t * t * (value3 - value2);
}

/**
 * Inverts the time component of a cubic Bezier.
 * Includes an exact O(1) fast path when the control points are evenly spaced at 1/3 and 2/3.
 */
export function solveBezierTime(x0, x1, x2, x3, target) {
  const span = x3 - x0;
  if (Math.abs(span) < 1e-12) return 0;
  if (target <= x0) return 0;
  if (target >= x3) return 1;
  const third = span / 3;
  if (Math.abs(x1 - x0 - third) < 1e-7 && Math.abs(x3 - x2 - third) < 1e-7) {
    return (target - x0) / span;
  }
  let u = (target - x0) / span;
  for (let i = 0; i < 8; i++) {
    const x = cubic(x0, x1, x2, x3, u);
    const dx = cubicDerivative(x0, x1, x2, x3, u);
    if (Math.abs(dx) < 1e-9) break;
    const next = u - (x - target) / dx;
    if (!Number.isFinite(next)) break;
    u = next;
    if (u < 0) u = 0;
    if (u > 1) u = 1;
    if (Math.abs(x - target) < 1e-9) return u;
  }
  let low = 0;
  let high = 1;
  u = Math.min(0.999999, Math.max(0.000001, u));
  for (let i = 0; i < 48; i++) {
    const x = cubic(x0, x1, x2, x3, u);
    if (Math.abs(x - target) < 1e-9) break;
    if (x < target) low = u;else high = u;
    u = (low + high) / 2;
  }
  return u;
}

/** A single animated channel: an ordered list of keyframes. */
export class FCurve {
  path;
  keys;
  constructor(path) {
    this.path = path;
    this.keys = [];
  }
  get length() {
    return this.keys.length;
  }

  /** Inserts or replaces the key at `time`, keeping the list sorted. */
  insert(time, value, interpolation) {
    const clamped = Math.min(MAX_TIMELINE_SECONDS, Math.max(0, time));
    const index = lowerBound(this.keys, clamped);
    const existing = this.keys[index];
    if (existing && Math.abs(existing.time - clamped) < 1e-9) {
      existing.value = value;
      if (interpolation) existing.interpolation = interpolation;
      return existing;
    }
    const prevKey = this.keys[index - 1];
    const key = makeBezTriple(clamped, value, interpolation ?? prevKey?.interpolation ?? 'bezier');
    this.keys.splice(index, 0, key);
    return key;
  }
  remove(time) {
    const index = lowerBound(this.keys, time);
    const key = this.keys[index];
    if (key && Math.abs(key.time - time) <= 1e-3) {
      this.keys.splice(index, 1);
      return true;
    }
    const prev = this.keys[index - 1];
    if (prev && Math.abs(prev.time - time) <= 1e-3) {
      this.keys.splice(index - 1, 1);
      return true;
    }
    return false;
  }
  get(time) {
    const index = lowerBound(this.keys, time);
    const key = this.keys[index];
    if (key && Math.abs(key.time - time) < 1e-9) return key;
    const previous = this.keys[index - 1];
    if (previous && Math.abs(previous.time - time) < 1e-9) return previous;
    return null;
  }

  /** Resolved handle position of the right handle of `key`. */
  rightHandle(key) {
    if (!key.autoRight) return key.handleRight;
    const next = this.keys[this.keys.indexOf(key) + 1];
    const span = next ? next.time - key.time : 1;
    return [span / 3, 0];
  }

  /** Resolved handle position of the left handle of `key`. */
  leftHandle(key) {
    if (!key.autoLeft) return key.handleLeft;
    const index = this.keys.indexOf(key);
    const previous = this.keys[index - 1];
    const span = previous ? key.time - previous.time : 1;
    return [-span / 3, 0];
  }

  /**
   * Locates the surrounding keys of `time` in O(log N).
   */
  segment(time) {
    const keys = this.keys;
    const len = keys.length;
    if (len < 2) return null;
    if (time <= keys[0].time || time >= keys[len - 1].time) return null;
    const index = upperBound(keys, time);
    const k0 = keys[index];
    const k1 = keys[index + 1];
    if (!k0 || !k1) return null;
    const span = k1.time - k0.time;
    const factor = span > 1e-12 ? (time - k0.time) / span : 0;
    const handleRight = k0.autoRight ? [span / 3, 0] : k0.handleRight;
    const handleLeft = k1.autoLeft ? [-span / 3, 0] : k1.handleLeft;
    return {
      k0,
      k1,
      index,
      factor,
      handleRight,
      handleLeft
    };
  }

  /**
   * Evaluates the curve at `time`.
   */
  evaluate(time, easing = true) {
    const keys = this.keys;
    const len = keys.length;
    if (!len) return null;
    if (len === 1 || time <= keys[0].time) return keys[0].value;
    const last = keys[len - 1];
    if (time >= last.time) return last.value;
    const index = upperBound(keys, time);
    const k0 = keys[index];
    const k1 = keys[index + 1];
    if (!k0 || !k1) return last.value;
    const span = k1.time - k0.time;
    if (span <= 1e-12) return k1.value;
    const interp = k0.interpolation;
    if (interp === 'constant') return k0.value;
    const factor = (time - k0.time) / span;
    if (interp === 'linear' || !easing) {
      return k0.value + (k1.value - k0.value) * factor;
    }
    // Fast path for auto-clamped Bezier (smoothstep)
    if (k0.autoRight && k1.autoLeft) {
      const s = factor * factor * (3 - 2 * factor);
      return k0.value + (k1.value - k0.value) * s;
    }
    const handleRight = k0.autoRight ? [span / 3, 0] : k0.handleRight;
    const handleLeft = k1.autoLeft ? [-span / 3, 0] : k1.handleLeft;
    const u = solveBezierTime(k0.time, k0.time + handleRight[0], k1.time + handleLeft[0], k1.time, time);
    return cubic(k0.value, k0.value + handleRight[1], k1.value + handleLeft[1], k1.value, u);
  }

  /**
   * Normalised progress of a Bezier segment.
   */
  bezierFactor(segment, time) {
    if (segment.k0.autoRight && segment.k1.autoLeft) {
      const f = segment.factor;
      return f * f * (3 - 2 * f);
    }
    return solveBezierTime(segment.k0.time, segment.k0.time + segment.handleRight[0], segment.k1.time + segment.handleLeft[0], segment.k1.time, time);
  }
}

/** The two keys that surround a time, together with the resolved handles. */

/** Evaluates the value of a Bezier segment at `time`. */
export function evaluateBezierSegment(segment, time) {
  const {
    k0,
    k1,
    handleRight,
    handleLeft
  } = segment;
  if (k0.autoRight && k1.autoLeft) {
    const f = segment.factor;
    const s = f * f * (3 - 2 * f);
    return k0.value + (k1.value - k0.value) * s;
  }
  const u = solveBezierTime(k0.time, k0.time + handleRight[0], k1.time + handleLeft[0], k1.time, time);
  return cubic(k0.value, k0.value + handleRight[1], k1.value + handleLeft[1], k1.value, u);
}

/** Evaluates a set of curves and assembles them into a vector. */
export function evaluateVector(curves, prefix, time, easing = true, fallback = 0) {
  const cx = curves.get(`${prefix}.x`);
  const cy = curves.get(`${prefix}.y`);
  const cz = curves.get(`${prefix}.z`);
  const x = cx ? cx.evaluate(time, easing) : null;
  const y = cy ? cy.evaluate(time, easing) : null;
  const z = cz ? cz.evaluate(time, easing) : null;
  if (x === null && y === null && z === null) return null;
  return [x ?? fallback, y ?? fallback, z ?? fallback];
}

/**
 * Evaluates one channel.
 */
export function evaluateChannel(curve, time, easing = true) {
  if (!curve) return null;
  return curve.evaluate(time, easing);
}

/**
 * Evaluates the `visible` channel into a boolean (`>= 0.5` is visible), or `null` if unkeyed.
 */
export function evaluateVisibility(curves, time, easing = true) {
  const visCurve = curves.get(VISIBILITY_CHANNEL);
  if (!visCurve || !visCurve.keys.length) return null;
  const val = visCurve.evaluate(time, easing);
  if (val === null || val === undefined) return null;
  return val >= 0.5;
}

/** Quaternion stored in [w, x, y, z] order to match Blender rotation_quaternion channels. */

function quatDot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}
function quatNormalize(q) {
  const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

/**
 * Spherical interpolation along the shortest path.
 */
export function slerpShortest(a, b, t) {
  let bw = b[0],
    bx = b[1],
    by = b[2],
    bz = b[3];
  let dot = a[0] * bw + a[1] * bx + a[2] * by + a[3] * bz;
  if (dot < 0) {
    bw = -bw;
    bx = -bx;
    by = -by;
    bz = -bz;
    dot = -dot;
  }
  if (dot > 0.9995) {
    return quatNormalize([a[0] + (bw - a[0]) * t, a[1] + (bx - a[1]) * t, a[2] + (by - a[2]) * t, a[3] + (bz - a[3]) * t]);
  }
  const theta = Math.acos(Math.min(1, Math.max(-1, dot)));
  const sinTheta = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sinTheta;
  const wb = Math.sin(t * theta) / sinTheta;
  return [a[0] * wa + bw * wb, a[1] * wa + bx * wb, a[2] * wa + by * wb, a[3] * wa + bz * wb];
}

/** Evaluates the four quaternion channels into a normalised quaternion. */
export function evaluateQuaternion(curves, time, easing = true) {
  const w = curves.get('rotation_quaternion.w');
  const wKeys = w?.keys;
  if (!w || !wKeys || !wKeys.length) return null;
  const x = curves.get('rotation_quaternion.x');
  const y = curves.get('rotation_quaternion.y');
  const z = curves.get('rotation_quaternion.z');
  if (!x || !y || !z) return null;
  const len = wKeys.length;
  const xKeys = x.keys;
  const yKeys = y.keys;
  const zKeys = z.keys;
  const aligned = xKeys.length === len && yKeys.length === len && zKeys.length === len;
  if (len === 1 || time <= wKeys[0].time) {
    if (aligned) {
      return quatNormalize([wKeys[0].value, xKeys[0].value, yKeys[0].value, zKeys[0].value]);
    }
    return quatNormalize([w.evaluate(time, easing) ?? 1, x.evaluate(time, easing) ?? 0, y.evaluate(time, easing) ?? 0, z.evaluate(time, easing) ?? 0]);
  }
  if (time >= wKeys[len - 1].time) {
    const last = len - 1;
    if (aligned) {
      return quatNormalize([wKeys[last].value, xKeys[last].value, yKeys[last].value, zKeys[last].value]);
    }
    return quatNormalize([w.evaluate(time, easing) ?? 1, x.evaluate(time, easing) ?? 0, y.evaluate(time, easing) ?? 0, z.evaluate(time, easing) ?? 0]);
  }
  const segment = w.segment(time);
  if (!segment) {
    return quatNormalize([w.evaluate(time, easing) ?? 1, x.evaluate(time, easing) ?? 0, y.evaluate(time, easing) ?? 0, z.evaluate(time, easing) ?? 0]);
  }
  const idx = segment.index ?? 0;
  let q0;
  let q1;
  if (aligned && xKeys[idx].time === segment.k0.time && xKeys[idx + 1].time === segment.k1.time) {
    q0 = quatNormalize([wKeys[idx].value, xKeys[idx].value, yKeys[idx].value, zKeys[idx].value]);
    q1 = quatNormalize([wKeys[idx + 1].value, xKeys[idx + 1].value, yKeys[idx + 1].value, zKeys[idx + 1].value]);
  } else {
    const t0 = segment.k0.time;
    const t1 = segment.k1.time;
    q0 = quatNormalize([w.evaluate(t0, easing) ?? 1, x.evaluate(t0, easing) ?? 0, y.evaluate(t0, easing) ?? 0, z.evaluate(t0, easing) ?? 0]);
    q1 = quatNormalize([w.evaluate(t1, easing) ?? 1, x.evaluate(t1, easing) ?? 0, y.evaluate(t1, easing) ?? 0, z.evaluate(t1, easing) ?? 0]);
  }
  if (segment.k0.interpolation === 'constant') return q0;
  const factor = segment.k0.interpolation === 'linear' || !easing ? segment.factor : w.bezierFactor(segment, time);
  return slerpShortest(q0, q1, factor);
}

/** Interpolates between two key values of a quaternion channel group. */
export function blendQuat(a, b, t) {
  return slerpShortest(a, b, t);
}

/** Builds a [w, x, y, z] quaternion from an axis and an angle in radians. */
export function quatFromAxisAngle(axis, angle) {
  const length = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const half = Math.sin(angle / 2);
  return [Math.cos(angle / 2), axis[0] / length * half, axis[1] / length * half, axis[2] / length * half];
}

/** Multiplies two [w, x, y, z] quaternions, the result applies `b` first. */
export function quatMul(a, b) {
  const aw = a[0],
    ax = a[1],
    ay = a[2],
    az = a[3];
  const bw = b[0],
    bx = b[1],
    by = b[2],
    bz = b[3];
  return [aw * bw - ax * bx - ay * by - az * bz, aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw];
}

/** Converts an XYZ euler triple (radians) into a [w, x, y, z] quaternion. */
export function eulerToQuat(euler) {
  const [rx, ry, rz] = euler;
  const cx = Math.cos(rx / 2);
  const sx = Math.sin(rx / 2);
  const cy = Math.cos(ry / 2);
  const sy = Math.sin(ry / 2);
  const cz = Math.cos(rz / 2);
  const sz = Math.sin(rz / 2);
  return [cx * cy * cz + sx * sy * sz, sx * cy * cz - cx * sy * sz, cx * sy * cz + sx * cy * sz, cx * cy * sz - sx * sy * cz];
}

/** The inverse of a unit [w, x, y, z] quaternion is its conjugate. */
export function quatConjugate(q) {
  return [q[0], -q[1], -q[2], -q[3]];
}
export function quatToEuler(q) {
  const [w, x, y, z] = quatNormalize(q);
  const sinr = 2 * (w * x + y * z);
  const cosr = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinr, cosr);
  let sinp = 2 * (w * y - z * x);
  sinp = Math.min(1, Math.max(-1, sinp));
  const pitch = Math.asin(sinp);
  const siny = 2 * (w * z + x * y);
  const cosy = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(siny, cosy);
  return [roll, pitch, yaw];
}
export function eulerToQuatClosest(euler, reference) {
  const candidate = eulerToQuat(euler);
  const negated = [-candidate[0], -candidate[1], -candidate[2], -candidate[3]];
  return quatDot(candidate, reference) >= quatDot(negated, reference) ? candidate : negated;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6W10sInNvdXJjZXMiOlsiZmN1cnZlLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEJsZW5kZXIgYGZjdXJ2ZS5jY2AgcG9ydDogQmV6VHJpcGxlIGtleWZyYW1lcywgRkN1cnZlIGV2YWx1YXRpb24gYW5kIHRoZVxuLy8gY2hhbm5lbCBsYXlvdXQgdXNlZCBieSB0aGUgbXVsdGktbGF5ZXIgdGltZWxpbmUuXG4vL1xuLy8gUGVyZm9ybWFuY2Ugb3B0aW1pemF0aW9uczpcbi8vIC0gRmFzdC1wYXRoIE8oMSkgQmV6aWVyIHRpbWUgaW52ZXJzaW9uIHdoZW4gaGFuZGxlcyBzaXQgYXQgdGhlIHN0YW5kYXJkIDEvMyBzcGFuLlxuLy8gLSBGYXN0LXBhdGggY2xhbXBlZCBzbW9vdGhzdGVwIGV2YWx1YXRpb24gd2hlbiBoYW5kbGUgWSBvZmZzZXRzIGFyZSB6ZXJvLlxuLy8gLSBEaXJlY3Qga2V5ZnJhbWUgbG9va3VwIGluIGV2YWx1YXRlUXVhdGVybmlvbigpIHdoZW4gY2hhbm5lbCBrZXkgdGltZXMgYWxpZ24sXG4vLyAgIGVsaW1pbmF0aW5nIDggcmVkdW5kYW50IGJpbmFyeSBzZWFyY2hlcyBwZXIgb2JqZWN0IHBlciBmcmFtZS5cblxuLyoqIFRoZSB0aW1lbGluZSBpcyBhIGZ1bGwgaG91ciBsb25nLCBmcm9tIDAwOjAwOjAwIHRvIDAxOjAwOjAwLiAqL1xuZXhwb3J0IGNvbnN0IE1BWF9USU1FTElORV9TRUNPTkRTID0gMzYwMDtcblxuZXhwb3J0IHR5cGUgSW50ZXJwb2xhdGlvbiA9ICdjb25zdGFudCcgfCAnbGluZWFyJyB8ICdiZXppZXInO1xuXG5leHBvcnQgaW50ZXJmYWNlIEJlelRyaXBsZSB7XG5cdC8qKiBLZXkgcG9zaXRpb24gb24gdGhlIHRpbWVsaW5lLCBpbiBzZWNvbmRzLiAqL1xuXHR0aW1lOiBudW1iZXI7XG5cdC8qKiBLZXkgdmFsdWUuICovXG5cdHZhbHVlOiBudW1iZXI7XG5cdC8qKiBJbnRlcnBvbGF0aW9uIHVzZWQgZm9yIHRoZSBzZWdtZW50IHRoYXQgKnN0YXJ0cyogYXQgdGhpcyBrZXkuICovXG5cdGludGVycG9sYXRpb246IEludGVycG9sYXRpb247XG5cdC8qKiBMZWZ0IGhhbmRsZSBhcyBhICh0aW1lLCB2YWx1ZSkgb2Zmc2V0IHJlbGF0aXZlIHRvIHRoZSBrZXkuICovXG5cdGhhbmRsZUxlZnQ6IFtudW1iZXIsIG51bWJlcl07XG5cdC8qKiBSaWdodCBoYW5kbGUgYXMgYSAodGltZSwgdmFsdWUpIG9mZnNldCByZWxhdGl2ZSB0byB0aGUga2V5LiAqL1xuXHRoYW5kbGVSaWdodDogW251bWJlciwgbnVtYmVyXTtcblx0LyoqIFdoZW4gdHJ1ZSB0aGUgaGFuZGxlIGlzIGRlcml2ZWQgZnJvbSB0aGUgbmVpZ2hib3VyaW5nIGtleXMuICovXG5cdGF1dG9MZWZ0OiBib29sZWFuO1xuXHRhdXRvUmlnaHQ6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjb25zdCBWSVNJQklMSVRZX0NIQU5ORUwgPSAndmlzaWJsZScgYXMgY29uc3Q7XG5cbmV4cG9ydCBjb25zdCBDSEFOTkVMX1BBVEhTID0gW1xuXHQnbG9jYXRpb24ueCcsXG5cdCdsb2NhdGlvbi55Jyxcblx0J2xvY2F0aW9uLnonLFxuXHQncm90YXRpb25fcXVhdGVybmlvbi53Jyxcblx0J3JvdGF0aW9uX3F1YXRlcm5pb24ueCcsXG5cdCdyb3RhdGlvbl9xdWF0ZXJuaW9uLnknLFxuXHQncm90YXRpb25fcXVhdGVybmlvbi56Jyxcblx0J3NjYWxlLngnLFxuXHQnc2NhbGUueScsXG5cdCdzY2FsZS56Jyxcblx0J3Zpc2libGUnLFxuXHQnbWF0ZXJpYWwub3BhY2l0eScsXG5cdCdtYXRlcmlhbC5jb2xvci5yJyxcblx0J21hdGVyaWFsLmNvbG9yLmcnLFxuXHQnbWF0ZXJpYWwuY29sb3IuYicsXG5dIGFzIGNvbnN0O1xuXG5leHBvcnQgdHlwZSBDaGFubmVsUGF0aCA9ICh0eXBlb2YgQ0hBTk5FTF9QQVRIUylbbnVtYmVyXTtcblxuZXhwb3J0IGNvbnN0IFRSQU5TRk9STV9DSEFOTkVMUzogQ2hhbm5lbFBhdGhbXSA9IFtcblx0J2xvY2F0aW9uLngnLFxuXHQnbG9jYXRpb24ueScsXG5cdCdsb2NhdGlvbi56Jyxcblx0J3JvdGF0aW9uX3F1YXRlcm5pb24udycsXG5cdCdyb3RhdGlvbl9xdWF0ZXJuaW9uLngnLFxuXHQncm90YXRpb25fcXVhdGVybmlvbi55Jyxcblx0J3JvdGF0aW9uX3F1YXRlcm5pb24ueicsXG5cdCdzY2FsZS54Jyxcblx0J3NjYWxlLnknLFxuXHQnc2NhbGUueicsXG5dO1xuXG5leHBvcnQgY29uc3QgTUFURVJJQUxfQ0hBTk5FTFM6IENoYW5uZWxQYXRoW10gPSBbXG5cdCdtYXRlcmlhbC5vcGFjaXR5Jyxcblx0J21hdGVyaWFsLmNvbG9yLnInLFxuXHQnbWF0ZXJpYWwuY29sb3IuZycsXG5cdCdtYXRlcmlhbC5jb2xvci5iJyxcbl07XG5cbi8qKiBDb252ZXJ0cyBhIHRpbWVsaW5lIHRpbWUgKHNlY29uZHMpIHRvIHRoZSBuZWFyZXN0IGludGVnZXIgZnJhbWUgbnVtYmVyIGF0IGBmcHNgLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRpbWVUb0ZyYW1lKHRpbWU6IG51bWJlciwgZnBzOiBudW1iZXIpOiBudW1iZXIge1xuXHRjb25zdCByYXRlID0gTWF0aC5tYXgoMSwgZnBzKTtcblx0cmV0dXJuIE1hdGgucm91bmQoTWF0aC5tYXgoMCwgdGltZSkgKiByYXRlKTtcbn1cblxuLyoqIENvbnZlcnRzIGEgZnJhbWUgbnVtYmVyIHRvIHRpbWVsaW5lIHRpbWUgKHNlY29uZHMpIGF0IGBmcHNgLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZyYW1lVG9UaW1lKGZyYW1lOiBudW1iZXIsIGZwczogbnVtYmVyKTogbnVtYmVyIHtcblx0Y29uc3QgcmF0ZSA9IE1hdGgubWF4KDEsIGZwcyk7XG5cdHJldHVybiBNYXRoLnJvdW5kKChNYXRoLm1heCgwLCBmcmFtZSkgLyByYXRlKSAqIDEwMDAwKSAvIDEwMDAwO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWFrZUJlelRyaXBsZSh0aW1lOiBudW1iZXIsIHZhbHVlOiBudW1iZXIsIGludGVycG9sYXRpb246IEludGVycG9sYXRpb24gPSAnYmV6aWVyJyk6IEJlelRyaXBsZSB7XG5cdHJldHVybiB7XG5cdFx0dGltZSxcblx0XHR2YWx1ZSxcblx0XHRpbnRlcnBvbGF0aW9uLFxuXHRcdGhhbmRsZUxlZnQ6IFstMSAvIDMsIDBdLFxuXHRcdGhhbmRsZVJpZ2h0OiBbMSAvIDMsIDBdLFxuXHRcdGF1dG9MZWZ0OiB0cnVlLFxuXHRcdGF1dG9SaWdodDogdHJ1ZSxcblx0fTtcbn1cblxuLyoqIEluZGV4IG9mIHRoZSBmaXJzdCBrZXkgd2hvc2UgdGltZSBpcyBncmVhdGVyIHRoYW4gb3IgZXF1YWwgdG8gYHRpbWVgLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGxvd2VyQm91bmQoa2V5czogQmV6VHJpcGxlW10sIHRpbWU6IG51bWJlcik6IG51bWJlciB7XG5cdGxldCBsb3cgPSAwO1xuXHRsZXQgaGlnaCA9IGtleXMubGVuZ3RoO1xuXHR3aGlsZSAobG93IDwgaGlnaCkge1xuXHRcdGNvbnN0IG1pZCA9IChsb3cgKyBoaWdoKSA+Pj4gMTtcblx0XHRpZiAoa2V5c1ttaWRdLnRpbWUgPCB0aW1lKSBsb3cgPSBtaWQgKyAxO1xuXHRcdGVsc2UgaGlnaCA9IG1pZDtcblx0fVxuXHRyZXR1cm4gbG93O1xufVxuXG4vKiogSW5kZXggb2YgdGhlIGxhc3Qga2V5IHdob3NlIHRpbWUgaXMgbGVzcyB0aGFuIG9yIGVxdWFsIHRvIGB0aW1lYC4gKi9cbmV4cG9ydCBmdW5jdGlvbiB1cHBlckJvdW5kKGtleXM6IEJlelRyaXBsZVtdLCB0aW1lOiBudW1iZXIpOiBudW1iZXIge1xuXHRsZXQgbG93ID0gMDtcblx0bGV0IGhpZ2ggPSBrZXlzLmxlbmd0aDtcblx0d2hpbGUgKGxvdyA8IGhpZ2gpIHtcblx0XHRjb25zdCBtaWQgPSAobG93ICsgaGlnaCkgPj4+IDE7XG5cdFx0aWYgKGtleXNbbWlkXS50aW1lIDw9IHRpbWUpIGxvdyA9IG1pZCArIDE7XG5cdFx0ZWxzZSBoaWdoID0gbWlkO1xuXHR9XG5cdHJldHVybiBsb3cgLSAxO1xufVxuXG5mdW5jdGlvbiBjdWJpYyh2YWx1ZTA6IG51bWJlciwgdmFsdWUxOiBudW1iZXIsIHZhbHVlMjogbnVtYmVyLCB2YWx1ZTM6IG51bWJlciwgdDogbnVtYmVyKTogbnVtYmVyIHtcblx0Y29uc3QgdSA9IDEgLSB0O1xuXHRjb25zdCB1MiA9IHUgKiB1O1xuXHRjb25zdCB1MyA9IHUyICogdTtcblx0Y29uc3QgdDIgPSB0ICogdDtcblx0Y29uc3QgdDMgPSB0MiAqIHQ7XG5cdHJldHVybiB1MyAqIHZhbHVlMCArIDMgKiB1MiAqIHQgKiB2YWx1ZTEgKyAzICogdSAqIHQyICogdmFsdWUyICsgdDMgKiB2YWx1ZTM7XG59XG5cbmZ1bmN0aW9uIGN1YmljRGVyaXZhdGl2ZSh2YWx1ZTA6IG51bWJlciwgdmFsdWUxOiBudW1iZXIsIHZhbHVlMjogbnVtYmVyLCB2YWx1ZTM6IG51bWJlciwgdDogbnVtYmVyKTogbnVtYmVyIHtcblx0Y29uc3QgdSA9IDEgLSB0O1xuXHRyZXR1cm4gMyAqIHUgKiB1ICogKHZhbHVlMSAtIHZhbHVlMCkgKyA2ICogdSAqIHQgKiAodmFsdWUyIC0gdmFsdWUxKSArIDMgKiB0ICogdCAqICh2YWx1ZTMgLSB2YWx1ZTIpO1xufVxuXG4vKipcbiAqIEludmVydHMgdGhlIHRpbWUgY29tcG9uZW50IG9mIGEgY3ViaWMgQmV6aWVyLlxuICogSW5jbHVkZXMgYW4gZXhhY3QgTygxKSBmYXN0IHBhdGggd2hlbiB0aGUgY29udHJvbCBwb2ludHMgYXJlIGV2ZW5seSBzcGFjZWQgYXQgMS8zIGFuZCAyLzMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzb2x2ZUJlemllclRpbWUoeDA6IG51bWJlciwgeDE6IG51bWJlciwgeDI6IG51bWJlciwgeDM6IG51bWJlciwgdGFyZ2V0OiBudW1iZXIpOiBudW1iZXIge1xuXHRjb25zdCBzcGFuID0geDMgLSB4MDtcblx0aWYgKE1hdGguYWJzKHNwYW4pIDwgMWUtMTIpIHJldHVybiAwO1xuXHRpZiAodGFyZ2V0IDw9IHgwKSByZXR1cm4gMDtcblx0aWYgKHRhcmdldCA+PSB4MykgcmV0dXJuIDE7XG5cblx0Y29uc3QgdGhpcmQgPSBzcGFuIC8gMztcblx0aWYgKE1hdGguYWJzKHgxIC0geDAgLSB0aGlyZCkgPCAxZS03ICYmIE1hdGguYWJzKHgzIC0geDIgLSB0aGlyZCkgPCAxZS03KSB7XG5cdFx0cmV0dXJuICh0YXJnZXQgLSB4MCkgLyBzcGFuO1xuXHR9XG5cblx0bGV0IHUgPSAodGFyZ2V0IC0geDApIC8gc3Bhbjtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCA4OyBpKyspIHtcblx0XHRjb25zdCB4ID0gY3ViaWMoeDAsIHgxLCB4MiwgeDMsIHUpO1xuXHRcdGNvbnN0IGR4ID0gY3ViaWNEZXJpdmF0aXZlKHgwLCB4MSwgeDIsIHgzLCB1KTtcblx0XHRpZiAoTWF0aC5hYnMoZHgpIDwgMWUtOSkgYnJlYWs7XG5cdFx0Y29uc3QgbmV4dCA9IHUgLSAoeCAtIHRhcmdldCkgLyBkeDtcblx0XHRpZiAoIU51bWJlci5pc0Zpbml0ZShuZXh0KSkgYnJlYWs7XG5cdFx0dSA9IG5leHQ7XG5cdFx0aWYgKHUgPCAwKSB1ID0gMDtcblx0XHRpZiAodSA+IDEpIHUgPSAxO1xuXHRcdGlmIChNYXRoLmFicyh4IC0gdGFyZ2V0KSA8IDFlLTkpIHJldHVybiB1O1xuXHR9XG5cblx0bGV0IGxvdyA9IDA7XG5cdGxldCBoaWdoID0gMTtcblx0dSA9IE1hdGgubWluKDAuOTk5OTk5LCBNYXRoLm1heCgwLjAwMDAwMSwgdSkpO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IDQ4OyBpKyspIHtcblx0XHRjb25zdCB4ID0gY3ViaWMoeDAsIHgxLCB4MiwgeDMsIHUpO1xuXHRcdGlmIChNYXRoLmFicyh4IC0gdGFyZ2V0KSA8IDFlLTkpIGJyZWFrO1xuXHRcdGlmICh4IDwgdGFyZ2V0KSBsb3cgPSB1O1xuXHRcdGVsc2UgaGlnaCA9IHU7XG5cdFx0dSA9IChsb3cgKyBoaWdoKSAvIDI7XG5cdH1cblx0cmV0dXJuIHU7XG59XG5cbi8qKiBBIHNpbmdsZSBhbmltYXRlZCBjaGFubmVsOiBhbiBvcmRlcmVkIGxpc3Qgb2Yga2V5ZnJhbWVzLiAqL1xuZXhwb3J0IGNsYXNzIEZDdXJ2ZSB7XG5cdHBhdGg6IHN0cmluZztcblx0a2V5czogQmV6VHJpcGxlW107XG5cblx0Y29uc3RydWN0b3IocGF0aDogc3RyaW5nKSB7XG5cdFx0dGhpcy5wYXRoID0gcGF0aDtcblx0XHR0aGlzLmtleXMgPSBbXTtcblx0fVxuXG5cdGdldCBsZW5ndGgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5rZXlzLmxlbmd0aDtcblx0fVxuXG5cdC8qKiBJbnNlcnRzIG9yIHJlcGxhY2VzIHRoZSBrZXkgYXQgYHRpbWVgLCBrZWVwaW5nIHRoZSBsaXN0IHNvcnRlZC4gKi9cblx0aW5zZXJ0KHRpbWU6IG51bWJlciwgdmFsdWU6IG51bWJlciwgaW50ZXJwb2xhdGlvbj86IEludGVycG9sYXRpb24pOiBCZXpUcmlwbGUge1xuXHRcdGNvbnN0IGNsYW1wZWQgPSBNYXRoLm1pbihNQVhfVElNRUxJTkVfU0VDT05EUywgTWF0aC5tYXgoMCwgdGltZSkpO1xuXHRcdGNvbnN0IGluZGV4ID0gbG93ZXJCb3VuZCh0aGlzLmtleXMsIGNsYW1wZWQpO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5rZXlzW2luZGV4XTtcblx0XHRpZiAoZXhpc3RpbmcgJiYgTWF0aC5hYnMoZXhpc3RpbmcudGltZSAtIGNsYW1wZWQpIDwgMWUtOSkge1xuXHRcdFx0ZXhpc3RpbmcudmFsdWUgPSB2YWx1ZTtcblx0XHRcdGlmIChpbnRlcnBvbGF0aW9uKSBleGlzdGluZy5pbnRlcnBvbGF0aW9uID0gaW50ZXJwb2xhdGlvbjtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cdFx0Y29uc3QgcHJldktleSA9IHRoaXMua2V5c1tpbmRleCAtIDFdO1xuXHRcdGNvbnN0IGtleSA9IG1ha2VCZXpUcmlwbGUoY2xhbXBlZCwgdmFsdWUsIGludGVycG9sYXRpb24gPz8gcHJldktleT8uaW50ZXJwb2xhdGlvbiA/PyAnYmV6aWVyJyk7XG5cdFx0dGhpcy5rZXlzLnNwbGljZShpbmRleCwgMCwga2V5KTtcblx0XHRyZXR1cm4ga2V5O1xuXHR9XG5cblx0cmVtb3ZlKHRpbWU6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGluZGV4ID0gbG93ZXJCb3VuZCh0aGlzLmtleXMsIHRpbWUpO1xuXHRcdGNvbnN0IGtleSA9IHRoaXMua2V5c1tpbmRleF07XG5cdFx0aWYgKGtleSAmJiBNYXRoLmFicyhrZXkudGltZSAtIHRpbWUpIDw9IDFlLTMpIHtcblx0XHRcdHRoaXMua2V5cy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IHByZXYgPSB0aGlzLmtleXNbaW5kZXggLSAxXTtcblx0XHRpZiAocHJldiAmJiBNYXRoLmFicyhwcmV2LnRpbWUgLSB0aW1lKSA8PSAxZS0zKSB7XG5cdFx0XHR0aGlzLmtleXMuc3BsaWNlKGluZGV4IC0gMSwgMSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Z2V0KHRpbWU6IG51bWJlcik6IEJlelRyaXBsZSB8IG51bGwge1xuXHRcdGNvbnN0IGluZGV4ID0gbG93ZXJCb3VuZCh0aGlzLmtleXMsIHRpbWUpO1xuXHRcdGNvbnN0IGtleSA9IHRoaXMua2V5c1tpbmRleF07XG5cdFx0aWYgKGtleSAmJiBNYXRoLmFicyhrZXkudGltZSAtIHRpbWUpIDwgMWUtOSkgcmV0dXJuIGtleTtcblx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMua2V5c1tpbmRleCAtIDFdO1xuXHRcdGlmIChwcmV2aW91cyAmJiBNYXRoLmFicyhwcmV2aW91cy50aW1lIC0gdGltZSkgPCAxZS05KSByZXR1cm4gcHJldmlvdXM7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHQvKiogUmVzb2x2ZWQgaGFuZGxlIHBvc2l0aW9uIG9mIHRoZSByaWdodCBoYW5kbGUgb2YgYGtleWAuICovXG5cdHJpZ2h0SGFuZGxlKGtleTogQmV6VHJpcGxlKTogW251bWJlciwgbnVtYmVyXSB7XG5cdFx0aWYgKCFrZXkuYXV0b1JpZ2h0KSByZXR1cm4ga2V5LmhhbmRsZVJpZ2h0O1xuXHRcdGNvbnN0IG5leHQgPSB0aGlzLmtleXNbdGhpcy5rZXlzLmluZGV4T2Yoa2V5KSArIDFdO1xuXHRcdGNvbnN0IHNwYW4gPSBuZXh0ID8gbmV4dC50aW1lIC0ga2V5LnRpbWUgOiAxO1xuXHRcdHJldHVybiBbc3BhbiAvIDMsIDBdO1xuXHR9XG5cblx0LyoqIFJlc29sdmVkIGhhbmRsZSBwb3NpdGlvbiBvZiB0aGUgbGVmdCBoYW5kbGUgb2YgYGtleWAuICovXG5cdGxlZnRIYW5kbGUoa2V5OiBCZXpUcmlwbGUpOiBbbnVtYmVyLCBudW1iZXJdIHtcblx0XHRpZiAoIWtleS5hdXRvTGVmdCkgcmV0dXJuIGtleS5oYW5kbGVMZWZ0O1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5rZXlzLmluZGV4T2Yoa2V5KTtcblx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMua2V5c1tpbmRleCAtIDFdO1xuXHRcdGNvbnN0IHNwYW4gPSBwcmV2aW91cyA/IGtleS50aW1lIC0gcHJldmlvdXMudGltZSA6IDE7XG5cdFx0cmV0dXJuIFstc3BhbiAvIDMsIDBdO1xuXHR9XG5cblx0LyoqXG5cdCAqIExvY2F0ZXMgdGhlIHN1cnJvdW5kaW5nIGtleXMgb2YgYHRpbWVgIGluIE8obG9nIE4pLlxuXHQgKi9cblx0c2VnbWVudCh0aW1lOiBudW1iZXIpOiBGQ3VydmVTZWdtZW50IHwgbnVsbCB7XG5cdFx0Y29uc3Qga2V5cyA9IHRoaXMua2V5cztcblx0XHRjb25zdCBsZW4gPSBrZXlzLmxlbmd0aDtcblx0XHRpZiAobGVuIDwgMikgcmV0dXJuIG51bGw7XG5cdFx0aWYgKHRpbWUgPD0ga2V5c1swXS50aW1lIHx8IHRpbWUgPj0ga2V5c1tsZW4gLSAxXS50aW1lKSByZXR1cm4gbnVsbDtcblx0XHRjb25zdCBpbmRleCA9IHVwcGVyQm91bmQoa2V5cywgdGltZSk7XG5cdFx0Y29uc3QgazAgPSBrZXlzW2luZGV4XTtcblx0XHRjb25zdCBrMSA9IGtleXNbaW5kZXggKyAxXTtcblx0XHRpZiAoIWswIHx8ICFrMSkgcmV0dXJuIG51bGw7XG5cdFx0Y29uc3Qgc3BhbiA9IGsxLnRpbWUgLSBrMC50aW1lO1xuXHRcdGNvbnN0IGZhY3RvciA9IHNwYW4gPiAxZS0xMiA/ICh0aW1lIC0gazAudGltZSkgLyBzcGFuIDogMDtcblx0XHRjb25zdCBoYW5kbGVSaWdodDogW251bWJlciwgbnVtYmVyXSA9IGswLmF1dG9SaWdodCA/IFtzcGFuIC8gMywgMF0gOiBrMC5oYW5kbGVSaWdodDtcblx0XHRjb25zdCBoYW5kbGVMZWZ0OiBbbnVtYmVyLCBudW1iZXJdID0gazEuYXV0b0xlZnQgPyBbLXNwYW4gLyAzLCAwXSA6IGsxLmhhbmRsZUxlZnQ7XG5cdFx0cmV0dXJuIHsgazAsIGsxLCBpbmRleCwgZmFjdG9yLCBoYW5kbGVSaWdodCwgaGFuZGxlTGVmdCB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIEV2YWx1YXRlcyB0aGUgY3VydmUgYXQgYHRpbWVgLlxuXHQgKi9cblx0ZXZhbHVhdGUodGltZTogbnVtYmVyLCBlYXNpbmcgPSB0cnVlKTogbnVtYmVyIHwgbnVsbCB7XG5cdFx0Y29uc3Qga2V5cyA9IHRoaXMua2V5cztcblx0XHRjb25zdCBsZW4gPSBrZXlzLmxlbmd0aDtcblx0XHRpZiAoIWxlbikgcmV0dXJuIG51bGw7XG5cdFx0aWYgKGxlbiA9PT0gMSB8fCB0aW1lIDw9IGtleXNbMF0udGltZSkgcmV0dXJuIGtleXNbMF0udmFsdWU7XG5cdFx0Y29uc3QgbGFzdCA9IGtleXNbbGVuIC0gMV07XG5cdFx0aWYgKHRpbWUgPj0gbGFzdC50aW1lKSByZXR1cm4gbGFzdC52YWx1ZTtcblxuXHRcdGNvbnN0IGluZGV4ID0gdXBwZXJCb3VuZChrZXlzLCB0aW1lKTtcblx0XHRjb25zdCBrMCA9IGtleXNbaW5kZXhdO1xuXHRcdGNvbnN0IGsxID0ga2V5c1tpbmRleCArIDFdO1xuXHRcdGlmICghazAgfHwgIWsxKSByZXR1cm4gbGFzdC52YWx1ZTtcblx0XHRjb25zdCBzcGFuID0gazEudGltZSAtIGswLnRpbWU7XG5cdFx0aWYgKHNwYW4gPD0gMWUtMTIpIHJldHVybiBrMS52YWx1ZTtcblxuXHRcdGNvbnN0IGludGVycCA9IGswLmludGVycG9sYXRpb247XG5cdFx0aWYgKGludGVycCA9PT0gJ2NvbnN0YW50JykgcmV0dXJuIGswLnZhbHVlO1xuXHRcdGNvbnN0IGZhY3RvciA9ICh0aW1lIC0gazAudGltZSkgLyBzcGFuO1xuXHRcdGlmIChpbnRlcnAgPT09ICdsaW5lYXInIHx8ICFlYXNpbmcpIHtcblx0XHRcdHJldHVybiBrMC52YWx1ZSArIChrMS52YWx1ZSAtIGswLnZhbHVlKSAqIGZhY3Rvcjtcblx0XHR9XG5cdFx0Ly8gRmFzdCBwYXRoIGZvciBhdXRvLWNsYW1wZWQgQmV6aWVyIChzbW9vdGhzdGVwKVxuXHRcdGlmIChrMC5hdXRvUmlnaHQgJiYgazEuYXV0b0xlZnQpIHtcblx0XHRcdGNvbnN0IHMgPSBmYWN0b3IgKiBmYWN0b3IgKiAoMyAtIDIgKiBmYWN0b3IpO1xuXHRcdFx0cmV0dXJuIGswLnZhbHVlICsgKGsxLnZhbHVlIC0gazAudmFsdWUpICogcztcblx0XHR9XG5cdFx0Y29uc3QgaGFuZGxlUmlnaHQ6IFtudW1iZXIsIG51bWJlcl0gPSBrMC5hdXRvUmlnaHQgPyBbc3BhbiAvIDMsIDBdIDogazAuaGFuZGxlUmlnaHQ7XG5cdFx0Y29uc3QgaGFuZGxlTGVmdDogW251bWJlciwgbnVtYmVyXSA9IGsxLmF1dG9MZWZ0ID8gWy1zcGFuIC8gMywgMF0gOiBrMS5oYW5kbGVMZWZ0O1xuXHRcdGNvbnN0IHUgPSBzb2x2ZUJlemllclRpbWUoXG5cdFx0XHRrMC50aW1lLFxuXHRcdFx0azAudGltZSArIGhhbmRsZVJpZ2h0WzBdLFxuXHRcdFx0azEudGltZSArIGhhbmRsZUxlZnRbMF0sXG5cdFx0XHRrMS50aW1lLFxuXHRcdFx0dGltZSxcblx0XHQpO1xuXHRcdHJldHVybiBjdWJpYyhrMC52YWx1ZSwgazAudmFsdWUgKyBoYW5kbGVSaWdodFsxXSwgazEudmFsdWUgKyBoYW5kbGVMZWZ0WzFdLCBrMS52YWx1ZSwgdSk7XG5cdH1cblxuXHQvKipcblx0ICogTm9ybWFsaXNlZCBwcm9ncmVzcyBvZiBhIEJlemllciBzZWdtZW50LlxuXHQgKi9cblx0YmV6aWVyRmFjdG9yKHNlZ21lbnQ6IEZDdXJ2ZVNlZ21lbnQsIHRpbWU6IG51bWJlcik6IG51bWJlciB7XG5cdFx0aWYgKHNlZ21lbnQuazAuYXV0b1JpZ2h0ICYmIHNlZ21lbnQuazEuYXV0b0xlZnQpIHtcblx0XHRcdGNvbnN0IGYgPSBzZWdtZW50LmZhY3Rvcjtcblx0XHRcdHJldHVybiBmICogZiAqICgzIC0gMiAqIGYpO1xuXHRcdH1cblx0XHRyZXR1cm4gc29sdmVCZXppZXJUaW1lKFxuXHRcdFx0c2VnbWVudC5rMC50aW1lLFxuXHRcdFx0c2VnbWVudC5rMC50aW1lICsgc2VnbWVudC5oYW5kbGVSaWdodFswXSxcblx0XHRcdHNlZ21lbnQuazEudGltZSArIHNlZ21lbnQuaGFuZGxlTGVmdFswXSxcblx0XHRcdHNlZ21lbnQuazEudGltZSxcblx0XHRcdHRpbWUsXG5cdFx0KTtcblx0fVxufVxuXG4vKiogVGhlIHR3byBrZXlzIHRoYXQgc3Vycm91bmQgYSB0aW1lLCB0b2dldGhlciB3aXRoIHRoZSByZXNvbHZlZCBoYW5kbGVzLiAqL1xuZXhwb3J0IGludGVyZmFjZSBGQ3VydmVTZWdtZW50IHtcblx0azA6IEJlelRyaXBsZTtcblx0azE6IEJlelRyaXBsZTtcblx0aW5kZXg/OiBudW1iZXI7XG5cdGZhY3RvcjogbnVtYmVyO1xuXHRoYW5kbGVSaWdodDogW251bWJlciwgbnVtYmVyXTtcblx0aGFuZGxlTGVmdDogW251bWJlciwgbnVtYmVyXTtcbn1cblxuLyoqIEV2YWx1YXRlcyB0aGUgdmFsdWUgb2YgYSBCZXppZXIgc2VnbWVudCBhdCBgdGltZWAuICovXG5leHBvcnQgZnVuY3Rpb24gZXZhbHVhdGVCZXppZXJTZWdtZW50KHNlZ21lbnQ6IEZDdXJ2ZVNlZ21lbnQsIHRpbWU6IG51bWJlcik6IG51bWJlciB7XG5cdGNvbnN0IHsgazAsIGsxLCBoYW5kbGVSaWdodCwgaGFuZGxlTGVmdCB9ID0gc2VnbWVudDtcblx0aWYgKGswLmF1dG9SaWdodCAmJiBrMS5hdXRvTGVmdCkge1xuXHRcdGNvbnN0IGYgPSBzZWdtZW50LmZhY3Rvcjtcblx0XHRjb25zdCBzID0gZiAqIGYgKiAoMyAtIDIgKiBmKTtcblx0XHRyZXR1cm4gazAudmFsdWUgKyAoazEudmFsdWUgLSBrMC52YWx1ZSkgKiBzO1xuXHR9XG5cdGNvbnN0IHUgPSBzb2x2ZUJlemllclRpbWUoXG5cdFx0azAudGltZSxcblx0XHRrMC50aW1lICsgaGFuZGxlUmlnaHRbMF0sXG5cdFx0azEudGltZSArIGhhbmRsZUxlZnRbMF0sXG5cdFx0azEudGltZSxcblx0XHR0aW1lLFxuXHQpO1xuXHRyZXR1cm4gY3ViaWMoazAudmFsdWUsIGswLnZhbHVlICsgaGFuZGxlUmlnaHRbMV0sIGsxLnZhbHVlICsgaGFuZGxlTGVmdFsxXSwgazEudmFsdWUsIHUpO1xufVxuXG4vKiogRXZhbHVhdGVzIGEgc2V0IG9mIGN1cnZlcyBhbmQgYXNzZW1ibGVzIHRoZW0gaW50byBhIHZlY3Rvci4gKi9cbmV4cG9ydCBmdW5jdGlvbiBldmFsdWF0ZVZlY3Rvcihcblx0Y3VydmVzOiBNYXA8c3RyaW5nLCBGQ3VydmU+LFxuXHRwcmVmaXg6IHN0cmluZyxcblx0dGltZTogbnVtYmVyLFxuXHRlYXNpbmcgPSB0cnVlLFxuXHRmYWxsYmFjayA9IDAsXG4pOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0gfCBudWxsIHtcblx0Y29uc3QgY3ggPSBjdXJ2ZXMuZ2V0KGAke3ByZWZpeH0ueGApO1xuXHRjb25zdCBjeSA9IGN1cnZlcy5nZXQoYCR7cHJlZml4fS55YCk7XG5cdGNvbnN0IGN6ID0gY3VydmVzLmdldChgJHtwcmVmaXh9LnpgKTtcblx0Y29uc3QgeCA9IGN4ID8gY3guZXZhbHVhdGUodGltZSwgZWFzaW5nKSA6IG51bGw7XG5cdGNvbnN0IHkgPSBjeSA/IGN5LmV2YWx1YXRlKHRpbWUsIGVhc2luZykgOiBudWxsO1xuXHRjb25zdCB6ID0gY3ogPyBjei5ldmFsdWF0ZSh0aW1lLCBlYXNpbmcpIDogbnVsbDtcblx0aWYgKHggPT09IG51bGwgJiYgeSA9PT0gbnVsbCAmJiB6ID09PSBudWxsKSByZXR1cm4gbnVsbDtcblx0cmV0dXJuIFt4ID8/IGZhbGxiYWNrLCB5ID8/IGZhbGxiYWNrLCB6ID8/IGZhbGxiYWNrXTtcbn1cblxuLyoqXG4gKiBFdmFsdWF0ZXMgb25lIGNoYW5uZWwuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBldmFsdWF0ZUNoYW5uZWwoY3VydmU6IEZDdXJ2ZSB8IHVuZGVmaW5lZCwgdGltZTogbnVtYmVyLCBlYXNpbmcgPSB0cnVlKTogbnVtYmVyIHwgbnVsbCB7XG5cdGlmICghY3VydmUpIHJldHVybiBudWxsO1xuXHRyZXR1cm4gY3VydmUuZXZhbHVhdGUodGltZSwgZWFzaW5nKTtcbn1cblxuLyoqXG4gKiBFdmFsdWF0ZXMgdGhlIGB2aXNpYmxlYCBjaGFubmVsIGludG8gYSBib29sZWFuIChgPj0gMC41YCBpcyB2aXNpYmxlKSwgb3IgYG51bGxgIGlmIHVua2V5ZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBldmFsdWF0ZVZpc2liaWxpdHkoY3VydmVzOiBNYXA8c3RyaW5nLCBGQ3VydmU+LCB0aW1lOiBudW1iZXIsIGVhc2luZyA9IHRydWUpOiBib29sZWFuIHwgbnVsbCB7XG5cdGNvbnN0IHZpc0N1cnZlID0gY3VydmVzLmdldChWSVNJQklMSVRZX0NIQU5ORUwpO1xuXHRpZiAoIXZpc0N1cnZlIHx8ICF2aXNDdXJ2ZS5rZXlzLmxlbmd0aCkgcmV0dXJuIG51bGw7XG5cdGNvbnN0IHZhbCA9IHZpc0N1cnZlLmV2YWx1YXRlKHRpbWUsIGVhc2luZyk7XG5cdGlmICh2YWwgPT09IG51bGwgfHwgdmFsID09PSB1bmRlZmluZWQpIHJldHVybiBudWxsO1xuXHRyZXR1cm4gdmFsID49IDAuNTtcbn1cblxuLyoqIFF1YXRlcm5pb24gc3RvcmVkIGluIFt3LCB4LCB5LCB6XSBvcmRlciB0byBtYXRjaCBCbGVuZGVyIHJvdGF0aW9uX3F1YXRlcm5pb24gY2hhbm5lbHMuICovXG5leHBvcnQgdHlwZSBRdWF0ID0gW251bWJlciwgbnVtYmVyLCBudW1iZXIsIG51bWJlcl07XG5cbmZ1bmN0aW9uIHF1YXREb3QoYTogUXVhdCwgYjogUXVhdCk6IG51bWJlciB7XG5cdHJldHVybiBhWzBdICogYlswXSArIGFbMV0gKiBiWzFdICsgYVsyXSAqIGJbMl0gKyBhWzNdICogYlszXTtcbn1cblxuZnVuY3Rpb24gcXVhdE5vcm1hbGl6ZShxOiBRdWF0KTogUXVhdCB7XG5cdGNvbnN0IGxlbiA9IE1hdGguaHlwb3QocVswXSwgcVsxXSwgcVsyXSwgcVszXSkgfHwgMTtcblx0cmV0dXJuIFtxWzBdIC8gbGVuLCBxWzFdIC8gbGVuLCBxWzJdIC8gbGVuLCBxWzNdIC8gbGVuXTtcbn1cblxuLyoqXG4gKiBTcGhlcmljYWwgaW50ZXJwb2xhdGlvbiBhbG9uZyB0aGUgc2hvcnRlc3QgcGF0aC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNsZXJwU2hvcnRlc3QoYTogUXVhdCwgYjogUXVhdCwgdDogbnVtYmVyKTogUXVhdCB7XG5cdGxldCBidyA9IGJbMF0sIGJ4ID0gYlsxXSwgYnkgPSBiWzJdLCBieiA9IGJbM107XG5cdGxldCBkb3QgPSBhWzBdICogYncgKyBhWzFdICogYnggKyBhWzJdICogYnkgKyBhWzNdICogYno7XG5cdGlmIChkb3QgPCAwKSB7XG5cdFx0YncgPSAtYnc7XG5cdFx0YnggPSAtYng7XG5cdFx0YnkgPSAtYnk7XG5cdFx0YnogPSAtYno7XG5cdFx0ZG90ID0gLWRvdDtcblx0fVxuXHRpZiAoZG90ID4gMC45OTk1KSB7XG5cdFx0cmV0dXJuIHF1YXROb3JtYWxpemUoW1xuXHRcdFx0YVswXSArIChidyAtIGFbMF0pICogdCxcblx0XHRcdGFbMV0gKyAoYnggLSBhWzFdKSAqIHQsXG5cdFx0XHRhWzJdICsgKGJ5IC0gYVsyXSkgKiB0LFxuXHRcdFx0YVszXSArIChieiAtIGFbM10pICogdCxcblx0XHRdKTtcblx0fVxuXHRjb25zdCB0aGV0YSA9IE1hdGguYWNvcyhNYXRoLm1pbigxLCBNYXRoLm1heCgtMSwgZG90KSkpO1xuXHRjb25zdCBzaW5UaGV0YSA9IE1hdGguc2luKHRoZXRhKTtcblx0Y29uc3Qgd2EgPSBNYXRoLnNpbigoMSAtIHQpICogdGhldGEpIC8gc2luVGhldGE7XG5cdGNvbnN0IHdiID0gTWF0aC5zaW4odCAqIHRoZXRhKSAvIHNpblRoZXRhO1xuXHRyZXR1cm4gW1xuXHRcdGFbMF0gKiB3YSArIGJ3ICogd2IsXG5cdFx0YVsxXSAqIHdhICsgYnggKiB3Yixcblx0XHRhWzJdICogd2EgKyBieSAqIHdiLFxuXHRcdGFbM10gKiB3YSArIGJ6ICogd2IsXG5cdF07XG59XG5cbi8qKiBFdmFsdWF0ZXMgdGhlIGZvdXIgcXVhdGVybmlvbiBjaGFubmVscyBpbnRvIGEgbm9ybWFsaXNlZCBxdWF0ZXJuaW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGV2YWx1YXRlUXVhdGVybmlvbihjdXJ2ZXM6IE1hcDxzdHJpbmcsIEZDdXJ2ZT4sIHRpbWU6IG51bWJlciwgZWFzaW5nID0gdHJ1ZSk6IFF1YXQgfCBudWxsIHtcblx0Y29uc3QgdyA9IGN1cnZlcy5nZXQoJ3JvdGF0aW9uX3F1YXRlcm5pb24udycpO1xuXHRjb25zdCB3S2V5cyA9IHc/LmtleXM7XG5cdGlmICghdyB8fCAhd0tleXMgfHwgIXdLZXlzLmxlbmd0aCkgcmV0dXJuIG51bGw7XG5cdGNvbnN0IHggPSBjdXJ2ZXMuZ2V0KCdyb3RhdGlvbl9xdWF0ZXJuaW9uLngnKTtcblx0Y29uc3QgeSA9IGN1cnZlcy5nZXQoJ3JvdGF0aW9uX3F1YXRlcm5pb24ueScpO1xuXHRjb25zdCB6ID0gY3VydmVzLmdldCgncm90YXRpb25fcXVhdGVybmlvbi56Jyk7XG5cdGlmICgheCB8fCAheSB8fCAheikgcmV0dXJuIG51bGw7XG5cblx0Y29uc3QgbGVuID0gd0tleXMubGVuZ3RoO1xuXHRjb25zdCB4S2V5cyA9IHgua2V5cztcblx0Y29uc3QgeUtleXMgPSB5LmtleXM7XG5cdGNvbnN0IHpLZXlzID0gei5rZXlzO1xuXHRjb25zdCBhbGlnbmVkID0geEtleXMubGVuZ3RoID09PSBsZW4gJiYgeUtleXMubGVuZ3RoID09PSBsZW4gJiYgektleXMubGVuZ3RoID09PSBsZW47XG5cblx0aWYgKGxlbiA9PT0gMSB8fCB0aW1lIDw9IHdLZXlzWzBdLnRpbWUpIHtcblx0XHRpZiAoYWxpZ25lZCkge1xuXHRcdFx0cmV0dXJuIHF1YXROb3JtYWxpemUoW3dLZXlzWzBdLnZhbHVlLCB4S2V5c1swXS52YWx1ZSwgeUtleXNbMF0udmFsdWUsIHpLZXlzWzBdLnZhbHVlXSk7XG5cdFx0fVxuXHRcdHJldHVybiBxdWF0Tm9ybWFsaXplKFtcblx0XHRcdHcuZXZhbHVhdGUodGltZSwgZWFzaW5nKSA/PyAxLFxuXHRcdFx0eC5ldmFsdWF0ZSh0aW1lLCBlYXNpbmcpID8/IDAsXG5cdFx0XHR5LmV2YWx1YXRlKHRpbWUsIGVhc2luZykgPz8gMCxcblx0XHRcdHouZXZhbHVhdGUodGltZSwgZWFzaW5nKSA/PyAwLFxuXHRcdF0pO1xuXHR9XG5cdGlmICh0aW1lID49IHdLZXlzW2xlbiAtIDFdLnRpbWUpIHtcblx0XHRjb25zdCBsYXN0ID0gbGVuIC0gMTtcblx0XHRpZiAoYWxpZ25lZCkge1xuXHRcdFx0cmV0dXJuIHF1YXROb3JtYWxpemUoW3dLZXlzW2xhc3RdLnZhbHVlLCB4S2V5c1tsYXN0XS52YWx1ZSwgeUtleXNbbGFzdF0udmFsdWUsIHpLZXlzW2xhc3RdLnZhbHVlXSk7XG5cdFx0fVxuXHRcdHJldHVybiBxdWF0Tm9ybWFsaXplKFtcblx0XHRcdHcuZXZhbHVhdGUodGltZSwgZWFzaW5nKSA/PyAxLFxuXHRcdFx0eC5ldmFsdWF0ZSh0aW1lLCBlYXNpbmcpID8/IDAsXG5cdFx0XHR5LmV2YWx1YXRlKHRpbWUsIGVhc2luZykgPz8gMCxcblx0XHRcdHouZXZhbHVhdGUodGltZSwgZWFzaW5nKSA/PyAwLFxuXHRcdF0pO1xuXHR9XG5cblx0Y29uc3Qgc2VnbWVudCA9IHcuc2VnbWVudCh0aW1lKTtcblx0aWYgKCFzZWdtZW50KSB7XG5cdFx0cmV0dXJuIHF1YXROb3JtYWxpemUoW1xuXHRcdFx0dy5ldmFsdWF0ZSh0aW1lLCBlYXNpbmcpID8/IDEsXG5cdFx0XHR4LmV2YWx1YXRlKHRpbWUsIGVhc2luZykgPz8gMCxcblx0XHRcdHkuZXZhbHVhdGUodGltZSwgZWFzaW5nKSA/PyAwLFxuXHRcdFx0ei5ldmFsdWF0ZSh0aW1lLCBlYXNpbmcpID8/IDAsXG5cdFx0XSk7XG5cdH1cblxuXHRjb25zdCBpZHggPSBzZWdtZW50LmluZGV4ID8/IDA7XG5cdGxldCBxMDogUXVhdDtcblx0bGV0IHExOiBRdWF0O1xuXHRpZiAoXG5cdFx0YWxpZ25lZCAmJlxuXHRcdHhLZXlzW2lkeF0udGltZSA9PT0gc2VnbWVudC5rMC50aW1lICYmXG5cdFx0eEtleXNbaWR4ICsgMV0udGltZSA9PT0gc2VnbWVudC5rMS50aW1lXG5cdCkge1xuXHRcdHEwID0gcXVhdE5vcm1hbGl6ZShbd0tleXNbaWR4XS52YWx1ZSwgeEtleXNbaWR4XS52YWx1ZSwgeUtleXNbaWR4XS52YWx1ZSwgektleXNbaWR4XS52YWx1ZV0pO1xuXHRcdHExID0gcXVhdE5vcm1hbGl6ZShbXG5cdFx0XHR3S2V5c1tpZHggKyAxXS52YWx1ZSxcblx0XHRcdHhLZXlzW2lkeCArIDFdLnZhbHVlLFxuXHRcdFx0eUtleXNbaWR4ICsgMV0udmFsdWUsXG5cdFx0XHR6S2V5c1tpZHggKyAxXS52YWx1ZSxcblx0XHRdKTtcblx0fSBlbHNlIHtcblx0XHRjb25zdCB0MCA9IHNlZ21lbnQuazAudGltZTtcblx0XHRjb25zdCB0MSA9IHNlZ21lbnQuazEudGltZTtcblx0XHRxMCA9IHF1YXROb3JtYWxpemUoW1xuXHRcdFx0dy5ldmFsdWF0ZSh0MCwgZWFzaW5nKSA/PyAxLFxuXHRcdFx0eC5ldmFsdWF0ZSh0MCwgZWFzaW5nKSA/PyAwLFxuXHRcdFx0eS5ldmFsdWF0ZSh0MCwgZWFzaW5nKSA/PyAwLFxuXHRcdFx0ei5ldmFsdWF0ZSh0MCwgZWFzaW5nKSA/PyAwLFxuXHRcdF0pO1xuXHRcdHExID0gcXVhdE5vcm1hbGl6ZShbXG5cdFx0XHR3LmV2YWx1YXRlKHQxLCBlYXNpbmcpID8/IDEsXG5cdFx0XHR4LmV2YWx1YXRlKHQxLCBlYXNpbmcpID8/IDAsXG5cdFx0XHR5LmV2YWx1YXRlKHQxLCBlYXNpbmcpID8/IDAsXG5cdFx0XHR6LmV2YWx1YXRlKHQxLCBlYXNpbmcpID8/IDAsXG5cdFx0XSk7XG5cdH1cblxuXHRpZiAoc2VnbWVudC5rMC5pbnRlcnBvbGF0aW9uID09PSAnY29uc3RhbnQnKSByZXR1cm4gcTA7XG5cdGNvbnN0IGZhY3RvciA9XG5cdFx0c2VnbWVudC5rMC5pbnRlcnBvbGF0aW9uID09PSAnbGluZWFyJyB8fCAhZWFzaW5nXG5cdFx0XHQ/IHNlZ21lbnQuZmFjdG9yXG5cdFx0XHQ6IHcuYmV6aWVyRmFjdG9yKHNlZ21lbnQsIHRpbWUpO1xuXHRyZXR1cm4gc2xlcnBTaG9ydGVzdChxMCwgcTEsIGZhY3Rvcik7XG59XG5cbi8qKiBJbnRlcnBvbGF0ZXMgYmV0d2VlbiB0d28ga2V5IHZhbHVlcyBvZiBhIHF1YXRlcm5pb24gY2hhbm5lbCBncm91cC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBibGVuZFF1YXQoYTogUXVhdCwgYjogUXVhdCwgdDogbnVtYmVyKTogUXVhdCB7XG5cdHJldHVybiBzbGVycFNob3J0ZXN0KGEsIGIsIHQpO1xufVxuXG4vKiogQnVpbGRzIGEgW3csIHgsIHksIHpdIHF1YXRlcm5pb24gZnJvbSBhbiBheGlzIGFuZCBhbiBhbmdsZSBpbiByYWRpYW5zLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHF1YXRGcm9tQXhpc0FuZ2xlKGF4aXM6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSwgYW5nbGU6IG51bWJlcik6IFF1YXQge1xuXHRjb25zdCBsZW5ndGggPSBNYXRoLmh5cG90KGF4aXNbMF0sIGF4aXNbMV0sIGF4aXNbMl0pIHx8IDE7XG5cdGNvbnN0IGhhbGYgPSBNYXRoLnNpbihhbmdsZSAvIDIpO1xuXHRyZXR1cm4gW1xuXHRcdE1hdGguY29zKGFuZ2xlIC8gMiksXG5cdFx0KGF4aXNbMF0gLyBsZW5ndGgpICogaGFsZixcblx0XHQoYXhpc1sxXSAvIGxlbmd0aCkgKiBoYWxmLFxuXHRcdChheGlzWzJdIC8gbGVuZ3RoKSAqIGhhbGYsXG5cdF07XG59XG5cbi8qKiBNdWx0aXBsaWVzIHR3byBbdywgeCwgeSwgel0gcXVhdGVybmlvbnMsIHRoZSByZXN1bHQgYXBwbGllcyBgYmAgZmlyc3QuICovXG5leHBvcnQgZnVuY3Rpb24gcXVhdE11bChhOiBRdWF0LCBiOiBRdWF0KTogUXVhdCB7XG5cdGNvbnN0IGF3ID0gYVswXSwgYXggPSBhWzFdLCBheSA9IGFbMl0sIGF6ID0gYVszXTtcblx0Y29uc3QgYncgPSBiWzBdLCBieCA9IGJbMV0sIGJ5ID0gYlsyXSwgYnogPSBiWzNdO1xuXHRyZXR1cm4gW1xuXHRcdGF3ICogYncgLSBheCAqIGJ4IC0gYXkgKiBieSAtIGF6ICogYnosXG5cdFx0YXcgKiBieCArIGF4ICogYncgKyBheSAqIGJ6IC0gYXogKiBieSxcblx0XHRhdyAqIGJ5IC0gYXggKiBieiArIGF5ICogYncgKyBheiAqIGJ4LFxuXHRcdGF3ICogYnogKyBheCAqIGJ5IC0gYXkgKiBieCArIGF6ICogYncsXG5cdF07XG59XG5cbi8qKiBDb252ZXJ0cyBhbiBYWVogZXVsZXIgdHJpcGxlIChyYWRpYW5zKSBpbnRvIGEgW3csIHgsIHksIHpdIHF1YXRlcm5pb24uICovXG5leHBvcnQgZnVuY3Rpb24gZXVsZXJUb1F1YXQoZXVsZXI6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSk6IFF1YXQge1xuXHRjb25zdCBbcngsIHJ5LCByel0gPSBldWxlcjtcblx0Y29uc3QgY3ggPSBNYXRoLmNvcyhyeCAvIDIpO1xuXHRjb25zdCBzeCA9IE1hdGguc2luKHJ4IC8gMik7XG5cdGNvbnN0IGN5ID0gTWF0aC5jb3MocnkgLyAyKTtcblx0Y29uc3Qgc3kgPSBNYXRoLnNpbihyeSAvIDIpO1xuXHRjb25zdCBjeiA9IE1hdGguY29zKHJ6IC8gMik7XG5cdGNvbnN0IHN6ID0gTWF0aC5zaW4ocnogLyAyKTtcblx0cmV0dXJuIFtcblx0XHRjeCAqIGN5ICogY3ogKyBzeCAqIHN5ICogc3osXG5cdFx0c3ggKiBjeSAqIGN6IC0gY3ggKiBzeSAqIHN6LFxuXHRcdGN4ICogc3kgKiBjeiArIHN4ICogY3kgKiBzeixcblx0XHRjeCAqIGN5ICogc3ogLSBzeCAqIHN5ICogY3osXG5cdF07XG59XG5cbi8qKiBUaGUgaW52ZXJzZSBvZiBhIHVuaXQgW3csIHgsIHksIHpdIHF1YXRlcm5pb24gaXMgaXRzIGNvbmp1Z2F0ZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBxdWF0Q29uanVnYXRlKHE6IFF1YXQpOiBRdWF0IHtcblx0cmV0dXJuIFtxWzBdLCAtcVsxXSwgLXFbMl0sIC1xWzNdXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHF1YXRUb0V1bGVyKHE6IFF1YXQpOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0ge1xuXHRjb25zdCBbdywgeCwgeSwgel0gPSBxdWF0Tm9ybWFsaXplKHEpO1xuXHRjb25zdCBzaW5yID0gMiAqICh3ICogeCArIHkgKiB6KTtcblx0Y29uc3QgY29zciA9IDEgLSAyICogKHggKiB4ICsgeSAqIHkpO1xuXHRjb25zdCByb2xsID0gTWF0aC5hdGFuMihzaW5yLCBjb3NyKTtcblx0bGV0IHNpbnAgPSAyICogKHcgKiB5IC0geiAqIHgpO1xuXHRzaW5wID0gTWF0aC5taW4oMSwgTWF0aC5tYXgoLTEsIHNpbnApKTtcblx0Y29uc3QgcGl0Y2ggPSBNYXRoLmFzaW4oc2lucCk7XG5cdGNvbnN0IHNpbnkgPSAyICogKHcgKiB6ICsgeCAqIHkpO1xuXHRjb25zdCBjb3N5ID0gMSAtIDIgKiAoeSAqIHkgKyB6ICogeik7XG5cdGNvbnN0IHlhdyA9IE1hdGguYXRhbjIoc2lueSwgY29zeSk7XG5cdHJldHVybiBbcm9sbCwgcGl0Y2gsIHlhd107XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBldWxlclRvUXVhdENsb3Nlc3QoZXVsZXI6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSwgcmVmZXJlbmNlOiBRdWF0KTogUXVhdCB7XG5cdGNvbnN0IGNhbmRpZGF0ZSA9IGV1bGVyVG9RdWF0KGV1bGVyKTtcblx0Y29uc3QgbmVnYXRlZDogUXVhdCA9IFstY2FuZGlkYXRlWzBdLCAtY2FuZGlkYXRlWzFdLCAtY2FuZGlkYXRlWzJdLCAtY2FuZGlkYXRlWzNdXTtcblx0cmV0dXJuIHF1YXREb3QoY2FuZGlkYXRlLCByZWZlcmVuY2UpID49IHF1YXREb3QobmVnYXRlZCwgcmVmZXJlbmNlKSA/IGNhbmRpZGF0ZSA6IG5lZ2F0ZWQ7XG59XG4iXSwibWFwcGluZ3MiOiJBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQSxPQUFPLE1BQU0sb0JBQW9CLEdBQUcsSUFBSTtBQW9CeEMsT0FBTyxNQUFNLGtCQUFrQixHQUFHLFNBQWtCO0FBRXBELE9BQU8sTUFBTSxhQUFhLEdBQUcsQ0FDNUIsWUFBWSxFQUNaLFlBQVksRUFDWixZQUFZLEVBQ1osdUJBQXVCLEVBQ3ZCLHVCQUF1QixFQUN2Qix1QkFBdUIsRUFDdkIsdUJBQXVCLEVBQ3ZCLFNBQVMsRUFDVCxTQUFTLEVBQ1QsU0FBUyxFQUNULFNBQVMsRUFDVCxrQkFBa0IsRUFDbEIsa0JBQWtCLEVBQ2xCLGtCQUFrQixFQUNsQixrQkFBa0IsQ0FDVDtBQUlWLE9BQU8sTUFBTSxrQkFBaUMsR0FBRyxDQUNoRCxZQUFZLEVBQ1osWUFBWSxFQUNaLFlBQVksRUFDWix1QkFBdUIsRUFDdkIsdUJBQXVCLEVBQ3ZCLHVCQUF1QixFQUN2Qix1QkFBdUIsRUFDdkIsU0FBUyxFQUNULFNBQVMsRUFDVCxTQUFTLENBQ1Q7QUFFRCxPQUFPLE1BQU0saUJBQWdDLEdB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QUFNLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSTtJQUN0QixNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsTUFBTTtJQUN2QixJQUFJLENBQUMsR0FBRyxFQUFFLE9BQU8sSUFBSTtJQUNyQixJQUFJLEdBQUcsS0FBSyxDQUFDLElBQUksSUFBSSxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSztJQUMzRCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQztJQUMxQixJQUFJLElBQUksSUFBSSxJQUFJLENBQUMsSUFBSSxFQUFFLE9BQU8sSUFBSSxDQUFDLEtBQUs7SUFFeEMsTUFBTSxLQUFLLEdBQUcsVUFBVSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUM7SUFDcEMsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQztJQUN0QixNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQztJQUMxQixJQUFJLENBQUMsRUFBRSxJQUFJLENBQUMsRUFBRSxFQUFFLE9BQU8sSUFBSSxDQUFDLEtBQUs7SUFDakMsTUFBTSxJQUFJLEdBQUcsRUFBRSxDQUFDLElBQUksR0FBRyxFQUFFLENBQUMsSUFBSTtJQUM5QixJQUFJLElBQUksSUFBSSxLQUFLLEVBQUUsT0FBTyxFQUFFLENBQUMsS0FBSztJQUVsQyxNQUFNLE1BQU0sR0FBRyxFQUFFLENBQUMsYUFBYTtJQUMvQixJQUFJLE1BQU0sS0FBSyxVQUFVLEVBQUUsT0FBTyxFQUFFLENBQUMsS0FBSztJQUMxQyxNQUFNLE1BQU0sR0FBRyxDQUFDLElBQUksR0FBRyxFQUFFLENBQUMsSUFBSSxJQUFJLElBQUk7SUFDdEMsSUFBSSxNQUFNLEtBQUssUUFBUSxJQUFJLENBQUMsTUFBTSxFQUFFO01BQ25DLE9BQU8sRUFBRSxDQUFDLEtBQUssR0FBRyxDQUFDLEVBQUUsQ0FBQyxLQUFLLEdBQUcsRUFBRSxDQUFDLEtBQUss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QUUsR0FBRyxFQUFFLEVBQ3JDLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQ3JDLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQ3JDLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQ3JDO0FBQ0Y7O0FBRUE7QUFDQSxPQUFPLFNBQVMsV0FBVyxDQUFDLEtBQStCLEVBQVE7RUFDbEUsTUFBTSxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLEdBQUcsS0FBSztFQUMxQixNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7RUFDM0IsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0VBQzNCLE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztFQUMzQixNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7RUFDM0IsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0VBQzNCLE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztFQUMzQixPQUFPLENBQ04sRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQzNCLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxFQUMzQixFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsRUFDM0IsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQzNCO0FBQ0Y7O0FBRUE7QUFDQSxPQUFPLFNBQVMsYUFBYSxDQUFDLENBQU8sRUFBUTtFQUM1QyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ25DO0FBRUEsT0FBTyxTQUFTLFdBQVcsQ0FBQyxDQUFPLEVBQTRCO0VBQzlELE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxhQUFhLENBQUMsQ0FBQyxDQUFDO0VBQ3JDLE1BQU0sSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7RUFDaEMsTUFBTSxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7RUFDcEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDO0VBQ25DLElBQUksSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7RUFDOUIsSUFBSSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7RUFDdEMsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7RUFDN0IsTUFBTSxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztFQUNoQyxNQUFNLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztFQUNwQyxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUM7RUFDbEMsT0FBTyxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDO0FBQzFCO0FBRUEsT0FBTyxTQUFTLGtCQUFrQixDQUFDLEtBQStCLEVBQUUsU0FBZSxFQUFRO0VBQzFGLE1BQU0sU0FBUyxHQUFHLFdBQVcsQ0FBQyxLQUFLLENBQUM7RUFDcEMsTUFBTSxPQUFhLEdBQUcsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztFQUNsRixPQUFPLE9BQU8sQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDLElBQUksT0FBTyxDQUFDLE9BQU8sRUFBRSxTQUFTLENBQUMsR0FBRyxTQUFTLEdBQUcsT0FBTztBQUMxRiIsImlnbm9yZUxpc3QiOltdfQ==