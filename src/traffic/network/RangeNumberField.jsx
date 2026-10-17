import { useEffect, useId, useRef, useState } from 'react';
export default function RangeNumberField({ title, value, min = 0, max = 100, step = 1, suffix = '%', compact = false, onChange }) {
  const id = useId(), active = useRef(false), pending = useRef(String(value)), [draft, setDraft] = useState(String(value));
  function update(next) { pending.current = String(next); setDraft(String(next)); }
  useEffect(() => { if (!active.current) update(value); }, [value]);
  function cancel() { active.current = false; update(value); }
  function commit() {
    if (!active.current) return;
    active.current = false;
    const parsed = pending.current.trim() === '' ? value : Number(pending.current);
    const next = Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed / step) * step)) : value;
    update(next); if (next !== value) onChange(next);
  }
  const rangeValue = Number.isFinite(Number(draft)) && draft.trim() !== '' ? Math.min(max, Math.max(min, Number(draft))) : value;
  return <div className={`network-range-field${compact ? ' is-compact' : ''}`}>
    <div className="network-range-heading"><label htmlFor={id}>{title}</label><span className="network-range-number"><input id={id} aria-label={title} type="number" inputMode="numeric" min={min} max={max} step={step} value={draft} onFocus={() => { active.current = true; }} onChange={e => { active.current = true; update(e.target.value); }} onBlur={commit} onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.preventDefault(); cancel(); } }}/><span>{suffix}</span></span></div>
    <input aria-label={title} type="range" min={min} max={max} step={step} value={rangeValue} onPointerDown={e => { active.current = true; e.currentTarget.setPointerCapture(e.pointerId); }} onChange={e => { active.current = true; update(e.target.value); }} onPointerUp={commit} onPointerCancel={cancel} onLostPointerCapture={commit} onBlur={commit} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); cancel(); } }} onKeyUp={e => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) commit(); }}/>
  </div>;
}
