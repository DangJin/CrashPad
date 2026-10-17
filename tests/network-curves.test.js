import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRoutes,draftRoute,buildImportedNetwork} from '../src/traffic/network/mapImport/routeModel.js';
import {curveCenterline,curveLane,polylineLength,synchronizeCurves,validateCurve} from '../src/traffic/network/curveGeometry.js';
import {compileNetwork,pointOn} from '../src/traffic/network/model.js';
import {visualRoadEdges} from '../src/traffic/network/roadVisualGeometry.js';
import {roadIssues} from '../src/traffic/network/roadDiagnostics.js';
import {resizeRoadLength} from '../src/traffic/network/resizeRoad.js';
import {moveConnectedNode} from '../src/traffic/network/layout.js';
import {createNetworkSimulation,stepNetwork,vehiclePose} from '../src/traffic/network/engine.js';
export function curvedFixture(){
 const path=Array.from({length:61},(_,i)=>[116+i*.0002,40+.0018*Math.sin(i/60*Math.PI)]);
 return normalizeRoutes({routes:[{steps:[{road:'短指令',distance:1,path:[path[0],path[0]]},{road:'弧线高速',distance:550,path:path.slice(0,31)},{road:'弧线高速',distance:550,path:path.slice(30)}]}]})[0];
}
test('short, duplicate and single-point instructions merge without flattening real curvature',()=>{
 const empty=curvedFixture();empty.steps[0].path=[];assert.equal(draftRoute(empty).cleaned,1);
 const raw=curvedFixture();raw.steps[0].path=[raw.steps[0].path[0]];
 const draft=draftRoute(raw),config=buildImportedNetwork(draft);
 assert.equal(draft.cleaned,1);assert.equal(config.mapImport.mode,'curved');assert.equal(config.roads.length,2);
 assert.ok(config.roads.every(r=>r.geometry.points.length>4));assert.deepEqual(roadIssues(config),[]);
 const road=config.roads[0],net=compileNetwork(config),path=net.edges[`${road.id}:${road.from}`].paths[0];
 const start=pointOn(path,0),end=pointOn(path,path.length);assert.ok(Math.abs(start.heading-end.heading)>15);
 assert.ok(polylineLength(curveCenterline(config,road))>Math.hypot(end.x-start.x,end.y-start.y));
 assert.deepEqual(visualRoadEdges(config,road)[0].paths[0].points,path.points);
 const broken=curvedFixture();broken.steps[0].distance=80;assert.throws(()=>draftRoute(broken),/第 1 段.*缺少有效路径/);
});
test('curved lane transitions, reverse lanes and signals complete without discontinuities',()=>{
 for(const lanes of [[2,2],[3,1],[1,3]]){
  const draft=draftRoute(curvedFixture());draft.segments.forEach((s,i)=>s.lanes=lanes[i]);
  const config=buildImportedNetwork(draft,{signals:{0:true},count:24,flow:60}),net=compileNetwork(config);
  for(const c of Object.values(net.connectors)){
   const from=pointOn(net.paths[c.from],net.paths[c.from].length),to=pointOn(net.paths[c.to],0);
   assert.ok(Math.hypot(c.points[0].x-from.x,c.points[0].y-from.y)<1e-6);
   assert.ok(Math.hypot(c.points.at(-1).x-to.x,c.points.at(-1).y-to.y)<1e-6);
  }
  const sim=createNetworkSimulation(config);let waiting=0;
  while(!sim.finished){stepNetwork(sim);for(const car of sim.cars){const pose=vehiclePose(sim,car);assert.ok(Number.isFinite(pose.x)&&Number.isFinite(pose.heading));if(car.reason==='等待绿灯')waiting++;}}
  assert.equal(sim.failed.length,0);assert.equal(sim.completed.length,24);assert.equal(sim.timedOut,false);assert.ok(waiting>0);
  config.roads.forEach(r=>r.oneWay=false);assert.equal(Object.keys(compileNetwork(config).edges).length,4);
  const road=config.roads[0],reverse=visualRoadEdges(config,road)[1].paths[0].points;
  assert.deepEqual(reverse,curveLane(config,road,0,true));
 }
});
test('moving and resizing curve endpoints preserves attached paths and updates physical length',()=>{
 const config=buildImportedNetwork(draftRoute(curvedFixture())),before=JSON.stringify(config),r=config.roads[0];
 const moved=moveConnectedNode(config,'map-start',config.nodes[0].x+30,config.nodes[0].y+40);
 assert.notEqual(moved.roads[0].length,r.length);compileNetwork(moved);assert.deepEqual(roadIssues(moved),[]);
 const resized=resizeRoadLength(config,{type:'road',id:r.id},r.length+100);assert.ok(!resized.error,resized.error);compileNetwork(resized.config);
 assert.ok(Math.abs(polylineLength(curveCenterline(resized.config,resized.config.roads[0]))-(r.length+100))<2);
 assert.equal(JSON.stringify(config),before);
});
test('curve crossing and invalid points are rejected explicitly',()=>{
 assert.throws(()=>validateCurve([{x:0,y:0},{x:100,y:100},{x:0,y:100},{x:100,y:0}]),/自交/);
 const config=buildImportedNetwork(draftRoute(curvedFixture()));config.roads[0].geometry.points[2].x=NaN;
 assert.throws(()=>compileNetwork(config),/有效控制点/);
});
test('hand drawn curves retain facility tangents and safe point insertion',async()=>{
 const {corridorExample}=await import('../src/traffic/network/templates.js'),{addCurveControl}=await import('../src/traffic/network/curveEditing.js');
 const base=corridorExample('straight'),result=addCurveControl(base,'in');assert.ok(!result.error,result.error);
 const next=result.config,road=next.roads.find(r=>r.id==='in');road.geometry.points[1].y+=70;road.length=polylineLength(curveCenterline(next,road));
 const net=compileNetwork(next),edge=net.edges['in:start'];assert.ok(Math.abs(edge.endHeading)<.01);
 assert.ok(Math.abs(pointOn(edge.paths[0],edge.length/2).heading)>1);
 const second=addCurveControl(next,'in');assert.ok(!second.error,second.error);assert.equal(second.config.roads[0].geometry.points.length,4);
});

test('curve lane templates retain geometry and fixed-axis facilities reject without mutating',async()=>{
 const {insertTemplate}=await import('../src/traffic/network/templates.js');
 const base=buildImportedNetwork(draftRoute(curvedFixture())),before=JSON.stringify(base);
 for(const kind of ['straight','add','drop']){const result=insertTemplate(base,{type:'road',id:'map-road-0'},kind);assert.ok(!result.error,result.error);compileNetwork(result.config);assert.equal(result.config.roads.length,3);assert.ok(result.config.roads.every(r=>r.geometry));}
 const result=insertTemplate(base,{type:'road',id:'map-road-0'},'toll');assert.match(result.error,/收费站/);assert.equal(JSON.stringify(base),before);
});
