import { useState } from 'react';
import { duration } from '../PlayerPanel.jsx';
import './NetworkDashboard.css';

function SpeedTrend({ snapshot }) {
  const samples = (snapshot?.samples || []).filter(sample => Number.isFinite(sample.time) && Number.isFinite(sample.speed));
  const first = samples[0]?.time, last = samples.at(-1)?.time;
  const maximum = Math.max(20, Math.ceil(Math.max(0, ...samples.map(sample => sample.speed)) / 20) * 20);
  const points = samples.map(sample => `${34 + (sample.time - first) / Math.max(1, last - first) * 314},${68 - Math.max(0, sample.speed) / maximum * 54}`).join(' ');
  return <div className="network-trend">
    <div className="network-trend-heading"><span>在途车辆均速</span><span>{samples.length > 1 ? `${duration(first)} — ${duration(last)}` : '等待采样'}</span></div>
    {samples.length > 1 ? <svg viewBox="0 0 360 92" role="img" aria-label={`路网实时速度趋势，${duration(first)}至${duration(last)}，纵轴 0 至 ${maximum} km/h`}>
      <text x="0" y="10" fill="currentColor" fontSize="10">km/h</text>
      {[0, maximum / 2, maximum].map(value => {
        const y = 68 - value / maximum * 54;
        return <g key={value}><path d={`M34 ${y}H348`} stroke="currentColor" opacity=".16"/><text x="28" y={y + 4} fill="currentColor" fontSize="11" textAnchor="end">{value}</text></g>;
      })}
      <polyline points={points} fill="none" stroke="var(--blue, #245bdb)" strokeWidth="2" strokeLinejoin="round"/>
      <text x="34" y="87" fill="currentColor" fontSize="11">{duration(first)}</text><text x="348" y="87" fill="currentColor" fontSize="11" textAnchor="end">{duration(last)}</text>
    </svg> : <p className="network-trend-empty">{snapshot ? '采集两个时间点后显示速度趋势。' : '开始模拟后显示速度趋势。'}</p>}
  </div>;
}

export default function NetworkDashboard({ snapshot, net, config, nodes, sources, demandFor }) {
  const [expanded, setExpanded] = useState(false);
  const stats = snapshot?.stats;
  const pending = stats?.pending ?? config.demand.reduce((sum, demand) => sum + demand.count, 0);
  return <details className="network-dashboard" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary><strong>实时仪表盘</strong><span>通过 {stats?.completed || 0} / {net?.total ?? '—'}</span><span>排队 {stats?.queued || 0}</span><span>待入场 {pending}</span><span>均速 {stats ? (stats.meanSpeed || 0).toFixed(1) : '—'} km/h</span><span>平均用时 {stats?.meanTrip == null ? '—' : duration(stats.meanTrip)}</span>{!!stats?.failed && <span className="network-warning">路线未完成 {stats.failed}</span>}</summary>
    <div className="network-dashboard-body">
      <table aria-label="各入口实时车辆统计"><thead><tr><th scope="col">入口</th><th scope="col">在途</th><th scope="col">待入场</th><th scope="col">已通过</th></tr></thead><tbody>{sources.map(node => {
        const row = snapshot?.entries?.find(entry => entry.id === node.id);
        return <tr key={node.id}><th scope="row">{node.name || node.id}</th><td>{row?.active || 0}</td><td>{row?.pending ?? demandFor(node.id).count}</td><td>{row?.completed || 0}</td></tr>;
      })}</tbody></table>
      <div><SpeedTrend snapshot={snapshot}/><div className="network-exits">{snapshot?.exits?.filter(exit => exit.completed > 0).map(exit => <span key={exit.id}>{nodes[exit.id]?.name || exit.id} 出口 {exit.completed}</span>)}</div></div>
      {!!snapshot?.failedRoutes?.length && <details className="network-failures"><summary>查看未完成路线</summary>{snapshot.failedRoutes.map(car => <p key={car.id}>车辆 {car.id}：{nodes[car.origin]?.name || car.origin} → {nodes[car.destination]?.name || car.destination} · {car.reason}</p>)}</details>}
    </div>
  </details>;
}
