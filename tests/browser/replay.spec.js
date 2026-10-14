import { test, expect } from '@playwright/test';

const draft = page => page.evaluate(() => localStorage.getItem('crashpad:draft:v1'));
const pose = (page, id) => page.locator(`#scene [data-car-id="${id}"]`).getAttribute('transform');
async function seek(page, value) {
  await page.locator('#replay-progress').evaluate((el, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); }, value);
}
test('replay moves vehicles, pauses, seeks, finishes and restores editing without changing the draft', async ({ page }, testInfo) => {
  await page.goto('/');
  const initial = await draft(page), endA = await pose(page, 'A');
  await page.locator('#replay-play').click();
  await expect(page.locator('#replay-play')).toHaveText('暂停');
  await expect.poll(() => pose(page, 'A')).not.toBe(endA);
  await page.locator('#replay-play').click();
  await expect(page.locator('#replay-play')).toHaveText('继续播放');
  const paused = await pose(page, 'A');
  await page.waitForTimeout(150);
  expect(await pose(page, 'A')).toBe(paused);
  expect(await draft(page)).toBe(initial);
  await seek(page, '500');
  await expect(page.locator('#replay-time')).toHaveText('2.0 / 4.0 s');
  await expect(page.locator('#controls')).toHaveJSProperty('inert', true);
  await expect(page.locator('#scene [data-car]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('replay.png'), fullPage: true });
  if (testInfo.project.name === 'mobile') {
    const viewport = page.viewportSize();
    await page.setViewportSize({ width: 320, height: 850 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const exit = await page.locator('#exit-replay').boundingBox();
    expect(exit.x + exit.width).toBeLessThanOrEqual(320);
    await page.setViewportSize(viewport);
  }
  await page.locator('#replay-speed').selectOption('2');
  await page.locator('#replay-play').click();
  await expect(page.locator('#replay-status')).toHaveText('回放结束，可直接编辑');
  expect(await pose(page, 'A')).toBe(endA);
  expect(await draft(page)).toBe(initial);
  await expect(page.locator('#replay-play')).toHaveText('重播');
  await expect(page.locator('#controls')).toHaveJSProperty('inert', false);
  await expect(page.locator('#scene [data-car="A"]')).toHaveCount(1);
  await expect(page.locator('#exit-replay')).toHaveCount(0);
  // A real edit is possible immediately after arrival, without a return-to-edit click.
  await page.locator('[data-rotate="45"]').click();
  expect(JSON.parse(await draft(page)).cars[0].angle).toBe(45);
  await page.locator('[data-action="undo"]').click();
  expect(await draft(page)).toBe(initial);
  await page.locator('#replay-play').click();
  await expect.poll(() => pose(page, 'A')).not.toBe(endA);
  await page.locator('#exit-replay').click();
  expect(await pose(page, 'A')).toBe(endA);
  await expect(page.locator('#controls')).toHaveJSProperty('inert', false);
  await expect(page.locator('#scene [data-car="A"]')).toHaveCount(1);
  expect(await draft(page)).toBe(initial);
});
test('stationary cars stay put, collision appears at the end, and export uses the final scene', async ({ page }) => {
  await page.goto('/');
  if (page.viewportSize().width <= 860) await page.locator('.tool-rail [data-tool=\"cars\"]').click();
  await page.locator('[data-select="B"]').click();
  await page.locator('[data-motion="stopped"]').click();
  await page.locator('.tool-rail [data-tool="collision"]').click();
  await page.locator('#scene').scrollIntoViewIfNeeded();
  const point = await page.locator('#scene').evaluate(el => {
    const p = new DOMPoint(400, 300).matrixTransform(el.getScreenCTM());
    return { x: p.x, y: p.y };
  });
  await page.mouse.click(point.x, point.y);
  const before = await draft(page), endB = await pose(page, 'B');
  await seek(page, '500');
  expect(await pose(page, 'B')).toBe(endB);
  await expect(page.locator('#scene [data-collision]')).toHaveCount(0);
  await seek(page, '1000');
  await expect(page.locator('#scene [data-collision]')).toHaveCount(1);
  await expect(page.locator('#controls')).toHaveJSProperty('inert', false);
  await expect(page.locator('#exit-replay')).toHaveCount(0);
  await page.locator('[data-action="rewind"]').click();
  await expect(page.locator('#replay-time')).toHaveText('0.0 / 4.0 s');
  await page.locator('.app-header [data-action="preview"]').click();
  await expect(page.locator('#preview')).toBeVisible();
  await expect(page.locator('#preview-image [data-car-id="A"]')).toHaveAttribute('transform', 'translate(340 360)');
  expect(await draft(page)).toBe(before);
  await page.locator('#back-edit').click();
  if (page.viewportSize().width <= 860) await page.locator('.tool-rail [data-tool=\"cars\"]').click();
  await page.locator('[data-select="A"]').click();
  await page.locator('[data-motion="stopped"]').click();
  await expect(page.locator('#replay-play')).toBeDisabled();
  await expect(page.locator('#replay-status')).toContainText('两辆车均静止');
});
