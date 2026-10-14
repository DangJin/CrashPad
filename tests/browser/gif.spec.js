import { test, expect } from '@playwright/test';
import { createScene, addParticipant } from '../../src/model.js';
import { readFile } from 'node:fs/promises';

test('GIF export contains a looping complete animation at the selected portrait ratio', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  let scene = createScene();
  for (const type of ['pedestrian', 'ebike', 'bicycle']) scene = addParticipant(scene, type);
  await page.addInitScript(scene => localStorage.setItem('crashpad:draft:v1', JSON.stringify(scene)), scene);
  await page.goto('/');
  await page.locator('[data-plan="changeRight"]').click();
  const before = await page.evaluate(() => localStorage.getItem('crashpad:draft:v1'));
  await page.locator('.app-header [data-action="preview"]').click();
  await page.locator('#export-format').locator('[data-value="' + 'gif' + '"]').click();
  await page.locator('#export-ratio').locator('[data-value="' + 'douyin' + '"]').click();
  await expect(page.locator('#export-dimensions')).toHaveText('540 × 960 px');
  await expect(page.locator('#gif-mode [data-value="full"]')).toHaveAttribute('aria-pressed', 'true');
  const event = page.waitForEvent('download', { timeout: 60000 });
  await page.locator('#download').click();
  await expect(page.locator('#export-format [data-value="png"]')).toBeDisabled();
  const download = await event;
  expect(download.suggestedFilename()).toMatch(/540x960\.gif$/);
  const file = testInfo.outputPath('complete.gif'); await download.saveAs(file);
  const bytes = await readFile(file);
  expect(bytes.subarray(0, 6).toString()).toBe('GIF89a');
  expect(bytes.readUInt16LE(6)).toBe(540); expect(bytes.readUInt16LE(8)).toBe(960);
  expect(bytes.includes(Buffer.from('NETSCAPE2.0'))).toBe(true);
  await expect(page.locator('#download')).toBeEnabled();
  await page.locator('#export-format').locator('[data-value="' + 'png' + '"]').click();
  await expect(page.locator('#export-dimensions')).toHaveText('1080 × 1920 px');
  await page.locator('#back-edit').click();
  expect(await page.evaluate(() => localStorage.getItem('crashpad:draft:v1'))).toBe(before);
});

test('GIF encoding can be cancelled without generating a download or changing the draft', async ({ page }) => {
  await page.goto('/');
  const downloads = []; page.on('download', download => downloads.push(download));
  const before = await page.evaluate(() => localStorage.getItem('crashpad:draft:v1'));
  await page.locator('.app-header [data-action="preview"]').click();
  await page.locator('#export-format').locator('[data-value="' + 'gif' + '"]').click();
  await page.locator('#download').click();
  await page.locator('#back-edit').click();
  await expect(page.locator('#preview')).not.toBeVisible();
  await page.waitForTimeout(200);
  expect(downloads).toHaveLength(0);
  expect(await page.evaluate(() => localStorage.getItem('crashpad:draft:v1'))).toBe(before);
});
