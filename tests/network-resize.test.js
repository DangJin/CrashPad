import test from 'node:test';import assert from 'node:assert/strict';
import {corridorExample} from '../src/traffic/network/templates.js';
import {resizeRoadLength} from '../src/traffic/network/resizeRoad.js';
import {compileNetwork,junctionRadius} from '../src/traffic/network/model.js';
import {roadMouths} from '../src/traffic/network/layout.js';
for(const type of ['straight','transition','toll'])test(`${type} grows and shrinks with connected mouths intact`,()=>{
  const source=corridorExample(type),original=JSON.stringify(source),node=source.nodes.find(n=>n.id==='section');
  for(const length of [type==='toll'?260:60,1200]){
    const result=resizeRoadLength(source,{type:'node',id:node.id},length);assert.ok(!result.error,result.error);
    const changed=result.config,n=changed.nodes.find(n=>n.id===node.id);
    assert.equal(n.length,length);assert.notEqual(junctionRadius(n,changed.roads),junctionRadius(node,source.roads));
    for(const r of changed.roads){assert.ok(roadMouths(changed,r).valid);const before=roadMouths(source,source.roads.find(x=>x.id===r.id)),after=roadMouths(changed,r);assert.ok(Math.abs(Math.hypot(before.end.x-before.start.x,before.end.y-before.start.y)-Math.hypot(after.end.x-after.start.x,after.end.y-after.start.y))<=1);}
    compileNetwork(changed);
  }
  assert.equal(JSON.stringify(source),original);
});
test('road resizing moves the complete downstream subgraph without deforming its neighbours',()=>{
 const source=corridorExample('merge'),result=resizeRoadLength(source,{type:'road',id:'in'},600);assert.ok(!result.error,result.error);
 const a=roadMouths(source,source.roads[0]),b=roadMouths(result.config,result.config.roads[0]);assert.equal(b.end.x-b.start.x,2*(a.end.x-a.start.x));compileNetwork(result.config);
});
test('cyclic connection rejects a partial stretch without modifying the draft',()=>{
 const c=corridorExample('straight');c.roads.push({id:'loop',from:'start',to:'end',lanes:1,length:400,speed:60,oneWay:true});const before=JSON.stringify(c);
 assert.match(resizeRoadLength(c,{type:'road',id:'in'},600).error,/闭环/);assert.equal(JSON.stringify(c),before);
});
