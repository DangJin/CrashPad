import { roadMouths } from './layout.js';
import { clone, junctionRadius, compileNetwork } from './model.js';
// Translate complete attached subgraphs; never deform neighbouring roads.
function component(config,start,blockedNode,blockedRoad){
  const found=new Set([start]),queue=[start];
  while(queue.length){const id=queue.shift();for(const r of config.roads){
    if(r.id===blockedRoad||r.from===blockedNode||r.to===blockedNode)continue;
    const other=r.from===id?r.to:r.to===id?r.from:null;
    if(other&&!found.has(other)){found.add(other);queue.push(other);}
  }}return found;
}
export function resizeRoadLength(config,selection,length){
  const next=clone(config),nodes=Object.fromEntries(next.nodes.map(n=>[n.id,n]));
  if(selection.type==='road'){
    const r=next.roads.find(r=>r.id===selection.id);if(!r)return {config};
    if(!Number.isFinite(length)||length<60||length>1500)return {error:'道路长度范围为 60～1500 米。'};
    const a=nodes[r.from],b=nodes[r.to],group=component(next,b.id,null,r.id);
    if(group.has(a.id))return {error:'这条道路位于闭环中，无法单独伸缩；请先断开一处连接再调整。'};
    const dx=b.x-a.x,dy=b.y-a.y,distance=Math.hypot(dx,dy);
    if(!distance)return {error:'请先调整重合的道路端点。'};
    const visible=Math.max(20,distance-junctionRadius(a,next.roads)-junctionRadius(b,next.roads));
    const delta=Math.max(20,visible*length/r.length)-visible;
    for(const n of next.nodes)if(group.has(n.id)){n.x+=dx/distance*delta;n.y+=dy/distance*delta;}
    r.length=length;
  }else{
    const node=nodes[selection.id];if(!node)return {config};
    const toll=node.type==='toll',minimum=toll?260:60;
    if(!Number.isFinite(length)||length<minimum||length>1500)return {error:`长度范围为 ${minimum}～1500 米。`};
    const radius=junctionRadius(node,next.roads),oldLength=node.length??(toll?600:200);
    const newRadius=toll?100+(radius-100)*(length-200)/(oldLength-200):radius*length/oldLength;
    const angle=node.rotation*Math.PI/180,dx=Math.round(Math.cos(angle)),dy=Math.round(Math.sin(angle));
    const movements=new Map();
    for(const r of next.roads.filter(r=>r.from===node.id||r.to===node.id)){
      const other=nodes[r.from===node.id?r.to:r.from],side=Math.sign((other.x-node.x)*dx+(other.y-node.y)*dy);
      const group=component(next,other.id,node.id,null);
      for(const id of group){if(movements.has(id)&&movements.get(id)!==side)return {error:'该组件两侧处于同一个闭环中，无法单独伸缩；请先断开一处连接。'};movements.set(id,side);}
    }
    for(const [id,side] of movements){nodes[id].x+=dx*side*(newRadius-radius);nodes[id].y+=dy*side*(newRadius-radius);}
    node.visualRadius=newRadius;node.length=length;
  }
  const broken=next.roads.find(r=>!roadMouths(next,r)?.valid && roadMouths(config,config.roads.find(old=>old.id===r.id))?.valid);
  if(broken)return {error:'当前空间不足以保持连接，请先拉开相邻组件再缩短路面。'};
  let previouslyValid=true;try{compileNetwork(config);}catch{previouslyValid=false;}
  if(previouslyValid)try{compileNetwork(next);}catch(error){return {error:`长度调整会造成新的路网冲突：${error.message}`};}
  return {config:next};
}
