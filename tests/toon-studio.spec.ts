import { test, expect, type Page } from '@playwright/test';

async function addCube(page: Page) {
	await page.getByTestId('add-cube').click();
}

async function showOutliner(page: Page) {
	await page.getByTestId('outliner-toggle').click();
}

test.describe('Toon Studio shell', () => {
	test('loads the viewport and dock without runtime errors', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));

		await page.goto('/');
		await expect(page.getByTestId('viewport')).toBeVisible();
		await expect(page.getByTestId('dock')).toBeVisible();
		await expect(page.getByTestId('add-cube')).toBeVisible();
		await expect(page.getByTestId('workspace-mod')).toBeVisible();
		expect(errors).toEqual([]);
	});

	test('adds primitives and supports undo/redo', async ({ page }) => {
		await page.goto('/');
		await addCube(page);
		await page.getByTestId('add-sphere').click();
		await showOutliner(page);

		await expect(page.getByTestId('object-row')).toHaveCount(2);
		await expect(page.getByTestId('object-name').first()).toHaveText('Cube');

		await page.getByTestId('undo').click();
		await expect(page.getByTestId('object-row')).toHaveCount(1);

		await page.getByTestId('redo').click();
		await expect(page.getByTestId('object-row')).toHaveCount(2);
	});

	test('keyboard shortcuts drive undo, duplicate and delete', async ({ page }) => {
		await page.goto('/');
		await addCube(page);
		await showOutliner(page);

		await page.keyboard.press('Control+d');
		await expect(page.getByTestId('object-row')).toHaveCount(2);

		await page.keyboard.press('Delete');
		await expect(page.getByTestId('object-row')).toHaveCount(1);

		await page.keyboard.press('Control+z');
		await expect(page.getByTestId('object-row')).toHaveCount(2);

		await page.keyboard.press('Control+Shift+z');
		await expect(page.getByTestId('object-row')).toHaveCount(1);
	});

	test('agent command bar creates and colors objects', async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('workspace-age').click();
		await page.getByTestId('agent-prompt').fill('add 3 red spheres');
		await page.getByTestId('agent-send').click();

		await expect(page.getByRole('alert')).toContainText('Added 3 spheres');
		await showOutliner(page);
		await expect(page.getByTestId('object-row')).toHaveCount(3);
	});

	test('timeline adds keys and plays scrub-able animation', async ({ page }) => {
		await page.goto('/');
		await addCube(page);
		await page.getByTestId('workspace-ani').click();
		await page.getByTestId('add-key').click();

		await expect(page.getByTestId('timeline')).toBeVisible();
		const timeLabel = page.locator('#tt');
		const before = await timeLabel.textContent();
		await page.getByTestId('play').click();
		await expect.poll(async () => timeLabel.textContent()).not.toBe(before);

		await page.getByTestId('timeline-scrub').fill('2.5');
		await expect(timeLabel).toContainText('2.50');
	});

	test('save dialog supports browser save, reopen and download', async ({ page }) => {
		await page.goto('/');
		await addCube(page);

		await page.getByTestId('save').click();
		await expect(page.getByTestId('dialog')).toBeVisible();
		await page.getByTestId('project-name').fill('Smoke Test');
		await page.getByTestId('save-browser').click();
		await expect(page.getByTestId('dialog')).toBeHidden();

		await page.getByTestId('open').click();
		await expect(page.getByText('Smoke Test', { exact: false })).toBeVisible();
		await page.getByTestId('dialog-close').click();

		await page.getByTestId('save').click();
		const downloadPromise = page.waitForEvent('download');
		await page.getByTestId('save-download').click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toMatch(/\.tsf\.json$/);
	});

	test('new project clears the scene', async ({ page }) => {
		await page.goto('/');
		await addCube(page);
		await showOutliner(page);
		await expect(page.getByTestId('object-row')).toHaveCount(1);

		await page.keyboard.press('Control+n');
		await page.getByTestId('confirm-new').click();
		await expect(page.getByTestId('object-row')).toHaveCount(0);
	});

	test('game mode shows controls and score', async ({ page }) => {
		await page.goto('/');
		await addCube(page);
		await page.getByTestId('workspace-gam').click();
		await page.getByTestId('game-mode').click();

		await expect(page.getByTestId('gamepad')).toBeVisible();
		await expect(page.getByTestId('jump')).toBeVisible();
		await expect(page.getByText('★')).toBeVisible();

		await page.keyboard.down('ArrowRight');
		await page.waitForTimeout(250);
		await page.keyboard.up('ArrowRight');
		await page.getByTestId('game-mode').click();
		await expect(page.getByTestId('gamepad')).toBeHidden();
	});

	test('camera PiP preview renders from a camera object', async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('workspace-ren').click();
		await page.getByTestId('pip').click();
		await expect(page.getByTestId('pip-preview')).toBeVisible();
		await expect(page.getByTestId('pip-preview').locator('canvas')).toBeVisible();
	});

	test('autosave restores the last session after reload', async ({ page }) => {
		await page.goto('/');
		await addCube(page);
		await page.waitForTimeout(1100);
		await page.reload();
		await showOutliner(page);
		await expect(page.getByTestId('object-row')).toHaveCount(1);
		await expect(page.getByTestId('object-name').first()).toHaveText('Cube');
	});
});

test.describe('Toon Studio mobile layout', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('keeps dock actions reachable on a phone viewport', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByTestId('dock')).toBeInViewport();
		await page.getByTestId('add-cube').click();
		await expect(page.getByTestId('viewport')).toBeVisible();
		await expect(page.getByTestId('workspace-mod')).toBeInViewport();
	});
});
