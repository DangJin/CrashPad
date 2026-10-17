import {useEffect,useState} from 'react';
import {DRIVING_STYLES} from '../drivingStyles.js';
import {vehicleTelemetry} from './vehicleTelemetry.js';
import './VehiclePanel.css';
const clock=value=>value==null?'—':`${Math.floor(value/60)}:${(value%60).toFixed(1).padStart(4,'0')}`;
const decimal=(value,digits=1)=>value==null?'—':value.toFixed(digits);
export default function VehiclePanel({snapshot,net,id,running,overlay=false,compact=false,onFollow,onExit}){
 const data=vehicleTelemetry(snapshot,net,id),[expanded,setExpanded]=useState(!compact),[samples,setSamples]=useState([]),[profile,setProfile]=useState(null);
 const time=snapshot?.time,speed=data.speed;
 useEffect(()=>{if(!snapshot)setProfile(null);else if(data.car)setProfile({id,drivingStyle:data.car.drivingStyle,hasEtc:data.car.hasEtc});},[id,!!snapshot,!!data.car]);
 const vehicle=data.car||(profile?.id===id?profile:null);
 useEffect(()=>{setSamples([]);},[id]);
 useEffect(()=>{setSamples(previous=>{
   if(time==null||previous.length&&time<previous.at(-1).t)return [];
   if(speed==null||!data.car)return previous;
   if(previous.length&&time-previous.at(-1).t<1)return previous;
   return [...previous.filter(p=>p.t>=time-60),{t:time,v:speed}];
 });},[id,time,speed,!!data.car]);
 const maximum=Math.max(60,...samples.map(p=>p.v)),start=samples[0]?.t||0,end=samples.at(-1)?.t||start;
 const chart=samples.map(p=>`${(p.t-start)/Math.max(1,end-start)*264},${48-p.v/maximum*44}`).join(' ');
 const metric=(label,value,unit='')=><div key={label}><dt>{label}</dt><dd>{value}{unit&&<small> {unit}</small>}</dd></div>;
 return <section className={`vehicle-panel${overlay?' vehicle-panel-overlay':''}`} aria-label="车辆实时数据" data-vehicle-panel={id??'pending'}>
  <header><strong>车辆 {id??'—'} <span>{data.done?'行程结束':!snapshot?'尚未开始':running?'实时遥测':'已暂停'}</span></strong><div>{overlay?<><button aria-label={expanded?'收起车辆数据':'展开车辆数据'} aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'收起':'展开'}</button><button aria-label="退出车辆跟随" onClick={onExit}>退出跟随</button></>:<button onClick={onFollow}>跟随这辆车</button>}</div></header>
  <div className="vehicle-speed"><strong>{decimal(data.speed)}</strong><span>km/h</span><p>{data.status}</p></div>
  {(!overlay||expanded)&&<div className="vehicle-panel-body">
   <dl className="vehicle-metrics">{metric('加速度',decimal(data.acceleration,2),'m/s²')}{metric('当前路径限速',decimal(data.limit,0),'km/h')}{metric('当前车道',data.lane)}{metric('累计变道',data.changes??'—','次')}</dl>
   {data.path&&<div className="vehicle-progress"><div><span>{data.path.type==='road'?'当前道路':'当前连接段'}</span><span>剩余 {decimal(data.remaining,0)} m</span></div><progress aria-label="当前路段进度" max="100" value={data.progress}/><p>{data.segment}</p></div>}
   <dl className="vehicle-times">{metric('总用时',clock(data.total))}{metric('入口等待',clock(data.waiting))}{metric('路上用时',clock(data.driving))}</dl>
   <div className="vehicle-trend"><div><span>本次观察速度 · 最近 60 秒</span><span>0–{Math.ceil(maximum)} km/h</span></div>{samples.length>1?<svg role="img" aria-label="车辆速度变化曲线" viewBox="0 0 264 52"><path d="M0 4H264M0 26H264M0 48H264" stroke="var(--line)" fill="none"/><polyline points={chart} fill="none" stroke="var(--blue,#245bdb)" strokeWidth="2"/></svg>:<p>等待速度采样…</p>}</div>
   <details className="vehicle-details"><summary>车辆与路线明细</summary><dl>{metric('起点',data.origin)}{metric('终点',data.destination)}{metric('驾驶风格',DRIVING_STYLES[vehicle?.drivingStyle]?.label||'—')}{metric('通行资格',vehicle?(vehicle.hasEtc?'ETC / 人工窗口':'仅人工窗口'):'—')}{metric('主动变道',data.voluntary??'—','次')}</dl><p>总用时包含入口等待；路上用时包含行驶与停车等待。</p>{!!data.route.length&&<ol>{data.route.map((step,i)=><li key={`${step.id}-${i}`} aria-current={step.current?'step':undefined}>{step.label}</li>)}</ol>}</details>
  </div>}
 </section>;
}
