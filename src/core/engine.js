// Чистый движок: сцена = возраст (эпизод) × сфера узла-гексаграммы × память. Никаких побочных эффектов.
// Узел решает, какая из четырёх сцен этого возраста случится; поступок меняет одну черту и тем самым
// переводит жизнь в другую сферу. Пол героя — две разные жизни, а не замена окончаний.
import { START_BITS, flip, hexNumber, coords, bitString, popcount } from './hexagram.js';
import { sphere, SPHERES } from './sphere.js';
import { PATTERN_BY_N } from '../data/patterns.js';
import { LIFE, AGES, HEIR, LEGACY, OPENING } from '../data/life.js';
import { PEOPLE } from '../data/people.js';
import { TYPES, LINE_ROLE, ROLE_ORDER, QUAD_ORDER, QUAD_RU, ROLE_RU, QUAD_HINT, ROLE_HINT } from '../data/types.js';

export const TOTAL_EPISODES = 16;
export const SCHEMA_VERSION = 3;
export const ACT_WEIGHTS = [1, 1, 2, 1];
const CHILD_EPISODE = 7; // тридцать пять лет

const AGE_WORDS = {
  6: 'шесть', 10: 'десять', 14: 'четырнадцать', 17: 'семнадцать', 23: 'двадцать три', 28: 'двадцать восемь',
  35: 'тридцать пять', 39: 'тридцать девять', 46: 'сорок шесть', 51: 'пятьдесят один', 55: 'пятьдесят пять',
  59: 'пятьдесят девять', 65: 'шестьдесят пять', 71: 'семьдесят один', 78: 'семьдесят восемь', 84: 'восемьдесят четыре',
};
export function yearsWord(n) {
  const d = n % 10, dd = n % 100;
  if (d === 1 && dd !== 11) return 'год';
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return 'года';
  return 'лет';
}
export const ageText = (age) => `${AGE_WORDS[age] ?? age} ${yearsWord(age)}`;
export const ageOf = (episode) => AGES[episode - 1];

export const actOf = (episode) => Math.floor((episode - 1) / 4); // 0..3

/** Четыре старта: №57 (дом) и соседние узлы, отличающиеся одной из черт 1, 2, 3, — дорога, дело, близкие.
 *  Поэтому уже в шесть лет жизнь начинается в любой из четырёх сторон, и сцен в каждой жизни 16 × 4 = 64. */
export const START_OPTIONS = [0, 1, 2, 4].map((mask) => START_BITS ^ mask);
export const randomStart = (rand = Math.random) => Math.floor(rand() * START_OPTIONS.length);

export function newGame(sex = 'M', start = 0) {
  const b = START_OPTIONS[start] ?? START_BITS;
  return { v: SCHEMA_VERSION, sex: sex === 'F' ? 'F' : 'M', initialBits: b, bits: b, episode: 1, facts: {}, journal: [], acked: 0 };
}

export const isOver = (state) => state.episode > TOTAL_EPISODES;

// ---------- память ----------

const val = (facts, key) => (facts[key] ? facts[key].v : null);

/** Производные факты.
 *  Ребёнок: если к тридцати пяти годам герой в браке, ребёнок есть и дальше остаётся, даже после развода
 *  (в этот момент он записывается в память). Поздний брак ребёнка не создаёт.
 *  «@ключ»: человек уже появлялся в жизни героя, и о нём можно говорить без представления. */
function view(state) {
  const f = {};
  for (const [k, x] of Object.entries(state.facts)) f[k] = x.v;
  if (state.episode === CHILD_EPISODE && f.son === undefined && f.daughter === undefined) {
    if (state.sex === 'M' && f.wife) f.son = true;
    if (state.sex === 'F' && f.husband) f.daughter = true;
  }
  for (const p of PEOPLE[state.sex]) if (f[p.key] !== undefined && f[p.key] !== null) f[`@${p.key}`] = true;
  return f;
}
const isSource = (k) => k[0] !== '@';

