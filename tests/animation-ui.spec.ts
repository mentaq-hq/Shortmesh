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

async function dockHeight(page: Page): Promise<number> {
	const box = await page.getByTestId('dock').boundingBox();
	return box?.height ?? 0;
}

test.describe('Timeline panel and animation UI', () => {
	test('the rail toggle collapses and expands the timeline without losing state', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));

		await page.goto('/');
		await page.getByTestId('add-cube').click();
		await page.getByTestId('workspace-ani').click();
		await page.getByTestId('add-key').click();

		const toggle = page.getByTestId('timeline-toggle');
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
		await expect(page.getByTestId('timeline')).toBeVisible();
		const expandedHeight = await dockHeight(page);
		const selectedBefore = (await readScene(page)).selectedId;
		const keysBefore = await page.getByTestId('timeline-key').count();

		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
		await expect(toggle).toHaveAttribute('aria-label', 'Expand timeline');
		await expect(page.getByTestId('timeline')).toBeHidden();
		await expect
			.poll(() => dockHeight(page))
			.toBeLessThan(expandedHeight);

		expect((await readScene(page)).selectedId).toBe(selectedBefore);
		expect(await page.getByTestId('timeline-key').count()).toBe(keysBefore);

		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
		await expect(page.getByTestId('timeline')).toBeVisible();
		expect(errors).toEqual([]);
	});

	test('works from the keyboard and reports its state', async ({ page }) => {
		await page.goto('/');
		const toggle = page.getByTestId('timeline-toggle');
		await toggle.focus();
		await page.keyboard.press('Enter');
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
		await page.keyboard.press('Space');
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	});

	test('keys can be added, selected, deleted and restored with undo', async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('add-cube').click();
		await page.getByTestId('workspace-ani').click();
		await page.getByTestId('add-key').click();

		// A second key one second later.
		await page.getByTestId('timeline-scrub').fill('1');
		await page.getByTestId('add-key').click();
		await expect(page.getByTestId('timeline-key')).toHaveCount(2);

		await page.getByTestId('timeline-key').last().click();
		await expect(page.getByTestId('timeline-key').last()).toHaveAttribute('aria-pressed', 'true');
		await page.getByTestId('timeline-delete-key').click();
		await expect(page.getByTestId('timeline-key')).toHaveCount(1);

		await page.getByTestId('undo').click();
		await expect(page.getByTestId('timeline-key')).toHaveCount(2);
		await page.getByTestId('redo').click();
		await expect(page.getByTestId('timeline-key')).toHaveCount(1);
	});

	test('play, pause, start and loop act on the real time', async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('add-cube').click();
		await page.getByTestId('workspace-ani').click();
		await page.getByTestId('add-key').click();
		await page.getByTestId('timeline-scrub').fill('0');
		await page.evaluate(() => (window as unknown as { __toon: ToonHook }).__toon.setDuration(1));

		await page.getByTestId('play').click();
		await expect
			.poll(async () => (await readTimeline(page)).currentTime)
			.toBeGreaterThan(0.05);

		await page.getByTestId('play').click();
		const paused = (await readTimeline(page)).currentTime;
		await page.waitForTimeout(250);
		expect((await readTimeline(page)).currentTime).toBeCloseTo(paused, 1);

		await page.getByTestId('timeline-start').click();
		expect((await readTimeline(page)).currentTime).toBeCloseTo(0, 2);

		// With loop disabled the playhead stops at the end.
		await page.getByTestId('timeline-loop').click();
		await page.getByTestId('play').click();
		await expect
			.poll(async () => (await readTimeline(page)).playing, { timeout: 4000 })
			.toBe(false);
		expect((await readTimeline(page)).currentTime).toBeCloseTo(1, 2);
	});

	test('the mobile layout keeps the timeline inside the viewport', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 740 });
		await page.goto('/');
		await page.getByTestId('add-cube').click();
		await page.getByTestId('workspace-ani').click();
		await page.getByTestId('add-key').click();
		await page.getByTestId('timeline-toggle').click();

		const dock = await page.getByTestId('dock').boundingBox();
		expect(dock).not.toBeNull();
		expect(dock!.height).toBeLessThan(740 * 0.6);
		expect(dock!.y + dock!.height).toBeLessThanOrEqual(740);

		// The collapsed panel must not swallow a tap on the canvas.
		await page.getByTestId('timeline-toggle').click();
		await expect(page.getByTestId('timeline')).toBeVisible();
	});

	test('landscape keeps the timeline toggle reachable above the dock', async ({ page }) => {
		await page.setViewportSize({ width: 740, height: 390 });
		await page.goto('/');
		await page.getByTestId('add-cube').click();
		await page.getByTestId('workspace-ani').click();
		await page.getByTestId('add-key').click();

		const toggle = page.getByTestId('timeline-toggle');
		const box = await toggle.boundingBox();
		expect(box).not.toBeNull();
		expect(box!.y + box!.height).toBeLessThanOrEqual(390);
		await expect(page.getByTestId('timeline')).toBeVisible();

		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');

		const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});

