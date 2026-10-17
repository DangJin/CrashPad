import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const sdk=readFileSync(new URL('../fixtures/amap-sdk.js',import.meta.url),'utf8');
const config=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('crashpad:network:v1')).config);
async function open(page){await page.goto('/#/traffic');await page.getByRole('button',{name:'从地图创建',exact:true}).click();return page.getByRole('dialog');}
async function connect(page,d){await d.getByLabel('JS API Key',{exact:true}).fill('fixture-key');await d.getByLabel('安全密钥 securityJsCode',{exact:true}).fill('fixture-secret');await d.getByRole('button',{name:'连接地图',exact:true}).click();await expect(d.getByRole('button',{name:'规划驾车路线'})).toBeVisible();}
async function points(page,d){for(const keyword of ['起点','终点']){await d.getByLabel('地点关键词').fill(keyword);await d.getByRole('button',{name:'搜索地点',exact:true}).click();await d.getByRole('button',{name:new RegExp(`测试${keyword}`)}).click();}}
async function draft(page,d){await connect(page,d);await points(page,d);await d.getByRole('button',{name:'规划驾车路线'}).click();await d.getByRole('checkbox',{name:/我已确认/}).check();await d.getByRole('button',{name:'生成路网草稿'}).click();await expect(d.getByRole('heading',{name:'确认模拟参数'})).toBeVisible();}
test.beforeEach(async({page})=>{await page.route('https://webapi.amap.com/maps?**',r=>r.fulfill({contentType:'application/javascript',body:sdk}));});
test('map import previews, simulates, persists, and is one undoable edit without storing keys in the network',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const d=await open(page),before=await config(page);await draft(page,d);
 await d.getByRole('checkbox',{name:/末端设信号灯/}).check();await d.getByLabel('车辆数量',{exact:true}).fill('12');
 await expect(d.getByRole('alert')).toHaveCount(0);await expect(d.locator('.map-import-preview')).toBeVisible();
 expect(await d.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 await d.locator('.map-import-draft').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('map-import-confirm.png')});
 await d.getByRole('button',{name:'载入实验室',exact:true}).click();await expect(d).toHaveCount(0);
 const imported=await config(page);expect(imported.mapImport.provider).toBe('amap');expect(imported.demand[0].count).toBe(12);expect(imported.nodes.some(n=>n.signal?.enabled)).toBe(true);
 expect(await page.evaluate(()=>localStorage.getItem('crashpad:network:v1'))).not.toMatch(/fixture-key|fixture-secret|116\.006/);
 await page.locator('[data-network-play]').click();await expect.poll(async()=>Number(await page.locator('[data-sim-time]').getAttribute('data-sim-time'))).toBeGreaterThan(0);
 await page.getByRole('button',{name:'撤销编辑',exact:true}).click();expect(await config(page)).toEqual(before);
 await page.getByRole('button',{name:'重做编辑',exact:true}).click();expect(await config(page)).toEqual(imported);
 await page.reload();expect(await config(page)).toEqual(imported);expect(errors).toEqual([]);
});
test('cancel and modal keyboard do not mutate background; validation blocks invalid import',async({page})=>{
 const d=await open(page),before=await config(page);await draft(page,d);
 await d.getByLabel('车辆数量',{exact:true}).fill('0');await expect(d.getByRole('alert')).toContainText('车辆数');await expect(d.getByRole('button',{name:'载入实验室'})).toBeDisabled();
 await d.getByRole('button',{name:'取消',exact:true}).focus();await page.keyboard.press('Backspace');expect(await config(page)).toEqual(before);
 await page.keyboard.press('Escape');await expect(d).toHaveCount(0);expect(await config(page)).toEqual(before);await expect(page.getByRole('button',{name:'从地图创建',exact:true})).toBeFocused();
});
test('SDK failure can retry; empty search and route failure remain recoverable',async({page})=>{
 await page.unroute('https://webapi.amap.com/maps?**');let calls=0;await page.route('https://webapi.amap.com/maps?**',r=>++calls===1?r.abort():r.fulfill({contentType:'application/javascript',body:sdk}));
 const d=await open(page);expect(calls).toBe(0);await d.getByLabel('JS API Key',{exact:true}).fill('fixture-key');await d.getByLabel('安全密钥 securityJsCode',{exact:true}).fill('fixture-secret');await d.getByRole('button',{name:'连接地图',exact:true}).click();await expect(d.getByRole('alert')).toContainText('地图加载失败');await d.getByRole('button',{name:'连接地图',exact:true}).click();await expect(d.getByRole('button',{name:'规划驾车路线'})).toBeVisible();
 await d.getByLabel('地点关键词').fill('无结果');await d.getByRole('button',{name:'搜索地点',exact:true}).click();await expect(d.getByRole('alert')).toContainText('没有找到');
 await points(page,d);await page.evaluate(()=>window.__routeError=true);await d.getByRole('button',{name:'规划驾车路线'}).click();await expect(d.getByRole('alert')).toContainText('驾车路线失败');
 await page.evaluate(()=>window.__routeError=false);await d.getByRole('button',{name:'规划驾车路线'}).click();await expect(d.getByRole('heading',{name:'选取导入范围'})).toBeVisible();
});
test('changing map points invalidates pending routes, and closing destroys map',async({page})=>{
 const d=await open(page),before=await config(page);await connect(page,d);await points(page,d);await page.evaluate(()=>window.__holdRoute=true);await d.getByRole('button',{name:'规划驾车路线'}).click();
 await page.evaluate(()=>window.__testMap.callback({lnglat:new window.AMap.LngLat(116.007,39.006)}));await page.evaluate(()=>window.__finishRoute());await expect(d.getByRole('heading',{name:'选取导入范围'})).toHaveCount(0);
 await d.getByRole('button',{name:'关闭地图导入'}).click();expect(await page.evaluate(()=>window.__mapDestroyed)).toBe(true);expect(await config(page)).toEqual(before);
});

