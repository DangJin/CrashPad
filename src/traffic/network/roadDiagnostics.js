import { roadMouths, minimumNodeGap, moveConnectedNode } from './layout.js';
import { normalizeRamps } from './ramps.js';

export function roadIssues(config) {
  return config.roads.flatMap(road => {
    const a=config.nodes.find(n=>n.id===road.from),b=config.nodes.find(n=>n.id===road.to);
    const mouth=roadMouths(config,road);
    if(!a||!b||!mouth||mouth.valid)return [];
    const gap=minimumNodeGap(a,b,config.roads),distance=Math.round(Math.hypot(b.x-a.x,b.y-a.y));
    const reason=mouth.error || (a.x!==b.x&&a.y!==b.y?'两端未对齐':distance<gap?`间距 ${distance}，至少需要 ${gap}`:'连接端方向不兼容');
    return [{id:road.id,label:`${a.name||a.id} → ${b.name||b.id}`,reason}];
  });
}

// Preserve connected rows/columns and reject fixes that break another road.
export function alignedRoad(config,id) {
  const road=config.roads.find(r=>r.id===id);if(!road)return null;
  const a=config.nodes.find(n=>n.id===road.from),b=config.nodes.find(n=>n.id===road.to);if(!a||!b)return null;
  const horizontal=Math.abs(b.x-a.x)>=Math.abs(b.y-a.y),axis=horizontal?'x':'y',cross=horizontal?'y':'x';
  const gap=minimumNodeGap(a,b,config.roads),before=new Set(roadIssues(config).map(i=>i.id));
  const candidates=[];
  for(const [fixed,moving] of [[a,b],[b,a]]) {
    const direction=Math.sign(moving[axis]-fixed[axis])||(moving===b?1:-1);
    const target={...moving,[cross]:fixed[cross],[axis]:fixed[axis]+direction*Math.max(gap,Math.abs(moving[axis]-fixed[axis]))};
    const next=normalizeRamps(moveConnectedNode(config,moving.id,target.x,target.y));
    if(roadIssues(next).some(i=>i.id===id||!before.has(i.id)))continue;
    const cost=next.nodes.reduce((sum,n)=>{const old=config.nodes.find(o=>o.id===n.id);return sum+Math.hypot(n.x-old.x,n.y-old.y);},0);
    candidates.push({next,cost});
  }
  return candidates.sort((a,b)=>a.cost-b.cost)[0]?.next||null;
}
