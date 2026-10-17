// Shared, model-independent centreline geometry. Coordinates use canvas metres.
export const distance = (a,b) => Math.hypot(b.x-a.x,b.y-a.y);
export const heading = (a,b) => Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
export const polylineLength = points => points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p),0);
const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
export function sliceLine(points,start,end=polylineLength(points)) {
  const result=[];let along=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],len=distance(a,b),next=along+len;
    if(len>1e-8&&next>=start&&along<=end){
      const p=mix(a,b,Math.max(0,(start-along)/len)),q=mix(a,b,Math.min(1,(end-along)/len));
      if(!result.length||distance(result.at(-1),p)>1e-6)result.push(p);
      if(distance(result.at(-1),q)>1e-6)result.push(q);
    }
    along=next;if(along>=end)break;
  }
  return result;
}
export function roundedLine(points,radius=12) {
  if(points.length<3||radius<=0)return points.map(p=>({...p}));
  const result=[{...points[0]}];
  for(let i=1;i<points.length-1;i++){
    const a=points[i-1],b=points[i],c=points[i+1],ab=distance(a,b),bc=distance(b,c);
    if(ab<.01||bc<.01)continue;
    const cut=Math.min(radius,ab*.25,bc*.25),p=mix(b,a,cut/ab),q=mix(b,c,cut/bc);
    result.push(p);for(let k=1;k<=8;k++){const t=k/8;result.push(mix(mix(p,b,t),mix(b,q,t),t));}
  }
  result.push({...points.at(-1)});return result;
}
export function offsetPolyline(points,offset) {
  return points.map((p,i)=>{
    const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],len=distance(a,b)||1;
    return {x:p.x-(b.y-a.y)/len*offset,y:p.y+(b.x-a.x)/len*offset};
  });
}
export function curveCenterline(config,road,trim=true) {
  if(!road?.geometry)return null;
  const raw=road.geometry.points;
  if(!Array.isArray(raw)||raw.length<2||raw.length>512||raw.some(p=>!Number.isFinite(p?.x)||!Number.isFinite(p?.y)))throw Error('曲线路径需要 2～512 个有效控制点。');
  const a=config.nodes.find(n=>n.id===road.from),b=config.nodes.find(n=>n.id===road.to);
  if(!a||!b)throw Error('曲线端点不存在。');
  // Anchoring interpolates endpoint displacement across the whole control polygon.
  const lengths=[0];for(let i=1;i<raw.length;i++)lengths.push(lengths.at(-1)+distance(raw[i-1],raw[i]));
  const total=lengths.at(-1);if(total<1)throw Error('曲线控制点重合，请拉开道路端点。');
  const points=raw.map((p,i)=>{const t=lengths[i]/total;return {x:p.x+(a.x-raw[0].x)*(1-t)+(b.x-raw.at(-1).x)*t,y:p.y+(a.y-raw[0].y)*(1-t)+(b.y-raw.at(-1).y)*t};});
  // Existing facilities keep their port tangents; imported anchors follow the
  // surveyed centreline freely. This avoids tearing a curve off a straight node.
  const vector={east:[1,0],south:[0,1],west:[-1,0],north:[0,-1]};
  for(const [node,side,start] of [[a,road.geometry.fromSide,true],[b,road.geometry.toSide,false]])if(!['anchor','terminal'].includes(node.type)&&vector[side]){
    const [dx,dy]=vector[side],reach=(node.visualRadius??Math.max(50,...config.roads.filter(r=>r.from===node.id||r.to===node.id).map(r=>r.lanes*12+8)))+30;
    const p={x:node.x+dx*reach,y:node.y+dy*reach};points.splice(start?1:points.length-1,0,p);
  }
  const radiusSetting=road.geometry.radius??12;if(!Number.isFinite(radiusSetting)||radiusSetting<0||radiusSetting>200)throw Error('曲线平滑半径无效。');
  const curve=roundedLine(points,radiusSetting),length=polylineLength(curve);
  if(!trim)return curve;
  const radius=n=>n.visualRadius??(n.type==='anchor'?30:n.type==='terminal'?50:Math.max(50,...config.roads.filter(r=>r.from===n.id||r.to===n.id).map(r=>r.lanes*12+8)));
  const start=radius(a),end=radius(b);
  if(length-start-end<60)throw Error('曲线过短，端点之间至少需要 60 米可行驶道路。');
  return sliceLine(curve,start,length-end);
}
export function curveSide(config,road,from=true){
  const node=config.nodes.find(n=>n.id===(from?road.from:road.to));
  if(road.geometry?.[from?'fromSide':'toSide'])return road.geometry[from?'fromSide':'toSide'];
  if(node?.type==='anchor')return from?'east':'west';
  if(node?.type==='terminal')return ['east','south','west','north'][(node.rotation||0)/90];
  return road.geometry?.[from?'fromSide':'toSide'];
}
export function curveLane(config,road,lane,reverse=false){
  const points=curveCenterline(config,road);if(!points)return null;
  return offsetPolyline(reverse?points.toReversed():points,(lane+.5)*12);
}
export function segmentsCross(a,b,c,d){
  const cross=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
  if(abC*abD<-1e-6&&cdA*cdB<-1e-6)return true;
  const on=(p,q,r)=>Math.abs(cross(p,q,r))<1e-6&&r.x>=Math.min(p.x,q.x)-1e-6&&r.x<=Math.max(p.x,q.x)+1e-6&&r.y>=Math.min(p.y,q.y)-1e-6&&r.y<=Math.max(p.y,q.y)+1e-6;
  return on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);
}
export function validateCurve(points){
  if(points.length>4096)throw Error('曲线过于复杂，请减少控制点。');
  for(let i=1;i<points.length;i++)for(let j=i+2;j<points.length;j++)if(segmentsCross(points[i-1],points[i],points[j-1],points[j]))throw Error('曲线路径自交，请调整控制点；不会自动推断立交。');
}
export function synchronizeCurves(before,next){
  for(const road of next.roads.filter(r=>r.geometry)){
    const old=before.roads.find(r=>r.id===road.id);if(!old)continue;
    const a=before.nodes.find(n=>n.id===old.from),b=before.nodes.find(n=>n.id===old.to),na=next.nodes.find(n=>n.id===road.from),nb=next.nodes.find(n=>n.id===road.to);
    if(!a||!b||!na||!nb)continue;
    const points=old.geometry.points,total=polylineLength(points);let along=0;
    road.geometry.points=points.map((p,i)=>{if(i)along+=distance(points[i-1],p);const t=along/total;return {x:p.x+(na.x-a.x)*(1-t)+(nb.x-b.x)*t,y:p.y+(na.y-a.y)*(1-t)+(nb.y-b.y)*t};});
    try{road.length=Math.round(polylineLength(curveCenterline(next,road))*10)/10;}catch{ /* Keep editable invalid shape; diagnostics explain it. */ }
  }
  return next;
}
