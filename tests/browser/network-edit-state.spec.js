import { openInspector } from './workbench-helpers.js';
import { test, expect } from '@playwright/test';
import { makeExample } from '../../src/traffic/network/model.js';
const readConfig = page => page.evaluate(() => JSON.parse(localStorage.getItem('crashpad:network:v1')).config);
async function open(page) {
  const config = makeExample();
  await page.addInitScript(config => localStorage.setItem('crashpad:network:v1', JSON.stringify({ config, A: null, B: null })), config);
  await page.goto('/#/traffic'); await openInspector(page);
}
test('name edit is a single undo and preserves the active simulation', async ({ page }) => {
  await open(page);
  const original = (await readConfig(page)).nodes.find(n => n.id === 'center').name;
  await page.locator('[data-network-play]').click();
  await expect.poll(async () => Number(await page.locator('[data-sim-time]').getAttribute('data-sim-time'))).toBeGreaterThan(0);
  const name = page.getByRole('textbox', { name: '对象名称', exact: true });
  await name.fill('新的路口名称');
  expect((await readConfig(page)).nodes.find(n => n.id === 'center').name).toBe(original);
  await name.press('Enter');
  await expect.poll(async () => (await readConfig(page)).nodes.find(n => n.id === 'center').name).toBe('新的路口名称');
  await expect(page.locator('[data-network-play]')).toContainText('暂停');
  await page.getByRole('button', { name: '撤销编辑', exact: true }).click();
  expect((await readConfig(page)).nodes.find(n => n.id === 'center').name).toBe(original);
  await expect(page.locator('[data-network-play]')).toContainText('暂停');
});
test('ratio drafts cancel and commit once; keyboard range changes can be undone once', async ({ page }) => {
  await open(page);
  await page.getByRole('group', { name: '实验设置' }).getByRole('button', { name: '车流设置', exact: true }).click();
  const number = page.getByRole('spinbutton', { name: 'ETC 车辆占比（%）', exact: true });
  await number.fill('45'); await number.press('Escape'); await number.blur();
  expect((await readConfig(page)).etcPercent ?? 100).toBe(100);
  await number.fill('45'); await number.press('Enter');
  await expect.poll(async () => (await readConfig(page)).etcPercent).toBe(45);
  await page.getByRole('button', { name: '撤销编辑', exact: true }).click();
  expect((await readConfig(page)).etcPercent ?? 100).toBe(100);
  const range = page.getByRole('slider', { name: 'ETC 车辆占比（%）', exact: true });
  await range.focus(); await range.press('ArrowLeft');
  await expect.poll(async () => (await readConfig(page)).etcPercent).toBe(99);
  await page.getByRole('button', { name: '撤销编辑', exact: true }).click();
  expect((await readConfig(page)).etcPercent ?? 100).toBe(100);
});
