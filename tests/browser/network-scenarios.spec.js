import { openInspector } from './workbench-helpers.js';
import { test, expect } from '@playwright/test';
async function choose(page, title) {
  await page.locator('.network-scenarios > summary').click();
  await expect(page.getByText('导入旧线性实验',{exact:true})).toHaveCount(0);
  await page.locator('.network-scenario-menu').getByRole('button', { name: new RegExp(title) }).click();
}
for (const [id, title] of [['highway-morning', '高速早高峰'], ['city-morning', '城市主干道早高峰'], ['toll-mixed','收费站混合车流'], ['zipper-merge','拉链式汇入'], ['busy-exit','出口集中分流']]) test(`${title} loads, runs, persists and can be undone`, async ({ page }, info) => {
  await page.goto('/#/traffic'); await openInspector(page);
  await expect.poll(() => page.evaluate(() => !!localStorage.getItem('crashpad:network:v1'))).toBe(true);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('crashpad:network:v1')).config);
  await choose(page, title);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('crashpad:network:v1')).config.scenario)).toBe(id);
  await page.screenshot({ path: info.outputPath(`${id}.png`) });
  await page.locator('[data-network-play]').click();
  await expect.poll(async () => Number(await page.locator('[data-sim-time]').getAttribute('data-sim-time'))).toBeGreaterThan(0);
  await page.getByRole('button', { name: '撤销编辑', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('crashpad:network:v1')).config)).toEqual(before);
  await choose(page, title); await page.reload(); await openInspector(page);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('crashpad:network:v1')).config.scenario)).toBe(id);
});
