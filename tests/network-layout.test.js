import test from 'node:test';
import assert from 'node:assert/strict';
import { roadMouths, moveConnectedNode, nodeDisplayCenter, displayPortPoint } from '../src/traffic/network/layout.js';
import { compileNetwork, makeExample } from '../src/traffic/network/model.js';
import { corridorExample } from '../src/traffic/network/templates.js';
test('roads meet the public toll pocket edges and agree with runtime lanes', () => {
  const config = corridorExample('toll'), net = compileNetwork(config);
  const a = roadMouths(config, config.roads[0]), b = roadMouths(config, config.roads[1]);
  assert.equal(a.valid, true); assert.deepEqual(a.start, { x: 190, y: 360 }); assert.deepEqual(a.end, { x: 410, y: 360 });
  assert.deepEqual(b.start, { x: 790, y: 360 }); assert.deepEqual(b.end, { x: 1010, y: 360 });
  assert.equal(net.edges['in:start'].paths[0].points.at(-1).x, a.end.x);
  assert.equal(net.edges['out:section~out'].paths[0].points[0].x, b.start.x);
});
test('moving connected pockets keeps rows aligned and stops before neighbouring mouths overlap', () => {
  const original = corridorExample('toll'), moved = moveConnectedNode(original, 'section', 600, 660);
  assert.ok(moved.nodes.every(n => n.y === 660)); assert.equal(original.nodes[0].y, 360); compileNetwork(moved);
  const limited = moveConnectedNode(original, 'section', 1040, 360), section = limited.nodes.find(n => n.id === 'section');
  assert.equal(section.x, 800); compileNetwork(limited);
  for (const r of limited.roads) assert.equal(roadMouths(limited, r).valid, true);
});
test('cross junction moves its row and column without diagonal roads or altered routes', () => {
  const moved = moveConnectedNode(makeExample(), 'center', 600, 520), byId = Object.fromEntries(moved.nodes.map(n => [n.id, n]));
  assert.equal(byId.west.y, 520); assert.equal(byId.east.y, 520);
  assert.equal(byId.north.x, 600); assert.equal(byId.south.x, 600);
  assert.equal(compileNetwork(moved).total, 100);
});
test('diagonal legacy drafts show a missing connection instead of solid overlapping asphalt and can be realigned', () => {
  const draft = corridorExample('toll'); draft.nodes.find(n => n.id === 'section').y = 660;
  assert.equal(roadMouths(draft, draft.roads[0]).valid, false);
  const repaired = moveConnectedNode(draft, 'section', 600, 680);
  assert.ok(repaired.nodes.every(n => n.y === 680)); compileNetwork(repaired);
});

test('rotated public road mouths coincide with runtime lane starts and ends', () => {
  for (const rotation of [0, 90, 180, 270]) {
    const config = corridorExample('toll'), theta = rotation * Math.PI / 180, dx = Math.round(Math.cos(theta)), dy = Math.round(Math.sin(theta));
    for (const n of config.nodes) { const x = n.x - 600, y = n.y - 360; n.x = 1000 + x * dx - y * dy; n.y = 1000 + x * dy + y * dx; n.rotation = (n.rotation + rotation) % 360; }
    const net = compileNetwork(config);
    for (const road of config.roads) {
      const mouth = roadMouths(config, road); assert.ok(mouth.valid);
      const edge = Object.values(net.edges).find(e => e.roadId === road.id), path = edge.paths[0], start = path.points[0], end = path.points.at(-1);
      assert.ok(Math.abs(start.x - (mouth.start.x - mouth.dy * 6)) < 1e-6); assert.ok(Math.abs(start.y - (mouth.start.y + mouth.dx * 6)) < 1e-6);
      assert.ok(Math.abs(end.x - (mouth.end.x - mouth.dy * 6)) < 1e-6); assert.ok(Math.abs(end.y - (mouth.end.y + mouth.dx * 6)) < 1e-6);
    }
  }
});

test('one-way terminal cards and handles are centred on asphalt for all orientations', () => {
  for (const rotation of [0, 90, 180, 270]) for (const oneWay of [true, false]) {
    const config = corridorExample('straight'), angle = rotation * Math.PI / 180, dx = Math.round(Math.cos(angle)), dy = Math.round(Math.sin(angle));
    for (const n of config.nodes) { const x = n.x - 600, y = n.y - 360; n.x = 1000 + x * dx - y * dy; n.y = 1000 + x * dy + y * dx; n.rotation = (n.rotation + rotation) % 360; }
    config.roads.forEach(r => { r.oneWay = oneWay; });
    for (const n of config.nodes.filter(n => n.type === 'terminal')) {
      const road = config.roads.find(r => r.from === n.id || r.to === n.id), mouth = roadMouths(config, road), center = nodeDisplayCenter(config, n), side = road.from === n.id ? mouth.fromSide : mouth.toSide, port = displayPortPoint(config, n, side), offset = oneWay ? road.lanes * 12 / 2 : 0;
      assert.equal(center.x, n.x - mouth.dy * offset); assert.equal(center.y, n.y + mouth.dx * offset);
      assert.ok(mouth.dx ? port.y === center.y : port.x === center.x);
    }
  }
});
