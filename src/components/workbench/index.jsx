import { useEffect, useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import './workbench.css';

export function WorkbenchHeader({ activeModule, children, actions, saveStatus, saveError = false }) {
  return <header className="workbench-header">
    <a className="workbench-brand" href="#/" aria-label="CrashPad 首页"><span className="brand-symbol"><Icon name="logo" size={21}/></span><strong>CrashPad</strong></a>
    <nav aria-label="模块导航" className="workbench-navigation"><a href="#/" aria-current={activeModule === 'scene' ? 'page' : undefined}>现场还原</a><a href="#/traffic" aria-current={activeModule === 'traffic' ? 'page' : undefined}>车流实验室</a></nav>
    {children && <div className="workbench-document">{children}</div>}
    <div className="workbench-header-actions">{saveStatus && <span role="status" className={`workbench-save${saveError ? ' is-error' : ''}`}>{saveStatus}</span>}{actions}</div>
  </header>;
}

export function HistoryControls({ canUndo, canRedo, onUndo, onRedo }) {
  return <div className="workbench-history" role="group" aria-label="编辑历史"><button className="icon-button" data-action="undo" aria-label="撤销编辑" title="撤销 · Ctrl / ⌘ Z" disabled={!canUndo} onClick={onUndo}><Icon name="undo" size={17}/></button><button className="icon-button" data-action="redo" aria-label="重做编辑" title="重做 · Ctrl / ⌘ Shift Z" disabled={!canRedo} onClick={onRedo}><Icon name="redo" size={17}/></button></div>;
}

export function ZoomControls({ value, onChange, onFit, onFocus, min = 25, max = 600 }) {
  const [draft, setDraft] = useState(String(value));
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setDraft(String(value)); }, [value]);
  function commit() {
    if (!editing.current) return;
    editing.current = false;
    const number = Number(draft);
    const next = draft.trim() && Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : value;
    setDraft(String(next));
    if (next !== value) onChange(next);
  }
  return <div className="workbench-zoom" role="group" aria-label="画布视图"><button aria-label="缩小画布" title="缩小" disabled={value <= min} onClick={() => onChange(Math.max(min, Math.round(value / 1.25)))}>−</button><label className="workbench-zoom-value"><input aria-label="画布缩放" type="number" min={min} max={max} inputMode="numeric" value={draft} onFocus={() => { editing.current = true; }} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { editing.current = false; setDraft(String(value)); e.currentTarget.blur(); } }}/><span>%</span></label><button aria-label="放大画布" title="放大" disabled={value >= max} onClick={() => onChange(Math.min(max, Math.round(value * 1.25)))}>＋</button>{onFit && <button className="workbench-zoom-action" onClick={onFit} title="查看完整画布">全景</button>}{onFocus && <button className="workbench-zoom-action" onClick={onFocus} title="定位当前对象">定位</button>}</div>;
}

export function SegmentedControl({ label, value, options, onChange }) {
  return <div className="workbench-segmented" role="group" aria-label={label}>{options.map(option => <button key={option.value} type="button" aria-pressed={option.value === value} disabled={option.disabled} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}

export function PlaybackFrame({ children, className = '' }) {
  return <div className={`workbench-playback ${className}`} aria-label="播放与观察控制">{children}</div>;
}
