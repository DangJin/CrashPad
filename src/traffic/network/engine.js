import { preferredRouteLanes } from './lanePlanning.js';
import { compileNetwork, findRoute, pointOn, clone } from './model.js';
import { drivingPolicy, allocateDriverCounts } from '../drivingStyles.js';
export const STEP = .1;
const CAR = 4.5, GAP = 2;
function generator(seed) { let a = seed >>> 0; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function createNetworkSimulation(config) {
  const net = compileNetwork(config), random = generator(config.seed), pending = [];
  for (const demand of config.demand) for (let i = 0; i < demand.count; i++) {
    let draw = random() * 100, destination;
    for (const [id, weight] of Object.entries(demand.destinations)) { draw -= weight; if (draw < 0) { destination = id; break; } }
    const route = findRoute(net, demand.node, destination), edge = net.edges[route[0]], available = preferredRouteLanes(net, route, 0), choices = available.length ? available : Array.from({ length: edge.lanes }, (_, lane) => lane), laneDraw = random(), lane = demand.distribution === 'left' && laneDraw < .65 ? Math.min(...choices) : demand.distribution === 'right' && laneDraw < .65 ? Math.max(...choices) : choices[i % choices.length];
    pending.push({ id: pending.length + 1, origin: demand.node, destination, route, routeIndex: 0, path: edge.paths[lane].id, s: 0, v: 0, acc: 0, factor: .9 + random() * .2, risk: random(), paint: Math.floor(random() * 6), scheduled: i * 60 / demand.flow, entered: null, drivingStyle: 'normal', allowLaneChanges: true, laneChanges: 0, voluntaryChanges: 0, nextDecision: 0, reason: '等待入场' });
  }
  if (config.player) {
    const entrants = pending.filter(c => c.origin === config.player.entry), player = entrants[Math.floor(entrants.length / 2)];
    player.isPlayer = true; player.destination = config.player.destination; player.route = findRoute(net, player.origin, player.destination); player.path = net.edges[player.route[0]].paths[config.player.lane].id; player.drivingStyle = config.player.style; player.allowLaneChanges = config.player.allowLaneChanges;
  }
  const others = pending.filter(c => !c.isPlayer).sort((a, b) => a.risk - b.risk), counts = allocateDriverCounts(others.length, config.driverMix);
  let index = 0; for (const style of ['aggressive', 'conservative', 'normal']) for (let i = 0; i < counts[style]; i++) others[index++].drivingStyle = style;
  const equipmentRandom = generator(config.seed ^ 0x5E7C);
  const equipment = pending.map(car => ({ car, rank: equipmentRandom() })).sort((a, b) => a.rank - b.rank);
  const equipped = Math.round(pending.length * (config.etcPercent ?? 100) / 100);
  equipment.forEach(({ car }, i) => { car.hasEtc = i < equipped; });
  pending.sort((a, b) => a.scheduled - b.scheduled || a.id - b.id);
  return { config: clone(config), net, tick: 0, time: 0, cars: [], pending, completed: [], failed: [], samples: [], signals: {}, speedSum: 0, observations: 0, zipperLast: {}, tollNextPass: {}, finished: false, timedOut: false };
}
function stages(node) {
  const s = node.signal;
  const green = s.green, left = s.leftGreen;
  return s.plan === 'protected' ? [{ axis: 'ew', turns: ['straight', 'right'], duration: green }, { axis: 'ew', turns: ['left', 'uturn'], duration: left }, { axis: 'ns', turns: ['straight', 'right'], duration: green }, { axis: 'ns', turns: ['left', 'uturn'], duration: left }] : [{ axis: 'ew', turns: ['straight', 'right', 'left', 'uturn'], duration: green }, { axis: 'ns', turns: ['straight', 'right', 'left', 'uturn'], duration: green }];
}
function advanceSignals(sim) {
  for (const node of Object.values(sim.net.nodes)) {
    if (!node.signal?.enabled || node.signal.plan === 'cycle' || node.type === 'terminal' || node.type === 'bend') continue;
    const state = sim.signals[node.id] ??= { stage: 0, phase: 'green', elapsed: 0 };
    state.elapsed += STEP;
    const duration = state.phase === 'green' ? stages(node)[state.stage].duration : state.phase === 'yellow' ? 3 : 2;
    if (state.elapsed + .00001 < duration) continue;
    if (state.phase === 'green') { state.phase = 'yellow'; state.elapsed = 0; }
    else if (state.phase === 'yellow') { state.phase = 'clear'; state.elapsed = 0; }
    else if (!sim.cars.some(c => sim.net.paths[c.path].type === 'connector' && sim.net.paths[c.path].node === node.id || c.tail?.node === node.id && c.s < CAR + GAP)) { state.phase = 'green'; state.elapsed = 0; state.stage = (state.stage + 1) % stages(node).length; }
  }
}
export function signalFor(sim, connector) {
  const node = sim.net.nodes[connector.node];
  if (!node.signal?.enabled || node.type === 'bend') return 'green';
  if (node.signal.plan === 'cycle') { const s = node.signal, green = s.green, red = s.red ?? 30, phase = (sim.time + (s.start === 'red' ? green + 3 : 0)) % (green + 3 + red); return phase < green ? 'green' : phase < green + 3 ? 'yellow' : 'red'; }
  const state = sim.signals[node.id] || { stage: 0, phase: 'green' }, stage = stages(node)[state.stage];
  const axis = sim.net.edges[connector.incoming].heading % 180 === 0 ? 'ew' : 'ns';
  return axis === stage.axis && stage.turns.includes(connector.turn) ? state.phase === 'green' ? 'green' : state.phase === 'yellow' ? 'yellow' : 'red' : 'red';
}
function onPath(sim, id, except) { return sim.cars.filter(c => c.id !== except && (c.path === id || c.change?.from === id)).sort((a, b) => a.s - b.s || a.id - b.id); }
function gapAhead(sim, car, id = car.path) { return onPath(sim, id, car.id).find(c => c.s > car.s || c.s === car.s && c.id < car.id); }
// Pick a booth on the approach, then prepare its feeding lane before the fan-out.
function prepareToll(sim, car) {
  const path = sim.net.paths[car.path], bank = sim.net.edges[car.route[car.routeIndex + 1]];
  if (path.type !== 'road' || !bank?.toll) return null;
  if (car.tollPlan?.edge === bank.id) return car.tollPlan;
  const incoming = sim.net.edges[path.edge];
  const scored = bank.paths.filter(target => car.hasEtc || target.toll.type === 'manual').map(target => {
    const owner = Math.min(incoming.lanes - 1, Math.floor(target.lane * incoming.lanes / bank.lanes));
    const service = target.toll.type === 'manual' ? target.toll.manualSeconds : target.toll.etcSeconds;
    const queue = sim.cars.filter(c => c.id !== car.id && !c.paidTolls?.includes(target.toll.key) && (c.path === target.id || c.tollPlan?.target === target.id)).length;
    const projected = (path.lane + .5) * bank.lanes / incoming.lanes - .5;
    return { edge: bank.id, target: target.id, owner, score: queue * (service + 2) + service + Math.abs(owner - path.lane) * 20 + Math.abs(target.lane - projected) * .7 };
  }).sort((a, b) => a.score - b.score || a.target.localeCompare(b.target));
  car.tollPlan = scored[0];
  return car.tollPlan;
}
function nextConnector(sim, car) {
  const choices = Object.values(sim.net.connectors).filter(c => c.from === car.path && c.outgoing === car.route[car.routeIndex + 1]);
  const plan = prepareToll(sim, car);
  if (plan) return choices.find(c => c.to === plan.target);
  if (choices.length <= 1) return choices[0];
  if (car.connectionChoice && choices.some(c => c.id === car.connectionChoice)) return sim.net.paths[car.connectionChoice];
  const current = sim.net.paths[car.path];
  const score = connector => {
    const target = sim.net.paths[connector.to], outgoing = sim.net.edges[target.edge];
    const queue = sim.cars.filter(c => c.id !== car.id && (c.path === target.id || c.path === c.connectionChoice && sim.net.paths[c.path]?.to === target.id || sim.net.paths[c.path]?.type === 'road' && sim.net.paths[c.connectionChoice]?.to === target.id)).length;
    const preferred = outgoing.length <= 800 ? preferredRouteLanes(sim.net, car.route, car.routeIndex + 1) : [];
    const routeCost = preferred.length ? Math.min(...preferred.map(l => Math.abs(l - target.lane))) * 60 : 0;
    return routeCost + queue * 3 + Math.abs(target.lane - current.lane) * .3;
  };
  choices.sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id));
  if (current.length - car.s < 60) car.connectionChoice = choices[0].id;
  return choices[0];
}
function priority(sim, connector, car) {
  const node = sim.net.nodes[connector.node], axis = sim.net.edges[connector.incoming].heading % 180 === 0 ? 'ew' : 'ns';
  if (connector.turn === 'uturn') return 100;
  const threshold = node.mergePolicy === 'priority' ? Infinity : ['assertive', 'zipper'].includes(node.mergePolicy) ? 0 : 8;
  const rampPenalty = sim.net.edges[connector.incoming].kind === 'ramp' && sim.time - (car.waitSince ?? sim.time) < threshold ? 4 : 0;
  return rampPenalty + (node.signal?.enabled ? 0 : axis === (node.priority || 'ew') ? 0 : 4) + (connector.turn === 'uturn' ? 3 : connector.turn === 'left' ? 2 : 0);
}
function entryBlock(sim, car, connector) {
  if (signalFor(sim, connector) !== 'green') return '等待绿灯';
  const outbound = onPath(sim, connector.to, car.id)[0];
  if (!connector.mergeGroup && outbound && outbound.s < CAR + GAP + 4) return '出口堵塞';
  const mergeTail = connector.mergeGroup && sim.cars.some(c => { const p = sim.net.paths[c.path]; return p.type === 'connector' && p.mergeGroup === connector.mergeGroup && connector.length - p.length + c.s < CAR + GAP + Math.max(2, car.v * drivingPolicy(car).headway); });
  const busy = mergeTail || sim.cars.some(c => sim.net.paths[c.path].type === 'connector' && connector.conflicts.includes(c.path) && !(connector.conflictRelease?.[c.path] != null && c.s > connector.conflictRelease[c.path]) && !(connector.mergeGroup && sim.net.paths[c.path].mergeGroup === connector.mergeGroup) && (sim.net.paths[connector.to].toll && sim.net.paths[c.path].from === connector.from ? c.s < CAR + GAP : c.path !== connector.id || c.s < CAR + GAP + Math.max(2, car.v * drivingPolicy(car).headway)));
  // Keep the conflict occupied until the tail has left the junction.
  const clearing = !connector.mergeGroup && sim.cars.some(c => c.tail?.node === connector.node && c.s < CAR + GAP && connector.conflicts.includes(c.tail.connector) && (connector.conflictRelease?.[c.tail.connector] == null || sim.net.paths[c.tail.connector].length + c.s <= connector.conflictRelease[c.tail.connector]));
  return busy || clearing ? '转向让行' : null;
}
function mayEnter(sim, car, connector, candidates) {
  const blocked = entryBlock(sim, car, connector);
  if (blocked) return blocked;
  for (const other of candidates) {
    if (other.id === car.id || sim.net.paths[other.path].type !== 'road' || other.change) continue;
    const path = nextConnector(sim, other); if (!path || !connector.conflicts.includes(path.id) || signalFor(sim, path) !== 'green') continue;
    if (sim.net.nodes[connector.node].mergePolicy === 'zipper' && connector.mergeGroup && path.mergeGroup === connector.mergeGroup) {
      const mineRamp = sim.net.edges[connector.incoming].kind === 'ramp', otherRamp = sim.net.edges[path.incoming].kind === 'ramp';
      if (mineRamp !== otherRamp) {
        const preferredRamp = !(sim.zipperLast[connector.mergeGroup] ?? true);
        if (mineRamp !== preferredRamp) return '拉链汇入 · 等待另一侧';
        continue;
      }
    }
    if (entryBlock(sim, other, path)) continue;
    const p = priority(sim, path, other), mine = priority(sim, connector, car);
    if (p < mine || p === mine && ((other.waitSince ?? sim.time) < (car.waitSince ?? sim.time) || other.waitSince === car.waitSince && other.id < car.id)) return '转向让行';
  }
  return null;
}
function routeLaneChange(sim, car) {
  const path = sim.net.paths[car.path];
  if (path.type !== 'road' || car.change || sim.time < car.nextDecision || car.tollService || path.toll && Math.abs(path.length * .6 - car.s) < 25) return;
  const edge = sim.net.edges[path.edge], upcoming = car.route[car.routeIndex + 1];
  // Stay in the chosen queue until payment; paid vehicles may prepare the exit.
  if (path.toll && !car.paidTolls?.includes(path.toll.key)) return;
  const tollPlan = prepareToll(sim, car);
  const allowed = tollPlan ? [tollPlan.owner] : preferredRouteLanes(sim.net, car.route, car.routeIndex);
  // Route-required changes start while space is available, not at the queue tail.
  const mandatory = upcoming && !allowed.includes(path.lane);
  if (!mandatory && path.length - car.s < 18) return;
  if (!mandatory && car.isPlayer && !car.allowLaneChanges) return;
  const ahead = gapAhead(sim, car), currentGap = ahead ? ahead.s - car.s - CAR : path.length - car.s;
  const policy = drivingPolicy(car);
  for (const lane of [path.lane - 1, path.lane + 1]) {
    const target = edge.paths[lane]; if (!target) continue;
    if (mandatory && Math.min(...allowed.map(l => Math.abs(l - lane))) >= Math.min(...allowed.map(l => Math.abs(l - path.lane)))) continue;
    if (!mandatory && upcoming && !allowed.includes(lane)) continue;
    if (!mandatory && car.lastFrom === target.id && sim.time < (car.returnAfter || 0)) continue;
    const occupants = onPath(sim, target.id, car.id), front = occupants.find(c => c.s >= car.s), back = [...occupants].reverse().find(c => c.s < car.s);
    const frontGap = front ? front.s - car.s - CAR : path.length - car.s, backGap = back ? car.s - back.s - CAR : Infinity;
    if (frontGap < 2.5 + car.v * policy.front || backGap < 2.5 + (back?.v || 0) * policy.rear) continue;
    if (!mandatory && (frontGap - currentGap < 15 || sim.time < 3)) { car.candidate = null; continue; }
    if (!mandatory) {
      if (car.candidate?.path !== target.id) { car.candidate = { path: target.id, since: sim.time }; continue; }
      if (sim.time - car.candidate.since < policy.persistence) continue;
    }
    car.change = { from: car.path, start: sim.time, duration: 2 }; car.lastFrom = car.path; car.path = target.id; car.laneChanges++; if (!mandatory) car.voluntaryChanges++; car.nextDecision = sim.time + 2 + policy.cooldown; car.returnAfter = sim.time + policy.returnDelay; car.candidate = null; return;
  }
}
export function stepNetwork(sim) {
  if (sim.finished) return sim;
  sim.time = ++sim.tick / 10;
  advanceSignals(sim);
  for (const c of sim.cars) { if (c.change && sim.time - c.change.start >= c.change.duration) c.change = null; if (c.tail && c.s >= CAR + GAP) c.tail = null; }
  const remaining = [];
  for (const car of sim.pending) {
    if (car.scheduled > sim.time) { remaining.push(car); continue; }
    const tail = onPath(sim, car.path, car.id)[0];
    if (tail && tail.s < CAR + 10) { remaining.push(car); continue; }
    car.entered = sim.time; car.v = 0; sim.cars.push(car);
  }
  sim.pending = remaining;
  for (const car of [...sim.cars].sort((a, b) => b.s - a.s || a.id - b.id)) routeLaneChange(sim, car);
  const approaching = sim.cars.filter(c => { const p = sim.net.paths[c.path]; return p.type === 'road' && p.length - c.s < 15 && !gapAhead(sim, c) && c.routeIndex < c.route.length - 1; });
  for (const car of approaching) car.waitSince ??= sim.time;
  for (const car of approaching) if (!car.change && !nextConnector(sim, car) && sim.net.paths[car.path].length - car.s < 18) {
    const options = Object.values(sim.net.connectors).filter(c => c.from === car.path).map(c => findRoute(sim.net, sim.net.edges[c.outgoing].from, car.destination, c.outgoing)).filter(Boolean).sort((a, b) => a.reduce((sum, id) => sum + sim.net.edges[id].length, 0) - b.reduce((sum, id) => sum + sim.net.edges[id].length, 0));
    if (options.length) { car.route = [...car.route.slice(0, car.routeIndex + 1), ...options[0]]; car.reroutes = (car.reroutes || 0) + 1; }
    else if (sim.time - car.waitSince > 30) { car.failed = true; car.reason = '未完成路线：错过转向且无合法绕行'; }
  }
  for (const car of sim.cars) {
    const path = sim.net.paths[car.path];
    if (!path.toll || path.toll.type === 'etc' || car.paidTolls?.includes(path.toll.key)) continue;
    const position = path.length * .6;
    if (!car.change && Math.abs(position - car.s) < 3.1 && car.v < 1 ) {
      car.tollService ??= { key: path.toll.key, until: sim.time + (path.toll.type === 'manual' ? path.toll.manualSeconds : path.toll.etcSeconds) };
      if (sim.time + .00001 >= car.tollService.until) { (car.paidTolls ??= []).push(path.toll.key); car.tollService = null; }
    }
  }
  const next = new Map();
  for (const car of sim.cars) {
    const path = sim.net.paths[car.path], leader = gapAhead(sim, car), policy = drivingPolicy(car);
    let gap = leader ? leader.s - car.s - CAR : Infinity, speed = leader?.v ?? car.v;
    car.reason = leader && gap < Math.max(12, car.v * 2) ? '跟车减速' : car.change ? '准备变道' : path.type === 'connector' ? `${{ straight: '直行', left: '左转', right: '右转', uturn: '掉头' }[path.turn]}通过路口` : '沿路线行驶';
    let stop = Infinity, connector = null;
    if (path.type === 'road') {
      if (car.routeIndex < car.route.length - 1) {
        connector = nextConnector(sim, car);
        // Follow the preceding vehicle across the road/fan-out boundary,
        // instead of treating a moving leader as a stationary stop line.
        if (connector) {
          for (const other of sim.cars) {
            const p = sim.net.paths[other.path];
            if (other.id === car.id || p.type !== 'connector' || p.from !== car.path) continue;
            if (p.id !== connector.id && (connector.conflictRelease?.[p.id] == null || other.s > connector.conflictRelease[p.id])) continue;
            const ahead = path.length - car.s + other.s - CAR;
            if (ahead < gap) { gap = ahead; speed = other.v; }
          }
        }
        const preparingToll = car.tollPlan?.edge === car.route[car.routeIndex + 1] && path.lane !== car.tollPlan.owner;
        let reason = preparingToll ? '提前进入收费车道' : car.change ? '准备变道' : connector ? mayEnter(sim, car, connector, approaching) : '等待进入转向车道';
        if (reason) { stop = path.length - 1; car.reason = reason; }
      }
    } else {
      if (path.mergeGroup) for (const other of sim.cars) { const p = sim.net.paths[other.path]; if (other.id === car.id || p.mergeGroup !== path.mergeGroup) continue; const delta = (path.length - car.s) - (p.length - other.s); if ((delta > 0 || delta === 0 && other.id < car.id) && delta - CAR < gap) { gap = delta - CAR; speed = other.v; } }
      const output = onPath(sim, path.to, car.id)[0];
      if (output) { const outputGap = path.length - car.s + output.s - CAR; if (outputGap < gap) { gap = outputGap; speed = output.v; } }
    }
    if (path.toll && !car.paidTolls?.includes(path.toll.key) && car.s <= path.length * .6) {
      if (path.toll.type === 'manual') {
        stop = Math.min(stop, path.length * .6);
        car.reason = car.tollService ? `人工办理 · ${Math.max(0, car.tollService.until - sim.time).toFixed(1)} 秒` : '人工窗口排队';
      } else if (sim.time < (sim.tollNextPass[path.id] ?? 0)) {
        stop = Math.min(stop, path.length * .6);
        car.reason = 'ETC 等待前车放行';
      } else car.reason = 'ETC 低速通过';
    }
    if (stop - car.s < gap) { gap = stop - car.s; speed = 0; }
    const curveLimit = path.type === 'road' && path.length - car.s < 40 ? nextConnector(sim, car)?.speed ?? path.speed : path.speed;
    const desired = Math.max(1, Math.min(path.speed, curveLimit, path.toll?.type === 'etc' && Math.abs(car.s - path.length * .6) < 40 ? 20 / car.factor : Infinity) / 3.6 * car.factor), desiredGap = GAP + Math.max(0, car.v * policy.headway + car.v * (car.v - speed) / (2 * Math.sqrt(3)));
    const acc = Math.max(-8, Math.min(1.5, 1.5 * (1 - (car.v / desired) ** 4 - (desiredGap / Math.max(.1, gap)) ** 2)));
    const ds = Math.max(0, car.v * STEP + acc * STEP * STEP / 2);
    next.set(car.id, { s: Math.min(stop, car.s + ds), v: Math.max(0, car.v + acc * STEP), acc, connector });
  }
  // Resolve spacing using the same snapshot in both reserved lanes.
  const occupied = new Set(sim.cars.flatMap(c => [c.path, ...(c.change ? [c.change.from] : [])]));
  for (let pass = 0; pass < 2; pass++) for (const id of occupied) {
    const list = onPath(sim, id).sort((a, b) => b.s - a.s || a.id - b.id);
    for (let i = 1; i < list.length; i++) { const front = next.get(list[i - 1].id), car = list[i], update = next.get(car.id), limit = front.s - CAR - 1; if (update.s > limit) { update.s = Math.max(car.s, limit); update.v = Math.min(update.v, Math.max(0, (update.s - car.s) / STEP)); } }
  }
  for (const group of new Set(sim.cars.map(c => sim.net.paths[c.path].mergeGroup).filter(Boolean))) {
    const list = sim.cars.filter(c => c.path === group || sim.net.paths[c.path].mergeGroup === group).sort((a, b) => { const qa = a.path === group ? a.s : a.s - sim.net.paths[a.path].length, qb = b.path === group ? b.s : b.s - sim.net.paths[b.path].length; return qb - qa || a.id - b.id; });
    for (let i = 1; i < list.length; i++) {
      const car = list[i], front = list[i - 1], update = next.get(car.id), frontUpdate = next.get(front.id), offset = car.path === group ? 0 : sim.net.paths[car.path].length, frontOffset = front.path === group ? 0 : sim.net.paths[front.path].length, limit = frontUpdate.s - frontOffset - CAR - 1 + offset;
      if (update.s > limit) { update.s = Math.max(car.s, limit); update.v = Math.min(update.v, Math.max(0, (update.s - car.s) / STEP)); }
    }
  }
  const active = [];
  // Deterministic transition ordering, checking reservations again after each entry.
  for (const car of [...sim.cars].sort((a, b) => (a.waitSince ?? sim.time) - (b.waitSince ?? sim.time) || a.id - b.id)) {
    if (car.failed) { sim.failed.push({ ...car, failed: true, duration: sim.time - car.scheduled, waiting: car.entered - car.scheduled }); continue; }
    const update = next.get(car.id), path = sim.net.paths[car.path];
    car.acc = (update.v - car.v) / STEP; car.v = update.v; car.s = Math.max(car.s, update.s);
    if (path.toll?.type === 'etc' && !car.paidTolls?.includes(path.toll.key) && car.s >= path.length * .6 && sim.time >= (sim.tollNextPass[path.id] ?? 0)) {
      (car.paidTolls ??= []).push(path.toll.key);
      sim.tollNextPass[path.id] = sim.time + path.toll.etcSeconds;
    }
    if (car.s >= path.length - .15) {
      if (path.type === 'connector') {
        const tail = onPath(sim, path.to, car.id)[0];
        if (!tail || tail.s >= CAR + GAP) { car.prevPath = car.path; car.path = path.to; car.s = Math.min(1, Math.max(0, car.s - path.length)); car.routeIndex++; car.waitSince = null; car.tail = { connector: path.id, node: path.node }; }
        else { car.s = path.length - .15; car.v = 0; car.reason = '出口堵塞'; }
      } else if (car.routeIndex === car.route.length - 1) {
        sim.completed.push({ id: car.id, origin: car.origin, destination: car.destination, duration: sim.time - car.scheduled, waiting: car.entered - car.scheduled, entered: car.entered, arrived: sim.time, isPlayer: !!car.isPlayer, laneChanges: car.laneChanges, voluntaryChanges: car.voluntaryChanges }); continue;
      } else {
        const connector = update.connector;
        if (connector && !car.change && !(car.tollPlan?.edge === car.route[car.routeIndex + 1] && path.lane !== car.tollPlan.owner) && !mayEnter(sim, car, connector, approaching)) { if (connector.mergeGroup && sim.net.nodes[connector.node].mergePolicy === 'zipper') sim.zipperLast[connector.mergeGroup] = sim.net.edges[connector.incoming].kind === 'ramp'; car.prevPath = car.path; car.path = connector.id; car.s = 0; car.waitSince = null; }
        else { car.s = path.length - 1; car.v = 0; }
      }
    }
    active.push(car); sim.speedSum += car.v * 3.6; sim.observations++;
  }
  sim.cars = active;
  sim.timedOut = sim.time >= 1800;
  sim.finished = sim.completed.length + sim.failed.length === sim.net.total || sim.timedOut;
  if (sim.tick % 20 === 0) { sim.samples.push({ time: sim.time, speed: sim.cars.length ? sim.cars.reduce((sum, c) => sum + c.v * 3.6, 0) / sim.cars.length : 0 }); if (sim.samples.length > 900) sim.samples.shift(); }
  return sim;
}
export function networkSummary(sim) {
  const completed = sim.completed.length, player = [...sim.cars, ...sim.pending, ...sim.completed, ...sim.failed].find(c => c.isPlayer);
  return { time: sim.time, completed, total: sim.net.total, active: sim.cars.length, pending: sim.pending.length, failed: sim.failed.length, queued: sim.cars.filter(c => c.v < 5 / 3.6).length, meanSpeed: sim.observations ? sim.speedSum / sim.observations : 0, meanTrip: completed ? sim.completed.reduce((sum, c) => sum + c.duration, 0) / completed : null, timedOut: sim.timedOut, player: player ? { id: player.id, status: player.failed ? 'failed' : player.arrived != null ? 'arrived' : player.entered == null ? player.scheduled > sim.time ? 'upcoming' : 'waiting' : sim.timedOut ? 'timeout' : 'following', elapsed: player.duration ?? Math.max(0, sim.time - player.scheduled), waiting: player.waiting ?? Math.max(0, (player.entered ?? sim.time) - player.scheduled), driving: player.arrived != null || player.failed ? player.duration - player.waiting : player.entered == null ? 0 : sim.time - player.entered, laneChanges: player.laneChanges, voluntaryChanges: player.voluntaryChanges } : null };
}
export function vehiclePose(sim, car) {
  const path = sim.net.paths[car.path], previous = car.s < CAR / 2 && car.prevPath ? sim.net.paths[car.prevPath] : null, p = previous ? pointOn(previous, previous.length + car.s - CAR / 2) : pointOn(path, car.s - CAR / 2);
  if (!car.change) return p;
  const old = pointOn(sim.net.paths[car.change.from], car.s - CAR / 2), t = Math.min(1, (sim.time - car.change.start) / 2), smooth = t * t * (3 - 2 * t);
  return { x: old.x + (p.x - old.x) * smooth, y: old.y + (p.y - old.y) * smooth, heading: p.heading };
}
export function networkSnapshot(sim) {
  return { completedCars: sim.completed, pendingCars: sim.pending.map(c=>({id:c.id,origin:c.origin,isPlayer:c.isPlayer})), time: sim.time, tick: sim.tick, finished: sim.finished, signals: Object.fromEntries(Object.values(sim.net.connectors).map(c => [c.id, signalFor(sim, c)])), cars: sim.cars.map(c => ({ ...c, pose: vehiclePose(sim, c) })), stats: networkSummary(sim), failedRoutes: sim.failed.map(c => ({ id: c.id, origin: c.origin, destination: c.destination, reason: c.reason })), samples: sim.samples, entries: sim.config.demand.map(d => ({ id: d.node, active: sim.cars.filter(c => c.origin === d.node).length, pending: sim.pending.filter(c => c.origin === d.node).length, completed: sim.completed.filter(c => c.origin === d.node).length })), exits: Object.values(sim.net.nodes).filter(n => n.type === 'terminal').map(n => ({ id: n.id, completed: sim.completed.filter(c => c.destination === n.id).length })) };
}
export function runNetwork(config) { const sim = createNetworkSimulation(config); while (!sim.finished) stepNetwork(sim); return networkSummary(sim); }