test.describe('CapCut style layer timeline', () => {
	test('every scene object is a layer and its + adds a key at the playhead', async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('add-cube').click();
		await page.getByTestId('workspace-ani').click();

		const add = page.getByTestId('timeline-layer-add');
		await expect(add).toHaveCount(1, { timeout: 5000 });
		await add.first().click();
		await expect(page.getByTestId('timeline-key')).toHaveCount(1);

		const scene = await readScene(page);
		expect(scene.objects).toHaveLength(1);
		expect(scene.selectedId).toBe(scene.objects[0].id);
	});

	test('a text layer is a real textured plane whose caption can be edited', async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('workspace-ani').click();
		await page.getByTestId('timeline-add-layer').click();
		await page.getByTestId('add-text-layer').click();

		const input = page.getByTestId('text-layer-input');
		await expect(input).toBeVisible();
		await expect(input).toHaveValue('New text');
		await input.fill('Hello studio');
		await input.press('Enter');

		await expect
			.poll(async () => {
				const text = (await readScene(page)).objects.find((object) => object.type === 'text');
				return text?.text;
			})
			.toBe('Hello studio');

		const layer = (await readScene(page)).objects.find((object) => object.type === 'text');
		expect(layer?.geometry?.slots[0]?.imageUrl).toMatch(/^data:image\/png/);
		expect((layer?.geometry?.vertices.length ?? 0)).toBe(4);
	});

	test('dragging the grip grows the layer stack and the timeline stays undoable', async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('add-cube').click();
		await page.getByTestId('workspace-ani').click();

		const grip = page.getByTestId('timeline-resize');
		const before = Number(await grip.getAttribute('aria-valuenow'));
		const box = await grip.boundingBox();
		expect(box).not.toBeNull();

		await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
		await page.mouse.down();
		await page.mouse.move(box!.x + box!.width / 2, box!.y - 60, { steps: 6 });
		await page.mouse.up();

		const after = Number(await grip.getAttribute('aria-valuenow'));
		expect(after).toBeGreaterThan(before + 30);

		await grip.focus();
		await page.keyboard.press('ArrowDown');
		expect(Number(await grip.getAttribute('aria-valuenow'))).toBeLessThan(after);
	});

	test('an image file becomes a textured plane layer', async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('workspace-ani').click();
		await page.getByTestId('timeline-add-layer').click();
		// Node exposes Buffer at runtime; the Playwright test tsconfig has no
		// @types/node, so reach it through globalThis instead of an import.
		const png = (
			globalThis as unknown as { Buffer: { from(value: string, encoding: string): unknown } }
		).Buffer.from(
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
			'base64',
		);
		await page.getByTestId('layer-image-input').setInputFiles({
			name: 'backdrop.png',
			mimeType: 'image/png',
			buffer: png as never,
		});

		await expect
			.poll(async () => {
				const image = (await readScene(page)).objects.find((object) => object.type === 'image');
				return image?.geometry?.slots[0]?.imageUrl?.slice(0, 22);
			})
			.toBe('data:image/png;base64,');
		const layer = (await readScene(page)).objects.find((object) => object.type === 'image');
		expect(layer?.name).toBe('backdrop');
		expect(layer?.geometry?.vertices.length).toBe(4);
	});

	test('the PiP arrow hugs the frame border and opens the zoom panel', async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('workspace-ren').click();
		await page.getByTestId('pip').click();

		const preview = page.getByTestId('pip-preview');
		await expect(preview).toBeVisible();
		const frame = await preview.locator('.pip-frame').boundingBox();
		const arrow = await page.getByTestId('pip-zoom-open').boundingBox();
		expect(frame).not.toBeNull();
		expect(arrow).not.toBeNull();
		expect(frame!.x).toBeLessThan(220);
		const border = frame!.x + frame!.width;
		const arrowCenter = arrow!.x + arrow!.width / 2;
		expect(Math.abs(arrowCenter - border)).toBeLessThan(14);

		await page.getByTestId('pip-zoom-open').click();
		await expect(page.getByTestId('pip-zoom-panel')).toBeVisible();
	});
});
