export const WIDTH = 800;
export const HEIGHT = 600;
export const STORAGE_KEY = 'crashpad:draft:v1';
export const ROADS = { straight: '直路', cross: '十字路口', tee: '丁字路口', parking: '停车区域', rampMerge: '匝道汇入', rampExit: '匝道汇出', laneDrop: '车道减少', laneAdd: '车道增加' };
export const SPECIAL_ROADS = ['rampMerge', 'rampExit', 'laneDrop', 'laneAdd'];
export const DIRECTIONS = { north: '向上 ↑', east: '向右 →', south: '向下 ↓', west: '向左 ←' };
export const SIGNAL_STATES = { unknown: '未注明', red: '红灯', yellow: '黄灯', green: '绿灯', off: '熄灭' };
export const SIGNAL_APPROACHES = { north: '北侧来车（向南）', east: '东侧来车（向西）', south: '南侧来车（向北）', west: '西侧来车（向东）' };
export const SIGNAL_ANGLES = { north: 0, east: 90, south: 180, west: 270 };
export function signalAngle(scene, direction) { return scene.signals?.angles?.[direction] ?? SIGNAL_ANGLES[direction]; }
export function signalDirections(scene) { return scene.road === 'cross' ? ['north', 'east', 'south', 'west'] : scene.road === 'tee' ? ['east', 'south', 'west'] : []; }
export function signalConfig(scene) {
  return { enabled: true, north: 'unknown', east: 'unknown', south: 'unknown', west: 'unknown', ...scene.signals };
}
export function isLaneTransition(road) { return road === 'laneDrop' || road === 'laneAdd'; }
export function roadConfig(scene) {
  const opts = scene.roadOptions || {};
  const defaultAfter = scene.road === 'laneDrop' ? Math.max(1, scene.lanes - 1) : Math.min(6, scene.lanes + 1);
  const validAfter = Number.isInteger(opts.afterLanes) && (scene.road === 'laneDrop' ? opts.afterLanes < scene.lanes : opts.afterLanes > scene.lanes);
  return { side: opts.side || 'right', direction: opts.direction || 'north', afterLanes: validAfter ? opts.afterLanes : defaultAfter };
}
export function withRoad(scene, road) {
  const lanes = road === 'laneDrop' ? Math.max(2, scene.lanes) : road === 'laneAdd' ? Math.min(5, scene.lanes) : scene.lanes;
  const next = { ...scene, road, lanes };
  if (SPECIAL_ROADS.includes(road)) next.roadOptions = roadConfig(next);
  return next;
}
export function withRoadLanes(scene, lanes) {
  const next = { ...scene, lanes };
  if (SPECIAL_ROADS.includes(next.road)) next.roadOptions = roadConfig(next);
  return next;
}
export function roadDescription(scene) {
  if (scene.road === 'parking') return ROADS.parking;
  if (!SPECIAL_ROADS.includes(scene.road)) return `${ROADS[scene.road]} / ${scene.lanes} 车道`;
  const options = roadConfig(scene);
  const lanes = isLaneTransition(scene.road) ? `${scene.lanes} → ${options.afterLanes} 车道` : `主路 ${scene.lanes} 车道`;
  return `${ROADS[scene.road]} / ${lanes} / ${options.side === 'left' ? '左侧' : '右侧'} / ${DIRECTIONS[options.direction]}`;
}
export const MOTIONS = { straight: '直行', left: '左转', right: '右转', change: '变道', changeLeft: '向左变道', changeRight: '向右变道', mergeLeft: '向左汇入', mergeRight: '向右汇入', stopped: '静止', custom: '自定路径' };
export const PLAN_ACTIONS = { straight: '直行', left: '左转', right: '右转', changeLeft: '向左变道', changeRight: '向右变道', mergeLeft: '向左汇入', mergeRight: '向右汇入' };
export const LATERAL_MOTIONS = ['changeLeft', 'changeRight', 'mergeLeft', 'mergeRight'];
export function planLabel(plan) { return PLAN_ACTIONS[plan.turn]; }
export function createPlan(car, action, scene) {
  const plan = { turn: action, target: null, bend: null };
  if (action.startsWith('merge') && scene?.road === 'rampMerge') {
    const config = roadConfig(scene);
    plan.finalAngle = { north: 0, east: 90, south: 180, west: 270 }[config.direction];
    if (config.side === 'right' && action === 'mergeLeft' || config.side === 'left' && action === 'mergeRight') {
      const r = plan.finalAngle * Math.PI / 180, laneOffset = (config.side === 'right' ? 1 : -1) * (scene.lanes - 1) * 35;
      const target = { x: 400 + laneOffset * Math.cos(r) + 150 * Math.sin(r), y: 300 + laneOffset * Math.sin(r) - 150 * Math.cos(r) };
      plan.target = setPlanPoint({ ...car, plan }, 'target', target).plan.target;
    }
  }
  return plan;
}
export const COLORS = { A: '#245bdb', B: '#db6a31' };
export const PARTICIPANT_TYPES = { car: '汽车', pedestrian: '行人', ebike: '电动车', bicycle: '自行车' };
export const participantType = participant => participant.type || 'car';
export function participantName(participant) {
  return participant.name?.trim() || (participantType(participant) === 'car' && ['A', 'B'].includes(participant.id) ? participant.id === 'A' ? '我的车' : '对方车辆' : PARTICIPANT_TYPES[participantType(participant)]);
}
export function participantExportName(participant) {
  const name = participantName(participant), type = participantType(participant);
  return type === 'car' || name === PARTICIPANT_TYPES[type] ? name : `${name}（${PARTICIPANT_TYPES[type]}）`;
}
export function participantColor(participant) {
  const palette = ['#23845f', '#8353c5', '#bb4878', '#267f9d', '#a36b16', '#5368bd'];
  return COLORS[participant.id] || palette[Array.from(participant.id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length];
}
export function addParticipant(scene, type) {
  if (!Object.hasOwn(PARTICIPANT_TYPES, type)) return scene;
  const used = new Set(scene.cars.map(p => p.id));
  let number = 0;
  const idAt = i => i < 26 ? String.fromCharCode(65 + i) : `P${i + 1}`;
  while (used.has(idAt(number))) number++;
  const participant = { id: idAt(number), type, x: 300 + (number % 4) * 65, y: 350 + (Math.floor(number / 4) % 3) * 60, angle: 0, motion: 'straight', damage: '', start: null };
  return { ...scene, cars: [...scene.cars, participant] };
}
export function withParticipantType(participant, type) {
  if (!Object.hasOwn(PARTICIPANT_TYPES, type)) return participant;
  const next = { ...participant, type };
  if (type === 'pedestrian') {
    next.damage = '';
    if (LATERAL_MOTIONS.includes(next.motion) || next.motion === 'change') { next.motion = 'straight'; next.start = null; }
    if (next.plan && LATERAL_MOTIONS.includes(next.plan.turn)) next.plan = null;
  }
  return next;
}
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const clone = value => JSON.parse(JSON.stringify(value));
export function createScene() {
  return {
    version: 1, road: 'straight', lanes: 2,
    cars: [
      { id: 'A', x: 340, y: 360, angle: 0, motion: 'straight', damage: '', start: null },
      { id: 'B', x: 460, y: 250, angle: 0, motion: 'straight', damage: '', start: null },
    ], collision: null, title: '', note: '', location: '', date: '',
  };
}
export function restoreScene(raw) {
  try {
    const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!s || s.version !== 1 || !Object.hasOwn(ROADS, s.road) || !Number.isInteger(s.lanes) || s.lanes < 1 || s.lanes > 6) return null;
    if (s.roadOptions !== undefined) {
      const o = s.roadOptions;
      if (!o || !['left', 'right'].includes(o.side) || !Object.hasOwn(DIRECTIONS, o.direction) || !Number.isInteger(o.afterLanes) || o.afterLanes < 1 || o.afterLanes > 6) return null;
      if (s.road === 'laneDrop' && o.afterLanes >= s.lanes || s.road === 'laneAdd' && o.afterLanes <= s.lanes) return null;
    }
    if (s.road === 'laneDrop' && s.lanes < 2 || s.road === 'laneAdd' && s.lanes > 5) return null;
    if (!Array.isArray(s.cars) || new Set(s.cars.map(c => c?.id)).size !== s.cars.length) return null;
    const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= WIDTH && p.y >= 0 && p.y <= HEIGHT;
    const damage = ['', 'front', 'rear', 'left', 'right'];
    if (s.cars.some(c => c?.type === 'pedestrian' && (c.damage !== '' || !['straight', 'left', 'right', 'stopped', 'custom'].includes(c.motion) || c.plan && LATERAL_MOTIONS.includes(c.plan.turn)))) return null;
    if (!s.cars.every(c => c && typeof c.id === 'string' && /^[A-Z][A-Za-z0-9_-]{0,31}$/.test(c.id) && (c.type === undefined || Object.hasOwn(PARTICIPANT_TYPES, c.type)) && (c.name === undefined || typeof c.name === 'string' && c.name.length <= 20) && point(c) && c.x >= 36 && c.x <= WIDTH - 36 && c.y >= 55 && c.y <= HEIGHT - 55 && Number.isFinite(c.angle) && Object.hasOwn(MOTIONS, c.motion) && damage.includes(c.damage) && (c.start === null || point(c.start)))) return null;
    const localPoint = p => p === null || (p && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) <= WIDTH * 2 && Math.abs(p.y) <= HEIGHT * 2);
    if (s.cars.some(c => c.plan !== undefined && c.plan !== null && (!Object.hasOwn(PLAN_ACTIONS, c.plan.turn) || !localPoint(c.plan.target) || !localPoint(c.plan.bend) || (c.plan.finalAngle !== undefined && (!Number.isFinite(c.plan.finalAngle) || c.plan.finalAngle < 0 || c.plan.finalAngle >= 360))))) return null;
    if (s.collision !== null && !point(s.collision)) return null;
    if (s.title !== undefined && (typeof s.title !== 'string' || s.title.length > 60)) return null;
    if (s.signals !== undefined && (!s.signals || typeof s.signals.enabled !== 'boolean' || !Object.keys(SIGNAL_APPROACHES).every(direction => Object.hasOwn(SIGNAL_STATES, s.signals[direction])))) return null;
    if (s.signals?.angles !== undefined && (!s.signals.angles || typeof s.signals.angles !== 'object' || Array.isArray(s.signals.angles) || !Object.entries(s.signals.angles).every(([direction, angle]) => Object.hasOwn(SIGNAL_ANGLES, direction) && Number.isFinite(angle) && angle >= 0 && angle < 360))) return null;
    if (![s.note, s.location, s.date].every(v => typeof v === 'string') || s.note.length > 500 || s.location.length > 100 || s.date.length > 30) return null;
    return clone(s);
  } catch { return null; }
}
export function moveCar(car, x, y) {
  return { ...car, x: clamp(x, 36, WIDTH - 36), y: clamp(y, 55, HEIGHT - 55) };
}
export function rotateCar(car, delta) {
  return { ...car, angle: ((car.angle + delta) % 360 + 360) % 360 };
}
// All paths end at the collision-time vehicle position. The beginning is its prior position.
export function pathFor(car) {
  if (car.motion === 'stopped') return null;
  const local = (x, y) => {
    const r = car.angle * Math.PI / 180;
    return { x: car.x + x * Math.cos(r) - y * Math.sin(r), y: car.y + x * Math.sin(r) + y * Math.cos(r) };
  };
  let start = local(0, 170), control = local(0, 85);
  if (LATERAL_MOTIONS.includes(car.motion)) {
    const merging = car.motion.startsWith('merge'), left = car.motion.endsWith('Left');
    const distance = merging ? 220 : 190, offset = (left ? 1 : -1) * (merging ? 155 : 95);
    start = car.start || local(offset, distance);
    const r = -car.angle * Math.PI / 180, dx = start.x - car.x, dy = start.y - car.y;
    const sx = dx * Math.cos(r) - dy * Math.sin(r), sy = dx * Math.sin(r) + dy * Math.cos(r);
    control = local(merging ? sx * .55 : sx, sy * .55);
    const control2 = local(0, Math.max(35, sy * .3));
    const bound = p => ({ x: clamp(p.x, 15, WIDTH - 15), y: clamp(p.y, 15, HEIGHT - 15) });
    start = bound(start); control = bound(control);
    return cubicPath(start, control, bound(control2), { x: car.x, y: car.y });
  }
  if (car.motion === 'left') { start = local(-160, 110); control = local(0, 110); }
  if (car.motion === 'right') { start = local(160, 110); control = local(0, 110); }
  if (car.motion === 'change') { start = local(-100, 175); control = local(-100, 60); }
  if (car.start) {
    start = car.start;
    if (car.motion === 'left' || car.motion === 'right') {
      const r = car.angle * Math.PI / 180;
      const distance = (start.x - car.x) * -Math.sin(r) + (start.y - car.y) * Math.cos(r);
      control = local(0, Math.max(30, distance));
    } else if (car.motion === 'change') {
      const r = car.angle * Math.PI / 180;
      const x = (start.x - car.x) * Math.cos(r) + (start.y - car.y) * Math.sin(r);
      const y = (start.x - car.x) * -Math.sin(r) + (start.y - car.y) * Math.cos(r);
      control = local(x, y * .35);
    } else control = { x: (start.x + car.x) / 2, y: (start.y + car.y) / 2 };
  }
  start = { x: clamp(start.x, 15, WIDTH - 15), y: clamp(start.y, 15, HEIGHT - 15) };
  control = { x: clamp(control.x, 15, WIDTH - 15), y: clamp(control.y, 15, HEIGHT - 15) };
  return { start, control, end: { x: car.x, y: car.y }, d: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${car.x} ${car.y}` };
}
function cubicPath(start, control, control2, end) {
  return { start, control, control2, end, d: `M ${start.x} ${start.y} C ${control.x} ${control.y} ${control2.x} ${control2.y} ${end.x} ${end.y}` };
}
export function samplePath(path, progress) {
  const t = clamp(progress, 0, 1), u = 1 - t, a = path.start, b = path.control, d = path.end;
  if (path.control2) {
    const c = path.control2;
    return { x: u ** 3 * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t ** 3 * d.x, y: u ** 3 * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t ** 3 * d.y,
      dx: u * u * (b.x - a.x) + 2 * u * t * (c.x - b.x) + t * t * (d.x - c.x), dy: u * u * (b.y - a.y) + 2 * u * t * (c.y - b.y) + t * t * (d.y - c.y) };
  }
  return { x: u * u * a.x + 2 * u * t * b.x + t * t * d.x, y: u * u * a.y + 2 * u * t * b.y + t * t * d.y, dx: u * (b.x - a.x) + t * (d.x - b.x), dy: u * (b.y - a.y) + t * (d.y - b.y) };
}
const turnDelta = motion => motion === 'left' ? -90 : motion === 'right' ? 90 : 0;
const normalizeAngle = angle => ((angle % 360) + 360) % 360;
export function incomingHeading(car) {
  if (car.start && car.motion === 'custom') {
    const path = pathFor(car);
    const dx = path.control.x - path.start.x, dy = path.control.y - path.start.y;
    if (Math.hypot(dx, dy) > .001) return normalizeAngle(Math.atan2(dx, -dy) * 180 / Math.PI);
  }
  return normalizeAngle(car.angle - turnDelta(car.motion));
}
export function withIncomingHeading(car, heading) {
  return { ...car, angle: normalizeAngle(heading + turnDelta(car.motion)), start: null };
}
export function withMotion(car, motion) {
  if (motion === 'stopped') return { ...car, motion, start: null };
  return withIncomingHeading({ ...car, motion }, incomingHeading(car));
}
// Planned intent starts in front of the current pose. It never changes the actual route.
export function plannedPathFor(car) {
  if (!car.plan) return null;
  const r = car.angle * Math.PI / 180;
  const world = p => ({
    x: clamp(car.x + p.x * Math.cos(r) - p.y * Math.sin(r), 15, WIDTH - 15),
    y: clamp(car.y + p.x * Math.sin(r) + p.y * Math.cos(r), 15, HEIGHT - 15),
  });
  const start = world({ x: 0, y: -65 });
  if (LATERAL_MOTIONS.includes(car.plan.turn)) {
    const merging = car.plan.turn.startsWith('merge'), left = car.plan.turn.endsWith('Left');
    const end = world(car.plan.target || { x: (left ? -1 : 1) * (merging ? 155 : 95), y: merging ? -270 : -245 });
    // Lane changes keep both tangents parallel to the vehicle heading. The
    // handle adjusts the transition length, never pulls it into the other lane.
    const forward = Math.max(1, (end.x - start.x) * Math.sin(r) - (end.y - start.y) * Math.cos(r));
    const control = merging ? world(car.plan.bend || { x: 0, y: -160 }) : {
      x: start.x + Math.sin(r) * clamp(-(car.plan.bend?.y ?? -145) - 65, forward * .15, forward * .45),
      y: start.y - Math.cos(r) * clamp(-(car.plan.bend?.y ?? -145) - 65, forward * .15, forward * .45),
    };
    const angle = (car.plan.finalAngle ?? car.angle) * Math.PI / 180;
    const tail = merging ? 75 : forward * .4;
    const control2 = { x: clamp(end.x - Math.sin(angle) * tail, 15, WIDTH - 15), y: clamp(end.y + Math.cos(angle) * tail, 15, HEIGHT - 15) };
    return cubicPath(start, control, control2, end);
  }
  const control = world(car.plan.bend || { x: 0, y: -180 });
  const end = world(car.plan.target || { x: car.plan.turn === 'straight' ? 0 : car.plan.turn === 'left' ? -170 : 170, y: car.plan.turn === 'straight' ? -270 : -180 });
  if (car.plan.turn === 'straight') {
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    return { start, control: midpoint, end, d: `M ${start.x} ${start.y} L ${end.x} ${end.y}` };
  }
  return { start, control, end, d: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}` };
}
export function setPlanPoint(car, key, point) {
  const r = -car.angle * Math.PI / 180, dx = point.x - car.x, dy = point.y - car.y;
  const local = { x: dx * Math.cos(r) - dy * Math.sin(r), y: dx * Math.sin(r) + dy * Math.cos(r) };
  const plan = { ...car.plan, [key]: local };
  if (participantType(car) !== 'pedestrian' && key === 'target' && plan.turn === 'straight' && Math.abs(local.x) > 12 && local.y < -65) {
    plan.turn = local.x > 0 ? 'changeRight' : 'changeLeft';
    plan.bend = null;
  }
  return { ...car, plan };
}
// A visual replay of the authored route, independent of saved collision-time geometry.
export function carAtProgress(car, progress) {
  const path = pathFor(car);
  const t = clamp(progress, 0, 1);
  if (t === 1) return { ...car };
  if (!path) return { ...car, damage: '' };
  const { x, y, dx, dy } = samplePath(path, t);
  const tangent = Math.hypot(dx, dy) < .001 ? car.angle : Math.atan2(dx, -dy) * 180 / Math.PI;
  const delta = ((tangent - car.angle + 540) % 360) - 180;
  // Blend towards the user-authored final heading without a jump at arrival.
  const angle = ((car.angle + delta * (1 - t * t) + 360) % 360);
  return { ...car, x, y, angle, damage: '' };
}
export function carAtPlannedProgress(car, progress) {
  const path = plannedPathFor(car), t = clamp(progress, 0, 1);
  if (!path || t === 0) return { ...car };
  if (t < .2) return { ...car, x: car.x + (path.start.x - car.x) * t / .2, y: car.y + (path.start.y - car.y) * t / .2, damage: '' };
  const p = samplePath(path, (t - .2) / .8);
  const angle = Math.hypot(p.dx, p.dy) < .001 ? car.angle : ((Math.atan2(p.dx, -p.dy) * 180 / Math.PI + 360) % 360);
  return { ...car, x: p.x, y: p.y, angle, damage: '' };
}
export class History {
  constructor(initial) { this.items = [clone(initial)]; this.index = 0; }
  push(scene) {
    if (JSON.stringify(this.items[this.index]) === JSON.stringify(scene)) return;
    this.items = this.items.slice(0, this.index + 1);
    this.items.push(clone(scene));
    if (this.items.length > 80) this.items.shift();
    this.index = this.items.length - 1;
  }
  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.items.length - 1; }
  undo() { if (this.canUndo) this.index--; return clone(this.items[this.index]); }
  redo() { if (this.canRedo) this.index++; return clone(this.items[this.index]); }
}

export function carAtFullProgress(car, progress) {
  return progress <= .5 ? carAtProgress(car, progress * 2) : carAtPlannedProgress(car, (progress - .5) * 2);
}
