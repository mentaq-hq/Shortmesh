import type { Vec3 } from './math3d';

export type Face = number[];

export interface MaterialSlot {
	name: string;
	color: string;
	emissive: string;
	emissiveStrength: number;
	metalness: number;
	roughness: number;
	opacity: number;
	uvRepeat: number;
	presetId?: string;
	imageUrl?: string;
	roughnessUrl?: string;
	normalUrl?: string;
	metallicUrl?: string;
	emissionUrl?: string;
	specular?: number;
	normalStrength?: number;
	blendMode?: 'opaque' | 'blend' | 'clip';
	uvScaleY?: number;
	uvOffsetX?: number;
	uvOffsetY?: number;
	uvRotation?: number;
	texMapping?: number;
	texStrength?: number;
}

export interface GeometryGroup {
	start: number;
	count: number;
	materialIndex: number;
}

export interface Mesh {
	vertices: Vec3[];
	faces: Face[];
	edges: [number, number][];
	radius: number;
	normals?: Vec3[];
	colors?: number[];
	mask?: number[];
	uvs?: [number, number][];
	smooth?: boolean;
	slots: MaterialSlot[];
	faceSlot: number[];
	groups: GeometryGroup[];
}

export function defaultMaterialSlot(name = 'Material'): MaterialSlot {
	return {
		name,
		color: '#ffffff',
		emissive: '#000000',
		emissiveStrength: 1,
		metalness: 0.04,
		roughness: 0.36,
		opacity: 1,
		uvRepeat: 1,
	};
}

export function cloneMaterialSlot(slot: MaterialSlot): MaterialSlot {
	return { ...slot };
}

export function cloneMesh(mesh: Mesh): Mesh {
	return {
		vertices: mesh.vertices.map((v) => [v[0], v[1], v[2]] as Vec3),
		faces: mesh.faces.map((f) => [...f]),
		edges: mesh.edges.map((e) => [e[0], e[1]] as [number, number]),
		radius: mesh.radius,
		normals: mesh.normals?.map((n) => [n[0], n[1], n[2]] as Vec3),
		colors: mesh.colors ? [...mesh.colors] : undefined,
		mask: mesh.mask ? [...mesh.mask] : undefined,
		uvs: mesh.uvs?.map((uv) => [uv[0], uv[1]] as [number, number]),
		smooth: mesh.smooth,
		slots: (mesh.slots ?? []).map(cloneMaterialSlot),
		faceSlot: [...(mesh.faceSlot ?? [])],
		groups: (mesh.groups ?? []).map((group) => ({ ...group })),
	};
}

export function buildGroups(mesh: Mesh): GeometryGroup[] {
	const groups: GeometryGroup[] = [];
	let triangleIndex = 0;
	let current: GeometryGroup | null = null;
	mesh.faces.forEach((face, faceIndex) => {
		const slot = mesh.faceSlot?.[faceIndex] ?? 0;
		const triangles = Math.max(0, face.length - 2);
		if (current && current.materialIndex === slot) {
			current.count += triangles * 3;
		} else {
			if (current) groups.push(current);
			current = { start: triangleIndex * 3, count: triangles * 3, materialIndex: slot };
		}
		triangleIndex += triangles;
	});
	if (current) groups.push(current);
	return groups;
}

export function addGroup(mesh: Mesh, faceIndex: number, materialIndex: number): Mesh {
	if (faceIndex < 0 || faceIndex >= mesh.faces.length) return mesh;
	const slots = (mesh.slots ?? []).map(cloneMaterialSlot);
	while (slots.length <= materialIndex) slots.push(defaultMaterialSlot(`Slot ${slots.length}`));
	const faceSlot = [...(mesh.faceSlot ?? mesh.faces.map(() => 0))];
	while (faceSlot.length < mesh.faces.length) faceSlot.push(0);
	faceSlot[faceIndex] = materialIndex;
	const next: Mesh = { ...mesh, slots, faceSlot };
	next.groups = buildGroups(next);
	return next;
}

export function assignFacesToSlot(mesh: Mesh, faceIndices: number[], materialIndex: number): Mesh {
	let next = mesh;
	for (const faceIndex of faceIndices) next = addGroup(next, faceIndex, materialIndex);
	return next;
}

export function toNonIndexed(mesh: Mesh): Mesh {
	const vertices: Vec3[] = [];
	const faces: number[][] = [];
	const faceSlot: number[] = [];
	const normals = mesh.normals;
	const nextNormals: Vec3[] = [];
	const colors = mesh.colors;
	const nextColors: number[] = [];

	mesh.faces.forEach((face, faceIndex) => {
		const base = vertices.length;
		for (let i = 1; i < face.length - 1; i++) {
			for (const index of [face[0], face[i], face[i + 1]]) {
				const v = mesh.vertices[index];
				vertices.push([v[0], v[1], v[2]] as Vec3);
				if (normals) {
					const n = normals[index] ?? [0, 1, 0];
					nextNormals.push([n[0], n[1], n[2]] as Vec3);
				}
				if (colors) {
					nextColors.push(colors[index * 3] ?? 1, colors[index * 3 + 1] ?? 1, colors[index * 3 + 2] ?? 1);
				}
			}
			faces.push([base, base + 1, base + 2]);
			faceSlot.push(mesh.faceSlot?.[faceIndex] ?? 0);
		}
	});

	const next: Mesh = {
		vertices,
		faces,
		edges: buildEdges(faces),
		radius: computeRadius(vertices),
		smooth: mesh.smooth,
		slots: (mesh.slots ?? []).map(cloneMaterialSlot),
		faceSlot,
		groups: [],
	};
	if (nextNormals.length === vertices.length) next.normals = nextNormals;
	if (nextColors.length === vertices.length * 3) next.colors = nextColors;
	next.groups = buildGroups(next);
	return next;
}

