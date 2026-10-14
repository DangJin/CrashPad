import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene, createPlan, setPlanPoint, pathFor, plannedPathFor, samplePath, carAtProgress, carAtPlannedProgress, withMotion, restoreScene, LATERAL_MOTIONS, PLAN_ACTIONS } from '../src/model.js';
import { exportSvg } from '../src/scene.js';

test('actual lane changes and merges end at the authored pose in every heading', () => {
  for (const angle of [0, 90, 180, 270]) for (const motion of LATERAL_MOTIONS) {
    const car = withMotion({ ...createScene().cars[0], x: 400, y: 300, angle }, motion);
    const path = pathFor(car), end = samplePath(path, 1);
    assert.ok(path.control2);
    assert.deepEqual({ x: end.x, y: end.y }, { x: car.x, y: car.y });
    assert.deepEqual(carAtProgress(car, 1), car);
    assert.equal(car.angle, angle);
    const r = -angle * Math.PI / 180, dx = path.start.x - car.x, dy = path.start.y - car.y;
    const relativeX = dx * Math.cos(r) - dy * Math.sin(r);
    assert.ok(motion.endsWith('Left') ? relativeX > 0 : relativeX < 0);
    const lastHeading = (Math.atan2(end.dx, -end.dy) * 180 / Math.PI + 360) % 360;
    assert.ok(Math.abs(lastHeading - angle) < .001);
  }
});
test('planned movement starts at the current pose, reaches its arrow endpoint and leaves the draft unchanged', () => {
  for (const action of Object.keys(PLAN_ACTIONS)) {
    const car = { ...createScene().cars[0], x: 400, y: 400, plan: { turn: action, target: null, bend: null } };
    const before = structuredClone(car), path = plannedPathFor(car);
    assert.deepEqual(carAtPlannedProgress(car, 0), car);
    const end = carAtPlannedProgress(car, 1);
    assert.deepEqual({ x: end.x, y: end.y }, path.end);
    if (LATERAL_MOTIONS.includes(action) || action === 'straight') assert.ok(Math.abs(end.angle - car.angle) < .001);
    if (action === 'left') assert.equal(end.angle, 270);
    if (action === 'right') assert.equal(end.angle, 90);
    assert.deepEqual(car, before);
    assert.ok(Number.isFinite(carAtPlannedProgress(car, .7).x));
  }
});
test('ramp merge preview can align to the main road heading after a diagonal approach', () => {
  const scene = createScene(); scene.road = 'rampMerge';
  const car = { ...scene.cars[1], x: 650, y: 470, angle: 315 };
  car.plan = createPlan(car, 'mergeLeft', scene);
  const end = carAtPlannedProgress(car, 1);
  assert.equal(car.plan.finalAngle, 0);
  assert.ok(Math.abs(end.x - 435) < .001 && Math.abs(end.y - 150) < .001);
  assert.ok(Math.abs(end.angle) < .001);
});
test('new actions persist and export with their actual and planned meanings', () => {
  const scene = createScene(); scene.cars[0].motion = 'mergeLeft';
  scene.cars[1].plan = createPlan(scene.cars[1], 'changeRight', scene);
  assert.deepEqual(restoreScene(JSON.stringify(scene)), scene);
  const svg = exportSvg(scene);
  assert.ok(svg.includes('向左汇入'));
  assert.ok(svg.includes('计划向右变道（未发生）'));
  scene.cars[1].plan.turn = 'invalid'; assert.equal(restoreScene(scene), null);
});

test('moving a straight endpoint sideways selects the lane change in the driver perspective', () => {
  for (const angle of [0, 90, 180, 270]) for (const offset of [-95, 95]) {
    const r = angle * Math.PI / 180;
    const car = { ...createScene().cars[0], x: 400, y: 300, angle, plan: { turn: 'straight', target: null, bend: { x: -120, y: -180 } } };
    const next = setPlanPoint(car, 'target', { x: 400 + offset * Math.cos(r) + 200 * Math.sin(r), y: 300 + offset * Math.sin(r) - 200 * Math.cos(r) });
    assert.equal(next.plan.turn, offset > 0 ? 'changeRight' : 'changeLeft');
    assert.equal(next.plan.bend, null);
    const path = plannedPathFor(next);
    let previousX = 0;
    for (let t = 0; t <= 1; t += .05) {
      const p = samplePath(path, t);
      const lateral = (p.x - path.start.x) * Math.cos(r) + (p.y - path.start.y) * Math.sin(r);
      assert.ok(offset > 0 ? lateral >= previousX - .001 : lateral <= previousX + .001);
      previousX = lateral;
    }
    assert.deepEqual(car.plan.turn, 'straight');
  }
});

test('straight paths ignore old bend handles and lane-change handles cannot create a reverse bow', () => {
  const car = { ...createScene().cars[0], x: 340, y: 400, plan: { turn: 'straight', target: null, bend: { x: -200, y: -120 } } };
  assert.equal(samplePath(plannedPathFor(car), .5).x, car.x);
  car.plan = { turn: 'changeRight', target: { x: 95, y: -245 }, bend: { x: -180, y: -500 } };
  const path = plannedPathFor(car);
  assert.equal(path.control.x, path.start.x);
  assert.equal(path.control2.x, path.end.x);
  assert.ok(path.control.y > path.control2.y);
  assert.equal(carAtPlannedProgress(car, 1).angle, 0);
});
