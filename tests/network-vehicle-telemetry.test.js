import test from 'node:test';
import assert from 'node:assert/strict';
import {vehicleTelemetry} from '../src/traffic/network/vehicleTelemetry.js';
const net={nodes:{a:{name:'入口'},b:{name:'出口'}},edges:{r:{from:'a',to:'b'}},paths:{p:{type:'road',edge:'r',lane:1,length:100,speed:60}}};
const car={id:1,origin:'a',destination:'b',route:['r'],routeIndex:0,path:'p',s:40,v:10,acc:-.5,entered:5,scheduled:2,laneChanges:3,voluntaryChanges:1,reason:'跟车'};
test('telemetry uses simulation seconds and actual path units without estimating arrival',()=>{
 const data=vehicleTelemetry({time:15,cars:[car]},net,1);
 assert.equal(data.speed,36);assert.equal(data.acceleration,-.5);assert.equal(data.progress,40);assert.equal(data.remaining,60);assert.equal(data.limit,60);assert.equal(data.lane,'车道 2');
 assert.equal(data.total,13);assert.equal(data.waiting,3);assert.equal(data.driving,10);assert.equal(data.segment,'入口 → 出口');assert.equal(data.changes,3);assert.equal(data.route[0].current,true);
});
test('arrival retains completed times while reset and pending never invent zero metrics',()=>{
 const done=vehicleTelemetry({time:60,cars:[],completedCars:[{id:1,duration:30,waiting:4,laneChanges:2,origin:'a',destination:'b'}]},net,1);
 assert.equal(done.status,'已到达');assert.equal(done.total,30);assert.equal(done.driving,26);assert.equal(done.progress,null);
 const reset=vehicleTelemetry(null,net,1);assert.equal(reset.total,null);assert.equal(reset.speed,null);assert.equal(reset.status,'等待开始模拟');
 const waiting=vehicleTelemetry({cars:[],pendingCars:[{id:1,origin:'a'}]},net,1);assert.equal(waiting.status,'等待入场');assert.equal(waiting.total,null);
});
