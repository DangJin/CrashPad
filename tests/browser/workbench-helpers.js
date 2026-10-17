export async function openInspector(page) {
  await page.locator('.network-sidebar, .properties-panel').first().waitFor({ state: 'attached' });
  const toggle = page.getByRole('button', { name: /^(属性与设置|属性与说明)$/ });
  if (await toggle.isVisible()) await toggle.click();
}
export async function choosePreset(page, name) {
  const presets = page.locator('.network-scenarios');
  if (!(await presets.getAttribute('open') !== null)) await presets.locator(':scope > summary').click();
  if (!await presets.getByRole('button', { name, exact: true }).isVisible()) await presets.getByRole('button',{name:'基础路型',exact:true}).click();
  await presets.getByRole('button', { name, exact: true }).click();
  if (await presets.getAttribute('open') !== null) await presets.locator(':scope > summary').click();
  await openInspector(page);
}
export async function closeInspector(page) {
  const toggle = page.getByRole('button', { name: /^(收起设置|收起属性)$/ });
  if (await toggle.isVisible()) await toggle.click();
}
export async function chooseTool(page, name) {
  const palette = page.locator('.network-palette');
  const button = palette.getByRole('button', { name, exact: true });
  const group = palette.locator('details').filter({ has: page.getByRole('button', { name, exact: true, includeHidden: true }) });
  if (await group.getAttribute('open') === null) await group.locator(':scope > summary').click();
  await button.click();
  if (page.viewportSize().width <= 650 && await group.getAttribute('open') !== null) await group.locator(':scope > summary').click();
}
export async function canvasPoint(page, selector, { margin = 50 } = {}) {
  await page.locator('[data-network-canvas]').scrollIntoViewIfNeeded();
  const point = await page.evaluate(({ selector, margin }) => {
    const canvas = document.querySelector('[data-network-canvas] svg').getBoundingClientRect();
    for (let y = Math.max(0, canvas.top) + margin; y < Math.min(innerHeight, canvas.bottom) - margin; y += 8) {
      for (let x = Math.max(0, canvas.left) + Math.max(25, margin); x < Math.min(innerWidth, canvas.right) - Math.max(25, margin); x += 8) {
        const hit = document.elementFromPoint(x,y);
        if (hit?.closest(selector) && !hit.closest('[data-network-port]')) return {x,y};
      }
    }
    return null;
  }, { selector, margin });
  if (!point) throw new Error(`No visible pointer target for ${selector}`);
  return point;
}
