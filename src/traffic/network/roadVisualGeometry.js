import { curveLane, heading as curveHeading } from './curveGeometry.js';
import { LANES, junctionRadius, pathGeometry, connectorGeometry, laneTurns, turnFor } from './model.js';
import { roadMouths } from './layout.js';
import { rampPoints } from './ramps.js';

export const linePath = points => points.map((p,i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
export const polygonPoints = points => points.map(p => `${p.x},${p.y}`).join(' ');

// Display geometry must not depend on the entire graph being simulatable.
export function visualRoadEdges(config, road) {
  const mouth = roadMouths(config, road);
  if (!mouth?.valid) return [];
  return (road.oneWay ? [false] : [false,true]).map(reverse => {
    const dx = reverse ? -mouth.dx : mouth.dx, dy = reverse ? -mouth.dy : mouth.dy;
    const start = reverse ? mouth.end : mouth.start, end = reverse ? mouth.start : mouth.end;
    const from = reverse ? road.to : road.from, to = reverse ? road.from : road.to;
    const heading = (Math.atan2(dy,dx)*180/Math.PI+360)%360;
    return {curved:!!road.geometry,...(road.geometry?{startHeading:reverse?curveHeading(mouth.curve.at(-1),mouth.curve.at(-2)):curveHeading(mouth.curve[0],mouth.curve[1]),endHeading:reverse?curveHeading(mouth.curve[1],mouth.curve[0]):curveHeading(mouth.curve.at(-2),mouth.curve.at(-1))}:{}), id: `${road.id}:${from}`, roadId:road.id, from,to, heading, lanes:road.lanes, length:road.length, kind:road.kind,
      paths:Array.from({length:road.lanes},(_,lane) => {
        const offset=(lane+.5)*LANES;
        const points = curveLane(config,road,lane,reverse) || rampPoints(config,road,lane) || [{x:start.x-dy*offset,y:start.y+dx*offset},{x:end.x-dy*offset,y:end.y+dx*offset}];
        return {...pathGeometry(points,road.length),id:`${road.id}:${from}:${lane}`,lane};
      }) };
  });
}
export function offsetLine(points, offset) {
  return points.map((p,i) => {
    const a=points[Math.max(0,i-1)], b=points[Math.min(points.length-1,i+1)];
    const length=Math.hypot(b.x-a.x,b.y-a.y)||1;
    return {x:p.x-(b.y-a.y)/length*offset,y:p.y+(b.x-a.x)/length*offset};
  });
}
export function facilityGeometry(config, node) {
  const nodes=Object.fromEntries(config.nodes.map(n=>[n.id,n]));
  const theta=node.rotation*Math.PI/180, dx=Math.round(Math.cos(theta)),dy=Math.round(Math.sin(theta)),radius=junctionRadius(node,config.roads);
  const attached=config.roads.filter(r=>r.kind!=='ramp'&&(r.from===node.id||r.to===node.id));
  function mouth(low){
    const road=attached.find(r=>{const other=nodes[r.from===node.id?r.to:r.from];return other&&(((other.x-node.x)*dx+(other.y-node.y)*dy<0)===low);});
    if(!road)return {lo:-12,hi:12};
    const a=nodes[road.from],b=nodes[road.to],forward=(b.x-a.x)*dx+(b.y-a.y)*dy>0;
    return {lo:!road.oneWay||!forward?-road.lanes*LANES:0,hi:!road.oneWay||forward?road.lanes*LANES:0};
  }
  const left=mouth(true),right=mouth(false);
  const bank=node.type==='toll'?{lo:Math.min(left.lo,right.lo)<0?-(node.booths??8)*LANES:0,hi:Math.max(left.hi,right.hi)>0?(node.booths??8)*LANES:0}:null;
  const point=(x,y)=>({x:node.x+dx*x-dy*y,y:node.y+dy*x+dx*y});
  const bankHalf=radius-100;
  const stations=Array.from({length:41},(_,i)=>{
    const x=-radius+2*radius*i/40,row={x};
    for(const key of ['lo','hi']){
      if(bank){const t=x < -bankHalf?(x+radius)/(radius-bankHalf):x>bankHalf?(x-bankHalf)/(radius-bankHalf):null;
        row[key]=t==null?bank[key]:x < -bankHalf?left[key]+(bank[key]-left[key])*t*t*(3-2*t):bank[key]+(right[key]-bank[key])*t*t*(3-2*t);
      }else{const t=i/40;row[key]=left[key]+(right[key]-left[key])*t*t*(3-2*t);}
    }
    return row;
  });
  const lo=stations.map(p=>point(p.x,p.lo)),hi=stations.map(p=>point(p.x,p.hi)),dividers=[];
  for(const sign of [-1,1]){
    const key=sign<0?'lo':'hi',count=Math.round(Math.max(...stations.map(p=>Math.abs(p[key])))/LANES);
    for(let lane=1;lane<count;lane++)dividers.push(stations.map(p=>point(p.x,sign*Math.min(lane*LANES,Math.abs(p[key])))));
  }
  return {point,lo,hi,dividers,polygon:[...lo,...hi.toReversed()],center:Math.min(left.lo,right.lo)<0&&Math.max(left.hi,right.hi)>0?[point(-radius,0),point(radius,0)]:null};
}
export function bendPaths(config,node){
  const edges=config.roads.filter(r=>r.from===node.id||r.to===node.id).flatMap(r=>visualRoadEdges(config,r));
  return edges.filter(e=>e.to===node.id).flatMap(a=>edges.filter(b=>b.from===node.id&&b.roadId!==a.roadId).flatMap(b=>a.paths.filter((p,lane)=>laneTurns(node,a,lane).includes(turnFor(a,b))).map(p=>connectorGeometry(a,b,p.lane,Math.min(p.lane,b.lanes-1)))));
}
