import { chromium, devices } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createScene, createPlan, STORAGE_KEY } from '../src/model.js';

// Reuse an existing development server. Each capture uses an isolated draft.
process.env.NO_PROXY = [process.env.NO_PROXY, '127.0.0.1', 'localhost'].filter(Boolean).join(',');
const baseURL = process.env.CRASH_PAD_URL || 'http://127.0.0.1:5173';
const output = fileURLToPath(new URL('../docs/images/', import.meta.url));
await mkdir(output, { recursive: true });
const scene = createScene();
scene.title = '十字路口 · 双车行驶示意'; scene.road = 'cross';
scene.cars[0] = { ...scene.cars[0], x: 350, y: 360, angle: 90, damage: 'front' };
scene.cars[1] = { ...scene.cars[1], x: 460, y: 370, angle: 0, damage: 'left' };
scene.cars[1].plan = { ...createPlan(scene.cars[1], 'left', scene), bend: { x: -50, y: -145 } };
scene.signals = { enabled: true, north: 'red', east: 'green', south: 'red', west: 'green' };
scene.note = '示例：A 车直行，B 车由南侧进入路口。虚线为已行驶路线，实线为 B 车后续左转计划。';
const browser = await chromium.launch({ headless: true, ...(process.env.CRASH_PAD_BROWSER ? { executablePath: process.env.CRASH_PAD_BROWSER } : {}) });
async function open(options) {
  const context = await browser.newContext({ ...options, locale: 'zh-CN', reducedMotion: 'reduce' });
  await context.addInitScript(({ key, scene }) => { localStorage.setItem('crashpad:welcome:v1', 'seen'); localStorage.setItem(key, JSON.stringify(scene)); }, { key: STORAGE_KEY, scene });
  const page = await context.newPage(); await page.goto(baseURL);
  await page.locator('#scene').waitFor(); await page.evaluate(() => document.fonts.ready);
  return page;
}
try {
  const page = await open({ viewport: { width: 1440, height: 1080 }, deviceScaleFactor: 1 });
  await page.locator('#scene [data-car="B"]').click();
  await page.screenshot({ path: `${output}/workbench.png` });
  await page.locator('#scene [data-signal-direction="east"]').click();
  await page.screenshot({ path: `${output}/traffic-lights.png` });
  await page.locator('.app-header [data-action="preview"]').click();
  await page.locator('#export-ratio').locator('[data-value="' + 'xiaohongshu' + '"]').click();
  await page.screenshot({ path: `${output}/export-preview.png` });
  const mobile = await open({ ...devices['Pixel 7'], deviceScaleFactor: 1 });
  await mobile.screenshot({ path: `${output}/mobile.png`, fullPage: true });
  console.log('Saved four screenshots to docs/images/');
} finally { await browser.close(); }
