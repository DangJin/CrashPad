export const SIGNAL_DEFAULT = { enabled: false, green: 30, red: 30, start: 'green' };
export function signalState(segment, time) {
  const signal = { ...SIGNAL_DEFAULT, ...segment.signal };
  if (!signal.enabled) return null;
  const cycle = signal.green + 3 + signal.red;
  const phase = (time + (signal.start === 'red' ? signal.green + 3 : 0)) % cycle;
  if (phase < signal.green) return { color: 'green', remaining: Math.ceil(signal.green - phase) };
  if (phase < signal.green + 3) return { color: 'yellow', remaining: Math.ceil(signal.green + 3 - phase) };
  return { color: 'red', remaining: Math.ceil(cycle - phase) };
}
export const signalPosition = segment => segment.end - 12;
export const rampTarget = segment => segment.side === 'left' ? segment.to.lo : segment.to.hi;
// A single quadratic describes the whole entry ramp, including its merge taper.
// The waiting point is exactly one lane outside the main stream.
const MERGE_WAIT = 1 - Math.sqrt(1 / 2.5);
export const rampLength = segment => segment.length * (segment.kind === 'merge' ? .9 * MERGE_WAIT : .7);
export const rampJunction = segment => segment.start + segment.length * (segment.kind === 'merge' ? .05 + .9 * MERGE_WAIT : .2);
export const rampMergeEnd = segment => segment.start + segment.length * .95;
export function rampCurvePoint(segment, t) {
  t = Math.max(0, Math.min(1, t));
  const side = segment.side === 'left' ? -1 : 1, lane = rampTarget(segment);
  if (segment.kind === 'merge') return { x: segment.start + segment.length * (.05 + .9 * t), lane: lane + side * 2.5 * (1 - t) ** 2 };
  return { x: segment.start + segment.length * (.2 + .7 * t), lane: lane + side * 2.5 * t * t };
}
export function rampPoint(segment, progress) {
  const t = Math.max(0, Math.min(1, progress / rampLength(segment)));
  return rampCurvePoint(segment, segment.kind === 'merge' ? MERGE_WAIT * t : t);
}
export const mainEntryCount = config => config.count - config.segments.reduce((sum, segment) => sum + (segment.kind === 'merge' ? segment.rampCount ?? 0 : 0), 0);
// Routing draws are independent of driver attributes and do not consume their RNG stream.
const routeDraw = (seed, id, index) => { let value = (seed ^ Math.imul(id, 2654435761) ^ Math.imul(index + 1, 2246822519)) >>> 0; value ^= value >>> 16; value = Math.imul(value, 2246822507) >>> 0; return value / 4294967296; };
export function assignRoutes(config, road, pending) {
  const mainCount = mainEntryCount(config);
  let offset = mainCount;
  for (const segment of road.segments) if (segment.kind === 'merge') {
    for (let i = 0; i < segment.rampCount; i++) {
      const car = pending[offset++]; car.entryRamp = segment.index; car.lane = car.origin = rampTarget(segment); car.scheduled = i * 60 / segment.rampFlow;
    }
  }
  for (const segment of road.segments) if (segment.kind === 'exit') {
    const eligible = pending.filter(car => !car.isPlayer && car.exitSegment == null && (car.entryRamp == null || rampJunction(road.segments[car.entryRamp]) < rampJunction(segment) - 30));
    eligible.sort((a, b) => routeDraw(config.seed, a.id, segment.index) - routeDraw(config.seed, b.id, segment.index));
    for (const car of eligible.slice(0, Math.round(eligible.length * segment.exitPercent / 100))) car.exitSegment = segment.index;
  }
}

export const tollPosition = segment => segment.start + segment.length * .6;
export const tollType = (segment, lane) => segment.tollLanes?.[lane - segment.from.lo] === 'manual' ? 'manual' : 'etc';
export function updateTolls(sim) {
  for (const segment of sim.road.segments) if (segment.kind === 'toll') {
    const position = tollPosition(segment);
    for (let lane = segment.from.lo; lane <= (segment.plaza?.hi ?? segment.from.hi); lane++) {
      const car = sim.cars.filter(c => !c.ramp && !c.change && c.lane === lane && c.x <= position && !c.tollPassed?.includes(segment.index)).sort((a, b) => b.x - a.x)[0];
      if (!car || position - car.x > 3 || car.v > 1) continue;
      if (!car.tollService || car.tollService.segment !== segment.index) car.tollService = { segment: segment.index, lane, until: sim.time + (tollType(segment, lane) === 'manual' ? segment.manualSeconds ?? 12 : segment.etcSeconds ?? 2) };
      if (sim.time >= car.tollService.until) { (car.tollPassed ??= []).push(segment.index); car.tollService = null; }
    }
  }
}
