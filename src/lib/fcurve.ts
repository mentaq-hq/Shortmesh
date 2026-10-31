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

export type Interpolation = 'constant' | 'linear' | 'bezier';

export interface BezTriple {
	/** Key position on the timeline, in seconds. */
	time: number;
	/** Key value. */
	value: number;
	/** Interpolation used for the segment that *starts* at this key. */
	interpolation: Interpolation;
	/** Left handle as a (time, value) offset relative to the key. */
	handleLeft: [number, number];
	/** Right handle as a (time, value) offset relative to the key. */
	handleRight: [number, number];
	/** When true the handle is derived from the neighbouring keys. */
	autoLeft: boolean;
	autoRight: boolean;
}

export const VISIBILITY_CHANNEL = 'visible' as const;

export const CHANNEL_PATHS = [
	'location.x',
	'location.y',
	'location.z',
	'rotation_quaternion.w',
	'rotation_quaternion.x',
	'rotation_quaternion.y',
	'rotation_quaternion.z',
	'scale.x',
	'scale.y',
	'scale.z',
	'visible',
	'material.opacity',
	'material.color.r',
	'material.color.g',
	'material.color.b',
] as const;

export type ChannelPath = (typeof CHANNEL_PATHS)[number];

export const TRANSFORM_CHANNELS: ChannelPath[] = [
	'location.x',
	'location.y',
	'location.z',
	'rotation_quaternion.w',
	'rotation_quaternion.x',
	'rotation_quaternion.y',
	'rotation_quaternion.z',
	'scale.x',
	'scale.y',
	'scale.z',
];

export const MATERIAL_CHANNELS: ChannelPath[] = [
	'material.opacity',
	'material.color.r',
	'material.color.g',
	'material.color.b',
];

/** Converts a timeline time (seconds) to the nearest integer frame number at `fps`. */
export function timeToFrame(time: number, fps: number): number {
	const rate = Math.max(1, fps);
	return Math.round(Math.max(0, time) * rate);
}

/** Converts a frame number to timeline time (seconds) at `fps`. */
export function frameToTime(frame: number, fps: number): number {
	const rate = Math.max(1, fps);
	return Math.round((Math.max(0, frame) / rate) * 10000) / 10000;
}

export function makeBezTriple(time: number, value: number, interpolation: Interpolation = 'bezier'): BezTriple {
	return {
		time,
		value,
		interpolation,
		handleLeft: [-1 / 3, 0],
		handleRight: [1 / 3, 0],
		autoLeft: true,
		autoRight: true,
	};
}

/** Index of the first key whose time is greater than or equal to `time`. */
export function lowerBound(keys: BezTriple[], time: number): number {
	let low = 0;
	let high = keys.length;
	while (low < high) {
		const mid = (low + high) >>> 1;
		if (keys[mid].time < time) low = mid + 1;
		else high = mid;
	}
	return low;
}

/** Index of the last key whose time is less than or equal to `time`. */
export function upperBound(keys: BezTriple[], time: number): number {
	let low = 0;
	let high = keys.length;
	while (low < high) {
		const mid = (low + high) >>> 1;
		if (keys[mid].time <= time) low = mid + 1;
		else high = mid;
	}
	return low - 1;
}

function cubic(value0: number, value1: number, value2: number, value3: number, t: number): number {
	const u = 1 - t;
	const u2 = u * u;
	const u3 = u2 * u;
	const t2 = t * t;
	const t3 = t2 * t;
	return u3 * value0 + 3 * u2 * t * value1 + 3 * u * t2 * value2 + t3 * value3;
}

function cubicDerivative(value0: number, value1: number, value2: number, value3: number, t: number): number {
	const u = 1 - t;
	return 3 * u * u * (value1 - value0) + 6 * u * t * (value2 - value1) + 3 * t * t * (value3 - value2);
}

/**
 * Inverts the time component of a cubic Bezier.
 * Includes an exact O(1) fast path when the control points are evenly spaced at 1/3 and 2/3.
 */
export function solveBezierTime(x0: number, x1: number, x2: number, x3: number, target: number): number {
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
		if (x < target) low = u;
		else high = u;
		u = (low + high) / 2;
	}
	return u;
}

/** A single animated channel: an ordered list of keyframes. */
export class FCurve {
	path: string;
	keys: BezTriple[];

	constructor(path: string) {
		this.path = path;
		this.keys = [];
	}

	get length(): number {
		return this.keys.length;
	}

