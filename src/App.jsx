import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createScene, clone, clamp, moveCar, roadDescription, COLORS } from './model.js';
import { useEditor } from './hooks/useEditor.js';
import { useReplay } from './hooks/useReplay.js';
import Icon from './components/Icon.jsx';
import ToolsPanel from './components/ToolsPanel.jsx';
import PropertiesPanel from './components/PropertiesPanel.jsx';
import SceneCanvas from './components/SceneCanvas.jsx';
import ReplayBar from './components/ReplayBar.jsx';
import ExportDialog from './components/ExportDialog.jsx';

export default function App() {
  const editor = useEditor(), replay = useReplay();
  const [selected, setSelected] = useState('A'), [tool, setTool] = useState('select');
  const [palette, setPalette] = useState('road'), [tab, setTab] = useState('properties');
  const [grid, setGrid] = useState(true), [zoom, setZoom] = useState(1);
  const [paletteOpen, setPaletteOpen] = useState(false), [exportScene, setExportScene] = useState(null);
  const [message, setMessage] = useState(''), toastTimer = useRef(null);
  function notify(text) { setMessage(text); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setMessage(''), 3500); }
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  function mutate(fn) { replay.exit(); editor.mutate(fn); }
  function chooseObject(id) { editor.flushText(); replay.exit(); setSelected(id); setTab('properties'); setTool('select'); setPalette(id === 'road' ? 'road' : 'cars'); setPaletteOpen(false); }
  function chooseTool(id) {
    editor.flushText(); replay.exit();
    setTool(id === 'collision' ? 'collision' : 'select');
    setPalette(id === 'select' || id === 'collision' ? 'cars' : id);
    setPaletteOpen(id === 'road' || id === 'cars' ? !(paletteOpen && palette === id) : false);
    if (id === 'notes') { setTab('notes'); setPaletteOpen(false); }
    else if (id === 'road') { setSelected('road'); setTab('properties'); }
    else if (id === 'collision') { setSelected(null); setTab('properties'); }
  }
  function changeTab(next) { replay.exit(); editor.flushText(); setTab(next); }
  function preview() { replay.exit(); editor.flushText(); setExportScene(clone(editor.sceneRef.current)); }
  function resetScene(message = '已重置场景，可撤销恢复') {
    replay.changeMode('actual'); replay.setSpeed(1); editor.flushText(); editor.replace(createScene(), true);
    setSelected('A'); setTab('properties'); setPalette('road'); setTool('select');
    setZoom(1); setGrid(true); setPaletteOpen(false); setExportScene(null);
    requestAnimationFrame(() => document.querySelectorAll('.canvas-stage, .tool-content, .inspector-content').forEach(el => { el.scrollTop = 0; el.scrollLeft = 0; }));
    notify(message);
  }
  function newScene() {
    if (window.confirm('新建会替换当前草稿。建议先导出当前示意图，是否继续？')) resetScene('已新建示意图');
  }
  useEffect(() => {
    function keydown(event) {
      const editing = event.target.matches('input, textarea, select');
      if (event.key === 'Escape' && !exportScene) { replay.exit(); setTool('select'); setPaletteOpen(false); }
      if (!editing && !exportScene && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); replay.exit(); event.shiftKey ? editor.redo() : editor.undo(); }
      if (editing || exportScene || replay.active) return;
      const car = event.target.closest('[data-car]'), collision = event.target.closest('[data-collision]');
      const directions = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
      if ((car || collision) && directions[event.key]) {
        event.preventDefault(); const [dx, dy] = directions[event.key], step = event.shiftKey ? 20 : 5, id = car?.dataset.car;
        flushSync(() => editor.mutate(s => { if (collision) { s.collision.x = clamp(s.collision.x + dx * step, 0, 800); s.collision.y = clamp(s.collision.y + dy * step, 0, 600); } else { setSelected(id); s.cars = s.cars.map(c => c.id === id ? moveCar(c, c.x + dx * step, c.y + dy * step) : c); } }));
        document.querySelector(collision ? '#scene [data-collision]' : `#scene [data-car="${id}"]`)?.focus();
      }
    }
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  });
  const mode = replay.active && replay.mode === 'full' ? replay.progress <= .5 ? '完整演示 · 已行驶' : '完整演示 · 后续动作' : replay.active && replay.mode === 'planned' ? '后续动作预览' : replay.active ? replay.progress >= 1 ? '碰撞时的位置' : replay.progress === 0 ? '碰撞前的位置' : '模拟回放' : '碰撞时的位置';
  return <div className="editor-app">
    <header className="app-header"><div className="brand"><span className="brand-symbol"><Icon name="logo" size={23} /></span><strong>CrashPad</strong><input className="document-name" id="document-title" aria-label="示意图标题" placeholder="未命名示意图" title="点击编辑示意图标题" maxLength={60} value={editor.scene.title || ''} onFocus={() => replay.exit()} onChange={e => editor.updateText('title', e.target.value)} onBlur={editor.flushText} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></div><div className="header-actions"><span id="save-status" className={editor.saved ? 'save-status' : 'save-status error'}>{editor.saved ? '草稿已保存' : '草稿未保存，请及时导出'}</span><button className="button secondary" data-action="new" onClick={newScene}><Icon name="plus" size={15} /><span>新建</span></button><button className="button primary" data-action="preview" onClick={preview}><Icon name="download" size={15} /><span>导出图片</span></button></div></header>
    <main className={`workbench ${paletteOpen ? 'palette-open' : ''}`}>
      <ToolsPanel scene={editor.scene} tool={tool} palette={palette} selected={selected} chooseTool={chooseTool} chooseCar={chooseObject} mutate={mutate} locked={replay.active} />
      <section className="canvas-panel" aria-label="事故示意图编辑区"><div className="canvas-toolbar"><div className="toolbar-history"><button className="icon-button" data-action="undo" aria-label="撤销" title="撤销 Ctrl / ⌘ Z" disabled={!editor.history.canUndo} onClick={() => { replay.exit(); editor.undo(); }}><Icon name="undo" size={17} /></button><button className="icon-button" data-action="redo" aria-label="重做" title="重做 Ctrl / ⌘ Shift Z" disabled={!editor.history.canRedo} onClick={() => { replay.exit(); editor.redo(); }}><Icon name="redo" size={17} /></button><button className="reset-button" data-action="reset" aria-label="重置场景" title="恢复初始场景，可撤销" onClick={() => resetScene()}><Icon name="rotate" size={15} /><span>重置</span></button><span className="toolbar-divider" /><span id="scene-title" title={roadDescription(editor.scene)}>{roadDescription(editor.scene)}</span></div><div className="toolbar-view"><button className="icon-button" data-action="grid" aria-label="显示网格" title="显示网格" aria-pressed={grid} onClick={() => setGrid(!grid)}><Icon name="grid" size={16} /></button><button className="icon-button" aria-label="适应画布" title="适应画布" onClick={() => setZoom(1)}><Icon name="fit" size={16} /></button><select aria-label="画布缩放" value={zoom} onChange={e => setZoom(Number(e.target.value))}><option value="0.75">75%</option><option value="1">100%</option><option value="1.25">125%</option><option value="1.5">150%</option></select></div></div>
        <div className="canvas-area"><span className="canvas-state">{mode}</span><SceneCanvas editor={editor} selected={selected} chooseCar={chooseObject} chooseSignal={direction => chooseObject(`signal:${direction}`)} chooseRoad={() => chooseObject('road')} clearSelection={() => setSelected(null)} tool={tool} setTool={setTool} replay={replay} grid={grid} zoom={zoom} notify={notify} /><div className="canvas-legend"><span><i style={{ background: COLORS.A }} />A 我的车</span><span><i style={{ background: COLORS.B }} />B 对方车辆</span><span className="route-legend"><i />已行驶</span><span className="plan-legend"><i />计划</span></div>{editor.scene.collision && <button className="collision-clear text-button" data-action="remove-collision" onClick={() => mutate(s => { s.collision = null; })}>移除碰撞点</button>}</div>
        <ReplayBar scene={editor.scene} replay={replay} flushText={editor.flushText} setTool={setTool} />
      </section>
      <PropertiesPanel previewFull={() => { editor.flushText(); setTool('select'); replay.startFull(); }} previewPlan={() => { editor.flushText(); setTool('select'); replay.startPlanned(); }} editor={editor} selected={selected} tab={tab} setTab={changeTab} locked={replay.active} mutate={mutate} />
    </main>
    <footer className="status-bar"><span id="canvas-hint">{replay.active ? '回放中 · 返回编辑后可调整对象' : tool === 'collision' ? '点击画布标记碰撞位置' : '拖动车辆调整位置 · 圆点调整路线'}</span><span>草稿保存在当前浏览器 · 距离为示意</span></footer>
    <ExportDialog scene={exportScene} onClose={() => setExportScene(null)} notify={notify} />
    <div id="toast" className={message ? 'visible' : ''} role="status" aria-live="polite">{message}</div>
  </div>;
}
