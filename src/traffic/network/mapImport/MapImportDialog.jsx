import { curveCenterline } from '../curveGeometry.js';
import { useEffect, useRef, useState } from 'react';
import { loadAMap, amapRequest, getLoadedAMap } from './amapClient.js';
import { coordinate, normalizeRoutes, draftRoute, buildImportedNetwork, snapRouteSignal } from './routeModel.js';
import './mapImport.css';
import {readCredentials,saveCredentials,clearCredentials} from './credentials.js';
const docs='https://developer.amap.com/api/javascript-api-v2/guide/abc/jscode';
export default function MapImportDialog({onClose,onImport}) {
  const dialog=useRef(null), host=useRef(null), sdk=useRef(null), map=useRef(null), overlays=useRef([]), alive=useRef(true), sequence=useRef(0), targetRef=useRef('start'), pointsRef=useRef(null);
  const [cached] = useState(getLoadedAMap);
  const [credentials]=useState(readCredentials);
  const [credentialNote,setCredentialNote]=useState('');
  const [key,setKey]=useState(credentials.key),[secret,setSecret]=useState(credentials.secret),[ready,setReady]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState('');
  const [target,setTarget]=useState('start'),[points,setPoints]=useState({start:null,end:null,via:[]}),[keyword,setKeyword]=useState(''),[city,setCity]=useState(''),[results,setResults]=useState([]);
  const [routes,setRoutes]=useState([]),[routeIndex,setRouteIndex]=useState(0),[first,setFirst]=useState(0),[last,setLast]=useState(0),[draft,setDraft]=useState(null),[signals,setSignals]=useState({}),[consent,setConsent]=useState(false),[count,setCount]=useState(100),[flow,setFlow]=useState(30);
  const [signalMarks,setSignalMarks]=useState([]);
  const signalContext=useRef(null);
  const route=routes[routeIndex]; targetRef.current=target;pointsRef.current=points;signalContext.current={route,first,last,signalMarks,busy};
  useEffect(()=>{alive.current=true;const previous=document.activeElement,element=dialog.current;element.showModal();return()=>{alive.current=false;sequence.current++;map.current?.destroy();element.close();previous?.focus();};},[]);
  function invalidate(){sequence.current++;setBusy('');setRoutes([]);setDraft(null);setError('');setSignals({});setSignalMarks([]);}
  function pick(location,name='地图选点') {
    const selectedTarget=targetRef.current;
    if(selectedTarget==='signal'){
      const {route,first,last,signalMarks,busy}=signalContext.current;if(!route||busy)return;
      const mark=snapRouteSignal(route,first,last,location),next=[...signalMarks,mark];
      draftRoute(route,first,last,next.map(m=>m.location));setSignalMarks(next);setDraft(null);setError('');return;
    }
    if(selectedTarget==='via'&&pointsRef.current.via.length>=3){setError('最多添加 3 个途经点，请先移除一个。');return;}
    const value={location:coordinate(location),name};invalidate();setResults([]);
    setPoints(p=>selectedTarget==='via'?{...p,via:[...p.via,value]}:{...p,[selectedTarget]:value});
    if(selectedTarget==='start'||(selectedTarget==='via'&&pointsRef.current.via.length===2))setTarget('end');
  }
  async function connect(){
    const token=++sequence.current;setBusy('连接地图');setError('');
    try{const A=cached||await loadAMap(key,secret);await new Promise(resolve=>requestAnimationFrame(resolve));if(!alive.current||token!==sequence.current)return;
      sdk.current=A;map.current=new A.Map(host.current,{zoom:12,viewMode:'2D',resizeEnable:true});
      map.current.on('click',e=>{try{pick(e.lnglat);}catch(e){setError(e.message);}});setReady(true);if(!cached&&!saveCredentials(key,secret))setCredentialNote('浏览器未允许保存凭据，本次连接仍可使用。');setKey('');setSecret('');
    }catch(e){if(alive.current&&token===sequence.current)setError(e.message);}
    finally{if(alive.current&&token===sequence.current)setBusy('');}
  }
  useEffect(()=>{
    if(!ready)return; const A=sdk.current,m=map.current;
    m.remove(overlays.current);const items=[];
    [[points.start,'起点'],...points.via.map((p,i)=>[p,`途经 ${i+1}`]),[points.end,'终点']].filter(([p])=>p).forEach(([p,label])=>items.push(new A.Marker({position:p.location,title:label,label:{direction:'top',content:label}})));
    if(route){const path=route.steps.slice(first,last+1).flatMap(s=>s.path);if(path.length)items.push(new A.Polyline({path,strokeColor:'#2563eb',strokeWeight:6}));}
    signalMarks.forEach((mark,i)=>{const marker=new A.Marker({position:mark.location,title:`红绿灯 ${i+1} · 点击删除`,label:{direction:'top',content:`红绿灯 ${i+1}`},bubble:false});marker.on('click',()=>{setSignalMarks(v=>v.filter(m=>m!==mark));setDraft(null);setError('');});items.push(marker);});
    overlays.current=items;m.add(items);if(items.length)m.setFitView(items,false,[40,40,40,40],16);
  },[ready,points,route,first,last,signalMarks]);
  async function search(){
    if(!keyword.trim())return;const token=++sequence.current;setBusy('搜索地点');setError('');setResults([]);
    try{const service=new sdk.current.PlaceSearch({city:city.trim()||'全国',pageSize:6});const value=await amapRequest(cb=>service.search(keyword.trim(),cb),'地点');if(!alive.current||token!==sequence.current)return;
      const rows=(value.poiList?.pois||[]).filter(p=>p.location).slice(0,6).map(p=>({name:String(p.name),location:coordinate(p.location),address:typeof p.address==='string'?p.address:''}));setResults(rows);if(!rows.length)setError('没有找到地点，请补充城市或更换关键词。');
    }catch(e){if(alive.current&&token===sequence.current)setError(e.message);}finally{if(alive.current&&token===sequence.current)setBusy('');}
  }
  async function plan(){
    const token=++sequence.current;setBusy('规划路线');setError('');setRoutes([]);setDraft(null);setSignalMarks([]);
    try{const A=sdk.current,service=new A.Driving({extensions:'all',showTraffic:false});const value=await amapRequest(cb=>service.search(new A.LngLat(...points.start.location),new A.LngLat(...points.end.location),{waypoints:points.via.map(p=>new A.LngLat(...p.location))},cb),'驾车路线');if(!alive.current||token!==sequence.current)return;
      const list=normalizeRoutes(value);setRoutes(list);setRouteIndex(0);setFirst(0);setLast(list[0].steps.length-1);setSignals({});
    }catch(e){if(alive.current&&token===sequence.current)setError(e.message);}finally{if(alive.current&&token===sequence.current)setBusy('');}
  }
  function generate(){try{const next=draftRoute(route,first,last,signalMarks.map(m=>m.location));buildImportedNetwork(next);setDraft(next);setSignals(Object.fromEntries(next.segments.map((s,i)=>[i,!!s.signalAtEnd])));setError('');}catch(e){setDraft(null);setError(e.message);}}
  function updateSegment(i,field,value){setDraft(d=>({...d,segments:d.segments.map((s,j)=>i===j?{...s,[field]:value}:s)}));setError('');}
  let preview=null,validation='';if(draft){try{preview=buildImportedNetwork(draft,{signals,count,flow});}catch(e){validation=e.message;}}
  const previewPoints=preview?preview.roads.flatMap(r=>r.geometry?curveCenterline(preview,r,false):[]):[];
  const previewBounds=previewPoints.length?previewPoints:preview?.nodes||[];
  return <dialog ref={dialog} className="map-import" aria-labelledby="map-import-title" onCancel={e=>{e.preventDefault();onClose();}}>
    <header><div><h2 id="map-import-title">从地图创建路网</h2><p>选择真实路线，生成可编辑的模拟草稿</p></div><button aria-label="关闭地图导入" onClick={onClose}>×</button></header>
    <div className="map-import-body">
      <div className="map-import-credentials"><button disabled={!!busy} onClick={()=>{if(clearCredentials()){setKey('');setSecret('');setCredentialNote('已清除本地凭据。当前已加载的地图仍可使用，刷新后需重新填写。');}else setCredentialNote('浏览器未允许清除凭据，请在浏览器站点设置中清除数据。');}}>清除本地凭据</button>{credentialNote&&<small role="status">{credentialNote}</small>}</div>
      {!ready&&<section className="map-import-connect"><h3>连接高德地图</h3><p>{cached?'本页已连接地图，可继续使用。更换凭据请刷新页面。':'连接成功后保存在当前浏览器，下次自动填入；不写入路网草稿或导出文件。凭据对本机浏览器可见。'}</p>{!cached&&<><label>JS API Key<input autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} /></label><label>安全密钥 securityJsCode<input type="password" autoComplete="off" value={secret} onChange={e=>setSecret(e.target.value)}/></label></>}<div><button className="primary" disabled={!!busy||(!cached&&(!key.trim()||!secret.trim()))} onClick={connect}>{cached?'继续使用已连接地图':'连接地图'}</button> <a href={docs} target="_blank" rel="noreferrer">获取凭据与配置域名</a></div></section>}
      <div ref={host} className="map-import-map" hidden={!!draft||(!ready&&busy!=='连接地图')} aria-label="高德地图选点区域"/>
      {ready&&<section className="map-import-settings">
        {!draft&&<><div className="map-import-targets" aria-label="地图点击用途">{[['start','起点'],['end','终点'],['via','途经点']].map(([id,label])=><button key={id} aria-pressed={target===id} disabled={id==='via'&&points.via.length>=3} onClick={()=>setTarget(id)}>{label}</button>)}<button aria-pressed={target==='signal'} disabled={!route||!!busy} onClick={()=>setTarget('signal')}>红绿灯</button><small>{target==='signal'?'点击路线添加红绿灯，点击标记删除':'点击地图或搜索地点 · 最多 3 个途经点'}</small></div>
        <form className="map-import-search" onSubmit={e=>{e.preventDefault();search();}}><input aria-label="搜索城市" placeholder="城市（可选）" value={city} onChange={e=>setCity(e.target.value)}/><input aria-label="地点关键词" placeholder="搜索道路、地点" value={keyword} onChange={e=>setKeyword(e.target.value)}/><button disabled={!!busy||!keyword.trim()}>搜索地点</button></form>
        {!!results.length&&<ul className="map-import-results">{results.map((p,i)=><li key={i}><button onClick={()=>{try{pick(p.location,p.name);}catch(e){setError(e.message);}}}>{p.name}<small>{p.address}</small></button></li>)}</ul>}
        <div className="map-import-points">{[['start','起点',points.start],...points.via.map((p,i)=>[`via-${i}`,`途经 ${i+1}`,p]),['end','终点',points.end]].map(([id,label,p])=><div key={id}><b>{label}</b><span>{p?`${p.name} · ${p.location.map(n=>n.toFixed(4)).join(', ')}`:'尚未选择'}</span>{p&&<button aria-label={`移除${label}`} onClick={()=>{invalidate();setPoints(v=>id.startsWith('via-')?{...v,via:v.via.filter((_,i)=>i!==Number(id.slice(4)))}:{...v,[id]:null});}}>×</button>}</div>)}</div>
        <button className="primary" disabled={!points.start||!points.end||!!busy} onClick={plan}>规划驾车路线</button>
        {route&&<div className="map-import-range"><h3>选取导入范围</h3><p>支持 120 米～5 公里；保留道路弧度，自动合并短导航段。支路、立交和车道细节不会自动还原。</p>
          {routes.length>1&&<label>路线<select value={routeIndex} onChange={e=>{const i=Number(e.target.value);setRouteIndex(i);setSignalMarks([]);setFirst(0);setLast(routes[i].steps.length-1);setDraft(null);setError('');}}>{routes.map((r,i)=><option key={i} value={i}>{r.name} · {Math.round(r.distance)} m</option>)}</select></label>}
          <div className="map-import-fields">{[['从路段',first,v=>{setFirst(v);setLast(n=>Math.max(n,v));}],['至路段',last,v=>setLast(v)]].map(([label,value,change])=><label key={label}>{label}<select value={value} onChange={e=>{change(Number(e.target.value));setSignalMarks([]);setDraft(null);setError('');}}>{route.steps.map((s,i)=><option key={i} value={i} disabled={label==='至路段'&&i<first}>{i+1}. {s.name} · {Math.round(s.distance)} m</option>)}</select></label>)}</div>
          <div className="map-import-signal-marks"><div><strong>红绿灯位置</strong><small>{route.trafficLights===null?'接口未提供红绿灯数量':`整条规划路线 ${route.trafficLights} 个（不代表当前选取范围）`} · 已标记 {signalMarks.length} 个</small></div><button aria-pressed={target==='signal'} onClick={()=>setTarget('signal')}>在地图上标记</button><p>手动标记位置，配时为模拟值。距范围两端及相邻信号至少 120 米；切换路线或范围会清除标记。</p>{signalMarks.map((m,i)=><button key={i} aria-label={`删除红绿灯 ${i+1}`} onClick={()=>{setSignalMarks(v=>v.filter((_,j)=>i!==j));setError('');}}>红绿灯 {i+1} · {Math.round(m.distance)} m ×</button>)}</div>
          <label className="map-import-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>我已确认有权将所选路线转换并保存为模拟草稿（<a href="https://developer.amap.com/pages/terms/" target="_blank" rel="noreferrer">高德使用条款</a>）。</span></label>
          <button disabled={!consent} onClick={generate}>生成路网草稿</button>
        </div>}
        </>}
        {draft&&<section className="map-import-draft"><div className="map-import-step-heading"><h3>确认模拟参数</h3><button onClick={()=>{setDraft(null);setError('');}}>返回选取路线</button></div><p>以下为实验初始值，不代表真实车道、限速或信号配时。导航距离 {draft.distance} m；模拟长度按道路曲线计算，可能与导航距离略有差异。</p>
          {preview&&<svg className="map-import-preview" aria-label="曲线路网预览" viewBox={`${Math.min(...previewBounds.map(n=>n.x))-80} ${Math.min(...previewBounds.map(n=>n.y))-80} ${Math.max(...previewBounds.map(n=>n.x))-Math.min(...previewBounds.map(n=>n.x))+160} ${Math.max(...previewBounds.map(n=>n.y))-Math.min(...previewBounds.map(n=>n.y))+160}`}><polyline points={(previewPoints.length?previewPoints:preview.nodes).map(n=>`${n.x},${n.y}`).join(' ')} fill="none" stroke="#475569" strokeWidth="14"/>{preview.nodes.map((n,i)=><g key={n.id}><circle cx={n.x} cy={n.y} r="18" fill={n.signal?'#d97706':'#2563eb'}/><text x={n.x} y={n.y+6} textAnchor="middle" fontSize="18" fill="white">{i+1}</text></g>)}</svg>}
          {!!draft.cleaned&&<p role="status">已自动合并 {draft.cleaned} 个短导航段或重复坐标段。</p>}<div className="map-import-segments">{draft.segments.map((s,i)=><div className="map-import-segment" key={i}><strong>{i+1}. {s.name}<small>{s.length} m · {['向东','向南','向西','向北'][s.dir]}</small></strong><label>车道<input type="number" min="1" max="6" value={s.lanes} onChange={e=>updateSegment(i,'lanes',e.target.value)}/></label><label>限速 km/h<input type="number" min="20" max="120" value={s.speed} onChange={e=>updateSegment(i,'speed',e.target.value)}/></label>{i<draft.segments.length-1&&<label className="map-import-signal"><input type="checkbox" checked={!!signals[i]} onChange={e=>setSignals(v=>({...v,[i]:e.target.checked}))}/>末端设信号灯（模拟配时：红/绿各 30 秒，导入后可修改）</label>}</div>)}</div>
          <div className="map-import-fields"><label>车辆数量<input type="number" min="1" max="300" value={count} onChange={e=>setCount(e.target.value)}/></label><label>入口流量（辆/分钟）<input type="number" min="1" max="240" value={flow} onChange={e=>setFlow(e.target.value)}/></label></div>
        </section>}
      </section>}
      {busy&&<p role="status">正在{busy}…</p>}{(error||validation)&&<p role="alert" className="map-import-error">{error||validation}</p>}
    </div>
    <footer><span>载入将替换当前画布，可撤销恢复。</span><button onClick={onClose}>取消</button><button className="primary" disabled={!preview||!consent||!!busy} onClick={()=>{try{onImport(buildImportedNetwork(draft,{signals,count,flow}));}catch(e){setError(e.message);}}}>载入实验室</button></footer>
  </dialog>;
}
