import { useEffect, useState } from 'react';
export default function NumericField({ title, value, min = 0, max = 1500, step = 1, onChange, onCommit }) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setDraft(String(value)); }, [value, focused]);
  function commit() {
    setFocused(false);
    const parsed = draft.trim() === '' ? value : Number(draft);
    const next = Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed / step) * step)) : value;
    setDraft(String(next)); if (next !== value) (onCommit || onChange)?.(next);
  }
  return <label className="network-field"><span>{title}</span><input type="number" aria-label={title} value={draft} min={min} max={max} step={step} onFocus={() => { setFocused(true); }} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.preventDefault(); setDraft(String(value)); } }}/></label>;
}
