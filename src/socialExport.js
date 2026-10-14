import { MOTIONS, planLabel, roadDescription, participantName, participantColor, participantExportName } from './model.js';
import { escapeXml, sceneMarkup, sceneTitle } from './scene.js';

function wrap(text, count) {
  return String(text).split('\n').flatMap(line => {
    const chars = Array.from(line);
    return chars.length ? Array.from({ length: Math.ceil(chars.length / count) }, (_, i) => chars.slice(i * count, (i + 1) * count).join('')) : [''];
  });
}
const text = (value, x, y, size, color = '#35465d', weight = 400) => `<text data-export-text="true" x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}">${escapeXml(value)}</text>`;

// Portrait exports typeset their content at output resolution rather than
// shrinking a landscape report into a tall blank page.
export function socialExportSvg(scene, preset, sceneOptions = {}) {
  const tall = preset === 'douyin', width = 1080, height = tall ? 1920 : 1440;
  const margin = 56, contentWidth = width - margin * 2;
  const title = sceneTitle(scene);
  const titleSize = title.length > 28 ? (tall ? 52 : 48) : tall ? 72 : 64, bodySize = tall ? 34 : 30;
  const titleLines = wrap(title, Math.floor(contentWidth / titleSize) - 1);
  const titleOffset = (titleLines.length - 1) * (titleSize + 12);
  const noteSize = scene.note.length > 400 ? 24 : scene.note.length > 220 ? 28 : tall ? 36 : 32;
  const metadata = wrap([roadDescription(scene), scene.location.trim(), scene.date?.trim().replace('T', ' ')].filter(Boolean).join(' · '), 32);
  const noteLines = scene.note.trim() ? wrap(scene.note.trim(), Math.floor(contentWidth / noteSize) - 1) : [];
  const cardWidth = tall ? contentWidth : (contentWidth - 24) / 2;
  const damageNames = { front: '车头', rear: '车尾', left: '左侧', right: '右侧' };
  const cards = scene.cars.map(car => [
    `已行驶：${MOTIONS[car.motion]}`,
    ...(car.plan ? [`后续：计划${planLabel(car.plan)}（未发生）`] : []),
    ...(car.damage ? [`受损：${damageNames[car.damage]}`] : []),
  ].flatMap(line => wrap(line, Math.floor((cardWidth - 48) / bodySize))));
  const cardTitles = scene.cars.map(car => wrap(`${car.id}  ${participantExportName(car)}`, Math.floor((cardWidth - 48) / 36) - 1));
  const cardHeights = cards.map((lines, i) => 84 + (cardTitles[i].length - 1) * 44 + lines.length * (bodySize + 12));
  const columns = tall ? 1 : 2, rowHeights = [];
  cardHeights.forEach((height, i) => { const row = Math.floor(i / columns); rowHeights[row] = Math.max(rowHeights[row] || 0, height); });
  const cardsHeight = rowHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, rowHeights.length - 1) * 20;
  const headerHeight = (tall ? 264 : 230) + titleOffset + (metadata.length - 1) * 36;
  const noteHeight = noteLines.length ? 66 + noteLines.length * (noteSize + 12) : 0;
  const footerHeight = tall ? 160 : 100;
  const diagramHeight = Math.max(280, Math.min(tall ? 860 : 726, height - headerHeight - cardsHeight - noteHeight - footerHeight - 92));
  const totalHeight = headerHeight + diagramHeight + cardsHeight + noteHeight + footerHeight + 92;
  // Exceptionally long metadata still fits without silently dropping text.
  const fit = Math.min(1, height / totalHeight);
  let markup = text('CrashPad / 事故现场记录', margin, tall ? 66 : 50, 22, '#65748a', 500);
  titleLines.forEach((line, i) => { markup += text(line, margin, (tall ? 158 : 132) + i * (titleSize + 12), titleSize, '#1f3049', 700); });
  metadata.forEach((line, i) => { markup += text(line, margin, (tall ? 228 : 198) + titleOffset + i * 36, 28, '#65748a'); });
  let y = headerHeight;
  markup += `<rect x="${margin}" y="${y}" width="${contentWidth}" height="${diagramHeight}" rx="18" fill="#f4f6fa"/><svg data-social-canvas="true" x="${margin}" y="${y}" width="${contentWidth}" height="${diagramHeight}" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid meet">${sceneMarkup(scene, { grid: false, ...sceneOptions, hideUnknownSignals: true })}</svg>`;
  y += diagramHeight + 28;
  scene.cars.forEach((car, i) => {
    const row = Math.floor(i / columns), x = margin + (i % columns) * (cardWidth + 24), cardY = y + rowHeights.slice(0, row).reduce((sum, height) => sum + height + 20, 0);
    markup += `<rect x="${x}" y="${cardY}" width="${cardWidth}" height="${rowHeights[row]}" rx="14" fill="${participantColor(car)}" fill-opacity=".055"/>`;
    cardTitles[i].forEach((line, index) => { markup += text(line, x + 24, cardY + 48 + index * 44, 36, participantColor(car), 700); });
    cards[i].forEach((line, index) => { markup += text(line, x + 24, cardY + 94 + (cardTitles[i].length - 1) * 44 + index * (bodySize + 12), bodySize); });
  });
  y += cardsHeight + 36;
  if (noteLines.length) markup += text('现场说明', margin, y + 34, 32, '#1f3049', 700);
  noteLines.forEach((line, i) => { markup += text(line, margin, y + 84 + i * (noteSize + 12), noteSize); });
  const footerY = Math.max(totalHeight - footerHeight + 60, height - footerHeight);
  markup += `<path d="M${margin} ${footerY - 34}H${width - margin}" stroke="#e1e7ef" stroke-width="2"/>`;
  markup += text('依据绘制者描述生成，位置与距离为示意。', margin, footerY, 22, '#65748a');
  markup += text('不代表事故责任认定。', margin, footerY + 32, 22, '#65748a');
  return `<svg xmlns="http://www.w3.org/2000/svg" data-export-layout="${preset}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="white"/><g font-family="PingFang SC, Microsoft YaHei, sans-serif" transform="scale(${fit})">${markup}</g></svg>`;
}
