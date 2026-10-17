import test from 'node:test';
import assert from 'node:assert/strict';
import { makeExample, compileNetwork, clone, findRoute, pointOn } from '../src/traffic/network/model.js';
import { createNetworkSimulation, stepNetwork, networkSummary, vehiclePose, signalFor, runNetwork } from '../src/traffic/network/engine.js';
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function small() { const config = makeExample(); config.demand.forEach(d => { d.count = 3; }); return config; }
function check(sim) {
  assert.equal(sim.pending.length + sim.cars.length + sim.completed.length + sim.failed.length, sim.net.total);
  for (const c of sim.cars) assert.ok(Number.isFinite(c.s) && Number.isFinite(c.v) && c.v >= 0);
  for (const path of Object.values(sim.net.paths)) {
    const cars = sim.cars.filter(c => c.path === path.id || c.change?.from === path.id).sort((a, b) => b.s - a.s);
    for (let i = 1; i < cars.length; i++) assert.ok(cars[i - 1].s - cars[i].s >= 5.49, `spacing ${path.id}`);
  }
  const crossing = sim.cars.filter(c => sim.net.paths[c.path].type === 'connector');
  for (const a of crossing) for (const b of crossing) if (a.id !== b.id && a.path !== b.path) { const pa=sim.net.paths[a.path],pb=sim.net.paths[b.path]; if(pa.conflicts.includes(b.path))assert.ok(a.s>pb.conflictRelease?.[a.path]||b.s>pa.conflictRelease?.[b.path], 'crossing region still reserved'); assert.ok(distance(pointOn(pa,a.s),pointOn(pb,b.s))>=5.4,'physical crossing clearance'); }
}
test('network geometry connects exactly and path search respects lane turn restrictions', () => {
  const config = small(), net = compileNetwork(config);
  for (const c of Object.values(net.connectors)) {
    assert.ok(distance(pointOn(net.paths[c.from], net.paths[c.from].length), pointOn(c, 0)) < .001);
    assert.ok(distance(pointOn(c, c.length), pointOn(net.paths[c.to], 0)) < .001);
  }
  assert.ok(findRoute(net, 'west', 'north'));
  config.nodes[0].turns = { 'r-west': { 0: ['straight'], 1: ['right'] } };
  config.demand[0].destinations = { north: 100 };
  assert.throws(() => compileNetwork(config), /没有可行路线/);
  const broken = small(); broken.nodes.find(n => n.id === 'west').y += 20; assert.throws(() => compileNetwork(broken), /对齐/);
  const duplicate = small(); duplicate.roads.push({ ...duplicate.roads[0], id: 'duplicate' }); assert.throws(() => compileNetwork(duplicate), /端口|占用/);
});
test('cross traffic and T-junction finish without crossing conflicts or count loss', () => {
  for (const type of ['cross', 'tee']) {
    const config = makeExample(type); config.demand.forEach(d => { d.count = 4; });
    const sim = createNetworkSimulation(config);
    while (!sim.finished) { stepNetwork(sim); if (sim.tick % 5 === 0) check(sim); }
    assert.equal(sim.completed.length, sim.net.total); assert.equal(sim.timedOut, false); assert.equal(sim.failed.length, 0);
  }
});
test('red lights stop vehicles and protected phases clear the intersection before switching', () => {
  const config = small(); config.nodes[0].signal = { enabled: true, plan: 'protected', green: 5, leftGreen: 5 };
  const sim = createNetworkSimulation(config), phases = new Set();
  while (!sim.finished) {
    const before = new Map(sim.cars.map(c => [c.id, { path: c.path, signal: sim.net.paths[c.path].type === 'road' ? null : signalFor(sim, sim.net.paths[c.path]) }]));
    stepNetwork(sim); phases.add(sim.signals.center.phase);
    if (sim.signals.center.phase === 'clear') assert.ok(sim.signals.center.elapsed >= 0);
    for (const c of sim.cars) if (sim.net.paths[c.path].type === 'connector' && before.get(c.id)?.path !== c.path) assert.equal(signalFor(sim, sim.net.paths[c.path]), 'green');
    check(sim);
  }
  assert.ok(phases.has('yellow') && phases.has('clear')); assert.equal(sim.completed.length, 12);
});
test('uncontrolled junction respects priorities and deterministic runs reproduce results', () => {
  const config = small(); config.nodes[0].signal.enabled = false;
  const a = runNetwork(config), b = runNetwork(config); assert.deepEqual(a, b); assert.equal(a.completed, 12); assert.equal(a.timedOut, false);
});
test('U-turn uses an enabled continuous connector and my vehicle replaces an entrant', () => {
  const config = small(); config.demand.forEach(d => { d.count = d.node === 'west' ? 4 : 0; }); config.demand[0].destinations = { west: 100 };
  config.nodes[0].turns = { 'r-west': { 0: ['uturn'], 1: ['straight', 'right'] } };
  config.player = { entry: 'west', destination: 'west', lane: 0, style: 'conservative', allowLaneChanges: false };
  const sim = createNetworkSimulation(config); assert.equal(sim.pending.filter(c => c.isPlayer).length, 1); assert.equal(sim.pending.length, 4);
  const used = new Set(); while (!sim.finished) { stepNetwork(sim); for (const c of sim.cars) used.add(sim.net.paths[c.path].turn); check(sim); }
  assert.ok(used.has('uturn')); const result = networkSummary(sim); assert.equal(result.completed, 4); assert.equal(result.player.status, 'arrived'); assert.ok(result.player.waiting >= 0); assert.equal(result.player.elapsed, result.player.waiting + result.player.driving);
});
test('an occupied outlet prevents entry, curve motion remains finite and fast playback does not alter stepping', () => {
  const config = small(), sim = createNetworkSimulation(config), poses = new Map();
  while (!sim.finished) {
    stepNetwork(sim);
    for (const c of sim.cars) { const pose = vehiclePose(sim, c); assert.ok(Number.isFinite(pose.heading)); if (poses.has(c.id)) assert.ok(distance(poses.get(c.id), pose) < 4, 'continuous centre position'); poses.set(c.id, pose); }
  }
  const batched = createNetworkSimulation(config); while (!batched.finished) for (let i = 0; i < 100 && !batched.finished; i++) stepNetwork(batched);
  assert.deepEqual(networkSummary(sim), networkSummary(batched));
  const blocked = createNetworkSimulation(config), connector = Object.values(blocked.net.connectors).find(c => c.turn === 'straight');
  blocked.pending = []; const incoming = blocked.net.paths[connector.from];
  blocked.cars = [{ id: 1, path: connector.from, route: [connector.incoming, connector.outgoing], routeIndex: 0, s: incoming.length - 2, v: 0, factor: 1, drivingStyle: 'normal', nextDecision: Infinity }, { id: 2, path: connector.to, route: [connector.outgoing], routeIndex: 0, s: 2, v: 0, factor: 1, drivingStyle: 'normal', nextDecision: Infinity }];
  stepNetwork(blocked); assert.equal(blocked.cars.find(c => c.id === 1).reason, '出口堵塞');
});
test('90-degree bend supports each lane and subsequent exit with continuous geometry', () => {
  const config = small(); config.nodes = [{ id: 'bend', type: 'bend', x: 500, y: 100, rotation: 0 }, { id: 'west', name: '入口', type: 'terminal', x: 860, y: 100, rotation: 180, role: 'both' }, { id: 'south', name: '出口', type: 'terminal', x: 500, y: 500, rotation: 270, role: 'both' }];
  config.roads = [{ id: 'a', from: 'west', to: 'bend', lanes: 2, length: 280, speed: 50 }, { id: 'b', from: 'bend', to: 'south', lanes: 2, length: 320, speed: 50 }];
  config.demand = [{ node: 'west', count: 6, flow: 20, destinations: { south: 100 } }];
  const sim = createNetworkSimulation(config); while (!sim.finished) { stepNetwork(sim); check(sim); } assert.equal(sim.completed.length, 6);
});

