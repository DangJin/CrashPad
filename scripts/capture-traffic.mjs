import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { DEFAULT_CONFIG, copy } from '../src/traffic/engine.js';

// Reuse an existing local server; the isolated context never touches a user's drafts.
process.env.NO_PROXY = [process.env.NO_PROXY, '127.0.0.1', 'localhost'].filter(Boolean).join(',');
const browser = await chromium.launch({ executablePath: process.env.CRASH_PAD_BROWSER || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1050 }, deviceScaleFactor: 1 });
  await page.addInitScript(config => localStorage.setItem('crashpad:traffic:v1', JSON.stringify({ config, A: null, B: null })), copy(DEFAULT_CONFIG));
  await page.goto(`${process.env.CRASH_PAD_URL || 'http://127.0.0.1:5173'}/#/traffic/legacy`);
  await page.getByRole('button', { name: '20×', exact: true }).click();
  await page.getByRole('button', { name: '开始模拟', exact: true }).click();
  await page.waitForFunction(() => /模拟时间 [2-9]:/.test(document.querySelector('.traffic-time')?.textContent), undefined, { timeout: 15000 });
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await mkdir('docs/images', { recursive: true });
  await page.screenshot({ path: 'docs/images/traffic-lab.png', fullPage: true });
  await page.getByRole('button', { name: '方案对照', exact: true }).click();
  await page.getByRole('button', { name: '对照：全常规 vs 当前配比', exact: true }).click();
  await page.getByRole('heading', { name: '三次运行的平均结果' }).waitFor({ timeout: 20000 });
  await page.screenshot({ path: 'docs/images/traffic-comparison.png', fullPage: true });
} finally { await browser.close(); }
