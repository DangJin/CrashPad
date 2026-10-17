import { allocateDriverCounts, adjustTrafficMix, normalizeTrafficConfig, drivingPolicy } from '../src/traffic/drivingStyles.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, copy, compileRoad, createSimulation, runSimulation, stepSimulation, laneEnd, roadEdges, displayLane, VEHICLE_LENGTH, DT } from '../src/traffic/engine.js';

test('road segments connect automatically on both sides and reject impossible joins', () => {
  const config = copy(DEFAULT_CONFIG), road = compileRoad(config);
  assert.deepEqual(road.segments.map(s => s.lanes), [3, 2, 1, 1]); assert.equal(road.length, 950);
  config.segments[1].side = 'left';
  const left = compileRoad(config); assert.equal(left.segments[1].to.lo, 1);
  assert.ok(laneEnd(left, 0, 310) > 330 && laneEnd(left, 0, 310) < 400); assert.equal(laneEnd(left, 1, 510), 970);
  config.initialLanes = 1; assert.throws(() => compileRoad(config), /连接后/);
  config.initialLanes = 6; config.segments[0].kind = 'add'; assert.throws(() => compileRoad(config), /连接后/);
  config.segments = []; assert.throws(() => compileRoad(config));
});

test('same seeds reproduce runs, input config stays unchanged, and rate does not enter the engine', () => {
  const config = { ...copy(DEFAULT_CONFIG), count: 30 }, before = JSON.stringify(config);
  const a = runSimulation(config), b = runSimulation(config);
  assert.deepEqual(a, b); assert.equal(JSON.stringify(config), before);
  assert.equal(a.completed, 30); assert.equal(a.timedOut, false); assert.ok(a.time > 0 && a.meanSpeed > 0);
  const first = createSimulation({ ...config, aggression: 0 }), second = createSimulation({ ...config, aggression: 100 });
  assert.deepEqual(first.pending.map(c => [c.desired, c.scheduled, c.origin, c.paint]), second.pending.map(c => [c.desired, c.scheduled, c.origin, c.paint]));
  assert.ok(first.pending.every(c => !c.aggressive)); assert.ok(second.pending.every(c => c.aggressive));
});

test('bottleneck traffic preserves counts, nonnegative finite speeds, road bounds and separation', () => {
  for (const seed of [1, 42, 101]) for (const side of ['left', 'right']) {
    const config = { ...copy(DEFAULT_CONFIG), count: 45, seed, aggression: 35 };
    config.segments[1].side = side;
    const sim = createSimulation(config);
    while (!sim.finished) {
      stepSimulation(sim);
      assert.equal(sim.cars.length + sim.pending.length + sim.completed.length, config.count);
      const lanes = new Map();
      for (const c of sim.cars) {
        assert.ok(Number.isFinite(c.x) && Number.isFinite(c.v) && c.v >= 0);
        assert.ok(c.x <= laneEnd(sim.road, c.lane, c.x));
        const visual = displayLane(c, sim.time), edges = roadEdges(sim.road, c.x);
        assert.ok(visual >= edges.lo - .5 && visual <= edges.hi + .5, `vehicle on grass at ${sim.time}`);
        for (const lane of c.change ? [c.lane, c.change.from] : [c.lane]) { if (!lanes.has(lane)) lanes.set(lane, []); lanes.get(lane).push(c); }
      }
      for (const cars of lanes.values()) {
        cars.sort((a, b) => b.x - a.x);
        for (let i = 1; i < cars.length; i++) assert.ok(cars[i - 1].x - cars[i].x >= VEHICLE_LENGTH + .99, `overlap at ${sim.time}, seed ${seed}, side ${side}`);
      }
    }
    assert.equal(sim.completed.length, config.count, `incomplete seed ${seed} ${side}`);
  }
});

test('a single vehicle on a straight road finishes without spurious lane changes', () => {
  const config = { ...copy(DEFAULT_CONFIG), initialLanes: 1, count: 1, aggression: 100, segments: [{ id: 'one', kind: 'straight', change: 1, length: 200, side: 'right' }] };
  const result = runSimulation(config); assert.equal(result.completed, 1); assert.equal(result.cutIns, 0); assert.equal(result.merges, 0); assert.equal(result.timedOut, false);
});

