import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditHistory, experimentIdentity, changeImpact } from '../src/traffic/network/editHistory.js';
const config = () => ({ version: 1, nodes: [{ id: 'a', name: '入口', x: 100, y: 200 }], roads: [], demand: [], player: null });
test('metadata identity ignores only node names and optionally player', () => {
  const a = config(), b = structuredClone(a); b.nodes[0].name = '新名称';
  assert.equal(experimentIdentity(a), experimentIdentity(b));
  b.nodes[0].x++;
  assert.notEqual(experimentIdentity(a), experimentIdentity(b));
  b.nodes[0].x--; b.player = { lane: 1 };
  assert.equal(experimentIdentity(a, { excludePlayer: true }), experimentIdentity(b, { excludePlayer: true }));
  assert.equal(changeImpact(a, b), 'simulation');
});
test('history keeps rename presentation-only through undo/redo and isolates source objects', () => {
  const a = config(), history = createEditHistory(a), b = structuredClone(a); b.nodes[0].name = '改名';
  assert.equal(history.commit(b).impact, 'presentation'); b.nodes[0].name = '外部修改';
  assert.equal(history.current.nodes[0].name, '改名');
  assert.equal(history.travel().impact, 'presentation'); assert.equal(history.current.nodes[0].name, '入口');
  assert.equal(history.travel(true).impact, 'presentation'); assert.equal(history.current.nodes[0].name, '改名');
});
test('geometry edits invalidate simulation; no-op does not add history; new edit clears redo', () => {
  const a = config(), history = createEditHistory(a);
  assert.equal(history.commit(a), null); assert.equal(history.canUndo, false);
  const b = structuredClone(a); b.nodes[0].x = 300;
  assert.equal(history.commit(b).impact, 'simulation'); assert.equal(history.travel().impact, 'simulation');
  assert.equal(history.canRedo, true); b.nodes[0].name = '另一个编辑'; history.commit(b);
  assert.equal(history.canRedo, false);
});
test('history bounds retained edits', () => {
  const history = createEditHistory(config(), 2);
  for (const x of [200, 300, 400]) { const next = structuredClone(history.current); next.nodes[0].x = x; history.commit(next); }
  history.travel(); history.travel(); assert.equal(history.current.nodes[0].x, 200); assert.equal(history.travel(), null);
});
