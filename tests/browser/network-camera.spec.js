import { openInspector } from './workbench-helpers.js';
import {test,expect} from '@playwright/test';import {corridorExample} from '../../src/traffic/network/templates.js';
async function open(page){const c=corridorExample('straight');c.demand[0].count=5;c.demand[0].flow=60;c.roads.forEach(r=>r.length=60);c.nodes.find(n=>n.id==='section').length=60;
 await page.addInitScript(c=>{if(!localStorage.getItem('crashpad:network:v1'))localStorage.setItem('crashpad:network:v1',JSON.stringify({config:c}));},c);await page.goto('/#/traffic'); await openInspector(page);}
test('director introduces the route, hands back manual control and remembers preference',async({page},info)=>{
 await open(page);const views=page.getByRole('group',{name:'观察视角'});await expect(views.getByRole('button',{name:'自由查看'})).toHaveAttribute('aria-pressed','true');
 await page.locator('[data-network-play]').click();await page.getByRole('button',{name:'开启导演视角，自动看看车流'}).click();
 await expect(page.locator('[data-camera-caption]')).toContainText('全景');await expect(page.locator('[data-camera-caption]')).not.toContainText('全景',{timeout:6000});
 await page.screenshot({path:info.outputPath('director-camera.png')});
 const svg=page.locator('[data-network-canvas] svg').first();await svg.hover();await page.mouse.wheel(0,100);await expect(views.getByRole('button',{name:'自由查看'})).toHaveAttribute('aria-pressed','true');
 await views.getByRole('button',{name:'导演视角'}).click();await page.reload(); await openInspector(page);await expect(views.getByRole('button',{name:'导演视角'})).toHaveAttribute('aria-pressed','true');
});
test('selecting does not move camera; explicit following survives reset and shows arrival',async({page},info)=>{
 await open(page);const views=page.getByRole('group',{name:'观察视角'});await page.locator('[data-network-play]').click();
 await expect(page.locator('[data-network-car="1"]')).toBeVisible();await page.locator('[data-network-car="1"]').press('Enter');await expect(views.getByRole('button',{name:'自由查看'})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'跟随这辆车',exact:true}).click();await expect(views.getByRole('button',{name:'跟随车辆'})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('spinbutton',{name:'画布缩放'})).toHaveValue('300');
 await page.getByRole('button',{name:'放大画布',exact:true}).click();
 await expect(page.getByRole('spinbutton',{name:'画布缩放'})).toHaveValue('375');
 await expect(views.getByRole('button',{name:'跟随车辆'})).toHaveAttribute('aria-pressed','true');
 const panel=page.locator('.vehicle-panel-overlay');await expect(panel).toBeVisible();
 if(await panel.getByRole('button',{name:'展开车辆数据'}).isVisible())await panel.getByRole('button',{name:'展开车辆数据'}).click();
 await expect(panel.getByText('入口等待',{exact:true})).toBeVisible();await expect(panel.getByText('加速度',{exact:true})).toBeVisible();
 await expect(panel.getByRole('img',{name:'车辆速度变化曲线'})).toBeVisible();
 expect(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('vehicle-dashboard.png')});
 await panel.getByRole('button',{name:'收起车辆数据'}).click();await expect(panel.getByText('加速度',{exact:true})).toHaveCount(0);
 await panel.getByRole('button',{name:'展开车辆数据'}).click();
 await page.getByRole('button',{name:'重置',exact:true}).click();await expect(page.locator('[data-camera-caption]')).toContainText('等待车辆 1');
 await page.getByRole('group',{name:'模拟倍速'}).getByRole('button',{name:'20×'}).click();await page.locator('[data-network-play]').click();
 await expect(page.locator('[data-camera-caption]')).toContainText('车辆 1 已到达',{timeout:15000});await expect(page.locator('[data-camera-caption]')).toContainText('总用时');
 await expect(panel).toContainText('行程结束');await expect(panel).toContainText('已到达');
 await panel.getByRole('button',{name:'退出车辆跟随'}).click();await expect(panel).toHaveCount(0);
});
