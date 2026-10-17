import { openInspector } from './workbench-helpers.js';
import { test, expect } from '@playwright/test';

async function openRoads(page) {
  await page.locator('.tool-rail [data-tool="road"]').click();
}
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('crashpad:draft:v1')));
test('ramp templates support side and direction, persist and export without moving vehicles', async ({ page }, testInfo) => {
  await page.goto('/'); await openInspector(page); await openRoads(page);
  const originalCars = (await saved(page)).cars;
  for (const road of ['rampMerge', 'rampExit']) {
    if (!await page.locator(`[data-road="${road}"]`).isVisible()) await openRoads(page);
    await page.locator(`[data-road="${road}"]`).click();
    await page.locator('#road-lanes').selectOption('3');
    await page.locator('[data-road-side="left"]').click();
    await page.locator('#road-direction').selectOption('east');
    await expect(page.locator(`#scene [data-road-type="${road}"]`)).toHaveAttribute('transform', 'rotate(90 400 300)');
    await expect(page.locator('#scene-title')).toContainText('主路 3 车道 / 左侧');
  }
  expect((await saved(page)).cars).toEqual(originalCars);
  await page.reload(); await openInspector(page); await openRoads(page);
  await expect(page.locator('#road-lanes')).toHaveValue('3');
  await expect(page.locator('[data-road-side="left"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#road-direction')).toHaveValue('east');
  await page.screenshot({ path: testInfo.outputPath('ramp-exit.png'), fullPage: true });
  await page.locator('[data-action="preview"]').click();
  await expect(page.locator('#preview-image')).toContainText('匝道汇出 / 主路 3 车道 / 左侧 / 向右 →');
  await expect(page.locator('#preview-image [data-road-type="rampExit"]')).toBeVisible();
  const parsed = await page.locator('#preview-image').evaluate(el => new DOMParser().parseFromString(el.innerHTML, 'image/svg+xml').querySelector('parsererror') === null);
  expect(parsed).toBe(true);
});
test('lane counts change independently before and after the taper, with undo and narrow layout', async ({ page }, testInfo) => {
  await page.goto('/'); await openInspector(page); await openRoads(page);
  await page.locator('[data-road="laneDrop"]').click();
  await page.locator('#road-lanes').selectOption('5');
  await page.locator('#road-after-lanes').selectOption('2');
  await page.locator('[data-road-side="left"]').click();
  await expect(page.locator('#scene-title')).toContainText('5 → 2 车道 / 左侧');
  await page.locator('[data-action="undo"]').click();
  await expect(page.locator('[data-road-side="right"]')).toHaveAttribute('aria-pressed', 'true');
  if (!await page.locator('[data-road="laneAdd"]').isVisible()) await openRoads(page);
  await page.locator('[data-road="laneAdd"]').click();
  await page.locator('#road-lanes').selectOption('2');
  await page.locator('#road-after-lanes').selectOption('4');
  await expect(page.locator('#scene-title')).toContainText('2 → 4 车道');
  if (testInfo.project.name === 'mobile') {
    await page.setViewportSize({ width: 320, height: 850 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath('lane-increase.png'), fullPage: true });
  await page.reload(); await openInspector(page); await openRoads(page);
  await expect(page.locator('#road-after-lanes')).toHaveValue('4');
  expect((await saved(page)).lanes).toBe(2);
});
