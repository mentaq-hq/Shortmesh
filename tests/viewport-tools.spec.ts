import { test, expect, type Page } from '@playwright/test';

async function canvasPoint(page: Page, fx = 0.5, fy = 0.5) {
	const box = await page.getByTestId('viewport').boundingBox();
	if (!box) throw new Error('Viewport has no bounding box');
	return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

test.describe('Viewport tools', () => {
	test('the tool rail offers move, rotate, scale and pan', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByTestId('tool-move')).toBeVisible();
		await expect(page.getByTestId('tool-rotate')).toBeVisible();
		await expect(page.getByTestId('tool-scale')).toBeVisible();
		await expect(page.getByTestId('tool-pan')).toBeVisible();
		await expect(page.getByTestId('tool-select')).toBeVisible();
	});

	test('the hint follows the active tool', async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('add-cube').click();

		await expect(page.getByTestId('viewport-hints')).toContainText('orbit');
		await page.getByTestId('tool-move').click();
		await expect(page.getByTestId('viewport-hints')).toContainText('arrows');
		await page.getByTestId('tool-rotate').click();
		await expect(page.getByTestId('viewport-hints')).toContainText('rings');
		await page.getByTestId('tool-scale').click();
		await expect(page.getByTestId('viewport-hints')).toContainText('handles');
		await page.getByTestId('tool-pan').click();
		await expect(page.getByTestId('viewport-hints')).toContainText('pan');
	});

	test('the top bar holds the workspaces and the file actions', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByTestId('workspace-ani')).toBeVisible();
		await expect(page.getByTestId('workspace-edt')).toBeVisible();
		await expect(page.getByTestId('undo')).toBeVisible();
		await expect(page.getByTestId('save')).toBeVisible();
		await expect(page.getByTestId('outliner-toggle')).toBeVisible();
	});

	test('the pan tool moves the view without touching the object', async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('add-cube').click();
		await page.getByTestId('tool-pan').click();

		const before = (await page.evaluate(() =>
			(window as unknown as { __toon: { scene: () => { objects: { position: number[] }[] } } }).__toon.scene(),
		)).objects[0].position;

		const point = await canvasPoint(page);
		await page.mouse.move(point.x, point.y);
		await page.mouse.down();
		await page.mouse.move(point.x + 120, point.y + 40, { steps: 6 });
		await page.mouse.up();

		const after = (await page.evaluate(() =>
			(window as unknown as { __toon: { scene: () => { objects: { position: number[] }[] } } }).__toon.scene(),
		)).objects[0].position;
		expect(after).toEqual(before);
	});
});
