import { test, expect } from '@playwright/test';
import { createScene } from '../../src/model.js';

const saved = page => page.evaluate(() => localStorage.getItem('crashpad:draft:v1'));
async function seek(page, value) {
  await page.locator('#replay-progress').evaluate((el, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); }, value);
}
test('actual merge and future lane change are independent and previews do not rewrite the scene', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.locator('[data-motion="mergeLeft"]').click();
  await expect(page.locator('#route-description')).toContainText('向左汇入');
  await page.locator('[data-plan="changeRight"]').click();
  const original = await saved(page), originalPose = await page.locator('#scene [data-car-id="A"]').getAttribute('transform');
  await expect(page.locator('#scene [data-plan="A"]')).toContainText('计划向右变道');
  await page.locator('[data-action="preview-plan"]').click();
  await expect(page.locator('#replay-mode')).toHaveValue('planned');
  await expect(page.locator('#controls')).toHaveJSProperty('inert', true);
  await seek(page, '700');
  const pose = await page.locator('#scene [data-car-id="A"]').getAttribute('transform');
  expect(pose).not.toBe(originalPose);
  const angle = await page.locator('#scene [data-car-id="A"] > g').getAttribute('transform');
  expect(angle).not.toContain('NaN');
  expect(await saved(page)).toBe(original);
  await page.screenshot({ path: testInfo.outputPath('future-change.png'), fullPage: true });
  await page.locator('#replay-speed').selectOption('2');
  await page.locator('#replay-play').click();
  await expect(page.locator('#replay-status')).toHaveText('动作预览结束，已返回编辑');
  await expect(page.locator('#controls')).toHaveJSProperty('inert', false);
  await expect(page.locator('#scene [data-car-id="A"]')).toHaveAttribute('transform', originalPose);
  expect(await saved(page)).toBe(original);
  await page.locator('.app-header [data-action="preview"]').click();
  await expect(page.locator('#preview-image')).toContainText('向左汇入');
  await expect(page.locator('#preview-image')).toContainText('计划向右变道（未发生）');
  await page.locator('#back-edit').click();
  await page.locator('#replay-mode').selectOption('actual');
  await seek(page, '500');
  expect(await page.locator('#scene [data-car-id="A"]').getAttribute('transform')).not.toBe(originalPose);
  await page.locator('#exit-replay').click();
  await page.reload();
  expect(await saved(page)).toBe(original);
});
test('ramp merge plan aligns to the main road and can run even when the actual car is stopped', async ({ page }) => {
  const scene = createScene(); scene.road = 'rampMerge';
  scene.cars[1] = { ...scene.cars[1], x: 650, y: 470, angle: 315, motion: 'stopped' };
  scene.cars[0].motion = 'stopped';
  await page.addInitScript(scene => localStorage.setItem('crashpad:draft:v1', JSON.stringify(scene)), scene);
  await page.goto('/');
  await page.locator('#scene [data-car="B"]').click();
  await page.locator('[data-plan="mergeLeft"]').click();
  await expect(page.locator('#merge-final-angle')).toHaveValue('0');
  await expect(page.locator('#replay-play')).toBeDisabled();
  await page.locator('[data-action="preview-plan"]').click();
  await expect(page.locator('#replay-play')).toHaveText('暂停');
  await seek(page, '900');
  await expect(page.locator('#scene [data-plan="B"]')).toContainText('计划向左汇入');
  await page.locator('#exit-replay').click();
  await expect(page.locator('#controls')).toHaveJSProperty('inert', false);
  await expect(page.locator('#scene [data-car-id="B"]')).toHaveAttribute('transform', 'translate(650 470)');
});

test('dragging a straight endpoint into the right lane creates an S lane change', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-plan="straight"]').click();
  await expect(page.locator('[data-plan-bend="A"]')).toHaveCount(0);
  await page.locator('#scene').scrollIntoViewIfNeeded();
  const points = await page.locator('#scene').evaluate(el => {
    const m = el.getScreenCTM();
    const start = new DOMPoint(340, 90).matrixTransform(m), end = new DOMPoint(435, 90).matrixTransform(m);
    return { start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } };
  });
  await page.mouse.move(points.start.x, points.start.y); await page.mouse.down();
  await page.mouse.move(points.end.x, points.end.y, { steps: 10 }); await page.mouse.up();
  await expect(page.locator('#scene [data-plan="A"]')).toContainText('计划向右变道');
  await expect(page.locator('[data-plan="changeRight"]')).toHaveAttribute('aria-pressed', 'true');
  const car = JSON.parse(await saved(page)).cars[0];
  expect(car.plan.turn).toBe('changeRight');
  expect(car.angle).toBe(0);
  await page.locator('[data-action="preview-plan"]').click();
  await seek(page, '990');
  const rotation = await page.locator('#scene [data-car-id="A"] > g').getAttribute('transform');
  expect(Math.abs(Number(rotation.match(/rotate\((.*)\)/)[1]))).toBeLessThan(2);
});
