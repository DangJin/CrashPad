import {clone,compileNetwork,sideOf} from './model.js';
import {curveCenterline,polylineLength,validateCurve,sliceLine} from './curveGeometry.js';
export function addCurveControl(config,id){
  const next=clone(config),r=next.roads.find(r=>r.id===id);if(!r)return {error:'道路不存在。'};
  const a=next.nodes.find(n=>n.id===r.from),b=next.nodes.find(n=>n.id===r.to);
  if(!r.geometry)r.geometry={points:[{x:a.x,y:a.y},{x:(a.x+b.x)/2,y:(a.y+b.y)/2},{x:b.x,y:b.y}],fromSide:sideOf(a,b),toSide:sideOf(b,a),radius:12};
  else{
    const points=r.geometry.points;if(points.length>=512)return {error:'控制点已达上限。'};
    let at=1;for(let i=2;i<points.length;i++)if(Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y)>Math.hypot(points[at].x-points[at-1].x,points[at].y-points[at-1].y))at=i;
    points.splice(at,0,{x:(points[at-1].x+points[at].x)/2,y:(points[at-1].y+points[at].y)/2});
  }
  try{const curve=curveCenterline(next,r);validateCurve(curve);r.length=Math.round(polylineLength(curve)*10)/10;if(r.length>1500)throw Error('曲线长度超过 1500 米，请先缩短道路。');let valid=true;try{compileNetwork(config);}catch{valid=false;}if(valid)compileNetwork(next);return {config:next};}catch(e){return {error:e.message};}
}

// Lane changes remain on the same centreline; fixed-axis facilities require
// their own geometry upgrade and must never silently straighten a map route.
export function insertCurveSection(config,roadId,kind,id){
  if(!['straight','add','drop'].includes(kind))return {error:'曲线路段目前支持分段和车道增减；收费站、匝道请放在独立直线路段，避免改变导入道路的走向。'};
  const next=clone(config),road=next.roads.find(r=>r.id===roadId),points=road?.geometry?.points;if(!points)return {error:'曲线路段不存在。'};
  const total=polylineLength(points),half=total/2;
  const first=sliceLine(points,0,half),second=sliceLine(points,half,total),at=first.at(-1);
  const node={id,type:'anchor',name:kind==='add'?'车道增加':kind==='drop'?'车道减少':'路线连接',...at,rotation:0};
  const tail={...road,id:`${id}-road`,from:id,geometry:{...road.geometry,points:second,fromSide:'east'},lanes:kind==='add'?Math.min(6,road.lanes+1):kind==='drop'?Math.max(1,road.lanes-1):road.lanes};
  road.to=id;road.geometry={...road.geometry,points:first,toSide:'west'};next.nodes.push(node);next.roads.push(tail);
  try{for(const r of [road,tail])r.length=Math.round(polylineLength(curveCenterline(next,r))*10)/10;compileNetwork(next);return {config:next,selected:{type:'node',id}};}catch(e){return {error:`无法在这里分段：${e.message}`};}
}
