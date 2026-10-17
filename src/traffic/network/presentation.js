import { LANES } from './model.js';
export function canvasPresentation(config, net) {
  const nodes = Object.fromEntries(config.nodes.map(n => [n.id, n]));
  const main = config.roads.filter(r => nodes[r.from] && nodes[r.to]);
  const axis = main.length && main.every(r => nodes[r.from].y === nodes[r.to].y) ? 'horizontal' : main.length && main.every(r => nodes[r.from].x === nodes[r.to].x) ? 'vertical' : null;
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  const include = p => { left = Math.min(left, p.x); right = Math.max(right, p.x); top = Math.min(top, p.y); bottom = Math.max(bottom, p.y); };
  config.nodes.forEach(include);
  if (net) Object.values(net.paths).forEach(p => p.points.forEach(include));
  if (!Number.isFinite(left)) { left = 100; right = 900; top = 300; bottom = 500; }
  return { axis, bounds: { x: left - 150, y: top - LANES - 55, width: Math.max(300, right - left + 230), height: Math.max(120, bottom - top + LANES * 2 + 110) } };
}
