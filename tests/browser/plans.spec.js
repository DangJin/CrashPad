import { openInspector } from './workbench-helpers.js';
import { test, expect } from '@playwright/test';

const car = page => page.evaluate(() => JSON.parse(localStorage.getItem('crashpad:draft:v1')).cars[1]);
async function dragHandle(page, locator, dx, dy) {
  await page.locator('#scene').scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 5 }); await page.mouse.up();
}
test('north-facing B can indicate an upcoming left turn without rotating or moving the car', async ({ page }, testInfo) => {
  await page.goto('/'); await openInspector(page);
  if (page.viewportSize().width <= 860) await page.locator('.tool-rail [data-tool="road"]').click();
  await page.locator('[data-road="cross"]').click();
  await page.locator('#scene [data-car="A"]').click();
  await page.locator('[data-arrival="90"]').click();
  if (page.viewportSize().width <= 860) await page.locator('.tool-rail [data-tool=\"cars\"]').click();
  await page.locator('[data-select="B"]').click();
  await page.locator('#scene').scrollIntoViewIfNeeded();
  const points = await page.locator('#scene').evaluate(el => {
    const m = el.getScreenCTM(), a = new DOMPoint(460, 250).matrixTransform(m), b = new DOMPoint(460, 400).matrixTransform(m);
    return { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } };
  });
  await page.mouse.move(points.a.x, points.a.y); await page.mouse.down();
  await page.mouse.move(points.b.x, points.b.y, { steps: 5 }); await page.mouse.up();
  const before = await car(page);
  await page.locator('[data-plan="left"]').filter({ hasText: '左转' }).click();
  const after = await car(page);
  expect([after.x, after.y, after.angle, after.motion]).toEqual([before.x, before.y, 0, before.motion]);
  await expect(page.locator('#scene g[data-plan="B"]')).toContainText('计划左转');
  await dragHandle(page, page.locator('[data-plan-target="B"]'), -15, 8);
  expect((await car(page)).plan.target).not.toBeNull();
  await dragHandle(page, page.locator('[data-plan-bend="B"]'), 8, -8);
  expect((await car(page)).plan.bend).not.toBeNull();
  expect((await car(page)).angle).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('planned-left.png'), fullPage: true });
  const saved = await car(page);
  await page.reload(); await openInspector(page);
  expect((await car(page)).plan).toEqual(saved.plan);
  await page.locator('.workbench-header [data-action="preview"]').click();
  await expect(page.locator('#preview-image')).toContainText('计划左转（未发生）');
  await expect(page.locator('#preview-image g[data-plan="B"]')).toBeVisible();
  await expect(page.locator('#preview-image [data-car-id="B"] > g')).toHaveAttribute('transform', 'rotate(0)');
  await page.locator('#back-edit').click();
  if (page.viewportSize().width <= 860) await page.locator('.tool-rail [data-tool=\"cars\"]').click();
  await page.locator('[data-select="B"]').click();
  await page.locator('[data-plan="none"]').click();
  await expect(page.locator('#scene g[data-plan="B"]')).toHaveCount(0);
  await page.locator('[data-action="undo"]').click();
  await expect(page.locator('#scene g[data-plan="B"]')).toHaveCount(1);
});
