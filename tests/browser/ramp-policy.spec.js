import {test,expect} from '@playwright/test';
import {corridorExample} from '../../src/traffic/network/templates.js';
test('merge policy is contextual, persisted and undoable',async({page})=>{
  await page.addInitScript(config=>{if(!localStorage.getItem('crashpad:network:v1'))localStorage.setItem('crashpad:network:v1',JSON.stringify({config}));},corridorExample('merge'));
  await page.goto('/#/traffic');
  const group=page.getByRole('group',{name:'汇入策略',exact:true});
  await expect(group.getByRole('button',{name:'协作汇入'})).toHaveAttribute('aria-pressed','true');
  await group.getByRole('button',{name:'拉链式汇入'}).click();
  await page.reload();
  await expect(group.getByRole('button',{name:'拉链式汇入'})).toHaveAttribute('aria-pressed','true');
  await group.getByRole('button',{name:'主路优先'}).click();
  await page.getByRole('button',{name:'撤销编辑',exact:true}).click();
  await page.locator('[data-network-node="section"]').press('Enter');
  await expect(group.getByRole('button',{name:'拉链式汇入'})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('[data-network-play]')).toBeEnabled();
});
