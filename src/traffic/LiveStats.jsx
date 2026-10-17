import { laneLabel } from './laneLabel.js';

export default function LiveStats({ rows, stats, total, samples, speedLimit, merges }) {
  const maxSpeed = Math.max(speedLimit, 10);
  const clock = value => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
  const speed = samples.length ? stats.meanSpeed.toFixed(1) : '—';
  const completedTime = stats.meanTrip == null ? '—' : clock(stats.meanTrip);
  return <details className="traffic-live-stats" open>
    <summary><span>实时仪表盘</span><span className="traffic-dashboard-overview" aria-label="整体运行概况">
      <span title="已通过出口的车辆数量"><span>已通过</span> <strong data-overall-completed>{stats.completed} / {total}</strong></span>
      <span title="按车辆在途时间加权的平均速度">均速 <strong>{speed}</strong> km/h</span>
      <span title="当前速度低于 5 km/h 的在途车辆">排队 <strong>{stats.queued}</strong></span>
      <span className="traffic-dashboard-extra" title="包含未到入场时间和入口外等待车辆">待进入 <strong>{stats.pending}</strong></span>
      <span className="traffic-dashboard-extra" title="仅统计已通过车辆，包含入口等待">完成均时 <strong data-overall-trip>{completedTime}</strong></span>
    </span><span className="traffic-live-stats-toggle" aria-hidden="true" /></summary>
    <div className="traffic-dashboard-content">
    <div className="traffic-live-stats-body" role="region" aria-label="实时车道统计" tabIndex="0">
      <table><thead><tr><th>车道</th><th>在途</th><th>均速 <small>km/h</small></th><th>排队</th><th title="按当前车道归属统计的历史均速">累计均速</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.lane} data-live-lane={row.lane}><th scope="row">{laneLabel(row.lane)}</th><td data-live-count>{row.count}</td><td data-live-speed>{row.speed == null ? '—' : row.speed.toFixed(1)}</td><td>{row.queued}</td><td>{row.mean == null ? '—' : row.mean.toFixed(1)}</td></tr>)}</tbody>
      </table>
    </div>
    <section className="traffic-live-trend" aria-label="速度趋势">
      <div className="traffic-live-trend-heading"><h3>在途车辆均速 <small>km/h</small></h3><span>{samples.length ? `${clock(samples[0].time)} — ${clock(samples.at(-1).time)}` : '运行后显示'}</span></div>
      <div className="traffic-live-trend-plot"><div className="traffic-live-trend-axis" aria-hidden="true"><span>{maxSpeed}</span><span>{maxSpeed / 2}</span><span>0</span></div><svg viewBox="0 0 600 90" preserveAspectRatio="none" role="img" aria-label="在途车辆平均速度趋势">
        <path d="M0 10H600M0 42H600M0 74H600" stroke="#52657f" strokeOpacity=".18" fill="none" vectorEffect="non-scaling-stroke" />
        {samples.length > 1 && <path data-live-trend d={samples.map((sample, index) => `${index ? 'L' : 'M'}${index / (samples.length - 1) * 600} ${74 - Math.min(1, sample.speed / maxSpeed) * 64}`).join(' ')} fill="none" stroke="#245bdb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
      </svg></div>
    </section>
    </div>
    <div className="traffic-dashboard-behavior" aria-label="驾驶行为统计"><span>积极加塞 <strong>{stats.cutIns}</strong> 次</span><span title="减速度超过 3 m/s² 的一次连续事件">明显减速 <strong>{stats.harshBrakes}</strong> 次</span><span title="因车道结束而进行的必要汇入，单独计数">必需汇入 <strong>{merges}</strong> 次</span>{(stats.rampActive > 0 || stats.rampExited > 0 || stats.missedExits > 0) && <span>支路中 {stats.rampActive} 辆 · 匝道驶出 {stats.rampExited} 辆 · 错过出口 {stats.missedExits} 辆</span>}<span>排队：低于 5 km/h</span></div>
  </details>;
}
