import { polylineLength, sliceLine, roundedLine, curveCenterline, validateCurve } from '../curveGeometry.js';
import { compileNetwork } from '../model.js';

export const MAX_ROUTE_METRES = 5000;
const directions = [[1,0],[0,1],[-1,0],[0,-1]];
export function coordinate(value) {
  const rawLng=value?.getLng?.() ?? value?.lng ?? value?.[0], rawLat=value?.getLat?.() ?? value?.lat ?? value?.[1];
  if([rawLng,rawLat].some(v=>!['number','string'].includes(typeof v)||String(v).trim()===''))throw Error('路线包含无效坐标，请重新选择。');
  const lng = Number(rawLng), lat = Number(rawLat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng)>180 || Math.abs(lat)>85) throw Error('路线包含无效坐标，请重新选择。');
  return [lng,lat];
}
function metres(a,b) {
  const rad=Math.PI/180, x=(b[0]-a[0])*rad*Math.cos((a[1]+b[1])/2*rad), y=(b[1]-a[1])*rad;
  return Math.hypot(x,y)*6371008.8;
}
function pathOf(step) {
  const raw=step.path ?? (typeof step.polyline==='string'?step.polyline.split(';').filter(Boolean).map(p=>p.split(',')):null);
  if((raw==null||Array.isArray(raw)&&!raw.length)&&Number(step.distance)>=0&&Number(step.distance)<=10)return [];
  if (!Array.isArray(raw) || raw.length<1 || raw.length>30000) throw Error('路线缺少道路坐标，无法生成草稿。');
  return raw.map(coordinate);
}
export function normalizeRoutes(result) {
  if (!Array.isArray(result?.routes) || !result.routes.length) throw Error('没有找到驾车路线，请调整起终点。');
  return result.routes.slice(0,3).map((route,index)=>{
    if (!Array.isArray(route.steps) || !route.steps.length || route.steps.length>300) throw Error('路线分段过多或不完整，请选择更短的路线。');
    const steps=route.steps.map((step,i)=>{
      const path=pathOf(step), distance=Number(step.distance);
      if (!Number.isFinite(distance) || distance<0) throw Error('路线长度数据不完整，请重新规划。');
      return {id:i,name:String(step.road || `未命名道路 ${i+1}`).slice(0,60),distance,path,action:String(step.action||'').slice(0,30)};
    });
    if(steps.reduce((sum,s)=>sum+s.path.length,0)>30000) throw Error('路线坐标过多，请缩小范围。');
    const rawLights=route.traffic_lights;
    const trafficLights=rawLights!==undefined&&rawLights!==null&&String(rawLights).trim()!==''&&Number.isInteger(Number(rawLights))&&Number(rawLights)>=0?Number(rawLights):null;
    return {trafficLights,id:index,name:String(route.policy||`路线 ${index+1}`).slice(0,50),distance:steps.reduce((sum,s)=>sum+s.distance,0),steps};
  });
}
function simplify(points,tolerance=35) {
  const keep=new Set([0,points.length-1]), stack=[[0,points.length-1]];
  while(stack.length){const [a,b]=stack.pop(); let far=0,at=-1;
    const p=points[a],q=points[b],dx=q.x-p.x,dy=q.y-p.y,len=dx*dx+dy*dy;
    for(let i=a+1;i<b;i++){const r=points[i],t=len?Math.max(0,Math.min(1,((r.x-p.x)*dx+(r.y-p.y)*dy)/len)):0,d=Math.hypot(r.x-p.x-t*dx,r.y-p.y-t*dy);if(d>far){far=d;at=i;}}
    if(far>tolerance){keep.add(at);stack.push([a,at],[at,b]);}
  }
  return [...keep].sort((a,b)=>a-b);
}
function project(geo,origin){return {x:(geo[0]-origin[0])*111195*Math.cos(origin[1]*Math.PI/180),y:-(geo[1]-origin[1])*111195};}
function nearestPoint(points,p){
  let best={gap:Infinity},travel=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    const t=len?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(len*len))):0;
    const point={x:a.x+t*dx,y:a.y+t*dy},gap=Math.hypot(point.x-p.x,point.y-p.y);
    if(gap<best.gap)best={point,gap,distance:travel+t*len};travel+=len;
  }
  return best;
}
export function snapRouteSignal(route,first,last,location){
  const draft=draftRoute(route,first,last),origin=route.steps.slice(first,last+1).find(s=>s.path.length).path[0];
  const line=draft.segments.flatMap(s=>s.points),nearest=nearestPoint(line,project(coordinate(location),origin));
  if(nearest.gap>35)throw Error('请点击所选路线附近（35 米以内）添加红绿灯。');
  if(nearest.distance<120||polylineLength(line)-nearest.distance<120)throw Error('红绿灯须距选取范围两端至少 120 米，请扩大范围。');
  return {location:[origin[0]+nearest.point.x/(111195*Math.cos(origin[1]*Math.PI/180)),origin[1]-nearest.point.y/111195],distance:nearest.distance};
}
export function draftRoute(route, first=0, last=route.steps.length-1, signalLocations=[]) {
  if(!Number.isInteger(first)||!Number.isInteger(last)||first<0||last<first||last>=route.steps.length) throw Error('请选择连续的起止路段。');
  const steps=route.steps.slice(first,last+1),distance=steps.reduce((sum,s)=>sum+s.distance,0);
  if(distance<120 || distance>MAX_ROUTE_METRES) throw Error('首版支持 120 米～5 公里的局部路线，请调整选取范围。');
  if(steps.some(s=>/掉头/.test(s.action))) throw Error('当前草稿不支持自动还原掉头，请避开掉头路段后导入，再手动设置。');
  const origin=steps.find(s=>s.path.length)?.path[0],points=[],boundaries=[];let cleaned=0;
  if(!origin)throw Error('选取范围没有有效道路坐标，请扩大范围或重新规划。');
  for(const [index,step] of steps.entries()){
    if(!step.path.length){if(step.distance>10)throw Error(`第 ${first+index+1} 段「${step.name}」缺少道路坐标，请重新规划。`);cleaned++;continue;}
    const projected=step.path.map(geo=>({x:(geo[0]-origin[0])*111195*Math.cos(origin[1]*Math.PI/180),y:-(geo[1]-origin[1])*111195}));
    if(points.length&&Math.hypot(points.at(-1).x-projected[0].x,points.at(-1).y-projected[0].y)>80)throw Error(`第 ${first+index+1} 段「${step.name}」与前段不连续，请调整范围。`);
    const actual=polylineLength(projected);
    if(actual<1&&step.distance>10)throw Error(`第 ${first+index+1} 段「${step.name}」标注 ${step.distance} 米，但缺少有效路径，请重新规划。`);
    if(actual<1||step.distance<10)cleaned++;
    for(const p of projected)if(!points.length||Math.hypot(points.at(-1).x-p.x,points.at(-1).y-p.y)>.05)points.push(p);
    boundaries.push({distance:polylineLength(points),name:step.name});
  }
  if(points.length<2||polylineLength(points)<120)throw Error('选取范围内没有足够的有效道路，请扩大范围。');
  if(points.length>5000)throw Error('所选路线坐标过密，请缩小范围后重试。');
  const reduced=simplify(points,2).map(i=>points[i]);
  if(reduced.length>500)throw Error('路线过于复杂，请缩小范围。');
  validateCurve(roundedLine(reduced));
  const total=polylineLength(reduced),cuts=[0];
  const signalCuts=signalLocations.map(location=>{
    const hit=nearestPoint(reduced,project(coordinate(location),origin));
    if(hit.gap>35||hit.distance<120||total-hit.distance<120)throw Error('红绿灯不在可导入范围内，请重新标记或扩大范围。');
    return hit.distance;
  }).sort((a,b)=>a-b);
  if(signalCuts.some((d,i)=>i&&d-signalCuts[i-1]<120))throw Error('当前模型要求红绿灯间距至少 120 米，请移除过近的标记。');
  // Navigation instructions are not road objects. Merge tiny instruction pieces,
  // while keeping useful boundaries for lane and signal configuration.
  for(const stop of boundaries.slice(0,-1))if(stop.distance-cuts.at(-1)>=240&&total-stop.distance>=240)cuts.push(stop.distance);
  // Keep signal locations exact; discard nearby artificial navigation boundaries.
  const safeCuts=cuts.filter(d=>d===0||signalCuts.every(signal=>Math.abs(signal-d)>=120));
  cuts.splice(0,cuts.length,...safeCuts,...signalCuts);cuts.sort((a,b)=>a-b);cuts.push(total);
  const segments=[];
  for(let i=1;i<cuts.length;i++){
    const start=cuts[i-1],span=cuts[i]-start,count=Math.ceil(span/1200);
    for(let j=0;j<count;j++){
      const lo=start+span*j/count,hi=start+span*(j+1)/count,shape=sliceLine(reduced,lo,hi);
      const name=boundaries.find(b=>b.distance>=lo+1)?.name||steps.at(-1).name;
      const dir=(Math.round(Math.atan2(shape.at(-1).y-shape[0].y,shape.at(-1).x-shape[0].x)/(Math.PI/2))+4)%4;
      segments.push({dir,length:Math.round(hi-lo),name,points:shape,lanes:2,speed:50,signalAtEnd:signalCuts.some(d=>Math.abs(d-hi)<.01)});
    }
  }
  if(segments.length>16)throw Error('路段过多，请缩小选取范围。');
  return {name:steps[0].name===steps.at(-1).name?steps[0].name:`${steps[0].name} → ${steps.at(-1).name}`,distance:Math.round(distance),geometryDistance:Math.round(total),cleaned,segments};
}

