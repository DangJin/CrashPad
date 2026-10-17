import { openInspector } from './workbench-helpers.js';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const draft = page => page.evaluate(() => JSON.parse(localStorage.getItem('crashpad:draft:v1')));
async function scenePoint(page, x, y) {
  return page.locator('#scene').evaluate((el, p) => {
    const point = new DOMPoint(p.x, p.y).matrixTransform(el.getScreenCTM());
    return { x: point.x, y: point.y };
  }, { x, y });
}
async function dragAt(page, from, to) {
  await page.locator('#scene').scrollIntoViewIfNeeded();
  const a = await scenePoint(page, ...from), b = await scenePoint(page, ...to);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
}
test.beforeEach(async ({ page }) => { await page.goto('/'); await openInspector(page); });

test('road controls persist and undo/redo work', async ({ page }) => {
  if (page.viewportSize().width <= 860) await page.locator('.tool-rail [data-tool="road"]').click();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.getByRole('button', { name: '十字路口', exact: true }).click();
  await page.locator('[data-lanes="3"]').click();
  expect((await draft(page)).road).toBe('cross');
  await page.getByRole('button', { name: '撤销编辑', exact: true }).click();
  expect((await draft(page)).lanes).toBe(2);
  await page.getByRole('button', { name: '重做编辑', exact: true }).click();
  await page.reload(); await openInspector(page);
  await page.locator('.tool-rail [data-tool="road"]').click();
  await expect(page.locator('[data-lanes="3"]')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});
test('dragging vehicles, custom path, rotation and stopped state', async ({ page }) => {
  await dragAt(page, [340, 360], [390, 315]);
  expect((await draft(page)).cars[0].x).toBeCloseTo(390, 0);
  expect((await draft(page)).cars[0].y).toBeCloseTo(315, 0);
  await page.locator('[data-rotate="45"]').click();
  expect((await draft(page)).cars[0].angle).toBe(45);
  await page.getByRole('button', { name: '撤销编辑', exact: true }).click();
  await dragAt(page, [390, 485], [300, 480]);
  expect((await draft(page)).cars[0].motion).toBe('custom');
  await page.locator('[data-motion="stopped"]').click();
  expect((await draft(page)).cars[0].motion).toBe('stopped');
  await expect(page.locator('[data-route="A"]')).toHaveCount(0);
});
test('collision, damage and notes survive reload and export as a valid PNG', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: '标记碰撞点', exact: true }).click();
  await page.locator('#scene').scrollIntoViewIfNeeded();
  const p = await scenePoint(page, 400, 300); await page.mouse.click(p.x, p.y);
  expect((await draft(page)).collision.x).toBeCloseTo(400, 0);
  if (page.viewportSize().width <= 860) await page.locator('.tool-rail [data-tool=\"cars\"]').click();
  await page.locator('[data-select="A"]').click();
  await page.locator('[data-damage-part="left"]').click();
  await page.getByRole('button', { name: '事故说明', exact: true }).click();
  await page.locator('#note').fill('我直行，对方变道。<现场> & 双方接触。');
  await page.locator('#location').fill('测试路口');
  await page.reload(); await openInspector(page);
  await page.getByRole('button', { name: '事故说明', exact: true }).click();
  await expect(page.locator('#note')).toHaveValue('我直行，对方变道。<现场> & 双方接触。');
  expect((await draft(page)).cars[0].damage).toBe('left');
  await page.locator('.workbench-header [data-action="preview"]').click();
  await expect(page.locator('#preview')).toBeVisible();
  await expect(page.locator('#preview-image')).toContainText('<现场> &');
  const downloaded = page.waitForEvent('download'); await page.locator('#download').click();
  const download = await downloaded;
  const file = testInfo.outputPath('scene.png'); await download.saveAs(file);
  const bytes = await readFile(file);
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(bytes.readUInt32BE(16)).toBe(1760);
  expect(bytes.length).toBeGreaterThan(10000);
});
test('responsive layout has no horizontal overflow and keyboard movement works', async ({ page }, testInfo) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('[data-car="A"]').focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  expect((await draft(page)).cars[0].x).toBe(350);
  await page.screenshot({ path: testInfo.outputPath('editor.png'), fullPage: true });
});
test('broken drafts and unavailable storage remain usable', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('crashpad:draft:v1', '{broken'));
  await page.reload(); await openInspector(page); await expect(page.locator('#scene')).toBeVisible();
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('quota'); }; });
  await page.reload(); await openInspector(page);
  await expect(page.locator('.workbench-save')).toContainText('草稿未保存');
  if (page.viewportSize().width <= 860) await page.locator('.tool-rail [data-tool="road"]').click();
  await page.getByRole('button', { name: '停车区域', exact: true }).click();
  await page.locator('.workbench-header [data-action="preview"]').click();
  await expect(page.locator('#preview')).toBeVisible();
});
test('touch gesture moves the car and cancelling a new scene retains the draft', async ({ page, context, isMobile }) => {
  test.skip(!isMobile, 'Touch interaction is verified on the mobile project.');
  await page.locator('#scene').scrollIntoViewIfNeeded();
  const a = await scenePoint(page, 340, 360), b = await scenePoint(page, 400, 330);
  const session = await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x, y: b.y }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect((await draft(page)).cars[0].x).toBeCloseTo(400, 0);
  const before = await draft(page);
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('[data-action="new"]').click();
  expect(await draft(page)).toEqual(before);
});