test('lane additions support subsequent left or right drops and a stopped snapshot never advances itself', () => {
  const config = { ...copy(DEFAULT_CONFIG), initialLanes: 2, count: 25, segments: [
    { id: 'first', kind: 'add', change: 2, length: 200, side: 'left' },
    { id: 'next', kind: 'drop', change: 3, length: 350, side: 'right' },
    { id: 'last', kind: 'straight', change: 1, length: 200, side: 'right' },
  ] };
  assert.equal(runSimulation(config).completed, 25);
  const sim = createSimulation(config), snapshot = JSON.stringify(sim); assert.equal(JSON.stringify(sim), snapshot); stepSimulation(sim); assert.equal(sim.time, DT);
  assert.equal(displayLane({ lane: 1, change: { from: 0, start: 0, duration: 2 } }, 1), .5);
});

test('time limits report incomplete traffic without inventing completed trip times', () => {
  const config = { ...copy(DEFAULT_CONFIG), count: 1, speed: 20, segments: Array.from({ length: 10 }, (_, i) => ({ id: `long-${i}`, kind: 'straight', length: 1500, change: 1, side: 'right' })) };
  const result = runSimulation(config); assert.equal(result.timedOut, true); assert.equal(result.completed, 0); assert.equal(result.meanTrip, null); assert.equal(result.time, 1800);
});

test('discretionary lane changes need persistent gain and cannot quickly reverse into a closing lane', () => {
  for (const aggression of [0, 30, 100]) {
    const sim = createSimulation({ ...copy(DEFAULT_CONFIG), aggression });
    const previous = new Map();
    while (!sim.finished) {
      stepSimulation(sim);
      for (const car of sim.cars) if (car.change?.start === sim.time) {
        const last = previous.get(car.id);
        if (car.lastChange.reason === 'benefit') {
          if (last && car.lane === last.from) assert.ok(sim.time - last.at >= (car.aggressive ? 12 : 20));
          const end = laneEnd(sim.road, car.lane, car.x);
          assert.ok(end >= sim.road.length || end - car.x >= Math.max(200, car.v * 12) - 1);
        }
        previous.set(car.id, { from: car.change.from, at: sim.time });
      }
    }
    assert.equal(sim.completed.length, sim.config.count);
  }
});

test('my vehicle replaces a middle entrant without adding cars or changing driver generation', () => {
  const config = { ...copy(DEFAULT_CONFIG), aggression: 100 };
  const baseline = createSimulation(config), left = createSimulation({ ...config, playerLane: 0 }), right = createSimulation({ ...config, playerLane: 2 });
  assert.equal(left.pending.length, config.count); assert.equal(left.playerId, 51); assert.equal(right.playerId, 51);
  for (let i = 0; i < config.count; i++) {
    assert.equal(left.pending[i].desired, baseline.pending[i].desired); assert.equal(left.pending[i].scheduled, right.pending[i].scheduled);
    if (i !== 50) assert.equal(left.pending[i].lane, right.pending[i].lane);
  }
  assert.equal(left.pending[50].lane, 0); assert.equal(right.pending[50].lane, 2); assert.equal(left.pending[50].aggressive, false);
  assert.throws(() => createSimulation({ ...config, playerLane: 3 }), /体验入口车道/);
});

test('my vehicle stays in lane except mandatory merges and its final timing stops on arrival', () => {
  const config = { ...copy(DEFAULT_CONFIG), count: 30, aggression: 100, playerLane: 2 };
  const sim = createSimulation(config); let arrived = null;
  while (!sim.finished) {
    stepSimulation(sim);
    const mine = sim.cars.find(c => c.isPlayer);
    if (mine?.change) assert.equal(mine.lastChange.reason, 'mandatory');
    const completed = sim.completed.find(c => c.isPlayer);
    if (completed && !arrived) arrived = { ...completed };
    if (arrived) assert.equal(sim.completed.find(c => c.isPlayer).duration, arrived.duration);
    assert.equal(sim.cars.length + sim.pending.length + sim.completed.length, config.count);
  }
  assert.ok(arrived); assert.equal(arrived.origin, 2); assert.equal(sim.completed.length, config.count);
});

