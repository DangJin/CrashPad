import test from 'node:test';
import assert from 'node:assert/strict';
import { TRAFFIC_SCENARIOS, createTrafficScenario } from '../src/traffic/network/scenarios.js';
import { compileNetwork } from '../src/traffic/network/model.js';
import { createNetworkSimulation, stepNetwork } from '../src/traffic/network/engine.js';
for (const preset of TRAFFIC_SCENARIOS) test(`${preset.id} has valid independent routes, queues and completes all trips`, () => {
  const config = createTrafficScenario(preset.id), original = JSON.stringify(config);
  for (const seed of [42, 43, 44]) assert.equal(compileNetwork({ ...config, seed }).total, 240);
  const sim = createNetworkSimulation(config); let queued = 0, signalWait = 0, rampTraffic = 0;
  while (!sim.finished) {
    stepNetwork(sim);
    assert.equal(sim.cars.length + sim.pending.length + sim.completed.length + sim.failed.length, 240);
    queued = Math.max(queued, sim.cars.filter(c => c.v < 1.39).length);
    signalWait += sim.cars.filter(c => c.reason === '等待绿灯' && c.v < 1).length;
    rampTraffic += sim.cars.filter(c => c.origin === 'ramp-in').length;
  }
  assert.equal(sim.timedOut, false); assert.equal(sim.failed.length, 0); assert.equal(sim.completed.length, 240);
  if (['highway-morning','city-morning','toll-mixed'].includes(preset.id)) assert.ok(queued > 10);
  if (preset.id === 'city-morning') { assert.ok(signalWait > 100); assert.equal(config.nodes.filter(n => n.signal?.enabled).length, 3); }
  else if (preset.id === 'highway-morning') { assert.ok(rampTraffic > 0); assert.ok(sim.completed.some(c => c.destination === 'ramp-out')); }
  if (preset.id === 'toll-mixed') { assert.equal(config.etcPercent,70); assert.equal(config.nodes.find(n=>n.type==='toll').tollLanes.filter(t=>t==='manual').length,2); }
  if (preset.id === 'zipper-merge') assert.equal(config.nodes.find(n=>n.type==='merge').mergePolicy,'zipper');
  if (preset.id === 'busy-exit') assert.equal(config.demand[0].destinations.branch,60);
  assert.equal(JSON.stringify(config), original);
  const fresh = createTrafficScenario(preset.id); fresh.nodes[0].name = 'edited'; assert.equal(JSON.stringify(createTrafficScenario(preset.id)), original);
  console.log(preset.id, { seconds: sim.time, peakQueue: queued, completed: sim.completed.length });
});
