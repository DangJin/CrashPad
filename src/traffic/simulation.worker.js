import { createSimulation, stepSimulation } from './engine.js';
import { createNetworkSimulation, stepNetwork, networkSnapshot } from './network/engine.js';
let state = null, taskId = null, mode = 'linear', running = false, rate = 5, timer = null, last = 0, accumulator = 0;
function stop() { running = false; clearTimeout(timer); timer = null; }
function snapshot() { self.postMessage({ type: 'snapshot', taskId, state: mode === 'network' ? networkSnapshot(state) : state, running }); }
function tick() {
  if (!running || !state) return;
  const now = performance.now(); accumulator += Math.min(.25, (now - last) / 1000) * rate; last = now;
  let steps = 0;
  while (accumulator >= .1 && steps++ < 100 && !state.finished) { (mode === 'network' ? stepNetwork : stepSimulation)(state); accumulator -= .1; }
  if (state.finished) stop();
  snapshot(); if (running) timer = setTimeout(tick, 50);
}
self.onmessage = ({ data }) => {
  try {
    if (data.type === 'init') { stop(); taskId = data.taskId; mode = data.mode; state = (mode === 'network' ? createNetworkSimulation : createSimulation)(data.config); accumulator = 0; snapshot(); return; }
    if (data.taskId !== taskId) return;
    if (data.type === 'run') { rate = data.rate ?? rate; if (state.finished) { snapshot(); return; } if (!running) { running = true; last = performance.now(); tick(); } }
    else if (data.type === 'pause') { stop(); snapshot(); }
    else if (data.type === 'rate') rate = data.rate;
    else if (data.type === 'reset') { stop(); state = null; }
  } catch (error) { stop(); self.postMessage({ type: 'error', taskId: data.taskId, message: error.message }); }
};
