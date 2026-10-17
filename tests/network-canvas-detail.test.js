import test from 'node:test';
import assert from 'node:assert/strict';
import { roadDetail, projectedLaneSpace, visibleLabels } from '../src/traffic/network/canvasDetail.js';

test('detail follows projected lane space, including stretched linear view', () => {
  assert.equal(roadDetail(0, .2, .2).laneLabels, false);
  assert.equal(roadDetail(0, .2, 4).laneLabels, true);
  assert.equal(roadDetail(90, 4, .2).laneLabels, true);
  assert.equal(roadDetail(90, 2, 2).laneLabels, false);
  assert.equal(roadDetail(90, 2, 2, true).compactLabels, true);
  assert.equal(projectedLaneSpace(0, 1, 4), 48);
});

test('labels avoid overlaps in screen space and selected objects take precedence', () => {
  const candidates = [
    { id: 'normal', x: 0, y: 0, text: '主路' },
    { id: 'selected', x: 1, y: 0, text: '车道 1', priority: 90 },
    { id: 'separate', x: 100, y: 0, text: '出口' },
  ];
  assert.deepEqual(visibleLabels(candidates, 1, 1).map(x => x.id), ['selected', 'separate']);
  assert.deepEqual(visibleLabels(candidates, .1, 1).map(x => x.id), ['selected']);
  assert.deepEqual(candidates.map(x => x.id), ['normal', 'selected', 'separate']);
});

test('label offset is measured in screen pixels and window labels require room', () => {
  const labels = [{ id: 'a', x: 0, y: 0, text: 'A' }, { id: 'b', x: 0, y: 0, offsetY: -30, text: 'B' }];
  assert.equal(visibleLabels(labels, .1, .1).length, 2);
  assert.equal(roadDetail(0, .5, .5).boothLabels, false);
  assert.equal(roadDetail(0, .5, 4).boothLabels, true);
  assert.equal(roadDetail(90, 2, 2).boothLabels, false);
});

test('nearby port hit areas do not overlap at mobile overview scale', async () => {
  const { portHitRadius } = await import('../src/traffic/network/canvasDetail.js');
  const ports = [{ x: 50, y: 0 }, { x: 0, y: -50 }];
  const radii = ports.map(point => portHitRadius(point, ports, .14, .14));
  assert.ok(radii[0] + radii[1] < Math.hypot(7, 7));
  assert.equal(portHitRadius(ports[0], ports, 2, 2), 12);
});

test('canvas actions stay above bottom controls without changing road geometry', async () => {
  const { canvasActionAnchor } = await import('../src/traffic/network/canvasDetail.js');
  const point = { x: 350, y: 170 }, bounds = { left: -14, right: 14, top: 16, bottom: 44 };
  const placed = canvasActionAnchor(point, '0 0 360 180', 1, 1, bounds);
  assert.ok(placed.x + 14 <= 352);
  assert.ok(placed.y + 44 <= 118);
  assert.deepEqual(point, { x: 350, y: 170 });
  assert.equal(canvasActionAnchor({ x: 900, y: 170 }, '0 0 360 180', 1, 1, bounds), null);
});