function number(value,min,max,label){const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw Error(`${label}须为 ${min}～${max} 的整数。`);return n;}
export function buildImportedNetwork(draft, options={}) {
  if(!draft?.segments?.length||draft.segments.length>16)throw Error('道路草稿无效。');
  if(draft.segments.every(s=>s.points))return buildCurvedNetwork(draft,options);
  const segments=draft.segments.map(s=>({...s,dir:number(s.dir,0,3,'方向'),length:number(s.length,60,1500,'道路长度'),lanes:number(s.lanes,1,6,'车道数'),speed:number(s.speed,20,120,'限速')}));
  const count=number(options.count??100,1,300,'车辆数'),flow=number(options.flow??30,1,240,'入口流量');
  const nodes=[{id:'map-start',type:'terminal',name:'路线起点',x:0,y:0,rotation:segments[0].dir*90,role:'source'}],roads=[];
  for(const [i,s] of segments.entries()){
    const prev=nodes.at(-1),[dx,dy]=directions[s.dir],span=Math.max(options.signals?.[i]&&segments[i+1]?.dir!==s.dir?480:240,Math.round(s.length*.45)+120),next=segments[i+1];
    const node={id:`map-node-${i}`,x:prev.x+dx*span,y:prev.y+dy*span,name:next?`${i+1} · ${next.name}`:'路线终点',rotation:0};
    if(!next){node.type='terminal';node.role='sink';node.rotation=((s.dir+2)%4)*90;}
    else if(next.dir===s.dir){node.type='straight';node.rotation=s.dir*90;node.length=60;}
    else{node.type='bend';const sides=[(s.dir+2)%4,next.dir];node.rotation=[0,1,2,3].find(r=>sides.includes(r)&&sides.includes((r+1)%4))*90;}
    const road={id:`map-road-${i}`,name:s.name,from:prev.id,to:node.id,lanes:s.lanes,length:s.length,speed:s.speed,oneWay:true};
    if(next&&options.signals?.[i]){
      const signal={enabled:true,plan:'cycle',green:30,red:30,leftGreen:12};
      if(node.type==='straight')node.signal=signal;
      else{
        if(s.length<120)throw Error('转弯前设置信号灯需要至少 120 米路段，请扩大选取范围或取消该信号。');
        const stop={id:`map-stop-${i}`,name:'转弯前信号',type:'straight',rotation:s.dir*90,x:node.x-dx*240,y:node.y-dy*240,length:60,signal};
        nodes.push(stop);roads.push({...road,to:stop.id,length:s.length-60});road.id+= '-approach';road.from=stop.id;road.length=60;
      }
    }
    nodes.push(node);roads.push(road);
  }
  const minX=Math.min(...nodes.map(n=>n.x)), minY=Math.min(...nodes.map(n=>n.y));
  nodes.forEach(n=>{n.x+=180-minX;n.y+=180-minY;});
  if(nodes.some(n=>n.x>3800||n.y>3800))throw Error('简化后的路网超出编辑范围，请选取更短的路线。');
  const config={version:1,nodes,roads,demand:[{node:'map-start',count,flow,destinations:{[nodes.at(-1).id]:100}}],seed:42,driverMix:{conservative:20,normal:60,aggressive:20},etcPercent:100,player:null,mapImport:{provider:'amap',mode:'schematic',name:String(draft.name).slice(0,120),sourceDistance:draft.distance,assumptions:'单向路线；车道、限速、信号为用户确认参数；支路和立交未自动还原'}};
  try{compileNetwork(config);}catch(error){throw Error(`路线无法安全简化为当前路网：${error.message} 请缩小范围；不会自动创建交叉路口。`);}
  return config;
}

