import { clone } from './model.js';

// Names belong to presentation; geometry and all unknown fields remain significant.
export function experimentIdentity(config, { excludePlayer = false } = {}) {
  const value = clone(config);
  for (const node of value.nodes || []) delete node.name;
  if (excludePlayer) value.player = null;
  return JSON.stringify(value);
}
export function changeImpact(before, after) {
  return experimentIdentity(before) === experimentIdentity(after) ? 'presentation' : 'simulation';
}
export function createEditHistory(initial, limit = 60) {
  let current = clone(initial), past = [], future = [];
  return {
    get current() { return current; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    commit(next) {
      if (JSON.stringify(next) === JSON.stringify(current)) return null;
      const before = current;
      past = [...past, clone(current)].slice(-limit); future = []; current = clone(next);
      return { config: current, impact: changeImpact(before, current) };
    },
    travel(redo = false) {
      const source = redo ? future : past, target = redo ? past : future;
      if (!source.length) return null;
      const before = current; target.push(clone(current)); current = source.pop();
      return { config: current, impact: changeImpact(before, current) };
    },
  };
}
