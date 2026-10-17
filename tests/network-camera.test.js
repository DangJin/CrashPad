import test from 'node:test';import assert from 'node:assert/strict';
import {directorShot} from '../src/traffic/network/useCameraDirector.js';
const config={nodes:[{id:'a',name:'汇入口',x:0,y:0},{id:'b',name:'收费站',x:200,y:0}],demand:[{node:'a'}]};
const net={paths:{a:{node:'a',length:100},b:{node:'b',length:100}}};
const car=(id,path,v=0)=>({id,path,v,s:id,routeIndex:0,pose:{x:id,y:0,heading:0}});
test('director holds its shot for real-time minimum and ignores small queue fluctuations',()=>{
 const first=directorShot(config,net,{cars:[car(1,'a'),car(2,'a'),car(3,'a')]},null,0);assert.equal(first.key,'queue:a');
 const cars=[...Array.from({length:3},(_,i)=>car(i,'a')),...Array.from({length:9},(_,i)=>car(i+10,'b'))];
 assert.equal(directorShot(config,net,{cars},first,5000).key,'queue:a');
 const next=directorShot(config,net,{cars},first,6000);assert.equal(next.key,'queue:b');
 assert.equal(directorShot(config,net,{cars:[]},next,7000).point.x,200);
});
test('director follows traffic without queues and freezes at completion',()=>{
 const shot=directorShot(config,net,{cars:[car(1,'a',10),car(2,'a',10)]},null,0);assert.equal(shot.key,'car:2');
 const done=directorShot(config,net,{cars:[],finished:true},shot,7000);assert.equal(done.label,'本次模拟结束');assert.deepEqual(done.point,shot.point);
});
