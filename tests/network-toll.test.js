import test from 'node:test';
import assert from 'node:assert/strict';
import { corridorExample } from '../src/traffic/network/templates.js';
import { compileNetwork } from '../src/traffic/network/model.js';
import { createNetworkSimulation, stepNetwork } from '../src/traffic/network/engine.js';
function config(type = 'etc', count = 1) {
  const c = corridorExample('toll'); c.roads.forEach(r => { r.lanes = 1; });
  Object.assign(c.nodes.find(n => n.type === 'toll'), { booths: 1, tollLanes: [type] });
  c.demand[0].count = count; return c;
}
function run(c, observe) {
  const s = createNetworkSimulation(c);
  while (!s.finished) { stepNetwork(s); observe?.(s); }
  assert.equal(s.completed.length, s.net.total); assert.equal(s.timedOut, false); return s;
}
test('unobstructed ETC passes without stopping; manual still stops for service', () => {
  let passingSpeed, serviceTicks = 0;
  run(config(), s => { for (const c of s.cars) {
    assert.equal(c.tollService, undefined);
    const p = s.net.paths[c.path];
    if (p.toll && c.paidTolls?.length && passingSpeed == null) passingSpeed = c.v;
  } });
  assert.ok(passingSpeed > 3 && passingSpeed < 6, `ETC speed ${passingSpeed}`);
  run(config('manual'), s => { for (const c of s.cars) if (c.tollService) { serviceTicks++; assert.ok(c.v < 1); } });
  assert.ok(serviceTicks >= 119);
});
test('ETC release headway remains enforced under queued arrivals', () => {
  const c = config('etc', 12); c.nodes.find(n => n.type === 'toll').etcSeconds = 15;
  const passed = new Set(), times = [];
  run(c, s => { for (const car of s.cars) if (car.paidTolls?.length && !passed.has(car.id)) { passed.add(car.id); times.push(s.time); } });
  assert.equal(times.length, 12);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 14.999);
});
test('equipment allocation is reproducible and unequipped cars use only manual booths', () => {
  const c = corridorExample('toll'); c.etcPercent = 50; c.demand[0].count = 20;
  c.nodes.find(n => n.type === 'toll').tollLanes = ['etc', 'etc', 'etc', 'etc', 'manual', 'manual', 'manual', 'manual'];
  const assignments = () => createNetworkSimulation(c).pending.map(c => [c.id, c.hasEtc]);
  assert.deepEqual(assignments(), assignments()); assert.equal(assignments().filter(([, equipped]) => equipped).length, 10);
  const served = new Set();
  run(c, s => { for (const car of s.cars) {
    const p = s.net.paths[car.path];
    if (!car.hasEtc && car.tollPlan) assert.equal(s.net.paths[car.tollPlan.target].toll.type, 'manual');
    if (!car.hasEtc && p.toll) { assert.equal(p.toll.type, 'manual'); if (car.paidTolls?.length) served.add(car.id); }
  } });
  assert.equal(served.size, 10);
  c.etcPercent = 0; assert.equal(createNetworkSimulation(c).pending.some(c => c.hasEtc), false);
});
test('unserviceable ETC-only routes explain how to fix eligibility', () => {
  const c = config(); c.etcPercent = 50; assert.throws(() => compileNetwork(c), /增加人工窗口/);
  c.etcPercent = 100; assert.doesNotThrow(() => compileNetwork(c));
  c.etcPercent = -1; assert.throws(() => compileNetwork(c), /占比/);
});
