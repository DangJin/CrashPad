import test from 'node:test';
import assert from 'node:assert/strict';
import { corridorExample } from '../src/traffic/network/templates.js';
import { normalizeRamps } from '../src/traffic/network/ramps.js';
import { compileNetwork, pointOn } from '../src/traffic/network/model.js';
import { moveConnectedNode } from '../src/traffic/network/layout.js';

test('ramps curve into the mainline with continuous endpoints and headings at all rotations', () => {
  for (const kind of ['merge', 'exit']) for (const rotation of [0, 90, 180, 270]) {
    const config = corridorExample(kind), angle = rotation*Math.PI/180;
    config.nodes.forEach(n => { const x=n.x-600,y=n.y-360;n.x=Math.round(1000+x*Math.cos(angle)-y*Math.sin(angle));n.y=Math.round(1000+x*Math.sin(angle)+y*Math.cos(angle));n.rotation=(n.rotation+rotation)%360; });
    const net=compileNetwork(config), ramp=Object.values(net.edges).find(e=>e.kind==='ramp');
    assert.equal(ramp.paths[0].points.length,41);
    for(const c of Object.values(net.connectors).filter(c=>c.incoming===ramp.id||c.outgoing===ramp.id)){
      const a=pointOn(net.paths[c.from],net.paths[c.from].length),b=pointOn(c,0),d=pointOn(c,c.length),e=pointOn(net.paths[c.to],0);
      assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-6);
      assert.ok(Math.hypot(d.x-e.x,d.y-e.y)<1e-6);
      const delta=(x,y)=>Math.abs(((x-y+540)%360)-180);
      assert.ok(delta(a.heading,b.heading)<10);
      assert.ok(delta(d.heading,e.heading)<10);
    }
  }
});
test('old perpendicular ramps convert once, preserve demand, and follow a moved junction', () => {
  const old=corridorExample('merge');old.nodes.find(n=>n.id==='branch').x=600;old.nodes.find(n=>n.id==='branch').y=760;old.nodes.find(n=>n.id==='branch').rotation=270;
  const next=normalizeRamps(old);
  assert.deepEqual(next.demand,old.demand);assert.equal(old.nodes.find(n=>n.id==='branch').x,600);
  assert.deepEqual(normalizeRamps(next),next);
  const moved=moveConnectedNode(next,'section',600,400);
  assert.equal(moved.nodes.find(n=>n.id==='branch').y-next.nodes.find(n=>n.id==='branch').y,40);
  compileNetwork(moved);
});

test('auxiliary lanes keep ramp trajectories on pavement with a parallel approach', async () => {
  const { rampAuxiliary } = await import('../src/traffic/network/ramps.js');
  const { visualRoadEdges } = await import('../src/traffic/network/roadVisualGeometry.js');
  for (const kind of ['merge','exit']) {
    const config=corridorExample(kind),net=compileNetwork(config),road=config.roads.find(r=>r.kind==='ramp');
    const shape=rampAuxiliary(config,road),edge=Object.values(net.edges).find(e=>e.kind==='ramp');
    assert.deepEqual(visualRoadEdges(config,road)[0].paths[0].points,edge.paths[0].points);
    const connectors=Object.values(net.connectors).filter(c=>c.incoming===edge.id||c.outgoing===edge.id);
    for(const c of connectors) for(let i=0;i<c.points.length;i++){
      const p=c.points[i],outer=shape.outer[i];
      const normal=q=>(q.x-shape.junction.x)*-shape.dy+(q.y-shape.junction.y)*shape.dx;
      assert.ok(normal(p)<=normal(outer)+1e-6,'trajectory stays inside auxiliary shoulder');
      if(kind==='merge'&&i<=33)assert.ok(Math.abs(normal(p)-normal(c.points[0]))<1e-6);
      if(kind==='exit'&&i>=27)assert.ok(Math.abs(normal(p)-normal(c.points.at(-1)))<1e-6);
    }
  }
});
