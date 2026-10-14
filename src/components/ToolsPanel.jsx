import Icon from './Icon.jsx';
import { ROADS, SPECIAL_ROADS, withRoad, signalConfig, signalDirections, SIGNAL_APPROACHES, PARTICIPANT_TYPES, addParticipant, participantName, participantColor } from '../model.js';
import { participantIcon } from '../participants.js';
import { roadMarkup } from '../scene.js';

export default function ToolsPanel({ scene, tool, palette, selected, chooseTool, chooseCar, mutate, locked }) {
  const signals = signalConfig(scene), approaches = signalDirections(scene);
  function add(type) { let id; mutate(s => { const next = addParticipant(s, type); id = next.cars.at(-1).id; Object.assign(s, next); }); chooseCar(id); }
  return <aside className="tools-panel" aria-label="左侧工具栏">
    <nav className="tool-rail" aria-label="绘图工具">
      {[['select', 'cursor', '选择'], ['road', 'road', '道路'], ['cars', 'car', '参与者'], ['collision', 'burst', '碰撞'], ['notes', 'note', '说明']].map(([id, icon, title]) => <button key={id} data-tool={id} title={title} aria-label={id === 'select' ? '选择和移动' : id === 'collision' ? '标记碰撞点' : title} aria-pressed={id === 'collision' ? tool === id : id === 'select' ? tool === id && palette === 'cars' : palette === id && tool !== 'collision'} onClick={() => chooseTool(id)}><Icon name={icon} /><span>{title}</span></button>)}
    </nav>
    <div className="tool-content">
      <div className="panel-title">{palette === 'road' ? '道路模板' : palette === 'notes' ? '事故说明' : '场景对象'}<span>工具</span></div>
      <div className="palette-content" inert={locked}>
        {palette === 'road' ? <>
          {[['基础道路', false], ['汇入与车道变化', true]].map(([label, advanced]) => <div className="road-category" key={label}><div className="palette-label">{label}</div><div className="road-grid">{Object.entries(ROADS).filter(([id]) => SPECIAL_ROADS.includes(id) === advanced).map(([id, title]) => <button key={id} className="road-option" data-road={id} aria-pressed={scene.road === id} onClick={() => { mutate(s => Object.assign(s, withRoad(s, id))); chooseCar('road'); }}><svg viewBox="0 0 800 600" aria-hidden="true" dangerouslySetInnerHTML={{ __html: `<rect width="800" height="600" fill="#f4f6f8"/>${roadMarkup(id, 2)}` }} /><span>{title}</span></button>)}</div></div>)}
          <p className="subtle-help">选择模板后，在右侧调整道路属性。点击画布对象可切换属性。</p>
        </> : palette === 'cars' ? <><div className="palette-label">添加参与者</div><div className="participant-tools">{Object.entries(PARTICIPANT_TYPES).map(([type, name]) => <button key={type} data-add-participant={type} onClick={() => add(type)}><Icon name={participantIcon({ type })} size={22} /><span>{name}</span><Icon name="plus" size={12} /></button>)}</div><p className="subtle-help">选择对象后，在右侧编辑名称、朝向和路线。</p></> : palette === 'notes' ? <p className="subtle-help">在右侧填写经过、地点和时间，导出时会一起保存。</p> : <p className="subtle-help">选择道路、车辆或红绿灯，在右侧调整对应属性。</p>}
      </div>
      <div className="objects-list"><div className="section-heading">场景对象<span>{scene.cars.length + 1 + (scene.collision ? 1 : 0) + (signals.enabled ? approaches.length : 0)}</span></div><button data-select="road" aria-label={`选择道路：${ROADS[scene.road]}`} aria-pressed={selected === 'road'} onClick={() => chooseCar('road')}><Icon name="road" size={14} /><span>{ROADS[scene.road]}</span></button>{scene.cars.map(c => <button key={c.id} data-select={c.id} title={participantName(c)} aria-pressed={selected === c.id} onClick={() => chooseCar(c.id)}><span className="object-dot" style={{ background: participantColor(c) }}>{c.id}</span><span>{participantName(c)}</span><Icon name={participantIcon(c)} size={14} /></button>)}{signals.enabled && approaches.map(direction => <button key={direction} data-select={`signal:${direction}`} aria-pressed={selected === `signal:${direction}`} onClick={() => chooseCar(`signal:${direction}`)}><i className={`signal-dot signal-dot-${signals[direction]}`} aria-hidden="true" /><span>{SIGNAL_APPROACHES[direction].slice(0, 2)}红绿灯</span></button>)}{scene.collision && <button onClick={() => chooseTool('collision')}><Icon name="burst" /><span>碰撞点</span></button>}</div>
      <div className="tool-tip">拖动圆点调整路线<br />方向键微移 · ⌘ / Ctrl Z 撤销</div>
    </div>
  </aside>;
}