/** Условие абзаца или варианта: 'факт', '!факт', 'факт=a|b', несколько через '&'. */
export function holds(cond, f) {
  if (!cond) return true;
  return cond.split('&').every((term) => {
    const t = term.trim();
    if (t.startsWith('!')) {
      const [k, vals] = t.slice(1).split('=');
      if (vals === undefined) return !f[k];
      return !vals.split('|').includes(String(f[k]));
    }
    const [k, vals] = t.split('=');
    if (vals === undefined) return !!f[k];
    return vals.split('|').includes(String(f[k]));
  });
}
const keysOf = (cond) => (cond ? cond.split('&').map((t) => t.trim().replace(/^!/, '').split('=')[0]) : []);

export function heirForms(sex, f) {
  const h = HEIR[sex === 'F' ? 'F' : 'M'];
  return h.pick(f);
}

function fill(text, sex, f) {
  const forms = heirForms(sex, f);
  return text.replace(/\{(heir\w*)\}/g, (m, k) => forms[k] ?? m);
}

// ---------- люди и память ----------

const ageAt = (episode) => `${AGE_WORDS[ageOf(episode)]} ${yearsWord(ageOf(episode))}`;
/** «В десять лет ты …» — как прошлый поступок вспоминается в сцене. */
export const recall = (state, episode) => {
  const j = state.journal[episode - 1];
  return j ? `В ${ageAt(episode)} ты ${j.echo}.` : null;
};

/** Состояние человека по факту памяти. */
function personStatus(p, value) {
  if (value === null || value === undefined || value === false) return null;
  return p.st[String(value)] ?? null;
}

const CHILD_STATUS = { M: ['растёт', 'вырос', 'сам уже отец'], F: ['растёт', 'выросла', 'сама уже мама'] };

/** Люди жизни, которых герой уже встретил, в порядке появления. */
export function peopleOf(state) {
  const f = view(state);
  const out = [];
  for (const p of PEOPLE[state.sex]) {
    let status = personStatus(p, f[p.key]);
    if (!status) continue;
    const child = p.key === 'son' || p.key === 'daughter';
    if (child) {
      const [young, grown, parent] = CHILD_STATUS[state.sex];
      status = f.successor === 'heir' ? 'продолжает твоё дело' : state.episode > 13 ? parent : state.episode > 9 ? grown : young;
    }
    const name = child ? heirForms(state.sex, f).heir : p.name;
    const src = state.facts[p.key] ? state.facts[p.key].src : (state.facts.wife || state.facts.husband || { src: 7 }).src;
    out.push({ key: p.key, name, who: p.who, status, since: src });
  }
  return out.sort((a, b) => a.since - b.since);
}

/** Кто из людей изменился после поступка: «Лёша это запомнит». */
function remembered(sex, before, after) {
  const out = [];
  for (const p of PEOPLE[sex]) {
    if (p.key === 'son' || p.key === 'daughter') continue;
    const a = after[p.key] ? after[p.key].v : undefined;
    const b = before[p.key] ? before[p.key].v : undefined;
    if (a === undefined || a === b) continue;
    const status = personStatus(p, a);
    if (status) out.push({ key: p.key, name: p.name, status });
  }
  return out;
}

/** Последний поступок, после которого изменились отношения с человеком. */
function lastWith(state, key) {
  const x = state.facts[key];
  return x ? x.src : null;
}

// ---------- сцена ----------

export function choiceId(episode, line) {
  return `e${episode}-l${line}`;
}

export function situation(sex, episode, bits) {
  const ep = LIFE[sex === 'F' ? 'F' : 'M'][episode - 1];
  const sp = sphere(bits);
  const sit = ep.s[sp];
  if (!sit) throw new Error(`no situation for ${sex} e${episode} sphere ${sp}`);
  return { ep, sp, sit };
}