test('reopening reuses SDK without credentials and points can be revised before import',async({page})=>{
 const d=await open(page);await draft(page,d);await d.getByRole('button',{name:'返回选取路线'}).click();await expect(d.getByRole('heading',{name:'选取导入范围'})).toBeVisible();
 await d.getByRole('combobox',{name:'从路段',exact:true}).selectOption('1');await d.getByRole('button',{name:'生成路网草稿'}).click();await expect(d.locator('.map-import-segment')).toHaveCount(1);
 await d.getByRole('button',{name:'取消',exact:true}).click();await page.getByRole('button',{name:'从地图创建',exact:true}).click();await d.getByRole('button',{name:'继续使用已连接地图'}).click();await expect(d.getByRole('button',{name:'规划驾车路线'})).toBeVisible();
 await d.getByRole('button',{name:'途经点',exact:true}).click();for(let i=0;i<3;i++){await page.evaluate(i=>window.__testMap.callback({lnglat:new window.AMap.LngLat(116+i*.001,39)}),i);await expect(d.getByRole('button',{name:`移除途经 ${i+1}`,exact:true})).toBeVisible();}
 await expect(d.getByRole('button',{name:'途经点',exact:true})).toBeDisabled();await d.getByRole('button',{name:'移除途经 2',exact:true}).click();await expect(d.getByRole('button',{name:'途经点',exact:true})).toBeEnabled();
});

test('credentials survive reload and can be cleared separately from the network',async({page})=>{
 let d=await open(page);await connect(page,d);
 await page.reload();d=await open(page);
 await expect(d.getByLabel('JS API Key',{exact:true})).toHaveValue('fixture-key');
 await expect(d.getByLabel('安全密钥 securityJsCode',{exact:true})).toHaveValue('fixture-secret');
 await d.getByRole('button',{name:'清除本地凭据'}).click();
 await expect(d.getByLabel('JS API Key',{exact:true})).toHaveValue('');
 await page.reload();d=await open(page);await expect(d.getByLabel('JS API Key',{exact:true})).toHaveValue('');
});

test('map signal markings import at their location and clear when the selected range changes',async({page})=>{
 const d=await open(page);await connect(page,d);await points(page,d);
 await d.getByRole('button',{name:'规划驾车路线'}).click();
 await expect(d.getByText(/整条规划路线 2 个/)).toBeVisible();
 await d.getByRole('button',{name:'红绿灯',exact:true}).click();
 const mark=()=>page.evaluate(()=>window.__testMap.callback({lnglat:new window.AMap.LngLat(116.003,39.0001)}));
 await mark();await expect(d.getByRole('button',{name:'删除红绿灯 1'})).toBeVisible();
 await mark();await expect(d.getByRole('alert')).toContainText('间距');
 await d.getByRole('button',{name:'删除红绿灯 1'}).click();await expect(d.getByRole('button',{name:'删除红绿灯 1'})).toHaveCount(0);
 await mark();await d.getByRole('combobox',{name:'从路段',exact:true}).selectOption('1');
 await expect(d.getByRole('button',{name:'删除红绿灯 1'})).toHaveCount(0);
 await d.getByRole('combobox',{name:'从路段',exact:true}).selectOption('0');await mark();
 await d.getByRole('checkbox',{name:/我已确认/}).check();await d.getByRole('button',{name:'生成路网草稿'}).click();
 await expect(d.getByRole('checkbox',{name:/末端设信号灯/}).first()).toBeChecked();
 await d.getByRole('button',{name:'载入实验室',exact:true}).click();
 const imported=await config(page),signal=imported.nodes.find(n=>n.signal?.enabled);
 expect(signal).toBeTruthy();expect(signal.x-imported.nodes[0].x).toBeCloseTo(259.24,0);
 expect(signal.signal.green).toBe(30);
});
