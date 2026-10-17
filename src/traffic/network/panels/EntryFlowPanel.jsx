import NumberField from '../NumericField.jsx';
import RangeNumberField from '../RangeNumberField.jsx';
export default function EntryFlowPanel({entry,sinks,demandFor,editDemand,mixDestination}) {
 if (!entry) return <p>请添加入口对象。</p>;
 const d=demandFor(entry.id);
 return <><NumberField title="入口车辆数" value={d.count} max={300} onChange={v => editDemand(entry.id, d => { d.count = v; })}/><NumberField title="入口流量（辆/分钟）" value={d.flow} min={1} max={240} onChange={v => editDemand(entry.id, d => { d.flow = v; })}/><div className="network-options" role="group" aria-label="入口车道分布">{[['equal', '均匀'], ['left', '偏左侧'], ['right', '偏右侧']].map(([value, label]) => <button key={value} aria-pressed={(d.distribution || 'equal') === value} onClick={() => editDemand(entry.id, d => { d.distribution = value; })}>{label}</button>)}</div><section className="network-section"><h3>目的地比例 <span>合计 {Object.values(d.destinations).reduce((a, b) => a + b, 0)}%</span></h3>{sinks.map(n => <RangeNumberField key={n.id} title={`到${n.name || n.id}（%）`} value={d.destinations[n.id] || 0} max={100} onChange={v => mixDestination(entry.id, n.id, Math.max(0, Math.min(100, v)))}/>)}<p className="traffic-help">调整一项，其余目的地按比例分配。掉头需先在路口车道允许方向中开启，再选择返回入口的路线。</p><button className="text-button" onClick={() => editDemand(entry.id, d => { d.destinations = { [entry.id]: 100 }; })}>全部返回该入口（掉头实验）</button></section></>;
}