function resolveAction(a, f, sex, sources, facts) {
  const out = { line: a.l, text: a.t, cost: a.c, note: a.n, echo: a.e, set: a.s || {} };
  for (const v of a.alt || []) {
    if (holds(v.if, f)) {
      for (const [k, kk] of [['t', 'text'], ['c', 'cost'], ['n', 'note'], ['e', 'echo'], ['s', 'set']]) if (v[k] !== undefined) out[kk] = v[k];
      keysOf(v.if).forEach((k) => isSource(k) && facts[k] && sources.add(facts[k].src));
      break;
    }
  }
  for (const k of ['text', 'cost', 'note', 'echo']) out[k] = fill(out[k], sex, f);
  return out;
}

/** Ранние сцены той же гексаграммы в этой жизни. */
export function sceneHexes(state) {
  const list = [{ episode: 1, hex: hexNumber(state.initialBits), bits: state.initialBits }];
  state.journal.forEach((j, i) => { if (i + 2 <= TOTAL_EPISODES) list.push({ episode: i + 2, hex: hexNumber(j.to), bits: j.to }); });
  return list;
}

/** Экран эпизода. opts.patternEffect=false — абляция (только для тестов и отладки): сфера всегда «дом» при наличии. */
export function buildScene(state, opts = {}) {
  if (isOver(state)) throw new Error('life is over');
  const patternEffect = opts.patternEffect !== false;
  const f = view(state);
  let { ep, sp, sit } = situation(state.sex, state.episode, state.bits);
  if (!patternEffect) {
    const first = Object.keys(ep.s).map(Number).sort()[0];
    sp = first; sit = ep.s[first];
  }
  const hex = hexNumber(state.bits);
  const sources = new Set();
  const paragraphs = [];

  if (sp === 0 && f.base === 'away') paragraphs.push(state.sex === 'F' ? 'Ты снова живёшь дома, в городе своего детства.' : 'Ты снова живёшь в Заречье.');
  for (const piece of sit.p) {
    const [cond, text] = Array.isArray(piece) ? piece : [null, piece];
    if (!holds(cond, f)) continue;
    keysOf(cond).forEach((k) => isSource(k) && state.facts[k] && sources.add(state.facts[k].src));
    paragraphs.push(fill(text, state.sex, f));
  }

  let revisit = null;
  if (patternEffect) {
    // Узнавание показываем редко: один раз за жизнь и только когда узел возвращается спустя годы.
    const earlier = sceneHexes(state).filter((s) => s.hex === hex && s.episode <= ep.n - 4);
    const shownBefore = state.journal.some((j) => j.revisit);
    if (earlier.length && !shownBefore) {
      const first = earlier[0];
      revisit = { episode: first.episode, hex };
      paragraphs.push(`Странное чувство: всё это уже было, когда тебе было ${ageText(ageOf(first.episode))}. Тот же выбор, только ставки другие.`);
    }
  }

  const all = sit.a.map((a) => {
    const before = new Set(sources);
    const r = resolveAction(a, f, state.sex, sources, state.facts);
    const to = flip(state.bits, a.l);
    const echoOf = [...sources].filter((e) => !before.has(e));
    const next = ep.n < TOTAL_EPISODES ? situation(state.sex, ep.n + 1, to) : null;
    return { id: choiceId(ep.n, a.l), ...r, role: LINE_ROLE[a.l], to, toHex: hexNumber(to), toSphere: sphere(to),
      toTitle: next ? next.sit.title : null, memory: echoOf };
  });
  const shown = [...all].sort((a, b) => ((a.line * 5 + ep.n * 3 + sp) % 7) - ((b.line * 5 + ep.n * 3 + sp) % 7) || a.line - b.line);
  const lines = shown.map((c) => c.line);

  // Память сцены: поступки, от которых зависит текст, и последние встречи с людьми, о которых идёт речь.
  const said = [...paragraphs, ...all.map((c) => c.text)].join(' ');
  const memEps = new Set([...sources].filter((e) => e < ep.n));
  for (const p of PEOPLE[state.sex]) {
    if (!p.re || !p.re.test(said)) continue;
    const e = lastWith(state, p.key);
    if (e && e < ep.n) memEps.add(e);
  }
  const memory = [...memEps].sort((a, b) => b - a).slice(0, 3).sort((a, b) => a - b)
    .map((e) => ({ episode: e, age: ageOf(e), text: recall(state, e) })).filter((m) => m.text);

  return {
    episode: ep.n, age: ep.age, ageText: ageText(ep.age), title: sit.title, act: actOf(ep.n),
    sphere: sp, sphereRu: SPHERES[sp], img: `${state.sex}${ep.n}-${sp}`,
    hex, pattern: PATTERN_BY_N[hex], paragraphs, revisit, memory, people: peopleOf(state),
    hidden: [1, 2, 3, 4, 5, 6].filter((l) => !lines.includes(l)),
    choices: shown.map(({ id, line, text, cost, toHex, toSphere, toTitle, memory: m }) => ({
      id, line, text, cost, toHex, toSphere, toSphereRu: SPHERES[toSphere], toTitle,
      memory: m.filter((e) => e < ep.n).map((e) => recall(state, e)).filter(Boolean) })),
    allChoices: all,
    sources: [...sources].sort((a, b) => a - b),
  };
}