test('personal trip time includes entry queuing and has no finished result before arrival', async () => {
  const { playerStatus } = await import('../src/traffic/engine.js');
  const config = { ...copy(DEFAULT_CONFIG), initialLanes: 1, playerLane: 0, count: 50, demand: 240, speed: 20, segments: [{ id: 'queue', kind: 'straight', length: 200, change: 1, side: 'right' }] };
  const sim = createSimulation(config);
  assert.equal(playerStatus(sim).status, 'upcoming'); assert.equal(playerStatus(sim).duration, null);
  while (!sim.finished) stepSimulation(sim);
  const mine = playerStatus(sim);
  assert.equal(mine.status, 'arrived'); assert.ok(mine.waiting > 0); assert.ok(mine.driving > 0);
  assert.ok(Math.abs(mine.duration - mine.waiting - mine.driving) < 1e-8);
  assert.equal(mine.elapsed, mine.duration); assert.ok(mine.rank > 0);
});


test('personal styles preserve entrant generation and reproduce runs without claiming one style is fastest', () => {
  const base = { ...copy(DEFAULT_CONFIG), count: 30, playerLane: 2 };
  const reference = createSimulation(base);
  for (const playerStyle of ['conservative', 'normal', 'aggressive']) {
    const config = { ...base, playerStyle, playerLaneChanges: true }, sim = createSimulation(config);
    assert.deepEqual(sim.pending.map(car => [car.id, car.desired, car.scheduled, car.origin, car.paint]), reference.pending.map(car => [car.id, car.desired, car.scheduled, car.origin, car.paint]));
    while (!sim.finished) {
      stepSimulation(sim);
      assert.equal(sim.cars.length + sim.pending.length + sim.completed.length, config.count);
      for (const car of sim.cars) {
        assert.ok(Number.isFinite(car.v) && car.v >= 0);
        const visual = displayLane(car, sim.time), edges = roadEdges(sim.road, car.x);
        assert.ok(visual >= edges.lo - .5 && visual <= edges.hi + .5);
      }
      const lanes = new Map();
      for (const car of sim.cars) for (const lane of car.change ? [car.lane, car.change.from] : [car.lane]) { if (!lanes.has(lane)) lanes.set(lane, []); lanes.get(lane).push(car); }
      for (const cars of lanes.values()) { cars.sort((a, b) => b.x - a.x); for (let i = 1; i < cars.length; i++) assert.ok(cars[i - 1].x - cars[i].x >= VEHICLE_LENGTH + .99); }
    }
    const result = runSimulation(config), mine = sim.completed.find(car => car.isPlayer);
    assert.equal(sim.completed.length, config.count);
    assert.equal(mine.drivingStyle, playerStyle);
    assert.equal(mine.duration, result.player.duration);
    assert.equal(mine.voluntaryChanges, result.player.voluntaryChanges);
    assert.ok(mine.laneChanges >= mine.voluntaryChanges);
  }
  assert.throws(() => createSimulation({ ...base, playerStyle: 'constructor' }), /驾驶风格/);
  const legacy = { ...base }; delete legacy.playerStyle;
  assert.equal(createSimulation(legacy).pending.find(car => car.isPlayer).drivingStyle, 'normal');
});

test('active personal styles actually change lanes for sustained benefit while the reference stays put', () => {
  for (const playerStyle of ['conservative', 'normal', 'aggressive']) for (const playerLaneChanges of [false, true]) {
    const sim = createSimulation({ ...copy(DEFAULT_CONFIG), count: 3, playerLane: 1, playerStyle, playerLaneChanges, segments: [{ id: 'open', kind: 'straight', length: 1000, change: 1, side: 'right' }] });
    const mine = sim.pending.find(car => car.isPlayer), leader = sim.pending.find(car => !car.isPlayer);
    Object.assign(mine, { x: 100, v: 8, desired: 16, entered: 0 });
    Object.assign(leader, { x: 120, v: 4, desired: 4, lane: 1, entered: 0 });
    sim.cars = [mine, leader]; sim.pending = [];
    for (let step = 0; step < 150; step++) stepSimulation(sim);
    assert.equal(mine.voluntaryChanges > 0, playerLaneChanges, `${playerStyle}, proactive=${playerLaneChanges}`);
  }
});


