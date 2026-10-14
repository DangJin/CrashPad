import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene, restoreScene, moveCar, rotateCar, pathFor, plannedPathFor, setPlanPoint, carAtProgress, incomingHeading, withIncomingHeading, withMotion, History } from '../src/model.js';
import { exportSvg } from '../src/scene.js';

test('draft round trip and corrupt draft recovery', () => {
  const s = createScene();
  assert.deepEqual(restoreScene(JSON.stringify(s)), s);
  for (const raw of ['{', 'null', '{}', '{"version":2}']) assert.equal(restoreScene(raw), null);
  for (const invalid of [ { road: '__proto__' }, { lanes: 0 }, { lanes: 9 }, { note: '<'.repeat(501) }, { collision: { x: Infinity, y: 0 } } ]) assert.equal(restoreScene({ ...s, ...invalid }), null);
  s.cars[0].x = -50;
  assert.equal(restoreScene(s), null);
});
test('vehicles remain inside the editable scene', () => {
  const car = createScene().cars[0];
  assert.deepEqual([moveCar(car, -900, 900).x, moveCar(car, -900, 900).y], [36, 545]);
});
test('heading wraps in both directions', () => {
  const car = createScene().cars[0];
  assert.equal(rotateCar(car, -45).angle, 315);
  assert.equal(rotateCar({ ...car, angle: 315 }, 90).angle, 45);
});
test('all moving paths lead from prior position to collision-time position', () => {
  for (const motion of ['straight', 'left', 'right', 'change', 'custom']) {
    const car = { ...createScene().cars[0], motion, angle: 90 };
    const path = pathFor(car);
    assert.deepEqual(path.end, { x: car.x, y: car.y });
    assert.notDeepEqual(path.start, path.end);
    assert.ok(path.start.x >= 0 && path.start.x <= 800 && path.start.y >= 0 && path.start.y <= 600);
  }
  assert.equal(pathFor({ ...createScene().cars[0], motion: 'stopped' }), null);
});
test('custom path retains its prior position when the vehicle moves', () => {
  const car = { ...createScene().cars[0], motion: 'custom', start: { x: 100, y: 120 } };
  assert.deepEqual(pathFor(moveCar(car, 400, 450)).start, car.start);
});
test('undo and redo include complete scenes without reference leaks', () => {
  const s = createScene(), h = new History(s);
  s.collision = { x: 400, y: 300 }; h.push(s);
  s.note = 'test'; h.push(s);
  assert.equal(h.undo().note, '');
  assert.equal(h.undo().collision, null);
  assert.equal(h.redo().collision.x, 400);
  const restored = h.redo(); restored.note = 'mutated';
  assert.equal(h.undo().note, '');
  assert.equal(h.redo().note, 'test');
});
test('editing after undo discards the old future; history stays bounded', () => {
  const s = createScene(), h = new History(s);
  s.note = 'one'; h.push(s); s.note = 'two'; h.push(s);
  h.undo(); s.note = 'different'; h.push(s);
  assert.equal(h.canRedo, false);
  for (let i = 0; i < 100; i++) { s.note = String(i); h.push(s); }
  assert.equal(h.items.length, 80);
});
test('exports escape user text, include damage, and grow for long notes', () => {
  const s = createScene();
  const short = exportSvg(s);
  s.note = '<script>alert("test")</script> &'.repeat(12); s.location = '路口 & <地标>'; s.cars[0].damage = 'left';
  const result = exportSvg(s);
  assert.ok(!result.includes('<script>'));
  assert.ok(result.includes('&lt;script&gt;'));
  assert.ok(result.includes('受损部位：左侧'));
  assert.ok(Number(result.match(/height="(\d+)"/)[1]) > Number(short.match(/height="(\d+)"/)[1]));
});
test('replay starts at the route origin and finishes at the authored collision pose', () => {
  for (const motion of ['straight', 'left', 'right', 'change', 'custom']) {
    const car = { ...createScene().cars[0], motion, damage: 'front', angle: 315 };
    const original = structuredClone(car), path = pathFor(car);
    const start = carAtProgress(car, 0);
    assert.equal(start.x, path.start.x);
    assert.equal(start.y, path.start.y);
    const middle = carAtProgress(car, .5);
    assert.equal(middle.x, .25 * path.start.x + .5 * path.control.x + .25 * path.end.x);
    assert.equal(middle.y, .25 * path.start.y + .5 * path.control.y + .25 * path.end.y);
    assert.ok(Number.isFinite(middle.angle));
    assert.equal(middle.damage, '');
    assert.deepEqual(carAtProgress(car, 1), car);
    assert.deepEqual(carAtProgress(car, 2), car);
    assert.deepEqual(car, original);
  }
});
test('stationary and zero-length routes remain stable during replay', () => {
  const stationary = { ...createScene().cars[1], motion: 'stopped' };
  for (const progress of [0, .5, 1]) assert.deepEqual(carAtProgress(stationary, progress), stationary);
  const car = { ...createScene().cars[0], motion: 'custom' }; car.start = { x: car.x, y: car.y };
  assert.deepEqual(carAtProgress(car, .5), car);
});
test('left and right turns follow the driver perspective in every cardinal direction', () => {
  for (const heading of [0, 90, 180, 270]) {
    for (const motion of ['left', 'right']) {
      const car = withMotion(withIncomingHeading({ ...createScene().cars[0], x: 400, y: 300 }, heading), motion);
      assert.equal(incomingHeading(car), heading);
      assert.equal(car.angle, (heading + (motion === 'left' ? 270 : 90)) % 360);
      const { start, control, end } = pathFor(car);
      const cross = (control.x - start.x) * (end.y - control.y) - (control.y - start.y) * (end.x - control.x);
      assert.ok(motion === 'left' ? cross < 0 : cross > 0);
      assert.ok(Math.abs(carAtProgress(car, 0).angle - heading) < .001);
    }
  }
});
test('changing maneuver preserves the arrival direction and moved turn origins retain curvature', () => {
  let car = withIncomingHeading(createScene().cars[1], 270);
  car = withMotion(car, 'left');
  assert.equal(car.angle, 180);
  car.start = { x: 650, y: 120 };
  const { start, control, end } = pathFor(car);
  assert.deepEqual(start, car.start);
  assert.notEqual(control.x, (start.x + end.x) / 2);
  assert.equal(incomingHeading(withMotion(car, 'right')), 270);
  assert.equal(withMotion(car, 'straight').angle, 270);
  assert.equal(withMotion(car, 'stopped').angle, 180);
});
test('planned turns start in front of the current car without changing its pose or actual route', () => {
  for (const angle of [0, 90, 180, 270]) {
    for (const turn of ['left', 'right']) {
      const car = { ...createScene().cars[1], x: 400, y: 300, angle };
      const originalPath = pathFor(car);
      car.plan = { turn, target: null, bend: null };
      const p = plannedPathFor(car);
      assert.deepEqual(pathFor(car), originalPath);
      const cross = (p.control.x - p.start.x) * (p.end.y - p.control.y) - (p.control.y - p.start.y) * (p.end.x - p.control.x);
      assert.ok(turn === 'left' ? cross < 0 : cross > 0);
      assert.equal(car.angle, angle);
    }
  }
});
test('planned handles retain their shape when moving and rotating the car, and drafts validate them', () => {
  let car = { ...createScene().cars[1], x: 400, y: 300, plan: { turn: 'left', target: null, bend: null } };
  car = setPlanPoint(car, 'target', { x: 220, y: 150 });
  car = setPlanPoint(car, 'bend', { x: 400, y: 150 });
  assert.deepEqual(plannedPathFor(car).end, { x: 220, y: 150 });
  assert.deepEqual(plannedPathFor(moveCar(car, 420, 320)).end, { x: 240, y: 170 });
  const rotated = plannedPathFor(rotateCar(car, 90)).end;
  assert.ok(Math.abs(rotated.x - 550) < .001 && Math.abs(rotated.y - 120) < .001);
  const scene = createScene(); scene.cars[1] = car;
  assert.deepEqual(restoreScene(JSON.stringify(scene)), scene);
  assert.ok(exportSvg(scene).includes('计划左转（未发生）'));
  scene.cars[1].plan.target.x = Infinity;
  assert.equal(restoreScene(scene), null);
});

test('document titles persist while older untitled drafts remain compatible', () => {
  const scene = createScene(); scene.title = '主路右侧匝道汇入事故';
  assert.equal(restoreScene(JSON.stringify(scene)).title, scene.title);
  const legacy = { ...scene }; delete legacy.title;
  assert.ok(restoreScene(legacy));
  assert.equal(restoreScene({ ...scene, title: 12 }), null);
  assert.equal(restoreScene({ ...scene, title: '字'.repeat(61) }), null);
  const exported = exportSvg({ ...scene, title: '<路口> & 双车事故' });
  assert.ok(exported.includes('&lt;路口&gt; &amp; 双车事故'));
  assert.ok(exportSvg({ ...scene, title: '   ' }).includes('事故示意图'));
});
