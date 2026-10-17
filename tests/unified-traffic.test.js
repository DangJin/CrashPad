import test from 'node:test';
import assert from 'node:assert/strict';
import { corridorExample, insertTemplate, convertLinear } from '../src/traffic/network/templates.js';
import { compileNetwork, makeExample, clone, pointOn } from '../src/traffic/network/model.js';
import { DEFAULT_CONFIG } from '../src/traffic/engine.js';
import { createNetworkSimulation, stepNetwork, networkSummary } from '../src/traffic/network/engine.js';
function run(config, observe = () => {}) {
  const sim = createNetworkSimulation(config);
  while (!sim.finished) {
    stepNetwork(sim); observe(sim);
    assert.equal(sim.cars.length + sim.pending.length + sim.completed.length + sim.failed.length, sim.net.total);
    for (const c of sim.cars) assert.ok(Number.isFinite(c.s) && c.v >= 0);
    for (const group of new Set(sim.cars.map(c => sim.net.paths[c.path].mergeGroup).filter(Boolean))) {
      const list = sim.cars.filter(c => c.path === group || sim.net.paths[c.path].mergeGroup === group).map(c => c.s - (c.path === group ? 0 : sim.net.paths[c.path].length)).sort((a, b) => b - a);
      for (let i = 1; i < list.length; i++) assert.ok(list[i - 1] - list[i] >= 5.49, `merge gap ${group}`);
    }
  }
  assert.equal(sim.timedOut, false); assert.equal(sim.failed.length, 0); assert.equal(sim.completed.length, sim.net.total); return sim;
}
test('all road templates insert into a cross network without disconnected sockets', () => {
  const original = makeExample();
  for (const kind of ['straight', 'add', 'drop', 'merge', 'exit', 'toll']) {
    const inserted = insertTemplate(original, { type: 'road', id: 'r-east' }, kind, 123);
    const net = compileNetwork(inserted.config); assert.equal(net.total, 100); assert.ok(inserted.config.nodes.some(n => n.id === inserted.selected.id)); assert.equal(original.nodes.length, 5);
  }
});
test('100 vehicles zipper from three lanes into one without conflicting merge occupancy', () => {
  const sim = run(corridorExample('transition')); assert.equal(sim.completed.length, 100);
});
test('entry and exit ramps conserve counts and routes in the same engine', () => {
  for (const kind of ['merge', 'exit']) { const config = corridorExample(kind); config.demand.forEach(d => { d.count = Math.min(12, d.count); }); const sim = run(config); if (kind === 'merge') assert.ok(sim.completed.some(c => c.origin === 'branch')); else assert.ok(sim.completed.some(c => c.destination === 'branch')); }
});
test('four-to-eight-to-four plaza uses all booths and manual processing changes trip time', () => {
  const base = corridorExample('toll'); base.demand[0].count = 32; const used = new Set();
  const etc = run(base, sim => { for (const c of sim.cars) if (sim.net.paths[c.path].toll && c.paidTolls?.includes(sim.net.paths[c.path].toll.key)) used.add(sim.net.paths[c.path].toll.booth); });
  assert.equal(used.size, 8); assert.ok(etc.completed.every(c => c.destination === 'end'));
  const manual = clone(base); manual.nodes.find(n => n.type === 'toll').tollLanes = Array(8).fill('manual'); manual.nodes.find(n => n.type === 'toll').manualSeconds = 40;
  assert.ok(networkSummary(run(manual)).meanTrip > networkSummary(etc).meanTrip);
});
test('linear conversion keeps original config, demand totals and player settings', () => {
  const old = clone(DEFAULT_CONFIG); old.initialLanes = 4; old.count = 30; old.playerLane = 2;
  old.segments = [{ id: 't', kind: 'toll', length: 600, side: 'right', change: 1, tollBooths: 8, tollExitLanes: 4 }, { id: 'm', kind: 'merge', length: 250, side: 'left', change: 1, rampCount: 5, rampFlow: 30 }, { id: 'e', kind: 'exit', length: 250, side: 'right', change: 1, exitPercent: 20 }, { id: 'd', kind: 'drop', length: 250, side: 'right', change: 2 }];
  const before = JSON.stringify(old), converted = convertLinear(old); assert.equal(JSON.stringify(old), before); assert.equal(compileNetwork(converted).total, 30); assert.equal(converted.player.lane, 2); assert.equal(converted.importedFrom, 'linear');
  run(converted);
});
test('single direction, six lanes and toll settings reject impossible connections', () => {
  const c = corridorExample('toll'); c.nodes.find(n => n.type === 'toll').booths = 3; assert.throws(() => compileNetwork(c), /窗口/);
  const straight = corridorExample('straight'); straight.roads.forEach(r => { r.lanes = 6; }); const net = compileNetwork(straight); assert.equal(Object.keys(net.edges).length, 2);
  const bad = clone(straight); bad.roads[0].oneWay = true; bad.roads[1].from = 'end'; bad.roads[1].to = 'section'; assert.throws(() => compileNetwork(bad), /没有可行路线/);
});

