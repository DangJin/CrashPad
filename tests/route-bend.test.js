import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene, pathFor, samplePath, setRouteBend, restoreScene, withMotion, moveCar, carAtProgress } from '../src/model.js';
import { sceneMarkup, exportSvg } from '../src/scene.js';

test('actual route midpoint handle edits quadratic and cubic paths and persists without changing endpoints', () => {
  for (const motion of ['straight', 'left', 'changeLeft', 'mergeLeft']) {
    const scene = createScene(), car = { ...scene.cars[0], motion };
    const before = pathFor(car), mid = samplePath(before, .5), target = { x: mid.x + 12, y: mid.y - 8 };
    const next = setRouteBend(car, target), after = pathFor(next), result = samplePath(after, .5);
    assert.ok(Math.abs(result.x - target.x) < .001 && Math.abs(result.y - target.y) < .001);
    assert.deepEqual(after.start, before.start); assert.deepEqual(after.end, before.end);
    scene.cars[0] = next; assert.deepEqual(restoreScene(scene).cars[0].routeBend, next.routeBend);
    assert.notEqual(carAtProgress(next, .5).x, carAtProgress(car, .5).x);
    assert.ok(sceneMarkup(scene, { interactive: true, selected: 'A' }).includes('data-route-bend="A"'));
    assert.ok(!exportSvg(scene).includes('data-route-bend'));
    assert.equal(withMotion(next, 'straight').routeBend, null);
    const moved = moveCar(next, next.x + 10, next.y);
    assert.ok(Math.abs(pathFor(moved).control.x - after.control.x - 10) < .001);
  }
});

test('invalid bend data is rejected and stationary participants have no curve', () => {
  const scene = createScene(); scene.cars[0].routeBend = { x: NaN, y: 4 }; assert.equal(restoreScene(scene), null);
  const car = { ...createScene().cars[0], motion: 'stopped' }; assert.equal(setRouteBend(car, { x: 4, y: 5 }), car);
});