export function applyChoice(state, id, opts = {}) {
  if (isOver(state)) throw new Error('life is over');
  if (state.acked !== state.journal.length) throw new Error('previous result not acknowledged');
  const scene = buildScene(state, opts);
  const full = scene.allChoices.find((c) => c.id === id);
  if (!full) throw new Error(`choice ${id} is not offered in episode ${state.episode}`);
  const to = flip(state.bits, full.line);
  if (popcount(state.bits ^ to) !== 1) throw new Error('invariant: exactly one line');

  const facts = { ...state.facts };
  if (scene.sphere === 0 && facts.base && facts.base.v === 'away') facts.base = { v: 'home', src: state.episode };
  // Ребёнок, который есть в тридцать пять, остаётся в жизни героя навсегда.
  const fv = view(state);
  if (fv.son && !facts.son) facts.son = { v: true, src: (facts.wife || { src: state.episode }).src };
  if (fv.daughter && !facts.daughter) facts.daughter = { v: true, src: (facts.husband || { src: state.episode }).src };
  for (const [k, v] of Object.entries(full.set)) facts[k] = { v, src: state.episode };
  // Кого герой уже видел в тексте сцены, в вариантах поступков или в итоге.
  const seen = [...scene.paragraphs, ...scene.choices.map((c) => `${c.text} ${c.cost}`), full.note].join(' ');
  for (const p of PEOPLE[state.sex]) {
    if (!p.re || p.key === 'father' || p.key === 'mother' || facts[`@${p.key}`]) continue;
    if (p.re.test(seen)) facts[`@${p.key}`] = { v: true, src: state.episode };
  }
  // Преемник фиксируется в момент передачи, чтобы имя не менялось задним числом.
  if (full.set.successor === 'heir') {
    const h = heirForms(state.sex, view({ ...state, facts }));
    facts.heirName = { v: h.heir, src: state.episode };
  }

  const remembers = remembered(state.sex, state.facts, facts);
  const entry = {
    episode: state.episode, choiceId: id, line: full.line, role: full.role, from: state.bits, to, remembers,
    fromHex: scene.hex, toHex: hexNumber(to), sphere: scene.sphere, toSphere: sphere(to), title: scene.title, img: scene.img,
    text: full.text, cost: full.cost, note: full.note, echo: full.echo,
    sources: scene.sources, revisit: scene.revisit,
  };
  return { ...state, bits: to, episode: state.episode + 1, facts, journal: [...state.journal, entry] };
}

export const acknowledge = (state) => ({ ...state, acked: state.journal.length });
export const pendingResult = (state) => (state.acked < state.journal.length ? state.journal[state.journal.length - 1] : null);

