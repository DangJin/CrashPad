// Illustrative strategies for this model, not calibrated real-world driver classes.
const normal = { headway: 1.5, front: .55, rear: .65, braking: -3, courtesy: .35, gain: .8, persistence: 1.5, cooldown: 7, returnDelay: 20 };
const eager = { headway: 1.2, front: .25, rear: .3, braking: -6, courtesy: .05, gain: .12, persistence: .7, cooldown: 4, returnDelay: 12 };
export const DRIVING_STYLES = {
  conservative: { label: '保守型', description: '留距较大，变道更谨慎。', ...normal, headway: 1.8, gain: 1.2, persistence: 2.4, cooldown: 10, returnDelay: 30 },
  normal: { label: '常规型', description: '使用中等跟车距离与变道门槛。', ...normal },
  aggressive: { label: '激进型', description: '接受较小空隙，更积极响应变道收益。', ...eager },
};
const legacyStyles = { hold: 'normal', steady: 'conservative', experienced: 'normal', hurry: 'aggressive' };
const canonicalStyle = value => Object.hasOwn(legacyStyles, value ?? 'hold') ? legacyStyles[value ?? 'hold'] : value;
export function normalizePlayerConfig(config) {
  return { ...config, playerStyle: canonicalStyle(config.playerStyle), playerLaneChanges: config.playerLaneChanges ?? (config.playerStyle != null && config.playerStyle !== 'hold') };
}
const trafficEager = { ...eager, headway: 1.5 };
export const drivingStyle = value => {
  const key = canonicalStyle(value);
  return Object.hasOwn(DRIVING_STYLES, key) ? DRIVING_STYLES[key] : undefined;
};
export const drivingPolicy = car => car.drivingStyle ? drivingStyle(car.drivingStyle) : car.aggressive ? trafficEager : normal;

export const STYLE_KEYS = ['conservative', 'normal', 'aggressive'];
export const trafficMix = config => config.driverMix ?? { conservative: 0, normal: 100 - (config.aggression ?? 30), aggressive: config.aggression ?? 30 };
export function normalizeTrafficConfig(config) {
  const { aggression, ...rest } = normalizePlayerConfig(config);
  return { ...rest, driverMix: { ...trafficMix(config) } };
}
// Largest-remainder allocation keeps integer counts exact, even for small fleets.
export function allocateDriverCounts(total, mix) {
  const priority = ['aggressive', 'conservative', 'normal'];
  const rows = priority.map(key => ({ key, count: Math.floor(total * mix[key] / 100), fraction: total * mix[key] / 100 % 1 }));
  let remaining = total - rows.reduce((sum, row) => sum + row.count, 0);
  for (const row of [...rows].sort((a, b) => b.fraction - a.fraction)) { if (remaining-- <= 0) break; row.count++; }
  return Object.fromEntries(rows.map(row => [row.key, row.count]));
}
export function adjustTrafficMix(mix, key, value) {
  const amount = Math.max(0, Math.min(100, Math.round(value)));
  const others = STYLE_KEYS.filter(style => style !== key), sum = others.reduce((total, style) => total + mix[style], 0);
  const first = sum ? Math.round((100 - amount) * mix[others[0]] / sum) : Math.floor((100 - amount) / 2);
  return { ...mix, [key]: amount, [others[0]]: first, [others[1]]: 100 - amount - first };
}
