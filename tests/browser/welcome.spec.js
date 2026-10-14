import { test, expect } from '@playwright/test';
import { createScene } from '../../src/model.js';

test.use({ storageState: { cookies: [], origins: [] } });

test('first visit explains the product, examples preserve the draft, dismissal persists and help reopens', async ({ page }, testInfo) => {
  const scene = createScene(); scene.title = '我的现场'; scene.cars[0].x = 312;
  await page.addInitScript(scene => { if (!localStorage.getItem('crashpad:draft:v1')) localStorage.setItem('crashpad:draft:v1', JSON.stringify(scene)); }, scene);
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: /碰到个傻 X，\s*必须给大家看看。/ });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: '画出来，给大家看看', exact: true })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('welcome-intro.png') });
  await page.getByRole('button', { name: '先看个例子', exact: true }).click();
  await expect(dialog.locator('figure')).toHaveCount(2);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('crashpad:draft:v1')).cars[0].x)).toBe(312);
  const fits = await dialog.evaluate(el => el.scrollWidth <= el.clientWidth);
  expect(fits).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('welcome.png'), fullPage: true });
  await page.getByRole('button', { name: '画出来，给大家看看', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('#document-title')).toHaveValue('我的现场');
  await page.reload(); await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: '使用说明', exact: true }).click();
  await expect(dialog).toBeVisible(); await expect(dialog.locator('figure')).toHaveCount(0);
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
});

test('close button dismisses welcome and the underlying canvas remains editable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '关闭使用说明' }).click();
  await page.locator('#document-title').fill('可以编辑');
  await page.reload();
  await expect(page.locator('.welcome-dialog')).not.toBeVisible();
  await expect(page.locator('#document-title')).toHaveValue('可以编辑');
});
