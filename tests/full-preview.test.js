import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene, createPlan, carAtFullProgress, carAtProgress, carAtPlannedProgress } from '../src/model.js';
import { sceneMarkup } from '../src/scene.js';

test('complete previews continuously join actual arrival and future actions without mutating saved geometry', () => {
  const scene = createScene(); const car = scene.cars[0]; car.plan = createPlan(car, 'changeRight', scene);
  const before = JSON.stringify(scene);
  assert.deepEqual(carAtFullProgress(car, .25), carAtProgress(car, .5));
  assert.deepEqual(carAtFullProgress(car, .5), car);
  assert.deepEqual(carAtFullProgress(car, .75), carAtPlannedProgress(car, .5));
  const near = carAtFullProgress(car, .500001);
  assert.ok(Math.hypot(near.x - car.x, near.y - car.y) < .001);
  assert.ok(!sceneMarkup(scene, { replayMode: 'full', progress: .25 }).includes('data-plan="A"'));
  assert.ok(sceneMarkup(scene, { replayMode: 'full', progress: .75 }).includes('data-plan="A"'));
  assert.equal(JSON.stringify(scene), before);
});
