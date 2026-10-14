import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene, signalConfig, signalDirections, restoreScene } from '../src/model.js';
import { sceneMarkup, exportSvg } from '../src/scene.js';
import { exportImage } from '../src/export.js';

test('junction signals show only existing approaches, default to unknown and never appear on other roads', () => {
  const scene = createScene(); scene.road = 'cross';
  assert.equal((sceneMarkup(scene).match(/data-signal-direction=/g) || []).length, 4);
  assert.equal(signalConfig(scene).north, 'unknown');
  scene.road = 'tee';
  assert.deepEqual(signalDirections(scene), ['east', 'south', 'west']);
  assert.ok(!sceneMarkup(scene).includes('data-signal-direction="north"'));
  scene.road = 'straight'; assert.ok(!sceneMarkup(scene).includes('data-signal-direction'));
});

test('signal colors persist, export in all layouts and stay fixed throughout previews', () => {
  const scene = createScene(); scene.road = 'cross';
  scene.signals = { enabled: true, north: 'red', east: 'green', south: 'yellow', west: 'off' };
  assert.deepEqual(restoreScene(JSON.stringify(scene)), scene);
  assert.equal(restoreScene({ ...scene, signals: { ...scene.signals, north: 'purple' } }), null);
  for (const markup of [exportSvg(scene), exportImage(scene, { preset: 'xiaohongshu' }).svg, exportImage(scene, { preset: 'douyin' }).svg, sceneMarkup(scene, { progress: .5 })]) {
    assert.ok(markup.includes('data-signal-direction="north" data-signal-state="red"'));
    assert.ok(markup.includes('东侧来车（向西）：绿灯'));
  }
  scene.signals.enabled = false;
  assert.ok(!sceneMarkup(scene).includes('data-signal-direction'));
});

test('lights face their approaches by default and custom angles survive export and validation', () => {
  const scene = createScene(); scene.road = 'cross';
  const markup = sceneMarkup(scene);
  for (const angle of [0, 90, 180, 270]) assert.ok(markup.includes(`data-signal-angle="${angle}" transform="rotate(${angle})"`));
  scene.signals = { ...signalConfig(scene), north: 'red', angles: { north: 315 } };
  assert.deepEqual(restoreScene(JSON.stringify(scene)), scene);
  for (const preset of ['original', 'xiaohongshu', 'douyin']) assert.ok(exportImage(scene, { preset }).svg.includes('data-signal-angle="315" transform="rotate(315)"'));
  for (const angles of [{ north: -45 }, { east: 360 }, { west: NaN }, { invalid: 90 }, []]) assert.equal(restoreScene({ ...scene, signals: { ...scene.signals, angles } }), null);
});
