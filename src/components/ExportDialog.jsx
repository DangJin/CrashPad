import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { EXPORT_PRESETS, exportImage, downloadImage } from '../export.js';
import { downloadGif, gifDimensions } from '../gifExport.js';

export default function ExportDialog({ scene, onClose, notify }) {
  const dialog = useRef(null), controller = useRef(null);
  const [loading, setLoading] = useState(false);
  const [preset, setPreset] = useState('original'), [format, setFormat] = useState('png'), [scale, setScale] = useState(1);
  const [replayMode, setReplayMode] = useState('full'), [progress, setProgress] = useState(0), [generated, setGenerated] = useState(0);
  const gif = format === 'gif';
  const options = { preset, format, scale, replayMode, progress: gif ? progress : null };
  const dimensions = scene && gif ? gifDimensions(scene, options) : null;
  function close() { controller.current?.abort(); onClose(); }
  useEffect(() => { if (!scene || !gif || loading) return; const start = performance.now(), duration = replayMode === 'full' ? 8000 : 4000; const timer = setInterval(() => setProgress(((performance.now() - start) % duration) / duration), 100); return () => clearInterval(timer); }, [scene, gif, replayMode, loading]);
  useEffect(() => () => controller.current?.abort(), []);
  const output = scene ? exportImage(scene, options) : null;
  useEffect(() => {
    if (scene && !dialog.current.open) dialog.current.showModal();
    if (!scene) { controller.current?.abort(); if (dialog.current.open) dialog.current.close(); }
  }, [scene]);
  async function download() {
    setLoading(true); setGenerated(0); controller.current = new AbortController();
    try { if (gif) await downloadGif(scene, options, { signal: controller.current.signal, onProgress: setGenerated }); else await downloadImage(scene, options); notify('图片已生成，请查看下载文件'); }
    catch (error) { if (error.name !== 'AbortError') notify('图片生成失败，请重试或换用支持下载的浏览器'); }
    finally { setLoading(false); }
  }
  return <dialog id="preview" ref={dialog} aria-labelledby="preview-title" onCancel={e => { e.preventDefault(); close(); }} onClick={e => { if (e.target === dialog.current) { const r = dialog.current.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(); } }}><div className="dialog-head"><h2 id="preview-title">导出示意图</h2><button className="icon-button" id="close-preview" aria-label="关闭预览" onClick={close}><Icon name="close" /></button></div><div className="export-settings"><label htmlFor="export-ratio">图片比例<select id="export-ratio" value={preset} disabled={loading} onChange={e => setPreset(e.target.value)}>{Object.entries(EXPORT_PRESETS).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}</select></label><label htmlFor="export-format">文件格式<select id="export-format" value={format} disabled={loading} onChange={e => setFormat(e.target.value)}><option value="png">PNG · 清晰线条</option><option value="jpg">JPG · 较小文件</option><option value="gif">GIF · 动画</option></select></label><label htmlFor="export-quality">清晰度<select id="export-quality" value={scale} disabled={loading} onChange={e => setScale(Number(e.target.value))}><option value="1">标准</option><option value="2">{gif ? '高清 · 长边 1440' : '高清 · 2 倍尺寸'}</option></select></label></div>{gif && <div className="field gif-settings"><label htmlFor="gif-mode">动画内容</label><select id="gif-mode" value={replayMode} disabled={loading} onChange={e => setReplayMode(e.target.value)}><option value="full">完整演示：已行驶 → 后续动作</option><option value="actual">已行驶路线</option><option value="planned">后续动作（计划）</option></select><p className="subtle-help">循环播放 · 标准长边 960 px · 后续动作仅为计划演示</p></div>}<div className="export-info"><span id="export-dimensions">{output ? `${dimensions?.width || output.width} × ${dimensions?.height || output.height} px` : ''}</span><span>完整适配 · 不裁切</span></div><div id="preview-image" dangerouslySetInnerHTML={{ __html: output?.svg || '' }} /><p className="dialog-note">请确认位置和方向符合你的描述。示意图不代表事故责任认定。</p><div className="dialog-actions"><button className="button secondary" id="back-edit" onClick={close}>{loading ? '取消生成' : '继续编辑'}</button><button className="button primary" id="download" disabled={loading} onClick={download}><Icon name="download" />{loading ? gif ? `正在生成 GIF… ${generated}%` : '正在生成图片…' : `下载 ${format.toUpperCase()} 图片`}</button></div></dialog>;
}
