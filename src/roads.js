import { roadConfig, DIRECTIONS } from './model.js';

const rotations = { north: 0, east: 90, south: 180, west: 270 };
export function roadSurfaceDefs() {
  return `<defs><pattern id="asphalt" width="48" height="48" patternUnits="userSpaceOnUse"><rect width="48" height="48" fill="#555c62"/><path d="M3 8h2m12-4h1m15 8h2m-27 9h1m13 4h2m16-3h1m-34 16h2m17 5h1m15-7h2" stroke="#a8adb0" stroke-opacity=".22" stroke-width="1"/><path d="M8 3h2m18 5h2m-16 9h2m23 0h2M3 30h2m13 4h2m14 9h2" stroke="#252d33" stroke-opacity=".22" stroke-width="1.2"/></pattern></defs>`;
}
const stroke = '#c8c9be', surface = 'url(#asphalt)';
const roadPath = d => `<path d="${d}" fill="${surface}" stroke="${stroke}" stroke-width="3"/>`;
const dashed = d => `<path d="${d}" fill="none" stroke="white" stroke-width="3" stroke-dasharray="18 18"/>`;
const flow = (x, y, angle = 0) => `<path d="M0 15V-12M-6 -6L0 -12L6 -6" transform="translate(${x} ${y}) rotate(${angle})" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
const widthFor = lanes => lanes * 70 + 36;

export function specialRoadMarkup(road, lanes, rawOptions = {}) {
  const options = roadConfig({ road, lanes, roadOptions: rawOptions });
  let geometry = '', arrows = '';
  if (road === 'laneAdd' || road === 'laneDrop') {
    const before = lanes, after = options.afterLanes, maximum = Math.max(before, after);
    const outerLeft = 400 - widthFor(maximum) / 2, outerRight = 400 + widthFor(maximum) / 2;
    const rightSide = options.side === 'right';
    const beforeLeft = rightSide ? outerLeft : outerRight - widthFor(before), beforeRight = rightSide ? outerLeft + widthFor(before) : outerRight;
    const afterLeft = rightSide ? outerLeft : outerRight - widthFor(after), afterRight = rightSide ? outerLeft + widthFor(after) : outerRight;
    geometry = roadPath(`M${afterLeft} -100H${afterRight}V180C${afterRight} 270 ${beforeRight} 330 ${beforeRight} 420V700H${beforeLeft}V420C${beforeLeft} 330 ${afterLeft} 270 ${afterLeft} 180Z`);
    const anchor = rightSide ? outerLeft + 18 : outerRight - 18;
    const sign = rightSide ? 1 : -1;
    for (let i = 1; i < maximum; i++) {
      const x = anchor + sign * i * 70;
      const shared = i < Math.min(before, after);
      geometry += dashed(shared ? `M${x} -100V700` : after > before ? `M${x} -100V230` : `M${x} 370V700`);
    }
    for (let i = 0; i < before; i++) arrows += flow(beforeLeft + 18 + i * 70 + 35, 515);
    for (let i = 0; i < after; i++) arrows += flow(afterLeft + 18 + i * 70 + 35, 85);
  } else {
    const w = widthFor(lanes), left = 400 - w / 2, right = 400 + w / 2;
    const outline = `M${left} -100H${right}V150C${right} 265 ${right + 160} 370 810 490L810 575C${right + 180} 450 ${right + 60} 380 ${right} 390V700H${left}Z`;
    let ramp = roadPath(outline);
    for (let i = 1; i < lanes; i++) ramp += dashed(`M${left + 18 + i * 70} -100V700`);
    ramp += dashed(`M810 532C${right + 130} 415 ${right + 40} 330 ${right - 25} 230`);
    // Reflect only the road geometry; traffic arrows still point forwards.
    if (road === 'rampExit') ramp = `<g transform="translate(0 600) scale(1 -1)">${ramp}</g>`;
    const merge = road === 'rampMerge';
    arrows = flow(right + 110, merge ? 365 : 235, merge ? -48 : 48);
    for (let i = 0; i < lanes; i++) arrows += flow(left + 18 + i * 70 + 35, 515) + flow(left + 18 + i * 70 + 35, 85);
    geometry = ramp;
    if (options.side === 'left') { geometry = `<g transform="translate(800 0) scale(-1 1)">${geometry}</g>`; arrows = `<g transform="translate(800 0) scale(-1 1)">${arrows}</g>`; }
  }
  const angle = Object.hasOwn(DIRECTIONS, options.direction) ? rotations[options.direction] : 0;
  return `${roadSurfaceDefs()}<defs><clipPath id="road-frame-${road}"><rect width="800" height="600"/></clipPath></defs><g clip-path="url(#road-frame-${road})"><g data-road-type="${road}" transform="rotate(${angle} 400 300)">${geometry}${arrows}</g></g>`;
}
