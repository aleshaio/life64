// Прогоняет тысячи жизней и печатает отчёт о ветвлении и разнообразии.
import { live, reachability, factDiff } from '../src/core/sim.js';
import { LIFE } from '../src/data/life.js';

const N = Number(process.argv[2] || 5000);
const fmt = (x) => (Math.round(x * 100) / 100).toString().replace('.', ',');

function report(sex, patternEffect) {
  const R = reachability(sex);
  const lives = [];
  const keys = new Map();
  const chains = new Set();
  const textSets = new Set();
  for (let seed = 1; seed <= N; seed++) {
    const L = live({ seed, sex, patternEffect });
    lives.push(L);
    chains.add(L.scenes.map((sc) => `${sc.episode}-${sc.sphere}`).join(' '));
    for (const sc of L.scenes) {
      const k = `${sex}${sc.episode}-${sc.sphere}`;
      keys.set(k, (keys.get(k) || 0) + 1);
      textSets.add(sc.episode + '|' + sc.paragraphs.join(' '));
    }
  }
  let sum = 0, pairs = 0, minD = Infinity, shared = 0;
  for (let i = 0; i + 1 < Math.min(lives.length, 2000); i += 2) {
    const a = lives[i], b = lives[i + 1];
    const d = factDiff(a.state, b.state);
    sum += d; pairs++; minD = Math.min(minD, d);
    shared += a.scenes.filter((sc, k) => sc.sphere === b.scenes[k].sphere).length;
  }
  const revisits = lives.filter((L) => L.state.journal.some((j) => j.revisit)).length;
  return { R, keys, chains: chains.size, texts: textSets.size, avgDiff: sum / pairs, minD, shared: shared / pairs, revisits };
}

for (const sex of ['M', 'F']) for (const pe of [true, false]) {
  const r = report(sex, pe);
  console.log(`\n=== ${sex === 'M' ? 'Герой' : 'Героиня'} · patternEffect: ${pe} · ${N} случайных жизней ===`);
  if (pe) {
    console.log(`Сцен, достижимых точным перебором: ${r.R.sceneKeys.size} из ${LIFE[sex].reduce((n, e) => n + Object.keys(e.s).length, 0)}; узлов на экране: ${r.R.sceneNodes.size} из 64`);
    const rare = [...r.keys.entries()].sort((a, b) => a[1] - b[1]).slice(0, 3);
    console.log(`Реже всего встречаются: ${rare.map(([k, c]) => `${k} — ${fmt((c / N) * 100)}%`).join(', ')}`);
  }
  console.log(`Различных цепочек сцен: ${r.chains} из ${N}; уникальных текстов сцен: ${r.texts}`);
  console.log(`Две случайные жизни делят в среднем ${fmt(r.shared)} сцен из 16 и различаются по ${fmt(r.avgDiff)} фактам памяти (минимум ${r.minD})`);
  console.log(`Жизней с возвратом узла: ${fmt((r.revisits / N) * 100)}%`);
}

// Распределение итоговых типов по 5000 жизням героя и 5000 жизням героини.
{
  const { buildEpilogue } = await import('../src/core/engine.js');
  const { live: lv } = await import('../src/core/sim.js');
  const count = {};
  const N = 5000;
  for (let seed = 1; seed <= N; seed++) for (const sex of ['M', 'F']) {
    const t = buildEpilogue(lv({ seed, sex }).state).type.name;
    count[t] = (count[t] || 0) + 1;
  }
  console.log(`\n=== Итоговые типы · ${2 * N} жизней (герой и героиня) ===`);
  console.log(`Достигнуто типов: ${Object.keys(count).length} из 16`);
  for (const [t, c] of Object.entries(count).sort((a, b) => b[1] - a[1])) console.log(`${t}: ${(100 * c / (2 * N)).toFixed(1).replace('.', ',')}%`);
}
