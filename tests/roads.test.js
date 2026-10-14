import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene, restoreScene, SPECIAL_ROADS, roadConfig, withRoad, withRoadLanes, roadDescription } from '../src/model.js';
import { roadMarkup, exportSvg } from '../src/scene.js';

test('all road templates produce valid counts at the one- and six-lane boundaries', () => {
  for (const road of SPECIAL_ROADS) {
    for (let lanes = 1; lanes <= 6; lanes++) {
      const scene = withRoad({ ...createScene(), lanes }, road);
      const config = roadConfig(scene);
      assert.ok(scene.lanes >= 1 && scene.lanes <= 6);
      assert.ok(config.afterLanes >= 1 && config.afterLanes <= 6);
      if (road === 'laneDrop') assert.ok(config.afterLanes < scene.lanes);
      if (road === 'laneAdd') assert.ok(config.afterLanes > scene.lanes);
      assert.deepEqual(restoreScene(JSON.stringify(scene)), scene);
      assert.deepEqual(scene.cars, createScene().cars);
    }
  }
});
test('changing the entry lane count keeps lane increase and decrease meaningful', () => {
  const add = withRoadLanes(withRoad(createScene(), 'laneAdd'), 5);
  assert.equal(add.roadOptions.afterLanes, 6);
  const drop = withRoadLanes({ ...withRoad(createScene(), 'laneDrop'), roadOptions: { side: 'left', direction: 'east', afterLanes: 3 } }, 2);
  assert.deepEqual(drop.roadOptions, { side: 'left', direction: 'east', afterLanes: 1 });
});
test('invalid road options and reversed lane transitions do not restore', () => {
  const scene = withRoad(createScene(), 'laneAdd');
  for (const options of [null, { side: 'unknown', direction: 'north', afterLanes: 3 }, { side: 'left', direction: 'invalid', afterLanes: 3 }, { side: 'left', direction: 'east', afterLanes: 7 }, { side: 'left', direction: 'east', afterLanes: 1 }]) assert.equal(restoreScene({ ...scene, roadOptions: options }), null);
  assert.equal(restoreScene({ ...withRoad(createScene(), 'laneDrop'), roadOptions: { side: 'right', direction: 'north', afterLanes: 6 } }), null);
});
test('legacy scenes remain byte-equivalent and exports describe lane changes', () => {
  const old = createScene();
  assert.deepEqual(restoreScene(JSON.stringify(old)), old);
  const scene = withRoad({ ...old, lanes: 4 }, 'laneDrop');
  scene.roadOptions = { side: 'left', direction: 'east', afterLanes: 2 };
  assert.ok(roadDescription(scene).includes('4 → 2 车道'));
  const svg = exportSvg(scene);
  assert.ok(svg.includes('4 → 2 车道 / 左侧 / 向右 →'));
  assert.ok(svg.includes('data-road-type="laneDrop"'));
});
test('all road sides and directions render finite geometry, with distinct entry and exit shapes', () => {
  for (const road of SPECIAL_ROADS) for (const side of ['left', 'right']) for (const direction of ['north', 'east', 'south', 'west']) {
    const scene = withRoad(createScene(), road), options = { ...scene.roadOptions, side, direction };
    const svg = roadMarkup(road, scene.lanes, options);
    assert.ok(!/NaN|Infinity|undefined/.test(svg));
    assert.ok(svg.includes('fill="#e3e7ec"'));
  }
  assert.notEqual(roadMarkup('rampMerge', 2), roadMarkup('rampExit', 2));
  assert.notEqual(roadMarkup('laneAdd', 2), roadMarkup('laneDrop', 2));
});
