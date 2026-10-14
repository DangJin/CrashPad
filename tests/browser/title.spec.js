import { test, expect } from '@playwright/test';

test('document title is editable, saved, undoable and used in every export', async ({ page }, testInfo) => {
  await page.goto('/');
  const title = page.getByRole('textbox', { name: '示意图标题', exact: true });
  await expect(title).toBeVisible();
  await expect(title).toHaveAttribute('placeholder', '未命名示意图');
  await title.fill('主路与右侧匝道汇入事故'); await title.press('Enter');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('crashpad:draft:v1')).title)).toBe('主路与右侧匝道汇入事故');
  await page.locator('[data-action="undo"]').click(); await expect(title).toHaveValue('');
  await page.locator('[data-action="redo"]').click(); await expect(title).toHaveValue('主路与右侧匝道汇入事故');
  await page.reload(); await expect(title).toHaveValue('主路与右侧匝道汇入事故');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('editable-title.png') });
  await page.locator('.app-header [data-action="preview"]').click();
  for (const preset of ['original', 'xiaohongshu', 'douyin']) {
    await page.locator('#export-ratio').locator('[data-value="' + preset + '"]').click();
    await expect(page.locator('#preview-image')).toContainText('主路与右侧匝道汇入事故');
  }
  const event = page.waitForEvent('download'); await page.locator('#download').click();
  expect((await event).suggestedFilename()).toContain('主路与右侧匝道汇入事故');
  await page.locator('#back-edit').click();
  await title.fill(''); await title.press('Enter');
  await page.locator('.app-header [data-action="preview"]').click();
  await expect(page.locator('#preview-image')).toContainText('当时是这么回事，大家给评评理');
});

test('long titles wrap without colliding with metadata or leaving the image', async ({ page }) => {
  await page.goto('/');
  await page.locator('#document-title').fill('主路与右侧匝道汇入事故现场情况记录及双方车辆碰撞时的位置和后续行驶方向'.repeat(2).slice(0, 60));
  await page.locator('.app-header [data-action="preview"]').click();
  for (const preset of ['original', 'xiaohongshu', 'douyin']) {
    await page.locator('#export-ratio').locator('[data-value="' + preset + '"]').click();
    const result = await page.locator('#preview-image > svg').evaluate(svg => {
      const texts = [...svg.querySelectorAll('text')].filter(t => ['64', '72', '48', '52', '27'].includes(t.getAttribute('font-size')));
      const metadata = [...svg.querySelectorAll('text')].find(t => t.textContent.includes('直路 /'));
      return { count: texts.length, bottom: Math.max(...texts.map(t => t.getBoundingClientRect().bottom)), metaTop: metadata.getBoundingClientRect().top };
    });
    expect(result.count).toBeGreaterThan(1);
    expect(result.bottom).toBeLessThan(result.metaTop);
  }
});
