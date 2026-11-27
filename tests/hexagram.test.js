import test from 'node:test';
import assert from 'node:assert/strict';
import { KING_WEN, coords, bitsFromCoords, hexNumber, bitsOf, flip, neighbours, popcount, bitString, START_BITS } from '../src/core/hexagram.js';
import { PATTERNS } from '../src/data/patterns.js';

test('таблица Вэнь-вана: 8×8, ровно 64 уникальных номера 1..64', () => {
  assert.equal(KING_WEN.length, 8);
  KING_WEN.forEach((row) => assert.equal(row.length, 8));
  const all = KING_WEN.flat();
  assert.equal(new Set(all).size, 64);
  assert.deepEqual([...all].sort((a, b) => a - b), Array.from({ length: 64 }, (_, i) => i + 1));
});

test('прямое и обратное отображение биты ↔ номер корректны', () => {
  for (let b = 0; b < 64; b++) {
    assert.equal(bitsOf(hexNumber(b)), b);
    const { x, y } = coords(b);
    assert.equal(bitsFromCoords(x, y), b);
  }
});

test('контрольные точки ТЗ: (1,2) → №39, (2,1) → №4, старт №57 = 011011', () => {
  assert.equal(KING_WEN[2][1], 39);
  assert.equal(KING_WEN[1][2], 4);
  assert.equal(hexNumber(START_BITS), 57);
  assert.equal(bitString(START_BITS), '011011');
});

test('у каждого из 64 состояний ровно 6 различных соседей на расстоянии Хэмминга 1, двойной переворот возвращает узел', () => {
  for (let b = 0; b < 64; b++) {
    const ns = neighbours(b);
    assert.equal(new Set(ns).size, 6);
    ns.forEach((n) => assert.equal(popcount(b ^ n), 1));
    for (let l = 1; l <= 6; l++) assert.equal(flip(flip(b, l), l), b);
  }
});

test('переворот черт 2,3,5,6 не меняет квадру; 1 и 4 меняют', () => {
  const q = (b) => { const { x, y } = coords(b); return `${x >= 4}${y >= 4}`; };
  for (let b = 0; b < 64; b++) {
    for (const l of [2, 3, 5, 6]) assert.equal(q(flip(b, l)), q(b));
    for (const l of [1, 4]) assert.notEqual(q(flip(b, l)), q(b));
  }
});

test('flip отвергает недопустимые черты', () => {
  assert.throws(() => flip(0, 0));
  assert.throws(() => flip(0, 7));
  assert.throws(() => flip(0, 1.5));
});

test('координаты каталога совпадают с таблицей Вэнь-вана', () => {
  for (const p of PATTERNS) assert.equal(KING_WEN[p.y][p.x], p.n, `№${p.n}`);
});
