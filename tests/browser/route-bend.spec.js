import { test, expect } from '@playwright/test';

test('drag actual route curve handle, undo and persist on reload', async ({ page }) => {
  await page.goto('/');
  const handle = page.locator('#scene [data-route-bend="A"]');
  await handle.scrollIntoViewIfNeeded();
  const before = await page.locator('#scene').evaluate(el => el.innerHTML);
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 22, box.y + box.height / 2 - 15, { steps: 6 }); await page.mouse.up();
  const bend = await page.evaluate(() => JSON.parse(localStorage.getItem('crashpad:draft:v1')).cars[0].routeBend);
  expect(bend).toBeTruthy();
  expect(await page.locator('#scene').evaluate(el => el.innerHTML)).not.toBe(before);
  await page.locator('[data-action="undo"]').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('crashpad:draft:v1')).cars[0].routeBend)).toBeUndefined();
  await page.locator('[data-action="redo"]').click(); await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('crashpad:draft:v1')).cars[0].routeBend)).toEqual(bend);
  await expect(handle).toBeVisible();
});
