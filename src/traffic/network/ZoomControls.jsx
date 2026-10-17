import { useEffect, useRef, useState } from 'react';
export default function ZoomControls({ value, onChange, onFit, onFocus, fitting }) {
  const [draft, setDraft] = useState(String(value)), editing = useRef(false);
  useEffect(() => { if (!editing.current) setDraft(String(value)); }, [value]);
  function commit() { editing.current = false; const next = draft.trim() ? Math.max(1, Math.min(600, Math.round(Number(draft)))) : value; setDraft(String(next)); if (Number.isFinite(next) && next !== value) onChange(next); }
  return <div className="network-view-controls" role="group" aria-label="画布视图">
    <button aria-label="缩小画布" title="缩小" onClick={() => onChange(Math.max(1, Math.round(value / 1.25)))}>−</button>
    <label className="network-zoom-value" title="输入缩放百分比"><input aria-label="画布缩放" type="number" min="1" max="600" inputMode="numeric" value={draft} onFocus={() => { editing.current = true; }} onChange={e => { setDraft(e.target.value); const v = Number(e.target.value); if (e.target.value && v >= 1 && v <= 600) onChange(v); }} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}/><span>%</span></label>
    <button aria-label="放大画布" title="放大" onClick={() => onChange(Math.min(600, Math.round(value * 1.25)))}>＋</button>
    <span className="network-view-separator"/>
    <button title="缩小查看全部道路" aria-pressed={fitting} onClick={onFit}>全景</button>
    <button title="以编辑大小定位当前对象" onClick={onFocus}>定位</button>
  </div>;
}
