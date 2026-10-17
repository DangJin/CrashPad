const clone = value => JSON.parse(JSON.stringify(value));
// Expand a toll into entry fan-out, queueing lanes and exit fan-in, hidden behind
// one editable object. Runtime paths use the same engine as all other roads.
export function expandFacilities(config) {
  const next = clone(config), owners = {};
  for (const node of config.nodes.filter(n => n.type === 'toll')) {
    const angle = node.rotation * Math.PI / 180, dx = Math.cos(angle), dy = Math.sin(angle), a = `${node.id}~in`, b = `${node.id}~out`;
    const offset=(node.visualRadius??190)-50;
    const first = { id: a, type: 'transition', name: `${node.name || '收费站'}进站分流`, x: Math.round(node.x - dx * offset), y: Math.round(node.y - dy * offset), rotation: node.rotation, internal: true, owner: node.id }, last = { ...first, signal: node.signal, id: b, name: `${node.name || '收费站'}出站汇流`, x: Math.round(node.x + dx * offset), y: Math.round(node.y + dy * offset) };
    next.nodes = next.nodes.filter(n => n.id !== node.id); next.nodes.push(first, last); owners[a] = owners[b] = node.id;
    const attached = next.roads.filter(r => r.from === node.id || r.to === node.id);
    let forward = false, reverse = false;
    for (const road of attached) {
      const other = config.nodes.find(n => n.id === (road.from === node.id ? road.to : road.from));
      if (!other) continue;
      const low = (other.x - node.x) * dx + (other.y - node.y) * dy < 0;
      const incoming = road.to === node.id;
      if (!road.oneWay || incoming === low) forward = true;
      if (!road.oneWay || incoming !== low) reverse = true;
      if (incoming) road.to = low ? a : b; else road.from = low ? a : b;
    }
    next.roads.push({ id: `${node.id}~bank`, from: forward ? a : b, to: forward ? b : a, lanes: node.booths ?? 8, length: Math.max(60, (node.length ?? 600) - 200), speed: 30, oneWay: !(forward && reverse), internal: true, owner: node.id, toll: { station: node.id, types: node.tollLanes || [], etcSeconds: node.etcSeconds ?? 2, manualSeconds: node.manualSeconds ?? 12 } });
  }
  return { config: next, owners };
}
