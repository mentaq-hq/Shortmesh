import { test, expect, type Page } from '@playwright/test';
import type { SceneState } from '../src/stores/scene';

interface ToonHook {
	scene: () => SceneState;
}

function readScene(page: Page): Promise<SceneState> {
	return page.evaluate(() => (window as unknown as { __toon: ToonHook }).__toon.scene());
}

async function canvasPoint(page: Page, fx = 0.5, fy = 0.5) {
	const box = await page.getByTestId('viewport').boundingBox();
	if (!box) throw new Error('Viewport has no bounding box');
	return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

test.describe('Toon Studio editing', () => {
	test('renders with WebGL2 and no shader errors', async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('add-cube').click();
		await page.getByTestId('add-sphere').click();
		await page.waitForTimeout(500);

		await expect(page.getByTestId('gl-error')).toHaveCount(0);
		const stats = await page.evaluate(() => {
			const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
			if (!canvas) return null;
			const gl = canvas.getContext('webgl2');
			return { webgl2: Boolean(gl), width: canvas.width, height: canvas.height };
		});
		expect(stats?.webgl2).toBe(true);
		expect(stats?.width).toBeGreaterThan(0);
	});

	test('edit workspace exposes element modes and subdivides geometry', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));

		await page.goto('/');
		await page.getByTestId('add-cube').click();
		await page.getByTestId('workspace-edt').click();
		await expect(page.getByTestId('element-mode')).toBeVisible();

		await page.getByTestId('chip-2').click();
		const before = (await readScene(page)).objects[0];
		const beforeFaces = before.geometry ? before.geometry.faces.length : 0;

		await page.getByTestId('op-subdivide').click();
		const after = (await readScene(page)).objects[0];
		expect(after.geometry).toBeTruthy();
		expect(after.geometry!.faces.length).toBeGreaterThan(beforeFaces);
		expect(after.geometryVersion).toBeGreaterThan(before.geometryVersion);

		await page.getByTestId('undo').click();
		const undone = (await readScene(page)).objects[0];
		expect(undone.geometryVersion).toBe(before.geometryVersion);
		expect(errors).toEqual([]);
	});

	test('extrude adds faces to a selected face', async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('add-cube').click();
		await page.getByTestId('workspace-edt').click();
		await page.getByTestId('chip-1').click();
		await page.getByTestId('mode-face').click();

		const point = await canvasPoint(page);
		await page.mouse.click(point.x, point.y);
		const selected = (await readScene(page)).selectedFaces.length;
		expect(selected).toBeGreaterThan(0);

		const before = (await readScene(page)).objects[0].geometry?.faces.length ?? 0;
		await page.getByTestId('op-extrude').click();
		const after = (await readScene(page)).objects[0].geometry?.faces.length ?? 0;
		expect(after).toBeGreaterThan(before);
	});

	test('sculpt brush edits the mesh vertices', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));

		await page.goto('/');
		await page.getByTestId('add-sphere').click();
		await page.getByTestId('workspace-scl').click();
		await expect(page.getByTestId('brush-draw')).toBeVisible();
		await page.getByTestId('brush-radius').fill('2');

		const point = await canvasPoint(page);
		await page.mouse.move(point.x, point.y);
		await page.mouse.down();
		await page.mouse.move(point.x + 26, point.y + 14, { steps: 6 });
		await page.mouse.up();

		const object = (await readScene(page)).objects[0];
		expect(object.geometry).toBeTruthy();
		expect(object.geometryVersion).toBeGreaterThan(1);
		expect(errors).toEqual([]);
	});

	test('vertex paint writes per-vertex colours', async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('add-cube').click();
		await page.getByTestId('workspace-uvp').click();
		await expect(page.getByTestId('paint-fill')).toBeVisible();

		await page.getByTestId('paint-fill').click();
		const object = (await readScene(page)).objects[0];
		expect(object.geometry).toBeTruthy();
		expect(object.geometry!.colors).toBeTruthy();
		expect(object.geometry!.colors!.length).toBe(object.geometry!.vertices.length * 3);
	});

	test('physics bodies fall and reset', async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('add-cube').click();
		await page.getByTestId('workspace-phy').click();
		await page.getByTestId('dynamic').click();
		await page.getByTestId('physics-run').click();

		await page.waitForTimeout(600);
		const moved = (await readScene(page)).objects[0];
		expect(Math.abs(moved.position[1] - 0.5)).toBeGreaterThan(0.01);
		expect(moved.physics.home).toEqual([0, 0.5, 0]);

		await page.getByTestId('physics-reset').click();
		const reset = (await readScene(page)).objects[0];
		expect(reset.position).toEqual([0, 0.5, 0]);
		expect(reset.physics.velocity).toEqual([0, 0, 0]);
	});

	test('gizmo drag translates the selection and undo restores it', async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('add-cube').click();
		const start = (await readScene(page)).objects[0];

		const point = await canvasPoint(page);
		await page.mouse.move(point.x, point.y);
		await page.mouse.down();
		await page.mouse.move(point.x + 90, point.y - 30, { steps: 8 });
		await page.mouse.up();

		const moved = (await readScene(page)).objects[0];
		expect(moved.position).not.toEqual(start.position);

		await page.getByTestId('undo').click();
		const restored = (await readScene(page)).objects[0];
		expect(restored.position).toEqual(start.position);
	});

	test('shading and material controls update the selected object', async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('add-cube').click();
		await page.getByTestId('workspace-shd').click();

		await page.getByTestId('mat-opacity').fill('0.4');
		await page.getByTestId('mat-emissive').evaluate((element: HTMLInputElement) => {
			element.value = '#33ff88';
			element.dispatchEvent(new Event('input', { bubbles: true }));
		});

		const object = (await readScene(page)).objects[0];
		expect(object.material.opacity).toBeCloseTo(0.4, 2);
		expect(object.material.emissive).toBe('#33ff88');
	});
});