test('toll facilities and ramp demand operate in the same signal-controlled road network', () => {
  const original = makeExample(); original.demand.forEach(d => { d.count = 3; });
  const plaza = insertTemplate(original, { type: 'road', id: 'r-west' }, 'toll', 11);
  let served = false; run(plaza.config, sim => { if (sim.cars.some(c => c.paidTolls?.length)) served = true; }); assert.ok(served);
  const withRamp = insertTemplate(plaza.config, { type: 'road', id: 'r-east' }, 'merge', 12);
  withRamp.config.demand.find(d => d.node.endsWith('-branch')).count = 3;
  const sim = run(withRamp.config); assert.ok(sim.completed.some(c => c.origin.endsWith('-branch')));
});

test('free-flow mainline keeps road speed through ramp facilities', () => {
  for (const kind of ['straight', 'merge', 'exit']) {
    const config = corridorExample(kind);
    config.roads.filter(r => r.kind !== 'ramp').forEach(r => { r.speed = 90; });
    config.demand.forEach((d, i) => { d.count = i ? 0 : 1; d.destinations = { end: 100 }; });
    const sim = createNetworkSimulation(config);
    const main = Object.values(sim.net.connectors).filter(c => c.turn === 'straight' && sim.net.edges[c.incoming].kind !== 'ramp' && sim.net.edges[c.outgoing].kind !== 'ramp');
    assert.ok(main.length);
    assert.ok(main.every(c => c.speed === 90));
    const turns = Object.values(sim.net.connectors).filter(c => c.turn !== 'straight');
    assert.ok(turns.every(c => c.speed <= 22));
    let crossed = false;
    while (!sim.finished) {
      stepNetwork(sim);
      for (const car of sim.cars) {
        const path = sim.net.paths[car.path];
        if (path.type === 'connector' && path.turn === 'straight') {
          crossed = true;
          assert.ok(car.v * 3.6 > 65, 'empty mainline must not brake to junction speed');
        }
      }
    }
    assert.ok(crossed);
    assert.equal(sim.completed.length, 1);
  }
});

test('toll fan-out releases cleared conflict regions without overlapping crossing vehicles', async () => {
  const { pointOn } = await import('../src/traffic/network/model.js');
  const config = corridorExample('toll');
  config.roads.forEach(r => { r.lanes = 3; });
  function simulate() {
    const sim = createNetworkSimulation(config);
    while (!sim.finished) {
      stepNetwork(sim);
      {
        const cars = sim.cars.filter(c => sim.net.paths[c.path].conflictRelease);
        for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
          const a = cars[i], b = cars[j];
          if (a.path === b.path) continue;
          const p = pointOn(sim.net.paths[a.path], a.s), q = pointOn(sim.net.paths[b.path], b.s);
          assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= 5, 'crossing vehicles retain clearance');
        }
      }
    }
    assert.equal(sim.completed.length, 100);
    assert.equal(sim.timedOut, false);
    return sim.time;
  }
  assert.ok(simulate() < 320, '100 ETC vehicles must not be serialized at the entrance');
});


test('toll exit distributes booth lanes in order across all receiving lanes', () => {
  for (const lanes of [1, 3, 4]) {
    const config = corridorExample('toll');
    config.roads.forEach(r => { r.lanes = lanes; });
    const net = compileNetwork(config);
    const exit = Object.values(net.connectors).filter(c => net.paths[c.from].toll);
    const groups = Array(lanes).fill(0);
    for (const c of exit) {
      const source = net.paths[c.from], target = net.paths[c.to];
      assert.equal(target.lane, Math.floor(source.lane * lanes / 8));
      groups[target.lane]++;
    }
    assert.equal(groups.reduce((a, b) => a + b), 8);
    assert.ok(Math.max(...groups) - Math.min(...groups) <= 1);
  }
});
test('single-lane and mixed-service tolls retain car conservation and merge spacing', () => {
  for (const lanes of [1, 3]) {
    const config = corridorExample('toll');
    config.roads.forEach(r => { r.lanes = lanes; });
    config.demand[0].count = 24;
    config.nodes.find(n => n.type === 'toll').tollLanes = ['etc', 'manual', 'etc', 'manual', 'etc', 'manual', 'etc', 'etc'];
    run(config);
  }
});

test('ramp policies reduce starvation while keeping merge spacing and vehicle counts', () => {
  const means={};
  for(const policy of ['priority','cooperative','assertive']) {
    const config=corridorExample('merge');config.nodes.find(n=>n.type==='merge').mergePolicy=policy;
    config.demand.forEach(d=>{d.count=d.node==='branch'?30:120;d.flow=120;});
    const sim=run(config),ramp=sim.completed.filter(c=>c.origin==='branch');
    assert.equal(ramp.length,30);
    means[policy]=ramp.reduce((sum,c)=>sum+c.duration,0)/ramp.length;
    assert.ok(sim.time<330);
  }
  assert.ok(means.cooperative<means.priority);
  assert.ok(means.assertive<means.cooperative);
});

