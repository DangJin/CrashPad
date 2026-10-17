import { insertCurveSection } from './curveEditing.js';
import { normalizeRamps } from './ramps.js';
import { clone, RADIUS } from './model.js';
import { compileRoad } from '../engine.js';
import { normalizeTrafficConfig } from '../drivingStyles.js';
import { mainEntryCount } from '../roadEvents.js';
export const ROAD_TEMPLATES = { straight: '直路', transition: '车道变化', merge: '匝道汇入', exit: '匝道汇出', toll: '收费站' };
export function nodeRadius(node) { return node.type === 'toll' ? 190 : node.type === 'transition' ? 100 : RADIUS; }
export function corridorExample(kind = 'straight') {
  const lanes = kind === 'toll' ? 4 : 3;
  const config = { version: 1, nodes: [
    { id: 'start', type: 'terminal', name: '主路入口', x: 140, y: 360, rotation: 0, role: 'source' },
    { id: 'section', type: kind, name: ROAD_TEMPLATES[kind], x: 600, y: 360, rotation: 0, length: kind === 'toll' ? 600 : 200, booths: 8, tollLanes: Array(8).fill('etc'), etcSeconds: 2, manualSeconds: 12, priority: 'ew', turns: {} },
    { id: 'end', type: 'terminal', name: '主路出口', x: 1060, y: 360, rotation: 180, role: 'sink' },
  ], roads: [{ id: 'in', from: 'start', to: 'section', lanes, length: 300, speed: 60, oneWay: true }, { id: 'out', from: 'section', to: 'end', lanes: kind === 'transition' ? 1 : lanes, length: 300, speed: 60, oneWay: true }], demand: [{ node: 'start', count: 100, flow: 120, destinations: { end: 100 } }], seed: 42, driverMix: { conservative: 20, normal: 60, aggressive: 20 }, player: null };
  if (['merge', 'exit'].includes(kind)) {
    config.nodes.push({ id: 'branch', type: 'terminal', name: kind === 'merge' ? '匝道入口' : '匝道出口', x: 600, y: 760, rotation: 270, role: kind === 'merge' ? 'source' : 'sink' });
    config.roads.push({ id: 'ramp', from: kind === 'merge' ? 'branch' : 'section', to: kind === 'merge' ? 'section' : 'branch', lanes: 1, length: 250, speed: 40, oneWay: true, kind: 'ramp' });
    if (kind === 'merge') { config.demand[0].count = 80; config.demand.push({ node: 'branch', count: 20, flow: 30, destinations: { end: 100 } }); }
    else config.demand[0].destinations = { end: 80, branch: 20 };
  }
  return normalizeRamps(config);
}
export function convertLinear(source) {
  const old = normalizeTrafficConfig(clone(source)), compiled = compileRoad(old), nodes = [], roads = [], demand = [];
  let x = 140;
  nodes.push({ id: 'legacy-start', type: 'terminal', name: '主路入口', x, y: 380, rotation: 0, role: 'source' });
  let previous = nodes[0].id, lanes = old.initialLanes;
  const exits = [];
  for (const [i, section] of old.segments.entries()) {
    const kind = ['drop', 'add'].includes(section.kind) ? 'transition' : section.kind;
    const radius = kind === 'toll' ? 190 : kind === 'transition' ? 100 : 50;
    x += radius + 260;
    const id = `legacy-${i}`, node = { id, type: kind, name: `${i + 1} · ${ROAD_TEMPLATES[kind]}`, x, y: 380, rotation: 0, length: kind === 'toll' ? Math.max(260, section.length) : section.length, booths: compiled.segments[i].tollBooths ?? lanes, tollLanes: section.tollLanes || [], etcSeconds: section.etcSeconds ?? 2, manualSeconds: section.manualSeconds ?? 12, priority: 'ew', side: section.side, turns: {} };
    if (section.signal?.enabled) node.signal = { enabled: true, plan: 'cycle', green: section.signal.green ?? 30, red: section.signal.red ?? 30, leftGreen: 12, start: section.signal.start ?? 'green' };
    nodes.push(node); roads.push({ id: `legacy-road-${i}`, from: previous, to: id, lanes, length: Math.max(60, section.length), speed: old.speed, oneWay: true });
    if (kind === 'merge' || kind === 'exit') {
      const branch = `${id}-branch`, left = section.side === 'left';
      nodes.push({ id: branch, type: 'terminal', name: `${i + 1} · 匝道${kind === 'merge' ? '入口' : '出口'}`, x, y: left ? 80 : 740, rotation: left ? 90 : 270, role: kind === 'merge' ? 'source' : 'sink' });
      node.rotation = left ? 180 : 0;
      roads.push({ id: `${id}-ramp`, from: kind === 'merge' ? branch : id, to: kind === 'merge' ? id : branch, lanes: 1, length: 200, speed: Math.min(40, old.speed), oneWay: true, kind: 'ramp' });
      if (kind === 'merge') demand.push({ node: branch, count: section.rampCount ?? 0, flow: section.rampFlow ?? 30, destinations: { 'legacy-end': 100 } });
      else exits.push({ node: branch, percent: section.exitPercent ?? 20 });
    }
    previous = id; lanes = compiled.segments[i].lanes;
    x += radius - 50;
  }
  nodes.push({ id: 'legacy-end', type: 'terminal', name: '主路出口', x: x + 310, y: 380, rotation: 180, role: 'sink' });
  roads.push({ id: 'legacy-last', from: previous, to: 'legacy-end', lanes, length: 200, speed: old.speed, oneWay: true });
  let remaining = 100; const destinations = {};
  for (const exit of exits) { const weight = Math.round(remaining * exit.percent / 100); if (weight) destinations[exit.node] = weight; remaining -= weight; }
  destinations['legacy-end'] = remaining;
  demand.unshift({ node: 'legacy-start', count: mainEntryCount(old), flow: old.demand, distribution: old.distribution, destinations });
  return normalizeRamps({ version: 1, nodes, roads, demand, seed: Math.min(999997, old.seed), driverMix: old.driverMix, player: old.playerLane == null ? null : { entry: 'legacy-start', destination: 'legacy-end', lane: old.playerLane, style: old.playerStyle, allowLaneChanges: old.playerLaneChanges }, importedFrom: 'linear' });
}

