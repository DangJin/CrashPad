import { corridorExample } from './templates.js';
import { normalizeRamps } from './ramps.js';
export const TRAFFIC_SCENARIOS = [
  { id: 'highway-morning', title: '高速早高峰', description: '匝道不断汇入，哪条车道更顺？', focus: 'merge', icon: 'merge' },
  { id: 'city-morning', title: '城市主干道早高峰', description: '连过三个路口，这一路要等多久？', focus: 'junction-b', icon: 'cross' },
  { id: 'toll-mixed', title: '收费站混合车流', description: '6 个 ETC、2 个人工窗口，看看队排在哪。', focus: 'section', icon: 'toll' },
  { id: 'zipper-merge', title: '拉链式汇入', description: '主路与匝道交替放行，观察两边队列。', focus: 'section', icon: 'merge' },
  { id: 'busy-exit', title: '出口集中分流', description: '六成车辆驶向同一出口，提前变道会怎样？', focus: 'section', icon: 'exit' },
];
const terminal = (id, name, x, y, rotation, role = 'both') => ({ id, type: 'terminal', name, x, y, rotation, role });
const road = (id, from, to, lanes, length, speed, oneWay = false) => ({ id, from, to, lanes, length, speed, oneWay });
const base = id => ({ version: 1, scenario: id, seed: 42, etcPercent: 100, driverMix: { conservative: 20, normal: 60, aggressive: 20 }, player: null });
export function createTrafficScenario(id) {
  if (['toll-mixed', 'zipper-merge', 'busy-exit'].includes(id)) {
    const config = corridorExample(({ 'toll-mixed': 'toll', 'zipper-merge': 'merge', 'busy-exit': 'exit' })[id]);
    Object.assign(config, base(id));
    const section = config.nodes.find(n => n.id === 'section');
    if (id === 'toll-mixed') {
      section.name = 'ETC / 人工混合收费站'; section.tollLanes = ['etc','etc','manual','etc','etc','etc','manual','etc'];
      config.etcPercent = 70; config.demand[0].count = 240; config.demand[0].flow = 30;
    } else if (id === 'zipper-merge') {
      section.name = '拉链式汇入'; section.mergePolicy = 'zipper';
      config.demand[0].count = 160; config.demand[0].flow = 80;
      config.demand[1].count = 80; config.demand[1].flow = 40;
    } else {
      section.name = '集中驶出路段'; config.demand[0].count = 240; config.demand[0].flow = 70;
      config.demand[0].destinations = { end: 40, branch: 60 };
    }
    return config;
  }
  if (id === 'highway-morning') return normalizeRamps({ ...base(id), nodes: [
    terminal('start', '郊区主路入口', 100, 260, 0, 'source'),
    { id: 'merge', type: 'merge', name: '住宅区匝道汇入', x: 650, y: 260, rotation: 0, mergePolicy: 'cooperative', priority: 'ew', turns: {} },
    { id: 'exit', type: 'exit', name: '商务区出口', x: 1550, y: 260, rotation: 0, priority: 'ew', turns: {} },
    terminal('end', '继续进城', 2100, 260, 180, 'sink'),
    terminal('ramp-in', '住宅区入口', 650, 700, 270, 'source'),
    terminal('ramp-out', '商务区', 1550, 700, 270, 'sink'),
  ], roads: [
    road('approach', 'start', 'merge', 3, 450, 100, true),
    road('mainline', 'merge', 'exit', 3, 800, 100, true),
    road('departure', 'exit', 'end', 3, 450, 100, true),
    { ...road('on-ramp', 'ramp-in', 'merge', 1, 300, 40, true), kind: 'ramp' },
    { ...road('off-ramp', 'exit', 'ramp-out', 1, 300, 40, true), kind: 'ramp' },
  ], demand: [
    { node: 'start', count: 180, flow: 105, destinations: { end: 75, 'ramp-out': 25 } },
    { node: 'ramp-in', count: 60, flow: 35, destinations: { end: 85, 'ramp-out': 15 } },
  ] });
  if (id !== 'city-morning') throw Error(`未知交通场景：${id}`);
  const nodes = [terminal('west', '居住区', 100, 480, 0), terminal('east', '办公区', 1700, 480, 180)];
  const roads = [], demand = [
    { node: 'west', count: 120, flow: 35, destinations: { east: 70, 'b-north': 15, 'c-south': 15 } },
    { node: 'east', count: 30, flow: 12, destinations: { west: 80, 'b-south': 20 } },
  ];
  for (const [i, key] of ['a', 'b', 'c'].entries()) {
    const x = [450, 950, 1350][i], id = `junction-${key}`;
    nodes.push({ id, type: 'cross', name: `路口 ${key.toUpperCase()} · ${['小区道路', '横向主干道', '商业街'][i]}`, x, y: 480, rotation: 0, signal: { enabled: true, plan: 'protected', green: i === 1 ? 25 : 35, leftGreen: 12 }, priority: 'ew', turns: {} });
    for (const side of ['north', 'south']) {
      const entry = `${key}-${side}`;
      nodes.push(terminal(entry, `${['小区', '横向主干道', '商业街'][i]}${side === 'north' ? '北侧' : '南侧'}`, x, side === 'north' ? 100 : 860, side === 'north' ? 90 : 270));
      roads.push(road(`side-${entry}`, entry, id, i === 1 ? 2 : 1, 280, 40));
      demand.push({ node: entry, count: 15, flow: i === 1 ? 15 : 8, destinations: { east: 60, west: 20, [`${key}-${side === 'north' ? 'south' : 'north'}`]: 20 } });
    }
  }
  roads.push(road('west-approach', 'west', 'junction-a', 3, 250, 50), road('a-b', 'junction-a', 'junction-b', 3, 400, 50), road('b-c', 'junction-b', 'junction-c', 3, 300, 50), road('east-departure', 'junction-c', 'east', 3, 250, 50));
  return { ...base(id), nodes, roads, demand };
}
