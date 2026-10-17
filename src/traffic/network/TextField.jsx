import { useEffect, useState } from 'react';
export default function TextField({ title, value = '', maxLength, onChange, onCommit }) {
  const [draft, setDraft] = useState(value), [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setDraft(value); }, [value, focused]);
  function commit() { setFocused(false); if (draft !== value) (onCommit || onChange)?.(draft); }
  return <label className="network-field"><span>{title}</span><input aria-label={title} value={draft} maxLength={maxLength} onFocus={() => { setFocused(true); }} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.preventDefault(); setDraft(value); } }}/></label>;
}
