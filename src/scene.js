import { WIDTH, HEIGHT, MOTIONS, SPECIAL_ROADS, roadDescription, pathFor, plannedPathFor, planLabel, samplePath, carAtProgress, carAtPlannedProgress, signalDirections, signalConfig, SIGNAL_APPROACHES, SIGNAL_STATES, signalAngle, carAtFullProgress, participantColor, participantType, participantName, participantExportName } from './model.js';
import { participantGlyph } from './participants.js';
import { specialRoadMarkup } from './roads.js';

export const escapeXml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
export function roadMarkup(road, lanes = 2, options = {}) {
  if (SPECIAL_ROADS.includes(road)) return specialRoadMarkup(road, lanes, options);
  const w = lanes * 95 + 48, left = 400 - w / 2, right = 400 + w / 2;
  const line = (x1, y1, x2, y2, dash = false) => `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${dash ? '#fff' : '#a6b09d'}" stroke-width="${dash ? 3 : 2}" ${dash ? 'stroke-dasharray="18 18"' : ''}/>`;
  const surface = '#e3e7ec';
  if (road === 'parking') {
    return `<rect x="100" y="65" width="600" height="470" rx="12" fill="${surface}" stroke="#c2cad3" stroke-width="3"/>${[0, 1, 2, 3, 4].map(i => `<path d="M${110 + i * 116} 75v125h116V75 M${110 + i * 116} 525V400h116v125" fill="none" stroke="white" stroke-width="4"/>`).join('')}<text x="400" y="320" text-anchor="middle" fill="#a0aaba" font-size="22" font-family="sans-serif">停车通道</text>`;
  }
  const junction = road === 'cross' || road === 'tee';
  const top = 300 - w / 2, bottom = 300 + w / 2;
  const shape = road === 'cross' ? `M${left} 0H${right}V${top}H800V${bottom}H${right}V600H${left}V${bottom}H0V${top}H${left}Z` : road === 'tee' ? `M0 ${top}H800V${bottom}H${right}V600H${left}V${bottom}H0Z` : `M${left} 0H${right}V600H${left}Z`;
  let marks = '';
  for (let i = 1; i < lanes; i++) {
    const x = left + 24 + i * 95;
    marks += junction ? `${road === 'cross' ? line(x, 0, x, top - 20, true) : ''}${line(x, bottom + 20, x, 600, true)}${line(0, top + 24 + i * 95, left - 20, top + 24 + i * 95, true)}${line(right + 20, top + 24 + i * 95, 800, top + 24 + i * 95, true)}` : line(x, 0, x, 600, true);
  }
  const edge = junction ? '' : `${line(left + 14, 0, left + 14, 600)}${line(right - 14, 0, right - 14, 600)}`;
  const crossing = junction ? [left - 42, right + 18].map(x => Array.from({ length: Math.max(4, lanes * 3) }, (_, i) => `<rect x="${x}" y="${top + 15 + i * (w - 30) / (lanes * 3)}" width="24" height="10" rx="1" fill="#fff"/>`).join('')).join('') : '';
  return `<path d="${shape}" fill="${surface}" stroke="#c7cfd8" stroke-width="3"/>${marks}${edge}${crossing}`;
}
export function signalsMarkup(scene, { interactive = false, selected = null, hideUnknownSignals = false } = {}) {
  const config = signalConfig(scene);
  if (!config.enabled) return '';
  const halfWidth = (scene.lanes * 95 + 48) / 2;
  const positions = {
    north: [400 + halfWidth + 42, 300 - halfWidth - 50],
    east: [400 + halfWidth + 66, 300 + halfWidth + 40],
    south: [400 - halfWidth - 42, 300 + halfWidth + 50],
    west: [400 - halfWidth - 66, 300 - halfWidth - 40],
  };
  const colors = { red: '#e64b50', yellow: '#f5be38', green: '#35b87d' };
  return signalDirections(scene).filter(direction => !hideUnknownSignals || config[direction] !== 'unknown').map(direction => {
    const angle = signalAngle(scene, direction);
    const state = config[direction], [px, py] = positions[direction];
    const x = Math.max(60, Math.min(direction === 'north' ? 680 : 740, px)), y = Math.max(44, Math.min(532, py));
    return `<g data-signal-direction="${direction}" data-signal-state="${state}" transform="translate(${x} ${y})" ${interactive ? `class="signal-object" tabindex="0" role="button" aria-label="${SIGNAL_APPROACHES[direction]}红绿灯" aria-pressed="${selected === 'signal:' + direction}"` : 'pointer-events="none"'}><title>${SIGNAL_APPROACHES[direction]}：${SIGNAL_STATES[state]}</title>${interactive ? `<rect x="-57" y="-42" width="114" height="108" rx="8" fill="${selected === 'signal:' + direction ? '#245bdb' : 'transparent'}" fill-opacity=".07" stroke="${selected === 'signal:' + direction ? '#245bdb' : 'none'}" stroke-dasharray="4 3"/>` : ''}<g data-signal-angle="${angle}" transform="rotate(${angle})"><rect x="-34" y="-14" width="68" height="28" rx="8" fill="#25364e" stroke="white" stroke-width="2"/>${['red', 'yellow', 'green'].map((color, i) => `<circle cx="${-21 + i * 21}" cy="0" r="7" fill="${state === color ? colors[color] : '#64748b'}" fill-opacity="${state === color ? 1 : .35}"/>`).join('')}<path d="M-5 20L0 27L5 20" fill="none" stroke="#65748a" stroke-width="2" stroke-linecap="round"/></g><text y="53" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#35465d">${SIGNAL_APPROACHES[direction].slice(0, 4)} · ${SIGNAL_STATES[state]}</text></g>`;
  }).join('');
}
function carMarkup(car, selected, interactive) {
  const color = participantColor(car), type = participantType(car), labelY = type === 'car' ? 4 : 50;
  return `<g data-car-id="${car.id}" data-participant-type="${type}" transform="translate(${car.x} ${car.y})"><g transform="rotate(${car.angle})" ${interactive ? `data-car="${car.id}" class="car" tabindex="0" role="button" aria-label="${escapeXml(participantName(car))} ${car.id}，方向键移动"` : ''}>${interactive ? '<rect x="-30" y="-56" width="60" height="112" rx="14" fill="transparent"/>' : ''}${selected && interactive ? `<rect x="-36" y="-60" width="72" height="120" rx="20" fill="${color}" fill-opacity=".07" stroke="${color}" stroke-width="2" stroke-dasharray="5 4"/>` : ''}${participantGlyph(car)}</g><circle cy="${labelY - 4}" r="10" fill="white" pointer-events="none"/><text y="${labelY}" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="700" fill="${color}" pointer-events="none">${car.id}</text></g>`;
}
export function sceneMarkup(scene, { selected = null, interactive = false, grid = true, progress = null, replayMode = 'actual', hideUnknownSignals = false } = {}) {
  const replaying = progress !== null;
  if (replaying) { interactive = false; selected = null; }
  const paths = scene.cars.map(car => {
    const p = pathFor(car);
    if (!p) return '';
    const sample = samplePath(p, .48);
    const arrowX = sample.x, arrowY = sample.y;
    const heading = Math.atan2(sample.dy, sample.dx) * 180 / Math.PI;
    return `<path d="${p.d}" fill="none" stroke="${participantColor(car)}" stroke-opacity=".8" stroke-width="4" stroke-dasharray="9 7" pointer-events="none"/><path d="M-8 -6L7 0L-8 6L-4 0Z" transform="translate(${arrowX} ${arrowY}) rotate(${heading})" fill="${participantColor(car)}" pointer-events="none"/>${interactive && selected === car.id ? `<circle data-route="${car.id}" cx="${p.start.x}" cy="${p.start.y}" r="11" fill="white" stroke="${participantColor(car)}" stroke-width="3" class="route-handle"/>` : `<circle cx="${p.start.x}" cy="${p.start.y}" r="5" fill="${participantColor(car)}"/>`}`;
  }).join('');
  const plans = replaying && (replayMode === 'actual' && progress < 1 || replayMode === 'full' && progress < .5) ? '' : scene.cars.map(car => {
    const p = plannedPathFor(car);
    if (!p) return '';
    const color = participantColor(car);
    return `<g data-plan="${car.id}"><path d="${p.d}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" marker-end="url(#arrow-${car.id})" pointer-events="none"/><text x="${p.control.x + 12}" y="${Math.max(20, p.control.y - 12)}" font-family="sans-serif" font-size="13" fill="${color}" pointer-events="none">计划${planLabel(car.plan)}</text>${interactive && selected === car.id ? `<circle data-plan-target="${car.id}" cx="${p.end.x}" cy="${p.end.y}" r="10" fill="white" stroke="${color}" stroke-width="3" class="route-handle"/>${car.plan.turn === 'straight' ? '' : `<rect data-plan-bend="${car.id}" x="${p.control.x - 7}" y="${p.control.y - 7}" width="14" height="14" rx="3" fill="white" stroke="${color}" stroke-width="2" class="route-handle"/>`}` : ''}</g>`;
  }).join('');
  const c = replaying ? replayMode === 'full' ? progress >= .49 && progress <= .5 ? scene.collision : null : replayMode === 'planned' || progress < 1 ? null : scene.collision : scene.collision;
  const collision = c ? `<g data-collision="true" transform="translate(${c.x} ${c.y})" ${interactive ? 'class="collision" tabindex="0" role="button" aria-label="碰撞点，方向键移动"' : ''}><circle r="21" fill="#fff" fill-opacity=".9"/><path d="M0 -17L4 -8L13 -12L10 -3L18 2L8 6L9 16L0 11L-8 17L-8 6L-17 2L-9 -4L-13 -12L-4 -8Z" fill="#f1b642" stroke="#ce861b" stroke-width="1.5"/></g>` : '';
  return `<defs><pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#dce3ea"/></pattern>${scene.cars.map(car => `<marker id="arrow-${car.id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L10 5L0 10Z" fill="${participantColor(car)}"/></marker>`).join('')}</defs><rect width="${WIDTH}" height="${HEIGHT}" fill="#f7f9fb"/>${grid ? `<rect width="800" height="600" fill="url(#dots)"/>` : ''}${`<g ${interactive ? 'data-road-object="true"' : ''}>${roadMarkup(scene.road, scene.lanes, scene.roadOptions)}</g>`}${signalsMarkup(scene, { interactive, selected, hideUnknownSignals })}${paths}${plans}${scene.cars.map(car => carMarkup(replaying ? replayMode === 'full' ? carAtFullProgress(car, progress) : replayMode === 'planned' ? carAtPlannedProgress(car, progress) : carAtProgress(car, progress) : car, selected === car.id, interactive)).join('')}${collision}<g transform="translate(751 42)" fill="#798799" font-family="sans-serif" text-anchor="middle"><path d="M0 -12L5 5L0 1L-5 5Z"/><text y="23" font-size="12">北</text></g>`;
}
function wrapText(text, max = 44) {
  const lines = [];
  for (const line of text.split('\n')) {
    const chars = Array.from(line);
    if (!chars.length) lines.push('');
    for (let i = 0; i < chars.length; i += max) lines.push(chars.slice(i, i + max).join(''));
  }
  return lines;
}
export const sceneTitle = scene => scene.title?.trim() || '事故示意图';
export function exportSvg(scene, sceneOptions = {}) {
  const lines = scene.note.trim() ? wrapText(scene.note.trim()) : [];
  const metadata = `${roadDescription(scene)}${scene.location.trim() ? ' · ' + scene.location.trim() : ''}${scene.date.trim() ? ' · ' + scene.date.trim().replace('T', ' ') : ''}`;
  const metaLines = wrapText(metadata, 54);
  const titleLines = wrapText(sceneTitle(scene), 28);
  const titleOffset = (titleLines.length - 1) * 34;
  const offset = (metaLines.length - 1) * 22 + titleOffset;
  const damageNames = { front: '车头', rear: '车尾', left: '左侧', right: '右侧' };
  let rowY = 730 + offset;
  const participantRows = scene.cars.map(car => {
    const description = `${car.id} ${participantExportName(car)}：${MOTIONS[car.motion]}${car.plan ? '，计划' + planLabel(car.plan) + '（未发生）' : ''}${car.damage ? '，受损部位：' + damageNames[car.damage] : ''}`;
    const rowLines = wrapText(description, 44), y = rowY; rowY += rowLines.length * 24 + 4;
    return `<circle cx="50" cy="${y}" r="6" fill="${participantColor(car)}"/>${rowLines.map((line, i) => `<text x="66" y="${y + 5 + i * 24}" font-size="15" fill="#35465d">${escapeXml(line)}</text>`).join('')}`;
  }).join('');
  const notesY = rowY + 10, height = notesY + 34 + lines.length * 26;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="880" height="${height}" viewBox="0 0 880 ${height}"><rect width="880" height="${height}" fill="white"/><g font-family="PingFang SC, Microsoft YaHei, sans-serif">${titleLines.map((line, i) => `<text x="40" y="${48 + i * 34}" font-size="27" font-weight="700" fill="#1f3049">${escapeXml(line)}</text>`).join('')}${metaLines.map((line, i) => `<text x="40" y="${77 + titleOffset + i * 22}" font-size="14" fill="#65748a">${escapeXml(line)}</text>`).join('')}<svg x="40" y="${100 + offset}" width="800" height="600" viewBox="0 0 800 600">${sceneMarkup(scene, { grid: false, ...sceneOptions, hideUnknownSignals: true })}</svg>${participantRows}${lines.map((line, i) => `<text x="40" y="${notesY + i * 26}" font-size="16" fill="#35465d">${escapeXml(line)}</text>`).join('')}<text x="40" y="${height - 24}" font-size="12" fill="#758298">CrashPad · 依据绘制者描述生成，位置与距离为示意，不代表事故责任认定。</text></g></svg>`;
}