function buildCurvedNetwork(draft,options){
  const segments=draft.segments.map(s=>({...s,lanes:number(s.lanes,1,6,'车道数'),speed:number(s.speed,20,120,'限速')}));
  const count=number(options.count??100,1,300,'车辆数'),flow=number(options.flow??30,1,240,'入口流量');
  const all=segments.flatMap(s=>s.points),dx=180-Math.min(...all.map(p=>p.x)),dy=180-Math.min(...all.map(p=>p.y));
  const points=segments.map(s=>s.points.map(p=>({x:p.x+dx,y:p.y+dy})));
  const nodes=[{id:'map-start',type:'terminal',name:'路线起点',...points[0][0],rotation:0,role:'source',visualRadius:20}],roads=[];
  for(let i=0;i<segments.length;i++){
    const last=i===segments.length-1,s=segments[i],node={id:`map-node-${i}`,type:last?'terminal':'anchor',name:last?'路线终点':`${i+1} · 路线连接`,...points[i].at(-1),rotation:last?180:0,visualRadius:last?20:30,...(last?{role:'sink'}:{})};
    if(!last&&(options.signals?.[i]??s.signalAtEnd))node.signal={enabled:true,plan:'cycle',green:30,red:30,leftGreen:12};
    roads.push({id:`map-road-${i}`,name:s.name,from:nodes.at(-1).id,to:node.id,lanes:s.lanes,speed:s.speed,oneWay:true,geometry:{points:points[i],radius:12}});nodes.push(node);
  }
  const config={version:1,nodes,roads,demand:[{node:'map-start',count,flow,destinations:{[nodes.at(-1).id]:100}}],seed:42,driverMix:{conservative:20,normal:60,aggressive:20},etcPercent:100,player:null,mapImport:{provider:'amap',mode:'curved',name:String(draft.name).slice(0,120),sourceDistance:draft.distance,geometryDistance:draft.geometryDistance,assumptions:'保留路线弧度；车道、限速、信号为用户确认参数；支路和立交未自动还原'}};
  for(const road of roads)road.length=Math.round(polylineLength(curveCenterline(config,road))*10)/10;
  try{compileNetwork(config);}catch(error){throw Error(`无法生成连续路网：${error.message}`);}
  return config;
}