test('legacy player styles map to the research categories without changing their lane-change policy', () => {
  for (const [legacy, style, enabled] of [['hold', 'normal', false], ['steady', 'conservative', true], ['experienced', 'normal', true], ['hurry', 'aggressive', true]]) {
    const config = { ...copy(DEFAULT_CONFIG), playerLane: 0, playerStyle: legacy }; delete config.playerLaneChanges;
    const sim = createSimulation(config), mine = sim.pending.find(car => car.isPlayer);
    assert.equal(mine.drivingStyle, style); assert.equal(mine.allowLaneChanges, enabled);
    assert.equal(sim.config.playerStyle, style); assert.equal(sim.config.playerLaneChanges, enabled);
  }
  const config = { ...copy(DEFAULT_CONFIG), playerLaneChanges: 'yes' };
  assert.throws(() => createSimulation(config), /主动变道/);
});


test('three-style population allocation is exact, deterministic and independent of my driver', () => {
  for (const count of [1, 2, 7, 101]) for (const playerLane of [null, 0]) {
    const driverMix = { conservative: 33, normal: 34, aggressive: 33 }, config = { ...copy(DEFAULT_CONFIG), count, playerLane, playerStyle: 'aggressive', driverMix };
    const first = createSimulation(config), second = createSimulation(config);
    assert.deepEqual(first, second);
    const others = first.pending.filter(car => !car.isPlayer), expected = allocateDriverCounts(others.length, driverMix);
    for (const key of ['conservative', 'normal', 'aggressive']) assert.equal(others.filter(car => car.drivingStyle === key).length, expected[key]);
    assert.equal(Object.values(expected).reduce((a, b) => a + b, 0), others.length);
    if (playerLane != null) assert.equal(first.pending.find(car => car.isPlayer).drivingStyle, 'aggressive');
  }
  const base = { ...copy(DEFAULT_CONFIG), count: 30 }, balanced = createSimulation({ ...base, driverMix: { conservative: 40, normal: 40, aggressive: 20 } }), aggressive = createSimulation({ ...base, driverMix: { conservative: 0, normal: 0, aggressive: 100 } });
  assert.deepEqual(balanced.pending.map(car => [car.id, car.desired, car.scheduled, car.origin, car.paint]), aggressive.pending.map(car => [car.id, car.desired, car.scheduled, car.origin, car.paint]));
  const conservative = balanced.pending.find(car => car.drivingStyle === 'conservative');
  assert.equal(drivingPolicy(conservative).headway, 1.8);
  assert.equal(runSimulation({ ...base, driverMix: { conservative: 40, normal: 40, aggressive: 20 } }).completed, 30);
});

test('population proportions rebalance to 100 and old aggression settings migrate', () => {
  for (const key of ['conservative', 'normal', 'aggressive']) for (const amount of [0, 1, 33, 99, 100]) {
    const mix = adjustTrafficMix({ conservative: 0, normal: 0, aggressive: 100 }, key, amount);
    assert.equal(mix[key], amount); assert.equal(Object.values(mix).reduce((a, b) => a + b, 0), 100);
    assert.ok(Object.values(mix).every(value => Number.isInteger(value) && value >= 0 && value <= 100));
  }
  assert.deepEqual(normalizeTrafficConfig({ ...DEFAULT_CONFIG, aggression: 65 }).driverMix, { conservative: 0, normal: 35, aggressive: 65 });
  for (const driverMix of [{ conservative: 20, normal: 20, aggressive: 20 }, { conservative: -1, normal: 71, aggressive: 30 }, { conservative: 1.5, normal: 68.5, aggressive: 30 }]) assert.throws(() => createSimulation({ ...copy(DEFAULT_CONFIG), driverMix }), /占比/);
});

