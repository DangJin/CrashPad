import { useEffect, useRef, useState } from 'react';

export function directorShot(config, net, snapshot, previous, now) {
  if (!snapshot?.cars.length) return previous ? {...previous,label:snapshot?.finished?'本次模拟结束':'等待车辆入场'} : {key:'entry',point:config.nodes.find(n=>n.id===config.demand[0]?.node),label:'等待车辆入场',since:now};
  const queues=new Map();
  for(const car of snapshot.cars){if(car.v>=5/3.6)continue;const path=net?.paths[car.path],id=path?.node||net?.edges[path?.edge]?.to,owner=net?.owners?.[id]||id;if(owner)queues.set(owner,(queues.get(owner)||0)+1);}
  const candidates=[...queues].filter(([,count])=>count>=3).map(([id,count])=>({key:`queue:${id}`,point:config.nodes.find(n=>n.id===id),label:`${config.nodes.find(n=>n.id===id)?.name||'路口'} · ${count} 辆车排队`,score:count})).filter(s=>s.point);
  const leader=[...snapshot.cars].sort((a,b)=>(b.routeIndex+b.s/(net?.paths[b.path]?.length||1))-(a.routeIndex+a.s/(net?.paths[a.path]?.length||1))||a.id-b.id)[0];
  const front={key:`car:${leader.id}`,point:{...leader.pose,lead:true},label:'跟随车流前进',score:0};
  if(previous&&now-previous.since<6000){
    const current=candidates.find(s=>s.key===previous.key);
    if(current)return {...current,since:previous.since};
    if(previous.key.startsWith('car:')){const car=snapshot.cars.find(c=>`car:${c.id}`===previous.key);if(car)return {...previous,point:{...car.pose,lead:true}};}
    return {...previous,label:previous.key.startsWith('queue:')?'队列正在消散':previous.label};
  }
  candidates.sort((a,b)=>b.score-a.score||a.key.localeCompare(b.key));
  const current=candidates.find(s=>s.key===previous?.key),best=candidates[0];
  const chosen=current&&best.score<current.score+3?current:best||front;
  return {...chosen,since:chosen.key===previous?.key?previous.since:now};
}

export default function useCameraDirector({config,net,snapshot,running,mode,target}) {
  const shot=useRef(null),started=useRef(null),lastTime=useRef(null),[clock,setClock]=useState(0);
  useEffect(()=>{shot.current=null;started.current=null;lastTime.current=null;setClock(c=>c+1);},[mode,config]);
  useEffect(()=>{if(mode!=='director'||!running)return;const timer=setInterval(()=>setClock(c=>c+1),250);return()=>clearInterval(timer);},[mode,running]);
  if(mode==='free')return null;
  if(mode==='vehicle'){
    const id=target==='player'?snapshot?.stats.player?.id:target;
    const car=snapshot?.cars.find(c=>c.id===id),pending=snapshot?.pendingCars?.find(c=>c.id===id),done=snapshot?.completedCars?.find(c=>c.id===id),failed=snapshot?.failedRoutes?.find(c=>c.id===id);
    if(car)return {vehicleId:car.id,point:{...car.pose,lead:true},label:`跟随车辆 ${car.id} · ${car.reason}`};
    if(done)return {point:config.nodes.find(n=>n.id===done.destination),label:`车辆 ${id} 已到达 · 总用时 ${done.duration.toFixed(1)} 秒 · 入场等待 ${done.waiting.toFixed(1)} 秒 · 变道 ${done.laneChanges} 次`};
    if(failed)return {label:`车辆 ${id} 路线未完成：${failed.reason}`};
    if(snapshot&&id!=null&&!pending&&!done&&!failed&&!car)return {label:`未找到车辆 ${id}，请选择其他车辆`};
    const entry=pending?.origin||(target==='player'?config.player?.entry:config.demand[0]?.node);
    return {point:config.nodes.find(n=>n.id===entry),label:snapshot?.finished?'本次模拟结束':`等待${target==='player'?'我的车':`车辆 ${target}`}入场`};
  }
  const now=performance.now();
  if(!snapshot){started.current=null;shot.current=null;lastTime.current=null;return {label:'导演视角 · 开始后自动引导'};}
  if(lastTime.current!=null&&snapshot.time<lastTime.current){started.current=null;shot.current=null;}
  lastTime.current=snapshot.time;
  if(started.current==null)started.current=now;
  if(now-started.current<2000)return {overview:true,label:'全景 · 了解本次路线'};
  if(running||!shot.current)shot.current=directorShot(config,net,snapshot,shot.current,now);
  return snapshot.finished?{...shot.current,label:'本次模拟结束'}:shot.current;
}
