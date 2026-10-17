import { test, expect } from '@playwright/test';
import { makeExample } from '../../src/traffic/network/model.js';
import { openInspector } from './workbench-helpers.js';

async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
test('shared workbench stays within viewport and retains contextual selection', async ({ page }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(config => localStorage.setItem('crashpad:network:v1', JSON.stringify({config})), makeExample());
  await page.goto('/');
  await expect(page.locator('#scene')).toBeVisible(); await noOverflow(page);
  await page.screenshot({path:info.outputPath('scene-workbench.png'), fullPage:true});
  await page.getByRole('link', {name:'车流实验室',exact:true}).click();
  await expect(page.locator('[data-network-canvas]')).toBeVisible(); await noOverflow(page);
  if (info.project.name === 'mobile') await expect(page.getByRole('button',{name:'属性与设置',exact:true})).toHaveAttribute('aria-expanded','false');
  await openInspector(page);
  const originalName = await page.getByRole('textbox',{name:'对象名称',exact:true}).inputValue();
  const settings = page.getByRole('group',{name:'实验设置',exact:true});
  await settings.getByRole('button',{name:'车流设置',exact:true}).click();
  await page.getByRole('combobox',{name:'车流入口',exact:true}).selectOption('east');
  await settings.getByRole('button',{name:'对象属性',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'对象名称',exact:true})).toHaveValue(originalName);
  await noOverflow(page);
  await page.screenshot({path:info.outputPath('network-workbench.png'), fullPage:true});
  expect(errors).toEqual([]);
});

test('dashboard starts compact and preserves the user expansion choice while simulation advances', async ({ page }, info) => {
  await page.goto('/#/traffic');
  const dashboard = page.locator('.network-dashboard');
  await expect(dashboard).not.toHaveAttribute('open','');
  await expect(dashboard.locator('.network-dashboard-body')).not.toBeVisible();
  await page.locator('[data-network-play]').click();
  await expect.poll(async()=>Number(await page.locator('[data-sim-time]').getAttribute('data-sim-time'))).toBeGreaterThan(1);
  await expect(dashboard.locator('.network-dashboard-body')).not.toBeVisible();
  await dashboard.locator(':scope > summary').click();
  await expect(dashboard.getByRole('table',{name:'各入口实时车辆统计'})).toBeVisible();
  await expect(dashboard.getByRole('img',{name:/路网实时速度趋势/})).toBeVisible();
  const time = Number(await page.locator('[data-sim-time]').getAttribute('data-sim-time'));
  await expect.poll(async()=>Number(await page.locator('[data-sim-time]').getAttribute('data-sim-time'))).toBeGreaterThan(time+1);
  await expect(dashboard.locator('.network-dashboard-body')).toBeVisible();
  await page.locator('[data-network-play]').click();
  await expect(dashboard.locator('.network-dashboard-body')).toBeVisible();
  await noOverflow(page);
  await page.screenshot({path:info.outputPath('network-dashboard.png'),fullPage:true});
  await dashboard.locator(':scope > summary').click();
  await page.getByRole('button',{name:'重置',exact:true}).click();
  await expect(dashboard.locator('.network-dashboard-body')).not.toBeVisible();
});