test('routes continue through multiple junctions and missed turns remain explicit failures', () => {
  const config = small(); config.nodes.find(n => n.id === 'east').x = 1360;
  config.nodes.push({ id: 'second', type: 'tee', x: 1000, y: 440, rotation: 0, signal: { enabled: false, plan: 'alternating', green: 25, leftGreen: 12 } }, { id: 'southeast', name: '东南出口', type: 'terminal', x: 1000, y: 800, rotation: 270, role: 'both' });
  config.roads = config.roads.filter(r => r.id !== 'r-east'); config.roads.push({ id: 'bridge', from: 'center', to: 'second', lanes: 2, length: 400, speed: 50 }, { id: 'out', from: 'second', to: 'east', lanes: 2, length: 260, speed: 50 }, { id: 'branch', from: 'second', to: 'southeast', lanes: 2, length: 260, speed: 50 });
  config.demand.forEach(d => { d.count = d.node === 'west' ? 4 : 0; }); config.demand[0].destinations = { east: 100 };
  const sim = createNetworkSimulation(config); assert.equal(sim.pending[0].route.length, 3);
  while (!sim.finished) { stepNetwork(sim); check(sim); } assert.equal(sim.completed.length, 4);
  const missedConfig = small(); missedConfig.demand.forEach(d => { d.count = d.node === 'west' ? 1 : 0; }); missedConfig.demand[0].destinations = { north: 100 }; missedConfig.player = { entry: 'west', destination: 'north', lane: 1, style: 'normal', allowLaneChanges: false };
  const missed = createNetworkSimulation(missedConfig), car = missed.pending.shift(); car.entered = 0; car.s = 277; car.v = 0; car.nextDecision = Infinity; missed.cars.push(car);
  while (!missed.finished) stepNetwork(missed);
  assert.equal(missed.failed.length, 1); assert.equal(missed.completed.length, 0); assert.equal(networkSummary(missed).player.status, 'failed');
});

test('multiple turn lanes preserve their order instead of collapsing into one receiving lane', () => {
  for(const turn of ['left','right'])for(const receiving of [1,2]) {
    const config=small(),destination=turn==='left'?'north':'south';
    config.nodes[0].turns={'r-west':{0:[turn],1:[turn]}};
    config.roads.find(r=>r.id===`r-${destination}`).lanes=receiving;
    config.demand=[{node:'west',count:20,flow:100,destinations:{[destination]:100}}];
    const net=compileNetwork(config),connections=Object.values(net.connectors).filter(c=>net.edges[c.incoming].roadId==='r-west'&&c.turn===turn);
    assert.deepEqual(connections.map(c=>net.paths[c.to].lane),receiving===1?[0,0]:[0,1]);
    const sim=createNetworkSimulation(config);while(!sim.finished){stepNetwork(sim);check(sim);}
    assert.equal(sim.completed.length,20);assert.equal(sim.failed.length,0);
  }
});
