import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { createScene } from '../model.js';
import { sceneMarkup } from '../scene.js';

const WELCOME_KEY = 'crashpad:welcome:v1';
export function hasSeenWelcome() {
  try { return localStorage.getItem(WELCOME_KEY) === 'seen'; } catch { return false; }
}
function exampleMarkup(collision) {
  const scene = createScene();
  scene.cars[1] = { ...scene.cars[1], x: 365, y: 250, motion: 'changeLeft', start: { x: 460, y: 500 } };
  if (collision) {
    scene.road = 'cross';
    scene.cars[0] = { ...scene.cars[0], x: 355, y: 355, angle: 90, start: { x: 150, y: 355 } };
    scene.cars[1] = { ...scene.cars[1], x: 410, y: 305, motion: 'straight', start: { x: 410, y: 500 } };
    scene.collision = { x: 405, y: 350 };
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="160 100 480 450" aria-hidden="true">${sceneMarkup(scene, { grid: false })}</svg>`;
}
const examples = [
  { title: '突然变道', text: '我在直行，对方突然挤进来。遇到这种情况，该怎么应对？', svg: exampleMarkup(false) },
  { title: '车辆碰撞', text: '我从左侧驶来，对方从下方进入路口。双方当时是这样碰到的。', svg: exampleMarkup(true) },
];
export default function WelcomeDialog({ open, onClose }) {
  const dialog = useRef(null), startButton = useRef(null), [showExamples, setShowExamples] = useState(false);
  useEffect(() => {
    if (open && !dialog.current.open) { setShowExamples(false); dialog.current.showModal(); startButton.current?.focus(); }
    else if (!open && dialog.current.open) dialog.current.close();
  }, [open]);
  function close() {
    try { localStorage.setItem(WELCOME_KEY, 'seen'); } catch { /* The editor remains usable when browser storage is unavailable. */ }
    onClose();
  }
  return <dialog ref={dialog} className="welcome-dialog" aria-labelledby="welcome-title" aria-describedby="welcome-description" onCancel={e => { e.preventDefault(); close(); }}>
    <button className="icon-button welcome-close" aria-label="关闭使用说明" onClick={close}><Icon name="close" /></button>
    <div className="welcome-layout">
      <section className="welcome-copy">
        <div className="welcome-brand"><span className="brand-symbol"><Icon name="logo" size={21} /></span><strong>CrashPad</strong></div>
        <h1 id="welcome-title">碰到个傻 X，<br />必须给大家看看。</h1>
        <p id="welcome-description">突然加塞、恶意别车，还是撞了以后各说各话？<br />光打字讲不清，手画又费劲。把当时怎么走的画出来，发群里，让车友们一起看看。</p>
        <h2 className="welcome-steps-title" id="welcome-steps-title">只需 3 步，把傻 X 的行为画明白。</h2>
        <ol className="welcome-steps" aria-labelledby="welcome-steps-title"><li><span className="welcome-step-number">01</span><div><strong>选道路</strong><span>找到接近现场的路型</span></div></li><li><span className="welcome-step-number">02</span><div><strong>还原经过</strong><span>摆好车辆、行人，调整行动路线</span></div></li><li><span className="welcome-step-number">03</span><div><strong>导出分享</strong><span>导出图片或动图，发群里一起聊</span></div></li></ol>
        <div className="welcome-actions"><button className="button primary" ref={startButton} onClick={close}>画出来，给大家看看<span aria-hidden="true">→</span></button><button className="button secondary" aria-expanded={showExamples} aria-controls="welcome-examples" onClick={() => setShowExamples(!showExamples)}>{showExamples ? '返回介绍' : '先看个例子'}</button></div>
        <p className="welcome-footnote">随时可从顶部「使用说明」再次查看</p>
      </section>
      <section className="welcome-visual" aria-label={showExamples ? '场景示例' : '场景图预览'}>
        {showExamples ? <div id="welcome-examples" className="welcome-examples">{examples.map(example => <figure key={example.title}><div className="welcome-example-image" dangerouslySetInnerHTML={{ __html: example.svg }} /><figcaption><strong>{example.title}</strong><p>{example.text}</p></figcaption></figure>)}<p className="welcome-example-note">示例仅供参考，不会替换你的当前草稿。</p></div> : <>
          <div className="welcome-preview-label"><span className="welcome-live-dot" />把经过变成一张图</div>
          <div className="welcome-scene" dangerouslySetInnerHTML={{ __html: examples[0].svg }} />
          <div className="welcome-scene-caption"><span><i />A 我的车</span><span><i />B 对方车辆</span><span className="welcome-route-caption">虚线 · 已行驶路线</span></div>
          <div className="welcome-story"><span className="welcome-story-label">发群里，这样说</span><p>“我正常开着，他突然挤进来，<br />大家看看，是不是有毛病？”</p><span>位置、方向、路线，一张图交代清楚。</span></div>
        </>}
      </section>
    </div>
  </dialog>;
}