export function edgeKey(a: number, b: number): string {
	return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function buildEdges(faces: Face[]): [number, number][] {
	const seen = new Set<string>();
	const edges: [number, number][] = [];
	for (const face of faces) {
		for (let i = 0; i < face.length; i++) {
			const a = face[i];
			const b = face[(i + 1) % face.length];
			const key = edgeKey(a, b);
			if (!seen.has(key)) {
				seen.add(key);
				edges.push([a, b]);
			}
		}
	}
	return edges;
}

export function computeRadius(vertices: Vec3[]): number {
	let maxR2 = 0.25;
	for (let i = 0; i < vertices.length; i++) {
		const v = vertices[i];
		const r2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
		if (r2 > maxR2) maxR2 = r2;
	}
	return Math.sqrt(maxR2);
}

export function computeVertexNormals(mesh: Mesh): Vec3[] {
	const normals: Vec3[] = mesh.vertices.map(() => [0, 0, 0]);
	for (const face of mesh.faces) {
		const fLen = face.length;
		if (fLen < 3) continue;
		const fn = faceNormal(mesh, face);
		for (let i = 0; i < fLen; i++) {
			const target = normals[face[i]];
			target[0] += fn[0];
			target[1] += fn[1];
			target[2] += fn[2];
		}
	}
	for (const normal of normals) {
		const len = Math.hypot(normal[0], normal[1], normal[2]) || 1;
		normal[0] /= len;
		normal[1] /= len;
		normal[2] /= len;
	}
	return normals;
}

export function faceNormal(mesh: Mesh, face: Face): Vec3 {
	if (face.length < 3) return [0, 1, 0];
	// Newell's method handles arbitrary polygons and quads robustly without collinear corner issues
	let nx = 0, ny = 0, nz = 0;
	for (let i = 0; i < face.length; i++) {
		const curr = mesh.vertices[face[i]];
		const next = mesh.vertices[face[(i + 1) % face.length]];
		nx += (curr[1] - next[1]) * (curr[2] + next[2]);
		ny += (curr[2] - next[2]) * (curr[0] + next[0]);
		nz += (curr[0] - next[0]) * (curr[1] + next[1]);
	}
	const len = Math.hypot(nx, ny, nz) || 1;
	return [nx / len, ny / len, nz / len];
}

export function faceCenter(mesh: Mesh, face: Face): Vec3 {
	let x = 0, y = 0, z = 0;
	for (const index of face) {
		x += mesh.vertices[index][0];
		y += mesh.vertices[index][1];
		z += mesh.vertices[index][2];
	}
	const inv = 1 / face.length;
	return [x * inv, y * inv, z * inv];
}

export type MeshInput = Pick<Mesh, 'vertices' | 'faces'> &
	Partial<Omit<Mesh, 'vertices' | 'faces'>> & { radius?: number };

export function finalizeMesh(mesh: MeshInput, smooth = false): Mesh {
	const result: Mesh = {
		vertices: mesh.vertices.map((v) => [v[0], v[1], v[2]] as Vec3),
		faces: mesh.faces.map((f) => [...f]),
		edges: mesh.edges && mesh.edges.length ? mesh.edges.map((e) => [e[0], e[1]] as [number, number]) : buildEdges(mesh.faces),
		radius: computeRadius(mesh.vertices),
		smooth,
		slots: (mesh.slots ?? []).map(cloneMaterialSlot),
		faceSlot: [...(mesh.faceSlot ?? [])],
		groups: [],
	};
	if (mesh.colors && mesh.colors.length >= result.vertices.length * 3) {
		result.colors = mesh.colors.slice(0, result.vertices.length * 3);
	}
	if (mesh.uvs && mesh.uvs.length === result.vertices.length) {
		result.uvs = mesh.uvs.map((uv) => [uv[0], uv[1]] as [number, number]);
	}
	if (mesh.normals && mesh.normals.length === result.vertices.length) {
		result.normals = mesh.normals.map((n) => [n[0], n[1], n[2]] as Vec3);
	} else if (smooth) {
		result.normals = computeVertexNormals(result);
	}
	while (result.faceSlot.length < result.faces.length) result.faceSlot.push(0);
	result.faceSlot.length = result.faces.length;
	result.groups = buildGroups(result);
	return result;
}

function build(vertices: Vec3[], faces: Face[], smooth = false, normals?: Vec3[]): Mesh {
	return finalizeMesh({ vertices, faces, edges: buildEdges(faces), radius: computeRadius(vertices), normals }, smooth);
}

export function cubeMesh(sizeX = 1, sizeY = 1, sizeZ = 1): Mesh {
	const hx = Math.max(0.05, sizeX) * 0.5;
	const hy = Math.max(0.05, sizeY) * 0.5;
	const hz = Math.max(0.05, sizeZ) * 0.5;
	const vertices: Vec3[] = [
		[-hx, -hy, -hz],
		[hx, -hy, -hz],
		[hx, hy, -hz],
		[-hx, hy, -hz],
		[-hx, -hy, hz],
		[hx, -hy, hz],
		[hx, hy, hz],
		[-hx, hy, hz],
	];
	const faces = [
		[0, 3, 2, 1],
		[4, 5, 6, 7],
		[0, 4, 7, 3],
		[1, 2, 6, 5],
		[3, 7, 6, 2],
		[0, 1, 5, 4],
	];
	return build(vertices, faces, false);
}

export function sphereMesh(segments = 48, rings = 24, radius = 0.5): Mesh {
	const segs = Math.max(8, Math.floor(segments));
	const rngs = Math.max(4, Math.floor(rings));
	const rad = Math.max(0.05, radius);
	const vertices: Vec3[] = [];
	const normals: Vec3[] = [];

	// North pole (index 0)
	vertices.push([0, rad, 0]);
	normals.push([0, 1, 0]);

	// Intermediate rings (1 .. rngs - 1)
	for (let r = 1; r < rngs; r++) {
		const phi = (r / rngs) * Math.PI;
		const ny = Math.cos(phi);
		const sinPhi = Math.sin(phi);
		for (let s = 0; s < segs; s++) {
			const theta = (s / segs) * Math.PI * 2;
			const nx = Math.cos(theta) * sinPhi;
			const nz = Math.sin(theta) * sinPhi;
			vertices.push([nx * rad, ny * rad, nz * rad]);
			normals.push([nx, ny, nz]);
		}
	}

	// South pole
	const south = vertices.length;
	vertices.push([0, -rad, 0]);
	normals.push([0, -1, 0]);

	const faces: Face[] = [];
	// North pole triangle fan (outward CCW)
	for (let s = 0; s < segs; s++) {
		const next = (s + 1) % segs;
		faces.push([0, 1 + next, 1 + s]);
	}
	// Quad strips between intermediate rings (outward CCW)
	for (let r = 1; r < rngs - 1; r++) {
		const row = 1 + (r - 1) * segs;
		const nextRow = 1 + r * segs;
		for (let s = 0; s < segs; s++) {
			const next = (s + 1) % segs;
			faces.push([row + s, row + next, nextRow + next, nextRow + s]);
		}
	}
	// South pole triangle fan (outward CCW)
	const lastRow = 1 + (rngs - 2) * segs;
	for (let s = 0; s < segs; s++) {
		const next = (s + 1) % segs;
		faces.push([lastRow + s, lastRow + next, south]);
	}

	return build(vertices, faces, true, normals);
}

export function cylinderMesh(segments = 48, innerRadius = 0, height = 1, outerRadius = 0.5): Mesh {
	const segs = Math.max(8, Math.floor(segments));
	const rad = Math.max(0.05, outerRadius);
	const vertices: Vec3[] = [];
	const half = height / 2;
	for (let s = 0; s < segs; s++) {
		const theta = (s / segs) * Math.PI * 2;
		vertices.push([Math.cos(theta) * rad, -half, Math.sin(theta) * rad]);
	}
	for (let s = 0; s < segs; s++) {
		const theta = (s / segs) * Math.PI * 2;
		vertices.push([Math.cos(theta) * rad, half, Math.sin(theta) * rad]);
	}
	if (innerRadius > 0) {
		for (let s = 0; s < segs; s++) {
			const theta = (s / segs) * Math.PI * 2;
			vertices.push([Math.cos(theta) * innerRadius, -half, Math.sin(theta) * innerRadius]);
		}
		for (let s = 0; s < segs; s++) {
			const theta = (s / segs) * Math.PI * 2;
			vertices.push([Math.cos(theta) * innerRadius, half, Math.sin(theta) * innerRadius]);
		}
	}
	const faces: Face[] = [];
	for (let s = 0; s < segs; s++) {
		const next = (s + 1) % segs;
		if (innerRadius > 0) {
			const bi = segs * 2;
			const ti = segs * 3;
			// Outer wall (outward CCW)
			faces.push([s, segs + s, segs + next, next]);
			// Inner wall (inward toward hole axis CCW)
			faces.push([bi + s, bi + next, ti + next, ti + s]);
			// Bottom annular quad (downward CCW)
			faces.push([s, next, bi + next, bi + s]);
			// Top annular quad (upward CCW)
			faces.push([segs + s, ti + s, ti + next, segs + next]);
		} else {
			// Outer wall (outward CCW)
			faces.push([s, segs + s, segs + next, next]);
		}
	}
	if (innerRadius <= 0) {
		const bottom = Array.from({ length: segs }, (_, i) => i);
		const top = Array.from({ length: segs }, (_, i) => segs + (segs - 1 - i));
		faces.push(bottom, top);
	}
	return build(vertices, faces, true);
}

export function coneMesh(segments = 48, radius = 0.5, height = 1): Mesh {
	const segs = Math.max(8, Math.floor(segments));
	const rad = Math.max(0.05, radius);
	const half = Math.max(0.05, height) * 0.5;
	const vertices: Vec3[] = [];
	for (let s = 0; s < segs; s++) {
		const theta = (s / segs) * Math.PI * 2;
		vertices.push([Math.cos(theta) * rad, -half, Math.sin(theta) * rad]);
	}
	vertices.push([0, half, 0]);
	const apex = vertices.length - 1;
	const faces: Face[] = [];
	for (let s = 0; s < segs; s++) {
		const next = (s + 1) % segs;
		// Outward CCW side triangle
		faces.push([s, apex, next]);
	}
	// Outward downward bottom cap
	faces.push(Array.from({ length: segs }, (_, i) => i));
	return build(vertices, faces, true);
}

export function torusMesh(segments = 48, sides = 24, radius = 0.35, tube = 0.15): Mesh {
	const segs = Math.max(8, Math.floor(segments));
	const sds = Math.max(6, Math.floor(sides));
	const vertices: Vec3[] = [];
	const normals: Vec3[] = [];
	for (let i = 0; i < segs; i++) {
		const u = (i / segs) * Math.PI * 2;
		const cosU = Math.cos(u);
		const sinU = Math.sin(u);
		for (let j = 0; j < sds; j++) {
			const v = (j / sds) * Math.PI * 2;
			const cosV = Math.cos(v);
			const sinV = Math.sin(v);
			const r = radius + tube * cosV;
			vertices.push([cosU * r, tube * sinV, sinU * r]);
			normals.push([cosU * cosV, sinV, sinU * cosV]);
		}
	}
	const faces: Face[] = [];
	for (let i = 0; i < segs; i++) {
		const ni = (i + 1) % segs;
		for (let j = 0; j < sds; j++) {
			const nj = (j + 1) % sds;
			// Outward CCW quad
			faces.push([i * sds + j, i * sds + nj, ni * sds + nj, ni * sds + j]);
		}
	}
	return build(vertices, faces, true, normals);
}

export function planeMesh(): Mesh {
	const vertices: Vec3[] = [
		[-0.5, 0, -0.5],
		[0.5, 0, -0.5],
		[0.5, 0, 0.5],
		[-0.5, 0, 0.5],
	];
	// Outward upward normal [0, +1, 0]
	return build(vertices, [[0, 3, 2, 1]], false);
}

export function mediaPlaneMesh(): Mesh {
	const mesh = planeMesh();
	mesh.uvs = [
		[0, 1],
		[1, 1],
		[1, 0],
		[0, 0],
	];
	return mesh;
}

export function coinMesh(segments = 48): Mesh {
	return cylinderMesh(segments, 0, 0.12);
}

export function boneMesh(): Mesh {
	const rawVertices: Vec3[] = [
		[0, -0.2, 0],
		[0.09, -0.06, 0.09],
		[-0.09, -0.06, 0.09],
		[-0.09, -0.06, -0.09],
		[0.09, -0.06, -0.09],
		[0, 0.25, 0],
	];
	// Octahedral studio bone with 8 outward CCW faces
	const faces: Face[] = [
		[0, 1, 2],
		[0, 2, 3],
		[0, 3, 4],
		[0, 4, 1],
		[5, 2, 1],
		[5, 3, 2],
		[5, 4, 3],
		[5, 1, 4],
	];
	return build(rawVertices, faces, false);
}

export function icoSphereMesh(subdivisions = 1, radius = 0.5): Mesh {
	const phi = (1 + Math.sqrt(5)) / 2;
	const baseVerts: Vec3[] = [
		[-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
		[0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
		[phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1]
	];
	const scale = radius / Math.sqrt(1 + phi * phi);
	let vertices: Vec3[] = baseVerts.map(v => [v[0] * scale, v[1] * scale, v[2] * scale] as Vec3);
	let faces: Face[] = [
		[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
		[1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
		[3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
		[4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
	];
	const subs = Math.min(3, Math.max(0, Math.floor(subdivisions)));
	for (let s = 0; s < subs; s++) {
		const midCache = new Map<string, number>();
		const getMid = (p1: number, p2: number): number => {
			const key = p1 < p2 ? (p1 + '_' + p2) : (p2 + '_' + p1);
			if (midCache.has(key)) return midCache.get(key)!;
			const v1 = vertices[p1];
			const v2 = vertices[p2];
			const mx = (v1[0] + v2[0]) / 2;
			const my = (v1[1] + v2[1]) / 2;
			const mz = (v1[2] + v2[2]) / 2;
			const len = Math.hypot(mx, my, mz) || 1;
			const idx = vertices.length;
			vertices.push([(mx / len) * radius, (my / len) * radius, (mz / len) * radius]);
			midCache.set(key, idx);
			return idx;
		};
		const nextFaces: Face[] = [];
		for (const f of faces) {
			const a = f[0], b = f[1], c = f[2];
			const ab = getMid(a, b);
			const bc = getMid(b, c);
			const ca = getMid(c, a);
			nextFaces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
		}
		faces = nextFaces;
	}
	const normals = vertices.map(v => {
		const len = Math.hypot(v[0], v[1], v[2]) || 1;
		return [v[0] / len, v[1] / len, v[2] / len] as Vec3;
	});
	return build(vertices, faces, true, normals);
}

export function circleMesh(segments = 32, radius = 0.5): Mesh {
	const segs = Math.max(6, Math.floor(segments));
	const vertices: Vec3[] = [[0, 0, 0]];
	for (let s = 0; s < segs; s++) {
		const theta = (s / segs) * Math.PI * 2;
		vertices.push([Math.cos(theta) * radius, 0, Math.sin(theta) * radius]);
	}
	const faces: Face[] = [];
	for (let s = 0; s < segs; s++) {
		const next = ((s + 1) % segs) + 1;
		faces.push([0, next, s + 1]);
	}
	return build(vertices, faces, false);
}

export function gridMesh(subdivX = 4, subdivY = 4, sizeX = 2, sizeY = 2): Mesh {
	const sx = Math.max(1, Math.floor(subdivX));
	const sy = Math.max(1, Math.floor(subdivY));
	const vertices: Vec3[] = [];
	for (let y = 0; y <= sy; y++) {
		for (let x = 0; x <= sx; x++) {
			const px = (x / sx - 0.5) * sizeX;
			const pz = (y / sy - 0.5) * sizeY;
			vertices.push([px, 0, pz]);
		}
	}
	const faces: Face[] = [];
	for (let y = 0; y < sy; y++) {
		for (let x = 0; x < sx; x++) {
			const i0 = y * (sx + 1) + x;
			const i1 = i0 + 1;
			const i2 = (y + 1) * (sx + 1) + x + 1;
			const i3 = (y + 1) * (sx + 1) + x;
			faces.push([i0, i3, i2, i1]);
		}
	}
	return build(vertices, faces, false);
}

export function pyramidMesh(sides = 4, radius = 0.5, height = 1): Mesh {
	const sds = Math.max(3, Math.floor(sides));
	const half = height / 2;
	const vertices: Vec3[] = [[0, half, 0]];
	for (let s = 0; s < sds; s++) {
		const theta = (s / sds) * Math.PI * 2;
		vertices.push([Math.cos(theta) * radius, -half, Math.sin(theta) * radius]);
	}
	const baseCenter = vertices.length;
	vertices.push([0, -half, 0]);
	const faces: Face[] = [];
	for (let s = 0; s < sds; s++) {
		const curr = s + 1;
		const next = ((s + 1) % sds) + 1;
		faces.push([0, curr, next]);
	}
	for (let s = 0; s < sds; s++) {
		const curr = s + 1;
		const next = ((s + 1) % sds) + 1;
		faces.push([baseCenter, next, curr]);
	}
	return build(vertices, faces, false);
}

export function tubeMesh(segments = 24, innerRadius = 0.3, outerRadius = 0.5, height = 1): Mesh {
	const segs = Math.max(8, Math.floor(segments));
	const inR = Math.max(0.05, Math.min(innerRadius, outerRadius - 0.05));
	const outR = Math.max(inR + 0.05, outerRadius);
	const half = height / 2;
	const vertices: Vec3[] = [];
	for (let s = 0; s < segs; s++) {
		const th = (s / segs) * Math.PI * 2;
		vertices.push([Math.cos(th) * outR, half, Math.sin(th) * outR]);
	}
	for (let s = 0; s < segs; s++) {
		const th = (s / segs) * Math.PI * 2;
		vertices.push([Math.cos(th) * outR, -half, Math.sin(th) * outR]);
	}
	for (let s = 0; s < segs; s++) {
		const th = (s / segs) * Math.PI * 2;
		vertices.push([Math.cos(th) * inR, half, Math.sin(th) * inR]);
	}
	for (let s = 0; s < segs; s++) {
		const th = (s / segs) * Math.PI * 2;
		vertices.push([Math.cos(th) * inR, -half, Math.sin(th) * inR]);
	}
	const faces: Face[] = [];
	const N = segs;
	for (let s = 0; s < N; s++) {
		const nxt = (s + 1) % N;
		faces.push([s, s + N, nxt + N, nxt]);
		faces.push([s, nxt, 2 * N + nxt, 2 * N + s]);
		faces.push([s + N, 3 * N + s, 3 * N + nxt, nxt + N]);
		faces.push([2 * N + s, 2 * N + nxt, 3 * N + nxt, 3 * N + s]);
	}
	return build(vertices, faces, true);
}

export function capsuleMesh(segments = 20, rings = 6, radius = 0.25, height = 0.6): Mesh {
	const segs = Math.max(8, Math.floor(segments));
	const rngs = Math.max(3, Math.floor(rings));
	const halfH = height / 2;
	const vertices: Vec3[] = [];
	const normals: Vec3[] = [];
	vertices.push([0, halfH + radius, 0]);
	normals.push([0, 1, 0]);
	for (let r = 1; r <= rngs; r++) {
		const phi = (r / rngs) * (Math.PI / 2);
		const y = halfH + Math.cos(phi) * radius;
		const rRing = Math.sin(phi) * radius;
		for (let s = 0; s < segs; s++) {
			const th = (s / segs) * Math.PI * 2;
			vertices.push([Math.cos(th) * rRing, y, Math.sin(th) * rRing]);
			normals.push([Math.cos(th) * Math.sin(phi), Math.cos(phi), Math.sin(th) * Math.sin(phi)]);
		}
	}
	for (let r = 0; r < rngs; r++) {
		const phi = (Math.PI / 2) + (r / rngs) * (Math.PI / 2);
		const y = -halfH + Math.cos(phi) * radius;
		const rRing = Math.sin(phi) * radius;
		for (let s = 0; s < segs; s++) {
			const th = (s / segs) * Math.PI * 2;
			vertices.push([Math.cos(th) * rRing, y, Math.sin(th) * rRing]);
			normals.push([Math.cos(th) * Math.sin(phi), Math.cos(phi), Math.sin(th) * Math.sin(phi)]);
		}
	}
	const southPole = vertices.length;
	vertices.push([0, -halfH - radius, 0]);
	normals.push([0, -1, 0]);

	const faces: Face[] = [];
	for (let s = 0; s < segs; s++) {
		const nxt = (s + 1) % segs;
		faces.push([0, 1 + s, 1 + nxt]);
	}
	const totalRings = rngs * 2;
	for (let r = 0; r < totalRings - 1; r++) {
		const row = 1 + r * segs;
		const nxtRow = 1 + (r + 1) * segs;
		for (let s = 0; s < segs; s++) {
			const nxt = (s + 1) % segs;
			faces.push([row + s, nxtRow + s, nxtRow + nxt, row + nxt]);
		}
	}
	const lastRow = 1 + (totalRings - 1) * segs;
	for (let s = 0; s < segs; s++) {
		const nxt = (s + 1) % segs;
		faces.push([southPole, lastRow + nxt, lastRow + s]);
	}
	return build(vertices, faces, true, normals);
}

export function bezierCurveMesh(): Mesh {
	const steps = 24;
	const segs = 8;
	const r = 0.05;
	const vertices: Vec3[] = [];
	const faces: Face[] = [];
	const p0: Vec3 = [-0.8, -0.4, 0];
	const p1: Vec3 = [-0.3, 0.6, 0.4];
	const p2: Vec3 = [0.3, -0.6, -0.4];
	const p3: Vec3 = [0.8, 0.4, 0];
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const it = 1 - t;
		const px = it*it*it*p0[0] + 3*it*it*t*p1[0] + 3*it*t*t*p2[0] + t*t*t*p3[0];
		const py = it*it*it*p0[1] + 3*it*it*t*p1[1] + 3*it*t*t*p2[1] + t*t*t*p3[1];
		const pz = it*it*it*p0[2] + 3*it*it*t*p1[2] + 3*it*t*t*p2[2] + t*t*t*p3[2];
		const tx = 3*it*it*(p1[0]-p0[0]) + 6*it*t*(p2[0]-p1[0]) + 3*t*t*(p3[0]-p2[0]);
		const ty = 3*it*it*(p1[1]-p0[1]) + 6*it*t*(p2[1]-p1[1]) + 3*t*t*(p3[1]-p2[1]);
		const tz = 3*it*it*(p1[2]-p0[2]) + 6*it*t*(p2[2]-p1[2]) + 3*t*t*(p3[2]-p2[2]);
		const tLen = Math.hypot(tx, ty, tz) || 1;
		const up: Vec3 = [0, 1, 0];
		let nx = up[1]*(tz/tLen) - up[2]*(ty/tLen);
		let ny = up[2]*(tx/tLen) - up[0]*(tz/tLen);
		let nz = up[0]*(ty/tLen) - up[1]*(tx/tLen);
		const nLen = Math.hypot(nx, ny, nz) || 1;
		nx /= nLen; ny /= nLen; nz /= nLen;
		const bx = (ty/tLen)*nz - (tz/tLen)*ny;
		const by = (tz/tLen)*nx - (tx/tLen)*nz;
		const bz = (tx/tLen)*ny - (ty/tLen)*nx;
		for (let s = 0; s < segs; s++) {
			const th = (s / segs) * Math.PI * 2;
			const c = Math.cos(th) * r;
			const sn = Math.sin(th) * r;
			vertices.push([px + nx * c + bx * sn, py + ny * c + by * sn, pz + nz * c + bz * sn]);
		}
	}
	for (let i = 0; i < steps; i++) {
		const row = i * segs;
		const nxtRow = (i + 1) * segs;
		for (let s = 0; s < segs; s++) {
			const nxt = (s + 1) % segs;
			faces.push([row + s, nxtRow + s, nxtRow + nxt, row + nxt]);
		}
	}
	return build(vertices, faces, true);
}

export function bezierCircleMesh(): Mesh {
	return torusMesh(32, 12, 0.5, 0.04);
}

export function pathCurveMesh(): Mesh {
	return cylinderMesh(16, 0.05, 1.2);
}

export function nurbsCurveMesh(): Mesh {
	return bezierCurveMesh();
}

export function pointLightMesh(): Mesh {
	return build([
		[0, 0.25, 0], [0.2, 0, 0], [0, 0, 0.2], [-0.2, 0, 0], [0, 0, -0.2], [0, -0.25, 0]
	], [
		[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1],
		[5, 2, 1], [5, 3, 2], [5, 4, 3], [5, 1, 4]
	], false);
}

export function sunLightMesh(): Mesh {
	return cylinderMesh(16, 0, 0.08);
}

export function spotLightMesh(): Mesh {
	return coneMesh(24);
}

export function areaLightMesh(): Mesh {
	return planeMesh();
}

export function perspectiveCameraMesh(): Mesh {
	const verts: Vec3[] = [
		[-0.2, -0.15, 0.1], [0.2, -0.15, 0.1], [0.2, 0.15, 0.1], [-0.2, 0.15, 0.1],
		[-0.2, -0.15, 0.35], [0.2, -0.15, 0.35], [0.2, 0.15, 0.35], [-0.2, 0.15, 0.35],
		[-0.28, -0.2, -0.3], [0.28, -0.2, -0.3], [0.28, 0.2, -0.3], [-0.28, 0.2, -0.3]
	];
	const faces: Face[] = [
		[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4],
		[0, 1, 9, 8], [1, 2, 10, 9], [2, 3, 11, 10], [3, 0, 8, 11], [8, 9, 10, 11]
	];
	return build(verts, faces, false);
}

export function orthoCameraMesh(): Mesh {
	return perspectiveCameraMesh();
}

export function emptyAxesMesh(): Mesh {
	const v: Vec3[] = [
		[0, 0, 0], [0.8, 0, 0], [0.8, 0.03, 0], [0, 0.03, 0],
		[0, 0, 0], [0, 0.8, 0], [0.03, 0.8, 0], [0.03, 0, 0],
		[0, 0, 0], [0, 0, 0.8], [0, 0.03, 0.8], [0, 0.03, 0]
	];
	return build(v, [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11]], false);
}

export function emptyArrowsMesh(): Mesh {
	return emptyAxesMesh();
}

export function emptyCubeMesh(): Mesh {
	return cubeMesh();
}

export function emptySphereMesh(): Mesh {
	return torusMesh(24, 6, 0.5, 0.02);
}

export function emptyCircleMesh(): Mesh {
	return circleMesh(32, 0.5);
}

export function emptyImageMesh(): Mesh {
	return mediaPlaneMesh();
}

export function text3dMesh(text = 'TEXT', depth = 0.15, bevel = 0.02): Mesh {
	const len = Math.max(1, (text || 'TEXT').trim().length);
	const width = Math.min(3.2, Math.max(0.6, len * 0.28));
	return cubeMesh(width, 0.5 + bevel * 2, Math.max(0.05, depth));
}

export function metaballMesh(shape = 'ball'): Mesh {
	return sphereMesh(32, 16);
}

export function latticeMesh(): Mesh {
	return cubeMesh();
}

export function forceFieldMesh(): Mesh {
	return torusMesh(32, 8, 0.6, 0.03);
}

export function speakerMesh(): Mesh {
	const verts: Vec3[] = [
		[-0.3, -0.4, -0.25], [0.3, -0.4, -0.25], [0.3, 0.4, -0.25], [-0.3, 0.4, -0.25],
		[-0.3, -0.4,  0.25], [0.3, -0.4,  0.25], [0.3, 0.4,  0.25], [-0.3, 0.4,  0.25]
	];
	const faces: Face[] = [
		[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4]
	];
	return build(verts, faces, false);
}

export function suzanneMesh(): Mesh {
	const verts: Vec3[] = [
		[-0.4, 0.5, -0.2], [0.4, 0.5, -0.2], [0.4, 0.5, 0.2], [-0.4, 0.5, 0.2],
		[-0.5, 0.2, -0.3], [0.5, 0.2, -0.3], [0.5, 0.2, 0.3], [-0.5, 0.2, 0.3],
		[-0.35, 0.15, 0.45], [0.35, 0.15, 0.45],
		[-0.2, 0.05, 0.4], [0.2, 0.05, 0.4],
		[-0.2, -0.15, 0.55], [0.2, -0.15, 0.55],
		[-0.15, -0.35, 0.5], [0.15, -0.35, 0.5],
		[-0.25, -0.4, 0.1], [0.25, -0.4, 0.1],
		[-0.3, -0.2, -0.4], [0.3, -0.2, -0.4],
		[-0.7, 0.2, 0.0], [-0.7, -0.1, 0.0],
		[0.7, 0.2, 0.0], [0.7, -0.1, 0.0],
	];
	const faces: Face[] = [
		[0, 1, 2, 3], [0, 4, 5, 1], [1, 5, 6, 2], [3, 2, 6, 7], [0, 3, 7, 4],
		[7, 6, 9, 8], [8, 9, 11, 10], [10, 11, 13, 12], [12, 13, 15, 14], [14, 15, 17, 16],
		[4, 7, 18], [5, 19, 6], [18, 19, 5, 4], [16, 17, 19, 18],
		[4, 20, 21, 7], [6, 23, 22, 5],
	];
	return build(verts, faces, true);
}

export function treeMesh(): Mesh {
	const verts: Vec3[] = [];
	const faces: Face[] = [];
	const sides = 6;
	for (let s = 0; s < sides; s++) {
		const th = (s / sides) * Math.PI * 2;
		verts.push([Math.cos(th) * 0.12, -0.5, Math.sin(th) * 0.12]);
	}
	for (let s = 0; s < sides; s++) {
		const th = (s / sides) * Math.PI * 2;
		verts.push([Math.cos(th) * 0.1, 0.0, Math.sin(th) * 0.1]);
	}
	for (let s = 0; s < sides; s++) {
		const nxt = (s + 1) % sides;
		faces.push([s, nxt, nxt + sides, s + sides]);
	}
	const t1_base = verts.length;
	for (let s = 0; s < sides; s++) {
		const th = (s / sides) * Math.PI * 2;
		verts.push([Math.cos(th) * 0.55, 0.0, Math.sin(th) * 0.55]);
	}
	const t1_apex = verts.length;
	verts.push([0, 0.45, 0]);
	for (let s = 0; s < sides; s++) {
		const nxt = (s + 1) % sides;
		faces.push([t1_apex, t1_base + s, t1_base + nxt]);
	}
	const t2_base = verts.length;
	for (let s = 0; s < sides; s++) {
		const th = (s / sides) * Math.PI * 2;
		verts.push([Math.cos(th) * 0.38, 0.3, Math.sin(th) * 0.38]);
	}
	const t2_apex = verts.length;
	verts.push([0, 0.75, 0]);
	for (let s = 0; s < sides; s++) {
		const nxt = (s + 1) % sides;
		faces.push([t2_apex, t2_base + s, t2_base + nxt]);
	}
	return build(verts, faces, false);
}

export function carMesh(): Mesh {
	const verts: Vec3[] = [
		[-0.45, -0.15, -0.9], [0.45, -0.15, -0.9], [0.45, 0.1, -0.9], [-0.45, 0.1, -0.9],
		[-0.45, -0.15,  0.9], [0.45, -0.15,  0.9], [0.45, 0.1,  0.9], [-0.45, 0.1,  0.9],
		[-0.38, 0.1, -0.4], [0.38, 0.1, -0.4], [0.32, 0.4, -0.2], [-0.32, 0.4, -0.2],
		[-0.38, 0.1,  0.35], [0.38, 0.1,  0.35], [0.32, 0.4,  0.25], [-0.32, 0.4,  0.25],
	];
	const faces: Face[] = [
		[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5],
		[8, 9, 10, 11], [12, 15, 14, 13], [11, 10, 14, 15], [8, 11, 15, 12], [9, 13, 14, 10],
	];
	return build(verts, faces, false);
}

export function characterMesh(): Mesh {
	const verts: Vec3[] = [
		[-0.15, 0.5, -0.15], [0.15, 0.5, -0.15], [0.15, 0.75, -0.15], [-0.15, 0.75, -0.15],
		[-0.15, 0.5,  0.15], [0.15, 0.5,  0.15], [0.15, 0.75,  0.15], [-0.15, 0.75,  0.15],
		[-0.22, 0.05, -0.12], [0.22, 0.05, -0.12], [0.26, 0.45, -0.12], [-0.26, 0.45, -0.12],
		[-0.22, 0.05,  0.12], [0.22, 0.05,  0.12], [0.26, 0.45,  0.12], [-0.26, 0.45,  0.12],
		[-0.2, -0.5, -0.09], [-0.04, -0.5, -0.09], [-0.04, -0.5, 0.09], [-0.2, -0.5, 0.09],
		[0.04, -0.5, -0.09], [0.2, -0.5, -0.09], [0.2, -0.5, 0.09], [0.04, -0.5, 0.09],
	];
	const faces: Face[] = [
		[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4],
		[8, 11, 10, 9], [12, 13, 14, 15], [8, 12, 15, 11], [9, 10, 14, 13], [11, 15, 14, 10], [8, 9, 13, 12],
		[16, 17, 18, 19], [8, 16, 19, 12],
		[20, 21, 22, 23], [9, 13, 22, 21],
	];
	return build(verts, faces, false);
}

export function chairMesh(): Mesh {
	const verts: Vec3[] = [
		[-0.3, 0.0, -0.3], [0.3, 0.0, -0.3], [0.3, 0.08, -0.3], [-0.3, 0.08, -0.3],
		[-0.3, 0.0,  0.3], [0.3, 0.0,  0.3], [0.3, 0.08,  0.3], [-0.3, 0.08,  0.3],
		[-0.3, 0.55, -0.3], [0.3, 0.55, -0.3], [0.3, 0.55, -0.24], [-0.3, 0.55, -0.24]
	];
	const faces: Face[] = [
		[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4],
		[2, 3, 8, 9], [9, 8, 11, 10], [2, 9, 10, 6], [3, 7, 11, 8]
	];
	return build(verts, faces, false);
}



const cache = new Map<string, Mesh>();

export function meshFor(type: string, params?: Record<string, any>): Mesh | null {
	if (!params && cache.has(type)) return cache.get(type) ?? null;
	let mesh: Mesh | null = null;
	switch (type) {
		case 'cube':
			mesh = cubeMesh(params?.sizeX, params?.sizeY, params?.sizeZ);
			break;
		case 'sphere':
			mesh = sphereMesh(params?.segments, params?.rings, params?.radius);
			break;
		case 'icosphere':
			mesh = icoSphereMesh(params?.subdivisions, params?.radius);
			break;
		case 'cylinder':
			mesh = cylinderMesh(params?.segments, params?.innerRadius, params?.height, params?.radius);
			break;
		case 'cone':
			mesh = coneMesh(params?.segments, params?.radius, params?.height);
			break;
		case 'torus':
			mesh = torusMesh(params?.segments, params?.sides, params?.radius, params?.tube);
			break;
		case 'plane':
			if (params && ((params.subdivisions && params.subdivisions > 1) || (params.sizeX && params.sizeX !== 2.4))) {
				const sub = Math.max(1, Math.round(params.subdivisions ?? params.subdivX ?? 1));
				const sz = params.sizeX ?? 1;
				mesh = sub > 1 ? gridMesh(sub, sub, sz, params.sizeZ ?? sz) : gridMesh(1, 1, sz, params.sizeZ ?? sz);
			} else {
				mesh = planeMesh();
			}
			break;
		case 'circle':
			mesh = circleMesh(params?.segments, params?.radius);
			break;
		case 'grid': {
			const gx = params?.subdivisions ?? params?.subdivX ?? 4;
			const gy = params?.subdivisions ?? params?.subdivY ?? 4;
			const sx = params?.sizeX ?? 2;
			const sy = params?.sizeY ?? params?.sizeX ?? 2;
			mesh = gridMesh(gx, gy, sx, sy);
			break;
		}
		case 'pyramid':
			mesh = pyramidMesh(params?.sides, params?.radius, params?.height);
			break;
		case 'tube':
			mesh = tubeMesh(params?.segments, params?.innerRadius, params?.outerRadius, params?.height);
			break;
		case 'capsule':
			mesh = capsuleMesh(params?.segments, params?.rings, params?.radius, params?.height);
			break;
		case 'curve_bezier':
			mesh = bezierCurveMesh();
			break;
		case 'curve_circle':
			mesh = bezierCircleMesh();
			break;
		case 'curve_path':
			mesh = pathCurveMesh();
			break;
		case 'curve_nurbs':
			mesh = nurbsCurveMesh();
			break;
		case 'light':
		case 'light_point':
			mesh = pointLightMesh();
			break;
		case 'light_sun':
			mesh = sunLightMesh();
			break;
		case 'light_spot':
			mesh = spotLightMesh();
			break;
		case 'light_area':
			mesh = areaLightMesh();
			break;
		case 'camera':
		case 'camera_perspective':
			mesh = perspectiveCameraMesh();
			break;
		case 'camera_ortho':
			mesh = orthoCameraMesh();
			break;
		case 'empty_axes':
			mesh = emptyAxesMesh();
			break;
		case 'empty_arrows':
			mesh = emptyArrowsMesh();
			break;
		case 'empty_cube':
			mesh = emptyCubeMesh();
			break;
		case 'empty_sphere':
			mesh = emptySphereMesh();
			break;
		case 'empty_circle':
			mesh = emptyCircleMesh();
			break;
		case 'empty_image':
			mesh = emptyImageMesh();
			break;
		case 'text':
		case 'image':
			mesh = mediaPlaneMesh();
			break;
		case 'text_3d':
			mesh = text3dMesh(params?.text, params?.depth, params?.bevel);
			break;
		case 'coin':
			mesh = coinMesh();
			break;
		case 'bone':
		case 'armature':
			mesh = boneMesh();
			break;
		case 'metaball':
			mesh = metaballMesh(params?.shape);
			break;
		case 'lattice':
			mesh = latticeMesh();
			break;
		case 'forcefield':
			mesh = forceFieldMesh();
			break;
		case 'speaker':
			mesh = speakerMesh();
			break;
		case 'asset_suzanne':
			mesh = suzanneMesh();
			break;
		case 'asset_tree':
			mesh = treeMesh();
			break;
		case 'asset_car':
			mesh = carMesh();
			break;
		case 'asset_character':
			mesh = characterMesh();
			break;
		case 'asset_chair':
			mesh = chairMesh();
			break;
	}
	if (!params && mesh) cache.set(type, mesh);
	return mesh;
}

// ---------------------------------------------------------------------------
// Editing & Modifier Operations
// ---------------------------------------------------------------------------

export function subdivide(mesh: Mesh, smooth = true): Mesh {
	const vertices = mesh.vertices.map((v) => [v[0], v[1], v[2]] as Vec3);
	const facePoints: Vec3[] = mesh.faces.map((face) => faceCenter(mesh, face));

	const edgePoints = new Map<string, number>();
	const edgeFaces = new Map<string, number[]>();
	const faceEdges: [number, number][][] = [];

	mesh.faces.forEach((face, faceIndex) => {
		const edges: [number, number][] = [];
		for (let i = 0; i < face.length; i++) {
			const a = face[i];
			const b = face[(i + 1) % face.length];
			const key = edgeKey(a, b);
			edges.push([a, b]);
			if (!edgeFaces.has(key)) edgeFaces.set(key, []);
			edgeFaces.get(key)?.push(faceIndex);
		}
		faceEdges.push(edges);
	});

	for (const [key, faces] of edgeFaces) {
		const [a, b] = key.split(':').map(Number);
		let midpoint: Vec3;
		if (smooth && faces.length === 2) {
			const fp0 = facePoints[faces[0]];
			const fp1 = facePoints[faces[1]];
			midpoint = [
				(mesh.vertices[a][0] + mesh.vertices[b][0] + fp0[0] + fp1[0]) / 4,
				(mesh.vertices[a][1] + mesh.vertices[b][1] + fp0[1] + fp1[1]) / 4,
				(mesh.vertices[a][2] + mesh.vertices[b][2] + fp0[2] + fp1[2]) / 4,
			];
		} else {
			midpoint = [
				(mesh.vertices[a][0] + mesh.vertices[b][0]) / 2,
				(mesh.vertices[a][1] + mesh.vertices[b][1]) / 2,
				(mesh.vertices[a][2] + mesh.vertices[b][2]) / 2,
			];
		}
		edgePoints.set(key, vertices.length);
		vertices.push(midpoint);
	}

	if (smooth) {
		const neighbourFaces = new Map<number, number[]>();
		const neighbourEdges = new Map<number, number[]>();
		mesh.faces.forEach((face, faceIndex) => {
			for (const index of face) {
				if (!neighbourFaces.has(index)) neighbourFaces.set(index, []);
				neighbourFaces.get(index)?.push(faceIndex);
			}
		});
		for (const [key, pointIndex] of edgePoints) {
			const [a, b] = key.split(':').map(Number);
			for (const index of [a, b]) {
				if (!neighbourEdges.has(index)) neighbourEdges.set(index, []);
				neighbourEdges.get(index)?.push(pointIndex);
			}
		}
		mesh.vertices.forEach((vertex, index) => {
			const faces = neighbourFaces.get(index) || [];
			const edges = neighbourEdges.get(index) || [];
			if (!faces.length || !edges.length) return;
			const n = faces.length;
			let fx = 0, fy = 0, fz = 0;
			for (const faceIndex of faces) {
				fx += facePoints[faceIndex][0];
				fy += facePoints[faceIndex][1];
				fz += facePoints[faceIndex][2];
			}
			fx /= n; fy /= n; fz /= n;
			let rx = 0, ry = 0, rz = 0;
			for (const pointIndex of edges) {
				rx += (vertices[pointIndex][0] + vertex[0]) / 2;
				ry += (vertices[pointIndex][1] + vertex[1]) / 2;
				rz += (vertices[pointIndex][2] + vertex[2]) / 2;
			}
			rx /= edges.length; ry /= edges.length; rz /= edges.length;
			vertices[index] = [(fx + 2 * rx + (n - 3) * vertex[0]) / n, (fy + 2 * ry + (n - 3) * vertex[1]) / n, (fz + 2 * rz + (n - 3) * vertex[2]) / n];
		});
	}

	const facePointStart = vertices.length;
	for (const fp of facePoints) vertices.push(fp);

	const faces: Face[] = [];
	const faceSlots: number[] = [];
	mesh.faces.forEach((face, faceIndex) => {
		const fp = facePointStart + faceIndex;
		const edges = faceEdges[faceIndex];
		for (let i = 0; i < face.length; i++) {
			const prev = edges[(i - 1 + edges.length) % edges.length];
			const next = edges[i];
			faces.push([face[i], edgePoints.get(edgeKey(next[0], next[1])) as number, fp, edgePoints.get(edgeKey(prev[0], prev[1])) as number]);
			faceSlots.push(mesh.faceSlot?.[faceIndex] ?? 0);
		}
	});

	return finalizeMesh({ vertices, faces, edges: [], radius: 0, slots: mesh.slots ?? [], faceSlot: faceSlots }, mesh.smooth ?? true);
}

export function deleteFaces(mesh: Mesh, faceIndices: number[]): Mesh {
	const remove = new Set(faceIndices);
	const faces: Face[] = [];
	const faceSlot: number[] = [];
	mesh.faces.forEach((face, index) => {
		if (remove.has(index)) return;
		faces.push([...face]);
		faceSlot.push(mesh.faceSlot?.[index] ?? 0);
	});
	return compactMesh(mesh.vertices, faces, mesh.smooth, faceSlot, mesh.slots ?? []);
}

export function flipNormals(mesh: Mesh): Mesh {
	const faces = mesh.faces.map((f) => [...f].reverse());
	return finalizeMesh(
		{ vertices: mesh.vertices.map((v) => [v[0], v[1], v[2]] as Vec3), faces, edges: [], radius: 0, slots: mesh.slots ?? [], faceSlot: [...(mesh.faceSlot ?? [])] },
		mesh.smooth,
	);
}

export function mergeByDistance(mesh: Mesh, threshold = 0.0001): Mesh {
	const vertices: Vec3[] = [];
	const remap: number[] = [];
	const lookup = new Map<string, number>();
	const step = Math.max(1e-6, threshold);
	for (let i = 0; i < mesh.vertices.length; i++) {
		const v = mesh.vertices[i];
		const key = `${Math.round(v[0] / step)}:${Math.round(v[1] / step)}:${Math.round(v[2] / step)}`;
		const existing = lookup.get(key);
		if (existing !== undefined) {
			remap[i] = existing;
		} else {
			const index = vertices.length;
			vertices.push([v[0], v[1], v[2]] as Vec3);
			lookup.set(key, index);
			remap[i] = index;
		}
	}
	const faces: Face[] = [];
	const faceSlot: number[] = [];
	mesh.faces.forEach((face, faceIndex) => {
		const mapped: number[] = [];
		for (const index of face) {
			const value = remap[index];
			if (mapped[mapped.length - 1] !== value && mapped[0] !== value) mapped.push(value);
		}
		if (mapped.length < 3) return;
		faces.push(mapped);
		faceSlot.push(mesh.faceSlot?.[faceIndex] ?? 0);
	});
	return compactMesh(vertices, faces, mesh.smooth, faceSlot, mesh.slots ?? []);
}

function compactMesh(vertices: Vec3[], faces: Face[], smooth?: boolean, faceSlot: number[] = [], slots: MaterialSlot[] = []): Mesh {
	const used = new Map<number, number>();
	const nextVertices: Vec3[] = [];
	const remap = (index: number) => {
		if (used.has(index)) return used.get(index) as number;
		const target = nextVertices.length;
		nextVertices.push(vertices[index]);
		used.set(index, target);
		return target;
	};
	const nextFaces = faces.map((face) => face.map(remap));
	return finalizeMesh({ vertices: nextVertices, faces: nextFaces, edges: [], radius: 0, slots, faceSlot }, smooth);
}

export function extrudeFaces(mesh: Mesh, faceIndices: number[], distance = 0.35): Mesh {
	if (!faceIndices.length) return cloneMesh(mesh);
	const selected = new Set(faceIndices);
	const result = cloneMesh(mesh);
	let nx = 0, ny = 0, nz = 0;
	for (const index of faceIndices) {
		const fn = faceNormal(mesh, mesh.faces[index]);
		nx += fn[0];
		ny += fn[1];
		nz += fn[2];
	}
	const len = Math.hypot(nx, ny, nz) || 1;
	nx /= len; ny /= len; nz /= len;

	const vertexCopy = new Map<number, number>();
	const copyVertex = (index: number): number => {
		if (vertexCopy.has(index)) return vertexCopy.get(index) as number;
		const v = result.vertices[index];
		const target = result.vertices.length;
		result.vertices.push([v[0] + nx * distance, v[1] + ny * distance, v[2] + nz * distance]);
		vertexCopy.set(index, target);
		return target;
	};

	const boundaryEdges = new Map<string, [number, number]>();
	for (const faceIndex of faceIndices) {
		const face = mesh.faces[faceIndex];
		for (let i = 0; i < face.length; i++) {
			const a = face[i];
			const b = face[(i + 1) % face.length];
			const key = edgeKey(a, b);
			let shared = 0;
			for (const other of faceIndices) {
				const otherFace = mesh.faces[other];
				for (let j = 0; j < otherFace.length; j++) {
					if (edgeKey(otherFace[j], otherFace[(j + 1) % otherFace.length]) === key) shared++;
				}
			}
			if (shared < 2) boundaryEdges.set(key, [a, b]);
		}
	}

	const nextFaces: Face[] = [];
	const nextFaceSlot: number[] = [];
	mesh.faces.forEach((face, index) => {
		if (!selected.has(index)) {
			nextFaces.push([...face]);
			nextFaceSlot.push(mesh.faceSlot?.[index] ?? 0);
			return;
		}
		nextFaces.push(face.map((vertexIndex) => copyVertex(vertexIndex)));
		nextFaceSlot.push(mesh.faceSlot?.[index] ?? 0);
	});

	const wallSlot = mesh.faceSlot?.[faceIndices[0]] ?? 0;
	for (const [, [a, b]] of boundaryEdges) {
		nextFaces.push([a, b, copyVertex(b), copyVertex(a)]);
		nextFaceSlot.push(wallSlot);
	}

	return finalizeMesh(
		{ vertices: result.vertices, faces: nextFaces, edges: [], radius: 0, slots: mesh.slots ?? [], faceSlot: nextFaceSlot },
		mesh.smooth,
	);
}

export function insetFaces(mesh: Mesh, faceIndices: number[], amount = 0.18): Mesh {
	if (!faceIndices.length) return cloneMesh(mesh);
	const vertices = mesh.vertices.map((v) => [v[0], v[1], v[2]] as Vec3);
	const nextFaces: Face[] = [];
	for (const face of mesh.faces) nextFaces.push([...face]);

	const indexByPosition = new Map<string, number>();
	const addVertex = (v: Vec3): number => {
		const key = `${v[0].toFixed(5)}:${v[1].toFixed(5)}:${v[2].toFixed(5)}`;
		const existing = indexByPosition.get(key);
		if (existing !== undefined) return existing;
		const target = vertices.length;
		vertices.push([v[0], v[1], v[2]] as Vec3);
		indexByPosition.set(key, target);
		return target;
	};

	const extras: Face[] = [];
	for (const faceIndex of faceIndices) {
		const face = mesh.faces[faceIndex];
		const center = faceCenter(mesh, face);
		const inner = face.map((vertexIndex) => {
			const v = mesh.vertices[vertexIndex];
			return addVertex([
				v[0] + (center[0] - v[0]) * amount,
				v[1] + (center[1] - v[1]) * amount,
				v[2] + (center[2] - v[2]) * amount,
			]);
		});
		nextFaces[faceIndex] = inner;
		for (let i = 0; i < face.length; i++) {
			const a = face[i];
			const b = face[(i + 1) % face.length];
			extras.push([a, b, inner[(i + 1) % inner.length], inner[i]]);
		}
	}

	const nextFaceSlot: number[] = [];
	mesh.faces.forEach((_, index) => {
		nextFaceSlot.push(mesh.faceSlot?.[index] ?? 0);
	});
	const rimSlot = mesh.faceSlot?.[faceIndices[0]] ?? 0;
	for (let i = 0; i < extras.length; i++) nextFaceSlot.push(rimSlot);

	return finalizeMesh(
		{ vertices, faces: [...nextFaces, ...extras], edges: [], radius: 0, slots: mesh.slots ?? [], faceSlot: nextFaceSlot },
		mesh.smooth,
	);
}

/**
 * Array Modifier: creates `count` copies of the mesh offset along [ox, oy, oz].
 */
export function arrayMesh(mesh: Mesh, count = 3, offset: Vec3 = [1.25, 0, 0]): Mesh {
	const safeCount = Math.min(12, Math.max(2, Math.floor(count)));
	const vertices: Vec3[] = [];
	const faces: Face[] = [];
	const faceSlot: number[] = [];
	const vCount = mesh.vertices.length;

	for (let c = 0; c < safeCount; c++) {
		const base = c * vCount;
		const dx = offset[0] * c;
		const dy = offset[1] * c;
		const dz = offset[2] * c;
		for (let i = 0; i < vCount; i++) {
			const v = mesh.vertices[i];
			vertices.push([v[0] + dx, v[1] + dy, v[2] + dz]);
		}
		mesh.faces.forEach((face, fIdx) => {
			faces.push(face.map((idx) => idx + base));
			faceSlot.push(mesh.faceSlot?.[fIdx] ?? 0);
		});
	}
	return finalizeMesh({ vertices, faces, slots: mesh.slots, faceSlot }, mesh.smooth);
}

/**
 * Solidify Modifier: adds shell thickness along vertex normals and bridges open boundary edges.
 */
export function solidifyMesh(mesh: Mesh, thickness = 0.12): Mesh {
	const normals = computeVertexNormals(mesh);
	const vCount = mesh.vertices.length;
	const vertices: Vec3[] = mesh.vertices.map((v) => [v[0], v[1], v[2]] as Vec3);
	for (let i = 0; i < vCount; i++) {
		const v = mesh.vertices[i];
		const n = normals[i];
		vertices.push([v[0] - n[0] * thickness, v[1] - n[1] * thickness, v[2] - n[2] * thickness]);
	}
	const faces: Face[] = [];
	const faceSlot: number[] = [];
	mesh.faces.forEach((face, idx) => {
		const slot = mesh.faceSlot?.[idx] ?? 0;
		faces.push([...face]);
		faceSlot.push(slot);
		faces.push([...face].reverse().map((vIdx) => vIdx + vCount));
		faceSlot.push(slot);
	});
	// Bridge boundary edges
	const edgeCount = new Map<string, { a: number; b: number; count: number; slot: number }>();
	mesh.faces.forEach((face, idx) => {
		const slot = mesh.faceSlot?.[idx] ?? 0;
		for (let i = 0; i < face.length; i++) {
			const a = face[i];
			const b = face[(i + 1) % face.length];
			const k = edgeKey(a, b);
			const entry = edgeCount.get(k);
			if (entry) entry.count++;
			else edgeCount.set(k, { a, b, count: 1, slot });
		}
	});
	for (const entry of edgeCount.values()) {
		if (entry.count === 1) {
			faces.push([entry.a, entry.b, entry.b + vCount, entry.a + vCount]);
			faceSlot.push(entry.slot);
		}
	}
	return finalizeMesh({ vertices, faces, slots: mesh.slots, faceSlot }, mesh.smooth);
}

/**
 * Laplacian Smooth Modifier: relaxes vertex positions toward their edge neighbours.
 */
export function smoothMeshVertices(mesh: Mesh, iterations = 2, factor = 0.5): Mesh {
	const vertices: Vec3[] = mesh.vertices.map((v) => [v[0], v[1], v[2]] as Vec3);
	const adj = new Map<number, number[]>();
	for (const [a, b] of mesh.edges) {
		if (!adj.has(a)) adj.set(a, []);
		if (!adj.has(b)) adj.set(b, []);
		adj.get(a)!.push(b);
		adj.get(b)!.push(a);
	}
	for (let iter = 0; iter < iterations; iter++) {
		const next = vertices.map((v) => [v[0], v[1], v[2]] as Vec3);
		for (let i = 0; i < vertices.length; i++) {
			const neighbours = adj.get(i);
			if (!neighbours || !neighbours.length) continue;
			let ax = 0, ay = 0, az = 0;
			for (const n of neighbours) {
				ax += vertices[n][0];
				ay += vertices[n][1];
				az += vertices[n][2];
			}
			ax /= neighbours.length;
			ay /= neighbours.length;
			az /= neighbours.length;
			next[i][0] = vertices[i][0] + (ax - vertices[i][0]) * factor;
			next[i][1] = vertices[i][1] + (ay - vertices[i][1]) * factor;
			next[i][2] = vertices[i][2] + (az - vertices[i][2]) * factor;
		}
		for (let i = 0; i < vertices.length; i++) vertices[i] = next[i];
	}
	return finalizeMesh({ ...mesh, vertices }, mesh.smooth);
}

/**
 * UV Unwrap Projections: box, planar, cylindrical, spherical.
 */
export function unwrapMeshUV(mesh: Mesh, mode: 'box' | 'planar' | 'cylindrical' | 'spherical' = 'box', scale = 1): Mesh {
	const uvs: [number, number][] = [];
	const normals = computeVertexNormals(mesh);
	for (let i = 0; i < mesh.vertices.length; i++) {
		const v = mesh.vertices[i];
		const n = normals[i] ?? [0, 1, 0];
		let u = 0.5;
		let t = 0.5;
		if (mode === 'planar') {
			u = (v[0] + 0.5) * scale;
			t = (v[2] + 0.5) * scale;
		} else if (mode === 'cylindrical') {
			u = ((Math.atan2(v[2], v[0]) / (Math.PI * 2)) + 0.5) * scale;
			t = (v[1] + 0.5) * scale;
		} else if (mode === 'spherical') {
			const r = Math.hypot(v[0], v[1], v[2]) || 1;
			u = ((Math.atan2(v[2], v[0]) / (Math.PI * 2)) + 0.5) * scale;
			t = (0.5 - Math.asin(Math.max(-1, Math.min(1, v[1] / r))) / Math.PI) * scale;
		} else {
			const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
			if (ax >= ay && ax >= az) {
				u = (v[2] + 0.5) * scale;
				t = (v[1] + 0.5) * scale;
			} else if (ay >= az) {
				u = (v[0] + 0.5) * scale;
				t = (v[2] + 0.5) * scale;
			} else {
				u = (v[0] + 0.5) * scale;
				t = (v[1] + 0.5) * scale;
			}
		}
		uvs.push([u, t]);
	}
	const result = cloneMesh(mesh);
	result.uvs = uvs;
	return result;
}

/**
 * Bakes procedural lighting / Ambient Occlusion / Curvature / Height Gradient into per-vertex colors.
 */
export function bakeMeshVertexColors(mesh: Mesh, mode: 'ao' | 'light' | 'gradient' | 'curvature' = 'ao'): Mesh {
	const result = cloneMesh(mesh);
	const normals = computeVertexNormals(result);
	const vCount = result.vertices.length;
	const colors = new Array<number>(vCount * 3);

	const adj = new Map<number, number[]>();
	for (const [a, b] of result.edges) {
		if (!adj.has(a)) adj.set(a, []);
		if (!adj.has(b)) adj.set(b, []);
		adj.get(a)!.push(b);
		adj.get(b)!.push(a);
	}

	let minY = Infinity, maxY = -Infinity;
	for (const v of result.vertices) {
		if (v[1] < minY) minY = v[1];
		if (v[1] > maxY) maxY = v[1];
	}
	const spanY = Math.max(0.001, maxY - minY);

	for (let i = 0; i < vCount; i++) {
		const v = result.vertices[i];
		const n = normals[i] ?? [0, 1, 0];
		let r = 1, g = 1, b = 1;

		if (mode === 'ao') {
			const list = adj.get(i) ?? [];
			let cavity = 0;
			for (const nb of list) {
				const nv = result.vertices[nb];
				const dx = nv[0] - v[0], dy = nv[1] - v[1], dz = nv[2] - v[2];
				const len = Math.hypot(dx, dy, dz) || 1;
				cavity += (dx * n[0] + dy * n[1] + dz * n[2]) / len;
			}
			const avg = list.length ? cavity / list.length : 0;
			const shade = Math.min(1, Math.max(0.18, 0.72 - avg * 0.65 + (v[1] - minY) / spanY * 0.22));
			r = shade; g = shade; b = shade * 1.03;
		} else if (mode === 'light') {
			const ndl = Math.max(0, n[0] * -0.45 + n[1] * 0.82 + n[2] * 0.45);
			const warm = 0.25 + ndl * 0.75;
			r = Math.min(1, warm * 1.06);
			g = Math.min(1, warm * 0.98);
			b = Math.min(1, 0.32 + ndl * 0.62);
		} else if (mode === 'gradient') {
			const t = (v[1] - minY) / spanY;
			r = 0.2 + t * 0.75;
			g = 0.35 + t * 0.6;
			b = 0.55 + (1 - t) * 0.4;
		} else {
			const list = adj.get(i) ?? [];
			let lapX = 0, lapY = 0, lapZ = 0;
			for (const nb of list) {
				lapX += result.vertices[nb][0] - v[0];
				lapY += result.vertices[nb][1] - v[1];
				lapZ += result.vertices[nb][2] - v[2];
			}
			const curv = list.length ? Math.min(1, Math.hypot(lapX, lapY, lapZ) / list.length * 3.5) : 0.5;
			r = 0.25 + curv * 0.75;
			g = 0.3 + curv * 0.68;
			b = 0.45 + (1 - curv) * 0.45;
		}
		colors[i * 3] = Math.min(1, Math.max(0, r));
		colors[i * 3 + 1] = Math.min(1, Math.max(0, g));
		colors[i * 3 + 2] = Math.min(1, Math.max(0, b));
	}
	result.colors = colors;
	return result;
}

export function transformVertices(mesh: Mesh, indices: number[], fn: (v: Vec3) => Vec3): Mesh {
	const result = cloneMesh(mesh);
	for (const index of indices) {
		if (index < 0 || index >= result.vertices.length) continue;
		result.vertices[index] = fn(result.vertices[index]);
	}
	return finalizeMesh(result, mesh.smooth);
}

export function triangulate(mesh: Mesh): { positions: number[]; indices: number[] } {
	const positions: number[] = [];
	const indices: number[] = [];
	for (const face of mesh.faces) {
		const base = positions.length / 3;
		for (const index of face) {
			const v = mesh.vertices[index];
			positions.push(v[0], v[1], v[2]);
		}
		for (let i = 1; i < face.length - 1; i++) indices.push(base, base + i, base + i + 1);
	}
	return { positions, indices };
}

export function bridgeEdgeLoops(mesh: Mesh, loop1: number[], loop2: number[]): Mesh {
	if (!loop1.length || !loop2.length) return mesh;
	const faces = mesh.faces.map((f) => [...f]);
	const faceSlots = [...(mesh.faceSlot ?? [])];
	const n = Math.min(loop1.length, loop2.length);

	for (let i = 0; i < n; i++) {
		const nextI = (i + 1) % n;
		const a = loop1[i];
		const b = loop1[nextI];
		const c = loop2[nextI];
		const d = loop2[i];
		faces.push([a, b, c, d]);
		faceSlots.push(0);
	}
	return finalizeMesh({
		vertices: mesh.vertices.map((v) => [v[0], v[1], v[2]] as Vec3),
		faces,
		edges: [],
		radius: 0,
		slots: mesh.slots ?? [],
		faceSlot: faceSlots,
	}, mesh.smooth);
}

export function mergeVertices(
	mesh: Mesh,
	vertexIndices: number[],
	mode: 'center' | 'first' | 'last' | 'collapse' | 'distance' = 'center',
	threshold = 0.001
): Mesh {
	if (!vertexIndices.length) return mesh;
	if (mode === 'distance') {
		const vertices: Vec3[] = [];
		const remap = new Map<number, number>();
		mesh.vertices.forEach((v, idx) => {
			if (!vertexIndices.includes(idx)) {
				remap.set(idx, vertices.length);
				vertices.push([...v]);
				return;
			}
			let found = -1;
			for (let i = 0; i < vertices.length; i++) {
				const existing = vertices[i];
				if (Math.hypot(v[0] - existing[0], v[1] - existing[1], v[2] - existing[2]) <= threshold) {
					found = i;
					break;
				}
			}
			if (found >= 0) {
				remap.set(idx, found);
			} else {
				remap.set(idx, vertices.length);
				vertices.push([...v]);
			}
		});
		const faces: Face[] = [];
		const faceSlots: number[] = [];
		mesh.faces.forEach((face, fIdx) => {
			const remapped = face.map((vi) => remap.get(vi) ?? vi);
			const unique = remapped.filter((v, i, arr) => arr.indexOf(v) === i);
			if (unique.length >= 3) {
				faces.push(unique);
				faceSlots.push(mesh.faceSlot?.[fIdx] ?? 0);
			}
		});
		return finalizeMesh({ vertices, faces, edges: [], radius: 0, slots: mesh.slots ?? [], faceSlot: faceSlots }, mesh.smooth);
	}

	const vertices = mesh.vertices.map((v) => [v[0], v[1], v[2]] as Vec3);
	let targetPos: Vec3;
	let targetIdx: number;

	if (mode === 'first') {
		targetIdx = vertexIndices[0];
		targetPos = [...vertices[targetIdx]];
	} else if (mode === 'last') {
		targetIdx = vertexIndices[vertexIndices.length - 1];
		targetPos = [...vertices[targetIdx]];
	} else {
		let sx = 0, sy = 0, sz = 0;
		for (const vi of vertexIndices) {
			sx += vertices[vi][0];
			sy += vertices[vi][1];
			sz += vertices[vi][2];
		}
		targetPos = [sx / vertexIndices.length, sy / vertexIndices.length, sz / vertexIndices.length];
		targetIdx = vertexIndices[0];
	}
	vertices[targetIdx] = targetPos;

	const remap = new Map<number, number>();
	for (const vi of vertexIndices) {
		remap.set(vi, targetIdx);
	}

	const faces: Face[] = [];
	const faceSlots: number[] = [];
	mesh.faces.forEach((face, fIdx) => {
		const remapped = face.map((vi) => remap.get(vi) ?? vi);
		const collapsed: number[] = [];
		for (let i = 0; i < remapped.length; i++) {
			const prev = collapsed[collapsed.length - 1];
			if (remapped[i] !== prev) {
				collapsed.push(remapped[i]);
			}
		}
		if (collapsed.length > 2 && collapsed[0] === collapsed[collapsed.length - 1]) {
			collapsed.pop();
		}
		const unique = new Set(collapsed);
		if (unique.size >= 3) {
			faces.push(collapsed);
			faceSlots.push(mesh.faceSlot?.[fIdx] ?? 0);
		}
	});

	const used = new Map<number, number>();
	const nextVertices: Vec3[] = [];
	const compactRemap = (idx: number) => {
		if (used.has(idx)) return used.get(idx)!;
		const nIdx = nextVertices.length;
		nextVertices.push(vertices[idx]);
		used.set(idx, nIdx);
		return nIdx;
	};
	const nextFaces = faces.map((f) => f.map(compactRemap));
	return finalizeMesh({ vertices: nextVertices, faces: nextFaces, edges: [], radius: 0, slots: mesh.slots ?? [], faceSlot: faceSlots }, mesh.smooth);
}

export function deleteGeometry(mesh: Mesh, kind: 'vertex' | 'edge' | 'face', indices: number[]): Mesh {
	if (!indices.length) return mesh;
	const indexSet = new Set(indices);
	let remainingFaces: Face[] = [];
	let faceSlots: number[] = [];

	if (kind === 'face') {
		mesh.faces.forEach((f, idx) => {
			if (!indexSet.has(idx)) {
				remainingFaces.push([...f]);
				faceSlots.push(mesh.faceSlot?.[idx] ?? 0);
			}
		});
	} else if (kind === 'vertex') {
		mesh.faces.forEach((f, idx) => {
			const hasVertex = f.some((vi) => indexSet.has(vi));
			if (!hasVertex) {
				remainingFaces.push([...f]);
				faceSlots.push(mesh.faceSlot?.[idx] ?? 0);
			}
		});
	} else if (kind === 'edge') {
		const deletedEdges = indices.map((i) => mesh.edges[i]).filter(Boolean);
		const edgeSet = new Set(deletedEdges.map((e) => (e[0] < e[1] ? `${e[0]}_${e[1]}` : `${e[1]}_${e[0]}`)));
		mesh.faces.forEach((f, idx) => {
			let containsDeletedEdge = false;
			for (let i = 0; i < f.length; i++) {
				const a = f[i];
				const b = f[(i + 1) % f.length];
				const k = a < b ? `${a}_${b}` : `${b}_${a}`;
				if (edgeSet.has(k)) {
					containsDeletedEdge = true;
					break;
				}
			}
			if (!containsDeletedEdge) {
				remainingFaces.push([...f]);
				faceSlots.push(mesh.faceSlot?.[idx] ?? 0);
			}
		});
	}

	if (!remainingFaces.length) {
		return finalizeMesh({ vertices: [], faces: [], edges: [], radius: 0, slots: mesh.slots ?? [] }, mesh.smooth);
	}

	const used = new Map<number, number>();
	const nextVertices: Vec3[] = [];
	const compactRemap = (idx: number) => {
		if (used.has(idx)) return used.get(idx)!;
		const nIdx = nextVertices.length;
		nextVertices.push(mesh.vertices[idx]);
		used.set(idx, nIdx);
		return nIdx;
	};
	const nextFaces = remainingFaces.map((f) => f.map(compactRemap));
	return finalizeMesh({ vertices: nextVertices, faces: nextFaces, edges: [], radius: 0, slots: mesh.slots ?? [], faceSlot: faceSlots }, mesh.smooth);
}

export function dissolveGeometry(mesh: Mesh, kind: 'vertex' | 'edge' | 'face', indices: number[]): Mesh {
	if (!indices.length) return mesh;
	if (kind === 'face') {
		const faceSet = new Set(indices);
		if (faceSet.size <= 1) return mesh;

		const edgeCounts = new Map<string, { a: number; b: number; count: number }>();
		for (const fIdx of indices) {
			const face = mesh.faces[fIdx];
			if (!face) continue;
			for (let i = 0; i < face.length; i++) {
				const a = face[i];
				const b = face[(i + 1) % face.length];
				const k = a < b ? `${a}_${b}` : `${b}_${a}`;
				const entry = edgeCounts.get(k) || { a, b, count: 0 };
				entry.count++;
				edgeCounts.set(k, entry);
			}
		}

		const boundaryEdges: [number, number][] = [];
		for (const entry of edgeCounts.values()) {
			if (entry.count === 1) {
				boundaryEdges.push([entry.a, entry.b]);
			}
		}

		if (boundaryEdges.length < 3) return mesh;

		const adj = new Map<number, number[]>();
		for (const [a, b] of boundaryEdges) {
			if (!adj.has(a)) adj.set(a, []);
			if (!adj.has(b)) adj.set(b, []);
			adj.get(a)!.push(b);
			adj.get(b)!.push(a);
		}

		const mergedFace: number[] = [];
		let start = boundaryEdges[0][0];
		let current = start;
		let prev = -1;
		const visited = new Set<number>();

		for (let step = 0; step < boundaryEdges.length; step++) {
			mergedFace.push(current);
			visited.add(current);
			const neighbors = adj.get(current) || [];
			const next = neighbors.find((n) => n !== prev && (!visited.has(n) || n === start));
			if (next === undefined || next === start) break;
			prev = current;
			current = next;
		}

		if (mergedFace.length < 3) return mesh;

		const faces: Face[] = [];
		const faceSlots: number[] = [];
		mesh.faces.forEach((f, idx) => {
			if (!faceSet.has(idx)) {
				faces.push([...f]);
				faceSlots.push(mesh.faceSlot?.[idx] ?? 0);
			}
		});
		faces.push(mergedFace);
		faceSlots.push(mesh.faceSlot?.[indices[0]] ?? 0);

		return finalizeMesh({
			vertices: mesh.vertices.map((v) => [v[0], v[1], v[2]] as Vec3),
			faces,
			edges: [],
			radius: 0,
			slots: mesh.slots ?? [],
			faceSlot: faceSlots,
		}, mesh.smooth);
	}

	if (kind === 'edge') {
		const edge = mesh.edges[indices[0]];
		if (!edge) return mesh;
		const [ea, eb] = edge;
		const sharingFaces: number[] = [];
		mesh.faces.forEach((f, idx) => {
			for (let i = 0; i < f.length; i++) {
				const a = f[i];
				const b = f[(i + 1) % f.length];
				if ((a === ea && b === eb) || (a === eb && b === ea)) {
					sharingFaces.push(idx);
					break;
				}
			}
		});
		if (sharingFaces.length === 2) {
			return dissolveGeometry(mesh, 'face', sharingFaces);
		}
		return deleteGeometry(mesh, 'face', sharingFaces);
	}

	if (kind === 'vertex') {
		const vi = indices[0];
		const sharingFaces: number[] = [];
		mesh.faces.forEach((f, idx) => {
			if (f.includes(vi)) sharingFaces.push(idx);
		});
		if (sharingFaces.length >= 2) {
			return dissolveGeometry(mesh, 'face', sharingFaces);
		}
		return deleteGeometry(mesh, 'face', sharingFaces);
	}

	return mesh;
}

export function duplicateMeshGeometry(mesh: Mesh, kind: 'vertex' | 'edge' | 'face', indices: number[]): {
	mesh: Mesh;
	newVertexIndices: number[];
	newFaceIndices: number[];
} {
	if (!indices.length) return { mesh, newVertexIndices: [], newFaceIndices: [] };

	let facesToDup: number[] = [];
	if (kind === 'face') {
		facesToDup = [...indices];
	} else if (kind === 'vertex') {
		const vSet = new Set(indices);
		mesh.faces.forEach((f, idx) => {
			if (f.some((vi) => vSet.has(vi))) facesToDup.push(idx);
		});
	} else if (kind === 'edge') {
		const eSet = new Set(indices.map((i) => mesh.edges[i]).filter(Boolean).map((e) => `${e[0]}_${e[1]}`));
		mesh.faces.forEach((f, idx) => {
			for (let i = 0; i < f.length; i++) {
				const a = f[i];
				const b = f[(i + 1) % f.length];
				if (eSet.has(`${a}_${b}`) || eSet.has(`${b}_${a}`)) {
					facesToDup.push(idx);
					break;
				}
			}
		});
	}

	if (!facesToDup.length) return { mesh, newVertexIndices: [], newFaceIndices: [] };

	const vertices = mesh.vertices.map((v) => [v[0], v[1], v[2]] as Vec3);
	const faces = mesh.faces.map((f) => [...f]);
	const faceSlots = [...(mesh.faceSlot ?? [])];

	const vRemap = new Map<number, number>();
	const newVertexIndices: number[] = [];

	for (const fIdx of facesToDup) {
		const f = mesh.faces[fIdx];
		for (const vi of f) {
			if (!vRemap.has(vi)) {
				const nVi = vertices.length;
				vertices.push([...mesh.vertices[vi]]);
				vRemap.set(vi, nVi);
				newVertexIndices.push(nVi);
			}
		}
	}

	const newFaceIndices: number[] = [];
	for (const fIdx of facesToDup) {
		const oldFace = mesh.faces[fIdx];
		const nFace = oldFace.map((vi) => vRemap.get(vi)!);
		newFaceIndices.push(faces.length);
		faces.push(nFace);
		faceSlots.push(mesh.faceSlot?.[fIdx] ?? 0);
	}

	const nextMesh = finalizeMesh({
		vertices,
		faces,
		edges: [],
		radius: 0,
		slots: mesh.slots ?? [],
		faceSlot: faceSlots,
	}, mesh.smooth);

	return { mesh: nextMesh, newVertexIndices, newFaceIndices };
}

export function separateGeometry(mesh: Mesh, faceIndices: number[]): {
	remainingMesh: Mesh;
	separatedMesh: Mesh;
} {
	const faceSet = new Set(faceIndices);
	const sepFaces: Face[] = [];
	const sepFaceSlots: number[] = [];
	const remFaces: Face[] = [];
	const remFaceSlots: number[] = [];

	mesh.faces.forEach((f, idx) => {
		if (faceSet.has(idx)) {
			sepFaces.push([...f]);
			sepFaceSlots.push(mesh.faceSlot?.[idx] ?? 0);
		} else {
			remFaces.push([...f]);
			remFaceSlots.push(mesh.faceSlot?.[idx] ?? 0);
		}
	});

	const usedSep = new Map<number, number>();
	const sepVerts: Vec3[] = [];
	const compactSepRemap = (idx: number) => {
		if (usedSep.has(idx)) return usedSep.get(idx)!;
		const n = sepVerts.length;
		sepVerts.push(mesh.vertices[idx]);
		usedSep.set(idx, n);
		return n;
	};
	const finalSepFaces = sepFaces.map((f) => f.map(compactSepRemap));
	const separatedMesh = finalizeMesh({
		vertices: sepVerts,
		faces: finalSepFaces,
		edges: [],
		radius: 0,
		slots: mesh.slots ?? [],
		faceSlot: sepFaceSlots,
	}, mesh.smooth);

	const usedRem = new Map<number, number>();
	const remVerts: Vec3[] = [];
	const compactRemRemap = (idx: number) => {
		if (usedRem.has(idx)) return usedRem.get(idx)!;
		const n = remVerts.length;
		remVerts.push(mesh.vertices[idx]);
		usedRem.set(idx, n);
		return n;
	};
	const finalRemFaces = remFaces.map((f) => f.map(compactRemRemap));
	const remainingMesh = finalizeMesh({
		vertices: remVerts,
		faces: finalRemFaces,
		edges: [],
		radius: 0,
		slots: mesh.slots ?? [],
		faceSlot: remFaceSlots,
	}, mesh.smooth);

	return { remainingMesh, separatedMesh };
}

export function mirrorMesh(mesh: Mesh, axis: 'x' | 'y' | 'z', weldThreshold = 0.001): Mesh {
	const axisIdx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
	const vertices: Vec3[] = mesh.vertices.map((v) => [v[0], v[1], v[2]] as Vec3);
	const faces: Face[] = mesh.faces.map((f) => [...f]);
	const faceSlots: number[] = [...(mesh.faceSlot ?? [])];

	const vRemap = new Map<number, number>();
	mesh.vertices.forEach((v, idx) => {
		if (Math.abs(v[axisIdx]) <= weldThreshold) {
			vRemap.set(idx, idx);
		} else {
			const nVi = vertices.length;
			const mirrored: Vec3 = [v[0], v[1], v[2]];
			mirrored[axisIdx] = -mirrored[axisIdx];
			vertices.push(mirrored);
			vRemap.set(idx, nVi);
		}
	});

	mesh.faces.forEach((f, idx) => {
		const mirroredFace = f.map((vi) => vRemap.get(vi)!).reverse();
		faces.push(mirroredFace);
		faceSlots.push(mesh.faceSlot?.[idx] ?? 0);
	});

	return finalizeMesh({
		vertices,
		faces,
		edges: [],
		radius: 0,
		slots: mesh.slots ?? [],
		faceSlot: faceSlots,
	}, mesh.smooth);
}

export function decimateMesh(mesh: Mesh, ratio = 0.5): Mesh {
	const targetFaces = Math.max(4, Math.floor(mesh.faces.length * Math.max(0.05, Math.min(1, ratio))));
	if (mesh.faces.length <= targetFaces) return mesh;

	let currentMesh = mesh;
	let attempts = 0;
	while ((currentMesh.faces.length > targetFaces || currentMesh.vertices.length > targetFaces + 2) && attempts < 100) {
		attempts++;
		let shortestLen = Infinity;
		let bestEdge: [number, number] | null = null;
		for (const edge of currentMesh.edges) {
			const v0 = currentMesh.vertices[edge[0]];
			const v1 = currentMesh.vertices[edge[1]];
			if (!v0 || !v1) continue;
			const dist = Math.hypot(v0[0] - v1[0], v0[1] - v1[1], v0[2] - v1[2]);
			if (dist < shortestLen) {
				shortestLen = dist;
				bestEdge = edge;
			}
		}
		if (!bestEdge) break;

		const next = mergeVertices(currentMesh, [bestEdge[0], bestEdge[1]], 'center');
		if (next.vertices.length >= currentMesh.vertices.length) break;
		currentMesh = next;
	}
	return currentMesh;
}

export function screwSpinMesh(
	mesh: Mesh,
	axis: 'x' | 'y' | 'z' = 'z',
	angleDeg = 360,
	steps = 16,
	screwPitch = 0
): Mesh {
	if (!mesh.vertices.length) return mesh;
	const angleRad = (angleDeg * Math.PI) / 180;
	const totalSteps = Math.max(3, steps);

	const baseVerts = mesh.vertices.map((v) => [v[0], v[1], v[2]] as Vec3);
	const numBase = baseVerts.length;
	const vertices: Vec3[] = [];
	const faces: Face[] = [];
	const faceSlots: number[] = [];

	for (let s = 0; s <= totalSteps; s++) {
		const frac = s / totalSteps;
		const a = frac * angleRad;
		const pitchOffset = frac * screwPitch;
		const cosA = Math.cos(a);
		const sinA = Math.sin(a);

		for (let vi = 0; vi < numBase; vi++) {
			const p = baseVerts[vi];
			let x = p[0], y = p[1], z = p[2];
			if (axis === 'z') {
				const nx = x * cosA - y * sinA;
				const ny = x * sinA + y * cosA;
				vertices.push([nx, ny, z + pitchOffset]);
			} else if (axis === 'y') {
				const nx = x * cosA + z * sinA;
				const nz = -x * sinA + z * cosA;
				vertices.push([nx, y + pitchOffset, nz]);
			} else {
				const ny = y * cosA - z * sinA;
				const nz = y * sinA + z * cosA;
				vertices.push([x + pitchOffset, ny, nz]);
			}
		}
	}

	for (let s = 0; s < totalSteps; s++) {
		const ringA = s * numBase;
		const ringB = (s + 1) * numBase;
		for (const edge of mesh.edges) {
			const a = ringA + edge[0];
			const b = ringA + edge[1];
			const c = ringB + edge[1];
			const d = ringB + edge[0];
			faces.push([a, b, c, d]);
			faceSlots.push(0);
		}
	}

	return finalizeMesh({
		vertices,
		faces,
		edges: [],
		radius: 0,
		slots: mesh.slots ?? [],
		faceSlot: faceSlots,
	}, mesh.smooth);
}

function rayTriIntersection(orig: Vec3, dir: Vec3, v0: Vec3, v1: Vec3, v2: Vec3): boolean {
	const e1: Vec3 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
	const e2: Vec3 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
	const h: Vec3 = [dir[1] * e2[2] - dir[2] * e2[1], dir[2] * e2[0] - dir[0] * e2[2], dir[0] * e2[1] - dir[1] * e2[0]];
	const a = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
	if (Math.abs(a) < 1e-6) return false;
	const fInv = 1.0 / a;
	const s: Vec3 = [orig[0] - v0[0], orig[1] - v0[1], orig[2] - v0[2]];
	const u = fInv * (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]);
	if (u < 0.0 || u > 1.0) return false;
	const q: Vec3 = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
	const v = fInv * (dir[0] * q[0] + dir[1] * q[1] + dir[2] * q[2]);
	if (v < 0.0 || u + v > 1.0) return false;
	const t = fInv * (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]);
	return t > 1e-5;
}

export function isPointInsideMesh(pt: Vec3, mesh: Mesh): boolean {
	const dir: Vec3 = [0.904, 0.208, 0.373];
	let hits = 0;
	for (const f of mesh.faces) {
		for (let i = 1; i < f.length - 1; i++) {
			if (rayTriIntersection(pt, dir, mesh.vertices[f[0]], mesh.vertices[f[i]], mesh.vertices[f[i + 1]])) {
				hits++;
			}
		}
	}
	return (hits % 2) === 1;
}

export function booleanMesh(
	meshA: Mesh,
	meshB: Mesh,
	op: 'union' | 'difference' | 'intersect' = 'difference'
): Mesh {
	const faces: Face[] = [];
	const faceSlots: number[] = [];
	const vertices: Vec3[] = meshA.vertices.map((v) => [v[0], v[1], v[2]] as Vec3);
	const bVertStart = vertices.length;
	meshB.vertices.forEach((v) => vertices.push([v[0], v[1], v[2]] as Vec3));

	meshA.faces.forEach((f, idx) => {
		const c = faceCenter(meshA, f);
		const inside = isPointInsideMesh(c, meshB);
		if (op === 'union' && !inside) {
			faces.push([...f]);
			faceSlots.push(meshA.faceSlot?.[idx] ?? 0);
		} else if (op === 'difference' && !inside) {
			faces.push([...f]);
			faceSlots.push(meshA.faceSlot?.[idx] ?? 0);
		} else if (op === 'intersect' && inside) {
			faces.push([...f]);
			faceSlots.push(meshA.faceSlot?.[idx] ?? 0);
		}
	});

	const slotOffsetB = (meshA.slots ?? []).length;
	meshB.faces.forEach((f, idx) => {
		const c = faceCenter(meshB, f);
		const inside = isPointInsideMesh(c, meshA);
		const mapped = f.map((v) => v + bVertStart);
		const bSlot = (meshB.faceSlot?.[idx] ?? 0) + slotOffsetB;
		if (op === 'union' && !inside) {
			faces.push(mapped);
			faceSlots.push(bSlot);
		} else if (op === 'difference' && inside) {
			faces.push([...mapped].reverse());
			faceSlots.push(bSlot);
		} else if (op === 'intersect' && inside) {
			faces.push(mapped);
			faceSlots.push(bSlot);
		}
	});

	return finalizeMesh({
		vertices,
		faces,
		edges: [],
		radius: 0,
		slots: [...(meshA.slots ?? []), ...(meshB.slots ?? [])],
		faceSlot: faceSlots,
	}, meshA.smooth);
}

export function joinMeshes(items: { mesh: Mesh; position?: Vec3; rotation?: Vec3; scale?: Vec3 }[]): Mesh {
	if (!items.length) return cubeMesh();
	const vertices: Vec3[] = [];
	const faces: Face[] = [];
	const faceSlots: number[] = [];
	const slots: MaterialSlot[] = [];

	for (const item of items) {
		const m = item.mesh;
		const offset = vertices.length;
		const slotOffset = slots.length;
		const pos = item.position ?? [0, 0, 0];
		const scl = item.scale ?? [1, 1, 1];

		for (const v of m.vertices) {
			vertices.push([
				v[0] * scl[0] + pos[0],
				v[1] * scl[1] + pos[1],
				v[2] * scl[2] + pos[2],
			]);
		}
		for (let fi = 0; fi < m.faces.length; fi++) {
			faces.push(m.faces[fi].map((vi) => vi + offset));
			faceSlots.push((m.faceSlot?.[fi] ?? 0) + slotOffset);
		}
		if (m.slots && m.slots.length) {
			for (const s of m.slots) slots.push({ ...s });
		} else {
			slots.push(defaultMaterialSlot());
		}
	}

	return finalizeMesh({
		vertices,
		faces,
		edges: [],
		radius: 0,
		slots,
		faceSlot: faceSlots,
	});
}

export function decimateLocal(mesh: Mesh, center: Vec3, radius: number): Mesh {
	const r2 = radius * radius;
	const candidates: [number, number][] = [];
	for (const [a, b] of mesh.edges) {
		const va = mesh.vertices[a];
		const vb = mesh.vertices[b];
		if (!va || !vb) continue;
		if (mesh.mask && ((mesh.mask[a] ?? 0) >= 0.95 || (mesh.mask[b] ?? 0) >= 0.95)) continue;
		const da = (va[0] - center[0]) ** 2 + (va[1] - center[1]) ** 2 + (va[2] - center[2]) ** 2;
		const db = (vb[0] - center[0]) ** 2 + (vb[1] - center[1]) ** 2 + (vb[2] - center[2]) ** 2;
		if (da <= r2 && db <= r2) candidates.push([a, b]);
	}
	if (!candidates.length) return mesh;
	candidates.sort((e1, e2) => {
		const a1 = mesh.vertices[e1[0]], b1 = mesh.vertices[e1[1]];
		const a2 = mesh.vertices[e2[0]], b2 = mesh.vertices[e2[1]];
		return Math.hypot(a1[0] - b1[0], a1[1] - b1[1], a1[2] - b1[2]) - Math.hypot(a2[0] - b2[0], a2[1] - b2[1], a2[2] - b2[2]);
	});
	let current = mesh;
	for (let i = 0; i < Math.min(3, candidates.length); i++) {
		const pair = candidates[i];
		if (pair[0] >= current.vertices.length || pair[1] >= current.vertices.length) continue;
		const next = mergeVertices(current, [pair[0], pair[1]], 'center');
		if (next.vertices.length < current.vertices.length) current = next;
	}
	return current;
}
