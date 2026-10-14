import { test, expect } from '@playwright/test';
async function seek(page, value) {
  await page.locator('#replay-progress').evaluate((el, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); }, value);
}

test('visual damage selection toggles body regions and full preview joins past and future without changing the scene', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.locator('[data-damage-part="left"]').click();
  await expect(page.locator('[data-damage-part="left"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-damage-part="left"]').click();
  await expect(page.locator('[data-damage-part="none"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-damage-part="front"]').click();
  await page.locator('[data-plan="changeRight"]').click();
  const before = await page.evaluate(() => localStorage.getItem('crashpad:draft:v1'));
  const pose = await page.locator('#scene [data-car-id="A"]').getAttribute('transform');
  await page.locator('[data-action="preview-full"]').click();
  await expect(page.locator('#replay-mode')).toHaveValue('full');
  await seek(page, '250');
  await expect(page.locator('#replay-time')).toHaveText('2.0 / 8.0 s');
  expect(await page.locator('#scene [data-car-id="A"]').getAttribute('transform')).not.toBe(pose);
  await expect(page.locator('#scene [data-plan="A"]')).toHaveCount(0);
  await seek(page, '500');
  await expect(page.locator('#scene [data-car-id="A"]')).toHaveAttribute('transform', pose);
  await seek(page, '750');
  expect(await page.locator('#scene [data-car-id="A"]').getAttribute('transform')).not.toBe(pose);
  await expect(page.locator('#scene [data-plan="A"]')).toContainText('计划向右变道');
  await seek(page, '990'); await page.locator('#replay-play').click();
  await expect(page.locator('#replay-status')).toHaveText('完整演示结束，已返回编辑');
  await expect(page.locator('#controls')).toHaveJSProperty('inert', false);
  await expect(page.locator('#scene [data-car-id="A"]')).toHaveAttribute('transform', pose);
  expect(await page.evaluate(() => localStorage.getItem('crashpad:draft:v1'))).toBe(before);
  await page.locator('[data-damage-part="front"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('visual-damage.png') });
  await page.locator('[data-action="undo"]').click();
  await expect(page.locator('[data-plan="none"]')).toHaveAttribute('aria-pressed', 'true');
});
