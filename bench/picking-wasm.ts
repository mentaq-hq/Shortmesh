import { readFileSync } from 'node:fs';
import { buildMeshBVH, raycastBVH } from '../src/lib/bvh.ts';
import { triangleSoup, WasmEngine } from '../src/lib/wasm.ts';
import { sphereMesh, type Mesh } from '../src/lib/mesh.ts';
import type { Vec3 } from '../src/lib/math3d.ts';

interface Row {
	name: string;
	triangles: number;
	uploadMs: number;
	tsMedian: number;
	tsP95: number;
	wasmMedian: number;
	wasmP95: number;
	speedup: number;
	agree: boolean;
}

function percentile(values: number[], p: number): number {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))];
}

function rays(count: number): { origin: Vec3; dir: Vec3 }[] {
	const out: { origin: Vec3; dir: Vec3 }[] = [];
	for (let i = 0; i < count; i++) {
		const angle = (i / count) * Math.PI * 2;
		const height = Math.sin(i * 1.7) * 1.4;
		const origin: Vec3 = [Math.cos(angle) * 4, height, Math.sin(angle) * 4];
		const length = Math.hypot(origin[0], origin[1], origin[2]);
		out.push({ origin, dir: [-origin[0] / length, -origin[1] / length, -origin[2] / length] });
	}
	return out;
}

const engine = WasmEngine.fromBytes(readFileSync(new URL('../static/engine.wasm', import.meta.url)));
if (!engine) throw new Error('the wasm engine did not load');

const QUERIES = 300;

function measure(name: string, mesh: Mesh): Row {
	buildMeshBVH(mesh); // warm up
	const bvh = buildMeshBVH(mesh);
	const soup = triangleSoup(mesh);

	const uploadStarted = performance.now();
	const handle = engine!.createMesh(soup.vertices, soup.triangles);
	const uploadMs = performance.now() - uploadStarted;
	if (!handle) throw new Error('upload failed');

	const sample = rays(QUERIES);
	let agree = true;

	const tsTimes: number[] = [];
	for (const ray of sample) {
		const started = performance.now();
		raycastBVH(bvh, ray);
		tsTimes.push(performance.now() - started);
	}

	const wasmTimes: number[] = [];
	for (const ray of sample) {
		const started = performance.now();
		engine!.raycast(handle, ray.origin, ray.dir);
		wasmTimes.push(performance.now() - started);
	}

	// Both paths must return the same distance for every ray.
	for (const ray of sample) {
		const a = raycastBVH(bvh, ray);
		const b = engine!.raycast(handle, ray.origin, ray.dir);
		if ((a === null) !== (b === null)) {
			agree = false;
			break;
		}
		if (a && b && Math.abs(a.t - b.t) > 1e-4) {
			agree = false;
			break;
		}
	}

	engine!.free(handle);
	const tsMedian = percentile(tsTimes, 50);
	const wasmMedian = percentile(wasmTimes, 50);
	return {
		name,
		triangles: soup.triangles.length / 3,
		uploadMs,
		tsMedian,
		tsP95: percentile(tsTimes, 95),
		wasmMedian,
		wasmP95: percentile(wasmTimes, 95),
		speedup: tsMedian / wasmMedian,
		agree,
	};
}

const rows = [measure('small', sphereMesh(24, 16)), measure('medium', sphereMesh(80, 50)), measure('large', sphereMesh(160, 100))];

console.log('## Picking: TypeScript hierarchy vs Rust/WASM\n');
console.log('| mesh | triangles | upload ms | TS median | TS p95 | wasm median | wasm p95 | faster | same hits |');
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const row of rows) {
	console.log(
		`| ${row.name} | ${row.triangles} | ${row.uploadMs.toFixed(2)} | ${row.tsMedian.toFixed(4)} ms | ${row.tsP95.toFixed(4)} ms | ${row.wasmMedian.toFixed(4)} ms | ${row.wasmP95.toFixed(4)} ms | ${row.speedup.toFixed(1)}x | ${row.agree ? 'yes' : 'NO'} |`,
	);
}
console.log(`\nqueries per mesh: ${QUERIES}, node ${process.version}, ${process.arch}, abi ${engine.abi}`);
