import { useRef } from 'react';
import { WIDTH, HEIGHT, clamp, clone, pathFor, plannedPathFor, setPlanPoint, moveCar, LATERAL_MOTIONS } from '../model.js';
import { sceneMarkup } from '../scene.js';

export default function SceneCanvas({ editor, selected, chooseCar, chooseSignal, chooseRoad, clearSelection, tool, setTool, replay, grid, zoom, notify }) {
  const svgRef = useRef(null), drag = useRef(null);
  function point(event) {
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(svgRef.current.getScreenCTM().inverse());
    return { x: clamp(p.x, 0, WIDTH), y: clamp(p.y, 0, HEIGHT) };
  }
  function down(event) {
    if (event.button !== 0 || replay.active) return;
    editor.flushText();
    const p = point(event);
    if (tool === 'collision') { editor.mutate(s => { s.collision = p; }); setTool('select'); notify('已标记碰撞点，可拖动调整'); return; }
    const signal = event.target.closest('[data-signal-direction]');
    if (signal) { event.preventDefault(); chooseSignal(signal.dataset.signalDirection); return; }
    const car = event.target.closest('[data-car]'), route = event.target.closest('[data-route]'), collision = event.target.closest('[data-collision]'), target = event.target.closest('[data-plan-target]'), bend = event.target.closest('[data-plan-bend]');
    if (!car && !route && !collision && !target && !bend) { if (event.target.closest('[data-road-object]')) chooseRoad(); else clearSelection(); return; }
    event.preventDefault();
    const id = car?.dataset.car || route?.dataset.route || target?.dataset.planTarget || bend?.dataset.planBend;
    const source = editor.sceneRef.current, vehicle = source.cars.find(c => c.id === id);
    const item = collision ? source.collision : route ? pathFor(vehicle).start : target || bend ? plannedPathFor(vehicle)[target ? 'end' : 'control'] : vehicle;
    drag.current = { pointerId: event.pointerId, type: collision ? 'collision' : route ? 'route' : target ? 'plan-target' : bend ? 'plan-bend' : 'car', id, dx: p.x - item.x, dy: p.y - item.y, before: clone(source) };
    if (id) chooseCar(id); else clearSelection();
    svgRef.current.setPointerCapture(event.pointerId);
  }
  function move(event) {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    const p = point(event), x = p.x - d.dx, y = p.y - d.dy, next = clone(editor.sceneRef.current);
    if (d.type === 'collision') next.collision = { x: clamp(x, 0, WIDTH), y: clamp(y, 0, HEIGHT) };
    else next.cars = next.cars.map(c => {
      if (c.id !== d.id) return c;
      if (d.type === 'plan-target' || d.type === 'plan-bend') return setPlanPoint(c, d.type === 'plan-target' ? 'target' : 'bend', { x, y });
      if (d.type === 'route') return { ...c, start: { x: clamp(x, 0, WIDTH), y: clamp(y, 0, HEIGHT) }, motion: ['left', 'right', 'change', ...LATERAL_MOTIONS].includes(c.motion) ? c.motion : 'custom' };
      return moveCar(c, x, y);
    });
    editor.replace(next);
  }
  function end(event) {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.type === 'pointercancel') editor.replace(d.before);
    if (svgRef.current.hasPointerCapture(event.pointerId)) svgRef.current.releasePointerCapture(event.pointerId);
    editor.commit();
  }
  return <div className="canvas-stage"><div className="stage-sheet" style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}><svg id="scene" ref={svgRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} xmlns="http://www.w3.org/2000/svg" role="img" aria-label={replay.active ? '事故过程模拟回放' : '事故示意图，拖动车辆调整位置'} className={tool === 'collision' ? 'marking' : ''} onKeyDown={e => { if (!replay.active && ['Enter', ' '].includes(e.key)) { const signal = e.target.closest('[data-signal-direction]'); if (signal) { e.preventDefault(); chooseSignal(signal.dataset.signalDirection); } } }} onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} dangerouslySetInnerHTML={{ __html: sceneMarkup(editor.scene, { selected, interactive: true, grid, progress: replay.active ? replay.progress : null, replayMode: replay.mode }) }} /></div></div>;
}
