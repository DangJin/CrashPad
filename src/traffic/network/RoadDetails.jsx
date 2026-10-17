import { LANES, pointOn, junctionRadius } from './model.js';
import { rampAuxiliary } from './ramps.js';
import { facilityGeometry, linePath, polygonPoints, offsetLine, visualRoadEdges } from './roadVisualGeometry.js';
const white='#f3f3e9';

export function RampSurface({config,node}){
  return config.roads.filter(r=>r.kind==='ramp'&&(r.from===node.id||r.to===node.id)).map(road=>{
    const shape=rampAuxiliary(config,road);if(!shape)return null;
    const {point,radius,edge,side}=shape,merge=node.type==='merge';
    const arrow=point(merge?-radius*.35:radius*.35,edge+side*road.lanes*LANES/2);
    return <g key={road.id} data-network-ramp-join={node.id}>
      <polygon data-ramp-gore points={polygonPoints(shape.gore)} fill="url(#network-gore)" stroke={white} strokeWidth=".65"/>
      <polygon data-ramp-auxiliary points={polygonPoints(shape.polygon)} fill="url(#network-asphalt)"/>
      <path d={linePath(shape.base)} stroke="url(#network-asphalt)" strokeWidth="2.4"/>
      <path data-ramp-taper d={linePath(shape.outer)} stroke={white} strokeWidth=".9" fill="none"/>
      <path data-ramp-separator d={linePath(shape.separator)} stroke={white} strokeWidth=".9" strokeDasharray="4 5" fill="none"/>
      <g transform={`translate(${arrow.x} ${arrow.y}) rotate(${shape.heading})`} fill="none" stroke={white} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
        <path d={merge?`M-9 0H2L8 ${-side*3}m-5-1 5 ${1-side*3} -1 5`:'M-9 0H8m-4-3 4 3-4 3'}/>
      </g>
    </g>;
  });
}
export function FacilityMarkings({config,node}){
  const shape=facilityGeometry(config,node);
  const ramps=config.roads.filter(r=>r.kind==='ramp'&&(r.from===node.id||r.to===node.id)).map(r=>rampAuxiliary(config,r)).filter(Boolean);
  const skipped = new Set(ramps.map(r=>{
    const theta=node.rotation*Math.PI/180,nx=-Math.sin(theta),ny=Math.cos(theta);
    const actualX=-r.dy*r.side,actualY=r.dx*r.side;
    return actualX*nx+actualY*ny>0?'hi':'lo';
  }));
  return <g data-facility-markings={node.id} pointerEvents="none">
    {['lo','hi'].filter(key=>!skipped.has(key)).map(key=><path key={key} d={linePath(shape[key])} stroke={white} strokeWidth=".9" fill="none"/>)}
    {shape.dividers.map((points,i)=><path key={i} d={linePath(points)} stroke={white} strokeWidth=".7" strokeDasharray="7 9" fill="none" opacity=".85"/>)}
    {shape.center&&<path d={linePath(shape.center)} stroke="#ebcc69" strokeWidth="1.1" fill="none"/>}
  </g>;
}
export function CurveEdges({points,width=LANES}){
  return <g pointerEvents="none">{[-1,1].map(sign=><path key={sign} d={linePath(offsetLine(points,sign*(width/2-.4)))} stroke={white} strokeWidth=".75" fill="none"/>)}</g>;
}
export function JunctionMarkings({config,node}){
  if(!['cross','tee'].includes(node.type))return null;
  return <g data-junction-markings={node.id} pointerEvents="none">{config.roads.filter(r=>r.from===node.id||r.to===node.id).map(road=>{
    const edges=visualRoadEdges(config,road),incoming=edges.find(e=>e.to===node.id);
    if(!incoming)return null;
    const angle=incoming.heading*Math.PI/180,first=incoming.paths[0].points.at(-1);
    const x=first.x+Math.sin(angle)*LANES/2,y=first.y-Math.cos(angle)*LANES/2;
    const lo=road.oneWay?0:-road.lanes*LANES,hi=road.lanes*LANES;
    return <g key={road.id} transform={`translate(${x} ${y}) rotate(${incoming.heading})`}>
      <g data-crosswalk>{Array.from({length:Math.floor((hi-lo)/4)},(_,i)=><rect key={i} x="5" y={lo+i*4+.7} width="9" height="2" fill={white} opacity=".9"/>)}</g>
      <path data-stop-line d={`M-1 1V${hi-1}`} stroke={white} strokeWidth="1.5"/>
      {incoming.paths.map((p,lane)=><path key={lane} data-lane-arrow d={`M-34 ${(lane+.5)*LANES}h14m-5-3 5 3-5 3`} stroke={white} strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round"/>)}
    </g>;
  })}</g>;
}
export function RoadArrows({edge}){
  return <g pointerEvents="none">{edge.paths.map(p=>{
    const q=pointOn(p,p.length*.7);
    return <path key={p.id} transform={`translate(${q.x} ${q.y}) rotate(${q.heading})`} d="M-7 0H7m-4-3 4 3-4 3" stroke={white} strokeWidth=".9" fill="none" strokeLinecap="round" strokeLinejoin="round"/>;
  })}</g>;
}

export function TollDetails({config,node,net,snapshot,onSelect,screen}){
  const shape=facilityGeometry(config,node),angle=node.rotation*Math.PI/180,dx=Math.cos(angle),dy=Math.sin(angle);
  const nodes=Object.fromEntries(config.nodes.map(n=>[n.id,n]));
  const roads=config.roads.filter(r=>r.from===node.id||r.to===node.id);
  const directions=[1,-1].filter(sign=>roads.some(r=>{
    const a=nodes[r.from],b=nodes[r.to];
    return a&&b&&(!r.oneWay||Math.sign((b.x-a.x)*dx+(b.y-a.y)*dy)===sign);
  }));
  return <g data-toll-details={node.id}>{directions.flatMap(sign=>Array.from({length:node.booths??8},(_,lane)=>{
    const type=node.tollLanes?.[lane]||'etc',p=shape.point(sign*(junctionRadius(node,config.roads)-100)*.2,sign*(lane+.5)*LANES),heading=(node.rotation+(sign<0?180:0))%360;
    const serving=snapshot?.cars.some(c=>net?.paths[c.path]?.toll?.station===node.id&&net.paths[c.path].lane===lane&&c.tollService);
    const label=shape.point(sign*(-10),sign*(lane+.5)*LANES);
    return <g key={`${sign}:${lane}`} data-network-toll-booth={node.id} data-booth-type={type} role="button" tabIndex={0} aria-label={`${node.id} 窗口 ${lane+1} ${type==='etc'?'ETC':'人工'}`} onClick={()=>onSelect({type:'node',id:node.id})} onKeyDown={e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();onSelect({type:'node',id:node.id});}}}>
      <g transform={`translate(${p.x} ${p.y}) rotate(${heading})`}>
        <rect data-toll-island x="-13" y="-7" width="27" height="2.4" rx="1.2" fill="#dadfdc" stroke="#e7c556" strokeWidth=".6"/>
        <rect x="-5" y="-8" width="8" height="4.5" rx=".6" fill="#c8d3da" stroke="#344758" strokeWidth=".6"/>
        <path d="M-4-7H2" stroke="#6c899b" strokeWidth="1.3"/>
        <path data-toll-barrier d={serving?'M6-4V4':'M6-4L12-4'} stroke={serving?'#ec6967':'#e4ca66'} strokeWidth="1.2"/>
      </g>
      <g transform={screen(label.x,label.y,heading)}><rect x="-14" y="-6" width="28" height="12" rx="2" fill={type==='etc'?'#187957':'#315eae'}/><text x="0" y="3" fill="white" fontSize="9" textAnchor="middle">{type==='etc'?'ETC':'人工'}</text></g>
    </g>;
  }))}</g>;
}
