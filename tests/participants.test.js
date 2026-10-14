import test from 'node:test';
import assert from 'node:assert/strict';
import { addParticipant, createScene, restoreScene, participantName, participantColor, participantType, withParticipantType, History, createPlan, carAtFullProgress, setPlanPoint } from '../src/model.js';
import { sceneMarkup } from '../src/scene.js';
import { exportImage, EXPORT_PRESETS } from '../src/export.js';

test('legacy cars round-trip unchanged while mixed participants have unique identities and independent geometry', () => {
  const legacy = createScene(), original = JSON.stringify(legacy);
  assert.deepEqual(restoreScene(original), legacy);
  assert.equal(participantType(legacy.cars[0]), 'car');
  let scene = legacy;
  for (const type of ['pedestrian', 'ebike', 'bicycle', 'car']) scene = addParticipant(scene, type);
  assert.equal(JSON.stringify(legacy), original);
  assert.equal(scene.cars.length, 6);
  assert.equal(new Set(scene.cars.map(c => c.id)).size, 6);
  assert.deepEqual(restoreScene(JSON.stringify(scene)), scene);
  for (const participant of scene.cars) {
    assert.ok(participantColor(participant)); assert.ok(participantName(participant));
    participant.plan = createPlan(participant, 'left', scene);
    assert.ok(Number.isFinite(carAtFullProgress(participant, .75).x));
  }
  const svg = sceneMarkup(scene);
  for (const participant of scene.cars) assert.ok(svg.includes(`id="arrow-${participant.id}"`));
});

test('type changes clear incompatible pedestrian actions; duplicate IDs and unknown types cannot restore', () => {
  const scene = addParticipant(createScene(), 'ebike'), person = withParticipantType({ ...scene.cars[2], motion: 'mergeLeft', damage: 'front', plan: { turn: 'changeRight', target: null, bend: null } }, 'pedestrian');
  assert.equal(person.motion, 'straight'); assert.equal(person.damage, ''); assert.equal(person.plan, null);
  assert.equal(restoreScene({ ...scene, cars: [...scene.cars, scene.cars[0]] }), null);
  assert.equal(restoreScene({ ...scene, cars: [{ ...person, id: '<script>' }] }), null);
  assert.equal(restoreScene({ ...scene, cars: [{ ...person, type: 'unknown' }] }), null);
  const history = new History(scene), removed = { ...scene, cars: scene.cars.filter(c => c.id !== 'C') };
  history.push(removed); assert.equal(history.undo().cars.length, 3); assert.equal(history.redo().cars.length, 2);
  assert.ok(restoreScene({ ...scene, cars: [] }));
});

test('every export layout retains all participants, escapes names and handles an empty scene', () => {
  let scene = createScene();
  for (const type of ['pedestrian', 'ebike', 'bicycle', 'pedestrian', 'car']) scene = addParticipant(scene, type);
  scene.cars[2].name = '<行人> & 测试'; scene.note = '多方参与的演示场景';
  for (const preset of Object.keys(EXPORT_PRESETS)) {
    const output = exportImage(scene, { preset });
    assert.ok(!/NaN|undefined|Infinity/.test(output.svg));
    assert.ok(output.svg.includes('&lt;行人&gt;') && output.svg.includes('&amp;') && output.svg.includes('测试'));
    assert.ok(!output.svg.includes('<行人>'));
    for (const participant of scene.cars) assert.ok(output.svg.includes(`data-car-id="${participant.id}"`));
    const empty = exportImage({ ...scene, cars: [] }, { preset });
    assert.ok(!/NaN|undefined|Infinity/.test(empty.svg));
  }
});

test('dragging a pedestrian endpoint never creates a vehicle-only lane change or invalid draft', () => {
  const scene = addParticipant(createScene(), 'pedestrian'), person = scene.cars[2];
  person.plan = createPlan(person, 'straight', scene);
  scene.cars[2] = setPlanPoint(person, 'target', { x: person.x + 95, y: person.y - 245 });
  assert.equal(scene.cars[2].plan.turn, 'straight');
  assert.ok(restoreScene(JSON.stringify(scene)));
});
