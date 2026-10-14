import { test, expect } from '@playwright/test';
import { createScene } from '../../src/model.js';

test('signed angle axis preserves heading and both equivalent half-turn endpoints', async ({ page }) => {
  const scene = createScene(); scene.cars[0].angle = 359;
  await page.addInitScript(scene => localStorage.setItem('crashpad:draft:v1', JSON.stringify(scene)), scene);
  await page.goto('/');
  const slider = page.locator('#angle');
  await expect(slider).toHaveAttribute('min', '-180'); await expect(slider).toHaveAttribute('max', '180');
  await expect(slider).toHaveValue('-1'); await expect(page.locator('.angle-row')).toContainText('-1°');
  await slider.focus(); await slider.press('ArrowLeft');
  await expect(slider).toHaveValue('-2');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('crashpad:draft:v1')).cars[0].angle)).toBe(358);
  await slider.press('Home'); await expect(slider).toHaveValue('-180');
  await slider.press('End'); await expect(slider).toHaveValue('180');
  await page.locator('[data-rotate="45"]').click(); await expect(slider).toHaveValue('-135');
  await page.locator('[data-action="undo"]').click(); await expect(slider).toHaveValue('180');
  await slider.focus(); await slider.press('Home'); await slider.press('ArrowRight');
  await expect(slider).toHaveValue('-179');
  await page.locator('[data-rotate="-45"]').click(); await expect(slider).toHaveValue('136');
});
