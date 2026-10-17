import { mainEntryCount } from './roadEvents.js';
import { DRIVING_STYLES, drivingStyle, normalizePlayerConfig } from './drivingStyles.js';
export function duration(value) {
  if (value == null) return '—';
  const tenths = Math.round(value * 10);
  return `${Math.floor(tenths / 600)}:${((tenths % 600) / 10).toFixed(1).padStart(4, '0')}`;
}
export function experimentKey(config) {
  const { playerLane, playerStyle, playerLaneChanges, ...experiment } = config;
  return JSON.stringify(experiment);
}
const statuses = { upcoming: '还没轮到我', waiting: '正在入口排队', following: '正在跟随车流', arrived: '我已到达终点', timeout: '截止时仍未到达' };
export default function PlayerPanel({ config, player, locked, onChoose, onChooseStyle, onLaneChanges, onReset, follow, onFollow, attempts }) {
  const { playerStyle: style, playerLaneChanges: allowLaneChanges } = normalizePlayerConfig(config);
  const enabled = config.playerLane != null;
  const comparable = attempts.filter(attempt => attempt.experiment === experimentKey(config));
  return <section className={`traffic-player-panel ${player?.status === 'arrived' ? 'is-arrived' : ''}`} aria-label="我的跟车体验">
    <div className="traffic-player-heading"><div><h2>{player ? statuses[player.status] : '选择入口车道'}</h2></div><button className="text-button" disabled={locked} aria-pressed={!enabled} onClick={() => onChoose(null)}>只看车流</button></div>
    <div className="traffic-player-lanes" role="group" aria-label="选择我的入口车道">{Array.from({ length: config.initialLanes }, (_, lane) => <button key={lane} data-player-lane={lane} disabled={locked} aria-pressed={config.playerLane === lane} onClick={() => onChoose(lane)}><strong>车道 {lane + 1}</strong><span>{config.initialLanes === 1 ? '唯一车道' : lane === 0 ? '最左侧' : lane === config.initialLanes - 1 ? '最右侧' : '中间车道'}</span></button>)}</div>
    <p className="traffic-help">{enabled ? `第 ${Math.floor(mainEntryCount(config) / 2) + 1} 辆主路入场 · ${drivingStyle(style).label}` : '也可以选择「只看车流」，直接开始模拟。'}{locked ? ' 重置后可换车道。' : ''}</p>
    {enabled && <div className="traffic-driving-style"><h3>我的驾驶风格</h3><div role="group" aria-label="我的驾驶风格">{Object.entries(DRIVING_STYLES).map(([value, option]) => <button key={value} data-driving-style={value} aria-pressed={style === value} disabled={locked} onClick={() => onChooseStyle(value)}>{option.label}</button>)}</div><p>{drivingStyle(style).description}{locked ? ' 重置后可更换。' : ''}</p><label className="traffic-lane-change-toggle"><input type="checkbox" checked={allowLaneChanges} disabled={locked} onChange={event => onLaneChanges(event.target.checked)} />允许主动变道</label><p>{allowLaneChanges ? '按所选风格择机变道。' : '保持当前车道，仅在车道结束时汇入。'}</p><small className="traffic-style-note">分类参考驾驶研究，参数为模拟预设。</small></div>}
    {enabled && player && <>
      <div className="traffic-player-timing"><div><span>{player?.status === 'arrived' ? '我的总用时' : '我的用时'}</span><strong data-player-time>{duration(player?.elapsed ?? 0)}</strong></div><div><span>入口等待</span><strong>{duration(player?.waiting ?? 0)}</strong></div><div><span>路上行驶</span><strong>{duration(player?.driving ?? 0)}</strong></div></div>
      <p className="traffic-player-strategy">主动变道 {player.voluntaryChanges} 次 · 必需汇入 {player.laneChanges - player.voluntaryChanges} 次</p>
      <div className="traffic-player-footer"><span>{player?.status === 'upcoming' ? `距离我的计划入场还有 ${duration(player.countdown)}` : player?.status === 'arrived' ? `第 ${player.rank} 辆通过出口 · 入口选车道 ${config.playerLane + 1}` : player?.status === 'following' ? `当前 ${Math.round(player.speed)} km/h · 已走 ${Math.round(player.position)} m` : player?.status === 'waiting' ? '入口还没有足够空间，等待也计入总用时。' : player?.status === 'timeout' ? '尚未完成，不把截止时间当作抵达用时。' : '从计划入场时刻开始计时，暂停模拟也会暂停计时。'}</span>
        <label><input type="checkbox" checked={follow} onChange={e => onFollow(e.target.checked)} />跟随我的车</label>
      </div>
      {player?.status === 'arrived' && <button className="button primary" data-action="player-retry" onClick={onReset}>换条车道，再试一次</button>}
    </>}
    {comparable.length > 0 && <details className="traffic-player-history" open={player?.status === 'arrived'}><summary>相同参数下，我的体验记录</summary><div>{comparable.map(attempt => <span key={`${attempt.lane}-${attempt.style}-${attempt.laneChanges}`}>入口车道 {attempt.lane + 1} · {drivingStyle(attempt.style).label} · {attempt.laneChanges ? '择机变道' : '保持车道'}<strong>{duration(attempt.duration)}</strong></span>)}</div><p>使用同一入场顺序、同一辆车和同一随机种子；每次都是独立重跑。</p></details>}
  </section>;
}
