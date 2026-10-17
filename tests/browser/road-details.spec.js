import { test, expect } from '@playwright/test';
import { corridorExample } from '../../src/traffic/network/templates.js';
import { makeExample } from '../../src/traffic/network/model.js';
for (const kind of ['merge','exit','toll','cross']) {
  test(`${kind} pavement details render and survive incomplete graph editing`, async ({ page }, info) => {
    const config=kind==='cross'?makeExample():corridorExample(kind);
    if(kind==='merge')config.nodes.push({id:'unfinished',type:'cross',x:1300,y:650,rotation:0});
    await page.addInitScript(config=>localStorage.setItem('crashpad:network:v1',JSON.stringify({config})),config);
    await page.goto('/#/traffic');
    const zoom=page.getByRole('spinbutton',{name:'画布缩放'});
    await zoom.fill('200');await zoom.press('Enter');
    if(['merge','exit'].includes(kind)){
      await expect(page.locator('[data-ramp-auxiliary]')).toHaveCount(1);
      await expect(page.locator('[data-ramp-separator]')).toHaveCount(1);
      await expect(page.locator('[data-ramp-gore]')).toHaveCount(1);
    }else if(kind==='toll')await expect(page.locator('[data-toll-island]')).toHaveCount(8);
    else await expect(page.locator('[data-crosswalk]')).toHaveCount(4);
    await page.screenshot({path:info.outputPath(`${kind}-details.png`)});
  });
}
