import { openInspector, closeInspector, chooseTool, canvasPoint } from './workbench-helpers.js';
import { test, expect } from '@playwright/test';
import { makeExample } from '../../src/traffic/network/model.js';
async function open(page) {
  await page.addInitScript(config => localStorage.setItem('crashpad:network:v1', JSON.stringify({ config })), makeExample());
  await page.goto('/#/traffic'); await closeInspector(page);
  await expect(page.locator('[data-network-canvas] svg')).toBeVisible();
}
async function saved(page) { return page.evaluate(() => JSON.parse(localStorage.getItem('crashpad:network:v1')).config); }
test('canvas zooms continuously, pans without editing, and fits again', async ({ page }, info) => {
  await open(page);
  const svg = page.locator('[data-network-canvas] svg'), number = page.getByRole('spinbutton', { name: '画布缩放', exact: true });
  await expect.poll(async () => Number(await number.inputValue())).toBeGreaterThanOrEqual(80);
  await page.getByRole('button', { name: '全景', exact: true }).click();
  const config = await saved(page), fit = await svg.getAttribute('viewBox');
  await number.fill('200'); await number.press('Enter');
  await expect(number).toHaveValue('200');
  const before = await page.locator('[data-network-light]').first().boundingBox();
  await number.fill('400'); await number.press('Enter');
  const after = await page.locator('[data-network-light]').first().boundingBox();
  expect(after.width / before.width).toBeCloseTo(1, 1);
  const box = await svg.boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.keyboard.down('Control'); await page.mouse.wheel(0, -80); await page.keyboard.up('Control');
  await expect.poll(async () => Number(await number.inputValue())).toBeGreaterThan(400);
  await page.getByRole('button', { name: '全景', exact: true }).click();
  await expect(svg).toHaveAttribute('viewBox', fit);
  const blank = await canvasPoint(page, '[data-network-ground]');
  await page.mouse.move(blank.x, blank.y); await page.mouse.down(); await page.mouse.move(blank.x + 20, blank.y + 25, { steps: 5 }); await page.mouse.up();
  expect(await svg.getAttribute('viewBox')).not.toBe(fit);
  expect(await saved(page)).toEqual(config);
  await number.fill('150'); await number.press('Enter');
  await page.locator('[data-network-play]').click();
  await expect.poll(async () => Number(await page.locator('.network-stage').getAttribute('data-sim-time'))).toBeGreaterThan(1);
  await svg.hover(); await page.mouse.wheel(0, -25);
  expect(Number(await page.locator('.network-stage').getAttribute('data-sim-time'))).toBeGreaterThan(1);
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.screenshot({ path: info.outputPath('canvas-zoom.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('free ports connect by click or drag without a mode switch', async ({ page }) => {
  await open(page);
  async function removeEast() { await page.locator('[data-network-road="r-east"]').click(); await page.getByRole('button', { name: '删除道路 · Backspace', exact: true }).click(); await closeInspector(page); }
  await page.getByRole('button', { name: '全景', exact: true }).click();
  await removeEast();
  const a = page.locator('[data-network-port="center:east"]'), b = page.locator('[data-network-port="east:west"]');
  await a.click(); await expect(b).toHaveAttribute('data-connectable', 'true');
  await page.locator('[data-network-port="north:south"]').click();
  await expect(page.locator('.network-link-note')).toBeVisible();
  await b.click(); await expect(page.locator('[data-network-road]')).toHaveCount(4);
  const added = (await saved(page)).roads.find(r => r.from === 'center' && r.to === 'east');
  await page.locator(`[data-network-road="${added.id}"]`).click(); await page.getByRole('button', { name: '删除道路 · Backspace', exact: true }).click(); await closeInspector(page);
  await page.locator('[data-network-canvas]').scrollIntoViewIfNeeded();
  const from = await a.boundingBox(), to = await b.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down(); await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await expect(page.locator('[data-network-wire]')).toHaveCount(1); await page.mouse.up();
  await expect(page.locator('[data-network-road]')).toHaveCount(4);
  await expect(page.locator('.network-link-note')).toHaveCount(0);
});
test('percentage sliders and numeric input stay in sync and keep totals at 100', async ({ page }) => {
  await open(page);
  await page.getByRole('group', { name: '实验设置' }).getByRole('button', { name: '车流设置', exact: true }).click();
  const input = page.getByRole('spinbutton', { name: '到东侧（%）', exact: true }), slider = page.getByRole('slider', { name: '到东侧（%）', exact: true });
  await input.fill('65'); await input.press('Enter'); await expect(slider).toHaveValue('65');
  await slider.focus(); await slider.fill('42'); await slider.blur(); await expect(input).toHaveValue('42');
  let config = await saved(page); expect(Object.values(config.demand.find(d => d.node === 'west').destinations).reduce((a, b) => a + b, 0)).toBe(100);
  const mix = page.locator('.network-section').filter({ hasText: '驾驶风格 · 所有入口' });
  await mix.getByRole('slider').first().focus(); await mix.getByRole('slider').first().fill('70'); await mix.getByRole('slider').first().blur();
  await expect(mix.getByRole('spinbutton').first()).toHaveValue('70');
  config = await saved(page); expect(Object.values(config.driverMix).reduce((a, b) => a + b, 0)).toBe(100);
  await input.fill('150'); await input.press('Enter'); await expect(input).toHaveValue('100'); await expect(slider).toHaveValue('100');
});
test('touch pinch enlarges the canvas without moving nodes', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'mobile', 'Touch viewport');
  await open(page);
  const config = await saved(page), svg = page.locator('[data-network-canvas] svg'), before = await svg.getAttribute('viewBox'), box = await svg.boundingBox(), cdp = await context.newCDPSession(page);
  const {x,y} = await canvasPoint(page, '[data-network-ground]', {margin:80});
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - 20, y, id: 1 }, { x: x + 20, y, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 50, y, id: 1 }, { x: x + 50, y, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(Number((await svg.getAttribute('viewBox')).split(' ')[2])).toBeLessThan(Number(before.split(' ')[2]));
  expect(await saved(page)).toEqual(config);
});

test('pending connections cancel safely when their source is deleted', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: '全景', exact: true }).click();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.locator('[data-network-road="r-east"]').click(); await page.getByRole('button', { name: '删除道路 · Backspace', exact: true }).click(); await closeInspector(page);
  await page.locator('[data-network-node="center"]').press('Enter'); await closeInspector(page);
  await page.locator('[data-network-port="center:east"]').click();
  await expect(page.locator('.network-link-note')).toBeVisible();
  await page.locator('[data-network-canvas] svg').press('Backspace');
  await expect(page.locator('[data-network-node]')).toHaveCount(4);
  await expect(page.locator('.network-link-note')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('large maps open at editing size and adding objects focuses them instead of shrinking the map', async ({ page }, info) => {
  const config = makeExample(); config.nodes.push({ id: 'far', type: 'terminal', x: 6500, y: 440, rotation: 0, role: 'both' });
  await page.addInitScript(config => localStorage.setItem('crashpad:network:v1', JSON.stringify({ config })), config);
  await page.goto('/#/traffic'); await closeInspector(page);
  const zoom = page.getByRole('spinbutton', { name: '画布缩放' }); await expect(zoom).toHaveValue('80');
  await expect(page.locator('[data-network-canvas] .network-view-controls')).toBeVisible();
  await expect(page.getByRole('slider', { name: '画布缩放' })).toHaveCount(0);
  await chooseTool(page, '入口 / 出口');
  await expect(zoom).toHaveValue('200');
  const added = page.locator('[data-network-node^="terminal-"]').last(), nodeBox = await added.boundingBox(), canvas = await page.locator('[data-network-canvas]').boundingBox();
  expect(nodeBox.x).toBeGreaterThan(canvas.x); expect(nodeBox.x + nodeBox.width).toBeLessThan(canvas.x + canvas.width);
  await page.screenshot({ path: info.outputPath('focused-editor.png'), fullPage: true });
});
test('dragging a toll updates all connected road previews and commits one undoable aligned edit', async ({ page }, info) => {
  const { corridorExample } = await import('../../src/traffic/network/templates.js');
  await page.addInitScript(config => localStorage.setItem('crashpad:network:v1', JSON.stringify({ config })), corridorExample('toll'));
  await page.goto('/#/traffic'); await closeInspector(page);
  const svg = page.locator('[data-network-canvas] svg'), node = page.locator('[data-network-node="section"]');
  await svg.scrollIntoViewIfNeeded();
  const box = await node.boundingBox(), canvas = await svg.boundingBox();
  // The toll's anchor is on its upper boundary for a one-way road.
  const position = await canvasPoint(page, '[data-network-node="section"]', {margin:90});
  const { x, y } = position;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y + 85, { steps: 8 });
  const endpoints = await page.locator('[data-network-road-surface]').evaluateAll(paths => paths.map(p => p.getAttribute('d')));
  expect(endpoints.every(d => { const n = d.match(/-?[\d.]+/g).map(Number); return n[1] === n[3]; })).toBe(true);
  await page.mouse.up();
  const config = await saved(page); expect(config.nodes.every(n => n.y === config.nodes[1].y)).toBe(true); expect(config.nodes[1].y).not.toBe(360);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: '撤销编辑', exact: true }).click();
  expect((await saved(page)).nodes.every(n => n.y === 360)).toBe(true);
  await page.screenshot({ path: info.outputPath('toll-joined.png'), fullPage: true });
});

