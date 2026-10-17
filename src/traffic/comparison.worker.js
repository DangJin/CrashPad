import { runSimulation } from './engine.js';
self.onmessage = ({ data }) => {
  try {
    const results = { A: [], B: [] };
    for (let i = 0; i < data.repeats; i++) for (const key of ['A', 'B']) {
      results[key].push(runSimulation({ ...data[key], seed: data.seed + i }));
      self.postMessage({ type: 'progress', completed: i * 2 + (key === 'A' ? 1 : 2), total: data.repeats * 2 });
    }
    self.postMessage({ type: 'done', results });
  } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
};
