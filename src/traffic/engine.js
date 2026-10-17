import { tollPosition, updateTolls, SIGNAL_DEFAULT, signalState, signalPosition, rampTarget, rampLength, rampJunction, rampMergeEnd, rampPoint, mainEntryCount, assignRoutes } from './roadEvents.js';
import { drivingPolicy, drivingStyle, normalizeTrafficConfig, trafficMix, allocateDriverCounts, STYLE_KEYS } from './drivingStyles.js';
// A small IDM-based educational microsimulation. Distances: metres, time: seconds.
// Fixed dt and seeded driver attributes make comparisons independent of frame rate.
export const DT = .1;
export const VEHICLE_LENGTH = 4.5;
export const MAX_TIME = 1800;
export const DEFAULT_CONFIG = {
  initialLanes: 3, count: 100, demand: 120, speed: 60, aggression: 30, distribution: 'equal', seed: 42, playerLane: null, playerStyle: 'normal', playerLaneChanges: false,
  segments: [
    { id: 'road-1', kind: 'straight', length: 300, change: 1, side: 'right' },
    { id: 'road-2', kind: 'drop', length: 200, change: 1, side: 'right' },
    { id: 'road-3', kind: 'drop', length: 200, change: 1, side: 'right' },
    { id: 'road-4', kind: 'straight', length: 250, change: 1, side: 'right' },
  ],
};
export const copy = value => JSON.parse(JSON.stringify(value));
export function compileRoad(config) {
  const number = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;
  if (!Number.isInteger(config.initialLanes) || !number(config.initialLanes, 1, 6)) throw Error('入口车道数需要为 1～6。');
  if (config.playerLane != null && (!Number.isInteger(config.playerLane) || config.playerLane < 0 || config.playerLane >= config.initialLanes)) throw Error('请选择有效的体验入口车道。');
  if (config.playerLaneChanges !== undefined && typeof config.playerLaneChanges !== 'boolean') throw Error('主动变道设置需要为开或关。');
  if (!drivingStyle(config.playerStyle)) throw Error('请选择有效的驾驶风格。');
  if (!Number.isInteger(config.count) || !number(config.count, 1, 300)) throw Error('车辆数量需要为 1～300。');
  if (!number(config.speed, 20, 120) || !number(config.demand, 10, 240)) throw Error('请检查速度和入口流量。');
  const mix = trafficMix(config);
  if (!mix || STYLE_KEYS.some(key => !Number.isInteger(mix[key]) || !number(mix[key], 0, 100)) || STYLE_KEYS.reduce((sum, key) => sum + mix[key], 0) !== 100) throw Error('三种驾驶风格占比需要为整数且合计 100%。');
  if (!Number.isInteger(config.seed) || !number(config.seed, 1, 999999) || !['equal', 'left', 'right'].includes(config.distribution)) throw Error('请检查随机种子和入口分布。');
  if (!Array.isArray(config.segments) || !config.segments.length || config.segments.length > 10) throw Error('请拼接 1～10 个路段。');
  let x = 0, lo = 0, hi = config.initialLanes - 1;
  const segments = config.segments.map((s, i) => {
    if (!s || !['straight', 'drop', 'add', 'merge', 'exit', 'toll'].includes(s.kind) || !['left', 'right'].includes(s.side) || !number(s.length, 100, 1500) || !Number.isInteger(s.change) || !number(s.change, 1, 5)) throw Error(`第 ${i + 1} 段的长度或车道设置无效。`);
    if (s.kind === 'merge' && (!Number.isInteger(s.rampCount ?? 0) || !number(s.rampCount ?? 0, 0, config.count - 1) || !number(s.rampFlow ?? 30, 10, 240))) throw Error(`第 ${i + 1} 段汇入车辆数或流量无效。`);
    if (s.kind === 'exit' && !number(s.exitPercent ?? 20, 0, 100)) throw Error(`第 ${i + 1} 段驶出比例需要为 0～100%。`);
    if (s.signal) { const signal = { ...SIGNAL_DEFAULT, ...s.signal }; if (typeof signal.enabled !== 'boolean' || !number(signal.green, 5, 120) || !number(signal.red, 5, 120) || !['red', 'green'].includes(signal.start)) throw Error(`第 ${i + 1} 段红绿灯设置无效。`); }
    const from = { lo, hi }, change = s.kind === 'drop' ? -s.change : s.kind === 'add' ? s.change : 0;
    if (s.side === 'left') lo -= change; else hi += change;
    if (s.kind === 'toll') { const exit = s.tollExitLanes ?? (hi - lo + 1); if (!Number.isInteger(exit) || !number(exit, 1, 6)) throw Error(`第 ${i + 1} 段收费站出口需要为 1～6 车道。`); hi = lo + exit - 1; }
    const lanes = hi - lo + 1;
    if (lanes < 1 || lanes > 6) throw Error(`第 ${i + 1} 段连接后为 ${lanes} 车道，请调整入口车道或增减数量（需为 1～6）。`);
    if (s.kind === 'toll' && (s.tollLanes && (!Array.isArray(s.tollLanes) || s.tollLanes.some(type => !['etc', 'manual'].includes(type))) || !number(s.etcSeconds ?? 2, 1, 15) || !number(s.manualSeconds ?? 12, 3, 120))) throw Error(`第 ${i + 1} 段收费窗口设置无效。`);
    const segment = { ...s, index: i, start: x, end: x + s.length, taperStart: x + s.length * .15, taperEnd: x + s.length * .85, from, to: { lo, hi }, lanes, rampCount: s.rampCount ?? 0, rampFlow: s.rampFlow ?? 30, exitPercent: s.exitPercent ?? 20 };
    if (s.kind === 'toll') { const booths = s.tollBooths ?? from.hi - from.lo + 1; if (!Number.isInteger(booths) || !number(booths, Math.max(from.hi - from.lo + 1, lanes), 12)) throw Error(`第 ${i + 1} 段窗口数需不少于进出口车道数，最多 12 个。`); segment.tollBooths = booths; segment.plaza = { lo: from.lo, hi: from.lo + booths - 1 }; }
    x += s.length; return segment;
  });
  if (mainEntryCount(config) < 1) throw Error('汇入车辆总数需要小于车辆总数，主路至少保留 1 辆。');
  return { segments, length: x, minLane: Math.min(0, ...segments.map(s => s.to.lo)), maxLane: Math.max(config.initialLanes - 1, ...segments.map(s => s.plaza?.hi ?? s.to.hi)) };
}
export function roadAt(road, x) {
  return road.segments.find(s => x < s.end) || road.segments.at(-1);
}
function roadPieces(s) {
  if (s.kind !== 'toll') return [s];
  return [
    { ...s, from: s.from, to: s.plaza, taperStart: s.start + s.length * .05, taperEnd: s.start + s.length * .35, end: s.start + s.length * .65 },
    { ...s, from: s.plaza, to: s.to, start: s.start + s.length * .65, taperStart: s.start + s.length * .7, taperEnd: s.start + s.length * .95 },
  ];
}
function pieceAt(road, x) { const pieces = roadPieces(roadAt(road, x)); return pieces.find(s => x < s.end) || pieces.at(-1); }
export function roadEdges(road, x) {
  const s = pieceAt(road, x), t = Math.max(0, Math.min(1, (x - s.taperStart) / (s.taperEnd - s.taperStart)));
  const smooth = t * t * (3 - 2 * t);
  return { lo: s.from.lo + (s.to.lo - s.from.lo) * smooth, hi: s.from.hi + (s.to.hi - s.from.hi) * smooth };
}
function laneExitPosition(section, lane) {
  const rightLoss = section.from.hi - section.to.hi, leftLoss = section.to.lo - section.from.lo;
  let fraction;
  if (lane > section.to.hi && rightLoss > 0) fraction = (section.from.hi - lane + .35) / rightLoss;
  else if (lane < section.to.lo && leftLoss > 0) fraction = (lane - section.from.lo + .35) / leftLoss;
  else return Infinity;
  // Stop while the centre still has room inside the actual curved asphalt edge.
  let low = 0, high = 1;
  for (let i = 0; i < 24; i++) { const t = (low + high) / 2; if (t * t * (3 - 2 * t) < fraction) low = t; else high = t; }
  return section.taperStart + (low + high) / 2 * (section.taperEnd - section.taperStart);
}
export function laneEnd(road, lane, x) {
  for (const s of road.segments.flatMap(roadPieces)) {
    if (s.taperEnd > x - .01 && lane >= s.from.lo && lane <= s.from.hi && (lane < s.to.lo || lane > s.to.hi)) return laneExitPosition(s, lane);
  }
  return road.length + 20;
}
function laneExists(road, lane, x) {
  if (x < 0) return lane >= road.segments[0].from.lo && lane <= road.segments[0].from.hi;
  const s = pieceAt(road, x), edge = roadEdges(road, x);
  return lane >= Math.ceil(edge.lo - .15) && lane <= Math.floor(edge.hi + .15) && x <= laneExitPosition(s, lane);
}
function randomGenerator(seed) {
  let a = seed >>> 0;
  return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function createSimulation(config) {
  config = normalizeTrafficConfig(config);
  const road = compileRoad(config), random = randomGenerator(config.seed);
  const pending = Array.from({ length: config.count }, (_, i) => {
    const laneDraw = random(), desire = random(), risk = random(), paint = random();
    let lane = i % config.initialLanes;
    if (config.distribution !== 'equal' && laneDraw < .65) lane = config.distribution === 'left' ? 0 : config.initialLanes - 1;
    return { id: i + 1, lane, origin: lane, x: -5, v: 0, acc: 0, desired: config.speed / 3.6 * (.9 + desire * .2), risk, aggressive: false, paint: Math.floor(paint * 6), scheduled: i * 60 / config.demand, entered: null, nextDecision: 0, change: null, brakeActive: false };
  });
  const player = config.playerLane == null ? null : pending[Math.floor(mainEntryCount(config) / 2)];
  if (player) { player.isPlayer = true; player.lane = config.playerLane; player.origin = config.playerLane; player.drivingStyle = config.playerStyle; player.allowLaneChanges = config.playerLaneChanges; player.laneChanges = 0; player.voluntaryChanges = 0; }
  assignRoutes(config, road, pending);
  const others = pending.filter(car => !car.isPlayer).sort((a, b) => a.risk - b.risk);
  const counts = allocateDriverCounts(others.length, config.driverMix);
  let offset = 0;
  for (const style of ['aggressive', 'conservative', 'normal']) for (let i = 0; i < counts[style]; i++) others[offset++].drivingStyle = style;
  for (const car of pending) car.aggressive = car.drivingStyle === 'aggressive';
  return { config: copy(config), road, playerId: player?.id ?? null, time: 0, tick: 0, cars: [], pending, completed: [], laneStats: {}, samples: [], cutIns: 0, merges: 0, missedExits: 0, harshBrakes: 0, speedSum: 0, observations: 0, finished: false, timedOut: false };
}
const occupied = car => car.change ? [car.lane, car.change.from] : [car.lane];
function laneIndex(cars) {
  const lanes = new Map();
  for (const c of cars.filter(car => !car.ramp || car.ramp.type === 'exit' && car.ramp.progress < car.ramp.clearAt)) for (const lane of occupied(c)) { if (!lanes.has(lane)) lanes.set(lane, []); lanes.get(lane).push(c); }
  for (const list of lanes.values()) list.sort((a, b) => b.x - a.x || a.id - b.id);
  return lanes;
}
function neighbors(index, lane, x, id) {
  let ahead = null, behind = null;
  for (const c of index.get(lane) || []) {
    if (c.id === id) continue;
    if (c.x > x || c.x === x && c.id < id) ahead = c;
    else { behind = c; break; }
  }
  return { ahead, behind };
}
export function idmAcceleration(car, gap = 10000, leaderSpeed = car.v) {
  const a = 1.5, b = 2, headway = drivingPolicy(car).headway;
  const desiredGap = 2 + Math.max(0, car.v * headway + car.v * (car.v - leaderSpeed) / (2 * Math.sqrt(a * b)));
  return Math.max(-8, Math.min(a, a * (1 - (car.v / car.desired) ** 4 - (desiredGap / Math.max(.1, gap)) ** 2)));
}
function redStop(sim, c) {
  let stop = Infinity;
  for (const segment of sim.road.segments) {
    if (segment.kind === 'toll' && !c.tollPassed?.includes(segment.index) && tollPosition(segment) >= c.x - .01) stop = Math.min(stop, tollPosition(segment));
    const light = signalState(segment, sim.time), position = signalPosition(segment);
    if (light && light.color !== 'green' && position >= c.x - .01) stop = Math.min(stop, position);
  }
  return stop;
}
function leaderFor(sim, c, index) {
  let gap = 10000, speed = c.v;
  for (const lane of occupied(c)) {
    const { ahead } = neighbors(index, lane, c.x, c.id);
    if (ahead && ahead.x - c.x - VEHICLE_LENGTH < gap) { gap = ahead.x - c.x - VEHICLE_LENGTH; speed = ahead.v; }
    const end = laneEnd(sim.road, lane, c.x);
    if (end < sim.road.length && end - c.x < gap) { gap = end - c.x; speed = 0; }
  }
  const stop = redStop(sim, c); if (stop - c.x < gap) { gap = stop - c.x; speed = 0; }
  // Cooperative drivers leave room for an adjacent vehicle approaching a lane end.
  if (!c.aggressive) for (const lane of [c.lane - 1, c.lane + 1]) {
    const request = (index.get(lane) || []).find(other => !other.change && other.x > c.x + VEHICLE_LENGTH + 2 && other.x < c.x + 55 && laneEnd(sim.road, other.lane, other.x) - other.x < 65 && laneEnd(sim.road, c.lane, c.x) > laneEnd(sim.road, other.lane, other.x));
    if (request && request.x - c.x - VEHICLE_LENGTH < gap) { gap = request.x - c.x - VEHICLE_LENGTH - 2.5; speed = request.v; }
  }
  return { gap, speed };
}
function tryChange(sim, car, index) {
  if (car.change || sim.time < car.nextDecision || car.tollService || sim.road.segments.some(s => s.kind === 'toll' && Math.abs(tollPosition(s) - car.x) < 25)) return;
  car.nextDecision = sim.time + .8 + (car.id % 5) * .1;
  const policy = drivingPolicy(car);
  const ending = laneEnd(sim.road, car.lane, car.x);
  const exit = car.exitSegment == null ? null : sim.road.segments[car.exitSegment];
  const exiting = exit && rampJunction(exit) - car.x < 180 && car.x <= rampJunction(exit) && car.lane !== rampTarget(exit);
  const station = sim.road.segments.find(s => s.kind === 'toll' && car.x >= s.start && car.x < tollPosition(s) - 25 && !car.tollPassed?.includes(s.index));
  if (station && car.tollChoice?.segment !== station.index) {
    const choices = Array.from({ length: station.tollBooths }, (_, i) => station.plaza.lo + i);
    const score = lane => sim.cars.filter(c => c.id !== car.id && c.tollChoice?.segment === station.index && c.tollChoice.lane === lane && !c.tollPassed?.includes(station.index)).length * ((station.tollLanes?.[lane - station.plaza.lo] === 'manual' ? station.manualSeconds ?? 12 : station.etcSeconds ?? 2) + 3) + Math.abs(lane - car.lane) * 1.5;
    choices.sort((a, b) => score(a) - score(b) || a - b); car.tollChoice = { segment: station.index, lane: choices[0] };
  }
  const approachingBooth = station && car.tollChoice.lane !== car.lane;
  const mandatory = approachingBooth || exiting || ending - car.x < 180 && ending < sim.road.length;
  if (car.isPlayer && !car.allowLaneChanges && !mandatory) { car.changeCandidate = null; return; }
  // Staying in lane is the reference; optional changes need a tangible advantage.
  const current = leaderFor(sim, car, index), ownAcc = idmAcceleration(car, current.gap, current.speed);
  let best = null;
  for (const lane of [car.lane - 1, car.lane + 1]) {
    if (!laneExists(sim.road, lane, car.x) || !mandatory && !laneExists(sim.road, lane, car.x + 18)) continue;
    const nextEnd = laneEnd(sim.road, lane, car.x);
    const endingSection = sim.road.segments.flatMap(roadPieces).find(s => Math.abs(laneExitPosition(s, car.lane) - ending) < .01);
    const towardsExit = endingSection && (car.lane < endingSection.to.lo ? lane > car.lane : lane < car.lane);
    if (approachingBooth && Math.abs(lane - car.tollChoice.lane) >= Math.abs(car.lane - car.tollChoice.lane)) continue;
    if (approachingBooth ? false : exiting ? Math.abs(lane - rampTarget(exit)) >= Math.abs(car.lane - rampTarget(exit)) : !mandatory && nextEnd < sim.road.length && nextEnd - car.x < Math.max(200, car.v * 12) || mandatory && (nextEnd < ending || nextEnd === ending && !towardsExit)) continue;
    if (!mandatory && car.lastChange?.from === lane && sim.time - car.lastChange.at < policy.returnDelay) continue;
    const { ahead, behind } = neighbors(index, lane, car.x, car.id);
    const frontGap = ahead ? ahead.x - car.x - VEHICLE_LENGTH : 10000;
    const rearGap = behind ? car.x - behind.x - VEHICLE_LENGTH : 10000;
    const minFront = (mandatory ? 1.5 : 2.5) + car.v * policy.front;
    const minRear = (mandatory ? 1.5 : 2.5) + (behind?.v || 0) * policy.rear;
    if (frontGap < minFront || rearGap < minRear) continue;
    const imposed = behind ? idmAcceleration(behind, rearGap, car.v) : 0;
    if (behind && imposed < policy.braking) continue;
    const newAcc = idmAcceleration(car, Math.min(frontGap, nextEnd - car.x, redStop(sim, car) - car.x), ahead?.v ?? car.v);
    const rearBefore = behind ? idmAcceleration(behind, ahead ? ahead.x - behind.x - VEHICLE_LENGTH : 10000, ahead?.v ?? behind.v) : 0;
    const gain = newAcc - ownAcc + policy.courtesy * (imposed - rearBefore);
    const score = mandatory ? 1000 + nextEnd - ending + gain : gain;
    if (!mandatory && (gain < policy.gain || sim.time < 3)) continue;
    if (!best || score > best.score) best = { lane, score };
  }
  if (!best) { car.changeCandidate = null; return; }
  if (!mandatory) {
    if (car.changeCandidate?.lane !== best.lane) { car.changeCandidate = { lane: best.lane, since: sim.time }; return; }
    if (sim.time - car.changeCandidate.since < policy.persistence) return;
  }
  if (best) {
    car.lastChange = { from: car.lane, to: best.lane, at: sim.time, reason: mandatory ? 'mandatory' : 'benefit' };
    car.changeCandidate = null;
    car.laneChanges = (car.laneChanges || 0) + 1;
    if (!mandatory) car.voluntaryChanges = (car.voluntaryChanges || 0) + 1;
    car.change = { from: car.lane, start: sim.time, duration: 2 }; car.lane = best.lane;
    car.nextDecision = sim.time + 2 + policy.cooldown;
    if (mandatory) sim.merges++; else if (car.aggressive) sim.cutIns++;
    // Reserve both lanes immediately so subsequent decisions cannot take the same gap.
    index.clear(); for (const [lane, list] of laneIndex(sim.cars)) index.set(lane, list);
  }
}
export function stepSimulation(sim) {
  if (sim.finished) return sim;
  sim.tick++; sim.time = Math.round(sim.tick * DT * 1e6) / 1e6;
  for (const c of sim.cars) if (c.change) {
    const merge = c.change.rampMerge;
    if (merge ? c.x >= merge.end : sim.time - c.change.start >= c.change.duration) {
      c.change = null;
      if (merge) c.nextDecision = sim.time + drivingPolicy(c).cooldown;
    }
  }
  for (const car of sim.cars) if (!car.ramp && car.exitSegment != null) {
    const segment = sim.road.segments[car.exitSegment], junction = rampJunction(segment);
    if (car.x >= junction && car.lane === rampTarget(segment) && !car.change) car.ramp = { type: 'exit', segment: segment.index, progress: 0, clearAt: rampLength(segment) * .55 };
    else if (car.x > junction + 15) { car.exitSegment = null; sim.missedExits++; } // Missed exits continue on the main road.
  }
  updateTolls(sim);
  let index = laneIndex(sim.cars);
  const remaining = [];
  for (const c of sim.pending) {
    if (c.scheduled > sim.time) { remaining.push(c); continue; }
    if (c.entryRamp != null) {
      const tail = sim.cars.filter(car => car.ramp?.type === 'entry' && car.ramp.segment === c.entryRamp).sort((a, b) => a.ramp.progress - b.ramp.progress)[0];
      if (tail && tail.ramp.progress < VEHICLE_LENGTH + 10) { remaining.push(c); continue; }
      c.ramp = { type: 'entry', segment: c.entryRamp, progress: 0 }; c.entered = sim.time; c.v = c.desired * .4; sim.cars.push(c); continue;
    }
    const tail = index.get(c.lane)?.at(-1), gap = tail ? tail.x - VEHICLE_LENGTH : 10000;
    if (gap < 10) { remaining.push(c); continue; }
    c.x = 0; c.v = Math.min(c.desired * .6, Math.max(0, (gap - 3) / 1.5)); c.entered = sim.time;
    sim.cars.push(c); index = laneIndex(sim.cars);
  }
  sim.pending = remaining;
  for (const car of sim.cars) if (car.ramp?.type === 'entry') {
    const segment = sim.road.segments[car.ramp.segment], junction = rampJunction(segment);
    if (car.ramp.progress < rampLength(segment) - 4) continue;
    const joinX = rampPoint(segment, car.ramp.progress).x;
    const lane = rampTarget(segment), { ahead, behind } = neighbors(index, lane, joinX, car.id);
    if (ahead && ahead.x - joinX - VEHICLE_LENGTH < 2 + car.v * .55 || behind && (joinX - behind.x - VEHICLE_LENGTH < 2 + behind.v * .65 || idmAcceleration(behind, joinX - behind.x - VEHICLE_LENGTH, car.v) < -3)) continue;
    car.ramp = null; car.x = joinX; car.lane = lane;
    car.change = { from: lane + (segment.side === 'left' ? -1 : 1), start: sim.time, duration: 2, rampMerge: { start: junction, end: rampMergeEnd(segment) } };
    car.lastChange = { from: car.change.from, to: lane, at: sim.time, reason: 'mandatory' }; car.laneChanges = (car.laneChanges || 0) + 1; car.nextDecision = sim.time + 9; sim.merges++;
    index = laneIndex(sim.cars);
  }
  for (const c of [...sim.cars].filter(car => !car.ramp).sort((a, b) => b.x - a.x || a.id - b.id)) tryChange(sim, c, index);
  const next = new Map();
  for (const c of sim.cars.filter(car => !car.ramp)) {
    const lead = leaderFor(sim, c, index), acc = idmAcceleration(c, lead.gap, lead.speed);
    next.set(c.id, { x: c.x + Math.max(0, c.v * DT + acc * DT * DT / 2), v: Math.max(0, c.v + acc * DT), acc });
  }
  const rampGroups = new Map();
  for (const car of sim.cars) if (car.ramp) { const key = `${car.ramp.type}-${car.ramp.segment}`; if (!rampGroups.has(key)) rampGroups.set(key, []); rampGroups.get(key).push(car); }
  for (const cars of rampGroups.values()) {
    cars.sort((a, b) => b.ramp.progress - a.ramp.progress);
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i], segment = sim.road.segments[car.ramp.segment], progress = car.ramp.progress;
      const leader = cars[i - 1], end = car.ramp.type === 'entry' ? rampLength(segment) - 1 : Infinity;
      const mainLead = car.ramp.type === 'exit' && progress < car.ramp.clearAt ? neighbors(index, car.lane, car.x, car.id).ahead : null;
      const gap = Math.min(mainLead ? mainLead.x - car.x - VEHICLE_LENGTH : Infinity, end - progress, leader ? leader.ramp.progress - progress - VEHICLE_LENGTH : 10000);
      const acc = idmAcceleration(car, gap, mainLead && mainLead.x - car.x - VEHICLE_LENGTH <= gap + .01 ? mainLead.v : leader?.v ?? (end < Infinity ? 0 : car.v));
      const v = Math.max(0, car.v + acc * DT), limit = leader ? next.get(leader.id).rampProgress - VEHICLE_LENGTH - 1 : Infinity;
      const rampProgress = Math.max(progress, Math.min(mainLead ? progress + mainLead.x - car.x - VEHICLE_LENGTH - 1 : Infinity, end, limit, progress + Math.max(0, car.v * DT + acc * DT * DT / 2)));
      next.set(car.id, { rampProgress, x: rampPoint(segment, rampProgress).x, v: Math.min(v, (rampProgress - progress) / DT), acc });
    }
  }
  // Non-penetration constraint across both occupied lanes during a lane change.
  for (let pass = 0; pass < 2; pass++) for (const [lane, list] of index) {
    for (let i = 0; i < list.length; i++) {
      const c = list[i]; if (c.ramp) continue; const n = next.get(c.id), end = laneEnd(sim.road, lane, c.x);
      let limit = Math.min(end < sim.road.length ? end - 1 : Infinity, redStop(sim, c));
      if (i) limit = Math.min(limit, next.get(list[i - 1].id).x - VEHICLE_LENGTH - 1);
      if (n.x > limit) { n.x = Math.max(c.x, limit); n.v = Math.min(n.v, Math.max(0, (n.x - c.x) / DT)); }
    }
  }
  const active = [];
  for (const c of sim.cars) {
    const update = next.get(c.id), actualAcc = (update.v - c.v) / DT;
    if (actualAcc < -3 && !c.brakeActive) sim.harshBrakes++;
    c.brakeActive = actualAcc < -3;
    Object.assign(c, update, { acc: actualAcc });
    if (c.ramp) c.ramp.progress = update.rampProgress;
    const stats = sim.laneStats[c.lane] ||= { sum: 0, samples: 0, passed: 0 };
    if (!c.ramp) { stats.sum += c.v * 3.6; stats.samples++; } sim.speedSum += c.v * 3.6; sim.observations++;
    if (!c.ramp && c.x >= sim.road.length || c.ramp?.type === 'exit' && c.ramp.progress >= rampLength(sim.road.segments[c.ramp.segment])) { sim.completed.push({ destination: c.ramp?.type === 'exit' ? 'ramp' : 'main', id: c.id, origin: c.origin, lane: c.lane, duration: sim.time - c.scheduled, entered: c.entered, scheduled: c.scheduled, arrived: sim.time, isPlayer: !!c.isPlayer, aggressive: c.aggressive, drivingStyle: c.drivingStyle, allowLaneChanges: c.allowLaneChanges, laneChanges: c.laneChanges || 0, voluntaryChanges: c.voluntaryChanges || 0 }); stats.passed++; }
    else active.push(c);
  }
  sim.cars = active;
  if (sim.tick % 20 === 0) {
    sim.samples.push({ time: sim.time, speed: active.length ? active.reduce((s, c) => s + c.v * 3.6, 0) / active.length : 0, passed: sim.completed.length, queued: active.filter(c => c.v < 5 / 3.6).length });
    if (sim.samples.length > 900) sim.samples.shift();
  }
  sim.timedOut = sim.time >= MAX_TIME && sim.completed.length < sim.config.count;
  sim.finished = sim.completed.length === sim.config.count || sim.timedOut;
  return sim;
}
export function summary(sim) {
  const completed = sim.completed.length, totalDelay = sim.completed.reduce((s, c) => s + c.duration, 0);
  return { rampActive: sim.cars.filter(car => car.ramp).length, rampExited: sim.completed.filter(car => car.destination === 'ramp').length, missedExits: sim.missedExits, time: sim.time, completed, count: sim.config.count, active: sim.cars.length, pending: sim.pending.length, queued: sim.cars.filter(c => c.v < 5 / 3.6).length, meanSpeed: sim.observations ? sim.speedSum / sim.observations : 0, meanTrip: completed ? totalDelay / completed : null, cutIns: sim.cutIns, merges: sim.merges, harshBrakes: sim.harshBrakes, timedOut: sim.timedOut, player: playerStatus(sim) };
}
export function playerStatus(sim) {
  if (!sim.playerId) return null;
  const completed = sim.completed.find(c => c.id === sim.playerId);
  const car = completed || sim.cars.find(c => c.id === sim.playerId) || sim.pending.find(c => c.id === sim.playerId);
  if (!car) return null;
  const elapsed = Math.max(0, (completed ? car.arrived : sim.time) - car.scheduled);
  const waiting = Math.max(0, (car.entered ?? sim.time) - car.scheduled);
  return { drivingStyle: car.drivingStyle || 'normal', allowLaneChanges: !!car.allowLaneChanges, laneChanges: car.laneChanges || 0, voluntaryChanges: car.voluntaryChanges || 0, id: car.id, origin: car.origin, lane: car.lane, status: completed ? 'arrived' : sim.timedOut ? 'timeout' : car.entered != null ? 'following' : sim.time < car.scheduled ? 'upcoming' : 'waiting',
    elapsed, waiting, driving: car.entered == null ? 0 : Math.max(0, (completed ? car.arrived : sim.time) - car.entered),
    duration: completed ? car.duration : null, countdown: Math.max(0, car.scheduled - sim.time), speed: completed ? null : car.v * 3.6,
    position: completed ? sim.road.length : Math.max(0, car.x), rank: completed ? sim.completed.indexOf(completed) + 1 : null };
}
export function runSimulation(config) {
  const sim = createSimulation(config);
  while (!sim.finished) stepSimulation(sim);
  return summary(sim);
}
export function displayLane(car, time) {
  if (!car.change) return car.lane;
  if (car.change.rampMerge) {
    const merge = car.change.rampMerge, progress = Math.min(1, (car.x - merge.start) / (merge.end - merge.start));
    return car.lane + (car.change.from - car.lane) * (1 - progress) ** 2;
  }
  const t = Math.max(0, Math.min(1, (time - car.change.start) / car.change.duration));
  return car.change.from + (car.lane - car.change.from) * t * t * (3 - 2 * t);
}
