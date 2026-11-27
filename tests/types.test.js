import test from 'node:test';
import assert from 'node:assert/strict';
import { live } from '../src/core/sim.js';
import { buildEpilogue, typeProfile, largestRemainder, quadShares, words, newGame, applyChoice, acknowledge, buildScene } from '../src/core/engine.js';
import { TYPES, QUAD_ORDER, ROLE_ORDER } from '../src/data/types.js';

const sum = (o) => Math.round(Object.values(o).reduce((a, b) => a + b, 0) * 100);

test('16 типов: у каждого имя и основа портрета', () => {
  const names = QUAD_ORDER.flatMap((q) => ROLE_ORDER.map((r) => TYPES[q][r].name));
  assert.equal(new Set(names).size, 16);
});

test('доли квадр одного решения дают в сумме 1', () => {
  for (let b = 0; b < 64; b++) assert.ok(Math.abs(Object.values(quadShares(b)).reduce((a, x) => a + x, 0) - 1) < 1e-12);
});

test('метод наибольших остатков: ровно 100,00%', () => {
  assert.equal(sum(largestRemainder({ a: 1, b: 1, c: 1 }, ['a', 'b', 'c'])), 10000);
  assert.deepEqual(largestRemainder({ a: 1, b: 1, c: 1 }, ['a', 'b', 'c']), { a: 33.34, b: 33.33, c: 33.33 });
});

test('тип однозначен, детерминирован, доли ровно 100%, портрет 80–130 слов, все 16 типов достижимы', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 1500; seed++) {
    for (const sex of ['M', 'F']) {
      const { state, ids, start } = live({ seed, sex });
      const ep = buildEpilogue(state);
      seen.add(ep.type.name);
      assert.equal(sum(ep.type.quadShares), 10000);
      assert.equal(sum(ep.type.roleShares), 10000);
      const w = words(ep.type.portrait);
      assert.ok(w >= 80 && w <= 130, `${w} слов: ${ep.type.portrait}`);
      assert.ok(ep.type.evidence.length >= 3, 'портрет опирается минимум на 3 решения');
      // карта типа: суть, описание и цена — отдельные фразы, «Цена» не повторяется в тексте цены
      assert.ok(ep.type.essence && ep.type.about && ep.type.price, `пустая часть карты типа: ${ep.type.name}`);
      assert.ok(/^[А-ЯЁ]/.test(ep.type.price) && !/^Цена/.test(ep.type.price), `цена: ${ep.type.price}`);
      assert.ok(ep.type.deeds.length >= 3 && ep.type.deeds.every((d) => d.age && /^[А-ЯЁ]/.test(d.text)), 'поступки с возрастом');
      assert.ok(!/[{}|]/.test(ep.type.portrait + ep.type.hint + ep.opening + ep.legacy.join('')));
      if (seed % 50 === 0) assert.deepEqual(buildEpilogue(live({ ids, sex, start }).state).type, ep.type);
    }
  }
  assert.equal(seen.size, 16, [...seen].join(', '));
});

test('профиль всегда называет квадру и роль', () => {
  // искусственная жизнь: сравниваем профиль с перевёрнутой историей
  const { state } = live({ seed: 3 });
  const p = typeProfile(state);
  assert.ok(QUAD_ORDER.includes(p.quad) && ROLE_ORDER.includes(p.role));
});

test('четыре показанных поступка всегда принадлежат четырём разным ролям', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const { scenes } = live({ seed });
    for (const sc of scenes) {
      const roles = sc.choices.map((c) => sc.allChoices.find((a) => a.id === c.id).role);
      assert.deepEqual([...roles].sort(), ['EN', 'ES', 'IN', 'IS']);
    }
  }
});

test('героиня: сцены, итоги и финал без мужского рода о себе в ключевых местах', () => {
  let s = newGame('F');
  const sc = buildScene(s);
  assert.ok(sc.paragraphs[0].includes('Ты родилась'));
  s = acknowledge(applyChoice(s, sc.choices[0].id));
  assert.equal(s.sex, 'F');
});
