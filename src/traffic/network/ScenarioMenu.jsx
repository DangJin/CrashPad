import { useEffect, useRef, useState } from 'react';
import { TRAFFIC_SCENARIOS } from './scenarios.js';
import RoadIcon from './RoadIcon.jsx';
const templates = [['straight','3 车道直路'],['transition','3 → 1 车道收窄'],['merge','主路与匝道汇入'],['exit','主路与匝道汇出'],['toll','4 → 8 个窗口 → 4 车道'],['cross','四向十字路口'],['tee','丁字路口']];
export default function ScenarioMenu({onScenario,onTemplate}) {
  const root=useRef(null), [tab,setTab]=useState('scenes');
  useEffect(()=>{
    const close=e=>{if(!root.current?.contains(e.target)) root.current.open=false;};
    document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);
  },[]);
  function choose(action,id){action(id);root.current.open=false;root.current.querySelector('summary').focus();}
  return <details ref={root} className="network-scenarios" onKeyDown={e=>{if(e.key==='Escape'){root.current.open=false;root.current.querySelector('summary').focus();}}}>
    <summary className="network-toolbar-action">场景预设</summary>
    <div className="network-scenario-menu">
      <div className="scenario-tabs" role="group" aria-label="预设分类">
        <button aria-pressed={tab==='scenes'} onClick={()=>setTab('scenes')}>体验场景</button>
        <button aria-pressed={tab==='templates'} onClick={()=>setTab('templates')}>基础路型</button>
      </div>
      <div className="scenario-list" hidden={tab!=='scenes'}>{TRAFFIC_SCENARIOS.map(p=><button className="scenario-item" key={p.id} onClick={()=>choose(onScenario,p.id)}><RoadIcon type={p.icon}/><span><strong>{p.title}</strong><span>{p.description}</span></span></button>)}</div>
      <div className="scenario-list" hidden={tab!=='templates'}>{templates.map(([kind,label])=><button className="scenario-item" key={kind} onClick={()=>choose(onTemplate,kind)}><RoadIcon type={kind==='transition'?'drop':kind}/><span><strong>{label}</strong></span></button>)}</div>
      <small>载入替换当前画布 · 可撤销</small>
    </div>
  </details>;
}
