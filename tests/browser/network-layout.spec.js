import { test, expect } from '@playwright/test';
import { corridorExample } from '../../src/traffic/network/templates.js';
import { makeExample } from '../../src/traffic/network/model.js';
import { closeInspector, openInspector } from './workbench-helpers.js';

for (const angle of [0, 90, 180, 270]) test(`append action stays outside the terminal at ${angle} degrees`, async ({page}, info) => {
  const config = corridorExample('straight'), rad=angle*Math.PI/180;
  config.nodes=config.nodes.map(n=>({...n,x:1200+(n.x-600)*Math.cos(rad)-(n.y-440)*Math.sin(rad),y:1200+(n.x-600)*Math.sin(rad)+(n.y-440)*Math.cos(rad),rotation:(n.rotation+angle)%360}));
  await page.addInitScript(config=>localStorage.setItem('crashpad:network:v1',JSON.stringify({config})),config);
  await page.goto('/#/traffic'); await closeInspector(page);
  await page.getByRole('button',{name:'全景',exact:true}).click();
  const action=page.locator('[data-network-append]').first(); await expect(action).toBeVisible();
  const id=await action.getAttribute('data-network-append');
  const a=await action.locator('circle').boundingBox(), b=await page.locator(`[data-network-terminal="${id}"]`).boundingBox();
  expect(a.x>=b.x+b.width || a.x+a.width<=b.x || a.y>=b.y+b.height || a.y+a.height<=b.y).toBe(true);
  if(angle%180===0) expect(Math.abs(a.y+a.height/2-b.y-b.height/2)).toBeLessThan(2);
  else expect(Math.abs(a.x+a.width/2-b.x-b.width/2)).toBeLessThan(2);
  await action.click(); const menu=page.getByRole('dialog',{name:'添加路段'});await expect(menu).toBeVisible();
  const m=await menu.boundingBox(), c=await page.locator('[data-network-canvas]').boundingBox();
  expect(m.y).toBeGreaterThanOrEqual(c.y);expect(m.y+m.height).toBeLessThanOrEqual(c.y+c.height+1);
  await page.screenshot({path:info.outputPath(`append-${angle}.png`)});
});

test('inspector groups and narrow preset menu remain separated and reachable',async({page},info)=>{
  for(const kind of ['straight','toll','merge','exit','cross']) {
    const config=kind==='cross'?makeExample():corridorExample(kind);
    await page.goto('/');
    await page.evaluate(config=>localStorage.setItem('crashpad:network:v1',JSON.stringify({config})),config);
    await page.goto('/#/traffic');await openInspector(page);
    const terminal=config.nodes.find(n=>n.type==='terminal');
    await page.locator(`[data-network-node="${terminal.id}"]`).press('Enter');
    await page.locator('.network-position > summary').click();
    const rotation=page.getByRole('button',{name:/旋转 90/}), role=page.getByRole('combobox',{name:'端点用途'});
    const r=await rotation.boundingBox(), u=await role.boundingBox();expect(u.y-r.y-r.height).toBeGreaterThanOrEqual(12);
    const inputs=page.locator('.network-coordinate input');
    const a=await inputs.nth(0).boundingBox(),b=await inputs.nth(1).boundingBox();expect(b.x-a.x-a.width).toBeGreaterThanOrEqual(10);
    if(kind==='straight') await page.screenshot({path:info.outputPath('terminal-properties.png')});
    const target=config.nodes.find(n=>n.type!=='terminal');
    await page.locator(`[data-network-node="${target.id}"]`).press('Enter');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await closeInspector(page);await page.locator('.network-scenarios>summary').click();
  const menu=await page.locator('.network-scenario-menu').boundingBox();
  expect(menu.x).toBeGreaterThanOrEqual(0);expect(menu.x+menu.width).toBeLessThanOrEqual(page.viewportSize().width);
  expect(menu.y+menu.height).toBeLessThanOrEqual(page.viewportSize().height);
  await page.screenshot({path:info.outputPath('preset-menu-bounds.png')});
});