test('visible entry and exit ramps conserve the fleet, reserve gaps and finish on both sides', async () => {
  const { rampLength } = await import('../src/traffic/roadEvents.js');
  for (const side of ['left', 'right']) {
    const config = { ...copy(DEFAULT_CONFIG), count: 30, playerLane: 1, driverMix: { conservative: 30, normal: 40, aggressive: 30 }, segments: [
      { id: 'start', kind: 'straight', length: 150, side: 'right', change: 1 },
      { id: 'entry', kind: 'merge', length: 200, side, change: 1, rampCount: 6, rampFlow: 30 },
      { id: 'exit', kind: 'exit', length: 250, side, change: 1, exitPercent: 40 },
      { id: 'end', kind: 'straight', length: 200, side: 'right', change: 1, signal: { enabled: true, green: 5, red: 5, start: 'red' } },
    ] };
    const sim = createSimulation(config), again = createSimulation(config);
    assert.deepEqual(sim, again);
    assert.equal(sim.pending.filter(car => car.entryRamp != null).length, 6);
    assert.equal(sim.pending.find(car => car.isPlayer).entryRamp, undefined);
    const plannedExits = sim.pending.filter(car => car.exitSegment != null).length;
    let sawEntry = false, sawExit = false;
    while (!sim.finished) {
      stepSimulation(sim);
      assert.equal(sim.cars.length + sim.pending.length + sim.completed.length, config.count);
      const lanes = new Map(), ramps = new Map();
      for (const car of sim.cars) {
        assert.ok(Number.isFinite(car.x) && Number.isFinite(car.v) && car.v >= 0);
        if (car.ramp) {
          sawEntry ||= car.ramp.type === 'entry'; sawExit ||= car.ramp.type === 'exit';
          assert.ok(car.ramp.progress >= 0 && car.ramp.progress <= rampLength(sim.road.segments[car.ramp.segment]) + 5);
          const key = `${car.ramp.type}-${car.ramp.segment}`; if (!ramps.has(key)) ramps.set(key, []); ramps.get(key).push(car);
        }
        if (!car.ramp || car.ramp.type === 'exit' && car.ramp.progress < car.ramp.clearAt) for (const lane of car.change ? [car.lane, car.change.from] : [car.lane]) { if (!lanes.has(lane)) lanes.set(lane, []); lanes.get(lane).push(car); }
      }
      for (const cars of lanes.values()) { cars.sort((a, b) => b.x - a.x); for (let i = 1; i < cars.length; i++) assert.ok(cars[i - 1].x - cars[i].x >= VEHICLE_LENGTH + .99, `main gap ${side} ${sim.time}`); }
      for (const cars of ramps.values()) { cars.sort((a, b) => b.ramp.progress - a.ramp.progress); for (let i = 1; i < cars.length; i++) assert.ok(cars[i - 1].ramp.progress - cars[i].ramp.progress >= VEHICLE_LENGTH + .99, `ramp gap ${side} ${sim.time}`); }
    }
    assert.equal(sim.completed.length, config.count); assert.ok(sawEntry && sawExit);
    assert.equal(sim.completed.find(car => car.isPlayer).destination, 'main');
    assert.equal(sim.completed.filter(car => car.destination === 'ramp').length + sim.missedExits, plannedExits);
  }
});

test('red and yellow stop the main stream, green releases it and signal cycles are deterministic', async () => {
  const { signalState, signalPosition } = await import('../src/traffic/roadEvents.js');
  const config = { ...copy(DEFAULT_CONFIG), initialLanes: 1, count: 8, segments: [{ id: 'signal', kind: 'straight', length: 200, side: 'right', change: 1, signal: { enabled: true, green: 5, red: 30, start: 'red' } }] };
  const sim = createSimulation(config), segment = sim.road.segments[0], stop = signalPosition(segment);
  assert.equal(signalState(segment, 0).color, 'red'); assert.equal(signalState(segment, 30).color, 'green'); assert.equal(signalState(segment, 35).color, 'yellow'); assert.equal(signalState(segment, 38).color, 'red');
  let queued = false;
  while (!sim.finished) {
    const before = new Map(sim.cars.map(car => [car.id, car.x]));
    stepSimulation(sim);
    if (signalState(segment, sim.time).color !== 'green') for (const car of sim.cars) if ((before.get(car.id) ?? -5) <= stop) assert.ok(car.x <= stop + .001);
    if (sim.time < 30) { assert.equal(sim.completed.length, 0); queued ||= sim.cars.some(car => car.v < .1 && car.x > 150); }
  }
  assert.ok(queued); assert.equal(sim.completed.length, 8); assert.ok(sim.time > 30);
  assert.throws(() => compileRoad({ ...config, segments: [{ ...config.segments[0], signal: { enabled: true, green: 0 } }] }), /红绿灯/);
  assert.throws(() => compileRoad({ ...config, segments: [{ ...config.segments[0], kind: 'merge', rampCount: 8 }] }), /汇入/);
});

