import { participantGlyph } from '../participants.js';

export default function DamagePicker({ car, onChange }) {
  return <div className="damage-picker"><div className="damage-map" role="group" aria-label="选择车辆受损部位">{[['front', '车头'], ['left', '左侧'], ['right', '右侧'], ['rear', '车尾']].map(([part, name]) => <button key={part} className={`damage-part damage-${part}`} data-damage-part={part} aria-label={`${name}受损`} aria-pressed={car.damage === part} onClick={() => onChange(car.damage === part ? '' : part)}>{name}</button>)}<svg className="damage-car" viewBox="-45 -65 90 130" aria-hidden="true" dangerouslySetInnerHTML={{ __html: participantGlyph(car) }} /></div><button className="button secondary damage-clear" data-damage-part="none" aria-pressed={!car.damage} onClick={() => onChange('')}>未标记 / 清除</button><p className="subtle-help">按车身部位选择；再次点击已选部位可取消。</p></div>;
}
