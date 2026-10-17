import { NETWORK_KEY, compileNetwork } from './model.js';
import { normalizeRamps } from './ramps.js';
import { convertLinear, corridorExample } from './templates.js';

// Keep the existing v1 envelope and the legacy draft untouched.
export function restoreNetworkDraft(storage) {
  try {
    const saved = JSON.parse((storage ?? globalThis.localStorage).getItem(NETWORK_KEY));
    if (saved?.config?.version === 1 && Array.isArray(saved.config.nodes) && Array.isArray(saved.config.roads) && Array.isArray(saved.config.demand)
      && saved.config.nodes.every(n => n && typeof n.id === 'string' && typeof n.type === 'string' && Number.isFinite(n.x) && Number.isFinite(n.y))
      && saved.config.roads.every(r => r && typeof r.id === 'string')
      && saved.config.demand.every(d => d && typeof d.node === 'string' && d.destinations && typeof d.destinations === 'object')) {
      return { ...saved, config: normalizeRamps(saved.config) };
    }
  } catch { /* Try the existing legacy fallback. */ }
  try {
    const legacy = JSON.parse((storage ?? globalThis.localStorage).getItem('crashpad:traffic:v1'));
    if (legacy?.config) {
      const config = convertLinear(legacy.config); compileNetwork(config);
      const convert = value => { try { const next = convertLinear(value); compileNetwork(next); return next; } catch { return null; } };
      return { config, A: convert(legacy.A), B: convert(legacy.B) };
    }
  } catch { /* Unsupported originals stay in their original storage key. */ }
  return { config: corridorExample('straight'), A: null, B: null };
}
export function saveNetworkDraft({ config, A, B }, storage) {
  try { (storage ?? globalThis.localStorage).setItem(NETWORK_KEY, JSON.stringify({ config, A, B })); return true; }
  catch { return false; }
}
