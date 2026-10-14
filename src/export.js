import { exportSvg, sceneTitle } from './scene.js';
import { socialExportSvg } from './socialExport.js';

export const EXPORT_PRESETS = {
  original: { label: '原图 · 自动比例' },
  xiaohongshu: { label: '小红书 · 3:4', width: 1080, height: 1440 },
  douyin: { label: '抖音竖屏 · 9:16', width: 1080, height: 1920 },
  square: { label: '方形 · 1:1', width: 1080, height: 1080 },
  landscape: { label: '横图 · 4:3', width: 1440, height: 1080 },
  widescreen: { label: '宽屏 · 16:9', width: 1920, height: 1080 },
};

// Fit the complete diagram, including notes, without stretching or cropping.
export function exportImage(scene, { preset = 'original', scale = 1, progress = null, replayMode = 'actual' } = {}) {
  const sceneOptions = { progress, replayMode };
  const source = exportSvg(scene, sceneOptions);
  const sourceHeight = Number(source.match(/height="(\d+)"/)[1]);
  const config = EXPORT_PRESETS[preset] || EXPORT_PRESETS.original;
  const width = config.width || 1760, height = config.height || sourceHeight * 2;
  const multiplier = scale === 2 ? 2 : 1;
  if (preset === 'xiaohongshu' || preset === 'douyin') return {
    width: width * multiplier, height: height * multiplier, svg: socialExportSvg(scene, preset, sceneOptions),
  };
  if (!config.width) return { width: width * multiplier, height: height * multiplier, svg: source };
  const margin = 32, fit = Math.min((width - margin * 2) / 880, (height - margin * 2) / sourceHeight);
  const x = (width - 880 * fit) / 2, y = (height - sourceHeight * fit) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="white"/><g transform="translate(${x} ${y}) scale(${fit})">${source}</g></svg>`;
  return { width: width * multiplier, height: height * multiplier, svg };
}

export async function downloadImage(scene, options = {}) {
  const output = exportImage(scene, options), jpeg = options.format === 'jpg';
  const url = URL.createObjectURL(new Blob([output.svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = output.width; canvas.height = output.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, jpeg ? 'image/jpeg' : 'image/png', .95));
    if (!blob) throw new Error('Image unavailable');
    const downloadUrl = URL.createObjectURL(blob), link = document.createElement('a');
    const filename = sceneTitle(scene).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').slice(0, 60);
    link.href = downloadUrl; link.download = `CrashPad-${filename}-${output.width}x${output.height}-${new Date().toISOString().slice(0, 10)}.${jpeg ? 'jpg' : 'png'}`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 30000);
  } finally { URL.revokeObjectURL(url); }
}

export const downloadPng = scene => downloadImage(scene);
