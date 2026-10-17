import { openInspector } from './workbench-helpers.js';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createScene } from '../../src/model.js';

test('social ratios preview and download exact PNG and JPG dimensions', async ({ page }, testInfo) => {
  await page.goto('/'); await openInspector(page);
  const before = await page.evaluate(() => localStorage.getItem('crashpad:draft:v1'));
  await page.locator('.workbench-header [data-action="preview"]').click();
  for (const [preset, width, height] of [['xiaohongshu', 1080, 1440], ['douyin', 1080, 1920], ['square', 1080, 1080], ['widescreen', 1920, 1080]]) {
    await page.locator('#export-ratio').locator('[data-value="' + preset + '"]').click();
    await expect(page.locator('#export-dimensions')).toHaveText(`${width} × ${height} px`);
    await expect(page.locator('#preview-image > svg')).toHaveAttribute('viewBox', `0 0 ${width} ${height}`);
    if (['xiaohongshu', 'douyin'].includes(preset)) {
      await expect(page.locator('#preview-image > svg')).toHaveAttribute('data-export-layout', preset);
      await expect(page.locator('#preview-image')).not.toContainText('现场说明');
      await page.screenshot({ path: testInfo.outputPath(`${preset}-layout.png`) });
    }
    const event = page.waitForEvent('download'); await page.locator('#download').click();
    const download = await event, file = testInfo.outputPath(`${preset}.png`); await download.saveAs(file);
    const bytes = await readFile(file);
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(bytes.readUInt32BE(16)).toBe(width); expect(bytes.readUInt32BE(20)).toBe(height);
  }
  await page.locator('#export-ratio').locator('[data-value="' + 'douyin' + '"]').click();
  await page.locator('#export-format').locator('[data-value="' + 'jpg' + '"]').click();
  await page.locator('#export-quality').locator('[data-value="' + '2' + '"]').click();
  await expect(page.locator('#export-dimensions')).toHaveText('2160 × 3840 px');
  const event = page.waitForEvent('download'); await page.locator('#download').click();
  const download = await event, file = testInfo.outputPath('douyin.jpg'); await download.saveAs(file);
  expect(download.suggestedFilename()).toMatch(/2160x3840.*\.jpg$/);
  const bytes = await readFile(file); expect([...bytes.subarray(0, 3)]).toEqual([255, 216, 255]);
  const size = await page.evaluate(data => new Promise((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve([image.naturalWidth, image.naturalHeight]); image.onerror = reject; image.src = `data:image/jpeg;base64,${data}`;
  }), bytes.toString('base64'));
  expect(size).toEqual([2160, 3840]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('export-portrait.png') });
  await page.locator('#back-edit').click();
  expect(await page.evaluate(() => localStorage.getItem('crashpad:draft:v1'))).toBe(before);
});

test('portrait typography keeps long descriptions and vehicle plans inside the page', async ({ page }) => {
  const scene = createScene();
  scene.note = '直行时对方车辆从右侧匝道汇入，我准备向右变道，双方发生接触。'.repeat(20).slice(0, 500);
  scene.location = '测试地点：南北方向主路与右侧匝道汇入路口';
  scene.cars[0].plan = { turn: 'changeRight', target: null, bend: null };
  scene.cars[1].plan = { turn: 'mergeLeft', target: null, bend: null };
  scene.cars[1].damage = 'left';
  await page.addInitScript(scene => localStorage.setItem('crashpad:draft:v1', JSON.stringify(scene)), scene);
  await page.goto('/'); await openInspector(page);
  await page.locator('.workbench-header [data-action="preview"]').click();
  for (const preset of ['xiaohongshu', 'douyin']) {
    await page.locator('#export-ratio').locator('[data-value="' + preset + '"]').click();
    const overflow = await page.locator('#preview-image > svg').evaluate(svg => {
      const bounds = svg.getBoundingClientRect();
      return [...svg.querySelectorAll('[data-export-text]')].filter(node => {
        const box = node.getBoundingClientRect();
        return box.left < bounds.left - 1 || box.right > bounds.right + 1 || box.top < bounds.top - 1 || box.bottom > bounds.bottom + 1;
      }).map(node => node.textContent);
    });
    expect(overflow).toEqual([]);
    expect(await page.locator('#preview-image').textContent()).toContain(scene.note);
    await expect(page.locator('#preview-image')).toContainText('后续：计划向右变道');
  }
});
