import test from 'node:test';
import assert from 'node:assert/strict';
import { serialize, deserialize, storage, SAVE_KEY } from '../src/core/save.js';
import { newGame, buildScene, applyChoice, acknowledge, pendingResult } from '../src/core/engine.js';
import { live } from '../src/core/sim.js';

function memLS() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

test('сохранение и восстановление середины жизни дают ту же ситуацию', () => {
  let s = newGame();
  for (let i = 0; i < 7; i++) s = acknowledge(applyChoice(s, buildScene(s).choices[i % 4].id));
  const r = deserialize(serialize(s));
  assert.equal(r.bits, s.bits);
  assert.equal(r.episode, s.episode);
  assert.deepEqual(buildScene(r), buildScene(s));
});

test('непросмотренный результат после выбора сохраняется и показывается снова', () => {
  let s = newGame();
  s = applyChoice(s, buildScene(s).choices[2].id);
  const r = deserialize(serialize(s));
  assert.ok(pendingResult(r));
  assert.equal(pendingResult(r).result, pendingResult(s).result);
});

test('законченная жизнь восстанавливается целиком', () => {
  const { state } = live({ seed: 9 });
  const r = deserialize(serialize(state));
  assert.equal(r.episode, 17);
  assert.equal(r.bits, state.bits);
});

test('повреждённые данные отвергаются, а не превращаются в ложную биографию', () => {
  let s = newGame();
  for (let i = 0; i < 3; i++) s = acknowledge(applyChoice(s, buildScene(s).choices[0].id));
  const good = serialize(s);
  assert.equal(deserialize('{не json'), null);
  assert.equal(deserialize(good.replace('"acked":3', '"acked":2')), null, 'checksum');
  const d = JSON.parse(good);
  d.journal[1].choiceId = 'e2-l9';
  assert.equal(deserialize(JSON.stringify(d)), null);
  const e = JSON.parse(good); e.schemaVersion = 99;
  assert.equal(deserialize(JSON.stringify(e)), null);
});

test('подделанный журнал с правильной суммой, но непоказанным выбором, отвергается', () => {
  let s = newGame();
  const sc = buildScene(s);
  const bad = { ...s, journal: [{ episode: 1, choiceId: `e1-l${sc.hidden[0]}`, line: sc.hidden[0], from: s.bits, to: s.bits ^ (1 << (sc.hidden[0] - 1)) }], bits: s.bits ^ (1 << (sc.hidden[0] - 1)), episode: 2, acked: 1 };
  assert.equal(deserialize(serialize(bad)), null);
});

test('обёртка хранилища: сохранить, загрузить, очистить; сломанное хранилище не роняет игру', () => {
  const ls = memLS();
  let s = acknowledge(applyChoice(newGame(), buildScene(newGame()).choices[0].id));
  assert.ok(storage.save(ls, s));
  assert.ok(storage.exists(ls));
  assert.equal(storage.load(ls).bits, s.bits);
  storage.clear(ls);
  assert.equal(storage.load(ls), null);
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('x'); } };
  assert.equal(storage.load(broken), null);
  assert.equal(storage.save(broken, s), false);
  assert.doesNotThrow(() => storage.clear(broken));
  ls.setItem(SAVE_KEY, 'мусор');
  assert.equal(storage.load(ls), null);
});
