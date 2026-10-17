import { test, expect } from '@playwright/test';
import { corridorExample } from '../../src/traffic/network/templates.js';
import { openInspector } from './workbench-helpers.js';

test('rejected road length restores the accepted value rather than displaying an unsaved draft', async ({ page }) => {
  const config = corridorExample('straight');
  config.roads.push({id:'loop',from:'start',to:'end',lanes:1,length:400,speed:60,oneWay:true});
  const initial = config.roads.find(road => road.id === 'in').length;
  await page.addInitScript(config => localStorage.setItem('crashpad:network:v1', JSON.stringify({config})), config);
  await page.goto('/#/traffic');
  await page.locator('[data-network-road="in"]').press('Enter');
  await openInspector(page);
  const field = page.getByRole('spinbutton',{name:'道路长度（米）',exact:true});
  await field.fill('600'); await field.press('Enter');
  await expect(page.getByRole('status').filter({hasText:'闭环'})).toBeVisible();
  await expect(field).toHaveValue(String(initial));
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('crashpad:network:v1')).config.roads.find(road=>road.id==='in').length)).toBe(initial);
  await field.fill('900'); await field.press('Escape'); await field.blur();
  await expect(field).toHaveValue(String(initial));
});
