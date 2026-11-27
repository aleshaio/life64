import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, buildScene, applyChoice, acknowledge, isOver, buildEpilogue, pendingResult } from '../src/core/engine.js';
import { popcount, hexNumber } from '../src/core/hexagram.js';
import { live } from '../src/core/sim.js';

test('в каждой сцене ровно 4 выбора на 4 разные черты, каждый переворачивает ровно одну', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const { scenes, state } = live({ seed });
    assert.equal(scenes.length, 16);
    for (const sc of scenes) {
      assert.equal(sc.choices.length, 4);
      assert.equal(new Set(sc.choices.map((c) => c.line)).size, 4);
      assert.equal(new Set(sc.choices.map((c) => c.id)).size, 4);
    }
    assert.equal(state.journal.length, 16);
    state.journal.forEach((j) => assert.equal(popcount(j.from ^ j.to), 1));
  }
});

test('полная партия: 16 ходов, затем только эпилог, без 17-й сцены', () => {
  const { state } = live({ seed: 7 });
  assert.ok(isOver(state));
  assert.throws(() => buildScene(state));
  assert.throws(() => applyChoice(state, 'e16-l1'));
  const ep = buildEpilogue(state);
  assert.equal(ep.final.hex, hexNumber(state.bits));
  assert.equal(ep.route.length, 16);
  assert.ok(ep.references.length >= 1 && ep.references.length <= 3);
  assert.ok(ep.legacy.length >= 2);
});

test('конечная чётность фиксирована: 16 переворотов сохраняют чётность стартового узла', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const { state } = live({ seed });
    assert.equal(popcount(state.bits) % 2, popcount(state.initialBits) % 2);
  }
});

test('нельзя выбрать непоказанный вариант или применить выбор дважды', () => {
  let s = newGame();
  const sc = buildScene(s);
  const hiddenId = `e1-l${sc.hidden[0]}`;
  assert.throws(() => applyChoice(s, hiddenId));
  assert.throws(() => applyChoice(s, 'e2-l1'));
  const s1 = applyChoice(s, sc.choices[0].id);
  assert.ok(pendingResult(s1));
  assert.throws(() => applyChoice(s1, sc.choices[0].id), 'повтор того же клика');
  const s2 = acknowledge(s1);
  assert.equal(pendingResult(s2), null);
  assert.throws(() => applyChoice(s2, sc.choices[0].id), 'старый id в новом эпизоде');
});

test('история детерминированно воспроизводится по id решений', () => {
  const a = live({ seed: 42 });
  const b = live({ ids: a.ids });
  assert.equal(b.state.bits, a.state.bits);
  assert.deepEqual(b.scenes.map((s) => s.paragraphs), a.scenes.map((s) => s.paragraphs));
  assert.deepEqual(buildEpilogue(b.state), buildEpilogue(a.state));
});

test('игрок не видит технических обозначений', () => {
  const tech = /гексаграмм|И-?Цзин|черт[аы]|Dramatica|квадр(?!атн)|Ян\b|Инь\b|№\d/i;
  for (let seed = 1; seed <= 100; seed++) {
    const { scenes, state } = live({ seed });
    for (const sc of scenes) {
      for (const p of sc.paragraphs) assert.ok(!tech.test(p), p);
      for (const c of sc.choices) assert.ok(!tech.test(c.text + c.cost), c.text);
    }
    const ep = buildEpilogue(state);
    [ep.opening, ...ep.legacy, ...ep.references.map((r) => r.text), ep.final.text].forEach((t) => assert.ok(!tech.test(t), t));
  }
});

test('шаблоны подставлены, в текстах нет фигурных скобок', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const { scenes, state } = live({ seed });
    for (const sc of scenes) {
      const all = sc.paragraphs.join(' ') + sc.choices.map((c) => c.text + c.cost).join(' ');
      assert.ok(!/[{}]/.test(all), all);
    }
    state.journal.forEach((j) => assert.ok(!/[{}]/.test(j.result), j.result));
    buildEpilogue(state).legacy.forEach((t) => assert.ok(!/[{}]/.test(t), t));
  }
});
