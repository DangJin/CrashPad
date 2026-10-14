import { useCallback, useEffect, useRef, useState } from 'react';
import { STORAGE_KEY, createScene, restoreScene, clone, History } from '../model.js';

function loadDraft() {
  try { return restoreScene(localStorage.getItem(STORAGE_KEY)) || createScene(); }
  catch { return createScene(); }
}
export function useEditor() {
  const [scene, setScene] = useState(loadDraft);
  const sceneRef = useRef(scene);
  const historyRef = useRef(null);
  if (!historyRef.current) historyRef.current = new History(scene);
  const [, refreshHistory] = useState(0);
  const [saved, setSaved] = useState(true);
  const textTimer = useRef(null);
  const save = useCallback(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sceneRef.current)); setSaved(true); }
    catch { setSaved(false); }
  }, []);
  const commit = useCallback(() => {
    historyRef.current.push(sceneRef.current);
    refreshHistory(v => v + 1);
    save();
  }, [save]);
  const flushText = useCallback(() => {
    if (textTimer.current !== null) { clearTimeout(textTimer.current); textTimer.current = null; commit(); }
  }, [commit]);
  const replace = useCallback((next, record = false) => {
    sceneRef.current = next; setScene(next);
    if (record) { historyRef.current.push(next); refreshHistory(v => v + 1); }
  }, []);
  const mutate = useCallback(fn => {
    flushText(); const next = clone(sceneRef.current); fn(next); replace(next, true);
  }, [flushText, replace]);
  const updateCar = useCallback((id, fn) => mutate(s => { s.cars = s.cars.map(c => c.id === id ? fn(c) : c); }), [mutate]);
  const updateText = useCallback((field, value) => {
    replace({ ...sceneRef.current, [field]: value });
    clearTimeout(textTimer.current);
    textTimer.current = setTimeout(() => { textTimer.current = null; commit(); }, 650);
  }, [replace, commit]);
  const undo = useCallback(() => { flushText(); replace(historyRef.current.undo()); refreshHistory(v => v + 1); }, [flushText, replace]);
  const redo = useCallback(() => { flushText(); replace(historyRef.current.redo()); refreshHistory(v => v + 1); }, [flushText, replace]);
  useEffect(() => { save(); }, [scene, save]);
  useEffect(() => {
    window.addEventListener('pagehide', save);
    return () => { window.removeEventListener('pagehide', save); clearTimeout(textTimer.current); };
  }, [save]);
  return { scene, sceneRef, replace, commit, mutate, updateCar, updateText, flushText, undo, redo, saved, history: historyRef.current };
}