test('entry ramp and merge movement share one continuous curve on either side', async () => {
  const { rampCurvePoint, rampPoint, rampLength, rampJunction, rampMergeEnd } = await import('../src/traffic/roadEvents.js');
  for (const side of ['left', 'right']) {
    const config = { ...copy(DEFAULT_CONFIG), count: 15, segments: [{ id: 'merge', kind: 'merge', length: 200, side, change: 1, rampCount: 5, rampFlow: 60 }, { id: 'end', kind: 'straight', length: 200, side, change: 1 }] };
    const sim = createSimulation(config), segment = sim.road.segments[0], end = rampPoint(segment, rampLength(segment));
    assert.ok(Math.abs(end.x - rampJunction(segment)) < 1e-8);
    assert.equal(rampCurvePoint(segment, 1).lane, side === 'left' ? segment.to.lo : segment.to.hi);
    let joined = false;
    while (!sim.finished) {
      const before = new Map(sim.cars.map(car => [car.id, { x: car.x, v: car.v, ramp: !!car.ramp }]));
      stepSimulation(sim);
      for (const car of sim.cars) if (car.change?.rampMerge) {
        joined = true;
        const t = (car.x - segment.start - segment.length * .05) / (segment.length * .9), expected = rampCurvePoint(segment, t);
        assert.ok(Math.abs(displayLane(car, sim.time) - expected.lane) < 1e-8);
        const previous = before.get(car.id);
        if (previous?.ramp) assert.ok(car.x - previous.x <= previous.v * DT + .1, 'entry-to-main transition must not jump');
        assert.equal(car.change.rampMerge.end, rampMergeEnd(segment));
      }
    }
    assert.ok(joined); assert.equal(sim.completed.length, 15);
  }
});


test('toll booths process each car, manual queues take longer, and consecutive stations remain independent', () => {
  const base = { ...copy(DEFAULT_CONFIG), initialLanes: 1, count: 10, playerLane: null, segments: [{ id: 'toll', kind: 'toll', length: 200, side: 'right', change: 1, tollLanes: ['etc'], etcSeconds: 2, manualSeconds: 12 }] };
  function run(config) { const sim = createSimulation(config); let served = 0; while (!sim.finished) { stepSimulation(sim); for (const c of sim.cars) if (c.tollService) { assert.ok(c.x <= sim.road.segments[c.tollService.segment].start + 120); served++; } } assert.equal(sim.completed.length, 10); assert.equal(sim.timedOut, false); assert.ok(served > 0); return sim.time; }
  const etc = run(base), manual = copy(base); manual.segments[0].tollLanes = ['manual'];
  assert.ok(run(manual) > etc + 50);
  const twice = copy(base); twice.segments.push({ ...base.segments[0], id: 'second' }); assert.ok(run(twice) > etc);
  const invalid = copy(base); invalid.segments[0].manualSeconds = 0; assert.throws(() => compileRoad(invalid), /收费窗口/);
});


test('pocket toll plazas expand to eight booths and merge back without losing vehicles', () => {
  for (const exit of [2, 4]) {
    const config = { ...copy(DEFAULT_CONFIG), initialLanes: 4, count: 80, playerLane: 3, segments: [{ id: 'plaza', kind: 'toll', length: 600, side: 'right', change: 1, tollBooths: 8, tollExitLanes: exit, tollLanes: Array(8).fill('etc') }, { id: 'after', kind: 'straight', length: 200, side: 'right', change: 1 }] };
    const sim = createSimulation(config), used = new Set();
    assert.equal(sim.road.maxLane, 7); assert.equal(sim.road.segments[1].from.hi, exit - 1);
    assert.equal(roadEdges(sim.road, 300).hi, 7); assert.equal(roadEdges(sim.road, 600).hi, exit - 1);
    while (!sim.finished) {
      stepSimulation(sim);
      for (const c of sim.cars) { if (c.tollService) used.add(c.lane); assert.ok(Number.isFinite(c.x) && c.v >= 0); if (!c.ramp && !c.change) { const edges = roadEdges(sim.road, c.x); assert.ok(c.lane <= edges.hi + .4); } }
    }
    assert.equal(sim.timedOut, false); assert.equal(sim.completed.length, config.count); assert.ok(used.has(7)); assert.ok(sim.completed.every(c => c.lane < exit));
    const repeated = runSimulation(config); assert.equal(repeated.time, sim.time);
  }
});
