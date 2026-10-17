import {test,expect} from '@playwright/test';
import {buildImportedNetwork,draftRoute,normalizeRoutes} from '../../src/traffic/network/mapImport/routeModel.js';
import {openInspector,closeInspector} from './workbench-helpers.js';
function fixture(){const points=Array.from({length:61},(_,i)=>[116+i*.0002,40+.0018*Math.sin(i/60*Math.PI)]);return buildImportedNetwork(draftRoute(normalizeRoutes({routes:[{steps:[{road:'弧线测试路',distance:550,path:points.slice(0,31)},{road:'弧线测试路',distance:550,path:points.slice(30)}]}]})[0]),{signals:{0:true},count:24,flow:60});}
const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('crashpad:network:v1')).config);
test('curved roads render true lanes, edit a control point, undo, resize and run',async({page},info)=>{
 const config=fixture(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(config=>localStorage.setItem('crashpad:network:v1',JSON.stringify({config})),config);
 await page.goto('/#/traffic');await openInspector(page);
 await expect(page.getByRole('alert')).toHaveCount(0);
 const path=page.locator('[data-network-road-surface="map-road-0"]');expect((await path.getAttribute('d')).split('L').length).toBeGreaterThan(20);
 await page.locator('[data-network-road="map-road-0"]').focus();await page.keyboard.press('Enter');
 await expect(page.locator('[data-curve-handle]').first()).toBeVisible();
 const before=await stored(page);await page.locator('[data-curve-handle="2"]').focus();await page.keyboard.press('ArrowDown');
 await expect.poll(async()=> (await stored(page)).roads[0].geometry.points[2].y).toBeCloseTo(before.roads[0].geometry.points[2].y+5,3);
 expect((await stored(page)).roads[0].length).not.toBe(before.roads[0].length);
 await page.getByRole('button',{name:'撤销编辑',exact:true}).click();expect(await stored(page)).toEqual(before);
 await page.locator('[data-network-road="map-road-0"]').focus();await page.keyboard.press('Enter');
 const length=page.getByRole('spinbutton',{name:'道路长度（米）',exact:true});await length.fill(String(Math.round(before.roads[0].length+80)));await length.press('Enter');
 await expect(page.getByRole('alert')).toHaveCount(0);expect((await stored(page)).roads[0].length).toBe(Math.round(before.roads[0].length+80));
 await closeInspector(page);await page.getByRole('button',{name:'全景',exact:true}).click();
 const handle=page.locator('[data-curve-handle="2"]');await handle.scrollIntoViewIfNeeded();const box=await handle.boundingBox(),dragBefore=await stored(page);
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2+12,{steps:5});await page.mouse.up();
 await expect.poll(async()=>JSON.stringify((await stored(page)).roads[0].geometry)).not.toBe(JSON.stringify(dragBefore.roads[0].geometry));
 await handle.focus();await page.keyboard.press('Backspace');expect((await stored(page)).roads[0].geometry.points.length).toBe(dragBefore.roads[0].geometry.points.length-1);
 await page.getByRole('button',{name:'撤销编辑',exact:true}).click();await page.locator('[data-network-play]').click();await expect.poll(async()=>Number(await page.locator('[data-sim-time]').getAttribute('data-sim-time'))).toBeGreaterThan(1);
 await expect(page.locator('[data-network-car]').first()).toBeVisible();await page.screenshot({path:info.outputPath('curved-road.png')});expect(errors).toEqual([]);
});

test('clicking an imported signal opens only its own timing settings',async({page})=>{
 const route=normalizeRoutes({routes:[{steps:[{road:'信号测试路',distance:1200,path:[[116,40],[116.014,40]]}]}]})[0];
 const config=buildImportedNetwork(draftRoute(route,0,0,[[116.004,40],[116.01,40]]));
 const signals=config.nodes.filter(n=>n.signal?.enabled);expect(signals).toHaveLength(2);
 await page.addInitScript(config=>localStorage.setItem('crashpad:network:v1',JSON.stringify({config})),config);
 await page.goto('/#/traffic');await closeInspector(page);
 await page.locator(`[data-network-signal="${signals[0].id}"]`).first().click();
 const green=page.getByRole('spinbutton',{name:'路段绿灯时长',exact:true});await expect(green).toBeVisible();
 await green.fill('45');await green.press('Enter');
 expect((await stored(page)).nodes.find(n=>n.id===signals[0].id).signal.green).toBe(45);
 expect((await stored(page)).nodes.find(n=>n.id===signals[1].id).signal.green).toBe(30);
 await closeInspector(page);await page.locator(`[data-network-signal="${signals[1].id}"]`).first().focus();await page.keyboard.press('Enter');
 await expect(green).toHaveValue('30');
});