test('clear canvas is one undoable edit and empty canvas supports starting again', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('group', { name: '路网编辑工具' })).toHaveCount(0);
  const before = await saved(page);
  await page.getByRole('button', { name: '清空画布', exact: true }).click();
  await expect(page.locator('[data-network-node]')).toHaveCount(0);
  await expect(page.locator('[data-network-road]')).toHaveCount(0);
  await expect(page.getByText('从一段道路开始', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('[data-network-play]')).toBeDisabled();
  expect((await saved(page)).demand).toEqual([]);
  await page.getByRole('button', { name: '撤销编辑' }).click();
  expect(await saved(page)).toEqual(before);
  await page.getByRole('button', { name: '重做编辑' }).click();
  await expect(page.locator('[data-network-node]')).toHaveCount(0);
  await chooseTool(page, '直路');
  await expect(page.locator('[data-network-node]')).toHaveCount(3);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('[data-network-play]')).toBeEnabled();
});
test('one-way entry card and connection handle share the visible carriageway centre', async ({ page }, info) => {
  const { corridorExample } = await import('../../src/traffic/network/templates.js');
  await page.addInitScript(config => localStorage.setItem('crashpad:network:v1', JSON.stringify({ config })), corridorExample('toll'));
  await page.goto('/#/traffic'); await closeInspector(page); await page.getByRole('button', { name: '全景', exact: true }).click();
  const geometry = await page.evaluate(() => {
    const node = document.querySelector('[data-network-terminal="start"]'), port = document.querySelector('[data-network-port="start:east"] ellipse'), road = document.querySelector('[data-network-road-surface="in"]');
    return { cardY: Number(node.getAttribute('y')) + Number(node.getAttribute('height')) / 2, portY: Number(port.getAttribute('cy')), roadY: Number(road.getAttribute('d').match(/-?[\d.]+/g)[1]) };
  });
  expect(geometry.cardY).toBe(geometry.roadY); expect(geometry.portY).toBe(geometry.roadY);
  await page.screenshot({ path: info.outputPath('aligned-entry.png'), fullPage: true });
});