test('zipper merge alternates queued approaches, drains a lone side and resets its turn state', () => {
  for(const rampCount of [0,16]) {
    const config=corridorExample('merge');config.nodes.find(n=>n.type==='merge').mergePolicy='zipper';
    config.demand.forEach(d=>{d.count=d.node==='branch'?rampCount:16;d.flow=240;});
    const sim=createNetworkSimulation(config);
    for(const c of sim.pending){const edge=sim.net.edges[c.route[0]];c.path=edge.paths.at(-1).id;c.nextDecision=Infinity;}
    let contested=0,entries=0;
    const entered=new Set();
    while(!sim.finished){
      const waiting=sim.cars.filter(c=>{const p=sim.net.paths[c.path];return p.type==='road'&&p.length-c.s<15&&p.edge===c.route[0];});
      const both=waiting.some(c=>c.origin==='branch')&&waiting.some(c=>c.origin!=='branch');
      const last={...sim.zipperLast};
      stepNetwork(sim);
      for(const c of sim.cars){const p=sim.net.paths[c.path];if(p.type!=='connector'||entered.has(c.id))continue;entered.add(c.id);entries++;
        if(both){assert.notEqual(c.origin==='branch',last[p.mergeGroup]??true);contested++;}
      }
      for(const group of new Set(sim.cars.map(c=>sim.net.paths[c.path].mergeGroup).filter(Boolean))){
        const positions=sim.cars.filter(c=>c.path===group||sim.net.paths[c.path].mergeGroup===group).map(c=>c.s-(c.path===group?0:sim.net.paths[c.path].length)).sort((a,b)=>b-a);
        for(let i=1;i<positions.length;i++)assert.ok(positions[i-1]-positions[i]>=5.49);
      }
    }
    assert.equal(sim.completed.length,16+rampCount);assert.equal(sim.failed.length,0);assert.equal(sim.timedOut,false);
    assert.equal(entries,16+rampCount);if(rampCount)assert.ok(contested>=5,`contested: ${contested}`);
    assert.deepEqual(createNetworkSimulation(config).zipperLast,{});
  }
});


test('exit uses only the shoulder lane and releases separated traffic without crossing cars', () => {
  const config=corridorExample('exit');config.demand[0].count=120;config.demand[0].flow=120;
  const net=compileNetwork(config),exits=Object.values(net.connectors).filter(c=>net.edges[c.outgoing].kind==='ramp');
  assert.equal(exits.length,1);assert.equal(net.paths[exits[0].from].lane,2);
  const sim=run(config,s=>{
    const crossing=s.cars.filter(c=>s.net.paths[c.path].type==='connector');
    for(let i=0;i<crossing.length;i++)for(let j=i+1;j<crossing.length;j++){
      const a=crossing[i],b=crossing[j],pa=s.net.paths[a.path],pb=s.net.paths[b.path];
      if(pa.node!==pb.node)continue;
      const x=pointOn(pa,a.s),y=pointOn(pb,b.s);
      assert.ok(Math.hypot(x.x-y.x,x.y-y.y)>=5.4,'exit connector clearance');
    }
  });
  assert.ok(sim.time<360,`exit throughput ${sim.time}`);
  assert.ok(sim.completed.some(c=>c.destination==='branch'));
  assert.ok(sim.completed.some(c=>c.destination==='end'));
});


test('toll drivers select stable booths upstream and enter through their feeding lane', () => {
  const config = corridorExample('toll');
  config.roads.forEach(r => { r.lanes = 3; });
  config.demand[0].distribution = 'left';
  config.demand[0].flow = 180;
  config.nodes.find(n => n.type === 'toll').tollLanes = ['manual', 'manual', 'etc', 'etc', 'manual', 'etc', 'etc', 'etc'];
  const plans = new Map(), prepared = new Set();
  run(config, sim => {
    for (const car of sim.cars) {
      const path = sim.net.paths[car.path];
      if (!car.tollPlan) continue;
      const key = `${car.id}:${car.tollPlan.edge}`;
      if (!plans.has(key)) {
        plans.set(key, car.tollPlan.target);
        assert.equal(path.type, 'road');
        assert.ok(path.length - car.s > 60, 'select the booth before the old last-60m lock');
      }
      assert.equal(car.tollPlan.target, plans.get(key), 'do not chase a different queue each tick');
      if (path.type === 'road' && path.edge !== car.tollPlan.edge && car.change && path.lane === car.tollPlan.owner) prepared.add(car.id);
      if (path.type === 'connector' && sim.net.paths[path.to].toll) {
        assert.equal(sim.net.paths[path.from].lane, car.tollPlan.owner, 'no cross-plaza leap from the wrong approach lane');
        assert.equal(path.to, car.tollPlan.target);
      }
      if (path.toll && !car.paidTolls?.includes(path.toll.key)) assert.equal(!!car.change, false, 'keep the selected queue before payment');
    }
  });
  assert.ok(prepared.size > 0, 'traffic actually prepares a different approach lane');
});
