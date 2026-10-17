import { useEffect, useId, useRef, useState } from 'react';
export default function RangeNumberField({ title, value, min = 0, max = 100, step = 1, suffix = '%', compact = false, onChange }) {
  const id = useId(), focused = useRef(false), [draft, setDraft] = useState(String(value));
  useEffect(() => { if (!focused.current) setDraft(String(value)); }, [value]);
  function commit() {
    focused.current = false;
    const parsed = draft.trim() === '' ? value : Number(draft), next = Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed / step) * step)) : value;
    setDraft(String(next)); if (next !== value) onChange(next);
  }
  return <div className={`network-range-field${compact ? ' is-compact' : ''}`}>
    <div className="network-range-heading"><label htmlFor={id}>{title}</label><span className="network-range-number"><input id={id} aria-label={title} type="number" inputMode="numeric" min={min} max={max} step={step} value={draft} onFocus={() => { focused.current = true; }} onChange={e => { setDraft(e.target.value); const number = Number(e.target.value); if (e.target.value.trim() && Number.isFinite(number) && Number.isInteger(number / step) && number >= min && number <= max) onChange(number); }} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}/><span>{suffix}</span></span></div>
    <input aria-label={title} type="range" min={min} max={max} step={step} value={value} onChange={e => { const next = Number(e.target.value); setDraft(String(next)); onChange(next); }}/>
  </div>;
}
