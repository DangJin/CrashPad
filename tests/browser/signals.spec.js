import { test, expect } from '@playwright/test';

test('junction light colors can be configured, undone, saved and exported', async ({ page }, testInfo) => {
  await page.goto('/');
  if (page.viewportSize().width <= 860) await page.locator('.tool-rail [data-tool="road"]').click();
  await page.locator('[data-road="cross"]').click();
  await expect(page.locator('.tool-content [data-signal]')).toHaveCount(0);
  await expect(page.locator('#controls #signals-enabled')).toBeVisible();
  await expect(page.locator('#scene [data-signal-direction]')).toHaveCount(4);
  await page.locator('#scene [data-signal-direction="north"]').click();
  await expect(page.locator('#controls h2')).toHaveText('北侧红绿灯');
  await page.locator('[data-signal="north"][data-state="red"]').click();
  await page.locator('#scene [data-signal-direction="east"]').click();
  await page.locator('[data-signal="east"][data-state="green"]').click();
  await expect(page.locator('#scene [data-signal-direction="east"]')).toHaveAttribute('data-signal-state', 'green');
  await page.locator('[data-action="undo"]').click();
  await expect(page.locator('#scene [data-signal-direction="east"]')).toHaveAttribute('data-signal-state', 'unknown');
  await page.locator('[data-action="redo"]').click();
  await expect(page.locator('[data-signal="east"][data-state="green"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#scene').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('junction-signals.png') });
  await page.reload();
  await expect(page.locator('#scene [data-signal-direction="north"]')).toHaveAttribute('data-signal-state', 'red');
  await page.locator('.app-header [data-action="preview"]').click();
  for (const preset of ['original', 'xiaohongshu', 'douyin']) {
    await page.locator('#export-ratio').locator('[data-value="' + preset + '"]').click();
    await expect(page.locator('#preview-image [data-signal-direction="east"]')).toHaveAttribute('data-signal-state', 'green');
  }
  await page.locator('#back-edit').click();
  if (page.viewportSize().width <= 860) await page.locator('.tool-rail [data-tool="road"]').click();
  await page.locator('[data-road="tee"]').click();
  await expect(page.locator('#scene [data-signal-direction]')).toHaveCount(3);
  await expect(page.locator('#scene [data-signal-direction="north"]')).toHaveCount(0);
  await page.locator('#signals-enabled').uncheck();
  await expect(page.locator('#scene [data-signal-direction]')).toHaveCount(0);
  await page.locator('#signals-enabled').check();
  await expect(page.locator('#scene [data-signal-direction="east"]')).toHaveAttribute('data-signal-state', 'green');
  if (page.viewportSize().width <= 860) await page.locator('.tool-rail [data-tool="road"]').click();
  await page.locator('[data-road="straight"]').click();
  await expect(page.locator('#scene [data-signal-direction]')).toHaveCount(0);
});

test('road, traffic lights and vehicles share the right property inspector', async ({ page }) => {
  await page.goto('/');
  await page.locator('.tool-rail [data-tool="road"]').click();
  await page.locator('[data-road="cross"]').click();
  await expect(page.locator('#controls h2')).toHaveText('十字路口');
  await expect(page.locator('.tool-content [data-lanes]')).toHaveCount(0);
  await page.locator('#controls [data-lanes="3"]').click();
  await page.locator('#scene [data-signal-direction="south"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#controls h2')).toHaveText('南侧红绿灯');
  await expect(page.locator('#scene [data-signal-direction="south"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#scene [data-car="A"]').click();
  await expect(page.locator('#controls h2')).toHaveText('我的车');
  await expect(page.locator('#angle')).toBeVisible();
  await page.locator('#scene').scrollIntoViewIfNeeded();
  const roadPoint = await page.locator('#scene').evaluate(svg => { const p = new DOMPoint(400, 550).matrixTransform(svg.getScreenCTM()); return { x: p.x, y: p.y }; });
  await page.mouse.click(roadPoint.x, roadPoint.y);
  await expect(page.locator('#controls h2')).toHaveText('十字路口');
});

test('traffic lights rotate for each approach and allow manual orientation in the inspector', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.locator('.tool-rail [data-tool="road"]').click();
  await page.locator('[data-road="cross"]').click();
  await expect(page.locator('#scene [data-signal-direction="east"] [data-signal-angle]')).toHaveAttribute('transform', 'rotate(90)');
  await expect(page.locator('#scene [data-signal-direction="south"] [data-signal-angle]')).toHaveAttribute('transform', 'rotate(180)');
  await page.locator('#scene [data-signal-direction="east"]').click();
  await page.locator('[data-signal="east"][data-state="green"]').click();
  await page.locator('[data-signal-facing="0"]').click();
  await expect(page.locator('#scene [data-signal-direction="east"] [data-signal-angle]')).toHaveAttribute('transform', 'rotate(0)');
  await page.locator('[data-action="undo"]').click();
  await expect(page.locator('#scene [data-signal-direction="east"] [data-signal-angle]')).toHaveAttribute('transform', 'rotate(90)');
  await page.locator('#signal-angle').fill('-45');
  await expect(page.locator('#scene [data-signal-direction="east"] [data-signal-angle]')).toHaveAttribute('transform', 'rotate(315)');
  await page.screenshot({ path: testInfo.outputPath('signal-orientation.png'), fullPage: true });
  await page.reload();
  await expect(page.locator('#scene [data-signal-direction="east"] [data-signal-angle]')).toHaveAttribute('transform', 'rotate(315)');
  await page.locator('.app-header [data-action="preview"]').click();
  await page.locator('#export-ratio').locator('[data-value="' + 'douyin' + '"]').click();
  await expect(page.locator('#preview-image [data-signal-direction="east"] [data-signal-angle]')).toHaveAttribute('transform', 'rotate(315)');
  await page.locator('#back-edit').click();
  await page.locator('#scene [data-signal-direction="east"]').click();
  await page.locator('[data-action="reset-signal-angle"]').click();
  await expect(page.locator('#signal-angle')).toHaveValue('90');
  await expect(page.locator('#scene [data-signal-direction="east"]')).toHaveAttribute('data-signal-state', 'green');
});
