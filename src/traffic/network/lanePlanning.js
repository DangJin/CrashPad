// Look through up to three links within the route preparation horizon; cache per compiled network/route so
// lane preparation does not scan the graph on every simulation tick.
const caches = new WeakMap();
export function preferredRouteLanes(net, route, index, depth = 3) {
  let cache=caches.get(net);if(!cache)caches.set(net,cache=new Map());
  const key=`${depth}:${route.slice(index,index+depth+2).join('|')}`;
  if(cache.has(key))return cache.get(key);
  const edge=net.edges[route[index]];
  if(!edge)return [];
  const choices=Object.values(net.connectors).filter(c=>c.incoming===edge.id&&c.outgoing===route[index+1]);
  if(!choices.length)return Array.from({length:edge.lanes},(_,i)=>i);
  const next=net.edges[route[index+1]],lookAhead=depth>0&&next.length<=800&&!next.toll;
  const downstream=lookAhead?preferredRouteLanes(net,route,index+1,depth-1):[];
  const cost=new Map();
  for(const c of choices){const lane=net.paths[c.from].lane,target=net.paths[c.to].lane;
    const score=downstream.length?Math.min(...downstream.map(i=>Math.abs(i-target))):0;
    cost.set(lane,Math.min(cost.get(lane)??Infinity,score));
  }
  const minimum=Math.min(...cost.values()),result=[...cost].filter(([,score])=>score===minimum).map(([lane])=>lane);
  cache.set(key,result);return result;
}
