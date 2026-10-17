import { useEffect, useRef, useState } from 'react';
export default function useSimulation(config) {
  const accepting = useRef(false), worker = useRef(null), token = useRef(0), [snapshot, setSnapshot] = useState(null), [running, setRunning] = useState(false), [error, setError] = useState('');
  function reset() { accepting.current = false; token.current++; worker.current?.terminate(); worker.current = null; setSnapshot(null); setRunning(false); setError(''); }
  function play(rate) {
    if (running) { accepting.current = false; worker.current?.postMessage({ type: 'pause', taskId: token.current }); setRunning(false); return; }
    if (!worker.current || snapshot?.finished) {
      reset(); const id = token.current, task = new Worker(new URL('../simulation.worker.js', import.meta.url), { type: 'module' }); worker.current = task;
      task.onmessage = ({ data }) => { if (data.taskId !== token.current || worker.current !== task) return; if (data.type === 'error') { setError(data.message); setRunning(false); } else { if (!accepting.current) return; setSnapshot(data.state); if (data.state.finished) { accepting.current = false; setRunning(false); } } };
      task.onerror = () => { if (worker.current === task) { setError('模拟计算失败，请重置后重试。'); setRunning(false); } };
      task.postMessage({ type: 'init', mode: 'network', config, taskId: id });
    }
    accepting.current = true; worker.current.postMessage({ type: 'run', taskId: token.current, rate }); setRunning(true);
  }
  function speed(rate) { worker.current?.postMessage({ type: 'rate', taskId: token.current, rate }); }
  useEffect(() => { const pause = () => { if (document.hidden) { accepting.current = false; worker.current?.postMessage({ type: 'pause', taskId: token.current }); setRunning(false); } }; document.addEventListener('visibilitychange', pause); return () => { document.removeEventListener('visibilitychange', pause); worker.current?.terminate(); }; }, []);
  return { snapshot, running, error, reset, play, speed };
}
