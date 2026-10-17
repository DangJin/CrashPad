import { test, expect } from '@playwright/test';
import { DEFAULT_CONFIG, copy } from '../../src/traffic/engine.js';

const shortConfig = () => ({ ...copy(DEFAULT_CONFIG), count: 10, demand: 120, initialLanes: 3, segments: [{ id: 'short', kind: 'straight', length: 200, change: 1, side: 'right' }] });
async function range(page, label, value) {
  await page.getByRole('slider', { name: label, exact: true }).evaluate((el, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(value)); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, value);
}
async function open(page, config = shortConfig()) {
  await page.addInitScript(config => { if (!localStorage.getItem('crashpad:traffic:v1')) localStorage.setItem('crashpad:traffic:v1', JSON.stringify({ config, A: null, B: null })); }, config);
  await page.goto('/#/traffic/legacy');
}

async function settings(page, tab) {
  await expect(page.locator('.traffic-sidebar')).toBeVisible();
  if (page.viewportSize().width <= 650) {
    const toggle = page.locator('.traffic-settings-toggle');
    await expect(toggle).toBeVisible();
    if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }
  await page.getByRole('button', { name: tab, exact: true }).click();
}
async function comparison(page) {
  await page.getByRole('button', { name: '方案对照', exact: true }).click();
}

test('separate module keeps accident draft, runs, pauses, resets and persists road assembly', async ({ page }, info) => {
  await page.goto('/');
  await page.locator('#document-title').fill('我的事故草稿'); await page.locator('#document-title').press('Tab');
  const accident = await page.evaluate(() => localStorage.getItem('crashpad:draft:v1'));
  await page.getByRole('link', { name: '车流实验室', exact: true }).click();
  await page.goto('/#/traffic/legacy');
  await expect(page.getByRole('main', { name: '车流实验室' })).toBeVisible();
  await settings(page, '道路');
  await expect(page.locator('[data-traffic-segment]')).toHaveCount(4);
  await page.getByRole('button', { name: '20×', exact: true }).click();
  await page.locator('[data-action="traffic-play"]').click();
  await expect(page.locator('[data-traffic-car]').first()).toBeVisible();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const time = await page.locator('.traffic-time').textContent();
  await page.waitForTimeout(350); await expect(page.locator('.traffic-time')).toHaveText(time);
  await page.getByRole('button', { name: '重置', exact: true }).click();
  await expect(page.locator('.traffic-time')).toContainText('0:00'); await expect(page.locator('[data-traffic-car]')).toHaveCount(0);
  await settings(page, '道路');
  await page.locator('[data-add-road="add"]').click();
  await expect(page.locator('[data-traffic-segment]')).toHaveCount(5);
  await page.getByRole('button', { name: '左侧', exact: true }).click();
  await page.reload(); await settings(page, '道路'); await expect(page.locator('[data-traffic-segment]')).toHaveCount(5);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('crashpad:traffic:v1')).config.segments.at(-1).side)).toBe('left');
  expect(await page.evaluate(() => localStorage.getItem('crashpad:draft:v1'))).toBe(accident);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth); expect(overflow).toBe(false);
  await page.screenshot({ path: info.outputPath('traffic-lab.png'), fullPage: true });
  await page.getByRole('link', { name: '现场还原', exact: true }).click();
  await expect(page.locator('#document-title')).toHaveValue('我的事故草稿');
});

