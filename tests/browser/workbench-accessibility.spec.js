import { test, expect } from '@playwright/test';
import { openInspector } from './workbench-helpers.js';

async function assertViewport(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function tabTo(page, target, limit = 35) {
  for (let i=0;i<limit;i++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate(element=>element===document.activeElement)) return;
  }
  throw new Error('Expected control was not reachable with keyboard Tab navigation');
}
async function assertVisibleFocus(control) {
  await expect(control).toBeFocused();
  expect(await control.evaluate(element => {
    const style=getComputedStyle(element);
    const rect=element.getBoundingClientRect();
    return element.matches(':focus-visible') && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth)>=2
      && style.outlineColor !== 'transparent' && style.outlineColor !== 'rgba(0, 0, 0, 0)'
      && rect.right>0 && rect.left<innerWidth && rect.bottom>0 && rect.top<innerHeight;
  })).toBe(true);
}

test('320px scene workbench keeps title keyboard-accessible with reduced motion and an expanded inspector', async ({page},info) => {
  await page.setViewportSize({width:320,height:720});
  await page.emulateMedia({reducedMotion:'reduce'});
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  const title=page.getByRole('textbox',{name:'示意图标题',exact:true});
  await expect(title).toBeVisible();
  await tabTo(page,title); await assertVisibleFocus(title);
  await page.keyboard.type('Keyboard title'); await page.keyboard.press('Enter');
  await expect(title).toHaveValue('Keyboard title');
  await openInspector(page);
  await assertViewport(page);
  expect((await page.locator('#scene').boundingBox()).height).toBeGreaterThanOrEqual(160);
  expect(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({path:info.outputPath('scene-320-accessibility.png'),fullPage:true});
});

test('320px network workbench keeps settings keyboard focus visible and canvas usable', async ({page},info) => {
  await page.setViewportSize({width:320,height:720});
  await page.emulateMedia({reducedMotion:'reduce'});
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/#/traffic');
  const settings=page.getByRole('group',{name:'实验设置',exact:true}).getByRole('button',{name:'对象属性',exact:true});
  await expect(settings).toBeVisible();
  await tabTo(page,settings); await assertVisibleFocus(settings);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox',{name:'对象名称',exact:true})).toBeVisible();
  await assertViewport(page);
  expect((await page.locator('[data-network-canvas]').boundingBox()).height).toBeGreaterThanOrEqual(160);
  expect(errors).toEqual([]);
  await page.screenshot({path:info.outputPath('network-320-accessibility.png'),fullPage:true});
});
