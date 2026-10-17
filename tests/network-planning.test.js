import test from 'node:test';
import assert from 'node:assert/strict';
import { corridorExample, insertTemplate } from '../src/traffic/network/templates.js';
import { compileNetwork, findRoute, makeExample, bendSpeedLimit, pointOn } from '../src/traffic/network/model.js';
import { preferredRouteLanes } from '../src/traffic/network/lanePlanning.js';
import { createNetworkSimulation, stepNetwork } from '../src/traffic/network/engine.js';

test('widening uses every new lane before leaving the component',()=>{
  const config=corridorExample('straight');config.roads[0].lanes=1;config.demand[0].count=40;
  const sim=createNetworkSimulation(config),used=new Set();
  while(!sim.finished){stepNetwork(sim);for(const c of sim.cars){const p=sim.net.paths[c.path];if(p.type==='connector')used.add(sim.net.paths[p.to].lane);}}
  assert.deepEqual([...used].sort(),[0,1,2]);assert.equal(sim.completed.length,40);assert.equal(sim.failed.length,0);
});
test('short link exit preparation propagates into the preceding road',()=>{
  let config=corridorExample('exit');
  config=insertTemplate(config,{type:'road',id:'in'},'straight',123).config;
  const incoming=config.roads.find(r=>r.to==='section');incoming.length=60;
  config.demand[0].destinations={branch:100};config.demand[0].count=30;
  const net=compileNetwork(config),route=findRoute(net,'start','branch');
  assert.deepEqual(preferredRouteLanes(net,route,0),[2]);
  const sim=createNetworkSimulation(config);
  while(!sim.finished)stepNetwork(sim);
  assert.equal(sim.failed.length,0);assert.equal(sim.completed.length,30);assert.equal(sim.timedOut,false);
});
test('local reservations allow safely separated crossing paths concurrently',()=>{
  const config=makeExample();config.nodes[0].signal.enabled=false;
  const sim=createNetworkSimulation(config);let releasedOverlap=0;
  while(!sim.finished){stepNetwork(sim);
    const cars=sim.cars.filter(c=>sim.net.paths[c.path].type==='connector');
    for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++){
      const a=cars[i],b=cars[j],pa=sim.net.paths[a.path],pb=sim.net.paths[b.path];if(pa.id===pb.id)continue;
      if(pa.conflicts.includes(pb.id)) {assert.ok(a.s>pb.conflictRelease?.[pa.id]||b.s>pa.conflictRelease?.[pb.id]);releasedOverlap++;}
      const p=pointOn(pa,a.s),q=pointOn(pb,b.s);assert.ok(Math.hypot(p.x-q.x,p.y-q.y)>5.4);
    }
  }
  assert.ok(releasedOverlap>0);assert.equal(sim.completed.length,100);assert.equal(sim.failed.length,0);
});
test('bend speed follows curve radius and respects both road limits',()=>{
  const arc=r=>Array.from({length:41},(_,i)=>({x:r*Math.cos(i*Math.PI/80),y:r*Math.sin(i*Math.PI/80)}));
  assert.ok(bendSpeedLimit(arc(40),90)>bendSpeedLimit(arc(10),90));
  assert.equal(bendSpeedLimit(arc(400),30),30);
  assert.equal(bendSpeedLimit([{x:0,y:0},{x:10,y:0},{x:20,y:0}],60),60);
});
