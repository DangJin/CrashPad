import { test, expect } from '@playwright/test';

test('a driver arriving from the right can choose a left turn and adjust its origin', async ({ page }, testInfo) => {
  await page.goto('/');
  if (page.viewportSize().width <= 860) await page.locator('.tool-rail [data-tool="road"]').click();
  await page.locator('[data-road="tee"]').click();
  if (page.viewportSize().width <= 860) await page.locator('.tool-rail [data-tool=\"cars\"]').click();
  await page.locator('[data-select="B"]').click();
  await page.locator('[data-arrival="270"]').click();
  await page.locator('[data-motion="left"]').click();
  await expect(page.locator('#route-description')).toHaveText('从右侧（东）驶来，左转后朝下方（南）。');
  const getCar = () => page.evaluate(() => JSON.parse(localStorage.getItem('crashpad:draft:v1')).cars[1]);
  expect((await getCar()).angle).toBe(180);
  await page.locator('#scene').scrollIntoViewIfNeeded();
  const start = await page.locator('[data-route="B"]').boundingBox();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 15, start.y + start.height / 2 - 10, { steps: 5 });
  await page.mouse.up();
  expect((await getCar()).motion).toBe('left');
  await expect(page.locator('[data-motion="left"]')).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: testInfo.outputPath('left-turn.png'), fullPage: true });
  await page.reload();
  if (page.viewportSize().width <= 860) await page.locator('.tool-rail [data-tool=\"cars\"]').click();
  await page.locator('[data-select="B"]').click();
  await expect(page.locator('#route-description')).toContainText('左转后朝下方（南）');
  await page.locator('[data-motion="right"]').click();
  await expect(page.locator('#route-description')).toHaveText('从右侧（东）驶来，右转后朝上方（北）。');
});
