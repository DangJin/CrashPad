import { curveCenterline, curveSide, synchronizeCurves, offsetPolyline } from './curveGeometry.js';
import { rampPoints, rampSides } from './ramps.js';
import { clone, LANES, junctionRadius, portPoint, ports, sideOf } from './model.js';

export const minimumNodeGap = (a, b, roads = []) => Math.ceil(Math.max(120, junctionRadius(a, roads) + junctionRadius(b, roads) + 20) / 20) * 20;

// Public geometry includes the complete toll pocket, not its runtime internals.
export function roadMouths(config, road) {
  const a = config.nodes.find(n => n.id === road.from), b = config.nodes.find(n => n.id === road.to);
  if (!a || !b) return null;
  let shape;try{shape=curveCenterline(config,road);}catch(error){return {start:a,end:b,valid:false,error:error.message};}
  if(shape){const angle=Math.atan2(shape.at(-1).y-shape.at(-2).y,shape.at(-1).x-shape.at(-2).x);return {start:shape[0],end:shape.at(-1),fromSide:curveSide(config,road,true),toSide:curveSide(config,road,false),heading:angle*180/Math.PI,dx:Math.cos(angle),dy:Math.sin(angle),valid:true,curve:shape};}
  const curve = rampPoints(config, road), special = rampSides(config, road);
  if (curve && special) {
    const angle = Math.atan2(curve.at(-1).y - curve.at(-2).y, curve.at(-1).x - curve.at(-2).x);
    return { start: curve[0], end: curve.at(-1), fromSide: special[0], toSide: special[1], heading: angle*180/Math.PI, dx: Math.round(Math.cos(angle)), dy: Math.round(Math.sin(angle)), valid: true, curve };
  }
  const fromSide = sideOf(a, b), toSide = sideOf(b, a);
  const start = portPoint({ ...a, radius: junctionRadius(a, config.roads) }, fromSide), end = portPoint({ ...b, radius: junctionRadius(b, config.roads) }, toSide);
  const heading = { east: 0, south: 90, west: 180, north: 270 }[fromSide], angle = heading * Math.PI / 180, dx = Math.round(Math.cos(angle)), dy = Math.round(Math.sin(angle));
  const valid = ports(a).includes(fromSide) && ports(b).includes(toSide) && (a.x === b.x || a.y === b.y) && Math.hypot(a.x - b.x, a.y - b.y) >= minimumNodeGap(a, b, config.roads);
  return { start, end, fromSide, toSide, heading, dx, dy, valid };
}

// Moving a junction translates its horizontal row vertically and its vertical
// column horizontally. Road direction and port ownership remain unchanged.
export function moveConnectedNode(config, id, x, y) {
  const next = clone(config), nodes = Object.fromEntries(next.nodes.map(n => [n.id, n])), selected = nodes[id];
  if (!selected) return next;
  function group(axis) {
    const members = new Set([id]), queue = [id];
    while (queue.length) {
      const current = queue.shift();
      for (const road of config.roads) {
        if (road.kind === 'ramp'||road.geometry) continue;
        const other = road.from === current ? road.to : road.to === current ? road.from : null;
        if (!other || members.has(other) || !nodes[other]) continue;
        const a = nodes[current], b = nodes[other], horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
        if ((axis === 'y') === horizontal) { members.add(other); queue.push(other); }
      }
    }
    return members;
  }
  const columns = group('x'), rows = group('y');
  x = next.nodes.find(n => !columns.has(n.id) && Math.abs(n.x - x) < 24)?.x ?? x;
  y = next.nodes.find(n => !rows.has(n.id) && Math.abs(n.y - y) < 24)?.y ?? y;
  function limit(axis, members, target) {
    let low = 80, high = Infinity;
    for (const road of config.roads) {
      if (road.kind === 'ramp'||road.geometry) continue;
      const a = nodes[road.from], b = nodes[road.to]; if (!a || !b) continue;
      const moving = members.has(a.id) !== members.has(b.id); if (!moving) continue;
      const inside = members.has(a.id) ? a : b, outside = inside === a ? b : a;
      const along = axis === 'x' ? Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) : Math.abs(b.y - a.y) > Math.abs(b.x - a.x);
      if (!along) continue;
      const gap = minimumNodeGap(inside, outside, config.roads);
      if (inside[axis] < outside[axis]) high = Math.min(high, outside[axis] - gap); else low = Math.max(low, outside[axis] + gap);
    }
    // Existing invalid layouts can have no feasible position; preserve this axis
    // rather than jumping across a neighbour and changing its physical port.
    return low > high ? selected[axis] : Math.max(low, Math.min(high, target));
  }
  const nextX = limit('x', columns, x), nextY = limit('y', rows, y);
  for (const node of next.nodes) { if (columns.has(node.id)) node.x = nextX; if (rows.has(node.id)) node.y = nextY; }
  for (const road of config.roads.filter(r => r.kind === 'ramp')) {
    const junction = [nodes[road.from], nodes[road.to]].find(n => ['merge', 'exit'].includes(n.type));
    if (!junction) continue;
    const old = config.nodes.find(n => n.id === junction.id), branch = nodes[road.from === junction.id ? road.to : road.from];
    if (branch && branch.id !== id) { branch.x += junction.x - old.x; branch.y += junction.y - old.y; }
  }
  return synchronizeCurves(config,next);
}

// A one-way road occupies one side of the logical axis. Keep editor cards and
// handles on the visible carriageway centre without moving simulation lanes.
export function displayPortPoint(config, node, side) {
  for (const road of config.roads.filter(r => r.from === node.id || r.to === node.id)) {
    const mouth = roadMouths(config, road);
    if (!mouth || (road.from === node.id ? mouth.fromSide : mouth.toSide) !== side) continue;
    if (mouth.curve) {const points=road.geometry?offsetPolyline(mouth.curve,road.oneWay?road.lanes*LANES/2:0):mouth.curve;return road.from===node.id?points[0]:points.at(-1);}
    const point = road.from === node.id ? mouth.start : mouth.end, offset = road.oneWay ? road.lanes * LANES / 2 : 0;
    return { x: point.x - mouth.dy * offset, y: point.y + mouth.dx * offset };
  }
  return portPoint({ ...node, radius: junctionRadius(node, config.roads) }, side);
}
export function nodeDisplayCenter(config, node) {
  if (node.type !== 'terminal') return node;
  const road = config.roads.find(r => r.from === node.id || r.to === node.id);
  if(road?.geometry){try{const points=offsetPolyline(curveCenterline(config,road,false),road.oneWay?road.lanes*LANES/2:0);return {...node,...(road.from===node.id?points[0]:points.at(-1))};}catch{return node;}}
  if (!road?.oneWay) return node;
  const mouth = roadMouths(config, road); if (!mouth) return node;
  const offset = road.lanes * LANES / 2;
  return { ...node, x: node.x - mouth.dy * offset, y: node.y + mouth.dx * offset };
}
