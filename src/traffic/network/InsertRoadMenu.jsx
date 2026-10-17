import RoadIcon from './RoadIcon.jsx';
import Icon from '../../components/Icon.jsx';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const templates = [['straight', '直路'], ['drop', '车道减少'], ['add', '车道增加'], ['merge', '匝道汇入'], ['exit', '匝道汇出'], ['toll', '收费站']];

export default function InsertRoadMenu({ target, onClose, onInsert }) {
  const menu = useRef(null), [position, setPosition] = useState(null);
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const element = menu.current, stage = element.parentElement.getBoundingClientRect();
    const canvas = element.parentElement.querySelector('[data-network-canvas]').getBoundingClientRect();
    const box = element.getBoundingClientRect(), margin = 8;
    const left = Math.max(canvas.left, 0) + margin, right = Math.min(canvas.right, innerWidth) - margin;
    const top = Math.max(canvas.top, 0) + margin, bottom = Math.min(canvas.bottom, innerHeight) - margin;
    let x = target.anchor.x + margin, y = target.anchor.y + margin;
    if (x + box.width > right) x = target.anchor.x - box.width - margin;
    if (y + box.height > bottom) y = target.anchor.y - box.height - margin;
    x = Math.max(left, Math.min(x, right - box.width));
    y = Math.max(top, Math.min(y, bottom - box.height));
    setPosition({ left: x - stage.left, top: y - stage.top });
  }, [target]);
  useEffect(() => {
    const outside = event => { if (!menu.current.contains(event.target)) close.current(); };
    const key = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); } };
    const dismiss = () => close.current();
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', key, true);
    document.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, []);
  return <div ref={menu} className="network-insert-menu" role="dialog" aria-label="添加路段" style={{ ...position, visibility: position ? 'visible' : 'hidden' }}>
    <div className="network-insert-heading"><span>{target.type === 'road' ? '插入路段' : '继续道路'}</span><button aria-label="关闭添加路段" onClick={onClose}><Icon name="close" size={14}/></button></div>
    {templates.map(([kind, label]) => <button className={['merge', 'toll'].includes(kind) ? 'network-insert-item has-divider' : 'network-insert-item'} key={kind} onClick={() => onInsert(kind, target)}>
      <RoadIcon type={kind}/>
      <span>{label}</span>
    </button>)}
  </div>;
}