	/** Inserts or replaces the key at `time`, keeping the list sorted. */
	insert(time: number, value: number, interpolation?: Interpolation): BezTriple {
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

	remove(time: number): boolean {
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

	get(time: number): BezTriple | null {
		const index = lowerBound(this.keys, time);
		const key = this.keys[index];
		if (key && Math.abs(key.time - time) < 1e-9) return key;
		const previous = this.keys[index - 1];
		if (previous && Math.abs(previous.time - time) < 1e-9) return previous;
		return null;
	}

	/** Resolved handle position of the right handle of `key`. */
	rightHandle(key: BezTriple): [number, number] {
		if (!key.autoRight) return key.handleRight;
		const next = this.keys[this.keys.indexOf(key) + 1];
		const span = next ? next.time - key.time : 1;
		return [span / 3, 0];
	}

	/** Resolved handle position of the left handle of `key`. */
	leftHandle(key: BezTriple): [number, number] {
		if (!key.autoLeft) return key.handleLeft;
		const index = this.keys.indexOf(key);
		const previous = this.keys[index - 1];
		const span = previous ? key.time - previous.time : 1;
		return [-span / 3, 0];
	}

	/**
	 * Locates the surrounding keys of `time` in O(log N).
	 */
	segment(time: number): FCurveSegment | null {
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
		const handleRight: [number, number] = k0.autoRight ? [span / 3, 0] : k0.handleRight;
		const handleLeft: [number, number] = k1.autoLeft ? [-span / 3, 0] : k1.handleLeft;
		return { k0, k1, index, factor, handleRight, handleLeft };
	}

	/**
	 * Evaluates the curve at `time`.
	 */
	evaluate(time: number, easing = true): number | null {
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
		const handleRight: [number, number] = k0.autoRight ? [span / 3, 0] : k0.handleRight;
		const handleLeft: [number, number] = k1.autoLeft ? [-span / 3, 0] : k1.handleLeft;
		const u = solveBezierTime(
			k0.time,
			k0.time + handleRight[0],
			k1.time + handleLeft[0],
			k1.time,
			time,
		);
		return cubic(k0.value, k0.value + handleRight[1], k1.value + handleLeft[1], k1.value, u);
	}

	/**
	 * Normalised progress of a Bezier segment.
	 */
	bezierFactor(segment: FCurveSegment, time: number): number {
		if (segment.k0.autoRight && segment.k1.autoLeft) {
			const f = segment.factor;
			return f * f * (3 - 2 * f);
		}
		return solveBezierTime(
			segment.k0.time,
			segment.k0.time + segment.handleRight[0],
			segment.k1.time + segment.handleLeft[0],
			segment.k1.time,
			time,
		);
	}
}

/** The two keys that surround a time, together with the resolved handles. */
export interface FCurveSegment {
	k0: BezTriple;
	k1: BezTriple;
	index?: number;
	factor: number;
	handleRight: [number, number];
	handleLeft: [number, number];
}

/** Evaluates the value of a Bezier segment at `time`. */
export function evaluateBezierSegment(segment: FCurveSegment, time: number): number {
	const { k0, k1, handleRight, handleLeft } = segment;
	if (k0.autoRight && k1.autoLeft) {
		const f = segment.factor;
		const s = f * f * (3 - 2 * f);
		return k0.value + (k1.value - k0.value) * s;
	}
	const u = solveBezierTime(
		k0.time,
		k0.time + handleRight[0],
		k1.time + handleLeft[0],
		k1.time,
		time,
	);
	return cubic(k0.value, k0.value + handleRight[1], k1.value + handleLeft[1], k1.value, u);
}

/** Evaluates a set of curves and assembles them into a vector. */
export function evaluateVector(
	curves: Map<string, FCurve>,
	prefix: string,
	time: number,
	easing = true,
	fallback = 0,
): [number, number, number] | null {
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
export function evaluateChannel(curve: FCurve | undefined, time: number, easing = true): number | null {
	if (!curve) return null;
	return curve.evaluate(time, easing);
}

/**
 * Evaluates the `visible` channel into a boolean (`>= 0.5` is visible), or `null` if unkeyed.
 */
export function evaluateVisibility(curves: Map<string, FCurve>, time: number, easing = true): boolean | null {
	const visCurve = curves.get(VISIBILITY_CHANNEL);
	if (!visCurve || !visCurve.keys.length) return null;
	const val = visCurve.evaluate(time, easing);
	if (val === null || val === undefined) return null;
	return val >= 0.5;
}

/** Quaternion stored in [w, x, y, z] order to match Blender rotation_quaternion channels. */
export type Quat = [number, number, number, number];

function quatDot(a: Quat, b: Quat): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}

function quatNormalize(q: Quat): Quat {
	const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
	return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

/**
 * Spherical interpolation along the shortest path.
 */
export function slerpShortest(a: Quat, b: Quat, t: number): Quat {
	let bw = b[0], bx = b[1], by = b[2], bz = b[3];
	let dot = a[0] * bw + a[1] * bx + a[2] * by + a[3] * bz;
	if (dot < 0) {
		bw = -bw;
		bx = -bx;
		by = -by;
		bz = -bz;
		dot = -dot;
	}
	if (dot > 0.9995) {
		return quatNormalize([
			a[0] + (bw - a[0]) * t,
			a[1] + (bx - a[1]) * t,
			a[2] + (by - a[2]) * t,
			a[3] + (bz - a[3]) * t,
		]);
	}
	const theta = Math.acos(Math.min(1, Math.max(-1, dot)));
	const sinTheta = Math.sin(theta);
	const wa = Math.sin((1 - t) * theta) / sinTheta;
	const wb = Math.sin(t * theta) / sinTheta;
	return [
		a[0] * wa + bw * wb,
		a[1] * wa + bx * wb,
		a[2] * wa + by * wb,
		a[3] * wa + bz * wb,
	];
}

/** Evaluates the four quaternion channels into a normalised quaternion. */
export function evaluateQuaternion(curves: Map<string, FCurve>, time: number, easing = true): Quat | null {
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
		return quatNormalize([
			w.evaluate(time, easing) ?? 1,
			x.evaluate(time, easing) ?? 0,
			y.evaluate(time, easing) ?? 0,
			z.evaluate(time, easing) ?? 0,
		]);
	}
	if (time >= wKeys[len - 1].time) {
		const last = len - 1;
		if (aligned) {
			return quatNormalize([wKeys[last].value, xKeys[last].value, yKeys[last].value, zKeys[last].value]);
		}
		return quatNormalize([
			w.evaluate(time, easing) ?? 1,
			x.evaluate(time, easing) ?? 0,
			y.evaluate(time, easing) ?? 0,
			z.evaluate(time, easing) ?? 0,
		]);
	}

	const segment = w.segment(time);
	if (!segment) {
		return quatNormalize([
			w.evaluate(time, easing) ?? 1,
			x.evaluate(time, easing) ?? 0,
			y.evaluate(time, easing) ?? 0,
			z.evaluate(time, easing) ?? 0,
		]);
	}

	const idx = segment.index ?? 0;
	let q0: Quat;
	let q1: Quat;
	if (
		aligned &&
		xKeys[idx].time === segment.k0.time &&
		xKeys[idx + 1].time === segment.k1.time
	) {
		q0 = quatNormalize([wKeys[idx].value, xKeys[idx].value, yKeys[idx].value, zKeys[idx].value]);
		q1 = quatNormalize([
			wKeys[idx + 1].value,
			xKeys[idx + 1].value,
			yKeys[idx + 1].value,
			zKeys[idx + 1].value,
		]);
	} else {
		const t0 = segment.k0.time;
		const t1 = segment.k1.time;
		q0 = quatNormalize([
			w.evaluate(t0, easing) ?? 1,
			x.evaluate(t0, easing) ?? 0,
			y.evaluate(t0, easing) ?? 0,
			z.evaluate(t0, easing) ?? 0,
		]);
		q1 = quatNormalize([
			w.evaluate(t1, easing) ?? 1,
			x.evaluate(t1, easing) ?? 0,
			y.evaluate(t1, easing) ?? 0,
			z.evaluate(t1, easing) ?? 0,
		]);
	}

	if (segment.k0.interpolation === 'constant') return q0;
	const factor =
		segment.k0.interpolation === 'linear' || !easing
			? segment.factor
			: w.bezierFactor(segment, time);
	return slerpShortest(q0, q1, factor);
}

/** Interpolates between two key values of a quaternion channel group. */
export function blendQuat(a: Quat, b: Quat, t: number): Quat {
	return slerpShortest(a, b, t);
}

/** Builds a [w, x, y, z] quaternion from an axis and an angle in radians. */
export function quatFromAxisAngle(axis: [number, number, number], angle: number): Quat {
	const length = Math.hypot(axis[0], axis[1], axis[2]) || 1;
	const half = Math.sin(angle / 2);
	return [
		Math.cos(angle / 2),
		(axis[0] / length) * half,
		(axis[1] / length) * half,
		(axis[2] / length) * half,
	];
}

/** Multiplies two [w, x, y, z] quaternions, the result applies `b` first. */
export function quatMul(a: Quat, b: Quat): Quat {
	const aw = a[0], ax = a[1], ay = a[2], az = a[3];
	const bw = b[0], bx = b[1], by = b[2], bz = b[3];
	return [
		aw * bw - ax * bx - ay * by - az * bz,
		aw * bx + ax * bw + ay * bz - az * by,
		aw * by - ax * bz + ay * bw + az * bx,
		aw * bz + ax * by - ay * bx + az * bw,
	];
}

/** Converts an XYZ euler triple (radians) into a [w, x, y, z] quaternion. */
export function eulerToQuat(euler: [number, number, number]): Quat {
	const [rx, ry, rz] = euler;
	const cx = Math.cos(rx / 2);
	const sx = Math.sin(rx / 2);
	const cy = Math.cos(ry / 2);
	const sy = Math.sin(ry / 2);
	const cz = Math.cos(rz / 2);
	const sz = Math.sin(rz / 2);
	return [
		cx * cy * cz + sx * sy * sz,
		sx * cy * cz - cx * sy * sz,
		cx * sy * cz + sx * cy * sz,
		cx * cy * sz - sx * sy * cz,
	];
}

/** The inverse of a unit [w, x, y, z] quaternion is its conjugate. */
export function quatConjugate(q: Quat): Quat {
	return [q[0], -q[1], -q[2], -q[3]];
}

export function quatToEuler(q: Quat): [number, number, number] {
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

export function eulerToQuatClosest(euler: [number, number, number], reference: Quat): Quat {
	const candidate = eulerToQuat(euler);
	const negated: Quat = [-candidate[0], -candidate[1], -candidate[2], -candidate[3]];
	return quatDot(candidate, reference) >= quatDot(negated, reference) ? candidate : negated;
}
