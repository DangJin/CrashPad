import { useEffect, useRef, useState } from 'react';
const clamp = value => Math.max(.01, Math.min(6, value));
export default function useCanvasView({ zoom, bounds, initialCenter, followPoint, onZoom, onNavigate, onScale, focusRequest, axis }) {
  const svg = useRef(null), host = useRef(null), live = useRef(null), pan = useRef(null), pinch = useRef(null), pointers = useRef(new Map()), space = useRef(false), suppressClick = useRef(false);
  const [size, setSize] = useState({ width: 900, height: 600, measured: false }), [center, setCenter] = useState(initialCenter);
  // Reserve screen-space room for endpoint actions and the bottom view controls.
  const compact = window.matchMedia('(max-width:650px)').matches;
  const fitWidth = Math.max(120, size.width - (compact ? 80 : 192)), fitHeight = Math.max(100, size.height - 160);
  const fitScale = Math.max(.01, axis === 'horizontal' ? fitWidth / bounds.width : axis === 'vertical' ? fitHeight / bounds.height : Math.min(fitWidth / bounds.width, fitHeight / bounds.height));
  const scale = zoom === 'fit' || zoom === 'auto' ? (zoom === 'auto' && !axis ? Math.max(.8, fitScale) : fitScale) : clamp(Number(zoom) / 100);
  const scaleX = axis === 'vertical' ? Math.max(4, scale) : scale, scaleY = axis === 'horizontal' ? Math.max(4, scale) : scale;
  const position = zoom === 'auto' && !axis ? initialCenter : zoom === 'fit' || zoom === 'auto' ? { x: bounds.x + bounds.width / 2 - (compact ? 0 : 56 / scaleX), y: bounds.y + bounds.height / 2 + 30 / scaleY } : center;
  useEffect(() => { if (zoom === 'fit') setCenter({ x: bounds.x + bounds.width / 2 - (compact ? 0 : 56 / scaleX), y: bounds.y + bounds.height / 2 + 30 / scaleY }); }, [zoom, bounds.x, bounds.y, bounds.width, bounds.height, scaleX, scaleY, compact]);
  useEffect(() => {
    if (!focusRequest) return;
    const view = live.current;
    if (!focusRequest.reveal) { setCenter({ x: focusRequest.x, y: focusRequest.y }); return; }
    const xMargin = Math.min(140, view.size.width / 3), yMargin = Math.min(100, view.size.height / 3);
    const left = view.center.x - (view.size.width / 2 - xMargin) / view.scaleX, right = view.center.x + (view.size.width / 2 - 60) / view.scaleX;
    const top = view.center.y - (view.size.height / 2 - yMargin) / view.scaleY, bottom = view.center.y + (view.size.height / 2 - yMargin) / view.scaleY;
    const x = view.center.x + (focusRequest.x < left ? focusRequest.x - left : focusRequest.x > right ? focusRequest.x - right : 0), y = view.center.y + (focusRequest.y < top ? focusRequest.y - top : focusRequest.y > bottom ? focusRequest.y - bottom : 0);
    if (view.zoom === 'fit') view.onZoom(Math.round(view.scale * 100));
    setCenter({ x, y });
  }, [focusRequest]);
  useEffect(() => { if (zoom === 'auto' && size.measured) { setCenter(position); onZoom(Math.round(scale * 100)); } }, [zoom, size.measured, scale]);
  live.current = { center: position, scale, scaleX, scaleY, size, zoom, onZoom, onNavigate, axis };
  useEffect(() => { const observer = new ResizeObserver(([entry]) => { const { width, height } = entry.contentRect; if (width > 0 && height > 0) setSize({ width, height, measured: true }); }); observer.observe(host.current); return () => observer.disconnect(); }, []);
  useEffect(() => { onScale?.(Math.round(scale * 100)); }, [scale, onScale]);
  const followTarget=useRef(followPoint);followTarget.current=followPoint;
  useEffect(()=>{
    if(!followPoint)return;
    let frame,previous=performance.now();
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function animate(now){
      const view=live.current,target=followTarget.current;
      if(target&&view.zoom!=='fit'&&view.zoom!=='auto'){
        const heading=(target.heading||0)*Math.PI/180,lead=target.lead?Math.min(100,view.size.width*.18):0;
        const x=target.x+Math.cos(heading)*lead/view.scaleX,y=target.y+Math.sin(heading)*lead/view.scaleY;
        const alpha=reduced?1:1-Math.exp(-Math.min(now-previous,100)/220);
        const next={x:view.center.x+(x-view.center.x)*alpha,y:view.center.y+(y-view.center.y)*alpha};
        if(Math.hypot((next.x-view.center.x)*view.scaleX,(next.y-view.center.y)*view.scaleY)>.05){setCenter(next);live.current.center=next;}
      }
      previous=now;frame=requestAnimationFrame(animate);
    }
    frame=requestAnimationFrame(animate);return()=>cancelAnimationFrame(frame);
  },[!!followPoint]);
  function capture(id) { try { svg.current.setPointerCapture(id); } catch { /* Pointer may have ended during a pinch. */ } }
  function world(clientX, clientY) { const view = live.current, rect = host.current.getBoundingClientRect(); return { x: view.center.x + (clientX - rect.left - rect.width / 2) / view.scaleX, y: view.center.y + (clientY - rect.top - rect.height / 2) / view.scaleY }; }
  function zoomAt(nextScale, clientX, clientY, anchor = world(clientX, clientY)) {
    const view = live.current, rect = host.current.getBoundingClientRect(), next = Math.round(clamp(nextScale) * 100) / 100, sx = view.axis === 'vertical' ? Math.max(4, next) : next, sy = view.axis === 'horizontal' ? Math.max(4, next) : next, nextCenter = { x: anchor.x - (clientX - rect.left - rect.width / 2) / sx, y: anchor.y - (clientY - rect.top - rect.height / 2) / sy };
    view.onNavigate?.(); setCenter(nextCenter); live.current = { ...view, center: nextCenter, scale: next, scaleX: sx, scaleY: sy, zoom: next * 100 }; view.onZoom(Math.round(next * 100));
  }
  useEffect(() => {
    const element = host.current;
    const wheel = event => {
      if (event.target.closest('.network-view-controls')) return;
      event.preventDefault(); const view = live.current, factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? view.size.height : 1;
      if (event.ctrlKey || event.metaKey) { zoomAt(view.scale * Math.exp(-Math.max(-300, Math.min(300, event.deltaY * factor)) * .002), event.clientX, event.clientY); return; }
      const horizontal = view.axis === 'horizontal' && !event.deltaX, dx = (horizontal ? event.deltaY : event.deltaX) * factor, dy = horizontal ? 0 : event.deltaY * factor;
      view.onNavigate?.(); if (view.zoom === 'fit') view.onZoom(Math.round(view.scale * 100));
      const next = { x: view.center.x + dx / view.scaleX, y: view.center.y + dy / view.scaleY }; setCenter(next); live.current.center = next;
    };
    const keyDown = event => { if (event.code === 'Space' && svg.current?.contains(event.target) && !event.target.closest('[data-network-port]')) { event.preventDefault(); space.current = true; element.classList.add('is-space-panning'); } };
    const keyUp = event => { if (!event || event.type === 'blur' || event.code === 'Space') { space.current = false; element.classList.remove('is-space-panning'); } };
    element.addEventListener('wheel', wheel, { passive: false }); document.addEventListener('keydown', keyDown); document.addEventListener('keyup', keyUp); window.addEventListener('blur', keyUp);
    return () => { element.removeEventListener('wheel', wheel); document.removeEventListener('keydown', keyDown); document.removeEventListener('keyup', keyUp); window.removeEventListener('blur', keyUp); };
  }, []);
  function begin(event, force = false, blank = false) {
    suppressClick.current = false;
    if (event.pointerType === 'touch') pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()], x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
      pinch.current = { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), scale: live.current.scale, anchor: world(x, y) }; pan.current = null;
      for (const id of pointers.current.keys()) capture(id); event.preventDefault(); event.stopPropagation(); return true;
    }
    if (!force && !space.current && !blank && event.button !== 1 && event.button !== 2) return false;
    if (event.button > 2) return false;
    const view = live.current; view.onNavigate?.(); setCenter(view.center); if (view.zoom === 'fit') view.onZoom(Math.round(view.scale * 100));
    pan.current = { id: event.pointerId, x: event.clientX, y: event.clientY, center: { ...view.center }, scale: view.scale, scaleX: view.scaleX, scaleY: view.scaleY };
    svg.current.focus({ preventScroll: true }); capture(event.pointerId); event.preventDefault(); event.stopPropagation(); return true;
  }
  function move(event) {
    if (pointers.current.has(event.pointerId)) pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()], current = pinch.current; zoomAt(current.scale * Math.hypot(a.x - b.x, a.y - b.y) / current.distance, (a.x + b.x) / 2, (a.y + b.y) / 2, current.anchor); suppressClick.current = true; return true;
    }
    if (!pan.current || pan.current.id !== event.pointerId) return false;
    const start = pan.current, dx = event.clientX - start.x, dy = event.clientY - start.y; if (Math.hypot(dx, dy) > 3) suppressClick.current = true;
    const next = { x: start.center.x - dx / start.scaleX, y: start.center.y - dy / start.scaleY }; setCenter(next); live.current.center = next; return true;
  }
  function end(event) {
    pointers.current.delete(event.pointerId);
    if (pinch.current) {
      pinch.current = null; suppressClick.current = true;
      const [entry] = pointers.current; if (entry) pan.current = { id: entry[0], x: entry[1].x, y: entry[1].y, center: { ...live.current.center }, scale: live.current.scale, scaleX: live.current.scaleX, scaleY: live.current.scaleY }; return true;
    }
    if (pan.current?.id === event.pointerId) { pan.current = null; return true; } return false;
  }
  function cancel() { pointers.current.clear(); pinch.current = null; pan.current = null; }
  return { svg, host, scale, scaleX, scaleY, space, suppressClick, begin, move, end, cancel, viewBox: `${position.x - size.width / scaleX / 2} ${position.y - size.height / scaleY / 2} ${size.width / scaleX} ${size.height / scaleY}` };
}
