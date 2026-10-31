import { test, expect, type Page } from '@playwright/test';
import type { SceneState } from '../src/stores/scene';
import type { TimelineState } from '../src/stores/timeline';

interface ToonHook {
	scene: () => SceneState;
	timeline: () => TimelineState;
	curves: () => Record<string, Record<string, unknown[]>>;
	strips: () => unknown[];
	setDuration: (value: number) => void;
}

function readScene(page: Page): Promise<SceneState> {
	return page.evaluate(() => (window as unknown as { __toon: ToonHook }).__toon.scene());
}

function readTimeline(page: Page): Promise<TimelineState> {
	return page.evaluate(() => (window as unknown as { __toon: ToonHook }).__toon.timeline());
}

async function canvasPoint(page: Page, fx = 0.5, fy = 0.5) {
	const box = await page.getByTestId('viewport').boundingBox();
	if (!box) throw new Error('Viewport has no bounding box');
	return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

async function enterEditWorkspace(page: Page) {
	await page.getByTestId('workspace-edt').click();
	await page.getByTestId('chip-1').click();
}

test.describe('Blender core port', () => {
	test('the material library applies a readymade preset', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));

		await page.goto('/');
		await page.getByTestId('add-cube').click();
		await page.getByTestId('workspace-shd').click();
		await page.getByTestId('chip-1').click();
		await expect(page.getByTestId('material-library')).toBeVisible();

		await page.getByTestId('preset-gold-24k').click();

		const object = (await readScene(page)).objects[0];
		expect(object.color).toBe('#f5c542');
		expect(object.geometry).toBeTruthy();
		expect(object.geometry!.slots.length).toBeGreaterThan(0);
		expect(object.geometry!.slots[0].presetId).toBe('gold-24k');
		expect(object.geometry!.groups.length).toBeGreaterThan(0);
		expect(errors).toEqual([]);
	});

	test('the auto detect tool marks a coplanar portion', async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('add-cube').click();
		await enterEditWorkspace(page);
		await page.getByTestId('tool-detect').click();

		const point = await canvasPoint(page);
		await page.mouse.click(point.x, point.y);

		const scene = await readScene(page);
		expect(scene.markedFaces.length).toBeGreaterThan(0);
		expect(scene.markedObjectId).toBeTruthy();
	});

	test('a material only touches the marked portion', async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('add-cube').click();
		await enterEditWorkspace(page);
		await page.getByTestId('tool-detect').click();

		const point = await canvasPoint(page);
		await page.mouse.click(point.x, point.y);

		const marked = await readScene(page);
		expect(marked.markedFaces.length).toBeGreaterThan(0);
		const markedFace = marked.markedFaces[0];

		await page.getByTestId('workspace-shd').click();
		await page.getByTestId('chip-1').click();
		await page.getByTestId('preset-clear-glass').click();

		const object = (await readScene(page)).objects[0];
		expect(object.geometry).toBeTruthy();
		expect(object.geometry!.slots.length).toBe(2);
		expect(object.geometry!.faceSlot[markedFace]).toBe(1);
		expect(object.geometry!.slots[1].presetId).toBe('clear-glass');
	});

	test('the scissors tool cuts an object into two parts', async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('add-cube').click();
		await enterEditWorkspace(page);
		await page.getByTestId('tool-cut').click();

		const from = await canvasPoint(page, 0.3, 0.5);
		const to = await canvasPoint(page, 0.7, 0.5);
		await page.mouse.move(from.x, from.y);
		await page.mouse.down();
		await page.mouse.move(to.x, to.y, { steps: 8 });
		await page.mouse.up();

		const scene = await readScene(page);
		expect(scene.objects.length).toBe(2);
		expect(scene.objects[0].name).toContain('Part_A');
		expect(scene.objects[1].name).toContain('Part_B');
		expect(scene.objects[0].geometry!.faces.length).toBeGreaterThan(0);
		expect(scene.objects[1].geometry!.faces.length).toBeGreaterThan(0);
	});

	test('the timeline creates an action strip and splits it at the playhead', async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('add-cube').click();
		await page.getByTestId('workspace-ani').click();
		await page.getByTestId('add-key').click();
		await page.getByTestId('nla-add-strip').click();

		let timeline = await readTimeline(page);
		expect(timeline.strips.length).toBe(1);
		expect(timeline.strips[0].objectId).toBeTruthy();

		await page.getByTestId('timeline-scrub').fill('1');
		timeline = await readTimeline(page);
		expect(timeline.currentTime).toBeCloseTo(1, 2);

		await page.getByTestId('nla-split').click();
		timeline = await readTimeline(page);
		expect(timeline.strips.length).toBe(2);
	});

	test('the action strip speed and reverse change the action', async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('add-cube').click();
		await page.getByTestId('workspace-ani').click();
		await page.getByTestId('add-key').click();
		await page.getByTestId('nla-add-strip').click();

		await page.getByTestId('nla-faster').click();
		let timeline = await readTimeline(page);
		expect(timeline.strips[0].speed).toBeCloseTo(1.5, 2);

		await page.getByTestId('nla-reverse').click();
		timeline = await readTimeline(page);
		expect(timeline.strips[0].reversed).toBe(true);

		await page.getByTestId('nla-freeze').click();
		timeline = await readTimeline(page);
		expect(timeline.strips[0].frozen).toBe(true);

		await page.getByTestId('nla-duplicate').click();
		timeline = await readTimeline(page);
		expect(timeline.strips.length).toBe(2);
	});

	test('the timeline reaches one hour and the keys are stored as curves', async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('add-cube').click();
		await page.getByTestId('workspace-ani').click();
		await page.getByTestId('add-key').click();

		const curves = await page.evaluate(() => (window as unknown as { __toon: ToonHook }).__toon.curves());
		const objectId = Object.keys(curves)[0];
		expect(objectId).toBeTruthy();
		expect(curves[objectId]['location.x'].length).toBe(1);
		expect(curves[objectId]['rotation_quaternion.w'].length).toBe(1);

		const duration = await page.evaluate(() => {
			const hook = (window as unknown as { __toon: ToonHook }).__toon;
			hook.setDuration(3600);
			return hook.timeline().duration;
		});
		expect(duration).toBe(3600);
	});
});
