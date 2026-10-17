import { curveCenterline, curveLane, curveSide, validateCurve, segmentsCross } from './curveGeometry.js';
import { normalizeRamps, rampInfo, rampPoints, rampSides, rampJoinPoints } from './ramps.js';
import { expandFacilities } from './facilities.js';
// Geometry is in canvas metres. Vehicle progress uses physical path metres.
export const NETWORK_KEY = 'crashpad:network:v1';
export const TURNS = { straight: '直行', left: '左转', right: '右转', uturn: '掉头' };
export const LANES = 12;
export const RADIUS = 50;
export const clone = value => JSON.parse(JSON.stringify(value));
const sides = ['east', 'south', 'west', 'north'];
export const sideNames = { east: '东', south: '南', west: '西', north: '北' };
export function ports(node) {
  const base = node.type === 'terminal' ? [0] : node.type === 'bend' ? [0, 1] : ['anchor', 'straight', 'transition', 'toll'].includes(node.type) ? [0, 2] : ['tee', 'merge', 'exit'].includes(node.type) ? [0, 1, 2] : [0, 1, 2, 3];
  return base.map(side => sides[(side + (node.rotation || 0) / 90) % 4]);
}
export function junctionRadius(node, roads = []) { return Number.isFinite(node.visualRadius) && node.visualRadius > 0 ? node.visualRadius : node.type === 'anchor' ? 30 : node.type === 'toll' ? 190 : node.type === 'transition' && !node.internal ? 100 : node.internal || node.type === 'terminal' ? RADIUS : Math.max(RADIUS, ...roads.filter(r => r.from === node.id || r.to === node.id).map(r => r.lanes * LANES + 8)); }
export function portPoint(node, side) {
  const index = sides.indexOf(side), angle = index * Math.PI / 2;
  return { x: node.x + Math.round(Math.cos(angle) * (node.radius ?? junctionRadius(node))), y: node.y + Math.round(Math.sin(angle) * (node.radius ?? junctionRadius(node))) };
}
export function sideOf(a, b) { return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? b.x > a.x ? 'east' : 'west' : b.y > a.y ? 'south' : 'north'; }
export function turnFor(a, b) {
  const angle = ((Math.round(((b.startHeading??b.heading) - (a.endHeading??a.heading))/90)*90) % 360 + 360) % 360;
  return angle === 0 ? 'straight' : angle === 90 ? 'right' : angle === 270 ? 'left' : 'uturn';
}
export function laneTurns(node, edge, lane) {
  if (node.type === 'anchor') return ['straight','left','right'];
  if (node.type === 'bend') return ['left', 'right'];
  if (['straight', 'transition'].includes(node.type)) return ['straight'];
  if (['merge', 'exit'].includes(node.type)) return ['straight', 'left', 'right'];
  const custom = node.turns?.[edge.roadId]?.[lane];
  if (custom) return custom;
  return ['straight', ...(lane === 0 ? ['left'] : []), ...(lane === edge.lanes - 1 ? ['right'] : [])];
}
export function makeExample(type = 'cross') {
  const nodes = [{ id: 'center', type, x: 500, y: 440, rotation: 0, signal: { enabled: true, plan: 'alternating', green: 25, leftGreen: 12 }, priority: 'ew', turns: {} },
    { id: 'west', type: 'terminal', name: '西侧', x: 140, y: 440, rotation: 0, role: 'both' },
    { id: 'east', type: 'terminal', name: '东侧', x: 860, y: 440, rotation: 180, role: 'both' },
    { id: 'south', type: 'terminal', name: '南侧', x: 500, y: 800, rotation: 270, role: 'both' }];
  if (type === 'cross') nodes.push({ id: 'north', type: 'terminal', name: '北侧', x: 500, y: 80, rotation: 90, role: 'both' });
  const roads = nodes.filter(n => n.type === 'terminal').map(n => ({ id: `r-${n.id}`, from: n.id, to: 'center', lanes: 2, length: 280, speed: 50 }));
  const demand = nodes.filter(n => n.type === 'terminal').map(n => {
    const opposite = { west: 'east', east: 'west', south: 'north', north: 'south' }[n.id];
    const targets = nodes.filter(t => t.type === 'terminal' && t.id !== n.id);
    const weights = targets.map(t => t.id === opposite ? 60 : ((n.id === 'west' && t.id === 'north') || (n.id === 'east' && t.id === 'south') || (n.id === 'south' && t.id === 'west') || (n.id === 'north' && t.id === 'east')) ? 30 : 10);
    const total = weights.reduce((a, b) => a + b, 0);
    const destinations = Object.fromEntries(targets.map((t, i) => [t.id, i === targets.length - 1 ? 100 - weights.slice(0, i).reduce((sum, w) => sum + Math.round(w / total * 100), 0) : Math.round(weights[i] / total * 100)]));
    return { node: n.id, count: 25, flow: 20, destinations };
  });
  return { version: 1, nodes, roads, demand, seed: 42, driverMix: { conservative: 20, normal: 60, aggressive: 20 }, player: null };
}
export function pathGeometry(points, physicalLength) {
  const cumulative = [0]; for (let i = 1; i < points.length; i++) cumulative.push(cumulative.at(-1) + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  return { points, cumulative, geometryLength: cumulative.at(-1), length: physicalLength ?? cumulative.at(-1) };
}
export function pointOn(path, s) {
  const distance = Math.max(0, Math.min(1, s / path.length)) * path.geometryLength;
  let i = 1; while (i < path.cumulative.length - 1 && path.cumulative[i] < distance) i++;
  const a = path.points[i - 1], b = path.points[i], t = (distance - path.cumulative[i - 1]) / Math.max(.001, path.cumulative[i] - path.cumulative[i - 1]);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, heading: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI };
}
const between = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
// Schematic curvature in canvas units. 1.8 m/s² is a model comfort parameter,
// not a calibrated real-road speed recommendation.
export function bendSpeedLimit(points, roadLimit) {
  let radius=Infinity;
  for(let i=1;i<points.length-1;i++) {
    const a=points[i-1],b=points[i],c=points[i+1];
    const cross=Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x));
    if(cross<1e-8)continue;
    radius=Math.min(radius,Math.hypot(b.x-a.x,b.y-a.y)*Math.hypot(c.x-b.x,c.y-b.y)*Math.hypot(c.x-a.x,c.y-a.y)/(2*cross));
  }
  return Math.min(roadLimit,Math.sqrt(1.8*radius)*3.6);
}
export function connectorGeometry(incoming, outgoing, lane, targetLane) {
  const start = pointOn(incoming.paths[lane], incoming.length), end = pointOn(outgoing.paths[targetLane], 0), h1 = start.heading * Math.PI / 180, h2 = end.heading * Math.PI / 180;
  if (incoming.kind === 'ramp' || outgoing.kind === 'ramp') return pathGeometry(rampJoinPoints(start, end, incoming.kind === 'ramp'));
  const turn = turnFor(incoming, outgoing), reach = incoming.curved||outgoing.curved?Math.min(34,Math.hypot(end.x-start.x,end.y-start.y)*.4):turn === 'uturn' ? 42 : 34;
  const c1 = { x: start.x + Math.cos(h1) * reach, y: start.y + Math.sin(h1) * reach }, c2 = { x: end.x - Math.cos(h2) * reach, y: end.y - Math.sin(h2) * reach };
  const points = Array.from({ length: 41 }, (_, i) => { const t = i / 40; return between(between(between(start, c1, t), between(c1, c2, t), t), between(between(c1, c2, t), between(c2, end, t), t), t); });
  return pathGeometry(points);
}
export function compileNetwork(source) {
  source = normalizeRamps(source);
  if (!source || !Array.isArray(source.nodes) || !Array.isArray(source.roads)) throw Error('路网配置无效。');
  if (source.nodes.length > 40 || source.roads.length > 60) throw Error('路网最多 40 个对象、60 条道路。');
  for (const road of source.roads) if (!Number.isInteger(road.lanes) || road.lanes < 1 || road.lanes > 6) throw Error('道路每方向支持 1～6 条车道。');
  for (const node of source.nodes.filter(n => n.type === 'toll')) {
    const attached = source.roads.filter(r => r.from === node.id || r.to === node.id);
    if (!Number.isInteger(node.booths ?? 8) || (node.booths ?? 8) < Math.max(1, ...attached.map(r => r.lanes)) || (node.booths ?? 8) > 12 || !Number.isFinite(node.length ?? 600) || (node.length ?? 600) < 260 || (node.length ?? 600) > 1500 || !Number.isFinite(node.etcSeconds ?? 2) || (node.etcSeconds ?? 2) < 1 || (node.etcSeconds ?? 2) > 15 || !Number.isFinite(node.manualSeconds ?? 12) || (node.manualSeconds ?? 12) < 3 || (node.manualSeconds ?? 12) > 120 || node.tollLanes && (!Array.isArray(node.tollLanes) || node.tollLanes.some(t => !['etc', 'manual'].includes(t)))) throw Error('收费站窗口数须不少于进出口车道数、最多 12 个；广场长度 260～1500 米，处理时间设置无效。');
  }
  const expanded = expandFacilities(source), config = expanded.config;

  if (config?.version !== 1 || !Array.isArray(config.nodes) || !Array.isArray(config.roads) || !Array.isArray(config.demand)) throw Error('路网配置版本无效。');
  if (!config.nodes.length || config.nodes.length > 80 || config.roads.length > 100) throw Error('路网支持 1～40 个对象、最多 60 条道路。');
  if (!Number.isInteger(config.etcPercent ?? 100) || (config.etcPercent ?? 100) < 0 || (config.etcPercent ?? 100) > 100) throw Error('ETC 车辆占比须为 0～100 的整数。');
  if (!Number.isInteger(config.seed) || config.seed < 1 || config.seed > 999997) throw Error('随机种子需要为 1～999997。');
  const nodes = Object.fromEntries(config.nodes.map(n => [n.id, { ...n, radius: junctionRadius(n, config.roads) }]));
  if (Object.keys(nodes).length !== config.nodes.length || new Set(config.roads.map(r => r.id)).size !== config.roads.length) throw Error('对象编号重复。');
  for (const n of config.nodes) {
    if (!['anchor', 'cross', 'tee', 'bend', 'terminal', 'straight', 'transition', 'merge', 'exit'].includes(n.type) || ![0, 90, 180, 270].includes(n.rotation) || !Number.isFinite(n.x) || !Number.isFinite(n.y)) throw Error('道路对象位置或类型无效。');
    if (['straight', 'transition'].includes(n.type) && !n.internal && n.length != null && (!Number.isFinite(n.length) || n.length < 60 || n.length > 1500)) throw Error('路段长度需要为 60～1500 米。');
    if (n.signal && (typeof n.signal.enabled !== 'boolean' || !['alternating', 'protected', 'cycle'].includes(n.signal.plan) || !Number.isFinite(n.signal.green) || n.signal.green < 5 || n.signal.green > 120 || n.signal.plan === 'cycle' && (!Number.isFinite(n.signal.red ?? 30) || (n.signal.red ?? 30) < 5 || (n.signal.red ?? 30) > 120) || !Number.isFinite(n.signal.leftGreen) || n.signal.leftGreen < 5 || n.signal.leftGreen > 120)) throw Error('信号时长需要为 5～120 秒。');
  }
  for (const n of config.nodes) if (n.mergePolicy != null && !['priority', 'cooperative', 'assertive', 'zipper'].includes(n.mergePolicy)) throw Error('匝道汇入策略无效。');
  const edges = {}, paths = {}, usedPorts = new Set();
  for (const road of config.roads) {
    const a = nodes[road.from], b = nodes[road.to];
    if (!a || !b || a.id === b.id) throw Error('道路连接了不存在的对象。');
    if (!Number.isInteger(road.lanes) || road.lanes < 1 || road.lanes > (road.internal ? 12 : 6) || !Number.isFinite(road.length) || road.length < 60 || road.length > 1500 || !Number.isFinite(road.speed) || road.speed < 20 || road.speed > 120) throw Error('道路每方向 1～6 车道，长度 60～1500 米，限速 20～120。');
    const curve=curveCenterline(config,road);if(curve)validateCurve(curve);
    if (!curve && !rampInfo(config, road) && (a.x !== b.x && a.y !== b.y || Math.hypot(a.x - b.x, a.y - b.y) < Math.max(120, a.radius + b.radius + 10))) throw Error('道路两端须水平或垂直对齐，间距至少 120。');
    for (const [from, to] of [[a, b], [b, a]]) {
      const special = rampSides(config, road), side = curve ? curveSide(config,road,from.id===road.from) : special ? special[from.id === road.from ? 0 : 1] : sideOf(from, to), port = `${from.id}:${side}`;
      if (!ports(from).includes(side) || usedPorts.has(port)) throw Error(`${from.name || from.id} 的${sideNames[side]}侧连接不兼容或已被占用。`);
      usedPorts.add(port);
    }
    for (const [from, to] of (road.oneWay ? [[a, b]] : [[a, b], [b, a]])) {
      const ramp = rampInfo(config, road), side = ramp ? sides[ramp.heading / 90] : sideOf(from, to);
      const heading = sides.indexOf(side) * 90, angle = heading * Math.PI / 180, dx = Math.cos(angle), dy = Math.sin(angle), edge = { id: `${road.id}:${from.id}`, roadId: road.id, kind: road.kind, from: from.id, to: to.id, heading, lanes: road.lanes, length: road.length, speed: road.speed, owner: road.owner || road.id, toll: road.toll, paths: [] };
      for (let lane = 0; lane < road.lanes; lane++) {
        const offset = (lane + .5) * LANES, fromRadius = from.radius, toRadius = to.radius, start = { x: from.x + dx * fromRadius - dy * offset, y: from.y + dy * fromRadius + dx * offset }, end = { x: to.x - dx * toRadius - dy * offset, y: to.y - dy * toRadius + dx * offset };
        const path = { ...pathGeometry(curveLane(config,road,lane,from.id!==road.from) || rampPoints(config, road, lane) || [start, end], road.length), id: `${edge.id}:${lane}`, edge: edge.id, lane, type: 'road', speed: road.speed, toll: road.toll ? { ...road.toll, key: `${road.toll.station}:${edge.from}`, booth: lane, type: road.toll.types[lane] || 'etc' } : null };
        edge.paths.push(path); paths[path.id] = path;
      }
      if(curve){edge.curved=true;edge.startHeading=pointOn(edge.paths[0],0).heading;edge.endHeading=pointOn(edge.paths[0],edge.length).heading;edge.heading=edge.endHeading;}
      edges[edge.id] = edge;
    }
  }
  // At-grade crossings must be represented by an explicit junction object.
  for (let i = 0; i < config.roads.length; i++) for (let j = i + 1; j < config.roads.length; j++) {
    const a = config.roads[i], b = config.roads[j];
    if ([a.from, a.to].some(id => id === b.from || id === b.to)) continue;
    if (a.geometry || b.geometry || rampInfo(config, a) || rampInfo(config, b)) {
      const ap = Object.values(edges).find(e => e.roadId === a.id).paths[0].points;
      const bp = Object.values(edges).find(e => e.roadId === b.id).paths[0].points;
      const cross = (p, q, r) => (q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
      for (let k=1;k<ap.length;k++) for(let l=1;l<bp.length;l++) {
        if((a.geometry||b.geometry)?segmentsCross(ap[k-1],ap[k],bp[l-1],bp[l]):cross(ap[k-1],ap[k],bp[l-1])*cross(ap[k-1],ap[k],bp[l])<0 && cross(bp[l-1],bp[l],ap[k-1])*cross(bp[l-1],bp[l],ap[k])<0) throw Error(a.geometry||b.geometry?'曲线与其他道路交叉，请调整控制点；交叉处需明确路口或立交关系。':'匝道与其他道路交叉，请调整位置。');
      }
      continue;
    }
    const a0 = nodes[a.from], a1 = nodes[a.to], b0 = nodes[b.from], b1 = nodes[b.to];
    const overlap = (p, q, r, s) => Math.max(Math.min(p, q), Math.min(r, s)) <= Math.min(Math.max(p, q), Math.max(r, s));
    if (overlap(a0.x, a1.x, b0.x, b1.x) && overlap(a0.y, a1.y, b0.y, b1.y)) throw Error('道路交叉或重叠处需要插入路口对象，不能直接穿过。');
  }
  const connectors = {}, incoming = {}, outgoing = {};
  for (const edge of Object.values(edges)) { (incoming[edge.to] ??= []).push(edge); (outgoing[edge.from] ??= []).push(edge); }
  for (const node of config.nodes) {
    const degree = config.roads.filter(r => r.from === node.id || r.to === node.id).length;
    if (!degree) throw Error(`${node.name || node.id} 尚未连接道路。`);
    if (node.type === 'terminal') { if (degree !== 1) throw Error('入口 / 出口只能连接一条道路。'); continue; }
    if (degree !== ports(node).length) throw Error(`${node.name || node.id} 存在未连接的端口。`);
    for (const a of incoming[node.id] || []) for (const b of outgoing[node.id] || []) {
      const turn = turnFor(a, b);
      for (let lane = 0; lane < a.lanes; lane++) {
        if (node.type === 'exit' && b.kind === 'ramp') {
          const info = rampInfo(config, config.roads.find(r => r.id === b.roadId));
          if (lane !== (info?.side < 0 ? 0 : a.lanes - 1)) continue;
        }
        const turns = laneTurns(node, a, lane);
        if (!Array.isArray(turns) || turns.some(t => !Object.hasOwn(TURNS, t))) throw Error('车道转向设置无效。');
        if (!turns.includes(turn)) continue;
        const turningLanes = Array.from({ length: a.lanes }, (_, i) => i).filter(i => laneTurns(node, a, i).includes(turn));
        const turnIndex = turningLanes.indexOf(lane);
        const widening = !node.internal && ['anchor', 'straight', 'transition'].includes(node.type) && !a.toll && b.lanes > a.lanes;
        const targets = b.toll ? Array.from({ length: b.lanes }, (_, i) => i) : widening ? Array.from({length: Math.floor((lane+1)*b.lanes/a.lanes)-Math.floor(lane*b.lanes/a.lanes)},(_,i)=>Math.floor(lane*b.lanes/a.lanes)+i) : [a.kind === 'ramp' ? (rampInfo(config, config.roads.find(r => r.id === a.roadId))?.side < 0 ? 0 : b.lanes - 1) : a.toll ? Math.min(b.lanes - 1, Math.floor(lane * b.lanes / a.lanes)) : node.type === 'bend' ? Math.min(lane, b.lanes - 1) : ['anchor', 'straight', 'transition'].includes(node.type) ? Math.min(lane, b.lanes - 1) : turn === 'right' ? Math.max(0, b.lanes - turningLanes.length + turnIndex) : turn === 'straight' ? Math.min(lane, b.lanes - 1) : turn === 'left' ? Math.min(turnIndex, b.lanes - 1) : 0];
        for (const targetLane of targets) {
        const geometry = connectorGeometry(a, b, lane, targetLane);
        const path = { ...geometry, length: ['straight', 'transition'].includes(node.type) && !node.internal ? node.length ?? geometry.length : geometry.length, id: `c:${a.id}:${lane}>${b.id}${b.toll || widening ? `:${targetLane}` : ''}`, type: 'connector', node: node.id, from: a.paths[lane].id, to: b.paths[targetLane].id, turn, incoming: a.id, outgoing: b.id, speed: ['anchor','bend'].includes(node.type) ? bendSpeedLimit(geometry.points, Math.min(a.speed,b.speed)) : ['transition', 'straight'].includes(node.type) || (['merge', 'exit'].includes(node.type) && turn === 'straight') ? Math.min(a.speed, b.speed) : turn === 'straight' ? 35 : turn === 'uturn' ? 12 : 22, conflicts: [], mergeGroup: ['anchor', 'straight', 'transition', 'merge', 'exit'].includes(node.type) && !b.toll ? b.paths[targetLane].id : null };
        connectors[path.id] = paths[path.id] = path;
        }
      }
    }
  }
  const values = Object.values(connectors);
  for (let i = 0; i < values.length; i++) for (let j = i; j < values.length; j++) {
    const a = values[i], b = values[j];
    if (a.node !== b.node) continue;
    if (a.id === b.id || a.to === b.to || a.points.some(p => b.points.some(q => Math.hypot(p.x - q.x, p.y - q.y) < 7))) { a.conflicts.push(b.id); if (a !== b) b.conflicts.push(a.id); }
  }
  // Reserve shared/crossing regions until the vehicle tail clears them.
  // Paths sharing an output still need ordered merging and cannot release early.
  for (const a of values) {
    for (const id of a.conflicts) {
      const b = connectors[id];
      if (a.id === b.id || a.to === b.to) continue;
      let last = -1;
      for (let j = 0; j < b.points.length; j++) {
        if (a.points.some(p => Math.hypot(p.x - b.points[j].x, p.y - b.points[j].y) < 7)) last = j;
      }
      if (last < 0) continue;
      const end = b.cumulative[Math.min(last + 1, b.points.length - 1)] / b.geometryLength * b.length + 6.5;
      (a.conflictRelease ??= {})[b.id] = end;
    }
  }
  const net = { nodes, edges, paths, connectors, incoming, outgoing, owners: expanded.owners };
  let total = 0;
  const seen = new Set();
  for (const demand of config.demand) {
    const node = nodes[demand.node];
    if (!node || node.type !== 'terminal' || node.role === 'sink' || seen.has(node.id)) throw Error('入口需求对应的对象无效或重复。');
    seen.add(node.id);
    if (!Number.isInteger(demand.count) || demand.count < 0 || !Number.isFinite(demand.flow) || demand.flow < 1 || demand.flow > 240) throw Error('入口数量须为非负整数，流量为 1～240 辆/分钟。');
    if (demand.distribution != null && !['equal', 'left', 'right'].includes(demand.distribution)) throw Error('入口分布无效。');
    total += demand.count;
    const destinations = Object.entries(demand.destinations || {});
    if (demand.count && (destinations.reduce((sum, [, value]) => sum + value, 0) !== 100 || destinations.some(([, value]) => !Number.isInteger(value) || value < 0 || value > 100))) throw Error(`${node.name || node.id} 的目的地比例须为整数且合计 100%。`);
    for (const [destination, weight] of destinations) if (weight > 0 && (!nodes[destination] || nodes[destination].role === 'source' || !findRoute(net, node.id, destination))) throw Error(`${node.name || node.id} 到 ${nodes[destination]?.name || destination} 没有可行路线。`);
  }
  if (total < 1 || total > 300) throw Error('入口车辆总数需要为 1～300。');
  if (!config.driverMix || Object.values(config.driverMix).some(v => !Number.isInteger(v) || v < 0) || ['conservative', 'normal', 'aggressive'].reduce((sum, key) => sum + (config.driverMix[key] ?? NaN), 0) !== 100) throw Error('驾驶风格占比须合计 100%。');
  if (config.player && (!seen.has(config.player.entry) || !findRoute(net, config.player.entry, config.player.destination) || !Number.isInteger(config.player.lane) || config.player.lane < 0 || config.player.lane >= (outgoing[config.player.entry]?.[0]?.lanes || 0) || !['conservative', 'normal', 'aggressive'].includes(config.player.style) || typeof config.player.allowLaneChanges !== 'boolean' || !config.demand.find(d => d.node === config.player.entry)?.count)) throw Error('我的入口、车道、目的地或风格无效。');
  if ((config.etcPercent ?? 100) < 100) {
    const routes = config.demand.filter(d => d.count).flatMap(d => Object.entries(d.destinations).filter(([, weight]) => weight > 0).map(([destination]) => findRoute(net, d.node, destination)));
    if (config.player) routes.push(findRoute(net, config.player.entry, config.player.destination));
    for (const route of routes) for (const id of route || []) {
      const edge = net.edges[id];
      if (edge.toll && !edge.paths.some(p => p.toll.type === 'manual')) throw Error('路线上的收费站仅有 ETC 窗口：请增加人工窗口，或将 ETC 车辆占比设为 100%。');
    }
  }
  net.total = total;
  return net;
}
// Dijkstra state includes the incoming edge, so turn restrictions constrain routes.
export function findRoute(net, entry, destination, firstEdge = null) {
  if (net.nodes[destination]?.type !== 'terminal') return null;
  const starts = firstEdge ? [net.edges[firstEdge]].filter(Boolean) : net.outgoing[entry] || [];
  const queue = starts.map(edge => ({ edge, cost: edge.length, route: [edge.id] })), visited = new Set();
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost || a.edge.id.localeCompare(b.edge.id));
    const item = queue.shift(); if (visited.has(item.edge.id)) continue; visited.add(item.edge.id);
    if (item.edge.to === destination) return item.route;
    if (net.nodes[item.edge.to].type === 'terminal') continue;
    const connections = Object.values(net.connectors).filter(c => c.incoming === item.edge.id);
    for (const next of new Set(connections.map(c => c.outgoing))) if (!visited.has(next)) queue.push({ edge: net.edges[next], cost: item.cost + net.edges[next].length, route: [...item.route, next] });
  }
  return null;
}
