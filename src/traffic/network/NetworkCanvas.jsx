import { curveCenterline, curveSide, offsetPolyline, sliceLine, polylineLength } from './curveGeometry.js';
import { ROAD_MATERIALS } from '../../roadMaterials.js';
import { facilityGeometry, visualRoadEdges, linePath, polygonPoints, bendPaths } from './roadVisualGeometry.js';
import { RampSurface, FacilityMarkings, CurveEdges, JunctionMarkings, RoadArrows, TollDetails } from './RoadDetails.jsx';
import { rampSides, rampPoints } from './ramps.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { moveConnectedNode, roadMouths, minimumNodeGap, displayPortPoint, nodeDisplayCenter } from './layout.js';
import { canvasPresentation } from './presentation.js';
import { roadDetail, visibleLabels, portHitRadius, canvasActionAnchor } from './canvasDetail.js';
import useCanvasView from './useCanvasView.js';
import ZoomControls from './ZoomControls.jsx';
import { ROAD_TEMPLATES } from './templates.js';
import { roadSurfaceDefs } from '../../roads.js';
import { compileNetwork, LANES, ports, sideOf, TURNS, pointOn, junctionRadius } from './model.js';
const paints = ['#245bdb', '#dc7033', '#f8fafc', '#98a3b2', '#21845e', '#d94343'];
export default function NetworkCanvas({ config: savedConfig, net: savedNet, snapshot, selected, onSelect, onMove, onConnect, camera, zoom, onZoom, onNavigate, onScale, viewScale, focusRequest, onFit, onFocus, onAppend, onCurveEdit, followVehicle = false }) {
  const curveDrag=useRef(null),[curveHover,setCurveHover]=useState(null);
  const drag = useRef(null), wire = useRef(null), linkRef = useRef(null), [link, updateLink] = useState(null), [wirePoint, setWirePoint] = useState(null), [hover, setHover] = useState(null);
  const config = useMemo(() => {if(curveHover&&curveDrag.current){const next=structuredClone(savedConfig);next.roads.find(r=>r.id===curveDrag.current.id).geometry.points[curveDrag.current.index]=curveHover;return next;}return hover&&drag.current?moveConnectedNode(savedConfig,drag.current.id,hover.x,hover.y):savedConfig;}, [savedConfig,hover,curveHover]);
  const net = useMemo(() => { if (config === savedConfig) return savedNet; try { return compileNetwork(config); } catch { return null; } }, [config, savedConfig, savedNet]);
  function setLink(value) { linkRef.current = value; updateLink(value); if (!value) setWirePoint(null); }
  const nodes = Object.fromEntries(config.nodes.map(n => [n.id, n]));
  useEffect(() => { if (linkRef.current && (!nodes[linkRef.current.node] || attached(linkRef.current))) setLink(null); }, [savedConfig]);
  const visuals = useMemo(() => Object.fromEntries(config.roads.map(r => [r.id, visualRoadEdges(config,r)])), [config]);
  const presentation = useMemo(() => canvasPresentation(savedConfig, savedNet), [savedConfig, savedNet]);
  const selectedCar = snapshot?.cars.find(c => c.id === selected?.id && selected.type === 'car');
  const view = useCanvasView({ zoom, ...presentation, initialCenter: savedConfig.nodes.find(n => n.id === selected?.id) || savedConfig.nodes.find(n => n.type !== 'terminal') || savedConfig.nodes[0] || { x: 500, y: 440 }, followPoint: camera?.point, onZoom, onNavigate, onScale, focusRequest });
  const { svg, host, scaleX: sx, scaleY: sy } = view;
  const screen = (x, y, heading = 0) => {
    const angle = heading * Math.PI / 180;
    return `translate(${x} ${y}) scale(${1 / sx} ${1 / sy}) rotate(${Math.atan2(Math.sin(angle) * sy, Math.cos(angle) * sx) * 180 / Math.PI})`;
  };
  const projectedPorts = useMemo(() => config.nodes.flatMap(node => ports(node).map(side => ({ ...displayPortPoint(config, node, side), id: `${node.id}:${side}` }))), [config]);
  const labels = useMemo(() => {
    const candidates = config.nodes.map(node => {
      const p = nodeDisplayCenter(config, node);
      return { id: `node:${node.id}`, x: p.x, y: p.y, offsetY: node.type === 'terminal' ? -22 : -14,
        text: node.name || ({ terminal: '出入口', cross: '十字路口', tee: '丁字路口', ...ROAD_TEMPLATES }[node.type] || '弯道'),
        priority: selected?.type === 'node' && selected.id === node.id ? 100 : node.type === 'terminal' ? 30 : 20 };
    });
    for (const road of config.roads) {
      const active = selected?.type === 'road' && selected.id === road.id;
      for (const edge of visuals[road.id] || []) {
        const detail = roadDetail(edge.heading, sx, sy, active);
        if (!detail.laneLabels && !detail.compactLabels) continue;
        edge.paths.forEach((path, index) => {
          const a = pointOn(path,path.length*.35), b=a;
          candidates.push({ id: `lane:${path.id}`, x: a.x * .65 + b.x * .35, y: a.y * .65 + b.y * .35,
            text: detail.laneLabels ? `车道 ${index + 1}` : `${index + 1}`, priority: active ? 90 : 10 });
        });
      }
    }
    return visibleLabels(candidates, sx, sy);
  }, [config, visuals, selected, sx, sy]);
  const point = e => { const p = svg.current.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.current.getScreenCTM().inverse()); };
  function openInsert(event, target) {
    event.preventDefault(); event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const anchor = event.type === 'click' && event.detail > 0 ? { x: event.clientX, y: event.clientY } : { x: rect.left + rect.width / 2, y: rect.bottom };
    onAppend?.({ ...target, anchor });
  }
  function down(event, node) {
    if (event.button !== 0) return;
    onNavigate?.(); event.preventDefault(); event.stopPropagation(); svg.current.focus({ preventScroll: true }); onSelect({ type: 'node', id: node.id }, { reveal: false });
    const p = point(event); drag.current = { id: node.id, dx: p.x - node.x, dy: p.y - node.y, x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId);
  }
  function finish(event) {
    const d = drag.current; if (!d) return;
    const p = point(event); drag.current = null;
    if (Math.hypot(event.clientX - d.x, event.clientY - d.y) > 3) onMove(d.id, Math.max(80, Math.round((p.x - d.dx) / 20) * 20), Math.max(80, Math.round((p.y - d.dy) / 20) * 20));
    else onSelect({ type: 'node', id: d.id }, { reveal: true });
  }
  function attached(port) { const node = nodes[port.node]; if (!node) return null; return config.roads.find(r => { const other = r.from === node.id ? nodes[r.to] : r.to === node.id ? nodes[r.from] : null; const special = rampSides(config, r); return other && (r.geometry?curveSide(config,r,r.from===node.id):special ? special[r.from === node.id ? 0 : 1] : sideOf(node, other)) === port.side; }); }
  function compatible(a, b) {
    const from = nodes[a.node], to = nodes[b.node];
    return from && to && a.node !== b.node && !attached(a) && !attached(b)  && Math.hypot(from.x - to.x, from.y - to.y) >= minimumNodeGap(from, to, config.roads);
  }
  function portClick(port) {
    const pending = nodes[linkRef.current?.node] ? linkRef.current : null;
    if (!pending) {
      const road = attached(port); if (road) { onSelect({ type: 'road', id: road.id }); return; }
      setLink(port);
    } else if (pending.node === port.node && pending.side === port.side) setLink(null);
    else if (onConnect(pending, port)) setLink(null);
  }
  function portDown(event, port) {
    if (event.button !== 0) return;
    onNavigate?.(); event.preventDefault(); event.stopPropagation(); svg.current.focus({ preventScroll: true });
    const road = attached(port); if (road && !linkRef.current) { onSelect({ type: 'road', id: road.id }); return; }
    wire.current = { source: linkRef.current || port, port, previous: linkRef.current, x: event.clientX, y: event.clientY, moved: false };
    if (!linkRef.current) setLink(port);
    svg.current.setPointerCapture(event.pointerId);
  }
  function releaseWire(event) {
    const current = wire.current; if (!current) return false;
    wire.current = null;
    if (!current.moved) { if (current.previous) portClick(current.port); }
    else {
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-network-port]')?.getAttribute('data-network-port');
      if (target) { const split = target.lastIndexOf(':'); const port = { node: target.slice(0, split), side: target.slice(split + 1) }; if (port.node !== current.source.node || port.side !== current.source.side) portClick(port); }
    }
    return true;
  }
  const sourcePoint = link && nodes[link.node] && displayPortPoint(config, nodes[link.node], link.side);
  return <div className="network-canvas" ref={host} data-network-canvas>
    <svg ref={svg} tabIndex={-1} viewBox={view.viewBox} preserveAspectRatio="none" role="img" aria-label="自由路网画布"
      onContextMenu={e => e.preventDefault()}
      onPointerDownCapture={e => { const blank = e.target.hasAttribute('data-network-ground'); if (view.begin(e, false, blank)) { drag.current = null; wire.current = null; setLink(null); setHover(null); } }}
      onClickCapture={e => { if (view.suppressClick.current) { e.preventDefault(); e.stopPropagation(); view.suppressClick.current = false; } }}
      onPointerMove={e => {
        if(curveDrag.current){const p=point(e);setCurveHover({x:p.x,y:p.y});return;}
        if (view.move(e)) return;
        if (wire.current) { wire.current.moved ||= Math.hypot(e.clientX - wire.current.x, e.clientY - wire.current.y) > 3; }
        if (linkRef.current) setWirePoint(point(e));
        if (drag.current) { const p = point(e); setHover({ x: Math.max(80, Math.round((p.x - drag.current.dx) / 20) * 20), y: Math.max(80, Math.round((p.y - drag.current.dy) / 20) * 20) }); }
      }}
      onPointerUp={e => { if(curveDrag.current){const d=curveDrag.current,p=point(e);curveDrag.current=null;setCurveHover(null);onCurveEdit?.(d.id,d.index,{x:p.x,y:p.y});return;} if (!view.end(e) && !releaseWire(e)) finish(e); setHover(null); }}
      onPointerCancel={() => { curveDrag.current=null;setCurveHover(null);view.cancel(); drag.current = null; wire.current = null; setHover(null); setLink(null); }}
      onKeyDown={e => { if (e.key === 'Escape') {curveDrag.current=null;setCurveHover(null); wire.current = null; drag.current = null; setHover(null); setLink(null); } }}>
      <g dangerouslySetInnerHTML={{ __html: roadSurfaceDefs() }} />
      <defs>
        <pattern id="network-asphalt" width="32" height="32" patternUnits="userSpaceOnUse"><rect width="32" height="32" fill={ROAD_MATERIALS.asphalt}/><path d="M5 7h1m16 5h1M12 25h1m16 4h1" stroke={ROAD_MATERIALS.asphaltLight} strokeWidth=".65" opacity={Math.min(sx, sy) >= .55 ? .09 : 0}/></pattern>
        <pattern id="network-gore" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="6" height="6" fill="#646b6a"/><path d="M0 0V6" stroke="#eeeede" strokeWidth="1.4"/></pattern>
        <pattern id="network-grass"  patternTransform={`scale(${1 / sx} ${1 / sy})`} width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill={ROAD_MATERIALS.grass}/><path d="m10 15 2-4 2 4m18 16 2-4 2 4" fill="none" stroke={ROAD_MATERIALS.grassBlade} opacity={Math.min(sx, sy) >= .55 ? .10 : .035}/></pattern></defs>
      <rect data-network-ground x="-100000" y="-100000" width="200000" height="200000" fill="url(#network-grass)" onClick={() => { setLink(null); onSelect(null); }} />
      {config.roads.map(road => { const a = nodes[road.from], b = nodes[road.to]; if (!a || !b) return null; const mouth = roadMouths(config, road); if (!mouth) return null;
        if (!mouth.valid) return <path key={road.id} data-network-invalid-road={road.id} d={`M${mouth.start.x} ${mouth.start.y}L${mouth.end.x} ${mouth.end.y}`} stroke={selected?.type==='road'&&selected.id===road.id?'#245bdb':'#bd5964'} strokeWidth="5" vectorEffect="non-scaling-stroke" strokeDasharray="8 6" fill="none" pointerEvents="stroke" role="button" tabIndex={0} aria-label={`选择问题道路 ${road.id}`} onClick={()=>onSelect({type:'road',id:road.id})} onKeyDown={e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();onSelect({type:'road',id:road.id});}}}/>;
        if (mouth.curve) {
          const points=road.geometry?offsetPolyline(mouth.curve,road.oneWay?road.lanes*LANES/2:0):rampPoints(config,road,(road.lanes-1)/2),d=linePath(points),width=road.lanes*LANES*(road.geometry&&!road.oneWay?2:1);
          return <g key={road.id} data-network-road={road.id} role="button" tabIndex={0} aria-label={`选择道路 ${road.id}`} onClick={()=>onSelect({type:'road',id:road.id})} onKeyDown={e=>{if(e.key==='Enter')onSelect({type:'road',id:road.id});}}>
            <path d={d} stroke={selected?.id===road.id?'#245bdb':'#878f83'} strokeWidth={width+2.5} fill="none"/>
            <path data-network-road-surface={road.id} d={d} stroke="url(#network-asphalt)" strokeWidth={width} fill="none"/>
            <CurveEdges points={points} width={width}/>
            {road.geometry&&Array.from({length:road.lanes*(road.oneWay?1:2)-1},(_,i)=>road.oneWay?i+1:i+1-road.lanes).map(i=><path key={i} d={linePath(offsetPolyline(mouth.curve,i*LANES))} fill="none" stroke={i===0?'#efcf65':'white'} strokeWidth="1" strokeDasharray={i===0?undefined:'8 9'}/>)}
            {(visuals[road.id]||[]).map(edge=><RoadArrows key={edge.id} edge={edge}/>)}
          </g>;
        }
        const { start, end, dx, dy } = mouth, offset = road.oneWay ? road.lanes * LANES / 2 : 0, ax = start.x - dy * offset, ay = start.y + dx * offset, bx = end.x - dy * offset, by = end.y + dx * offset, width = road.lanes * LANES * (road.oneWay ? 1 : 2);
        const active = selected?.type === 'road' && selected.id === road.id; return <g key={road.id} data-network-road={road.id} role="button" tabIndex={0} aria-label={`选择道路 ${road.id}`} onClick={() => onSelect({ type: 'road', id: road.id })} onKeyDown={e => { if (['Enter', ' '].includes(e.key)) { e.preventDefault(); onSelect({ type: 'road', id: road.id }); } }}><path d={`M${ax} ${ay}L${bx} ${by}`} stroke={active ? '#245bdb' : '#d4d7cc'} strokeWidth={width + 1} /><path data-network-road-surface={road.id} d={`M${ax} ${ay}L${bx} ${by}`} stroke="url(#network-asphalt)" strokeWidth={width} /><CurveEdges points={[{x:ax,y:ay},{x:bx,y:by}]} width={width}/>{!road.oneWay && <path d={`M${start.x} ${start.y}L${end.x} ${end.y}`} stroke="#efcf65" strokeWidth="1.5" />}{(visuals[road.id] || []).flatMap(edge => edge.paths.map((p, i) => { const a = p.points[0], b = p.points.at(-1), angle = edge.heading * Math.PI / 180, offsetX = Math.sin(angle) * LANES / 2, offsetY = -Math.cos(angle) * LANES / 2; return <g key={p.id} pointerEvents="none">{i > 0 && <path d={`M${a.x + offsetX} ${a.y + offsetY}L${b.x + offsetX} ${b.y + offsetY}`} stroke="white" strokeWidth="1" strokeDasharray="8 9" opacity=".85" />}<RoadArrows edge={{...edge,paths:[p]}}/></g>; }))}</g>; })}
      {config.nodes.map(node => { const active = selected?.type === 'node' && selected.id === node.id, radius = junctionRadius(node, config.roads), p = nodeDisplayCenter(config, node); return <g key={node.id} data-network-node={node.id} role="button" tabIndex={0} aria-label={`选择${node.name || ({ cross: '十字路口', tee: '丁字路口', bend: '弯道', terminal: '入口出口', ...ROAD_TEMPLATES }[node.type])} ${node.id}`} onPointerDown={e => down(e, node)} onKeyDown={e => { if (['Enter', ' '].includes(e.key)) { e.preventDefault(); onSelect({ type: 'node', id: node.id }); } }}>
        {node.type === 'terminal' ? (() => {
          const road = config.roads.find(r => r.from === node.id || r.to === node.id);
          if(road?.geometry){const full=curveCenterline(config,road,false),total=polylineLength(full),section=road.from===node.id?sliceLine(full,0,radius):sliceLine(full,total-radius,total);return <path data-network-terminal={node.id} d={linePath(offsetPolyline(section,road.oneWay?road.lanes*LANES/2:0))} fill="none" stroke="url(#network-asphalt)" strokeWidth={road.lanes*LANES*(road.oneWay?1:2)}/>;}
          const horizontal = ports(node).some(side => side === 'east' || side === 'west');
          const width = (road?.lanes || 1) * LANES * (road?.oneWay ? 1 : 2);
          return <rect data-network-terminal={node.id} x={p.x - (horizontal ? radius : width / 2)} y={p.y - (horizontal ? width / 2 : radius)} width={horizontal ? radius * 2 : width} height={horizontal ? width : radius * 2} fill="url(#network-asphalt)" stroke={active ? '#245bdb' : 'none'} strokeWidth="2" vectorEffect="non-scaling-stroke"/>;

        })() : (node.type === 'anchor'||node.type === 'bend') ? <g>{bendPaths(config,node).map((path,i)=><path key={i} d={linePath(path.points)} stroke={active?'#245bdb':'#899082'} strokeWidth={LANES+2} fill="none"/>)}{bendPaths(config,node).map((path,i)=><path key={i} d={linePath(path.points)} stroke="url(#network-asphalt)" strokeWidth={LANES} fill="none"/>)}</g> : ['toll', 'transition', 'straight', 'merge', 'exit'].includes(node.type) ? <polygon points={polygonPoints(facilityGeometry(config,node).polygon)} fill="url(#network-asphalt)" stroke={active ? '#245bdb' : 'none'} strokeWidth={active ? 2 : 0} vectorEffect="non-scaling-stroke" /> : <rect data-network-terminal={node.type === 'terminal' ? node.id : undefined} x={p.x - radius} y={p.y - radius} width={radius * 2} height={radius * 2} rx={node.type === 'terminal' ? 12 : 3} fill={node.type === 'terminal' ? '#edf3e7' : 'url(#network-asphalt)'} stroke={active ? '#245bdb' : 'none'} strokeWidth={active ? 2 : 0} vectorEffect="non-scaling-stroke" />}
        {node.type !== 'terminal' && config.roads.filter(r => r.from === node.id || r.to === node.id).map(road => {
          const mouth = roadMouths(config, road); if (!mouth?.valid || mouth.curve) return null;
          const q = road.from === node.id ? mouth.start : mouth.end, offset = road.oneWay ? road.lanes * LANES / 2 : 0, x = q.x - mouth.dy * offset, y = q.y + mouth.dx * offset;
          return <path key={road.id} data-network-mouth={`${node.id}:${road.id}`} d={`M${x - mouth.dx * 2} ${y - mouth.dy * 2}L${x + mouth.dx * 2} ${y + mouth.dy * 2}`} stroke="url(#network-asphalt)" strokeWidth={road.lanes * LANES * (road.oneWay ? 1 : 2)} pointerEvents="none"/>;
        })}
        {['straight','transition','merge','exit','toll'].includes(node.type)&&<FacilityMarkings config={config} node={node}/>}
        {['merge','exit'].includes(node.type)&&<RampSurface config={config} node={node}/>}
        <JunctionMarkings config={config} node={node}/>

        {ports(node).map(side => {
          const port = { node: node.id, side }, q = projectedPorts.find(point => point.id === `${node.id}:${side}`), hitRadius = portHitRadius(q, projectedPorts, sx, sy), busy = attached(port), active = link?.node === node.id && link.side === side, valid = link && compatible(link, port);
          return <g key={side} data-network-port={`${node.id}:${side}`} data-connectable={valid ? 'true' : undefined} role="button" tabIndex={0} aria-label={`${node.name || node.id} ${{ east: '东', west: '西', north: '北', south: '南' }[side]}侧连接端${busy ? '（已连接）' : ''}`}
            onPointerDown={e => portDown(e, port)} onClick={e => { e.preventDefault(); e.stopPropagation(); }}
            onKeyDown={e => { if (['Enter', ' '].includes(e.key)) { e.preventDefault(); e.stopPropagation(); portClick(port); } }}>
            <title>{hitRadius < 8 ? '连接端较近，可放大后连接或使用键盘选择' : busy ? '点击选择已连接道路' : valid ? '点击或拖到这里连接' : '点击或拖动连接道路'}</title>
            <ellipse cx={q.x} cy={q.y} rx={hitRadius / sx} ry={hitRadius / sy} fill="transparent"/>
            <ellipse className={busy && !active && !link && selected?.id !== node.id ? "network-port-muted" : undefined} cx={q.x} cy={q.y} rx={Math.min(5, hitRadius) / sx} ry={Math.min(5, hitRadius) / sy} fill={active ? '#f7bb3c' : valid ? '#d9f8e7' : busy ? '#a9b6c1' : '#fff'} stroke={valid ? '#16805c' : busy ? '#245bdb' : '#d34d55'} strokeWidth="1.5" vectorEffect="non-scaling-stroke" pointerEvents="none"/>
          </g>;
        })}
      </g>; })}
      {net && Object.values(net.edges).filter(edge => net.nodes[edge.to].signal?.enabled && !['terminal', 'bend'].includes(net.nodes[edge.to].type)).map(edge => {
        const node = net.nodes[edge.to], links = Object.values(net.connectors).filter(c => c.incoming === edge.id), p = edge.paths.at(-1).points.at(-1);
        const movements = [['straight', '直'], ['left', '左'], ['right', '右'], ['uturn', '调']].filter(([turn]) => links.some(c => c.turn === turn));
        const theta = (edge.endHeading??edge.heading) * Math.PI / 180, vx = Math.cos(theta) * sx, vy = Math.sin(theta) * sy, length = Math.hypot(vx, vy);
        const approachStart = edge.paths.at(-1).points[0];
        const approachPixels = Math.hypot((p.x - approachStart.x) * sx, (p.y - approachStart.y) * sy);
        // Selection never overrides the physical room needed for signal captions.
        const detailed = roadDetail(edge.heading, sx, sy).laneLabels && approachPixels >= movements.length * 34 + 24;
        const step = detailed ? 34 : 15;
        return <g key={edge.id}>{movements.map(([turn, label], i) => {
          const connector = links.find(c => c.turn === turn), color = snapshot?.signals[connector.id] || (node.signal?.plan==='cycle'?(node.signal.start==='red'?'red':'green'):(edge.heading % 180 === 0 && (node.signal?.plan !== 'protected' || ['straight', 'right'].includes(turn)) ? 'green' : 'red'));
          const distance = 22 + i * step, x = p.x - vx / length * distance / sx, y = p.y - vy / length * distance / sy;
          return <g key={turn} data-network-signal={node.id} role="button" tabIndex={0} aria-label={`设置红绿灯 ${node.name || node.id} · ${label}行`} transform={screen(x, y)} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onSelect({type:'node',id:node.id,focus:'signal'});}} onKeyDown={e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();onSelect({type:'node',id:node.id,focus:'signal'});}}}><rect x="-14" y="-16" width={detailed?44:28} height="32" rx="5" fill="transparent" stroke={selected?.id===node.id&&selected?.focus==='signal'?'#245bdb':'none'} strokeWidth="1.5"/><title>{label}行信号：{({green:'绿灯',red:'红灯',yellow:'黄灯'})[color]}</title><rect x="-6" y="-8" width={detailed ? 28 : 12} height="16" rx="3" fill="#223047"/><circle data-network-light={color} data-network-turn={turn} cx="0" cy="0" r="3.5" fill={color === 'green' ? '#36d183' : color === 'yellow' ? '#f7cf44' : '#f45b62'}/>{detailed && <text x="8" y="4" fill="white" fontSize="11">{label}</text>}</g>;
        })}</g>;
      })}
      {config.nodes.filter(n=>n.type==='toll').map(node=><TollDetails key={node.id} config={config} node={node} net={net} snapshot={snapshot} onSelect={onSelect} screen={screen} scaleX={sx} scaleY={sy}/>)}
      <g data-network-labels pointerEvents="none">{labels.map(label => <g key={label.id} transform={screen(label.x, label.y)}><text data-network-label={label.id} y={label.offsetY || 0} fill="white" stroke="#39464f" strokeWidth="3" paintOrder="stroke" fontSize="12" textAnchor="middle">{label.text}</text></g>)}</g>
      {selected?.type==='road'&&config.roads.find(r=>r.id===selected.id)?.geometry?.points.map((p,index,all)=>index>0&&index<all.length-1?<g key={index} transform={screen(p.x,p.y)} role="button" tabIndex={0} aria-label={`道路控制点 ${index}`} data-curve-handle={index} onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();onNavigate?.();curveDrag.current={id:selected.id,index};e.currentTarget.setPointerCapture(e.pointerId);}} onKeyDown={e=>{if(['Backspace','Delete'].includes(e.key)){e.preventDefault();e.stopPropagation();onCurveEdit?.(selected.id,index,null);return;}const delta={ArrowLeft:[-5,0],ArrowRight:[5,0],ArrowUp:[0,-5],ArrowDown:[0,5]}[e.key];if(delta){e.preventDefault();e.stopPropagation();onCurveEdit?.(selected.id,index,{x:p.x+delta[0],y:p.y+delta[1]});}}}><circle r="9" fill="white" fillOpacity=".6"/><circle r="4" fill="white" stroke="#245bdb" strokeWidth="1.5"/></g>:null)}
      {snapshot?.cars.map(car => <g key={car.id} data-network-car={car.id} data-following-vehicle={camera?.vehicleId===car.id?true:undefined} role="button" tabIndex={0} aria-label={`车辆 ${car.id}${car.isPlayer ? ' 我的车' : ''}`} transform={screen(car.pose.x, car.pose.y, car.pose.heading)} onClick={() => onSelect({ type: 'car', id: car.id })} onKeyDown={e => { if (['Enter', ' '].includes(e.key)) { e.preventDefault(); onSelect({ type: 'car', id: car.id }); } }}>{camera?.vehicleId===car.id&&<ellipse rx="14" ry="9" fill="none" stroke="#245bdb" strokeWidth="1.5"/>}<path d="M-6-4.6h3m6 0h3M-6 4.6h3m6 0h3" stroke="#25313b" strokeWidth="1.8"/><rect x="-9" y="-4.2" width="18" height="8.4" rx="1.6" fill={car.isPlayer ? '#f4bf35' : paints[car.paint]} stroke={selectedCar?.id === car.id ? '#131e38' : 'white'} strokeWidth={selectedCar?.id === car.id ? 1.5 : .6} /><path d="M2-3 5-2.4v4.8L2 3Z" fill="#c3d9e6"/><path d="M-5-2.5h2v5h-2Z" fill="#94b0c4"/><path d="M8-2.7v1.2M8 1.5v1.2" stroke="#fff4bf" strokeWidth="1"/><path d="M-8-2.7v1.2M-8 1.5v1.2" stroke="#e86a65" strokeWidth="1"/>{car.isPlayer && <text y="-9" fontSize="9" fill="#172b48" textAnchor="middle">我</text>}<title>{car.reason}</title></g>)}
      {selected?.type === 'road' && (() => {
        const road = config.roads.find(r => r.id === selected.id), mouth = road && roadMouths(config, road);
        if (!mouth?.valid || mouth.curve) return null;
        const width = road.lanes * LANES * (road.oneWay ? 1 : 2), offset = road.oneWay ? width / 2 : 0;
        const center = { x: (mouth.start.x + mouth.end.x) / 2 - mouth.dy * offset, y: (mouth.start.y + mouth.end.y) / 2 + mouth.dx * offset };
        const target = Math.abs(mouth.dx) > .7 ? { x: center.x, y: center.y - width / 2 - 4 / sy } : { x: center.x - width / 2 - 56 / sx, y: center.y + 19 / sy };
        const anchor = canvasActionAnchor(target, view.viewBox, sx, sy, { left: -44, right: 44, top: -32, bottom: -7 });
        if (!anchor) return null;
        return <g transform={screen(anchor.x, anchor.y)} role="button" tabIndex={0} aria-label="在此插入路段" onPointerDown={e => e.stopPropagation()} onClick={e => { openInsert(e, selected); }} onKeyDown={e => { if (['Enter', ' '].includes(e.key)) openInsert(e, selected); }}><rect x="-44" y="-32" width="88" height="25" rx="4" fill="white" stroke="#245bdb"/><text y="-15" textAnchor="middle" fontSize="12" fill="#245bdb">＋ 插入路段</text></g>;
      })()}
      {config.nodes.filter(n => n.type === 'terminal' && n.role !== 'source' && !config.roads.some(r=>r.geometry&&(r.from===n.id||r.to===n.id)) && config.roads.some(r => r.to === n.id)).map(n => {
        const center = nodeDisplayCenter(config, n), incoming = config.roads.find(r => r.to === n.id), from = config.nodes.find(node => node.id === incoming.from);
        if (!from) return null;
        const horizontal = ports(n).some(side => side === 'east' || side === 'west');
        const dx = horizontal ? Math.sign(n.x - from.x) || 1 : 0, dy = horizontal ? 0 : Math.sign(n.y - from.y) || 1;
        const radius = junctionRadius(n, config.roads);
        const target = { x: center.x + dx * (radius + 26 / sx), y: center.y + dy * (radius + 26 / sy) };
        const p = canvasActionAnchor(target, view.viewBox, sx, sy, { left: -14, right: 14, top: -14, bottom: 14 });
        // Hide a clipped action instead of moving it back over the road or terminal.
        if (!p || Math.abs(p.x - target.x) * sx > 1 || Math.abs(p.y - target.y) * sy > 1) return null;
        return <g key={n.id} transform={screen(p.x, p.y)} data-network-append={n.id} role="button" tabIndex={0} aria-label="继续添加道路" onPointerDown={e => e.stopPropagation()} onClick={e => { openInsert(e, { type: 'node', id: n.id }); }} onKeyDown={e => { if (['Enter', ' '].includes(e.key)) openInsert(e, { type: 'node', id: n.id }); }}><path d={`M${-dx * 26} ${-dy * 26}L${-dx * 14} ${-dy * 14}`} stroke="#245bdb" strokeWidth="1.5" pointerEvents="none"/><circle cx="0" cy="0" r="14" fill="white" stroke="#245bdb"/><text y="5" textAnchor="middle" fill="#245bdb" fontSize="20">+</text></g>;
      })}
      {sourcePoint && wirePoint && <path data-network-wire d={`M${sourcePoint.x} ${sourcePoint.y}L${wirePoint.x} ${wirePoint.y}`} stroke="#245bdb" strokeWidth={2 / view.scale} strokeDasharray={` ${6 / view.scale} ${4 / view.scale}`} fill="none" pointerEvents="none"/>}
    </svg>
    {hover && <div className="network-drag-note">对齐预览 · {config.nodes.filter(n => { const old = savedConfig.nodes.find(o => o.id === n.id); return old && (old.x !== n.x || old.y !== n.y); }).length} 个关联对象随动 · Esc 取消</div>}
    {!config.nodes.length && <div className="network-empty"><strong>从一段道路开始</strong><span>点击左侧道路模板，或添加路口</span></div>}
    {camera?.label && <div className="network-camera-caption" data-camera-caption>{camera.label}</div>}
    <ZoomControls value={viewScale} onChange={value=>{if(!followVehicle)onNavigate?.();onZoom(value);}} onFit={onFit} onFocus={onFocus} fitting={zoom === 'fit'}/>
    {link && <button className="network-link-note" onClick={() => setLink(null)}>已选连接端，点击另一端连接 · 取消</button>}
  </div>;
}
