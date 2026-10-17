import test from 'node:test';
import assert from 'node:assert/strict';
import { coordinate, normalizeRoutes, draftRoute, buildImportedNetwork, snapRouteSignal } from '../src/traffic/network/mapImport/routeModel.js';
import { createNetworkSimulation, stepNetwork } from '../src/traffic/network/engine.js';
const step=(a,b,distance=500,road='测试道路')=>({path:[a,b],distance,road});
const straight=()=>normalizeRoutes({routes:[{steps:[step([116,39],[116.006,39])]}]})[0];
const corner=()=>normalizeRoutes({routes:[{steps:[step([116,39],[116.006,39]),step([116.006,39],[116.006,39.005])]}]})[0];
test('normalize SDK coordinates, select range and preserve approximate source distance',()=>{
 assert.deepEqual(coordinate({getLng:()=>116,getLat:()=>39}),[116,39]);
 assert.throws(()=>coordinate([NaN,39]));assert.throws(()=>coordinate([null,39]));assert.throws(()=>coordinate(['',39]));assert.throws(()=>normalizeRoutes({routes:[]}));
 const route=corner(), before=JSON.stringify(route), draft=draftRoute(route);
 assert.deepEqual(draft.segments.map(s=>s.dir),[0,3]);assert.equal(draft.distance,1000);assert.ok(draft.segments.every(s=>s.points.length>=2));
 assert.equal(draftRoute(route,1,1).distance,500);assert.equal(JSON.stringify(route),before);
 assert.throws(()=>draftRoute(route,1,0));
});
test('long straight routes split into legal model lengths; reject oversized and malformed routes',()=>{
 const route=straight();route.steps[0].distance=4500;route.steps[0].path[1]=[116.052,39];
 assert.equal(draftRoute(route).segments.length,4);assert.ok(draftRoute(route).segments.every(s=>s.length<=1500));
 route.steps[0].distance=5001;assert.throws(()=>draftRoute(route),/5 公里/);
 assert.throws(()=>normalizeRoutes({routes:[{steps:[{path:[],distance:100}]}]}),/坐标/);
 const disconnected=corner();disconnected.steps[1].path[0]=[117,40];assert.throws(()=>draftRoute(disconnected),/不连续/);
 const u=straight();u.steps[0].action='掉头';assert.throws(()=>draftRoute(u),/掉头/);
});
test('conversion validates editable parameters, avoids input mutation and stores no geographic data',()=>{
 const draft=draftRoute(corner()),before=JSON.stringify(draft),config=buildImportedNetwork(draft,{signals:{0:true},count:12,flow:20});
 assert.equal(config.nodes[1].type,'anchor');assert.equal(config.nodes[1].signal.enabled,true);assert.equal(JSON.stringify(draft),before);
 assert.equal(config.demand[0].count,12);assert.equal(config.mapImport.mode,'curved');
 assert.ok(!JSON.stringify(config).includes('116.006'));assert.throws(()=>buildImportedNetwork(draft,{count:''}),/车辆数/);
 draft.segments[0].lanes=0;assert.throws(()=>buildImportedNetwork(draft),/车道数/);
});
for(const dir of [0,1,2,3])for(const turn of [-1,0,1])test(`imported ${dir} heading / ${turn} turn completes trips with and without signals`,()=>{
 for(const signal of [false,true]){
  const draft={name:'合成测试路线',distance:800,segments:[{dir,length:400,lanes:2,speed:50,name:'第一段'},{dir:(dir+turn+4)%4,length:400,lanes:2,speed:50,name:'第二段'}]};
  const sim=createNetworkSimulation(buildImportedNetwork(draft,{signals:{0:signal},count:10,flow:30}));
  let waiting=0;while(!sim.finished){stepNetwork(sim);waiting+=sim.cars.filter(c=>c.reason==='等待绿灯').length;}
  if(signal)assert.ok(waiting>0,'configured signal must actually stop cars');
  assert.equal(sim.timedOut,false);assert.equal(sim.failed.length,0);assert.equal(sim.completed.length,10);
 }
});
test('reject geometrically overlapping routes instead of inventing intersection topology',()=>{
 const segments=[0,1,2,3,0].map(dir=>({dir,length:500,lanes:2,speed:50,name:'环线'}));
 assert.throws(()=>buildImportedNetwork({name:'环线',distance:2500,segments}),/无法安全简化/);
});

test('manual map signals snap to the road and retain exact position in imported geometry',()=>{
 const route=corner(),mark=snapRouteSignal(route,0,1,[116.003,39.0001]);
 assert.ok(Math.abs(mark.location[1]-39)<1e-8);
 const draft=draftRoute(route,0,1,[mark.location]),network=buildImportedNetwork(draft);
 const signal=network.nodes.find(n=>n.signal?.enabled);
 assert.ok(signal);assert.ok(Math.abs(signal.x-network.nodes[0].x-mark.distance)<.01);
 assert.equal(signal.signal.green,30);assert.equal(signal.signal.red,30);
 assert.equal(network.nodes.filter(n=>n.signal?.enabled).length,1);
 assert.equal(buildImportedNetwork(draft,{signals:{0:false}}).nodes.filter(n=>n.signal?.enabled).length,0);
 assert.throws(()=>snapRouteSignal(route,0,1,[116,39]),/120/);
 assert.throws(()=>snapRouteSignal(route,0,1,[116.003,39.003]),/35/);
 assert.throws(()=>draftRoute(route,0,1,[mark.location,[116.0031,39]]),/间距/);
 assert.equal(route.trafficLights,null);
 for(const [raw,expected] of [[0,0],['2',2],[null,null],['',null],[-1,null]]){
  assert.equal(normalizeRoutes({routes:[{traffic_lights:raw,steps:[step([116,39],[116.006,39])]}]})[0].trafficLights,expected);
 }
});
