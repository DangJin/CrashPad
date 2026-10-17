import { SIGNAL_DEFAULT } from './roadEvents.js';
import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import TrafficCanvas from './TrafficCanvas.jsx';
import PlayerPanel, { experimentKey, duration } from './PlayerPanel.jsx';
import { DEFAULT_CONFIG, copy, compileRoad, summary, playerStatus } from './engine.js';
import './traffic.css';
import { drivingStyle, normalizePlayerConfig, normalizeTrafficConfig, trafficMix, adjustTrafficMix, allocateDriverCounts, DRIVING_STYLES } from './drivingStyles.js';
import LiveStats from './LiveStats.jsx';

const KEY = 'crashpad:traffic:v1';
const kinds = { straight: '直路', drop: '车道减少', add: '车道增加', merge: '匝道汇入', exit: '匝道汇出', toll: '高速收费站' };
function load() {
  const restored = { config: normalizeTrafficConfig(copy(DEFAULT_CONFIG)), A: null, B: null };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    for (const key of ['config', 'A', 'B']) {
      try { if (saved?.[key]) { compileRoad(saved[key]); restored[key] = normalizeTrafficConfig(copy(saved[key])); } } catch { /* Recover each saved scenario independently. */ }
    }
  } catch { /* Keep accident drafts independent. */ }
  return restored;
}
const fixed = value => value == null ? '—' : value.toFixed(1);
const seconds = value => value == null ? '—' : `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
function Range({ title, value, min, max, step = 1, unit = '', onChange, help }) {
  return <label className="traffic-range"><span>{title}<strong>{value}{unit}</strong></span><input aria-label={title} type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />{help && <small>{help}</small>}</label>;
}
function aggregate(runs) {
  const average = key => { const valid = runs.filter(row => row[key] != null); return valid.length ? valid.reduce((sum, row) => sum + row[key], 0) / valid.length : null; };
  return { completed: average('completed'), time: average('time'), meanSpeed: average('meanSpeed'), meanTrip: average('meanTrip'), playerTrip: (() => { const finished = runs.filter(r => r.player?.duration != null); return finished.length ? finished.reduce((sum, r) => sum + r.player.duration, 0) / finished.length : null; })(), cutIns: average('cutIns'), harshBrakes: average('harshBrakes'), timeouts: runs.filter(r => r.timedOut).length };
}
function describe(config) {
  try { const road = compileRoad(config); return `${config.initialLanes}${road.segments.filter(s => ['drop', 'add'].includes(s.kind)).map(s => ` → ${s.lanes}`).join('')} 车道 · ${config.count} 辆 · 保守 ${trafficMix(config).conservative}% / 常规 ${trafficMix(config).normal}% / 激进 ${trafficMix(config).aggressive}%${config.playerLane == null ? '' : ` · 我选入口车道 ${config.playerLane + 1} · ${drivingStyle(config.playerStyle).label} · ${normalizePlayerConfig(config).playerLaneChanges ? '择机变道' : '保持车道'}`}`; } catch { return '方案配置无效'; }
}
export default function TrafficApp() {
  const [settings, setSettings] = useState('player'), [settingsOpen, setSettingsOpen] = useState(true);
  const [saved] = useState(load), [config, setConfig] = useState(saved.config), [selectedSegment, setSelectedSegment] = useState(0);
  const [A, setA] = useState(saved.A), [B, setB] = useState(saved.B), [results, setResults] = useState(null);
  const [running, setRunning] = useState(false), [rate, setRate] = useState(5), [zoom, setZoom] = useState('fit');
  const [attempts, setAttempts] = useState([]), [followPlayer, setFollowPlayer] = useState(true);
  const recordedPlayer = useRef(null), propertyBody = useRef(null);
  const [version, redraw] = useState(0), [selectedCar, setSelectedCar] = useState(null), [view, setView] = useState('live');
  const [message, setMessage] = useState(''), [job, setJob] = useState(null), [storageError, setStorageError] = useState(false);
  const liveAccepting = useRef(false), liveWorker = useRef(null), liveTask = useRef(0);
  const sim = useRef(null), worker = useRef(null), nextId = useRef(Date.now());
  useEffect(() => { if (propertyBody.current) propertyBody.current.scrollTop = 0; }, [settings, selectedSegment, selectedCar]);
  let road = null, error = '';
  try { road = compileRoad(config); } catch (e) { error = e.message; }
  const section = config.segments[selectedSegment];
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify({ config, A, B })); setStorageError(false); } catch { setStorageError(true); } }, [config, A, B]);
  useEffect(() => () => { worker.current?.terminate(); liveWorker.current?.terminate(); }, []);
  useEffect(() => { const pause = () => { if (document.hidden) setRunning(false); }; document.addEventListener('visibilitychange', pause); return () => document.removeEventListener('visibilitychange', pause); }, []);
  useEffect(() => {
    if (!running) { liveAccepting.current = false; liveWorker.current?.postMessage({ type: 'pause', taskId: liveTask.current }); return; }
    if (!liveWorker.current) {
      const task = new Worker(new URL('./simulation.worker.js', import.meta.url), { type: 'module' }), taskId = ++liveTask.current; liveWorker.current = task;
      task.onmessage = ({ data }) => {
        if (liveWorker.current !== task || data.taskId !== liveTask.current) return;
        if (data.type === 'error') { setRunning(false); setMessage(data.message); return; }
        if (!liveAccepting.current) return;
        sim.current = data.state;
        const result = playerStatus(data.state);
        if (result?.status === 'arrived' && recordedPlayer.current !== taskId) {
          recordedPlayer.current = taskId;
          const attempt = { lane: data.state.config.playerLane, style: data.state.config.playerStyle, laneChanges: data.state.config.playerLaneChanges, duration: result.duration, experiment: experimentKey(data.state.config) };
          setAttempts(previous => [...previous.filter(row => row.experiment !== attempt.experiment || row.lane !== attempt.lane || row.style !== attempt.style || row.laneChanges !== attempt.laneChanges), attempt].slice(-36));
        }
        redraw(v => v + 1); if (data.state.finished) setRunning(false);
      };
      task.onerror = () => { if (liveWorker.current === task) { setRunning(false); setMessage('模拟计算失败，请重置后重试。'); } };
      task.postMessage({ type: 'init', mode: 'linear', taskId, config });
    }
    liveWorker.current.postMessage({ type: 'rate', taskId: liveTask.current, rate });
    liveWorker.current.postMessage({ type: 'run', taskId: liveTask.current, rate });
  }, [running, rate]);
  function clearLive() { liveAccepting.current = false; liveTask.current++; liveWorker.current?.terminate(); liveWorker.current = null; sim.current = null; }
  function cancelComparison() { worker.current?.terminate(); worker.current = null; setJob(null); }
  function changeConfig(fn) {
    setRunning(false); clearLive(); setSelectedCar(null); setMessage('');
    setConfig(previous => { const next = copy(previous); fn(next); return next; }); redraw(v => v + 1);
  }
  function update(field, value) { changeConfig(next => { next[field] = value; if (field === 'initialLanes' && Number.isInteger(value) && value >= 1 && next.playerLane != null) next.playerLane = Math.min(next.playerLane, value - 1); }); }
  function chooseSegment(index) { setSelectedSegment(index); setSelectedCar(null); setSettings('road'); setSettingsOpen(true); }
  function editSegment(field, value) { changeConfig(next => { next.segments[selectedSegment][field] = value; }); }
  function editSignal(field, value) { changeConfig(next => { const segment = next.segments[selectedSegment]; segment.signal = { ...SIGNAL_DEFAULT, ...segment.signal, [field]: value }; }); }
  function addSegment(kind) {
    if (config.segments.length >= 10) return;
    const index = config.segments.length;
    changeConfig(next => { next.segments.push({ id: `road-${++nextId.current}`, kind, change: 1, length: kind === 'toll' ? 600 : kind === 'straight' ? 300 : 200, side: 'right', ...(kind === 'merge' ? { rampCount: Math.min(10, Math.floor(config.count / 4)), rampFlow: 30 } : {}), ...(kind === 'exit' ? { exitPercent: 20 } : {}) }); }); chooseSegment(index);
  }
  function moveSegment(direction) {
    const target = selectedSegment + direction; if (target < 0 || target >= config.segments.length) return;
    changeConfig(next => { [next.segments[target], next.segments[selectedSegment]] = [next.segments[selectedSegment], next.segments[target]]; }); setSelectedSegment(target);
  }
  function removeSegment() { changeConfig(next => { next.segments.splice(selectedSegment, 1); }); setSelectedSegment(Math.max(0, selectedSegment - 1)); }
  useEffect(() => {
    function keydown(event) {
      if (event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || !['Backspace', 'Delete'].includes(event.key)) return;
      if (event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
      if (view !== 'live' || settings !== 'road' || config.segments.length <= 1) return;
      event.preventDefault(); removeSegment();
    }
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  });
  function start() {
    if (error) return;
    setSettingsOpen(true);
    if (sim.current?.finished) clearLive();
    liveAccepting.current = !running; setMessage(''); setView('live'); setRunning(v => !v); redraw(v => v + 1);
  }
  function reset() { setRunning(false); clearLive(); setSelectedCar(null); setMessage(''); redraw(v => v + 1); }
  function store(key) { if (error) return; (key === 'A' ? setA : setB)(copy(config)); cancelComparison(); setResults(null); setMessage(`已保存方案 ${key}。`); }
  function compare(control = false) {
    if (error) return;
    if (config.seed > 999997) { setMessage('对照需要三个连续种子，请把随机种子设置为 1～999997。'); return; }
    cancelComparison();
    const first = control ? { ...copy(config), driverMix: { conservative: 0, normal: 100, aggressive: 0 } } : A;
    const second = control ? copy(config) : B;
    if (!first || !second) { setMessage('请先保存方案 A 和 B，或使用「全常规 / 当前配比」快捷对照。'); return; }
    if (control) { setA(first); setB(second); }
    setRunning(false); setView('compare'); setResults(null); setJob({ completed: 0, total: 6 }); setMessage('');
    const task = new Worker(new URL('./comparison.worker.js', import.meta.url), { type: 'module' }); worker.current = task;
    task.onmessage = ({ data }) => {
      if (worker.current !== task) return;
      if (data.type === 'progress') setJob(data);
      else { if (data.type === 'done') setResults({ ...data.results, configs: { A: copy(first), B: copy(second) }, seed: config.seed }); else setMessage(`对照失败：${data.message}`); cancelComparison(); }
    };
    task.onerror = () => { if (worker.current === task) { cancelComparison(); setMessage('对照计算失败，请重试。'); } };
    task.postMessage({ A: first, B: second, seed: config.seed, repeats: 3 });
  }
  const state = sim.current, stats = state ? summary(state) : { time: 0, completed: 0, active: 0, pending: config.count, queued: 0, meanSpeed: 0, meanTrip: null, cutIns: 0, harshBrakes: 0 };
  const laneRows = road ? Array.from({ length: road.maxLane - road.minLane + 1 }, (_, i) => {
    const lane = road.minLane + i, cars = state?.cars.filter(car => !car.ramp && car.lane === lane) || [], history = state?.laneStats[lane];
    return { lane, count: cars.length, speed: cars.length ? cars.reduce((sum, car) => sum + car.v * 3.6, 0) / cars.length : null, queued: cars.filter(car => car.v < 5 / 3.6).length, mean: history?.samples ? history.sum / history.samples : null };
  }) : [];
  const myCar = state && playerStatus(state);
  const car = state?.cars.find(c => c.id === selectedCar);
  const samples = state?.samples || [];
  const populationCounts = allocateDriverCounts(config.count - (config.playerLane == null ? 0 : 1), trafficMix(config));
  return <div className="traffic-app" data-frame={version}>
    <header className="traffic-header"><a className="traffic-brand" href="#/"><span className="brand-symbol"><Icon name="logo" size={22} /></span><strong>CrashPad</strong></a><nav aria-label="模块导航"><a href="#/">现场还原</a><a href="#/traffic" aria-current="page">车流实验室</a></nav><span className="traffic-save">{storageError ? '设置未保存' : '实验设置自动保存'}</span></header>
    <div className="traffic-workspace">
      <main className="traffic-main" aria-label="车流实验室">
        <div className="traffic-view-tabs"><a className="network-mode-link" href="#/traffic/network">统一实验室 ↗</a><button aria-pressed={view === 'live'} onClick={() => setView('live')}>实时模拟</button><button aria-pressed={view === 'compare'} onClick={() => { setRunning(false); setView('compare'); }}>方案对照</button>{road && <span>{road.length} m · {config.count} 辆车</span>}</div>
        {view === 'live' ? <>
          <div className="traffic-stage">{message && view === 'live' && <p className="traffic-error" role="alert">{message}</p>}
            <div className="traffic-stage-status"><span><i className={`traffic-status-dot ${running ? 'is-running' : ''}`} />{running ? '模拟运行中' : state?.timedOut ? '达到 30 分钟模拟上限' : state?.finished ? '模拟结束' : state ? '已暂停' : '准备就绪'}</span>{myCar && <span className="traffic-stage-player">{myCar.status === 'arrived' ? '已到达' : '我的用时'}<strong>{duration(myCar.elapsed)}</strong></span>}</div>
            {road ? <TrafficCanvas road={road} sim={state} selected={settings === 'car' ? selectedCar : null} onSelect={id => { setSelectedCar(id); setSettings('car'); setSettingsOpen(true); }} zoom={zoom} selectedSegment={settings === 'road' ? selectedSegment : null} onSelectSegment={chooseSegment} followId={followPlayer ? state?.playerId : null} /> : <div className="traffic-empty">请先在道路设置中修正连接，再开始模拟。</div>}
            {road && <LiveStats rows={laneRows} stats={stats} total={config.count} samples={samples} speedLimit={config.speed} merges={state?.merges || 0} />}
          </div>
          <div className="traffic-playback"><button className={`button ${myCar?.status === 'arrived' ? 'secondary' : 'primary'}`} data-action="traffic-play" disabled={!!error} onClick={start}><Icon name={running ? 'pause' : 'play'} size={15} />{running ? '暂停' : state?.finished ? '重新模拟' : state ? '继续模拟' : '开始模拟'}</button><button className="button secondary" onClick={reset}><Icon name="rotate" size={15} />重置</button><div className="traffic-rate" role="group" aria-label="模拟倍速">{[1, 5, 10, 20].map(value => <button key={value} aria-pressed={rate === value} onClick={() => setRate(value)}>{value}×</button>)}</div><div className="traffic-zoom" role="group" aria-label="模拟画布缩放">{[['fit', '全路'], ['1.5', '细看'], ['3', '放大']].map(([value, label]) => <button key={value} aria-pressed={zoom === value} onClick={() => setZoom(value)}>{label}</button>)}</div><span className="traffic-time">模拟时间 {seconds(stats.time)}</span></div>
          <div className="traffic-canvas-key"><span><i />激进型车辆</span><span>车辆向右行驶 · 图标适当放大 · 细看模式可横向滚动</span></div>
        </> : <section className="traffic-compare"><div className="traffic-results-heading"><h2>同条件，跑三次再比较</h2><span>每组重复 3 次 · 相同种子配对</span></div><p className="traffic-help">两组使用相同的随机种子。对照计算在后台完成；修改当前参数不会改写已保存的方案。</p><div className="traffic-scenario-grid">{[['A', A], ['B', B]].map(([key, snapshot]) => <div key={key}><h3>方案 {key}</h3><p>{snapshot ? describe(snapshot) : '尚未保存方案'}</p><div><button className="button secondary" disabled={!!error} onClick={() => store(key)}>当前设置存为 {key}</button>{snapshot && <button className="text-button" onClick={() => { changeConfig(next => Object.assign(next, copy(snapshot))); setSelectedSegment(0); setView('live'); }}>载入编辑</button>}</div></div>)}</div><div className="traffic-compare-actions"><button className="button primary" disabled={!!job || !A || !B} onClick={() => compare(false)}>运行 A / B 对照</button><button className="button secondary" disabled={!!job || !!error} onClick={() => compare(true)}>对照：全常规 vs 当前配比</button>{job && <button className="text-button" onClick={() => { cancelComparison(); setMessage('对照已取消。'); }}>取消计算</button>}</div>{job && <p role="status" className="traffic-help">正在计算 {job.completed} / {job.total} 次实验…</p>}
          {message && <p className="traffic-feedback" role="status">{message}</p>}
          {results && <ComparisonResults results={results} />}
          {!job && !results && <div className="traffic-compare-empty"><Icon name="road" size={30} /><h3>哪条路、哪种开法更快？</h3><p>保存两组方案，或直接比较全常规车流和当前风格配比。</p></div>}
        </section>}
      </main>
      <aside className="traffic-sidebar" aria-label="实验设置" data-expanded={settingsOpen}>
        <div className="traffic-property-heading"><h2>{settings === 'road' ? `路段 ${selectedSegment + 1} · ${kinds[section.kind]}` : settings === 'car' ? '车辆信息' : settings === 'traffic' ? '车流设置' : '我的跟车'}</h2><button className="traffic-settings-toggle" aria-expanded={settingsOpen} aria-controls="traffic-settings-content" onClick={() => setSettingsOpen(!settingsOpen)}>{settingsOpen ? '收起设置' : '调整设置'}</button></div>
        <div className="traffic-settings-tabs" role="group" aria-label="设置分类">{[['player', '跟车'], ['traffic', '车流'], ['road', '道路'], ...(selectedCar != null ? [['car', '车辆']] : [])].map(([value, label]) => <button key={value} aria-pressed={settings === value} onClick={() => { setSettings(value); setSettingsOpen(true); }}>{label}</button>)}</div>
        <div className="traffic-panel-body" ref={propertyBody} id="traffic-settings-content">{settings === 'road' ? <>
          {section && <section className="traffic-property"><label className="traffic-field">路段类型<select aria-label="路段类型" value={section.kind} onChange={e => editSegment('kind', e.target.value)}>{Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><Range title="路段长度" value={section.length} min={100} max={1500} step={50} unit=" m" onChange={value => editSegment('length', value)} />{['drop', 'add'].includes(section.kind) && <><Range title={section.kind === 'drop' ? '减少车道数' : '增加车道数'} value={section.change} min={1} max={5} onChange={value => editSegment('change', value)} /></>}{section.kind === 'toll' && <div className="traffic-toll-settings"><p className="traffic-help">入口 {road?.segments[selectedSegment]?.from.hi - road?.segments[selectedSegment]?.from.lo + 1 || '—'} 车道 → {section.tollBooths ?? road?.segments[selectedSegment]?.tollBooths ?? '—'} 个窗口 → {road?.segments[selectedSegment]?.lanes || '—'} 车道</p><Range title="收费窗口数" value={section.tollBooths ?? road?.segments[selectedSegment]?.tollBooths ?? 4} min={Math.max(road?.segments[selectedSegment]?.from.hi - road?.segments[selectedSegment]?.from.lo + 1 || 1, section.tollExitLanes ?? road?.segments[selectedSegment]?.lanes ?? 1)} max={12} unit=" 个" onChange={value => editSegment('tollBooths', value)} /><Range title="出口车道数" value={section.tollExitLanes ?? road?.segments[selectedSegment]?.lanes ?? 1} min={1} max={Math.min(6, section.tollBooths ?? road?.segments[selectedSegment]?.tollBooths ?? 6)} unit=" 条" onChange={value => editSegment('tollExitLanes', value)} />{Array.from({ length: section.tollBooths ?? road?.segments[selectedSegment]?.tollBooths ?? 1 }, (_, lane) => <div className="traffic-toll-lane" key={lane}><span>窗口 {lane + 1}</span><div className="traffic-segmented" role="group" aria-label={`收费车道 ${lane + 1}`}>{[['etc', 'ETC'], ['manual', '人工']].map(([type, label]) => <button key={type} aria-pressed={(section.tollLanes?.[lane] ?? 'etc') === type} onClick={() => changeConfig(next => { const segment = next.segments[selectedSegment]; segment.tollLanes = Array.from({ length: section.tollBooths ?? road?.segments[selectedSegment]?.tollBooths ?? 1 }, (_, i) => i === lane ? type : segment.tollLanes?.[i] ?? 'etc'); })}>{label}</button>)}</div></div>)}<Range title="ETC 处理时间" value={section.etcSeconds ?? 2} min={1} max={15} unit=" 秒" onChange={value => editSegment('etcSeconds', value)} /><Range title="人工处理时间" value={section.manualSeconds ?? 12} min={3} max={120} unit=" 秒" onChange={value => editSegment('manualSeconds', value)} /><p className="traffic-help">处理时间为实验参数；车辆均可使用两种窗口。进站按预计排队时间选择窗口，办理后汇入出口车道。</p></div>}{section.kind === 'merge' && <><Range title="汇入车辆数" value={section.rampCount ?? 0} min={0} max={config.count - 1} unit=" 辆" onChange={value => editSegment('rampCount', value)} /><Range title="匝道入口流量" value={section.rampFlow ?? 30} min={10} max={240} step={10} unit=" 辆/分钟" onChange={value => editSegment('rampFlow', value)} /><p className="traffic-help">计入总车辆数，主路入口车辆相应减少。</p></>}{section.kind === 'exit' && <><Range title="驶出车辆比例" value={section.exitPercent ?? 20} min={0} max={100} step={5} unit="%" onChange={value => editSegment('exitPercent', value)} /><p className="traffic-help">其他车辆提前靠向出口；未赶上出口时继续走主路。我的车保持主路行程。</p></>}{!['straight', 'toll'].includes(section.kind) && <><div className="traffic-field-label">{['merge', 'exit'].includes(section.kind) ? '匝道位于哪侧' : '变化发生在哪侧'}</div><div className="traffic-segmented" role="group" aria-label="车道变化侧">{[['left', '左侧'], ['right', '右侧']].map(([value, label]) => <button key={value} aria-pressed={section.side === value} onClick={() => editSegment('side', value)}>{label}</button>)}</div></>}<div className="traffic-road-signal"><label><input aria-label="路段红绿灯" type="checkbox" checked={!!section.signal?.enabled} onChange={event => editSignal('enabled', event.target.checked)} />红绿灯</label>{section.signal?.enabled && <><Range title="绿灯时长" value={section.signal.green ?? 30} min={5} max={120} step={5} unit=" 秒" onChange={value => editSignal('green', value)} /><Range title="红灯时长" value={section.signal.red ?? 30} min={5} max={120} step={5} unit=" 秒" onChange={value => editSignal('red', value)} /><div className="traffic-field-label">初始灯色 · 黄灯固定 3 秒</div><div className="traffic-segmented" role="group" aria-label="初始灯色">{[['green', '绿灯'], ['red', '红灯']].map(([value, label]) => <button key={value} aria-pressed={(section.signal.start ?? 'green') === value} onClick={() => editSignal('start', value)}>{label}</button>)}</div></>}</div><div className="traffic-section-actions"><button aria-label="路段前移" disabled={selectedSegment === 0} onClick={() => moveSegment(-1)}>前移</button><button aria-label="路段后移" disabled={selectedSegment === config.segments.length - 1} onClick={() => moveSegment(1)}>后移</button><button className="traffic-danger" disabled={config.segments.length === 1} onClick={removeSegment}>删除路段</button></div></section>}
<div className="traffic-road-assembly"><h3 className="traffic-assembly-heading">道路拼接</h3><label className="traffic-field">入口车道数<input aria-label="入口车道数" type="number" min="1" max="6" value={config.initialLanes} onChange={e => update('initialLanes', Number(e.target.value))} /></label>
          <div className="traffic-segment-list">{config.segments.map((s, i) => <button key={s.id} data-traffic-segment={i} aria-pressed={selectedSegment === i} onClick={() => chooseSegment(i)}><span className="traffic-segment-number">{i + 1}</span><div><strong>{kinds[s.kind]}</strong><small>{s.length} m {road ? `· ${road.segments[i].from.hi - road.segments[i].from.lo + 1}${!['drop', 'add'].includes(s.kind) ? ' 车道' : ` → ${road.segments[i].lanes} 车道`}` : ''}</small></div><span aria-hidden="true">→</span></button>)}</div>
          <div className="traffic-palette" role="group" aria-label="添加路段">{Object.entries(kinds).map(([kind, name]) => <button key={kind} data-add-road={kind} disabled={config.segments.length >= 10} onClick={() => addSegment(kind)}><Icon name="plus" size={13} />{name}</button>)}</div>

          <div className="traffic-example"><h3>快速开始</h3><button onClick={() => { changeConfig(next => { Object.assign(next, normalizeTrafficConfig(copy(DEFAULT_CONFIG))); next.initialLanes = 4; next.segments = [{ id: 'toll-plaza', kind: 'toll', length: 600, change: 1, side: 'right', tollBooths: 8, tollExitLanes: 4, tollLanes: Array(8).fill('etc') }, { id: 'toll-after', kind: 'straight', length: 300, change: 1, side: 'right' }]; }); setSelectedSegment(0); }}>4 → 8 个 ETC 窗口 → 4 车道</button><button onClick={() => { changeConfig(next => Object.assign(next, normalizeTrafficConfig(copy(DEFAULT_CONFIG)))); setSelectedSegment(0); }}>3 → 2 → 1 车道收窄</button><button onClick={() => { changeConfig(next => { Object.assign(next, normalizeTrafficConfig(copy(DEFAULT_CONFIG))); next.segments = [{ id: 'single', kind: 'straight', length: 950, change: 1, side: 'right' }]; }); setSelectedSegment(0); }}>3 车道直路基准</button></div>
</div>
        </> : settings === 'player' ? <PlayerPanel config={config} player={myCar} locked={!!state && !state.finished} onChoose={lane => update('playerLane', lane)} onChooseStyle={style => update('playerStyle', style)} onLaneChanges={value => update('playerLaneChanges', value)} onReset={reset} follow={followPlayer} onFollow={setFollowPlayer} attempts={attempts} /> : settings === 'car' ? (car ? <div className="traffic-selected-car"><span>车辆 {car.id}</span><strong>{fixed(car.v * 3.6)} km/h</strong><span>{`${car.isPlayer ? '我的车 · ' : ''}${drivingStyle(car.drivingStyle).label}`}</span><span>{car.change ? car.lastChange?.reason === 'mandatory' ? '车道结束汇入' : '主动变道' : car.v < .1 ? '停车等待' : car.acc < -1 ? '跟车减速' : '前进'}</span><button className="icon-button" aria-label="关闭车辆信息" onClick={() => { setSelectedCar(null); setSettings('player'); }}><Icon name="close" size={14} /></button></div> : <p className="traffic-help">车辆已通过出口。<button className="text-button" onClick={() => setSettings('player')}>返回跟车</button></p>) : <section className="traffic-basic-settings"><h2>放多少车，怎么开</h2><Range title="车辆数量" value={config.count} min={10} max={300} step={10} unit=" 辆" onChange={value => update('count', value)} /><section className="traffic-population"><h3>车流驾驶风格 <span>合计 100%</span></h3>{Object.entries(DRIVING_STYLES).map(([key, style]) => <Range key={key} title={`${style.label}占比`} value={trafficMix(config)[key]} min={0} max={100} step={1} unit="%" onChange={value => changeConfig(next => { next.driverMix = adjustTrafficMix(trafficMix(next), key, value); delete next.aggression; })} />)}<p className="traffic-help">调整一项，其余两项按比例分配。{config.playerLane == null ? '适用于全部模拟车辆。' : '仅用于其他车辆，我的风格单独设置。'}</p><p className="traffic-mix-counts">{Object.entries(DRIVING_STYLES).map(([key, style]) => <span key={key}>{style.label} {populationCounts[key]} 辆</span>)}</p></section><details className="traffic-advanced"><summary>高级参数</summary><Range title="入口流量" value={config.demand} min={10} max={240} step={10} unit=" 辆/分钟" onChange={value => update('demand', value)} help="车辆按该节奏尝试进入，入口堵塞时会等待。" /><Range title="期望速度" value={config.speed} min={20} max={120} step={5} unit=" km/h" onChange={value => update('speed', value)} /><label className="traffic-field">入口车道分布<select aria-label="入口车道分布" value={config.distribution} onChange={e => update('distribution', e.target.value)}><option value="equal">均匀分配</option><option value="left">偏向左侧</option><option value="right">偏向右侧</option></select></label><label className="traffic-field">随机种子<input aria-label="随机种子" type="number" min="1" max="999997" value={config.seed} onChange={e => update('seed', Number(e.target.value))} /></label><p className="traffic-help">相同种子保留相同车辆速度与入场顺序；改变风格配比，比较同一组车辆的表现。参数变更后本次模拟会重置。</p></details></section>}
          {error && <p className="traffic-error" role="alert">{error}</p>}
        </div>
      </aside>

    </div>
  </div>;
}
function ComparisonResults({ results }) {
  const a = aggregate(results.A), b = aggregate(results.B);
  const rows = [['通过车辆（均值）', 'completed', '辆'], ['完成 / 截止时间', 'time', 's'], ['在途平均速度', 'meanSpeed', 'km/h'], ['完成车辆平均用时', 'meanTrip', 's'], ['积极加塞次数', 'cutIns', '次'], ['明显减速次数', 'harshBrakes', '次']];
  if (results.A.some(r => r.player) || results.B.some(r => r.player)) rows.splice(4, 0, ['我的总用时（已到达均值）', 'playerTrip', 's']);
  return <div className="traffic-comparison-results"><h3>三次运行的平均结果</h3><p className="traffic-help">结果对应计算时保存的 A / B，种子 {results.seed}～{results.seed + 2}。</p><div className="traffic-lane-table"><table><thead><tr><th>指标</th><th>方案 A</th><th>方案 B</th><th>B − A</th></tr></thead><tbody>{rows.map(([label, key, unit]) => <tr key={key}><th>{label}</th><td>{fixed(a[key])} <small>{unit}</small></td><td>{fixed(b[key])} <small>{unit}</small></td><td>{a[key] == null || b[key] == null ? '—' : `${b[key] - a[key] > 0 ? '+' : ''}${fixed(b[key] - a[key])}`}</td></tr>)}</tbody></table></div><div className="traffic-comparison-config"><p>A：{describe(results.configs.A)}</p><p>B：{describe(results.configs.B)}</p></div>{(a.timeouts > 0 || b.timeouts > 0) && <p className="traffic-error">部分运行达到 30 分钟上限（A：{a.timeouts} 次，B：{b.timeouts} 次）。截止时间不是全部通过耗时；平均用时仅包含已通过车辆。</p>}<details><summary>查看每次结果，避免只看平均数</summary><div className="traffic-lane-table"><table><thead><tr><th>种子</th><th>A 通过 / 耗时</th><th>B 通过 / 耗时</th></tr></thead><tbody>{results.A.map((run, i) => <tr key={i}><th>{results.seed + i}</th><td>{run.completed} 辆 / {fixed(run.time)} s{run.timedOut ? '（截止）' : ''}</td><td>{results.B[i].completed} 辆 / {fixed(results.B[i].time)} s{results.B[i].timedOut ? '（截止）' : ''}</td></tr>)}</tbody></table></div></details><p className="traffic-help">若两组道路、车辆数量或入口流量不同，差值反映整个方案差异，不能只归因于加塞。此模型中的“常规”也允许收益足够大的正常变道。</p></div>;
}
