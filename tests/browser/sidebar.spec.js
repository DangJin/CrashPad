import { test, expect } from '@playwright/test';

test('road cards keep the same width when switching between scrolling and non-scrolling content', async ({ page }) => {
  await page.goto('/');
  if (page.viewportSize().width <= 860) await page.locator('.tool-rail [data-tool="road"]').click();
  // Force a space-consuming scrollbar, as with the system's always-visible scrollbar setting.
  await page.addStyleTag({ content: '.tool-content::-webkit-scrollbar { width: 14px; }' });
  const panel = page.locator('.tool-content');
  async function chooseRoad(road) { if (!await page.locator(`[data-road="${road}"]`).isVisible()) await page.locator('.tool-rail [data-tool="road"]').click(); await page.locator(`[data-road="${road}"]`).click(); if (page.viewportSize().width <= 860) await page.locator('.tool-rail [data-tool="road"]').click(); }
  await panel.evaluate(el => { el.style.height = '300px'; el.style.maxHeight = '300px'; });
  await chooseRoad('parking');
  const parkingHeight = await panel.evaluate(el => el.scrollHeight);
  await chooseRoad('tee');
  const teeHeight = await panel.evaluate(el => el.scrollHeight);
  expect(teeHeight).toBeGreaterThan(parkingHeight);
  await panel.evaluate((el, height) => { el.style.height = `${height}px`; el.style.maxHeight = `${height}px`; el.scrollTop = 0; }, Math.round((parkingHeight + teeHeight) / 2));
  const measure = () => page.locator('[data-road="parking"]').evaluate(el => ({ x: el.getBoundingClientRect().x, width: el.getBoundingClientRect().width }));
  await chooseRoad('parking');
  expect(await panel.evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true);
  const before = await measure();
  await chooseRoad('tee');
  expect(await panel.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  const after = await measure();
  expect(after.width).toBeCloseTo(before.width, 2);
  expect(after.x).toBeCloseTo(before.x, 2);
  expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
});