/** Крючок следующей сцены: строка или список [условие, строка], первый подходящий. */
function hookOf(hook, sex, f) {
  if (!hook) return null;
  for (const piece of Array.isArray(hook) ? hook : [hook]) {
    const [cond, text] = Array.isArray(piece) ? piece : [null, piece];
    if (holds(cond, f)) return fill(text, sex, f);
  }
  return null;
}

/** Развилка после поступка: куда повернула жизнь и какие сцены закрылись. */
export function forkOf(state, j = pendingResult(state)) {
  if (!j || j.episode >= TOTAL_EPISODES) return null;
  const { sit: from } = situation(state.sex, j.episode, j.from);
  const next = situation(state.sex, j.episode + 1, j.to);
  const closed = [];
  for (const a of from.a) {
    const t = situation(state.sex, j.episode + 1, flip(j.from, a.l));
    if (t.sp !== next.sp && !closed.find((c) => c.sphere === t.sp)) closed.push({ sphere: t.sp, sphereRu: SPHERES[t.sp], title: t.sit.title });
  }
  const f = view(state);
  return {
    age: ageOf(j.episode + 1), ageText: ageText(ageOf(j.episode + 1)), years: ageOf(j.episode + 1) - ageOf(j.episode),
    sphere: next.sp, sphereRu: SPHERES[next.sp], title: next.sit.title, hook: hookOf(next.sit.hook, state.sex, f),
    closed: closed.sort((a, b) => a.sphere - b.sphere),
  };
}

/** Все сцены жизни: ключ → название (для карты жизни). */
export function sceneMap(sex) {
  const out = [];
  LIFE[sex === 'F' ? 'F' : 'M'].forEach((ep) => {
    out.push({ episode: ep.n, age: ep.age, scenes: [0, 1, 2, 3].map((sp) => (ep.s[sp] ? { sphere: sp, key: `${sex}${ep.n}-${sp}`, title: ep.s[sp].title } : null)) });
  });
  return out;
}

// ---------- тип ----------

/** Доли квадр одного решения по координатам узла, в который оно привело. */
export function quadShares(bits) {
  const { x, y } = coords(bits);
  const a = (x + 0.5) / 8, v = (y + 0.5) / 8;
  return { air: a * v, fire: a * (1 - v), water: (1 - a) * v, earth: (1 - a) * (1 - v) };
}

/** Доли в процентах с точностью до сотых, сумма ровно 100,00 (метод наибольших остатков). */
export function largestRemainder(values, keys) {
  const total = keys.reduce((s, k) => s + values[k], 0) || 1;
  const raw = keys.map((k) => ({ k, x: (values[k] / total) * 10000 }));
  const out = Object.fromEntries(raw.map((r) => [r.k, Math.floor(r.x)]));
  let left = 10000 - raw.reduce((s, r) => s + Math.floor(r.x), 0);
  raw.sort((p, q) => (q.x - Math.floor(q.x)) - (p.x - Math.floor(p.x)) || keys.indexOf(p.k) - keys.indexOf(q.k));
  for (let i = 0; left > 0; i++, left--) out[raw[i % raw.length].k]++;
  return Object.fromEntries(keys.map((k) => [k, out[k] / 100]));
}

/** Ведущий ключ; ничья: вклад III акта, затем самое позднее различающее решение, затем порядок ключей. */
function leader(keys, total, act3, perDecision) {
  const eps = 1e-9;
  const top = Math.max(...keys.map((k) => total[k]));
  let cand = keys.filter((k) => top - total[k] < eps);
  if (cand.length > 1) {
    const m = Math.max(...cand.map((k) => act3[k]));
    cand = cand.filter((k) => m - act3[k] < eps);
  }
  for (let i = perDecision.length - 1; i >= 0 && cand.length > 1; i--) {
    const d = perDecision[i];
    const m = Math.max(...cand.map((k) => d[k] || 0));
    cand = cand.filter((k) => m - (d[k] || 0) < eps);
  }
  return cand[0];
}

