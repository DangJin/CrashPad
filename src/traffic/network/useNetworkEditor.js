import { useRef, useState } from 'react';
import { clone } from './model.js';
import { normalizeRamps } from './ramps.js';
import { createEditHistory } from './editHistory.js';

export default function useNetworkEditor(initial, { onSimulationChange } = {}) {
  const [config, setConfig] = useState(initial);
  const configRef = useRef(config), historyRef = useRef(null);
  if (!historyRef.current) historyRef.current = createEditHistory(initial);
  function apply(result, requestedImpact) {
    if (!result) return false;
    // A caller cannot accidentally classify geometry or traffic changes as labels.
    if (result.impact === 'simulation' || requestedImpact === 'simulation') onSimulationChange?.();
    configRef.current = result.config; setConfig(result.config);
    return true;
  }
  function edit(fn, { impact = 'simulation' } = {}) {
    const next = clone(configRef.current); fn(next);
    return apply(historyRef.current.commit(normalizeRamps(next)), impact);
  }
  function history(redo = false) { return apply(historyRef.current.travel(redo)); }
  return { config, configRef, edit, history, canUndo: historyRef.current.canUndo, canRedo: historyRef.current.canRedo };
}
