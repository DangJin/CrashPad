import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasPresentation } from '../src/traffic/network/presentation.js';
import { corridorExample, insertTemplate } from '../src/traffic/network/templates.js';
import { compileNetwork, makeExample } from '../src/traffic/network/model.js';
import { moveConnectedNode } from '../src/traffic/network/layout.js';
test('corridor presentation applies only to aligned roads, preserving junction and ramp geometry', () => {
  for (const kind of ['straight', 'toll', 'transition']) {
    const c = corridorExample(kind), p = canvasPresentation(c, compileNetwork(c));
    assert.equal(p.axis, 'horizontal'); assert.ok(p.bounds.width > 900);
  }
  for (const c of [makeExample(), corridorExample('merge')]) assert.equal(canvasPresentation(c, compileNetwork(c)).axis, null);
});
test('successive end additions preserve upstream positions, demand and valid road connections', () => {
  let config = corridorExample('straight');
  for (const [i, kind] of ['drop', 'toll', 'add', 'merge'].entries()) {
    const before = structuredClone(config);
    config = insertTemplate(config, { type: 'node', id: 'end' }, kind, 100 + i).config;
    for (const node of before.nodes.filter(n => n.id !== 'end')) {
      const after = config.nodes.find(n => n.id === node.id);
      assert.equal(after.x, node.x); assert.equal(after.y, node.y);
    }
    assert.equal(compileNetwork(config).total, 100);
  }
});
test('dragging a connected row does not snap back to its own old position', () => {
  const config = corridorExample('toll');
  const moved = moveConnectedNode(config, 'section', 600, 380);
  assert.ok(moved.nodes.every(n => n.y === 380));
});