test('road-end addition preserves zoom and readable lanes with a continuous road', async ({ page }, info) => {
  const { corridorExample } = await import('../../src/traffic/network/templates.js');
  await page.addInitScript(config => localStorage.setItem('crashpad:network:v1', JSON.stringify({ config })), corridorExample('straight'));
  await page.goto('/#/traffic'); await closeInspector(page);
  const number = page.getByRole('spinbutton', { name: '画布缩放' });
  await expect(number).not.toHaveValue('200');
  const initial = await number.inputValue();
  await page.getByRole('button', { name: '继续添加道路', exact: true }).click();
  await page.getByRole('dialog', { name: '添加路段' }).getByRole('button', { name: '车道减少', exact: true }).click();
  await expect(page.locator('[data-network-node]')).toHaveCount(4);
  await expect(number).toHaveValue(initial);
  expect((await saved(page)).nodes.find(n => n.id === 'section').x).toBe(600);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await number.fill('15'); await number.press('Enter');
  const labels = await page.locator('[data-network-label]').evaluateAll(nodes => nodes.map(node => {const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};}));
  expect(labels.length).toBeGreaterThan(0);
  for(let i=0;i<labels.length;i++) for(let j=i+1;j<labels.length;j++) {const a=labels[i],b=labels[j]; expect(a.right<=b.left || b.right<=a.left || a.bottom<=b.top || b.bottom<=a.top).toBe(true);}
  const label = await page.locator('[data-network-label^="node:"]').first().boundingBox();
  expect(label.height).toBeGreaterThanOrEqual(12);
  const svg = page.locator('[data-network-canvas] svg'), before = await svg.getAttribute('viewBox');
  await svg.hover(); await page.mouse.wheel(0, 100);
  await expect(number).toHaveValue('15');
  await expect(svg).not.toHaveAttribute('viewBox', before);
  await page.getByRole('button', { name: '全景', exact: true }).click();
  await page.screenshot({ path: info.outputPath('continuous-road.png'), fullPage: true });
});

