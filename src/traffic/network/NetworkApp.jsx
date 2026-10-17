import { curveCenterline, polylineLength, curveSide, validateCurve } from './curveGeometry.js';
import MapImportDialog from './mapImport/MapImportDialog.jsx';
import ScenarioMenu from './ScenarioMenu.jsx';
import PlayerPanel from './panels/PlayerPanel.jsx';
import FlowPanel from './panels/FlowPanel.jsx';
import PropertiesPanel from './panels/PropertiesPanel.jsx';
import NetworkDashboard from './NetworkDashboard.jsx';
import VehiclePanel from './VehiclePanel.jsx';
import { restoreNetworkDraft, saveNetworkDraft } from './storage.js';
import { WorkbenchHeader, HistoryControls, PlaybackFrame, SegmentedControl } from '../../components/workbench/index.jsx';
import useNetworkEditor from './useNetworkEditor.js';
import { experimentIdentity } from './editHistory.js';
import { TRAFFIC_SCENARIOS, createTrafficScenario } from './scenarios.js';
import useCameraDirector from './useCameraDirector.js';
import { resizeRoadLength } from './resizeRoad.js';
import { roadIssues, alignedRoad } from './roadDiagnostics.js';
import RoadIcon from './RoadIcon.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { makeExample, compileNetwork, clone, ports, sideOf, TURNS, turnFor } from './model.js';
import { duration } from '../PlayerPanel.jsx';
import { moveConnectedNode, minimumNodeGap } from './layout.js';
import InsertRoadMenu from './InsertRoadMenu.jsx';
import NetworkCanvas from './NetworkCanvas.jsx';
import useSimulation from './useSimulation.js';
import { corridorExample, insertTemplate } from './templates.js';
import '../traffic.css';
import './network.css';
const names = { anchor:'路线连接', cross: '十字路口', tee: '丁字路口', bend: '弯道', terminal: '入口 / 出口', straight: '直路', transition: '车道变化', merge: '匝道汇入', exit: '匝道汇出', toll: '收费站' };
export default function NetworkApp() {
  const [saved] = useState(restoreNetworkDraft);
  const [mapImportOpen, setMapImportOpen] = useState(false);
  const [compactTools, setCompactTools] = useState(() => window.matchMedia('(max-width:650px)').matches);
  useEffect(() => { const media=window.matchMedia('(max-width:650px)'); const update=()=>setCompactTools(media.matches); media.addEventListener('change',update); return ()=>media.removeEventListener('change',update); }, []);
  const [selected, setSelected] = useState(() => ({ type: 'node', id: (saved.config.nodes.find(n => n.id === 'center') || saved.config.nodes.find(n => n.type !== 'terminal') || saved.config.nodes[0])?.id })), [tab, setTab] = useState('properties'), [rate, setRate] = useState(5), [zoom, setZoom] = useState('auto'), [viewScale, setViewScale] = useState(200), [focusRequest, setFocusRequest] = useState(null), [appendAt, setAppendAt] = useState(null), [cameraMode,setCameraMode] = useState(()=>{try{return localStorage.getItem('crashpad:camera')==='director'?'director':'free';}catch{return 'free';}}), [cameraTarget,setCameraTarget]=useState('player'), [cameraHint,setCameraHint]=useState(()=>{try{return !localStorage.getItem('crashpad:camera-hint');}catch{return true;}}), [storageError, setStorageError] = useState(false), [notice, setNotice] = useState(''), [attempts, setAttempts] = useState([]);
  const [connectionNotice, setConnectionNotice] = useState(''), [inspectorOpen, setInspectorOpen] = useState(false), [flowEntryId, setFlowEntryId] = useState('');
  const { config, configRef, edit: commitEdit, history: changeHistory, canUndo, canRedo } = useNetworkEditor(saved.config, { onSimulationChange: () => { simulation.reset(); recorded.current = null; setNotice('参数已更新，重新开始模拟后生效。'); } });
  const recorded = useRef(null), body = useRef(null), simulation = useSimulation(config);
  const { snapshot, running } = simulation;
  const { net, invalid } = useMemo(() => { try { if (!config.nodes.length) return { net: null, invalid: '' }; return { net: compileNetwork(config), invalid: '' }; } catch (error) { return { net: null, invalid: error.message }; } }, [config]);
  const issues = useMemo(() => roadIssues(config), [config]);
  const camera=useCameraDirector({config,net,snapshot,running,mode:cameraMode,target:cameraTarget});
  const follow=cameraMode==='vehicle'&&cameraTarget==='player';
  function dismissCameraHint(){setCameraHint(false);try{localStorage.setItem('crashpad:camera-hint','1');}catch{}}
  function chooseCamera(mode,target=cameraTarget){
    setCameraMode(mode);setCameraTarget(target);dismissCameraHint();if(mode==='vehicle')setInspectorOpen(false);
    if(mode!=='free')setZoom(mode==='vehicle'?300:150);
    try{localStorage.setItem('crashpad:camera',mode==='director'?'director':'free');}catch{}
  }
  function setFollow(enabled){if(enabled)chooseCamera('vehicle','player');else setCameraMode('free');}
  useEffect(()=>{if(cameraMode==='director'&&snapshot)setZoom(camera?.overview?'fit':150);},[cameraMode,camera?.overview,!!snapshot]);
  const nodes = Object.fromEntries(config.nodes.map(n => [n.id, n])), node = selected?.type === 'node' ? nodes[selected.id] : null, road = selected?.type === 'road' ? config.roads.find(r => r.id === selected.id) : null, car = selected?.type === 'car' ? snapshot?.cars.find(c => c.id === selected.id) : null;
  const terminals = config.nodes.filter(n => n.type === 'terminal'), sources = terminals.filter(n => n.role !== 'sink'), sinks = terminals.filter(n => n.role !== 'source');
  const stats = snapshot?.stats, player = stats?.player, experiment = experimentIdentity(config, { excludePlayer: true });
  function edit(fn, options) { return commitEdit(fn, options); }
  function loadScenario(id) {
    const preset = TRAFFIC_SCENARIOS.find(p => p.id === id);
    edit(next => { for (const key of Object.keys(next)) delete next[key]; Object.assign(next, createTrafficScenario(id)); });
    setSelected({ type: 'node', id: preset.focus }); setTab('properties');
    setAppendAt(null); setAttempts([]); setFollow(false);
    if (window.matchMedia('(max-width: 650px)').matches) focusNode(configRef.current, preset.focus);
    else { setZoom('fit'); setFocusRequest(null); }
    setNotice(`${preset.title} · ${configRef.current.demand.reduce((sum, d) => sum + d.count, 0)} 辆车，参数为实验设置；可编辑或撤销载入。`);
  }
  function history(redo = false) { if (changeHistory(redo)) setSelected(null); }
  function focusNode(value, id) { const target = value.nodes.find(n => n.id === id) || value.nodes.find(n => n.type !== 'terminal') || value.nodes[0]; if (!target) return; setFollow(false); setZoom(200); setFocusRequest({ x: target.x, y: target.y, key: Date.now() }); }
  function locateRoad(id) {
    const r=configRef.current.roads.find(r=>r.id===id);if(!r)return;
    const a=configRef.current.nodes.find(n=>n.id===r.from),b=configRef.current.nodes.find(n=>n.id===r.to);if(!a||!b)return;
    setSelected({type:'road',id});setTab('properties');setFollow(false);setZoom(200);
    setFocusRequest({x:(a.x+b.x)/2,y:(a.y+b.y)/2,key:Date.now()});
  }
  function alignRoad(id) {
    const next=alignedRoad(configRef.current,id);if(!next)return;
    edit(draft=>Object.assign(draft,next));locateRoad(id);
    setNotice('已对齐并留足间距，可通过撤销恢复。');
  }
  function addRoadTemplate(kind, target = selected) {
    const result = insertTemplate(configRef.current, target, kind); edit(next => Object.assign(next, result.config)); setSelected(result.selected); setTab('properties'); setAppendAt(null); const n = result.config.nodes.find(n => n.id === result.selected.id); setFollow(false); setFocusRequest({ x: n.x, y: n.y, reveal: true, key: Date.now() });
  }

  function editNode(fn, options) { edit(next => { const n = next.nodes.find(n => n.id === selected.id); if (n) fn(n); }, options); }
  function resizeLength(value) {
    const result=resizeRoadLength(configRef.current,selected,value);
    if(result.error){setNotice(result.error);return;}
    setFollow(false);setZoom(viewScale);edit(next=>Object.assign(next,result.config));
  }
  function editCurve(id,index,point){
    const next=clone(configRef.current),r=next.roads.find(r=>r.id===id);if(!r?.geometry)return;
    if(point)r.geometry.points[index]=point;else r.geometry.points.splice(index,1);
    try{const line=curveCenterline(next,r);validateCurve(line);r.length=Math.round(polylineLength(line)*10)/10;if(r.length>1500)throw Error('道路长度不能超过 1500 米。');let valid=true;try{compileNetwork(configRef.current);}catch{valid=false;}if(valid)compileNetwork(next);edit(value=>Object.assign(value,next));setNotice('');}catch(e){setNotice(`控制点调整未保存：${e.message}`);}
  }
  function editRoad(field, value) { edit(next => { const r = next.roads.find(r => r.id === selected.id); if (r) r[field] = value; }); }
  function remove() {
    if (selected?.type === 'road') edit(next => { next.roads = next.roads.filter(r => r.id !== selected.id); });
    else if (selected?.type === 'node') edit(next => { next.nodes = next.nodes.filter(n => n.id !== selected.id); next.roads = next.roads.filter(r => r.from !== selected.id && r.to !== selected.id); next.demand = next.demand.filter(d => d.node !== selected.id); for (const d of next.demand) delete d.destinations[selected.id]; if (next.player?.entry === selected.id || next.player?.destination === selected.id) next.player = null; });
    else return;
    setSelected(null);
  }
  useEffect(() => { setStorageError(!saveNetworkDraft({ config, A: saved.A, B: saved.B })); }, [config, saved]);
  useEffect(() => { if (body.current) body.current.scrollTop = 0; }, [selected?.type, selected?.id, tab]);
  useEffect(() => {
    const key = e => { if (mapImportOpen) return; if (e.isComposing || e.repeat || e.altKey || e.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return; if ((e.ctrlKey || e.metaKey) && ['z', 'y'].includes(e.key.toLowerCase())) { e.preventDefault(); history(e.shiftKey || e.key.toLowerCase() === 'y'); return; } if (e.ctrlKey || e.metaKey) return; if (['Delete', 'Backspace'].includes(e.key) && ['node', 'road'].includes(selected?.type)) { e.preventDefault(); remove(); } };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  });
  useEffect(() => {
    if (player?.status !== 'arrived') return;
    // One record per run; the elapsed time freezes after arrival.
    const key = `${experiment}:${JSON.stringify(config.player)}:${player.elapsed}`;
    if (recorded.current === key) return; recorded.current = key;
    setAttempts(rows => [...rows.filter(r => r.experiment !== experiment || JSON.stringify(r.player) !== JSON.stringify(config.player)), { experiment, player: clone(config.player), duration: player.elapsed }].slice(-36));
  }, [player?.status, player?.elapsed, experiment]);
  function add(type) {
    const id = `${type}-${Date.now()}`, x = Math.max(1080, ...config.nodes.map(n => n.x + 160));
    edit(next => { next.nodes.push({ id, type, name: names[type], x, y: 440, rotation: 0, ...(type === 'terminal' ? { role: 'both' } : { signal: { enabled: type !== 'bend', plan: 'alternating', green: 25, leftGreen: 12 }, priority: 'ew', turns: {} }) }); }); setSelected({ type: 'node', id }); setTab('properties'); focusNode(configRef.current, id);
  }
  function move(id, x, y) {
    const original = nodes[id]; if (!original || original.x === x && original.y === y) return;
    // Snap coordinates to nearby objects so attached ports can align precisely.

    edit(next => {
      Object.assign(next, moveConnectedNode(next, id, x, y));
      const moved = next.nodes.find(n => n.id === id);
      // A loose object snaps to one compatible free port when brought close.
      if (!next.roads.some(r => r.from === id || r.to === id)) {
        const candidates = next.nodes.filter(n => n.id !== id && (n.x === moved.x || n.y === moved.y) && Math.hypot(n.x - moved.x, n.y - moved.y) >= minimumNodeGap(n, moved, next.roads) && Math.hypot(n.x - moved.x, n.y - moved.y) <= 200).sort((a, b) => Math.hypot(a.x - moved.x, a.y - moved.y) - Math.hypot(b.x - moved.x, b.y - moved.y));
        const target = candidates.find(n => ports(moved).includes(sideOf(moved, n)) && ports(n).includes(sideOf(n, moved)) && !next.roads.some(r => { const otherId = r.from === n.id ? r.to : r.to === n.id ? r.from : null; const other = next.nodes.find(t => t.id === otherId); return other && sideOf(n, other) === sideOf(n, moved); }));
        if (target) next.roads.push({ id: `road-${Date.now()}`, from: id, to: target.id, lanes: 2, length: Math.max(60, Math.round(Math.hypot(target.x - moved.x, target.y - moved.y) - 100)), speed: 50 });
      }
    });
  }
  function connect(a, b) {
    const from = nodes[a.node], to = nodes[b.node];
    if (!from || !to || a.node === b.node || Math.hypot(from.x - to.x, from.y - to.y) < minimumNodeGap(from, to, config.roads)) { setConnectionNotice('请连接不同对象，并留足组件宽度。错位端点会沿端口朝向生成曲线。'); return false; }
    if (config.roads.some(r => { const n = r.from === a.node ? nodes[r.to] : r.to === a.node ? nodes[r.from] : null; const m = r.from === b.node ? nodes[r.to] : r.to === b.node ? nodes[r.from] : null; return n && (r.geometry?curveSide(config,r,r.from===from.id):sideOf(from,n))===a.side || m && (r.geometry?curveSide(config,r,r.from===to.id):sideOf(to,m))===b.side; })) { setConnectionNotice('该端口已有道路，请先删除旧连接。'); return false; }
    const id=`road-${Date.now()}`,next=clone(config),road={id,from:from.id,to:to.id,lanes:2,length:Math.max(60,Math.round(Math.hypot(from.x-to.x,from.y-to.y)-80)),speed:50};
    if(from.x!==to.x&&from.y!==to.y||sideOf(from,to)!==a.side||sideOf(to,from)!==b.side){
      const vector={east:[1,0],south:[0,1],west:[-1,0],north:[0,-1]},v=vector[a.side],w=vector[b.side];
      const reach=Math.min(160,Math.hypot(from.x-to.x,from.y-to.y)/3);
      road.geometry={fromSide:a.side,toSide:b.side,points:[{x:from.x,y:from.y},{x:from.x+v[0]*reach,y:from.y+v[1]*reach},{x:to.x+w[0]*reach,y:to.y+w[1]*reach},{x:to.x,y:to.y}],radius:60};
    }
    next.roads.push(road);
    try{if(road.geometry){const curve=curveCenterline(next,road);validateCurve(curve);road.length=Math.round(polylineLength(curve)*10)/10;if(road.length>1500)throw Error('曲线连接超过 1500 米，请增加一个中间连接点。');}}catch(e){setConnectionNotice(e.message);return false;}
    setConnectionNotice('');edit(value=>Object.assign(value,next));setSelected({type:'road',id});return true;
  }
  function demandFor(id) { return config.demand.find(d => d.node === id) || { node: id, count: 0, flow: 20, destinations: {} }; }
  function editDemand(id, fn) { edit(next => { let d = next.demand.find(d => d.node === id); if (!d) { d = { node: id, count: 0, flow: 20, destinations: {} }; next.demand.push(d); } fn(d); }); }
  function mixDestination(id, destination, value) { editDemand(id, d => { const keys = sinks.map(n => n.id); d.destinations = Object.fromEntries(keys.map(key => [key, d.destinations[key] || 0])); let remaining = 100 - value; d.destinations[destination] = value; const others = keys.filter(key => key !== destination), total = others.reduce((sum, key) => sum + (d.destinations[key] || 0), 0); for (let i = 0; i < others.length; i++) { const key = others[i], amount = i === others.length - 1 ? remaining : Math.min(remaining, Math.round((100 - value) * (total ? (d.destinations[key] || 0) / total : 1 / others.length))); d.destinations[key] = amount; remaining -= amount; } if (!others.length) d.destinations[destination] = 100; }); }
  function setPlayer(field, value) { edit(next => { next.player = { ...next.player, [field]: value }; }); }
  const inputEdges = node ? config.roads.filter(r => r.from === node.id || r.to === node.id).map(r => { const other = nodes[r.from === node.id ? r.to : r.from]; const heading = ({ east: 0, south: 90, west: 180, north: 270 })[sideOf(other, node)]; return { id: `${r.id}:${other.id}`, roadId: r.id, from: other.id, to: node.id, heading, lanes: r.lanes }; }) : [];
  const validTurns = edge => Object.keys(TURNS).filter(turn => inputEdges.some(other => turnFor(edge, { heading: (other.heading + 180) % 360 }) === turn));
  return <div className="traffic-app network-app">
    {mapImportOpen && <MapImportDialog onClose={()=>setMapImportOpen(false)} onImport={next=>{compileNetwork(next);edit(value=>{for(const key of Object.keys(value))delete value[key];Object.assign(value,next);});setSelected({type:'node',id:next.nodes[0].id});setTab('properties');setAppendAt(null);setAttempts([]);setFollow(false);setZoom('fit');setFocusRequest(null);setMapImportOpen(false);setNotice('已载入地图路线草稿；已保留道路弧度，车道与信号为实验参数，可编辑或撤销。');}}/>}
    <WorkbenchHeader activeModule="traffic" saveStatus={storageError ? '路网未保存' : '路网自动保存'} saveError={storageError} actions={<SegmentedControl label="实验设置" value={tab} options={[{value:'properties',label:'对象属性'},{value:'flow',label:'车流设置'},{value:'player',label:'我的路线'}]} onChange={value=>{setTab(value);setInspectorOpen(true);}}/>}/>
    <div className={`network-workspace${cameraMode==='vehicle'&&!inspectorOpen?' is-following-vehicle':''}`}><main className="network-main" aria-label="车流实验室">
      <div className="network-toolbar"><HistoryControls canUndo={canUndo} canRedo={canRedo} onUndo={() => history()} onRedo={() => history(true)}/><button className="network-toolbar-action" disabled={!config.nodes.length} onClick={() => { edit(next => { next.nodes = []; next.roads = []; next.demand = []; next.player = null; }); setSelected(null); setAppendAt(null); setFollow(false); setFocusRequest({ x: 500, y: 440, key: Date.now() }); setNotice('画布已清空，可撤销恢复。'); }}>清空画布</button><button className="network-toolbar-action" onClick={() => { if (running) simulation.play(rate); setMapImportOpen(true); }}>从地图创建</button><ScenarioMenu onScenario={loadScenario} onTemplate={kind => { const next = ['cross','tee'].includes(kind) ? makeExample(kind === 'tee' ? 'tee' : undefined) : corridorExample(kind); edit(value => { for (const key of Object.keys(value)) delete value[key]; Object.assign(value, next); }); const id = ['cross','tee'].includes(kind) ? 'center' : 'section'; setSelected({type:'node',id}); setTab('properties'); focusNode(configRef.current,id); }}/><span title={config.mapImport?.assumptions}>{config.mapImport ? '地图路线草稿 · ' : ''}{config.nodes.length} 个对象 · {config.roads.length} 条道路</span></div>
      <div className="network-stage" data-sim-time={snapshot?.time || 0}><div className="network-palette" aria-label="添加道路与对象"><details open={!compactTools}><summary>道路模板</summary>{[['straight', '直路'], ['drop', '车道减少'], ['add', '车道增加'], ['merge', '匝道汇入'], ['exit', '匝道汇出'], ['toll', '收费站']].map(([type, label]) => <button key={type} disabled={config.nodes.length >= 37} onClick={() => addRoadTemplate(type)}><RoadIcon type={type} size={17}/>{label}</button>)}</details><details open={!compactTools}><summary>路口与连接</summary>{['cross', 'tee', 'bend', 'terminal'].map(type => <button key={type} disabled={config.nodes.length >= 40} onClick={() => add(type)}><RoadIcon type={type} size={17}/>{names[type]}</button>)}</details></div>
        <NetworkCanvas followVehicle={cameraMode==='vehicle'} onCurveEdit={editCurve} config={config} net={net} snapshot={snapshot} selected={selected} onSelect={(item, options = {}) => { setSelected(item); setTab('properties'); if(item && options.reveal !== false) setInspectorOpen(true); }} onMove={move} onConnect={connect} camera={camera} zoom={zoom} onZoom={setZoom} onScale={setViewScale} onNavigate={() => setFollow(false)} onAppend={target => setAppendAt(target)} viewScale={viewScale} focusRequest={focusRequest} onFit={() => { setFollow(false); setZoom('fit'); }} onFocus={() => { if (road) { const a = nodes[road.from], b = nodes[road.to]; setFollow(false); setZoom(200); setFocusRequest({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, key: Date.now() }); } else focusNode(config, selected?.id); }}/>
        {cameraMode==='vehicle'&&<VehiclePanel key={cameraTarget} overlay compact={compactTools} id={cameraTarget==='player'?snapshot?.stats.player?.id:cameraTarget} snapshot={snapshot} net={net} running={running} onExit={()=>chooseCamera('free')}/>}
        {connectionNotice && <div className="network-drag-note" role="status">{connectionNotice}<button className="text-button" onClick={()=>{setConnectionNotice('');setInspectorOpen(true);setTab('properties');}}>调整属性</button><button className="icon-button" aria-label="关闭连接提示" onClick={()=>setConnectionNotice('')}>×</button></div>}
        {appendAt && <InsertRoadMenu target={appendAt} onClose={() => setAppendAt(null)} onInsert={addRoadTemplate}/>}
        <span className="network-status">{invalid ? '路网待连接' : running ? '模拟运行中' : snapshot?.finished ? stats.timedOut ? '达到 30 分钟上限' : '模拟结束' : snapshot ? '已暂停' : '准备就绪'}</span>
        <NetworkDashboard snapshot={snapshot} net={net} config={config} nodes={nodes} sources={sources} demandFor={demandFor}/>

      </div>
      <PlaybackFrame className="traffic-playback"><button className="button primary" disabled={!!invalid || !net} onClick={() => simulation.play(rate)} data-network-play><Icon name={running ? 'pause' : 'play'} size={15}/>{running ? '暂停' : snapshot?.finished ? '重新模拟' : snapshot ? '继续模拟' : '开始模拟'}</button><button className="button secondary" onClick={() => { simulation.reset(); recorded.current = null; }}>重置</button><SegmentedControl label="模拟倍速" value={rate} options={[1,5,10,20].map(value=>({value,label:`${value}×`}))} onChange={value=>{setRate(value);simulation.speed(value);}}/><SegmentedControl label="观察视角" value={cameraMode} options={[{value:'free',label:'自由查看'},{value:'director',label:'导演视角'},{value:'vehicle',label:'跟随车辆',disabled:selected?.type!=='car'&&cameraTarget==='player'&&!config.player}]} onChange={mode=>chooseCamera(mode,mode==='vehicle'&&selected?.type==='car'?selected.id:cameraTarget)}/>{running&&cameraMode==='free'&&cameraHint&&<span className="network-camera-hint"><button onClick={()=>chooseCamera('director')}>开启导演视角，自动看看车流</button><button aria-label="关闭视角提示" onClick={dismissCameraHint}>关闭</button></span>}<span className="traffic-time">模拟时间 {duration(snapshot?.time || 0)}</span></PlaybackFrame>
    </main><aside className="network-sidebar" aria-label="路网设置" data-open={inspectorOpen}><button className="inspector-toggle" aria-expanded={inspectorOpen} onClick={()=>setInspectorOpen(!inspectorOpen)}>{inspectorOpen ? '收起设置' : '属性与设置'}</button><div className="traffic-property-heading"><h2>{tab === 'flow' ? '车流与路线' : tab === 'player' ? '我的路线' : node ? node.name || names[node.type] : road ? '道路属性' : car ? `车辆 ${car.id}` : '路网属性'}</h2></div>
      <div className="network-property-body" ref={body}>
        {issues.length ? <div className="traffic-error network-road-issues" role="alert"><strong>{issues.length} 处道路连接需要调整</strong>{issues.map(issue=><div key={issue.id}><button className="network-issue-location" onClick={()=>locateRoad(issue.id)} aria-label={`定位问题道路 ${issue.label}`}><strong>{issue.label}</strong><span>{issue.reason} · 点击定位</span></button>{alignedRoad(config,issue.id) ? <button onClick={()=>alignRoad(issue.id)}>一键对齐</button> : <small>请选择端点调整位置或方向</small>}</div>)}</div> : invalid && <p className="traffic-error" role="alert">{invalid}</p>}{simulation.error && <p className="traffic-error" role="alert">{simulation.error}</p>}{notice && <p className="traffic-feedback" role="status">{notice}<button className="text-button" onClick={() => setNotice('')}>关闭</button></p>}
        {tab === 'properties' && <PropertiesPanel snapshot={snapshot} running={running} followingId={cameraMode==='vehicle'?(cameraTarget==='player'?snapshot?.stats.player?.id:cameraTarget):null} key={`${selected?.type}:${selected?.id}`} node={node} road={road} car={car} nodes={nodes} config={config} net={net} selected={selected} edit={edit} editNode={editNode} editRoad={editRoad} move={move} resizeLength={resizeLength} setTab={setTab} setSelected={setSelected} focusNode={focusNode} remove={remove} chooseCamera={chooseCamera} inputEdges={inputEdges} validTurns={validTurns} demandFor={demandFor} editDemand={editDemand} sources={sources} mixDestination={mixDestination} setFlowEntryId={setFlowEntryId} sinks={sinks}/>}
        {tab === 'flow' && <FlowPanel key={flowEntryId} sources={sources} sinks={sinks} flowEntryId={flowEntryId} setFlowEntryId={setFlowEntryId} demandFor={demandFor} editDemand={editDemand} mixDestination={mixDestination} config={config} edit={edit}/>}
        {tab === 'player' && <PlayerPanel config={config} edit={edit} sources={sources} sinks={sinks} demandFor={demandFor} setPlayer={setPlayer} net={net} follow={follow} setFollow={setFollow} setZoom={setZoom} player={player} attempts={attempts} experiment={experiment} nodes={nodes}/>}
      </div>
    </aside></div>
  </div>;
}