export function typeProfile(state) {
  const quad = Object.fromEntries(QUAD_ORDER.map((k) => [k, 0]));
  const role = Object.fromEntries(ROLE_ORDER.map((k) => [k, 0]));
  const quad3 = { ...quad }, role3 = { ...role };
  const perQuad = [], perRole = [];
  state.journal.forEach((j) => {
    const act = actOf(j.episode);
    const w = ACT_WEIGHTS[act];
    const q = quadShares(j.to);
    for (const k of QUAD_ORDER) { quad[k] += w * q[k]; if (act === 2) quad3[k] += w * q[k]; }
    const r = LINE_ROLE[j.line];
    role[r] += w; if (act === 2) role3[r] += w;
    perQuad.push(q); perRole.push({ [r]: 1 });
  });
  const q = leader(QUAD_ORDER, quad, quad3, perQuad);
  const r = leader(ROLE_ORDER, role, role3, perRole);
  return {
    quad: q, role: r, name: TYPES[q][r].name,
    quadShares: largestRemainder(quad, QUAD_ORDER), roleShares: largestRemainder(role, ROLE_ORDER),
  };
}

export const words = (s) => s.split(/\s+/).filter(Boolean).length;

const gen = (sex, m, f) => (sex === 'F' ? f : m);

/** Портрет: основа типа + 3–4 решения, которые его подтверждают. */
function portrait(state, profile) {
  const base = TYPES[profile.quad][profile.role].base.replace(/\{([^{}|]*)\|([^{}|]*)\}/g, (_, m, fe) => gen(state.sex, m, fe));
  const scored = state.journal.map((j, i) => ({
    i, j, s: (LINE_ROLE[j.line] === profile.role ? 2 : 0) + quadShares(j.to)[profile.quad] + ACT_WEIGHTS[actOf(j.episode)] * 0.1,
  })).filter((x) => x.j.episode < TOTAL_EPISODES).sort((a, b) => b.s - a.s || b.i - a.i);
  const picked = scored.slice(0, 4).sort((a, b) => a.i - b.i);
  const pieces = [];
  const evidence = [];
  const deeds = [];
  for (const { j } of picked) {
    const age = ageOf(j.episode);
    const e = `в ${AGE_WORDS[age]} ${yearsWord(age)} ты ${j.echo}`;
    const s = pieces.length ? `${e.charAt(0).toUpperCase()}${e.slice(1)}.` : `Это видно по твоим поступкам: ${e}.`;
    if (evidence.length >= 3 && words([base, ...pieces, s].join(' ')) > 130) break;
    pieces.push(s); evidence.push(j.episode);
    deeds.push({ episode: j.episode, age, text: `${j.echo.charAt(0).toUpperCase()}${j.echo.slice(1)}` });
  }
  // Основа типа — четыре предложения: суть, два о человеке, цена («Цена была в том, что …»).
  const sentences = base.match(/[^.!?]+[.!?]+(?:\s|$)/g).map((x) => x.trim());
  const priceAt = sentences.findIndex((x) => x.startsWith('Цена была в том, что'));
  const priceRaw = priceAt >= 0 ? sentences[priceAt].replace(/^Цена была в том, что,?\s+/, '') : '';
  return {
    text: [base, ...pieces].join(' '), evidence, deeds,
    essence: sentences[0],
    about: sentences.slice(1, priceAt >= 0 ? priceAt : undefined).join(' '),
    price: priceRaw && `${priceRaw.charAt(0).toUpperCase()}${priceRaw.slice(1)}`,
  };
}

// ---------- эпилог ----------