test('insert menu opens beside the trigger, stays inside canvas and dismisses without editing', async ({ page }, info) => {
  const { corridorExample } = await import('../../src/traffic/network/templates.js');
  await page.addInitScript(config => localStorage.setItem('crashpad:network:v1', JSON.stringify({ config })), corridorExample('straight'));
  await page.goto('/#/traffic'); await closeInspector(page);
  await page.getByRole('button', { name: '全景', exact: true }).click();
  const trigger = page.getByRole('button', { name: '继续添加道路', exact: true });
  await trigger.click();
  const menu = page.getByRole('dialog', { name: '添加路段' });
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox(), anchor = await trigger.boundingBox(), canvas = await page.locator('[data-network-canvas]').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(canvas.x);
  expect(box.x + box.width).toBeLessThanOrEqual(canvas.x + canvas.width);
  expect(box.y).toBeGreaterThanOrEqual(canvas.y);
  expect(box.y + box.height).toBeLessThanOrEqual(canvas.y + canvas.height);
  expect(Math.abs(box.y - (anchor.y + anchor.height / 2))).toBeLessThan(box.height + 20);
  const before = await saved(page);
  await page.screenshot({ path: info.outputPath('anchored-menu.png'), fullPage: false });
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await trigger.press('Enter');
  await expect(menu).toBeVisible();
  await page.getByRole('button', { name: '全景', exact: true }).click();
  await expect(menu).toHaveCount(0);
  expect(await saved(page)).toEqual(before);
});

test('ramp road and vehicle joins use curved geometry without a square junction', async ({ page }, info) => {
  const { corridorExample } = await import('../../src/traffic/network/templates.js');
  await page.addInitScript(config => localStorage.setItem('crashpad:network:v1', JSON.stringify({ config })), corridorExample('merge'));
  await page.goto('/#/traffic'); await closeInspector(page);
  await page.getByRole('button', { name: '全景', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const path = await page.locator('[data-network-road-surface="ramp"]').getAttribute('d');
  expect((path.match(/L/g) || []).length).toBe(40);
  await expect(page.locator('[data-network-ramp-join]')).not.toHaveCount(0);
  await expect(page.locator('[data-network-node="section"]>rect')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('curved-ramp.png'), fullPage: false });
  await page.locator('[data-network-road="ramp"]').press('Enter');
  await expect(page.getByRole('button', { name: '删除道路 · Backspace', exact: true })).toBeVisible();
});


test('city overview hides lane labels at a uniformly reduced scale', async ({page}) => {
  const {createTrafficScenario} = await import('../../src/traffic/network/scenarios.js');
  await page.addInitScript(config => localStorage.setItem('crashpad:network:v1',JSON.stringify({config})), createTrafficScenario('city-morning'));
  await page.goto('/#/traffic'); await closeInspector(page);
  const zoom = page.getByRole('spinbutton',{name:'画布缩放',exact:true});
  await zoom.fill('15'); await zoom.press('Enter');
  await expect(page.locator('[data-network-label^="lane:"]')).toHaveCount(0);
  await expect(page.locator('[data-network-label^="node:"]').first()).toBeVisible();
});
