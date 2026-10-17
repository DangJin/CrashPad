import {test,expect} from '@playwright/test';import {corridorExample} from '../../src/traffic/network/templates.js';
for(const kind of ['straight','toll'])test(`${kind} length changes canvas geometry and can be undone`,async({page},info)=>{
 await page.addInitScript(config=>{if(!localStorage.getItem('crashpad:network:v1'))localStorage.setItem('crashpad:network:v1',JSON.stringify({config}));},corridorExample(kind));
 await page.goto('/#/traffic');const shape=page.locator('[data-network-node="section"]>polygon');const before=await shape.getAttribute('points');
 const field=page.getByRole('spinbutton',{name:kind==='toll'?'广场长度（米）':'路段长度（米）',exact:true});
 await field.fill('1000');await field.press('Enter');await expect(shape).not.toHaveAttribute('points',before);await expect(page.getByRole('alert')).toHaveCount(0);
 await page.screenshot({path:info.outputPath('resized-road.png')});
 await page.getByRole('button',{name:'撤销编辑',exact:true}).click();await expect(shape).toHaveAttribute('points',before);
 await page.locator('[data-network-node="section"]').press('Enter');await field.fill('800');await field.press('Enter');await page.reload();await expect(field).toHaveValue('800');
});
test('connecting road length stretches its endpoints',async({page})=>{
 await page.addInitScript(config=>localStorage.setItem('crashpad:network:v1',JSON.stringify({config})),corridorExample('straight'));await page.goto('/#/traffic');
 await page.locator('[data-network-road="in"]').press('Enter');const surface=page.locator('[data-network-road-surface="in"]'),before=await surface.getAttribute('d');
 const field=page.getByRole('spinbutton',{name:'道路长度（米）',exact:true});await field.fill('600');await field.press('Enter');await expect(surface).not.toHaveAttribute('d',before);await expect(page.getByRole('alert')).toHaveCount(0);
});
