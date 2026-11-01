import type { Vec3 } from './math3d';
import type { Mesh } from './mesh';

/**
 * The compiled Rust engine, loaded from `static/engine.wasm`.
 *
 * The module is a plain C ABI over linear memory: every call takes numbers and
 * pointers, so no generated bindings are needed and the binary stays small.
 * All arrays are copied into wasm memory explicitly; nothing keeps a view into
 * that memory across a call, because growth would detach it.
 */

interface EngineExports {
	memory: WebAssembly.Memory;
	toon_abi_version(): number;
	toon_alloc(size: number): number;
	toon_free(pointer: number, size: number): void;
	toon_mesh_new(vertices: number, vertexCount: number, triangles: number, triangleCount: number): number;
	toon_mesh_free(handle: number): number;
	toon_mesh_triangles(handle: number): number;
	toon_mesh_refit(handle: number, vertices: number): number;
	toon_mesh_raycast(
		handle: number,
		ox: number,
		oy: number,
		oz: number,
		dx: number,
		dy: number,
		dz: number,
		maxT: number,
	): number;
	toon_mesh_last_face(handle: number): number;
	toon_mesh_vertices_in_sphere(
		handle: number,
		cx: number,
		cy: number,
		cz: number,
		radius: number,
		out: number,
		capacity: number,
	): number;
}

export interface EngineHit {
	t: number;
	face: number;
}

export const ENGINE_ABI_VERSION = 1;

export class WasmEngine {
	readonly abi: number;
	private readonly exports: EngineExports;
	private disposed = false;

	private constructor(exports: EngineExports) {
		this.exports = exports;
		this.abi = exports.toon_abi_version();
	}

	static fromBytes(bytes: ArrayBuffer | ArrayBufferView): WasmEngine | null {
		try {
			const module = new WebAssembly.Module(bytes as unknown as Uint8Array<ArrayBuffer>);
			const instance = new WebAssembly.Instance(module, {});
			const engine = new WasmEngine(instance.exports as unknown as EngineExports);
			if (engine.abi !== ENGINE_ABI_VERSION) {
				engine.dispose();
				return null;
			}
			return engine;
		} catch {
			return null;
		}
	}

	/** Loads the module, returning null when it is missing or incompatible. */
	static async load(url = '/engine.wasm'): Promise<WasmEngine | null> {
		try {
			const response = await fetch(url);
			if (!response.ok) return null;
			return WasmEngine.fromBytes(await response.arrayBuffer());
		} catch {
			return null;
		}
	}

	/** Copies a float array into wasm memory and returns its pointer. */
	private upload(values: Float32Array | Uint32Array): number {
		if (!values.byteLength) return 0;
		const pointer = this.exports.toon_alloc(values.byteLength);
		if (!pointer) throw new Error('wasm out of memory');
		// The buffer is re-read here: toon_alloc can grow the memory.
		if (values instanceof Float32Array) {
			new Float32Array(this.exports.memory.buffer, pointer, values.length).set(values);
		} else {
			new Uint32Array(this.exports.memory.buffer, pointer, values.length).set(values);
		}
		return pointer;
	}

	createMesh(vertices: Float32Array, triangles: Uint32Array): number {
		if (this.disposed || !vertices.length || !triangles.length) return 0;
		let vertexPointer = 0;
		let trianglePointer = 0;
		try {
			vertexPointer = this.upload(vertices);
			trianglePointer = this.upload(triangles);
			return this.exports.toon_mesh_new(vertexPointer, vertices.length / 3, trianglePointer, triangles.length / 3);
		} finally {
			if (vertexPointer) this.exports.toon_free(vertexPointer, vertices.byteLength);
			if (trianglePointer) this.exports.toon_free(trianglePointer, triangles.byteLength);
		}
	}

	refit(handle: number, vertices: Float32Array): boolean {
		if (this.disposed || !handle || !vertices.length) return false;
		const pointer = this.upload(vertices);
		try {
			return this.exports.toon_mesh_refit(handle, pointer) > 0;
		} finally {
			if (pointer) this.exports.toon_free(pointer, vertices.byteLength);
		}
	}

	raycast(handle: number, origin: Vec3, dir: Vec3, maxT = Infinity): EngineHit | null {
		if (this.disposed || !handle) return null;
		const t = this.exports.toon_mesh_raycast(
			handle,
			origin[0],
			origin[1],
			origin[2],
			dir[0],
			dir[1],
			dir[2],
			Number.isFinite(maxT) ? maxT : -1,
		);
		if (!(t >= 0)) return null;
		return { t, face: this.exports.toon_mesh_last_face(handle) };
	}

	verticesInSphere(handle: number, center: Vec3, radius: number): number[] {
		if (this.disposed || !handle) return [];
		const capacity = 4096;
		const pointer = this.exports.toon_alloc(capacity * 4);
		if (!pointer) return [];
		try {
			const count = this.exports.toon_mesh_vertices_in_sphere(
				handle,
				center[0],
				center[1],
				center[2],
				radius,
				pointer,
				capacity,
			);
			const used = Math.min(count, capacity);
			return Array.from(new Uint32Array(this.exports.memory.buffer, pointer, used));
		} finally {
			this.exports.toon_free(pointer, capacity * 4);
		}
	}

	free(handle: number): void {
		if (this.disposed || !handle) return;
		this.exports.toon_mesh_free(handle);
	}

	dispose(): void {
		this.disposed = true;
	}
}

/** Flattens a polygon mesh into the triangle soup the engine indexes. */
export function triangleSoup(mesh: Mesh): { vertices: Float32Array; triangles: Uint32Array } {
	let count = 0;
	for (const face of mesh.faces) count += Math.max(0, face.length - 2);
	const vertices = new Float32Array(mesh.vertices.length * 3);
	for (let i = 0; i < mesh.vertices.length; i++) {
		vertices[i * 3] = mesh.vertices[i][0];
		vertices[i * 3 + 1] = mesh.vertices[i][1];
		vertices[i * 3 + 2] = mesh.vertices[i][2];
	}
	const triangles = new Uint32Array(count * 3);
	let at = 0;
	for (const face of mesh.faces) {
		for (let i = 1; i < face.length - 1; i++) {
			triangles[at++] = face[0];
			triangles[at++] = face[i];
			triangles[at++] = face[i + 1];
		}
	}
	return { vertices, triangles };
}
