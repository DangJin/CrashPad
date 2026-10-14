import test from 'node:test';
import assert from 'node:assert/strict';
import { exportImage, EXPORT_PRESETS } from '../src/export.js';
import { createScene } from '../src/model.js';

test('export presets keep exact ratios and preserve full scene and long notes', () => {
  const scene = createScene(); scene.note = '<现场> & 事故说明'.repeat(80);
  const before = JSON.stringify(scene);
  for (const [preset, config] of Object.entries(EXPORT_PRESETS)) {
    const output = exportImage(scene, { preset });
    if (config.width) {
      assert.equal(output.width, config.width); assert.equal(output.height, config.height);
      if (preset === 'xiaohongshu' || preset === 'douyin') {
        assert.ok(output.svg.includes(`data-export-layout="${preset}"`));
        assert.ok(output.svg.includes('现场说明'));
        assert.ok(output.svg.includes('preserveAspectRatio="xMidYMid meet"'));
      } else {
      const [, x, y, fit] = output.svg.match(/translate\(([^ ]+) ([^)]+)\) scale\(([^)]+)\)/).map(Number);
      const sourceHeight = Number(output.svg.match(/width="880" height="(\d+)"/)[1]);
      assert.ok(x >= 31.99 && y >= 31.99);
      assert.ok(x + 880 * fit <= output.width - 31.99);
      assert.ok(y + sourceHeight * fit <= output.height - 31.99);
      }
    } else assert.equal(output.width, 1760);
    assert.ok(output.svg.includes('&lt;现场&gt; &amp;'));
    assert.ok(output.svg.includes('data-car-id="A"'));
    const hd = exportImage(scene, { preset, scale: 2 });
    assert.equal(hd.width, output.width * 2); assert.equal(hd.height, output.height * 2);
  }
  assert.equal(JSON.stringify(scene), before);
});

test('exports omit empty fields and unknown lights without hiding configured content or editing markers', () => {
  const scene = createScene(); scene.road = 'cross'; scene.note = '   \n ';
  scene.signals = { enabled: true, north: 'red', east: 'unknown', south: 'unknown', west: 'off' };
  scene.cars[0].damage = 'rear';
  for (const preset of Object.keys(EXPORT_PRESETS)) {
    const output = exportImage(scene, { preset }).svg;
    assert.ok(!output.includes('未填写') && !output.includes('未标注') && !output.includes('未注明'));
    assert.ok(!output.includes('现场说明'));
    assert.ok(!output.includes('data-signal-direction="east"'));
    assert.ok(output.includes('data-signal-direction="north"'));
    assert.ok(output.includes('data-signal-direction="west"'));
    assert.ok(output.includes('车尾'));
  }
  scene.note = '对方变道';
  const output = exportImage(scene, { preset: 'douyin' }).svg;
  assert.ok(output.includes('现场说明') && output.includes(scene.note));
});
