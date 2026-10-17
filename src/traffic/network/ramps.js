// Shared ramp layout for the editor and simulation. Coordinates are schematic;
// configured road lengths still determine vehicle travel distance.
export function rampInfo(config, road) {
  if (road.kind !== 'ramp' || !road.oneWay) return null;
  const nodes = Object.fromEntries(config.nodes.map(n => [n.id, n]));
  const junction = [nodes[road.from], nodes[road.to]].find(n => n && ['merge', 'exit'].includes(n.type));
  const branch = junction && nodes[road.from === junction.id ? road.to : road.from];
  if (!junction || branch?.type !== 'terminal') return null;
  const main = config.roads.find(r => r.kind !== 'ramp' && (junction.type === 'merge' ? r.from === junction.id : r.to === junction.id));
  if (!main) return null;
  const a = nodes[main.from], b = nodes[main.to]; if (!a || !b) return null;
  const angle = Math.atan2(b.y - a.y, b.x - a.x), dx = Math.round(Math.cos(angle)), dy = Math.round(Math.sin(angle));
  const side = Math.sign((branch.x - junction.x) * -dy + (branch.y - junction.y) * dx) || 1;
  return { junction, branch, main, dx, dy, side, heading: (angle * 180 / Math.PI + 360) % 360 };
}
export function normalizeRamps(source) {
  const config = structuredClone(source);
  for (const road of config.roads) {
    const info = rampInfo(config, road); if (!info) continue;
    const { junction, branch, main, dx, dy, heading, side } = info;
    const along = (branch.x - junction.x) * dx + (branch.y - junction.y) * dy;
    if (Math.abs(along) < 1) {
      const direction = junction.type === 'merge' ? -1 : 1;
      const neighbours = config.roads.filter(r => r.kind !== 'ramp' && (r.from === junction.id || r.to === junction.id)).map(r => config.nodes.find(n => n.id === (r.from === junction.id ? r.to : r.from)));
      const room = Math.min(Infinity, ...neighbours.map(n => ((n.x-junction.x)*dx+(n.y-junction.y)*dy)*direction).filter(d => d > 0));
      const reach = Math.min(Math.max(120, room - 100), Math.max(180, Math.min(320, Math.hypot(branch.x - junction.x, branch.y - junction.y) * .8)));
      const separation = Math.max(100, main.lanes * 12 + 80);
      branch.x = junction.x + dx * reach * direction - dy * side * separation;
      branch.y = junction.y + dy * reach * direction + dx * side * separation;
    }
    branch.rotation = (heading + (junction.type === 'exit' ? 180 : 0)) % 360;
  }
  return config;
}
export function rampPoints(config, road, lane = 0) {
  const info = rampInfo(config, road); if (!info) return null;
  const { junction: j, branch: b, main, dx, dy, side } = info;
  const radius = j.radius ?? Math.max(50, ...config.roads.filter(r => r.from === j.id || r.to === j.id).map(r => r.lanes * 12 + 8));
  const merging = j.type === 'merge', direction = merging ? -1 : 1;
  const normal = side > 0 ? main.lanes * 12 + (lane + .5) * 12 : (main.oneWay ? 0 : -main.lanes * 12) - (lane + .5) * 12;
  const mouth = { x: j.x + dx * radius * direction - dy * normal, y: j.y + dy * radius * direction + dx * normal };
  const terminal = { x: b.x + dx * 50 * (merging ? 1 : -1) - dy * (lane + .5) * 12, y: b.y + dy * 50 * (merging ? 1 : -1) + dx * (lane + .5) * 12 };
  const start = merging ? terminal : mouth, end = merging ? mouth : terminal;
  const reach = Math.max(20, Math.hypot(end.x - start.x, end.y - start.y) * .4);
  const c1 = { x: start.x + dx * reach, y: start.y + dy * reach }, c2 = { x: end.x - dx * reach, y: end.y - dy * reach };
  return Array.from({ length: 41 }, (_, i) => { const t = i / 40, u = 1 - t; return { x: u*u*u*start.x + 3*u*u*t*c1.x + 3*u*t*t*c2.x + t*t*t*end.x, y: u*u*u*start.y + 3*u*u*t*c1.y + 3*u*t*t*c2.y + t*t*t*end.y }; });
}
export function rampSides(config, road) {
  const info = rampInfo(config, road); if (!info) return null;
  const sides = ['east', 'south', 'west', 'north'];
  const jSide = sides[(info.heading / 90 + (info.side > 0 ? 1 : 3)) % 4];
  const bSide = sides[info.branch.rotation / 90];
  return road.from === info.junction.id ? [jSide, bSide] : [bSide, jSide];
}

// The first portion of a merge is parallel to the mainline. Exit paths reverse
// that sequence: diverge, then travel in the parallel deceleration lane.
export function rampJoinPoints(start, end, merging) {
  return Array.from({ length: 61 }, (_, i) => {
    const t = i / 60;
    const u = merging ? Math.max(0, (t - .55) / .45) : Math.min(1, t / .45);
    const blend = u * u * (3 - 2 * u);
    const angle = (merging ? end.heading : start.heading) * Math.PI / 180;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const along = (end.x - start.x) * dx + (end.y - start.y) * dy;
    const across = (end.x - start.x) * -dy + (end.y - start.y) * dx;
    return { x: start.x + dx * along * t - dy * across * blend, y: start.y + dy * along * t + dx * across * blend };
  });
}
export function rampAuxiliary(config, road) {
  const info = rampInfo(config, road); if (!info) return null;
  const { junction: node, main, dx, dy, side } = info;
  const radius = node.radius ?? Math.max(50, ...config.roads.filter(r => r.from === node.id || r.to === node.id).map(r => r.lanes * 12 + 8));
  const edge = side > 0 ? main.lanes * 12 : main.oneWay ? 0 : -main.lanes * 12;
  const point = (x, y) => ({ x: node.x + dx * x - dy * y, y: node.y + dy * x + dx * y });
  const outer = Array.from({ length: 61 }, (_, i) => {
    const t = i / 60, u = node.type === 'merge' ? Math.max(0, (t - .55) / .45) : Math.min(1, t / .45), blend = u*u*(3-2*u);
    return point(-radius + t*radius*2, edge + side*road.lanes*12*(node.type === 'merge' ? 1-blend : blend));
  });
  const base = [point(-radius, edge), point(radius, edge)];
  const separator = node.type === 'merge' ? [base[0],point(radius*.1,edge)] : [point(-radius*.1,edge),base[1]];
  const curve = rampPoints(config, road, (road.lanes-1)/2);
  const nose = node.type === 'merge' ? curve.slice(-13) : curve.slice(0,13).reverse();
  const inner = nose.map(p => {
    const x=(p.x-node.x)*dx+(p.y-node.y)*dy, y=(p.x-node.x)*-dy+(p.y-node.y)*dx-side*road.lanes*6;
    return point(x,y);
  });
  const gore = inner.length ? [...inner, ...[inner.at(-1),inner[0]].map(p => point((p.x-node.x)*dx+(p.y-node.y)*dy,edge))] : [];
  return { ...info, radius, edge, point, outer, base, separator, polygon: [...base, ...outer.toReversed()], gore };
}
