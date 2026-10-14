import { test, expect } from '@playwright/test';

test('preset and custom vehicle paint can be saved, undone, exported and reset independently', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-paint="#d94343"]').click();
  await expect(page.locator('#scene [data-car-id="A"] [fill="#d94343"]')).not.toHaveCount(0);
  await page.locator('#participant-color').fill('#913ace'); await page.locator('#participant-color').press('Tab');
  await page.locator('[data-action="undo"]').click();
  await expect(page.locator('#participant-color')).toHaveValue('#d94343');
  await page.locator('[data-action="redo"]').click(); await page.reload();
  await expect(page.locator('#participant-color')).toHaveValue('#913ace');
  const cars = await page.evaluate(() => JSON.parse(localStorage.getItem('crashpad:draft:v1')).cars);
  expect(cars[0].color).toBe('#913ace'); expect(cars[1].color).toBeUndefined();
  await page.locator('[data-paint="#ffffff"]').click();
  await expect(page.locator('#scene [data-car-id="A"] text')).not.toHaveAttribute('fill', '#ffffff');
  await page.locator('.app-header [data-action="preview"]').click();
  await expect(page.locator('#preview-image [data-car-id="A"] [fill="#ffffff"]')).not.toHaveCount(0);
  await page.locator('#close-preview').click();
  await page.getByRole('button', { name: '恢复默认', exact: true }).click();
  await expect(page.locator('#participant-color')).toHaveValue('#245bdb');
});
