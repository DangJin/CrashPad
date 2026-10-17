import { openInspector } from './workbench-helpers.js';
import { test, expect } from '@playwright/test';
import { corridorExample } from '../../src/traffic/network/templates.js';
test('ETC eligibility is editable, persistent and reports an unserviceable route', async ({ page }, info) => {
  await page.addInitScript(config => { if (!localStorage.getItem('crashpad:network:v1')) localStorage.setItem('crashpad:network:v1', JSON.stringify({ config })); }, corridorExample('toll'));
  await page.goto('/#/traffic'); await openInspector(page);
  await expect(page.getByRole('spinbutton', { name: 'ETC 放行间隔（秒）', exact: true })).toHaveValue('2');
  await page.getByRole('group', { name: '实验设置' }).getByRole('button', { name: '车流设置', exact: true }).click();
  const ratio = page.getByRole('spinbutton', { name: 'ETC 车辆占比（%）', exact: true });
  await ratio.fill('50'); await ratio.press('Enter');
  await expect(page.getByRole('alert')).toContainText('增加人工窗口');
  await page.reload(); await openInspector(page);
  await page.getByRole('group', { name: '实验设置' }).getByRole('button', { name: '车流设置', exact: true }).click();
  await expect(ratio).toHaveValue('50');
  await ratio.fill('100'); await ratio.press('Enter');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await ratio.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('etc-settings.png') });
});
