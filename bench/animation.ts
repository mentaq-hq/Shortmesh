// Animation evaluation benchmark.
//
// Measures the real TypeScript evaluator used by the viewport, with a
// documented scene: N animated objects, ten transform channels and 20 keys
// per channel, sampled over 600 frames (10 s at 60 fps).
//
// Run with: npm run bench:anim
import { get } from 'svelte/store';
import { timelineStore } from '../src/stores/timeline.ts';
import { sceneStore } from '../src/stores/scene.ts';

const FRAMES = 600;
const KEYS = 20;
const OBJECTS = [50, 200];

function pad(value: number, width = 6): string {
	return value.toFixed(2).padStart(width);
}

/** Median of five runs, so a GC pause in one sample does not become the result. */
function time(label: string, fn: () => void): number {
	fn(); // warm-up
	const samples: number[] = [];
	for (let run = 0; run < 5; run++) {
		const start = performance.now();
		fn();
		samples.push((performance.now() - start) / FRAMES);
	}
	samples.sort((a, b) => a - b);
	const median = samples[2];
	console.log(
		`${label}: ${pad(median)} ms/frame median ` +
			`(min ${pad(samples[0])}, max ${pad(samples[4])})`,
	);
	return median;
}

timelineStore.clearKeyframes();
timelineStore.setDuration(10);

for (const count of OBJECTS) {
	timelineStore.clearKeyframes();
	sceneStore.load([], null);
	for (let i = 0; i < count; i++) {
		const id = `bench-${i}`;
		sceneStore.addPrimitive('cube');
		const object = get(sceneStore).objects[get(sceneStore).objects.length - 1];
		// The benchmark identifies objects by the ids the evaluator sees.
		object.id = id;
		for (let k = 0; k < KEYS; k++) {
			const time = (k / (KEYS - 1)) * 10;
			timelineStore.addKeyframe(id, {
				time,
				position: [Math.sin(k), 1 + k * 0.01, Math.cos(k)],
				rotation: [0, k * 0.1, 0],
				scale: [1, 1, 1],
			});
		}
	}

	console.log(`\n${count} animated objects, ${count * 10} channels, ${KEYS} keys each`);
	console.log(`tracks per frame: ${count * 10}`);

	const evaluateMs = time('evaluate() only', () => {
		for (let f = 0; f < FRAMES; f++) {
			const time = (f / FRAMES) * 10;
			timelineStore.evaluate(time, true);
		}
	});

	time('evaluate() + applyAnimation()', () => {
		for (let f = 0; f < FRAMES; f++) {
			const time = (f / FRAMES) * 10;
			const transforms = timelineStore.evaluate(time, true);
			sceneStore.applyAnimation(transforms);
		}
	});

	console.log(
		`budget: ${pad((evaluateMs / 16.67) * 100)}% of a 60 fps frame spent evaluating animation`,
	);
}
