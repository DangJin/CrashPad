import { openInspector } from './workbench-helpers.js';
import {test,expect} from '@playwright/test';
import {corridorExample} from '../../src/traffic/network/templates.js';
test('locate broken road, align it and undo the repair',async({page})=>{
  const config=corridorExample('straight');config.nodes[0].y+=40;
  await page.addInitScript(config=>localStorage.setItem('crashpad:network:v1',JSON.stringify({config})),config);
  await page.goto('/#/traffic'); await openInspector(page);
  const alert=page.getByRole('alert');await expect(alert).toContainText('两端未对齐');
  await page.getByRole('button',{name:/定位问题道路/}).click();
  await expect(page.locator('[data-network-invalid-road="in"]')).toHaveAttribute('stroke','#245bdb');
  await expect(page.getByRole('button',{name:'调整起点',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'一键对齐',exact:true}).click();
  await expect(alert).toHaveCount(0);await expect(page.locator('[data-network-play]')).toBeEnabled();
  await page.getByRole('button',{name:'撤销编辑',exact:true}).click();
  await expect(alert).toContainText('两端未对齐');
  await page.locator('[data-network-invalid-road="in"]').press('Enter');
  await expect(page.getByRole('button',{name:'调整终点',exact:true})).toBeVisible();
});
