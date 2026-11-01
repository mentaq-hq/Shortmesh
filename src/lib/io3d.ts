import type { Vec3 } from './math3d';
import { transformPoint } from './math3d';
import { finalizeMesh, meshFor, type Face, type Mesh } from './mesh';
import type { SceneObject } from '../stores/scene';

/**
 * Universal 3D Mesh Import & Export (.OBJ and ASCII .STL) for the browser build.
 */

export function exportSceneToOBJ(objects: SceneObject[]): string {
	const lines: string[] = [
		'# Toon Studio 3D Export (.obj)',
		`# Objects: ${objects.length}`,
		'',
	];
	let vertexOffset = 1;
	let uvOffset = 1;

	for (const obj of objects) {
		if (!obj.visible || obj.type === 'light' || obj.type === 'camera') continue;
		const mesh = obj.geometry ?? meshFor(obj.type);
		if (!mesh) continue;

		const safeName = obj.name.replace(/\s+/g, '_') || obj.id;
		lines.push(`o ${safeName}`);
		for (const v of mesh.vertices) {
			const w = transformPoint(v, obj.position, obj.rotation, obj.scale);
			lines.push(`v ${w[0].toFixed(5)} ${w[1].toFixed(5)} ${w[2].toFixed(5)}`);
		}
		const flipWinding = obj.scale[0] * obj.scale[1] * obj.scale[2] < 0;
		if (mesh.uvs && mesh.uvs.length === mesh.vertices.length) {
			for (const uv of mesh.uvs) {
				lines.push(`vt ${uv[0].toFixed(5)} ${uv[1].toFixed(5)}`);
			}
			for (const face of mesh.faces) {
				const ordered = flipWinding ? [...face].reverse() : face;
				const indices = ordered.map((idx) => `${idx + vertexOffset}/${idx + uvOffset}`).join(' ');
				lines.push(`f ${indices}`);
			}
			uvOffset += mesh.uvs.length;
		} else {
			for (const face of mesh.faces) {
				const ordered = flipWinding ? [...face].reverse() : face;
				const indices = ordered.map((idx) => String(idx + vertexOffset)).join(' ');
				lines.push(`f ${indices}`);
			}
		}
		lines.push('');
		vertexOffset += mesh.vertices.length;
	}
	return lines.join('\n');
}

export function exportSceneToSTL(objects: SceneObject[]): string {
	const lines: string[] = ['solid toon_studio'];
	for (const obj of objects) {
		if (!obj.visible || obj.type === 'light' || obj.type === 'camera') continue;
		const mesh = obj.geometry ?? meshFor(obj.type);
		if (!mesh) continue;
		const worldVerts = mesh.vertices.map((v) => transformPoint(v, obj.position, obj.rotation, obj.scale));
		const flipWinding = obj.scale[0] * obj.scale[1] * obj.scale[2] < 0;
		for (const face of mesh.faces) {
			for (let i = 1; i < face.length - 1; i++) {
				const a = worldVerts[face[0]];
				const b = worldVerts[flipWinding ? face[i + 1] : face[i]];
				const c = worldVerts[flipWinding ? face[i] : face[i + 1]];
				const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
				const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
				let nx = uy * vz - uz * vy;
				let ny = uz * vx - ux * vz;
				let nz = ux * vy - uy * vx;
				const len = Math.hypot(nx, ny, nz) || 1;
				nx /= len; ny /= len; nz /= len;
				lines.push(`  facet normal ${nx.toFixed(5)} ${ny.toFixed(5)} ${nz.toFixed(5)}`);
				lines.push('    outer loop');
				lines.push(`      vertex ${a[0].toFixed(5)} ${a[1].toFixed(5)} ${a[2].toFixed(5)}`);
				lines.push(`      vertex ${b[0].toFixed(5)} ${b[1].toFixed(5)} ${b[2].toFixed(5)}`);
				lines.push(`      vertex ${c[0].toFixed(5)} ${c[1].toFixed(5)} ${c[2].toFixed(5)}`);
				lines.push('    endloop');
				lines.push('  endfacet');
			}
		}
	}
	lines.push('endsolid toon_studio');
	return lines.join('\n');
}

export function parseOBJ(text: string): Mesh | null {
	const vertices: Vec3[] = [];
	const rawUVs: [number, number][] = [];
	const vertexUVMap = new Map<number, [number, number]>();
	const faces: Face[] = [];

	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) continue;
		const parts = line.split(/\s+/);
		const head = parts[0];
		if (head === 'v' && parts.length >= 4) {
			const x = Number(parts[1]);
			const y = Number(parts[2]);
			const z = Number(parts[3]);
			if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
				vertices.push([x, y, z]);
			}
		} else if (head === 'vt' && parts.length >= 3) {
			const u = Number(parts[1]);
			const v = Number(parts[2]);
			if (Number.isFinite(u) && Number.isFinite(v)) rawUVs.push([u, v]);
		} else if (head === 'f' && parts.length >= 4) {
			const face: number[] = [];
			for (let i = 1; i < parts.length; i++) {
				const subTokens = parts[i].split('/');
				let idx = parseInt(subTokens[0], 10);
				if (!Number.isFinite(idx)) continue;
				if (idx < 0) idx = vertices.length + idx;
				else idx = idx - 1;
				if (idx >= 0 && idx < vertices.length) {
					face.push(idx);
					if (subTokens[1]) {
						let vtIdx = parseInt(subTokens[1], 10);
						if (Number.isFinite(vtIdx)) {
							if (vtIdx < 0) vtIdx = rawUVs.length + vtIdx;
							else vtIdx = vtIdx - 1;
							if (vtIdx >= 0 && vtIdx < rawUVs.length && !vertexUVMap.has(idx)) {
								vertexUVMap.set(idx, rawUVs[vtIdx]);
							}
						}
					}
				}
			}
			if (face.length >= 3) faces.push(face);
		}
	}
	if (vertices.length < 3 || faces.length < 1) return null;
	const mesh = finalizeMesh({ vertices, faces }, false);
	if (rawUVs.length === vertices.length) {
		mesh.uvs = rawUVs;
	} else if (vertexUVMap.size > 0) {
		mesh.uvs = vertices.map((_, i) => vertexUVMap.get(i) ?? [0, 0]);
	}
	return mesh;
}

export function parseSTL(text: string): Mesh | null {
	const vertices: Vec3[] = [];
	const faces: Face[] = [];
	const weld = new Map<string, number>();

	const addVert = (x: number, y: number, z: number): number => {
		const key = `${x.toFixed(4)}:${y.toFixed(4)}:${z.toFixed(4)}`;
		const existing = weld.get(key);
		if (existing !== undefined) return existing;
		const idx = vertices.length;
		vertices.push([x, y, z]);
		weld.set(key, idx);
		return idx;
	};

	let currentTri: number[] = [];
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (line.startsWith('vertex ')) {
			const parts = line.split(/\s+/);
			if (parts.length >= 4) {
				const x = Number(parts[1]);
				const y = Number(parts[2]);
				const z = Number(parts[3]);
				if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
					currentTri.push(addVert(x, y, z));
				}
			}
			if (currentTri.length === 3) {
				if (currentTri[0] !== currentTri[1] && currentTri[1] !== currentTri[2] && currentTri[2] !== currentTri[0]) {
					faces.push(currentTri);
				}
				currentTri = [];
			}
		}
	}
	if (vertices.length < 3 || faces.length < 1) return null;
	return finalizeMesh({ vertices, faces }, false);
}
