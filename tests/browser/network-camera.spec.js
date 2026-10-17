import {test,expect} from '@playwright/test';import {corridorExample} from '../../src/traffic/network/templates.js';
async function open(page){const c=corridorExample('straight');c.demand[0].count=5;c.demand[0].flow=60;c.roads.forEach(r=>r.length=60);c.nodes.find(n=>n.id==='section').length=60;
 await page.addInitScript(c=>{if(!localStorage.getItem('crashpad:network:v1'))localStorage.setItem('crashpad:network:v1',JSON.stringify({config:c}));},c);await page.goto('/#/traffic');}
test('director introduces the route, hands back manual control and remembers preference',async({page},info)=>{
 await open(page);const views=page.getByRole('group',{name:'观察视角'});await expect(views.getByRole('button',{name:'自由查看'})).toHaveAttribute('aria-pressed','true');
 await page.locator('[data-network-play]').click();await page.getByRole('button',{name:'开启导演视角，自动看看车流'}).click();
 await expect(page.locator('[data-camera-caption]')).toContainText('全景');await expect(page.locator('[data-camera-caption]')).not.toContainText('全景',{timeout:6000});
 await page.screenshot({path:info.outputPath('director-camera.png')});
 const svg=page.locator('[data-network-canvas] svg').first();await svg.hover();await page.mouse.wheel(0,100);await expect(views.getByRole('button',{name:'自由查看'})).toHaveAttribute('aria-pressed','true');
 await views.getByRole('button',{name:'导演视角'}).click();await page.reload();await expect(views.getByRole('button',{name:'导演视角'})).toHaveAttribute('aria-pressed','true');
});
test('selecting does not move camera; explicit following survives reset and shows arrival',async({page})=>{
 await open(page);const views=page.getByRole('group',{name:'观察视角'});await page.locator('[data-network-play]').click();
 await expect(page.locator('[data-network-car="1"]')).toBeVisible();await page.locator('[data-network-car="1"]').press('Enter');await expect(views.getByRole('button',{name:'自由查看'})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'跟随这辆车',exact:true}).click();await expect(views.getByRole('button',{name:'跟随车辆'})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'重置',exact:true}).click();await expect(page.locator('[data-camera-caption]')).toContainText('等待车辆 1');
 await page.getByRole('group',{name:'模拟倍速'}).getByRole('button',{name:'20×'}).click();await page.locator('[data-network-play]').click();
 await expect(page.locator('[data-camera-caption]')).toContainText('车辆 1 已到达',{timeout:15000});await expect(page.locator('[data-camera-caption]')).toContainText('总用时');
});
