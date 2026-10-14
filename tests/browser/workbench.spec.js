import { test, expect } from '@playwright/test';
import { createScene } from '../../src/model.js';

test('opens directly on a canvas, selects properties and edits notes without losing focus', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#scene')).toBeVisible();
  await expect(page.locator('.intro, .steps')).toHaveCount(0);
  if (testInfo.project.name === 'desktop') {
    const canvas = await page.locator('.canvas-panel').boundingBox(), tools = await page.locator('.tools-panel').boundingBox(), props = await page.locator('.properties-panel').boundingBox();
    expect(tools.x + tools.width).toBeLessThanOrEqual(canvas.x + 1);
    expect(props.x).toBeGreaterThanOrEqual(canvas.x + canvas.width - 1);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  }
  await page.locator('#scene [data-car="B"]').click();
  await expect(page.locator('.inspector-heading h2')).toHaveText('对方车辆');
  await page.getByRole('button', { name: '事故说明', exact: true }).click();
  await page.locator('#note').pressSequentially('事故经过测试', { delay: 30 });
  await expect(page.locator('#note')).toBeFocused();
  await page.locator('#location').fill('测试路口');
  await page.getByRole('button', { name: '车辆属性', exact: true }).click();
  await page.locator('[data-plan="left"]').click();
  await expect(page.locator('#scene g[data-plan="B"]')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('workbench.png'), fullPage: true });
  expect(errors).toEqual([]);
});
test('restores a legacy draft including authored poses and planned turn handles', async ({ page }) => {
  const legacy = createScene(); legacy.road = 'cross'; legacy.lanes = 3; legacy.note = '旧版草稿';
  legacy.cars[1] = { ...legacy.cars[1], x: 470, y: 410, angle: 0, plan: { turn: 'left', target: { x: -180, y: -160 }, bend: { x: 0, y: -180 } } };
  await page.addInitScript(scene => localStorage.setItem('crashpad:draft:v1', JSON.stringify(scene)), legacy);
  await page.goto('/');
  await expect(page.locator('#scene-title')).toHaveText('十字路口 / 3 车道');
  await expect(page.locator('#scene [data-car-id="B"]')).toHaveAttribute('transform', 'translate(470 410)');
  await expect(page.locator('#scene g[data-plan="B"]')).toContainText('计划左转');
  await page.getByRole('button', { name: '事故说明', exact: true }).click();
  await expect(page.locator('#note')).toHaveValue('旧版草稿');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('crashpad:draft:v1')))).toEqual(legacy);
});