test('completed traffic shows real metrics and worker comparison reports paired repeated runs', async ({ page }, info) => {
  await open(page);
  await page.getByRole('button', { name: '20×', exact: true }).click();
  await page.getByRole('button', { name: '开始模拟', exact: true }).click();
  await expect(page.getByRole('button', { name: '重新模拟', exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-overall-completed]')).toContainText('10');
  await comparison(page);
  await page.getByRole('button', { name: '对照：全常规 vs 当前配比', exact: true }).click();
  await expect(page.getByRole('heading', { name: '三次运行的平均结果' })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.traffic-comparison-results')).toContainText('A：3 车道 · 10 辆 · 保守 0% / 常规 100% / 激进 0%');
  await expect(page.locator('.traffic-comparison-results')).toContainText('B：3 车道 · 10 辆 · 保守 0% / 常规 70% / 激进 30%');
  await page.getByText('查看每次结果，避免只看平均数', { exact: true }).click();
  await expect(page.locator('.traffic-comparison-results details tbody tr')).toHaveCount(3);
  await page.screenshot({ path: info.outputPath('traffic-comparison.png'), fullPage: true });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('crashpad:traffic:v1')));
  expect(saved.A.driverMix).toEqual({ conservative: 0, normal: 100, aggressive: 0 }); expect(saved.B.driverMix.aggressive).toBe(30);
});

test('incompatible joins block starting and road ordering/removal restores a valid scene', async ({ page }) => {
  await open(page);
  await settings(page, '道路');
  await page.getByLabel('入口车道数', { exact: true }).fill('1');
  await page.locator('[data-add-road="drop"]').click();
  await expect(page.getByRole('alert')).toContainText('连接后为 0 车道');
  await expect(page.locator('[data-action="traffic-play"]')).toBeDisabled();
  await page.getByRole('button', { name: '删除路段', exact: true }).click();
  await expect(page.locator('[data-action="traffic-play"]')).toBeEnabled();
  await page.locator('[data-add-road="add"]').click();
  await page.getByRole('button', { name: '路段前移', exact: true }).click();
  await expect(page.locator('[data-traffic-segment="0"]')).toContainText('车道增加');
  await settings(page, '车流');
  await range(page, '激进型占比', 65);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('crashpad:traffic:v1')).config.driverMix.aggressive)).toBe(65);
});

