// Симуляции и анализ достижимости. Используются тестами и scripts/simulate.mjs.
import { newGame, buildScene, applyChoice, acknowledge, isOver, situation, TOTAL_EPISODES } from './engine.js';
import { flip, hexNumber, popcount } from './hexagram.js';

/** Детерминированный ГПСЧ (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Прожить жизнь по списку id или по случайному выбору. */
export function live({ seed = 1, ids = null, patternEffect = true, sex = 'M' } = {}) {
  const r = rng(seed);
  let s = newGame(sex);
  const opts = { patternEffect };
  const scenes = [];
  while (!isOver(s)) {
    const sc = buildScene(s, opts);
    scenes.push(sc);
    const id = ids ? ids[s.episode - 1] : sc.choices[Math.floor(r() * sc.choices.length)].id;
    s = acknowledge(applyChoice(s, id, opts));
  }
  return { state: s, scenes, ids: s.journal.map((j) => j.choiceId) };
}

/** Точная достижимость по показываемым 4 вариантам: какие узлы и сцены видны на экране и какие финальны. */
export function reachability(sex = 'M') {
  let frontier = new Set([newGame(sex).bits]);
  const sceneNodes = new Set();
  const sceneKeys = new Set();
  const perEpisode = [];
  for (let ep = 1; ep <= TOTAL_EPISODES; ep++) {
    const next = new Set();
    for (const b of frontier) {
      sceneNodes.add(hexNumber(b));
      const { sp, sit } = situation(sex, ep, b);
      sceneKeys.add(`${sex}${ep}-${sp}`);
      for (const a of sit.a) next.add(flip(b, a.l));
    }
    perEpisode.push(frontier.size);
    frontier = next;
  }
  const finals = [...frontier].map(hexNumber);
  return { sceneNodes, sceneKeys, finalNodes: new Set(finals), finalBits: frontier, perEpisode };
}

/** Насколько две жизни различаются по фактам памяти. */
export function factDiff(a, b) {
  const keys = new Set([...Object.keys(a.facts), ...Object.keys(b.facts)]);
  keys.delete('heirName');
  let d = 0;
  for (const k of keys) if ((a.facts[k] && a.facts[k].v) !== (b.facts[k] && b.facts[k].v)) d++;
  return d;
}

export const parity = (bits) => popcount(bits) % 2;