export function insertTemplate(config, selected, kind, stamp = Date.now()) {
  const next = clone(config), requested = ['add', 'drop'].includes(kind) ? 'transition' : kind;
  const sinks = new Set(next.nodes.filter(n => n.type === 'terminal' && n.role !== 'source').map(n => n.id));
  const road = next.roads.find(r => selected?.type === 'road' && r.id === selected.id)
    || next.roads.find(r => selected?.type === 'node' && r.from === selected.id && r.kind !== 'ramp')
    || next.roads.find(r => selected?.type === 'node' && r.to === selected.id && r.kind !== 'ramp')
    || next.roads.findLast(r => r.kind !== 'ramp' && sinks.has(r.to)) || next.roads.at(-1);
  if (!road) {
    const example = corridorExample(requested), empty = !next.nodes.length;
    const offset = Math.max(0, ...next.nodes.map(n => n.x + 200)), map = Object.fromEntries(example.nodes.map(n => [n.id, `${stamp}-${n.id}`]));
    next.nodes.push(...example.nodes.map(n => ({ ...n, id: map[n.id], x: n.x + offset })));
    next.roads.push(...example.roads.map(r => ({ ...r, id: `${stamp}-${r.id}`, from: map[r.from], to: map[r.to] })));
    next.demand.push(...example.demand.map(d => ({ ...d, node: map[d.node], count: empty ? d.count : 0, destinations: Object.fromEntries(Object.entries(d.destinations).map(([id, weight]) => [map[id], weight])) })));
    return { config: normalizeRamps(next), selected: { type: 'node', id: map.section } };
  }
  if(road.geometry)return insertCurveSection(config,road.id,kind,`section-${stamp}`);
  const from = next.nodes.find(n => n.id === road.from), to = next.nodes.find(n => n.id === road.to), vertical = from.x === to.x, axis = vertical ? 'y' : 'x', other = vertical ? 'x' : 'y', forward = to[axis] > from[axis], low = Math.min(from[axis], to[axis]), high = Math.max(from[axis], to[axis]), middle = (low + high) / 2;
  const appending = selected?.type !== 'road' && to.type === 'terminal' && to.role !== 'source' && next.roads.filter(r => r.from === to.id || r.to === to.id).length === 1;
  const radius = requested === 'toll' ? 190 : requested === 'transition' ? 100 : 50, extra = Math.max(0, 2 * (radius + 180) - (high - low));
  for (const node of next.nodes) if (node[axis] > middle) node[axis] += extra;
  const id = `section-${stamp}`, node = { id, type: requested, name: kind === 'add' ? '车道增加' : kind === 'drop' ? '车道减少' : ROAD_TEMPLATES[requested], x: vertical ? from.x : middle + extra / 2, y: vertical ? middle + extra / 2 : from.y, rotation: vertical ? 90 : 0, length: requested === 'toll' ? 600 : 200, booths: Math.max(8, road.lanes), tollLanes: Array(Math.max(8, road.lanes)).fill('etc'), etcSeconds: 2, manualSeconds: 12, priority: vertical ? 'ns' : 'ew', turns: {} };
  if (appending) {
    // Undo the generic insertion shift: append only extends the terminal.
    for (const original of config.nodes) { const n = next.nodes.find(n => n.id === original.id); n.x = original.x; n.y = original.y; }
    const direction = forward ? 1 : -1;
    node[axis] = from[axis] + direction * (nodeRadius(from) + radius + 100);
    to[axis] = node[axis] + direction * (radius + nodeRadius(to) + 100);
    if (to[axis] < 80) { const shift = 80 - to[axis]; for (const n of next.nodes) n[axis] += shift; node[axis] += shift; }
  }
  const first = { ...road, to: id, length: appending ? road.length : Math.max(60, Math.round(road.length / 2)) }, second = { ...road, id: `road-${stamp}`, from: id, length: appending ? 200 : Math.max(60, Math.round(road.length / 2)), lanes: kind === 'add' ? Math.min(6, road.lanes + 1) : kind === 'drop' ? Math.max(1, road.lanes - 1) : road.lanes };
  if (to.turns?.[road.id]) { to.turns[second.id] = to.turns[road.id]; delete to.turns[road.id]; }
  if (['merge', 'exit'].includes(requested)) {
    // The ramp occupies a free side of the extended corridor.
    const side = forward ? 1 : -1; node.rotation = vertical ? (side > 0 ? 90 : 270) : (side > 0 ? 0 : 180);
    let branchCoordinate = node[other] + (vertical ? -side : side) * 360;
    if (branchCoordinate < 80) { const shift = 80 - branchCoordinate; for (const n of next.nodes) n[other] += shift; node[other] += shift; branchCoordinate = 80; }
    const branch = { id: `${id}-branch`, type: 'terminal', name: requested === 'merge' ? '匝道入口' : '匝道出口', x: vertical ? branchCoordinate : node.x, y: vertical ? node.y : branchCoordinate, rotation: vertical ? (side > 0 ? 0 : 180) : side > 0 ? 270 : 90, role: requested === 'merge' ? 'source' : 'sink' };
    next.nodes.push(branch); next.roads.push({ id: `${id}-ramp`, from: requested === 'merge' ? branch.id : id, to: requested === 'merge' ? id : branch.id, lanes: 1, length: 250, speed: 40, oneWay: true, kind: 'ramp' });
    if (requested === 'merge') { const exit = next.nodes.find(n => n.type === 'terminal' && n.role !== 'source' && n.id !== from.id && n.id !== branch.id); next.demand.push({ node: branch.id, count: 0, flow: 30, destinations: exit ? { [exit.id]: 100 } : {} }); }
  }
  next.nodes.push(node); next.roads = next.roads.filter(r => r.id !== road.id); next.roads.push(first, second);
  return { config: normalizeRamps(next), selected: { type: 'node', id } };
}
