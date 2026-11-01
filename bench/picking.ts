import { buildMeshBVH, raycastBVH } from '../src/lib/bvh.ts';
import { rayTriangle } from '../src/lib/picking.ts';
import { sphereMesh, type Mesh } from '../src/lib/mesh.ts';
import type { Vec3 } from '../src/lib/math3d.ts';

interface Stats {
	name: string;
	triangles: number;
	buildMs: number;
	bruteMedian: number;
	bruteP95: number;
	bvhMedian: number;
	bvhP95: number;
	speedup: number;
}

function percentile(values: number[], p: number): number {
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
	return sorted[index];
}

function bruteForce(mesh: Mesh, origin: Vec3, dir: Vec3): number | null {
	let best: number | null = null;
	for (const face of mesh.faces) {
		for (let i = 1; i < face.length - 1; i++) {
			const t = rayTriangle(origin, dir, mesh.vertices[face[0]], mesh.vertices[face[i]], mesh.vertices[face[i + 1]]);
			if (t === null) continue;
			if (best === null || t < best) best = t;
		}
	}
	return best;
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

const QUERIES = 300;

function run(name: string, mesh: Mesh): Stats {
	// Warm the JIT with one throwaway build so the reported figure is steady state.
	buildMeshBVH(mesh);
	const bvhStarted = performance.now();
	const bvh = buildMeshBVH(mesh);
	const buildMs = performance.now() - bvhStarted;
	const sample = rays(QUERIES);

	const bruteTimes: number[] = [];
	for (const ray of sample) {
		const started = performance.now();
		bruteForce(mesh, ray.origin, ray.dir);
		bruteTimes.push(performance.now() - started);
	}

	const bvhTimes: number[] = [];
	for (const ray of sample) {
		const started = performance.now();
		raycastBVH(bvh, ray);
		bvhTimes.push(performance.now() - started);
	}

	const bruteMedian = percentile(bruteTimes, 50);
	const bvhMedian = percentile(bvhTimes, 50);
	return {
		name,
		triangles: bvh.triangleCount,
		buildMs,
		bruteMedian,
		bruteP95: percentile(bruteTimes, 95),
		bvhMedian,
		bvhP95: percentile(bvhTimes, 95),
		speedup: bruteMedian / bvhMedian,
	};
}

const results = [
	run('small', sphereMesh(24, 16)),
	run('medium', sphereMesh(80, 50)),
	run('large', sphereMesh(160, 100)),
];

console.log('## Picking: full scan vs BVH\n');
console.log('| mesh | triangles | build ms | scan median | scan p95 | bvh median | bvh p95 | speedup |');
console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of results) {
	console.log(
		`| ${r.name} | ${r.triangles} | ${r.buildMs.toFixed(2)} | ${r.bruteMedian.toFixed(3)} ms | ${r.bruteP95.toFixed(3)} ms | ${r.bvhMedian.toFixed(4)} ms | ${r.bvhP95.toFixed(4)} ms | ${r.speedup.toFixed(1)}x |`,
	);
}
console.log(`\nqueries per mesh: ${QUERIES}, node ${process.version}, ${process.arch}`);
