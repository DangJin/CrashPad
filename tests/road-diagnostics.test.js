import test from 'node:test';
import assert from 'node:assert/strict';
import {corridorExample} from '../src/traffic/network/templates.js';
import {compileNetwork} from '../src/traffic/network/model.js';
import {roadIssues,alignedRoad} from '../src/traffic/network/roadDiagnostics.js';
for(const kind of ['straight','toll']) for(const fault of ['diagonal','short'])test(`${kind}: locate and repair ${fault} without mutating draft`,()=>{
  const config=corridorExample(kind),r=config.roads[0],a=config.nodes.find(n=>n.id===r.from),b=config.nodes.find(n=>n.id===r.to);
  if(fault==='diagonal')a.y+=40;else a.x=b.x-90;
  const original=JSON.stringify(config),issues=roadIssues(config);
  assert.ok(issues.some(i=>i.id===r.id));
  const next=alignedRoad(config,r.id);assert.ok(next);assert.deepEqual(roadIssues(next),[]);compileNetwork(next);
  assert.equal(JSON.stringify(config),original);
});
test('valid ramps do not produce false alignment errors',()=>assert.deepEqual(roadIssues(corridorExample('merge')),[]));
