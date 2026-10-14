import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene, restoreScene, participantColor, participantPaintColor, carAtProgress } from '../src/model.js';
import { exportImage, EXPORT_PRESETS } from '../src/export.js';
import { participantGlyph } from '../src/participants.js';

test('custom paint persists, animates and exports while light paint keeps readable accents', () => {
  const scene = createScene();
  assert.equal(participantColor(scene.cars[0]), '#245bdb');
  for (const color of ['#913ace', '#ffffff', '#E8B638']) {
    scene.cars[0].color = color;
    assert.equal(restoreScene(scene).cars[0].color, color);
    assert.equal(participantPaintColor(carAtProgress(scene.cars[0], .5)), color.toLowerCase());
    assert.ok(participantGlyph(scene.cars[0]).includes(`fill="${color.toLowerCase()}"`));
    for (const preset of Object.keys(EXPORT_PRESETS)) assert.ok(exportImage(scene, { preset }).svg.includes(`fill="${color.toLowerCase()}"`));
  }
  scene.cars[0].color = '#ffffff'; assert.notEqual(participantColor(scene.cars[0]), '#ffffff');
  for (const color of ['red', '#fff', '#zzzzzz', '"><script>', null, 123]) { scene.cars[0].color = color; assert.equal(restoreScene(scene), null); }
});
