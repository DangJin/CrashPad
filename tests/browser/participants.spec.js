import { openInspector } from './workbench-helpers.js';
import { test, expect } from '@playwright/test';
import { createScene, addParticipant } from '../../src/model.js';

async function openParticipants(page) {
  if (!await page.locator('[data-add-participant="pedestrian"]').isVisible()) await page.locator('.tool-rail [data-tool="cars"]').click();
}
test('add, name, convert and remove different participants with saved routes and undo', async ({ page }, testInfo) => {
  await page.goto('/'); await openInspector(page);
  for (const [index, type] of ['pedestrian', 'ebike', 'bicycle'].entries()) {
    await openParticipants(page);
    await page.locator(`[data-add-participant="${type}"]`).click();
    const id = String.fromCharCode(67 + index);
    await expect(page.locator(`#scene [data-car-id="${id}"]`)).toHaveAttribute('data-participant-type', type);
    await expect(page.locator(`#controls [data-participant-type="${type}"]`)).toHaveAttribute('aria-pressed', 'true');
  }
  await page.locator('#participant-name').fill('骑行人小陈'); await page.locator('#participant-name').press('Tab');
  await page.locator('[data-plan="right"]').click();
  await page.locator('#scene [data-car-id="E"]').scrollIntoViewIfNeeded();
  const points = await page.locator('#scene').evaluate(svg => {
    const m = svg.getScreenCTM(), a = new DOMPoint(300, 410).matrixTransform(m), b = new DOMPoint(360, 430).matrixTransform(m);
    return { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } };
  });
  await page.mouse.move(points.a.x, points.a.y); await page.mouse.down(); await page.mouse.move(points.b.x, points.b.y, { steps: 5 }); await page.mouse.up();
  await page.reload(); await openInspector(page);
  await expect(page.locator('#scene [data-participant-type="pedestrian"]')).toHaveCount(1);
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('crashpad:draft:v1')).cars.find(c => c.id === 'E'));
  expect(restored.x).toBeCloseTo(360, 2); expect(restored.y).toBeCloseTo(430, 2);
  await page.locator('#scene [data-car-id="E"]').click();
  await expect(page.locator('#participant-name')).toHaveValue('骑行人小陈');
  await expect(page.locator('[data-plan="right"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-action="delete-participant"]').click();
  await expect(page.locator('#scene [data-car-id="E"]')).toHaveCount(0);
  await page.locator('[data-action="undo"]').click(); await expect(page.locator('#scene [data-car-id="E"]')).toHaveCount(1);
  await page.locator('#scene [data-car-id="C"]').click();
  await expect(page.locator('#angle')).toHaveAttribute('aria-label', '朝向角度');
  await expect(page.locator('[data-damage-part]')).toHaveCount(0);
  await expect(page.locator('[data-plan="changeRight"]')).toHaveCount(0);
  await page.locator('#controls [data-participant-type="ebike"]').click();
  await expect(page.locator('#scene [data-car-id="C"]')).toHaveAttribute('data-participant-type', 'ebike');
  await expect(page.locator('[data-damage-part="front"]')).toBeVisible();
  await page.locator('#controls [data-participant-type="pedestrian"]').click();
  await page.locator('#scene').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('participants.png'), fullPage: true });
});

test('mixed actors animate and remain visible with separate labels in portrait exports', async ({ page }) => {
  let scene = createScene();
  for (const type of ['pedestrian', 'ebike', 'bicycle']) scene = addParticipant(scene, type);
  scene.cars[2].name = '一二三四五六七八九十一二三四五六七八九十';
  await page.addInitScript(scene => localStorage.setItem('crashpad:draft:v1', JSON.stringify(scene)), scene);
  await page.goto('/'); await openInspector(page);
  await page.getByRole('group', { name: '预览内容', exact: true }).getByRole('button', { name: '完整演示', exact: true }).click();
  await page.locator('#replay-progress').evaluate(el => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '250'); el.dispatchEvent(new Event('input', { bubbles: true })); });
  expect(await page.locator('#scene [data-car-id="C"]').getAttribute('transform')).not.toBe(`translate(${scene.cars[2].x} ${scene.cars[2].y})`);
  await page.locator('.workbench-header [data-action="preview"]').click();
  for (const preset of ['original', 'xiaohongshu', 'douyin']) {
    await page.locator('#export-ratio').locator('[data-value="' + preset + '"]').click();
    await expect(page.locator('#preview-image [data-car-id]')).toHaveCount(5);
    const text = await page.locator('#preview-image').textContent();
    for (const name of ['行人', '电动车', '自行车']) expect(text).toContain(name);
    const outside = await page.locator('#preview-image > svg').evaluate(svg => {
      const frame = svg.getBoundingClientRect();
      return [...svg.querySelectorAll('[data-export-text]')].filter(el => { const r = el.getBoundingClientRect(); return r.left < frame.left - 1 || r.right > frame.right + 1 || r.bottom > frame.bottom + 1; }).map(el => el.textContent);
    });
    expect(outside).toEqual([]);
  }
});
