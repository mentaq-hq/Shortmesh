import type { Vec3 } from './math3d';

export type Mat4 = Float32Array;
export type Mat3 = Float32Array;

export function mat4Identity(): Mat4 {
	const out = new Float32Array(16);
	out[0] = 1;
	out[5] = 1;
	out[10] = 1;
	out[15] = 1;
	return out;
}

export function mat4Multiply(a: Mat4, b: Mat4, out = new Float32Array(16)): Mat4 {
	for (let col = 0; col < 4; col++) {
		const b0 = b[col * 4];
		const b1 = b[col * 4 + 1];
		const b2 = b[col * 4 + 2];
		const b3 = b[col * 4 + 3];
		out[col * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
		out[col * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
		out[col * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
		out[col * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
	}
	return out;
}

export function mat4Perspective(fovDegrees: number, aspect: number, near: number, far: number): Mat4 {
	const f = 1 / Math.tan((fovDegrees * Math.PI) / 360);
	const nf = 1 / (near - far);
	const out = new Float32Array(16);
	out[0] = f / aspect;
	out[5] = f;
	out[10] = (far + near) * nf;
	out[11] = -1;
	out[14] = 2 * far * near * nf;
	return out;
}

export function mat4LookAt(eye: Vec3, center: Vec3, up: Vec3): Mat4 {
	let zx = eye[0] - center[0];
	let zy = eye[1] - center[1];
	let zz = eye[2] - center[2];
	let len = Math.hypot(zx, zy, zz) || 1;
	zx /= len;
	zy /= len;
	zz /= len;

	let ux = up[0], uy = up[1], uz = up[2];
	if (Math.hypot(uy * zz - uz * zy, uz * zx - ux * zz, ux * zy - uy * zx) < 1e-6) {
		ux = 0;
		uy = 0;
		uz = zy > 0 ? 1 : -1;
	}

	let xx = uy * zz - uz * zy;
	let xy = uz * zx - ux * zz;
	let xz = ux * zy - uy * zx;
	len = Math.hypot(xx, xy, xz) || 1;
	xx /= len;
	xy /= len;
	xz /= len;

	const yx = zy * xz - zz * xy;
	const yy = zz * xx - zx * xz;
	const yz = zx * xy - zy * xx;

	const out = new Float32Array(16);
	out[0] = xx;
	out[1] = yx;
	out[2] = zx;
	out[3] = 0;
	out[4] = xy;
	out[5] = yy;
	out[6] = zy;
	out[7] = 0;
	out[8] = xz;
	out[9] = yz;
	out[10] = zz;
	out[11] = 0;
	out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
	out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
	out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
	out[15] = 1;
	return out;
}

export function eulerMatrix(rotation: Vec3): Mat4 {
	const [rx, ry, rz] = rotation;
	const cx = Math.cos(rx);
	const sx = Math.sin(rx);
	const cy = Math.cos(ry);
	const sy = Math.sin(ry);
	const cz = Math.cos(rz);
	const sz = Math.sin(rz);
	// Matches rotateEuler in math3d and eulerToQuat in fcurve: Rz * Ry * Rx (extrinsic XYZ).
	const out = new Float32Array(16);
	out[0] = cy * cz;
	out[1] = cy * sz;
	out[2] = -sy;
	out[3] = 0;
	out[4] = sx * sy * cz - cx * sz;
	out[5] = sx * sy * sz + cx * cz;
	out[6] = sx * cy;
	out[7] = 0;
	out[8] = cx * sy * cz + sx * sz;
	out[9] = cx * sy * sz - sx * cz;
	out[10] = cx * cy;
	out[11] = 0;
	out[12] = 0;
	out[13] = 0;
	out[14] = 0;
	out[15] = 1;
	return out;
}

export function mat4FromTRS(position: Vec3, rotation: Vec3, scl: Vec3): Mat4 {
	const [rx, ry, rz] = rotation;
	const cx = Math.cos(rx);
	const sx = Math.sin(rx);
	const cy = Math.cos(ry);
	const sy = Math.sin(ry);
	const cz = Math.cos(rz);
	const sz = Math.sin(rz);
	const sx0 = scl[0], sy1 = scl[1], sz2 = scl[2];
	const out = new Float32Array(16);
	out[0] = cy * cz * sx0;
	out[1] = cy * sz * sx0;
	out[2] = -sy * sx0;
	out[3] = 0;
	out[4] = (sx * sy * cz - cx * sz) * sy1;
	out[5] = (sx * sy * sz + cx * cz) * sy1;
	out[6] = sx * cy * sy1;
	out[7] = 0;
	out[8] = (cx * sy * cz + sx * sz) * sz2;
	out[9] = (cx * sy * sz - sx * cz) * sz2;
	out[10] = cx * cy * sz2;
	out[11] = 0;
	out[12] = position[0];
	out[13] = position[1];
	out[14] = position[2];
	out[15] = 1;
	return out;
}

/**
 * Transposes a matrix.
 *
 * The transpose of the inverse of a model matrix turns a world space plane
 * into the plane of the object, which is what the cutting tool needs.
 */
export function mat4Transpose(m: Mat4): Mat4 {
	const out = new Float32Array(16);
	for (let col = 0; col < 4; col++) {
		for (let row = 0; row < 4; row++) {
			out[col * 4 + row] = m[row * 4 + col];
		}
	}
	return out;
}

export function mat3FromMat4(m: Mat4): Mat3 {
	const out = new Float32Array(9);
	out[0] = m[0];
	out[1] = m[1];
	out[2] = m[2];
	out[3] = m[4];
	out[4] = m[5];
	out[5] = m[6];
	out[6] = m[8];
	out[7] = m[9];
	out[8] = m[10];
	return out;
}

// Returns the inverse-transpose of the upper-left 3x3 (correct normal matrix under non-uniform scale).
export function normalMatrix(m: Mat4): Mat3 {
	const a = m[0];
	const b = m[1];
	const c = m[2];
	const d = m[4];
	const e = m[5];
	const f = m[6];
	const g = m[8];
	const h = m[9];
	const i = m[10];
	const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
	const out = new Float32Array(9);
	if (Math.abs(det) < 1e-12) {
		out[0] = 1;
		out[4] = 1;
		out[8] = 1;
		return out;
	}
	const inv = 1 / det;
	// inverse of 3x3
	const i00 = (e * i - f * h) * inv;
	const i01 = (c * h - b * i) * inv;
	const i02 = (b * f - c * e) * inv;
	const i10 = (f * g - d * i) * inv;
	const i11 = (a * i - c * g) * inv;
	const i12 = (c * d - a * f) * inv;
	const i20 = (d * h - e * g) * inv;
	const i21 = (b * g - a * h) * inv;
	const i22 = (a * e - b * d) * inv;
	// transpose
	out[0] = i00;
	out[1] = i10;
	out[2] = i20;
	out[3] = i01;
	out[4] = i11;
	out[5] = i21;
	out[6] = i02;
	out[7] = i12;
	out[8] = i22;
	return out;
}

export function transformVec3(m: Mat4, v: Vec3): Vec3 {
	return [
		m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
		m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
		m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
	];
}

export function transformDir3(m: Mat4, v: Vec3): Vec3 {
	return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2], m[1] * v[0] + m[5] * v[1] + m[9] * v[2], m[2] * v[0] + m[6] * v[1] + m[10] * v[2]];
}

export function mat4Invert(m: Mat4): Mat4 {
	const out = new Float32Array(16);
	const a00 = m[0];
	const a01 = m[1];
	const a02 = m[2];
	const a03 = m[3];
	const a10 = m[4];
	const a11 = m[5];
	const a12 = m[6];
	const a13 = m[7];
	const a20 = m[8];
	const a21 = m[9];
	const a22 = m[10];
	const a23 = m[11];
	const a30 = m[12];
	const a31 = m[13];
	const a32 = m[14];
	const a33 = m[15];
	const b00 = a00 * a11 - a01 * a10;
	const b01 = a00 * a12 - a02 * a10;
	const b02 = a00 * a13 - a03 * a10;
	const b03 = a01 * a12 - a02 * a11;
	const b04 = a01 * a13 - a03 * a11;
	const b05 = a02 * a13 - a03 * a12;
	const b06 = a20 * a31 - a21 * a30;
	const b07 = a20 * a32 - a22 * a30;
	const b08 = a20 * a33 - a23 * a30;
	const b09 = a21 * a32 - a22 * a31;
	const b10 = a21 * a33 - a23 * a31;
	const b11 = a22 * a33 - a23 * a32;
	let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
	if (!det) return mat4Identity();
	det = 1 / det;
	out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
	out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
	out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
	out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
	out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
	out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
	out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
	out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
	out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
	out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
	out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
	out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
	out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
	out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
	out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
	out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
	return out;
}

export function hexColor(hex: string): [number, number, number] {
	const value = hex.replace('#', '');
	const expanded =
		value.length === 3
			? value
					.split('')
					.map((c) => c + c)
					.join('')
			: value;
	const num = Number.parseInt(expanded, 16);
	if (!Number.isFinite(num)) return [0.43, 0.9, 0.72];
	return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
}