test('cancelled comparison cannot publish stale results and a later run can complete', async ({ page }) => {
  await page.route('**/comparison.worker.js*', async route => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    await route.continue().catch(() => {});
  });
  await open(page);
  await comparison(page);
  await page.getByRole('button', { name: '对照：全常规 vs 当前配比', exact: true }).click();
  await page.getByRole('button', { name: '取消计算', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('对照已取消');
  await page.waitForTimeout(1200);
  await expect(page.getByRole('heading', { name: '三次运行的平均结果' })).toHaveCount(0);
  await page.getByRole('button', { name: '运行 A / B 对照', exact: true }).click();
  await expect(page.getByRole('heading', { name: '三次运行的平均结果' })).toBeVisible({ timeout: 15000 });
});

test('choose a lane, follow my car, finish with frozen personal timing and retry another lane', async ({ page }, info) => {
  await open(page);
  await page.locator('[data-player-lane="2"]').click();
  await expect(page.locator('[data-player-lane="2"]')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '20×', exact: true }).click();
  await page.getByRole('button', { name: '开始模拟', exact: true }).click();
  await expect(page.locator('[data-player-car="true"]')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('[data-player-lane="0"]')).toBeDisabled();
  await expect(page.getByRole('heading', { name: '我已到达终点', exact: true })).toBeVisible({ timeout: 15000 });
  const time = await page.locator('[data-player-time]').textContent(); expect(time).not.toBe('0:00.0');
  await page.waitForTimeout(400); await expect(page.locator('[data-player-time]')).toHaveText(time);
  await expect(page.locator('.traffic-player-history')).toContainText('入口车道 3');
  await page.screenshot({ path: info.outputPath('traffic-player.png'), fullPage: true });
  await page.locator('[data-action="player-retry"]').click();
  await page.locator('[data-player-lane="0"]').click();
  await expect(page.locator('[data-player-lane="0"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-player-time]')).toHaveCount(0);
  await expect(page.locator('.traffic-player-history')).toContainText(time);
  await comparison(page);
  await page.getByRole('button', { name: '对照：全常规 vs 当前配比', exact: true }).click();
  await expect(page.getByRole('heading', { name: '三次运行的平均结果' })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.traffic-comparison-results')).toContainText('我的总用时（已到达均值）');
});

test('default view focuses on driving while advanced controls and statistics remain reachable', async ({ page }, info) => {
  await open(page);
  await expect(page.getByRole('slider', { name: '入口流量', exact: true })).not.toBeVisible();
  await expect(page.locator('.traffic-sidebar .traffic-stats-disclosure')).toHaveCount(0);
  await expect(page.locator('.traffic-dashboard-overview')).toBeVisible();
  const laneBounds = await page.locator('[data-live-lane]').evaluateAll(rows => rows.map(row => ({ x: row.getBoundingClientRect().x, y: row.getBoundingClientRect().y })));
  expect(laneBounds[1].y).toBeGreaterThan(laneBounds[0].y);
  expect(laneBounds[1].x).toBe(laneBounds[0].x);
  if (page.viewportSize().width > 650) expect((await page.locator('.traffic-live-stats').boundingBox()).height).toBeLessThan(180);
  await page.locator('[data-action="traffic-play"]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-action="traffic-play"]')).toBeInViewport();
  const stage = await page.locator('.traffic-stage').boundingBox();
  const controls = await page.locator('.traffic-playback').boundingBox();
  const panel = await page.locator('.traffic-sidebar').boundingBox();
  expect(controls.y).toBeGreaterThanOrEqual(stage.y + stage.height - 1);
  if (page.viewportSize().width > 650) {
    expect(panel.x).toBeGreaterThan(stage.x + stage.width);
    await expect(page.getByRole('group', { name: '选择我的入口车道' })).toBeInViewport();
  } else expect(panel.y).toBeGreaterThan(controls.y);
  await page.screenshot({ path: info.outputPath('traffic-simplified.png'), fullPage: true });
  await settings(page, '车流');
  await page.getByText('高级参数', { exact: true }).click();
  await expect(page.getByRole('slider', { name: '入口流量', exact: true })).toBeVisible();
  await page.getByLabel('随机种子', { exact: true }).fill('43');
  await expect(page.locator('.traffic-sidebar .traffic-dashboard-overview')).toHaveCount(0);
  await expect(page.locator('.traffic-live-stats .traffic-dashboard-overview')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('[data-road-section="0"]').focus();
  await page.locator('[data-road-section="0"]').press('Enter');
  await expect(page.getByRole('button', { name: '道路', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('路段类型', { exact: true })).toBeVisible();
});

test('live lane figures remain on the trial ground, match road vehicles and retain a compact summary', async ({ page }, info) => {
  await open(page);
  const hud = page.locator('.traffic-live-stats');
  await expect(hud.getByRole('region', { name: '实时车道统计' })).toBeVisible();
  await page.getByRole('button', { name: '开始模拟', exact: true }).click();
  await expect.poll(async () => (await hud.locator('[data-live-count]').allTextContents()).reduce((sum, value) => sum + Number(value), 0)).toBeGreaterThan(0);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const active = (await hud.locator('[data-live-count]').allTextContents()).reduce((sum, value) => sum + Number(value), 0);
  expect(active).toBe(await page.locator('[data-traffic-car]').count());
  await expect(hud.locator('.traffic-dashboard-overview')).toContainText('待进入');
  await page.getByRole('button', { name: '继续模拟', exact: true }).click();
  await expect(hud.locator('[data-live-trend]')).toBeVisible();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const trend = await hud.locator('[data-live-trend]').getAttribute('d');
  const frozen = await hud.locator('.traffic-live-stats-body').textContent();
  await page.waitForTimeout(250); expect(await hud.locator('.traffic-live-stats-body').textContent()).toBe(frozen);
  expect(await hud.locator('[data-live-trend]').getAttribute('d')).toBe(trend);
  await page.getByRole('button', { name: '放大', exact: true }).click();
  await page.locator('.traffic-canvas-scroll').evaluate(el => { el.scrollLeft = 150; });
  await expect(hud).toBeVisible();
  const bounds = await hud.boundingBox(), stage = await page.locator('.traffic-stage').boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(stage.x); expect(bounds.x + bounds.width).toBeLessThanOrEqual(stage.x + stage.width);
  await page.screenshot({ path: info.outputPath('traffic-live-stats.png'), fullPage: true });
  await hud.locator('summary').click(); await expect(hud.locator('.traffic-live-stats-body')).not.toBeVisible();
  await expect(hud.getByRole('img', { name: '在途车辆平均速度趋势' })).not.toBeVisible();
  await expect(hud.locator('summary')).toContainText('均速');
  await expect(hud.locator('summary')).toContainText('排队');
  await expect(hud.locator('.traffic-dashboard-overview')).toBeVisible();
  await expect(hud.locator('.traffic-dashboard-extra').first()).not.toBeVisible();
  await page.getByRole('button', { name: '重置', exact: true }).click();
  await hud.locator('summary').click();
  expect(await hud.locator('[data-live-count]').allTextContents()).toEqual(['0', '0', '0']);
  expect(await hud.locator('[data-live-speed]').allTextContents()).toEqual(['—', '—', '—']);
  await expect(hud.locator('[data-live-trend]')).toHaveCount(0);
  await expect(hud.locator('.traffic-live-trend-heading')).toContainText('运行后显示');
});


test('selecting road sections or vehicles swaps the inspector without scrolling through tracking', async ({ page }, info) => {
  await open(page, { ...shortConfig(), segments: [{ id: 'a', kind: 'straight', length: 200, side: 'right', change: 1 }, { id: 'b', kind: 'drop', length: 200, side: 'right', change: 1 }] });
  await page.locator('[data-player-lane="1"]').click();
  await page.getByRole('button', { name: '开始模拟', exact: true }).click();
  await expect(page.locator('[data-traffic-car]').first()).toBeVisible();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.locator('[data-road-section="1"]').focus();
  await page.locator('[data-road-section="1"]').press('Enter');
  await expect(page.locator('.traffic-property-heading')).toContainText('路段 2');
  await expect(page.locator('.traffic-player-panel')).toHaveCount(0);
  await expect(page.getByRole('slider', { name: '路段长度', exact: true })).toHaveValue('200');
  await expect(page.getByRole('group', { name: '车道变化侧' })).toBeVisible();
  await expect(page.locator('[data-road-section="1"]')).toHaveAttribute('aria-pressed', 'true');
  if (page.viewportSize().width > 650) {
    await expect(page.getByRole('slider', { name: '路段长度', exact: true })).toBeInViewport();
    expect(await page.locator('#traffic-settings-content').evaluate(el => el.scrollTop)).toBe(0);
  }
  await page.screenshot({ path: info.outputPath('traffic-contextual-road.png'), fullPage: true });
  await page.locator('[data-traffic-car]').first().focus();
  await page.locator('[data-traffic-car]').first().press('Enter');
  await expect(page.locator('.traffic-property-heading')).toContainText('车辆信息');
  await expect(page.locator('.traffic-selected-car')).toBeVisible();
  await expect(page.getByRole('slider', { name: '路段长度', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '跟车', exact: true }).click();
  await expect(page.locator('[data-player-lane="1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-player-lane="1"]')).toBeDisabled();
});


test('my driving style persists, locks during a run and keeps separate comparison records', async ({ page }, info) => {
  await open(page);
  await page.locator('[data-player-lane="1"]').click();
  await page.getByRole('button', { name: '常规型', exact: true }).click();
  expect((await page.getByRole('checkbox', { name: '允许主动变道', exact: true }).boundingBox()).width).toBeLessThanOrEqual(20);
  await page.getByRole('checkbox', { name: '允许主动变道', exact: true }).check();
  await expect(page.locator('[data-driving-style="normal"]')).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByRole('checkbox', { name: '允许主动变道', exact: true })).toBeChecked();
  await expect(page.locator('[data-driving-style="normal"]')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '20×', exact: true }).click();
  await page.getByRole('button', { name: '开始模拟', exact: true }).click();
  await expect(page.locator('[data-driving-style="aggressive"]')).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: '允许主动变道', exact: true })).toBeDisabled();
  await expect(page.getByRole('heading', { name: '我已到达终点', exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.traffic-player-history')).toContainText('常规型');
  await expect(page.locator('.traffic-player-strategy')).toContainText('主动变道');
  await page.locator('[data-action="player-retry"]').click();
  await page.getByRole('button', { name: '激进型', exact: true }).click();
  await page.getByRole('button', { name: '开始模拟', exact: true }).click();
  await expect(page.getByRole('heading', { name: '我已到达终点', exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.traffic-player-history')).toContainText('常规型');
  await expect(page.locator('.traffic-player-history')).toContainText('激进型');
  await expect(page.locator('.traffic-player-history>div>span')).toHaveCount(2);
  await page.locator('[data-action="player-retry"]').click();
  await page.getByRole('checkbox', { name: '允许主动变道', exact: true }).uncheck();
  await page.getByRole('button', { name: '开始模拟', exact: true }).click();
  await expect(page.getByRole('heading', { name: '我已到达终点', exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.traffic-player-history>div>span')).toHaveCount(3);
  await expect(page.locator('.traffic-player-history')).toContainText('激进型 · 保持车道');
  await page.screenshot({ path: info.outputPath('traffic-driving-style.png'), fullPage: true });
});


test('saved legacy styles retain their strategy after the inspector loads', async ({ page }) => {
  const config = { ...shortConfig(), playerLane: 0, playerStyle: 'steady' }; delete config.playerLaneChanges;
  await open(page, config);
  await expect(page.locator('[data-driving-style="conservative"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('checkbox', { name: '允许主动变道', exact: true })).toBeChecked();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('crashpad:traffic:v1')).config.playerStyle)).toBe('conservative');
  await page.reload();
  await expect(page.locator('[data-driving-style="conservative"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('checkbox', { name: '允许主动变道', exact: true })).toBeChecked();
});


test('population mix totals 100, previews exact counts and persists independently of my style', async ({ page }, info) => {
  await open(page);
  await page.locator('[data-player-lane="1"]').click();
  await page.getByRole('button', { name: '激进型', exact: true }).click();
  await settings(page, '车流');
  await range(page, '保守型占比', 40);
  await range(page, '激进型占比', 25);
  const values = await page.locator('.traffic-population input[type="range"]').evaluateAll(inputs => inputs.map(input => Number(input.value)));
  expect(values.reduce((sum, value) => sum + value, 0)).toBe(100);
  expect(values[0]).toBeGreaterThan(0); expect(values[2]).toBe(25);
  const counts = (await page.locator('.traffic-mix-counts span').allTextContents()).map(text => Number(text.match(/(\d+) 辆/)[1]));
  expect(counts.reduce((sum, value) => sum + value, 0)).toBe(9);
  await expect(page.locator('.traffic-population')).toContainText('我的风格单独设置');
  await page.screenshot({ path: info.outputPath('traffic-driver-mix.png'), fullPage: true });
  await page.reload(); await settings(page, '车流');
  expect(await page.locator('.traffic-population input[type="range"]').evaluateAll(inputs => inputs.map(input => Number(input.value)))).toEqual(values);
  await page.getByRole('button', { name: '跟车', exact: true }).click();
  await expect(page.locator('[data-driving-style="aggressive"]')).toHaveAttribute('aria-pressed', 'true');
  await comparison(page);
  await page.getByRole('button', { name: '对照：全常规 vs 当前配比', exact: true }).click();
  await expect(page.getByRole('heading', { name: '三次运行的平均结果' })).toBeVisible({ timeout: 15000 });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('crashpad:traffic:v1')));
  expect(saved.A.driverMix).toEqual({ conservative: 0, normal: 100, aggressive: 0 });
  expect(Object.values(saved.B.driverMix)).toEqual(values);
  expect(saved.A.playerStyle).toBe('aggressive'); expect(saved.B.playerStyle).toBe('aggressive');
});

test('visible ramps and traffic lights have contextual settings, animate and persist', async ({ page }, info) => {
  const config = { ...shortConfig(), count: 12, segments: [
    { id: 'entry', kind: 'merge', length: 200, side: 'right', change: 1, rampCount: 3, rampFlow: 60 },
    { id: 'exit', kind: 'exit', length: 250, side: 'right', change: 1, exitPercent: 40 },
    { id: 'signal', kind: 'straight', length: 200, side: 'right', change: 1, signal: { enabled: true, green: 5, red: 10, start: 'red' } },
  ] };
  await open(page, config);
  await expect(page.locator('[data-ramp-road]')).toHaveCount(2);
  await expect(page.locator('[data-traffic-signal="2"]')).toHaveAttribute('data-signal-color', 'red');
  await page.locator('[data-ramp-road="merge"]').focus(); await page.locator('[data-ramp-road="merge"]').press('Enter');
  await expect(page.getByRole('slider', { name: '汇入车辆数', exact: true })).toHaveValue('3');
  await expect(page.locator('.traffic-player-panel')).toHaveCount(0);
  await page.locator('[data-traffic-signal="2"]').focus(); await page.locator('[data-traffic-signal="2"]').press('Enter');
  await expect(page.getByRole('checkbox', { name: '路段红绿灯', exact: true })).toBeChecked();
  await expect(page.getByRole('slider', { name: '红灯时长', exact: true })).toHaveValue('10');
  await page.getByRole('button', { name: '开始模拟', exact: true }).click();
  await expect(page.locator('[data-ramp-car="entry"]').first()).toBeVisible();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.screenshot({ path: info.outputPath('traffic-ramps-signals.png'), fullPage: true });
  await page.getByRole('button', { name: '20×', exact: true }).click();
  await page.getByRole('button', { name: '继续模拟', exact: true }).click();
  await expect(page.locator('[data-traffic-signal="2"]')).toHaveAttribute('data-signal-color', 'green', { timeout: 10000 });
  await expect(page.getByRole('button', { name: '重新模拟', exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.locator('[data-overall-completed]')).toHaveText('12 / 12');
  await expect(page.locator('.traffic-dashboard-behavior')).toContainText('匝道驶出');
  await page.reload();
  await expect(page.locator('[data-ramp-road]')).toHaveCount(2);
  await expect(page.locator('[data-traffic-signal="2"]')).toHaveAttribute('data-signal-color', 'red');
  await expect(page.locator('.traffic-time')).toContainText('0:00');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test('left and right merge ramps have smooth joins, external labels and bounded focus feedback', async ({ page }, info) => {
  const config = { ...shortConfig(), count: 15, segments: [{ id: 'left', kind: 'merge', length: 250, side: 'left', change: 1, rampCount: 3, rampFlow: 60 }, { id: 'right', kind: 'merge', length: 250, side: 'right', change: 1, rampCount: 3, rampFlow: 60 }, { id: 'end', kind: 'straight', length: 200, side: 'right', change: 1 }] };
  await open(page, config);
  const ramps = page.locator('[data-ramp-road]');
  await expect(ramps).toHaveCount(2);
  for (let index = 0; index < 2; index++) {
    const path = await ramps.nth(index).locator('.traffic-ramp-border').getAttribute('d');
    expect(path).toContain('Q'); expect(path).not.toContain('L');
    await ramps.nth(index).focus(); await ramps.nth(index).press('Enter');
    expect(await ramps.nth(index).evaluate(el => getComputedStyle(el).outlineStyle)).toBe('none');
    const label = await page.locator(`[data-ramp-label="${index}"]`).boundingBox();
    const sourceY = await ramps.nth(index).locator('.traffic-ramp-border').evaluate(path => { const source = path.getPointAtLength(0), matrix = path.getScreenCTM(); return source.x * matrix.b + source.y * matrix.d + matrix.f; });
    if (index === 0) expect(label.y + label.height).toBeLessThan(sourceY - 30);
    else expect(label.y).toBeGreaterThan(sourceY + 30);
  }
  await expect(page.locator('[data-main-road-edge]')).toHaveAttribute('mask', 'url(#traffic-main-road-edge)');
  await page.screenshot({ path: info.outputPath('traffic-smooth-ramps.png'), fullPage: true });
  await page.getByRole('button', { name: '开始模拟', exact: true }).click();
  await page.getByRole('button', { name: '5×', exact: true }).click();
  await expect(page.locator('[data-ramp-merging="true"]').first()).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.screenshot({ path: info.outputPath('traffic-smooth-merging.png'), fullPage: true });
});


test('inspector controls fit and Backspace deletes selected objects without affecting text edits', async ({ page }, info) => {
  await open(page, copy(DEFAULT_CONFIG));
  await settings(page, '车流');
  const panel = await page.locator('.traffic-sidebar').boundingBox();
  if (page.viewportSize().width > 650) expect(panel.width).toBeGreaterThanOrEqual(320);
  for (const slider of await page.locator('.traffic-sidebar input[type=range]').all()) {
    const bounds = await slider.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(panel.x);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(panel.x + panel.width);
  }
  await page.screenshot({ path: info.outputPath('traffic-inspector.png'), fullPage: true });
  await settings(page, '道路');
  const number = page.getByRole('spinbutton', { name: '入口车道数', exact: true });
  await number.focus(); await number.press('Backspace');
  await expect(page.locator('[data-traffic-segment]')).toHaveCount(4);
  await number.fill('3');
  await page.locator('[data-road-section="1"]').focus();
  await page.locator('[data-road-section="1"]').press('Enter');
  await page.keyboard.press('Backspace');
  await expect(page.locator('[data-traffic-segment]')).toHaveCount(3);
  await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
  await expect(page.locator('[data-traffic-segment]')).toHaveCount(1);
  await page.goto('/');
  const cars = page.locator('#scene [data-car]');
  const count = await cars.count();
  await page.locator('#document-title').fill('测试标题');
  await page.locator('#document-title').press('Backspace');
  await expect(cars).toHaveCount(count);
  await cars.first().click(); await page.keyboard.press('Backspace');
  await expect(cars).toHaveCount(count - 1);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(cars).toHaveCount(count);
});


test('toll road supports ETC and manual booth settings and persists them', async ({ page }) => {
  await open(page);
  await settings(page, '道路');
  await page.locator('[data-add-road="toll"]').click();
  await expect(page.locator('[data-toll-type="etc"]')).toHaveCount(3);
  await page.getByRole('group', { name: '收费车道 2', exact: true }).getByRole('button', { name: '人工', exact: true }).click();
  await expect(page.locator('[data-toll-type="manual"]')).toHaveCount(1);
  await range(page, '人工处理时间', 20);
  await page.reload();
  await expect(page.locator('[data-toll-type="manual"]')).toHaveCount(1);
  await page.locator('[data-toll-station]').click();
  await expect(page.getByRole('slider', { name: '人工处理时间', exact: true })).toHaveValue('20');
});


test('pocket plaza exposes independent eight booths and four exit lanes', async ({ page }, info) => {
  const config = shortConfig(); config.initialLanes = 4; config.segments = [{ id: 'plaza', kind: 'toll', length: 600, side: 'right', change: 1, tollBooths: 8, tollExitLanes: 4 }];
  await open(page, config); await settings(page, '道路');
  await expect(page.locator('[data-toll-type="etc"]')).toHaveCount(8);
  await expect(page.getByRole('slider', { name: '收费窗口数', exact: true })).toHaveValue('8');
  await expect(page.getByRole('slider', { name: '出口车道数', exact: true })).toHaveValue('4');
  await page.getByRole('group', { name: '收费车道 8', exact: true }).getByRole('button', { name: '人工', exact: true }).click();
  await expect(page.locator('[data-toll-type="manual"]')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath('traffic-pocket-toll.png'), fullPage: true });
  await page.reload(); await expect(page.locator('[data-toll-type]')).toHaveCount(8);
});
