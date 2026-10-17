import { tollPosition, tollType, signalState, signalPosition, rampPoint, rampLength, rampTarget, rampCurvePoint } from './roadEvents.js';
import { useEffect, useRef, useState } from 'react';
import { displayLane, roadEdges, VEHICLE_LENGTH } from './engine.js';
import { drivingStyle } from './drivingStyles.js';
import { laneLabel } from './laneLabel.js';
import { roadSurfaceDefs } from '../roads.js';
import { participantGlyph } from '../participants.js';

const paints = ['#245bdb', '#db6a31', '#ffffff', '#a3adba', '#23845f', '#d94343'];
export default function TrafficCanvas({ road, sim, selected, onSelect, zoom, followId, onSelectSegment, selectedSegment }) {
  const host = useRef(null), [width, setWidth] = useState(900);
  useEffect(() => { const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width)); observer.observe(host.current); return () => observer.disconnect(); }, []);
  const scale = zoom === 'fit' ? Math.max(.03, (width - 100) / road.length) : Number(zoom);
  const svgWidth = Math.max(width, road.length * scale + 100), laneWidth = 56;
  const ramps = road.segments.filter(segment => ['merge', 'exit'].includes(segment.kind));
  const topExtra = ramps.some(segment => segment.side === 'left') ? laneWidth * 3 : 0;
  const bottomExtra = ramps.some(segment => segment.side === 'right') ? laneWidth * 3 : 0;
  const svgHeight = Math.max(350, (road.maxLane - road.minLane + 1) * laneWidth + 150 + topExtra + bottomExtra);
  useEffect(() => {
    if (!sim || sim.time === 0) { host.current.scrollLeft = 0; return; }
    const car = sim.cars.find(c => c.id === followId);
    if (car && zoom !== 'fit') host.current.scrollLeft = Math.max(0, 50 + car.x * scale - width / 2);
  }, [followId, sim?.time, scale, width, zoom]);
  const x = position => 50 + position * scale, y = lane => 75 + topExtra + (lane - road.minLane + .5) * laneWidth;
  const positions = [0, ...road.segments.filter(s => s.kind === 'toll').flatMap(s => Array.from({ length: 41 }, (_, i) => s.start + s.length * i / 40)), ...road.segments.flatMap(s => [s.start, s.taperStart, ...Array.from({ length: 13 }, (_, i) => s.taperStart + i / 12 * (s.taperEnd - s.taperStart)), s.taperEnd, s.end])].sort((a, b) => a - b);
  const upper = positions.map(position => `${x(position)},${y(roadEdges(road, position).lo) - laneWidth / 2}`);
  const lower = [...positions].reverse().map(position => `${x(position)},${y(roadEdges(road, position).hi) + laneWidth / 2}`);
  const markings = [];
  let lastMarking = -Infinity;
  for (const segment of road.segments) {
    // Label full-width pavement only; a taper may not yet contain the new lane.
    const start = !['drop', 'add'].includes(segment.kind) ? segment.start : segment.taperEnd;
    const available = (segment.end - start) * scale;
    for (let offset = 8; offset + 58 <= available; offset += 320) {
      const left = x(start) + offset;
      if (left - lastMarking < 100) continue;
      markings.push({ left, lo: segment.to.lo, hi: segment.to.hi });
      lastMarking = left;
    }
  }
  // Even a short entrance remains identifiable in the full-road view.
  if (!markings.length || markings[0].left > x(0) + 20) markings.unshift({ left: x(0) + 8, ...road.segments[0].from });
  const rampPath = segment => {
    const first = rampCurvePoint(segment, 0), last = rampCurvePoint(segment, 1);
    const control = { x: (first.x + last.x) / 2, lane: rampTarget(segment) };
    return `M${x(first.x)} ${y(first.lane)}Q${x(control.x)} ${y(control.lane)} ${x(last.x)} ${y(last.lane)}`;
  };
  return <div className="traffic-canvas-scroll" ref={host}>
    <svg className="traffic-road-svg" width={svgWidth} height={svgHeight} role="img" aria-label="车流模拟画布，车辆从左向右行驶">
      <g dangerouslySetInnerHTML={{ __html: roadSurfaceDefs() }} />
      <defs><pattern id="traffic-grass" width="50" height="50" patternUnits="userSpaceOnUse"><rect width="50" height="50" fill="#b4c89b" /><path d="m8 14 1-4 2 3m20 18 1-4 2 3" stroke="#6d9158" strokeOpacity=".28" fill="none" /></pattern></defs>
      <defs><mask id="traffic-main-road-edge" maskUnits="userSpaceOnUse" x="0" y="0" width={svgWidth} height={svgHeight}><rect width={svgWidth} height={svgHeight} fill="white" />{ramps.map(segment => <path key={segment.id} d={rampPath(segment)} fill="none" stroke="black" strokeWidth={laneWidth + 5} />)}</mask></defs>
      <rect width="100%" height="100%" fill="url(#traffic-grass)" />
      {ramps.map(segment => {
        const path = rampPath(segment), label = rampCurvePoint(segment, segment.kind === 'merge' ? 0 : 1);
        const labelX = Math.max(12, Math.min(svgWidth - 124, x(label.x))), labelY = y(label.lane) + (segment.side === 'left' ? -48 : 48);
        return <g key={segment.id} data-ramp-road={segment.kind} role="button" tabIndex="0" aria-label={`编辑路段 ${segment.index + 1} 匝道`} onClick={() => onSelectSegment?.(segment.index)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectSegment?.(segment.index); } }}>
          <path className="traffic-ramp-border" d={path} fill="none" stroke={selectedSegment === segment.index ? "#245bdb" : "#d3d5c8"} strokeWidth={laneWidth + 4} /><path d={path} fill="none" stroke="url(#asphalt)" strokeWidth={laneWidth} /><path d={path} fill="none" stroke="white" strokeWidth="1.5" strokeDasharray="10 12" opacity=".7" />
          <g data-ramp-label={segment.index} pointerEvents="none" transform={`translate(${labelX} ${labelY})`}><rect x="-5" y="-15" width="112" height="23" rx="4" fill="white" fillOpacity=".85" /><text fill="#334b3a" fontSize="11">{segment.kind === 'merge' ? `汇入 ${segment.rampCount} 辆 →` : `→ 汇出 ${segment.exitPercent}%`}</text></g>
        </g>;
      })}
      <polygon points={[...upper, ...lower].join(' ')} fill="url(#asphalt)" />
      <polygon data-main-road-edge points={[...upper, ...lower].join(' ')} fill="none" stroke="#d3d5c8" strokeWidth="3" mask="url(#traffic-main-road-edge)" pointerEvents="none" />
      {Array.from({ length: road.maxLane - road.minLane }, (_, i) => i + road.minLane + .5).map(lane => <g key={lane}>{road.segments.map(s => {
        // Only shared, full lanes receive a divider through a transition.
        const points = positions.filter(p => p >= s.start && p <= s.end && lane > roadEdges(road, p).lo - .01 && lane < roadEdges(road, p).hi + .01);
        return points.length > 1 ? <path key={s.id} d={points.map((p, i) => `${i ? 'L' : 'M'}${x(p)} ${y(lane)}`).join(' ')} stroke="white" strokeWidth="2" strokeDasharray="13 12" fill="none" /> : null;
      })}</g>)}
      {road.segments.map((segment, index) => {
        const samples = positions.filter(position => position >= segment.start && position <= segment.end);
        const top = samples.map(position => `${x(position)},${y(roadEdges(road, position).lo) - laneWidth / 2}`);
        const bottom = [...samples].reverse().map(position => `${x(position)},${y(roadEdges(road, position).hi) + laneWidth / 2}`);
        return <polygon key={segment.id} data-road-section={index} points={[...top, ...bottom].join(' ')} fill={selectedSegment === index ? "#245bdb12" : "transparent"} stroke={selectedSegment === index ? "#245bdb" : "none"} strokeWidth="2" strokeDasharray="5 4" aria-pressed={selectedSegment === index} role="button" tabIndex="0" aria-label={`编辑路段 ${index + 1}`} onClick={() => onSelectSegment?.(index)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectSegment?.(index); } }} style={{ cursor: 'pointer' }} />;
      })}
      <g pointerEvents="none" aria-label="路面车道标识">{markings.flatMap(marking => Array.from({ length: marking.hi - marking.lo + 1 }, (_, i) => {
        const lane = marking.lo + i;
        return <g key={`${marking.left}-${lane}`} data-lane-marking={lane} transform={`translate(${marking.left} ${y(lane)})`}>
          <text y="5" fill="white" fontSize="14" fontWeight="600" stroke="#374149" strokeWidth="3" paintOrder="stroke" strokeLinejoin="round">{laneLabel(lane)}</text>
          <path d="M0 15H34m-5-4 5 4-5 4" stroke="white" strokeWidth="1.5" fill="none" opacity=".7" />
        </g>;
      }))}</g>
      {road.segments.map((s, i) => <g key={s.id} pointerEvents="none"><title>{`路段 ${i + 1}：${s.from.hi - s.from.lo + 1} → ${s.lanes} 车道，${s.length} 米`}</title><path d={`M${x(s.start)} 35V${svgHeight - 35}`} stroke="#365d45" strokeDasharray="3 5" opacity=".25" /><text x={x(s.start) + 8} y="45" fontSize="11" fill="#334b3a">{s.length * scale < 110 ? String(i + 1).padStart(2, '0') : ['merge', 'exit'].includes(s.kind) ? `${i + 1} · ${s.kind === 'merge' ? '匝道汇入' : '匝道汇出'}` : `${i + 1} · ${s.from.hi - s.from.lo + 1}${s.kind === 'toll' ? ` → ${s.tollBooths} 窗口 → ${s.lanes} 车道`  : s.kind === 'straight' ? ' 车道' : ` → ${s.lanes} 车道`}`}</text><text x={x(s.start) + 8} y={svgHeight - 15} fontSize="10" fill="#445d49">{s.start} m</text></g>)}
      <text x={x(0)} y={svgHeight - 40} fill="#334b3a" fontSize="11">入口 →</text><text x={x(road.length) - 44} y={svgHeight - 40} fill="#334b3a" fontSize="11">→ 出口</text>
      {road.segments.filter(s => s.kind === 'toll').map(segment => <g key={`toll-${segment.id}`} data-toll-station={segment.index} role="button" tabIndex="0" aria-label={`路段 ${segment.index + 1} 收费站`} onClick={() => onSelectSegment?.(segment.index)} onKeyDown={e => { if (['Enter', ' '].includes(e.key)) { e.preventDefault(); onSelectSegment?.(segment.index); } }}>{Array.from({ length: segment.tollBooths }, (_, i) => { const lane = segment.from.lo + i, type = tollType(segment, lane), cx = x(tollPosition(segment)), cy = y(lane), serving = sim?.cars.find(c => c.tollService?.segment === segment.index && c.tollService.lane === lane); return <g key={lane} data-toll-type={type}><rect x={cx - 24} y={cy - 23} width="48" height="18" rx="3" fill={type === 'etc' ? '#16805c' : '#245bdb'} /><text x={cx} y={cy - 10} textAnchor="middle" fill="white" fontSize="10" fontWeight="600">{type === 'etc' ? 'ETC' : '人工'}</text><path d={`M${cx} ${cy - 3}v24`} stroke={serving ? '#ef5656' : '#f4d46a'} strokeWidth="4" /><title>{type === 'etc' ? 'ETC' : '人工'}窗口{serving ? ' · 办理中' : ''}</title></g>; })}</g>)}
      {road.segments.map(segment => {
        const light = signalState(segment, sim?.time || 0); if (!light) return null;
        const position = signalPosition(segment), edge = roadEdges(road, position), cx = x(position), cy = y(edge.lo) - laneWidth / 2 - 24;
        return <g key={segment.id} data-traffic-signal={segment.index} data-signal-color={light.color} role="button" tabIndex="0" aria-label={`路段 ${segment.index + 1} 红绿灯，${light.color === 'red' ? '红灯' : light.color === 'green' ? '绿灯' : '黄灯'} ${light.remaining} 秒`} onClick={() => onSelectSegment?.(segment.index)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectSegment?.(segment.index); } }}>
          <path d={`M${cx} ${y(edge.lo) - laneWidth / 2}V${y(edge.hi) + laneWidth / 2}`} stroke="white" strokeWidth="3" />
          <rect x={cx - 27} y={cy - 9} width="54" height="18" rx="5" fill="#23344e" stroke="white" />{['red', 'yellow', 'green'].map((color, i) => <circle key={color} cx={cx - 17 + i * 17} cy={cy} r="5" fill={color === light.color ? { red: '#ed5057', yellow: '#edbc3d', green: '#39c080' }[color] : '#52657f'} />)}
          <text x={cx} y={cy - 15} textAnchor="middle" fill="#334b3a" fontSize="10">{light.remaining}s</text>
        </g>;
      })}
      {(sim?.cars || []).map(car => {
        const lane = displayLane(car.change?.rampMerge ? { ...car, x: car.x - VEHICLE_LENGTH / 2 } : car, sim.time), glyphScale = Math.max(8, Math.min(24, VEHICLE_LENGTH * scale)) / 90;
        const point = car.ramp ? rampPoint(road.segments[car.ramp.segment], Math.max(0, car.ramp.progress - VEHICLE_LENGTH / 2)) : { x: car.x - VEHICLE_LENGTH / 2, lane };
        const cx = x(point.x), cy = y(point.lane), active = car.id === selected;
        const nextPoint = car.ramp ? rampPoint(road.segments[car.ramp.segment], Math.max(0, car.ramp.progress - VEHICLE_LENGTH / 2) + 1) : car.change?.rampMerge ? { x: point.x + 1, lane: displayLane({ ...car, x: point.x + 1 }, sim.time) } : point;
        const rotation = car.ramp || car.change?.rampMerge ? Math.atan2((nextPoint.lane - point.lane) * laneWidth, Math.max(.001, (nextPoint.x - point.x) * scale)) * 180 / Math.PI : 0;
        return <g key={car.id} data-traffic-car={car.id} data-ramp-merging={car.change?.rampMerge ? true : undefined} data-ramp-car={car.ramp?.type} data-player-car={car.isPlayer || undefined} transform={`translate(${cx} ${cy})`} tabIndex="0" role="button" aria-label={`车辆 ${car.id}，${Math.round(car.v * 3.6)} 公里每小时${`${car.isPlayer ? '，我的车' : ''}，${drivingStyle(car.drivingStyle).label}`}`} onClick={() => onSelect(car.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(car.id); } }}>
          <rect x="-13" y="-13" width="26" height="26" fill="transparent" />
          {active && <circle r="16" fill="#fff" fillOpacity=".25" stroke="#245bdb" strokeWidth="2" />}
          <g transform={`rotate(${90 + rotation}) scale(${glyphScale})`} dangerouslySetInnerHTML={{ __html: participantGlyph({ id: 'A', type: 'car', color: car.isPlayer ? '#e8b638' : paints[car.paint] }) }} />
          {car.isPlayer && <g pointerEvents="none"><rect x="-12" y="-30" width="24" height="19" rx="5" fill="#245bdb" stroke="white" strokeWidth="1.5" /><text x="0" y="-17" fill="white" textAnchor="middle" fontSize="11" fontWeight="600">我</text><path d="m-3 -11 3 4 3-4" fill="#245bdb" /></g>}
          {car.aggressive && <circle cx="0" cy="-10" r="2.5" fill="#e65151" stroke="white" strokeWidth="1" />}
        </g>;
      })}
    </svg>
  </div>;
}