export function buildEpilogue(state) {
  if (!isOver(state)) throw new Error('life is not over');
  const f = view(state);
  const finalHex = hexNumber(state.bits);
  const fp = PATTERN_BY_N[finalHex];
  const last = state.journal[state.journal.length - 1];

  const legacy = [];
  for (const rule of LEGACY[state.sex]) {
    if (holds(rule.if, f)) legacy.push(fill(rule.t, state.sex, f));
    if (legacy.length >= 4) break;
  }

  const refCount = {};
  for (const j of state.journal) for (const s of j.sources) refCount[s] = (refCount[s] || 0) + 1;
  const all = Object.entries(refCount)
    .map(([e, c]) => ({ e: Number(e), c }))
    .filter((r) => r.e < TOTAL_EPISODES)
    .sort((a, b) => b.c - a.c || a.e - b.e);
  const picked = [];
  for (const [lo, hi] of [[1, 4], [5, 8], [9, 15]]) {
    const best = all.find((r) => r.e >= lo && r.e <= hi);
    if (best) picked.push(best);
  }
  for (const r of all) if (picked.length < 3 && !picked.includes(r)) picked.push(r);
  for (const e of [1, 6, 10, 13]) if (picked.length < 3 && !picked.find((p) => p.e === e)) picked.push({ e, c: 0 });
  const references = picked.sort((a, b) => a.e - b.e).map(({ e, c }) => {
    const j = state.journal[e - 1];
    const age = ageOf(e);
    return { episode: e, age, count: c, text: `В ${AGE_WORDS[age]} ${yearsWord(age)} ты ${j.echo}.` };
  });

  const hexes = sceneHexes(state);
  const seen = {};
  hexes.forEach((s) => { (seen[s.hex] = seen[s.hex] || []).push(ageOf(s.episode)); });
  const repeated = Object.entries(seen).filter(([, ages]) => ages.length > 1)
    .map(([hex, ages]) => ({ hex: Number(hex), motif: PATTERN_BY_N[hex].motif, ages }));

  const route = state.journal.map((j) => {
    const p = PATTERN_BY_N[j.fromHex];
    return { episode: j.episode, age: ageOf(j.episode), hex: j.fromHex, motif: p.motif, variation: p.variation, quadrum: p.quadrum, line: j.line, role: LINE_ROLE[j.line], sphere: SPHERES[j.sphere], title: j.title, choice: j.text };
  });

  const lineFlips = [0, 0, 0, 0, 0, 0];
  state.journal.forEach((j) => lineFlips[j.line - 1]++);

  const profile = typeProfile(state);
  const p = portrait(state, profile);
  const g = (t) => t.replace(/\{([^{}|]*)\|([^{}|]*)\}/g, (_, m, fe) => gen(state.sex, m, fe));

  return {
    opening: `${OPENING[state.sex]} В последний свой вечер ты ${last.echo}.`,
    legacy,
    references,
    type: {
      ...profile,
      quadRu: QUAD_RU[profile.quad], roleRu: ROLE_RU[profile.role],
      hint: g(`Больше всего в этой жизни было стихии «${QUAD_RU[profile.quad]}»: ${QUAD_HINT[profile.quad]}. А поступал{|а} ты чаще всего как ${ROLE_RU[profile.role]}: ${ROLE_HINT[profile.role]}.`),
      quadHint: QUAD_HINT[profile.quad], roleHint: g(ROLE_HINT[profile.role]),
      portrait: p.text, evidence: p.evidence,
      essence: p.essence, about: p.about, price: p.price, deeds: p.deeds,
    },
    final: {
      hex: finalHex, motif: fp.motif, bits: bitString(state.bits), ...coords(state.bits),
      text: `Если коротко назвать то, чем закончилась твоя жизнь, вышло бы «${fp.motif.toLowerCase()}». После тебя остался вопрос: ${fp.hook}.`,
    },
    repeated, route, lineFlips,
    distinctNodes: Object.keys(seen).length,
    people: peopleOf(state),
    path: state.journal.map((j) => `${state.sex}${j.episode}-${j.sphere}`),
  };
}
