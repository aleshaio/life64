// Сюжетные эксперименты C1–C4 и проверки ветвления: разные поступки ведут в разные сцены.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, buildScene, applyChoice, acknowledge, isOver, choiceId, situation } from '../src/core/engine.js';
import { bitsOf, flip } from '../src/core/hexagram.js';
import { live, reachability, factDiff } from '../src/core/sim.js';
import { sphereAfter } from '../src/core/sphere.js';

const SEXES = ['M', 'F'];
const key = (sc, sex) => `${sex}${sc.episode}-${sc.sphere}`;

test('ветвление: в каждой сцене 4 поступка ведут в 4 разные следующие сцены', () => {
  for (const sex of SEXES) {
    const { finalBits } = reachability(sex);
    let frontier = new Set([newGame(sex).bits]);
    for (let ep = 1; ep < 16; ep++) {
      const next = new Set();
      for (const b of frontier) {
        const { sp, sit } = situation(sex, ep, b);
        const targets = new Set(sit.a.map((a) => situation(sex, ep + 1, flip(b, a.l)).sp));
        assert.equal(targets.size, 4, `${sex}${ep}-${sp}: поступки ведут в ${[...targets]}`);
        sit.a.forEach((a) => { assert.equal(situation(sex, ep + 1, flip(b, a.l)).sp, sphereAfter(sp, a.l)); next.add(flip(b, a.l)); });
      }
      frontier = next;
    }
    assert.ok(finalBits.size > 0);
  }
});

test('все 61 сцена каждой жизни достижима', () => {
  for (const sex of SEXES) assert.equal(reachability(sex).sceneKeys.size, 61, sex);
});

test('случайные жизни расходятся: разные цепочки сцен и разная память', () => {
  for (const sex of SEXES) {
    const lives = Array.from({ length: 200 }, (_, i) => live({ seed: i + 1, sex }));
    const chains = new Set(lives.map((L) => L.scenes.map((sc) => key(sc, sex)).join(' ')));
    assert.ok(chains.size >= 190, `${sex}: различных цепочек сцен ${chains.size} из 200`);
    // в среднем две жизни делят меньше половины сцен
    let shared = 0, pairs = 0;
    for (let i = 0; i < 60; i++) for (let j = i + 1; j < 60; j++) {
      const a = lives[i].scenes, b = lives[j].scenes;
      shared += a.filter((sc, k) => sc.sphere === b[k].sphere).length / 16; pairs++;
    }
    assert.ok(shared / pairs < 0.45, `${sex}: доля общих сцен ${(shared / pairs).toFixed(2)}`);
    let diff = 0;
    for (let i = 0; i < 60; i++) diff += factDiff(lives[i].state, lives[i + 1].state);
    assert.ok(diff / 60 >= 6, `${sex}: в среднем различаются ${diff / 60} фактов памяти`);
  }
});

test('первый же выбор разводит жизнь: после 6 лет — три разных сцены 10 лет', () => {
  for (const sex of SEXES) {
    const sc = buildScene(newGame(sex));
    const next = new Set(sc.choices.map((c) => buildScene(acknowledge(applyChoice(newGame(sex), c.id))).title));
    assert.ok(next.size >= 3, `${sex}: ${[...next]}`);
  }
});

/** Идёт по жизни, на каждом шаге беря первый поступок, если не задан другой. */
function walk(sex, pick) {
  let s = newGame(sex);
  const scenes = [];
  while (!isOver(s)) {
    const sc = buildScene(s);
    scenes.push(sc);
    const c = pick(sc, s) || sc.choices[0];
    s = acknowledge(applyChoice(s, c.id));
  }
  return { s, scenes };
}

test('C1: ранний поступок меняет текст поздних сцен (память работает)', () => {
  for (const sex of SEXES) {
    let found = false;
    for (let seed = 1; seed <= 300 && !found; seed++) {
      const L = live({ seed, sex });
      found = L.scenes.some((sc) => sc.episode >= 8 && sc.sources.some((e) => e <= 5));
    }
    assert.ok(found, `${sex}: сцена зрелости опирается на решение детства`);
    // одинаковый узел и эпизод, разная память — разный текст
    const texts = new Set();
    for (let seed = 1; seed <= 300; seed++) {
      const L = live({ seed, sex });
      const sc = L.scenes[9];
      if (sc.sphere === 0) texts.add(sc.paragraphs.join(' '));
    }
    assert.ok(texts.size >= 3, `${sex}: сцена 51 года в сфере «дом» меняется от прожитого (${texts.size} вариантов)`);
  }
});

test('C2: тот же возраст и память, но другая сфера узла — другая сцена и другие поступки', () => {
  for (const sex of SEXES) {
    let s = newGame(sex);
    const base = live({ seed: 11, sex });
    for (const id of base.ids.slice(0, 9)) s = acknowledge(applyChoice(s, id));
    const scenes = [0b000000, 0b000001, 0b000010, 0b000011].map((b) => buildScene({ ...s, bits: b }));
    assert.equal(new Set(scenes.map((x) => x.sphere)).size, 4);
    assert.equal(new Set(scenes.map((x) => x.title)).size, 4);
    assert.equal(new Set(scenes.map((x) => x.choices.map((c) => c.text).join('|'))).size, 4);
  }
});

test('C3: узел может вернуться в другом возрасте, и герой это узнаёт', () => {
  for (const sex of SEXES) {
    let found = null;
    for (let seed = 1; seed < 500 && !found; seed++) {
      const L = live({ seed, sex });
      const sc = L.scenes.find((x) => x.revisit && x.act !== L.scenes[x.revisit.episode - 1].act);
      if (sc) found = { L, sc };
    }
    assert.ok(found, sex);
    assert.equal(found.L.scenes[found.sc.revisit.episode - 1].hex, found.sc.hex);
    assert.ok(found.sc.paragraphs.some((p) => p.includes('всё это уже было')));
  }
});

test('C4: абляция — без влияния узла сцена зависит только от возраста, и жизни перестают ветвиться', () => {
  for (const sex of SEXES) {
    let s = newGame(sex);
    for (const id of live({ seed: 5, sex }).ids.slice(0, 9)) s = acknowledge(applyChoice(s, id));
    const off = { patternEffect: false };
    const x = buildScene({ ...s, bits: bitsOf(39) }, off), y = buildScene({ ...s, bits: bitsOf(28) }, off);
    assert.equal(x.title, y.title);
    const chains = (pe) => new Set(Array.from({ length: 100 }, (_, i) => live({ seed: i + 1, sex, patternEffect: pe }).scenes.map((sc) => sc.title).join('|'))).size;
    assert.equal(chains(false), 1);
    assert.ok(chains(true) >= 95);
  }
});

test('его и её жизни идут разными сценами в одном возрасте', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const m = live({ seed, sex: 'M' }), f = live({ seed, sex: 'F' });
    m.scenes.forEach((sc, i) => assert.notEqual(sc.paragraphs.join(' '), f.scenes[i].paragraphs.join(' ')));
  }
});

test('choiceId не зависит от позиции кнопки', () => {
  assert.equal(choiceId(3, 5), 'e3-l5');
  const sc = buildScene(newGame());
  sc.choices.forEach((c) => assert.equal(c.id, choiceId(1, c.line)));
});
