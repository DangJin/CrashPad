import test from 'node:test';
import { DEFAULT_CONFIG } from '../src/traffic/engine.js';
import assert from 'node:assert/strict';
import { restoreNetworkDraft, saveNetworkDraft } from '../src/traffic/network/storage.js';
import { NETWORK_KEY, makeExample } from '../src/traffic/network/model.js';
function memory(entries = {}) { const data = new Map(Object.entries(entries)); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), data }; }
test('network v1 roundtrip retains comparison snapshots and unrelated drafts', () => {
  const config = makeExample(), storage = memory({ 'crashpad:traffic:v1': 'keep me' });
  const saved = { config, A: structuredClone(config), B: null };
  assert.equal(saveNetworkDraft(saved, storage), true);
  assert.deepEqual(restoreNetworkDraft(storage), saved);
  assert.equal(storage.getItem('crashpad:traffic:v1'), 'keep me');
});
test('invalid storage recovers without overwriting its contents', () => {
  for (const value of ['{', JSON.stringify({config:{version:1,nodes:[{}],roads:[],demand:[]}})]) {
    const storage = memory({ [NETWORK_KEY]: value });
    const result = restoreNetworkDraft(storage);
    assert.ok(result.config.nodes.length); assert.equal(result.A, null);
    assert.equal(storage.getItem(NETWORK_KEY), value);
  }
});
test('denied storage and quota errors are handled explicitly', () => {
  const storage = { getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); } };
  assert.ok(restoreNetworkDraft(storage).config.nodes.length);
  assert.equal(saveNetworkDraft({config:makeExample(),A:null,B:null}, storage), false);
});

test('legacy fallback converts config and A without mutating the original key', () => {
  const legacy = JSON.stringify({ config: DEFAULT_CONFIG, A: DEFAULT_CONFIG, B: null });
  const storage = memory({ 'crashpad:traffic:v1': legacy });
  const result = restoreNetworkDraft(storage);
  assert.equal(result.config.version, 1); assert.ok(result.A.nodes.length); assert.equal(result.B, null);
  assert.equal(storage.getItem('crashpad:traffic:v1'), legacy); assert.equal(storage.getItem(NETWORK_KEY), null);
});
