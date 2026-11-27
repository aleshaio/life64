import test from 'node:test';
import assert from 'node:assert/strict';
import { reachability, live, factDiff } from '../src/core/sim.js';
import { popcount } from '../src/core/hexagram.js';
import { newGame } from '../src/core/engine.js';

test('все 64 узла показываются на экране хотя бы в одном эпизоде (точный перебор 4 показанных вариантов)', () => {
  const R = reachability(true);
  assert.equal(R.sceneNodes.size, 64);
});

test('финальных конфигураций ровно 32, все одной чётности со стартом', () => {
  const R = reachability(true);
  assert.equal(R.finalBits.size, 32);
  const p = popcount(newGame().bits) % 2;
  for (const b of R.finalBits) assert.equal(popcount(b) % 2, p);
});

test('две случайные жизни различаются хотя бы в нескольких фактах памяти (события, отношения, обязательства)', () => {
  for (let seed = 1; seed <= 400; seed += 2) {
    const a = live({ seed }).state, b = live({ seed: seed + 1 }).state;
    assert.ok(factDiff(a, b) >= 2, `seed ${seed}`);
  }
});
