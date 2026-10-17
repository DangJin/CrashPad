import { createNetworkSimulation, stepNetwork, networkSummary } from './engine.js';
self.onmessage = ({ data }) => {
  try {
    const results = { A: [], B: [] };
    for (let i = 0; i < 3; i++) for (const key of ['A', 'B']) {
      const sim = createNetworkSimulation({ ...data[key], seed: data.seed + i }); while (!sim.finished) stepNetwork(sim);
      results[key].push(networkSummary(sim)); self.postMessage({ type: 'progress', completed: i * 2 + (key === 'A' ? 1 : 2), total: 6, taskId: data.taskId });
    }
    self.postMessage({ type: 'done', results, taskId: data.taskId });
  } catch (error) { self.postMessage({ type: 'error', message: error.message, taskId: data.taskId }); }
};
