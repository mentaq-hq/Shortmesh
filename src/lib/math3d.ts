export type Vec3 = [number, number, number];

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => [x, y, z];

export function add(a: Vec3, b: Vec3): Vec3 {
	return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a: Vec3, s: number): Vec3 {
	return [a[0] * s, a[1] * s, a[2] * s];
}

export function dot(a: Vec3, b: Vec3): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
	return [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0],
	];
}

export function length(a: Vec3): number {
	const x = a[0];
	const y = a[1];
	const z = a[2];
	return Math.sqrt(x * x + y * y + z * z);
}

export function normalize(a: Vec3): Vec3 {
	const x = a[0];
	const y = a[1];
	const z = a[2];
	const len = Math.sqrt(x * x + y * y + z * z) || 1;
	return [x / len, y / len, z / len];
}

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

export function rotateEuler(point: Vec3, rotation: Vec3): Vec3 {
	const [rx, ry, rz] = rotation;
	const [x, y, z] = point;

	const cx = Math.cos(rx);
	const sx = Math.sin(rx);
	const cy = Math.cos(ry);
	const sy = Math.sin(ry);
	const cz = Math.cos(rz);
	const sz = Math.sin(rz);

	// Roll (X): y,z plane.
	const y1 = y * cx - z * sx;
	const z1 = y * sx + z * cx;
	// Pitch (Y): x,z plane.
	const x2 = x * cy + z1 * sy;
	const z2 = -x * sy + z1 * cy;
	// Yaw (Z): x,y plane.
	const x3 = x2 * cz - y1 * sz;
	const y3 = x2 * sz + y1 * cz;

	return [x3, y3, z2];
}

export function transformPoint(point: Vec3, position: Vec3, rotation: Vec3, scl: Vec3): Vec3 {
	const scaled: Vec3 = [point[0] * scl[0], point[1] * scl[1], point[2] * scl[2]];
	return add(rotateEuler(scaled, rotation), position);
}

export interface OrbitCamera {
	yaw: number;
	pitch: number;
	distance: number;
	target: Vec3;
	fov: number;
	near: number;
	far: number;
}

export interface CameraBasis {
	eye: Vec3;
	forward: Vec3;
	right: Vec3;
	up: Vec3;
	fov: number;
	near: number;
	far: number;
}

export const DEFAULT_CAMERA: OrbitCamera = {
	yaw: 0.62,
	pitch: 0.36,
	distance: 8,
	target: [0, 0.4, 0],
	fov: 50,
	near: 0.05,
	far: 500,
};

function safeUpVector(forward: Vec3): Vec3 {
	return Math.abs(forward[1]) > 0.999 ? [0, 0, forward[1] > 0 ? 1 : -1] : [0, 1, 0];
}

export function cameraBasis(camera: OrbitCamera): CameraBasis {
	const cp = Math.cos(camera.pitch);
	const eye: Vec3 = [
		camera.target[0] + Math.sin(camera.yaw) * cp * camera.distance,
		camera.target[1] + Math.sin(camera.pitch) * camera.distance,
		camera.target[2] + Math.cos(camera.yaw) * cp * camera.distance,
	];
	const forward = normalize(sub(camera.target, eye));
	const right = normalize(cross(forward, safeUpVector(forward)));
	const up = normalize(cross(right, forward));
	return { eye, forward, right, up, fov: camera.fov, near: camera.near, far: camera.far };
}

export function basisFromDirection(eye: Vec3, forward: Vec3, fov = 50): CameraBasis {
	const f = normalize(forward);
	const right = normalize(cross(f, safeUpVector(f)));
	const up = normalize(cross(right, f));
	return { eye, forward: f, right, up, fov, near: 0.05, far: 500 };
}

export interface Projected {
	x: number;
	y: number;
	z: number;
	visible: boolean;
}

export function project(point: Vec3, basis: CameraBasis, width: number, height: number): Projected {
	const rel = sub(point, basis.eye);
	const x = dot(rel, basis.right);
	const y = dot(rel, basis.up);
	const z = dot(rel, basis.forward);
	const f = height / 2 / Math.tan((basis.fov * Math.PI) / 360);
	const visible = z > basis.near && z < basis.far;
	return {
		x: width / 2 + (x / z) * f,
		y: height / 2 - (y / z) * f,
		z,
		visible,
	};
}

export function worldPerPixel(z: number, fov: number, height: number): number {
	return (2 * z * Math.tan((fov * Math.PI) / 360)) / height;
}

export function pickRadius(radius: number, projectZ: number, fov: number, height: number): number {
	return (radius / Math.max(projectZ, 0.001)) * (height / 2 / Math.tan((fov * Math.PI) / 360));
}

export function mixColor(a: string, b: string, t: number): string {
	const pa = hexToRgb(a);
	const pb = hexToRgb(b);
	const r = Math.round(lerp(pa[0], pb[0], t));
	const g = Math.round(lerp(pa[1], pb[1], t));
	const bl = Math.round(lerp(pa[2], pb[2], t));
	return `rgb(${r}, ${g}, ${bl})`;
}

export function hexToRgb(hex: string): [number, number, number] {
	const value = hex.replace('#', '');
	const expanded =
		value.length === 3
			? value
					.split('')
					.map((c) => c + c)
					.join('')
			: value;
	const num = Number.parseInt(expanded, 16);
	if (!Number.isFinite(num)) return [120, 200, 180];
	return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function withAlpha(hex: string, alpha: number): string {
	const [r, g, b] = hexToRgb(hex);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function lookAtEuler(from: Vec3, to: Vec3): Vec3 {
	const dir = normalize(sub(to, from));
	const yaw = Math.atan2(-dir[0], -dir[2]);
	const xzDist = Math.hypot(dir[0], dir[2]);
	const pitch = Math.atan2(dir[1], xzDist);
	return [pitch, yaw, 0];
}

export function focalLengthToFOV(mm: number, sensorWidth = 36): number {
	const clampedMM = Math.max(1, mm);
	return (2 * Math.atan(sensorWidth / (2 * clampedMM)) * 180) / Math.PI;
}

export function fovToFocalLength(fovDegrees: number, sensorWidth = 36): number {
	const rad = (Math.max(1, Math.min(170, fovDegrees)) * Math.PI) / 360;
	return sensorWidth / (2 * Math.tan(rad));
}
