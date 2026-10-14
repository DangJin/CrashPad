import { exportImage } from './export.js';
import { sceneTitle } from './scene.js';

export function gifDimensions(scene, options) {
  const output = exportImage(scene, { ...options, scale: 1 });
  const factor = Math.min(1, (options.scale === 2 ? 1440 : 960) / Math.max(output.width, output.height));
  return { width: Math.round(output.width * factor), height: Math.round(output.height * factor) };
}

export async function downloadGif(scene, options, { signal, onProgress = () => {} } = {}) {
  const worker = new Worker(new URL('./gif.worker.js', import.meta.url), { type: 'module' });
  const { width, height } = gifDimensions(scene, options);
  const mode = options.replayMode || 'full', steps = mode === 'full' ? 80 : 40;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const abortError = () => new DOMException('Cancelled', 'AbortError');
  function request(data, transfer = []) {
    return new Promise((resolve, reject) => {
      function clean() { worker.onmessage = null; worker.onerror = null; signal?.removeEventListener('abort', abort); }
      function abort() { clean(); reject(abortError()); }
      if (signal?.aborted) return reject(abortError());
      worker.onmessage = ({ data }) => { clean(); data.error ? reject(new Error(data.error)) : resolve(data); };
      worker.onerror = e => { clean(); reject(new Error(e.message)); };
      signal?.addEventListener('abort', abort, { once: true }); worker.postMessage(data, transfer);
    });
  }
  try {
    if (!context) throw new Error('Canvas unavailable');
    for (let frame = 0; frame <= steps; frame++) {
      if (signal?.aborted) throw abortError();
      const output = exportImage(scene, { ...options, scale: 1, progress: frame / steps, replayMode: mode });
      const url = URL.createObjectURL(new Blob([output.svg], { type: 'image/svg+xml;charset=utf-8' }));
      try {
        const image = new Image();
        await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
        context.fillStyle = '#fff'; context.fillRect(0, 0, width, height); context.drawImage(image, 0, 0, width, height);
      } finally { URL.revokeObjectURL(url); }
      const rgba = context.getImageData(0, 0, width, height).data;
      await request({ rgba: rgba.buffer, width, height, delay: frame === steps ? 800 : mode === 'full' && frame === steps / 2 ? 600 : 100 }, [rgba.buffer]);
      onProgress(Math.round((frame + 1) / (steps + 1) * 100));
    }
    const { bytes } = await request({ type: 'finish' });
    if (signal?.aborted) throw abortError();
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/gif' })), link = document.createElement('a');
    const filename = sceneTitle(scene).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-');
    link.href = url; link.download = `CrashPad-${filename}-${width}x${height}.gif`; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } finally { worker.terminate(); }
}
