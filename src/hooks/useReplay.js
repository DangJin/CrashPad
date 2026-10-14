import { useEffect, useRef, useState } from 'react';
import { clamp } from '../model.js';

export const REPLAY_DURATION = 4000;
export function useReplay() {
  const [active, setActive] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [mode, setMode] = useState('actual');
  const progressRef = useRef(0);
  const seek = value => { setPlaying(false); setActive(value < 1); progressRef.current = value; setProgress(value); };
  const exit = () => { setPlaying(false); setActive(false); progressRef.current = 0; setProgress(0); };
  const changeMode = value => { exit(); setMode(value); };
  const start = mode => { progressRef.current = 0; setProgress(0); setMode(mode); setActive(true); setPlaying(true); };
  const startPlanned = () => start('planned');
  const startFull = () => start('full');
  const toggle = () => {
    if (playing) { setPlaying(false); return; }
    if (progressRef.current >= 1) { progressRef.current = 0; setProgress(0); }
    setActive(true); setPlaying(true);
  };
  useEffect(() => {
    if (!playing) return;
    let frame, lastTime = performance.now();
    function tick(now) {
      const next = clamp(progressRef.current + (now - lastTime) * speed / (REPLAY_DURATION * (mode === 'full' ? 2 : 1)), 0, 1);
      lastTime = now; progressRef.current = next; setProgress(next);
      if (next >= 1) { setPlaying(false); setActive(false); }
      else frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, mode]);
  useEffect(() => {
    const pause = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', pause);
    return () => document.removeEventListener('visibilitychange', pause);
  }, []);
  return { active, playing, progress, speed, mode, setSpeed, changeMode, startPlanned, startFull, toggle, seek, exit };
}
