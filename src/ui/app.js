// Интерфейс «Колода жизни»: старт (его или её жизнь), сцена-карта и четыре карты поступков,
// итог поступка с развилкой, финал с картой-типом. Внизу экранов — путь по И-Цзин. Скрытая отладка: ?debug=1.
import { newGame, buildScene, applyChoice, acknowledge, isOver, pendingResult, buildEpilogue, ageText, ageOf, forkOf, sceneMap, yearsWord, TOTAL_EPISODES, START_OPTIONS } from '../core/engine.js';
import { storage } from '../core/save.js';
import { AGES } from '../data/life.js';
import { imageFor, portraitFor, ageFor, PORTRAIT_AGES } from '../data/images.js';
import { QUAD_ORDER, ROLE_ORDER, QUAD_RU, ROLE_RU } from '../data/types.js';
import { PATTERN_BY_N } from '../data/patterns.js';
import { coords, bitString, glyph, line, hexNumber } from '../core/hexagram.js';

const root = document.getElementById('app');
const hud = document.getElementById('hud');
const DEBUG = /[?&]debug=1/.test(location.search) || location.hash === '#debug';
const LS = (() => { try { return window.localStorage; } catch { return null; } })();
const calm = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

let state = null;
let busy = false;
let confirmRestart = false;
let debugOpts = { patternEffect: true };

// Русская типографика: короткие слова и числа не остаются в конце строки, тире и частицы не начинают новую.
const SHORT_WORD = /^[«„"(]*(?:[а-яёА-ЯЁ]{1,2}|\d+)$/;
const GLUE_BEFORE = /^(?:[—–]|же|ли|бы)(?=$|[.,!?:;»)])/;
function typo(text) {
  const parts = String(text).split(' ');
  let out = parts[0];
  for (let i = 1; i < parts.length; i++) {
    // короткое последнее слово длинной фразы тоже не остаётся одно на строке
    const lastShort = i === parts.length - 1 && parts.length >= 5 && parts[i].length <= 7;
    out += (SHORT_WORD.test(parts[i - 1]) || GLUE_BEFORE.test(parts[i]) || lastShort ? '\u00A0' : ' ') + parts[i];
  }
  return out;
}

const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
  }
  const raw = tag === 'pre' || tag === 'textarea';
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(raw ? kid : typo(kid)));
  return n;
};
const g = (t) => t.replace(/\{([^{}|]*)\|([^{}|]*)\}/g, (_, m, f) => (state && state.sex === 'F' ? f : m));

// Четыре стороны жизни. Каждая карта поступка ведёт в свою: три поворачивают жизнь, одна оставляет её там, где она есть.
const SUITS = [
  { name: 'Дом', to: 'к дому', stay: 'дома' },
  { name: 'Дорога', to: 'в дорогу', stay: 'в дороге' },
  { name: 'Дело', to: 'к делу', stay: 'при деле' },
  { name: 'Близкие', to: 'к близким', stay: 'с близкими' },
];
const turnText = (from, to, done) => (from === to ? `Жизнь ${done ? 'осталась' : 'останется'} ${SUITS[to].stay}` : `Жизнь ${done ? 'повернула' : 'повернёт'} ${SUITS[to].to}`);
const ICON_PATHS = [
  ['M3.5 11.5 12 4l8.5 7.5', 'M6 10v10h12V10', 'M10 20v-5h4v5'],
  ['M12 3v18', 'M12 5h6.5l2 2.25-2 2.25H12', 'M12 12H5.5l-2 2.25 2 2.25H12'],
  ['M4 8h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z', 'M9 8V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V8', 'M3 13.5h18'],
  ['M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z'],
];
function icon(sp) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'ico');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ICON_PATHS[sp]) { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); svg.append(p); }
  return svg;
}
const suitChip = (sp, text = SUITS[sp].name) => el('span', { class: `suit sp${sp}` }, icon(sp), text);

/** Гексаграмма И-Цзин: шесть черт снизу вверх, сплошная — Ян, прерванная — Инь; перевёрнутая черта выделена. */
function hexGlyph(bits, hl, label) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 23');
  svg.setAttribute('class', 'hex');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  const t = document.createElementNS(NS, 'title');
  t.textContent = label;
  svg.append(t);
  for (let l = 1; l <= 6; l++) {
    const y = (20.8 - (l - 1) * 4.16).toFixed(2);
    for (const [x, w] of line(bits, l) ? [[0, 20]] : [[0, 7.8], [12.2, 7.8]]) {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', w); r.setAttribute('height', '2.2'); r.setAttribute('rx', '.4');
      if (l === hl) r.setAttribute('class', 'hl');
      svg.append(r);
    }
  }
  return svg;
}
const hexName = (n) => `№${n} «${PATTERN_BY_N[n].motif}»`;
const ORDINAL = ['первая', 'вторая', 'третья', 'четвёртая', 'пятая', 'шестая'];

/** Путь по И-Цзин внизу экрана: начало и шестнадцать решений, каждое состояние — гексаграмма, перевёрнутая черта выделена. */
function pathStrip() {
  const steps = [{ bits: state.initialBits, line: null }, ...state.journal.map((j) => ({ bits: j.to, line: j.line }))];
  const now = steps.length - 1;
  const pend = pendingResult(state);
  const cur = hexNumber(steps[now].bits);
  const caption = pend ? `№${pend.fromHex} → №${pend.toHex}: перевернулась ${ORDINAL[pend.line - 1]} черта`
    : isOver(state) ? `Итог: ${hexName(cur)}` : `Сейчас ${hexName(cur)}`;
  return el('section', { class: 'path', 'aria-label': 'Путь по И-Цзин' },
    el('p', { class: 'path-label' }, 'Путь по И-Цзин'),
    el('ol', { class: 'path-row', style: `--n:${TOTAL_EPISODES + 1}` }, Array.from({ length: TOTAL_EPISODES + 1 }, (_, i) => {
      const s = steps[i];
      if (!s) return el('li', { class: 'path-slot', 'aria-hidden': 'true' });
      const n = hexNumber(s.bits);
      const when = i < TOTAL_EPISODES ? `${AGES[i]} ${yearsWord(AGES[i])}` : 'итог';
      return el('li', { class: i === now ? 'path-step now' : 'path-step', 'aria-current': i === now ? 'step' : false }, hexGlyph(s.bits, s.line, `${when}: ${hexName(n)}`));
    })),
    el('p', { class: 'path-note' }, caption));
}

/** Иллюстрация: сначала локальная копия img/, затем оригинал; если ничего не загрузилось, остаётся заглушка. */
function picture(src, alt, cls) {
  if (!src) return null;
  const img = el('img', { src: src.local, alt, loading: 'lazy', decoding: 'async' });
  const fig = el('figure', { class: cls }, img);
  let tried = 0;
  img.addEventListener('error', () => {
    tried++;
    if (tried === 1 && src.remote) img.src = src.remote;
    else fig.classList.add('gone');
  });
  img.addEventListener('load', () => fig.classList.add('ready'));
  return fig;
}
/** Картинка сцены на карте: пока грузится или если её нет, видна заливка масти со значком. */
function art(src, alt, sp) {
  const fig = picture(src, alt, `art sp${sp}`) || el('figure', { class: `art sp${sp}` });
  fig.append(el('span', { class: 'art-mark' }, icon(sp)));
  return fig;
}

function persist() { if (LS && state) storage.save(LS, state); }

// Открытые сцены за все прожитые жизни: только для удобства игрока, без них игра работает так же.
const SEEN_KEY = 'prozhit-zhizn:seen';
function seenSet() { try { return new Set(JSON.parse((LS && LS.getItem(SEEN_KEY)) || '[]')); } catch { return new Set(); } }
function markSeen(key) {
  try { const s = seenSet(); if (!s.has(key)) { s.add(key); LS && LS.setItem(SEEN_KEY, JSON.stringify([...s])); } } catch { /* ignore */ }
}
const seenCount = (sex) => [...seenSet()].filter((k) => k.startsWith(sex)).length;

const scenesWord = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'сцена' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'сцены' : 'сцен');

/** Портрет героя для возраста: шесть нарисованных возрастов, ближайший не младше. */
const faceAge = (age) => (age <= 6 ? 6 : age <= 14 ? 12 : age <= 23 ? 20 : age <= 39 ? 35 : age <= 59 ? 52 : 75);

/** Табло сверху: лицо героя в этом возрасте, кольцо прожитой жизни, масти прожитых сцен, полоса из 16 возрастов. */
function renderHud() {
  hud.hidden = !state;
  if (!state) { hud.replaceChildren(); return; }
  const pend = pendingResult(state);
  const over = isOver(state) && !pend;
  const ep = pend ? pend.episode : over ? TOTAL_EPISODES : state.episode;
  const age = ageOf(ep);
  const counts = [0, 0, 0, 0];
  for (const j of state.journal) counts[j.toSphere ?? j.sphere]++;
  hud.replaceChildren(el('div', { class: 'wrap' },
    el('div', { class: 'hud-in' },
      el('div', { class: 'avatar', style: `--p:${state.journal.length / TOTAL_EPISODES}` }, picture(ageFor(state.sex, faceAge(age)), '', 'face')),
      el('div', { class: 'hud-age' },
        el('span', { class: 'age-big' }, `${age} ${yearsWord(age)}`),
        el('span', { class: 'hud-step' }, over ? 'жизнь прожита' : `решение ${ep} из ${TOTAL_EPISODES}`)),
      el('ul', { class: 'suits', 'aria-label': 'Сколько карт каждой масти сыграно' },
        SUITS.map((s, i) => el('li', { class: `suit-count sp${i}`, title: `${s.name}: ${counts[i]}` }, icon(i), el('b', {}, String(counts[i])))))),
    el('ol', { class: 'track', 'aria-label': 'Возрасты жизни' }, AGES.map((a, i) => {
      const j = state.journal[i];
      const now = !over && i + 1 === ep && !j;
      return el('li', { class: j ? `seg done sp${j.toSphere ?? j.sphere}` : now ? 'seg now' : 'seg', 'aria-current': now ? 'step' : false },
        el('span', { class: 'seg-age' }, String(a)));
    }))));
}

function render() {
  renderHud();
  root.replaceChildren();
  document.body.classList.toggle('at-start', !state);
  if (!state) return renderStart();
  if (pendingResult(state)) return renderResult();
  if (isOver(state)) return renderEnding();
  return renderScene();
}

function renderStart() {
  keyHandler = null;
  const saved = LS ? storage.load(LS) : null;
  const hadBroken = LS && storage.exists(LS) && !saved;
  const hero = (sex, label, sub) => {
    const n = seenCount(sex);
    const total = sceneMap(sex).reduce((k, r) => k + r.scenes.filter(Boolean).length, 0);
    return el('button', { class: 'hero-card deal', id: `start-${sex.toLowerCase()}`, style: `--i:${sex === 'M' ? 1 : 2}`, onclick: () => start(sex) },
      picture(portraitFor(sex), label, 'portrait'),
      el('span', { class: 'hero-name' }, label),
      el('span', { class: 'hero-sub' }, sub),
      el('span', { class: 'meter', 'aria-hidden': 'true' }, el('i', { style: `width:${Math.round((Math.min(n, total) / total) * 100)}%` })),
      el('span', { class: 'hero-progress' }, n ? `Открыто сцен: ${Math.min(n, total)} из ${total}` : `В жизни ${total} ${scenesWord(total)}, за одну увидишь 16`),
      el('span', { class: 'hero-go' }, 'Начать'));
  };
  root.append(el('section', { class: 'start' },
    el('div', { class: 'deck', 'aria-hidden': 'true' }, SUITS.map((s, i) => el('span', { class: `dc sp${i}` }, icon(i)))),
    el('p', { class: 'eyebrow' }, '16 решений · от 6 до 84 лет'),
    el('h1', { class: 'title' }, 'Прожить жизнь'),
    el('p', { class: 'lede' }, 'Город на большой реке, шестнадцать возрастов. В каждом тебе сдают сцену и четыре карты поступков, и каждая ведёт в свою сторону жизни. Люди запомнят твои поступки, а в конце станет ясно, каким человеком была прожита эта жизнь.'),
    el('ul', { class: 'suit-legend', 'aria-label': 'Четыре масти' }, SUITS.map((s, i) => el('li', {}, suitChip(i)))),
    hadBroken ? el('p', { class: 'warn' }, 'Прошлое сохранение повреждено и не может быть восстановлено. Можно начать новую жизнь.') : null,
    saved ? el('div', { class: 'actions' }, el('button', { class: 'btn-go', id: 'continue', onclick: () => { state = saved; render(); } },
      isOver(saved) ? 'Вернуться к концу жизни' : `Продолжить · ${ageText(ageOf(saved.episode))}`)) : null,
    el('h2', { class: 'pick-title' }, saved ? 'Или начать новую жизнь' : 'Чью жизнь прожить'),
    el('div', { class: 'hero-row' },
      hero('M', 'Его жизнь', 'Мальчик из Заречья: гаражи, река, моторы'),
      hero('F', 'Её жизнь', 'Девочка из Слободы: брат, подруга, больница')),
  ));
}

/** Старт в случайной стороне жизни; сначала те первые сцены, которых игрок ещё не видел. Номер старта = номер сферы. */
function pickStart(sex) {
  const seen = seenSet();
  const all = START_OPTIONS.map((_, k) => k);
  const fresh = all.filter((k) => !seen.has(`${sex}1-${k}`));
  const pool = fresh.length ? fresh : all;
  return pool[Math.floor(Math.random() * pool.length)];
}

function start(sex) {
  state = newGame(sex, pickStart(sex));
  persist();
  render();
  window.scrollTo(0, 0);
}

function restartControl() {
  if (!confirmRestart) return el('button', { class: 'link', id: 'restart', onclick: () => { confirmRestart = true; render(); } }, 'Начать заново');
  return el('span', { class: 'confirm' }, 'Стереть эту жизнь? ',
    el('button', { class: 'link danger', id: 'restart-yes', onclick: () => { confirmRestart = false; if (LS) storage.clear(LS); state = null; render(); } }, 'Да'),
    ' · ',
    el('button', { class: 'link', id: 'restart-no', onclick: () => { confirmRestart = false; render(); } }, 'Нет'));
}

/** Лента портретов героя от шести до старости: одно лицо, которое взрослеет. */
function agesStrip(sex) {
  return el('section', { class: 'ages', 'aria-label': 'Одно лицо, шесть возрастов' },
    el('h3', { class: 'table-title' }, 'Одно лицо, шесть возрастов'),
    el('div', { class: 'ages-row' }, PORTRAIT_AGES.map((a, i) => el('figure', { class: 'age-card deal', style: `--i:${i}` },
      picture(ageFor(sex, a), `${a} ${yearsWord(a)}`, 'portrait'),
      el('figcaption', { class: 'age-num' }, `${a} ${yearsWord(a)}`)))));
}

function peopleStrip(people) {
  if (!people.length) return null;
  return el('section', { class: 'people', 'aria-label': 'Люди твоей жизни' },
    el('h3', { class: 'table-title' }, 'Люди твоей жизни'),
    el('ul', {}, people.map((p) => el('li', {}, el('span', { class: 'token', 'aria-hidden': 'true' }, p.name.charAt(0)), el('span', {}, el('b', {}, p.name), ` — ${p.status}`)))));
}

function renderScene() {
  const sc = buildScene(state, debugOpts);
  markSeen(`${state.sex}${sc.episode}-${sc.sphere}`);
  const last = sc.episode >= TOTAL_EPISODES;
  const choose = (id, card) => {
    if (busy) return;
    busy = true;
    const go = () => {
      try { state = applyChoice(state, id, debugOpts); persist(); } finally { busy = false; }
      render();
      window.scrollTo(0, 0);
    };
    if (!card || calm()) return go();
    root.querySelectorAll('.choice').forEach((b) => b.classList.add(b === card ? 'picked' : 'dropped'));
    setTimeout(go, 330);
  };
  root.append(el('article', { class: 'scene' },
    el('div', { class: 'board' },
      el('section', { class: 'card scene-card deal' },
        art(imageFor(sc.img), `${sc.title}, ${sc.ageText}`, sc.sphere),
        el('div', { class: 'card-body' },
          el('p', { class: 'card-meta' }, suitChip(sc.sphere), `Тебе ${sc.ageText}`),
          el('h2', { class: 'scene-title' }, sc.title),
          el('div', { class: 'prose' }, sc.paragraphs.map((p) => el('p', {}, p))),
          sc.memory.length ? el('aside', { class: 'flashback' }, el('h3', { class: 'label' }, 'Это началось раньше'), sc.memory.map((m) => el('p', {}, m.text))) : null)),
      el('section', { class: 'hand', 'aria-labelledby': 'hand-title' },
        el('h3', { class: 'table-title', id: 'hand-title' }, 'Что ты сделаешь'),
        el('p', { class: 'table-note' }, last ? 'Последнее решение этой жизни.' : 'Каждая карта ведёт в свою сторону жизни: внизу карты видно, куда.'),
        el('ol', { class: 'choices' }, sc.choices.map((c, i) => el('li', { style: `--i:${i + 1}` },
          el('button', { class: `choice deal sp${last ? sc.sphere : c.toSphere}`, id: `choice-${i + 1}`, 'data-id': c.id, onclick: (e) => choose(c.id, e.currentTarget) },
            el('span', { class: 'corner', 'aria-hidden': 'true' }, String(i + 1)),
            el('span', { class: 'choice-body' },
              el('span', { class: 'choice-aim' }, c.text),
              el('span', { class: 'cost' }, c.cost),
              c.memory.length ? el('span', { class: 'choice-mem' }, c.memory[0]) : null),
            el('span', { class: 'choice-turn' },
              el('span', { class: 'turn-to' }, last ? null : icon(c.toSphere), last ? 'Последняя карта' : turnText(sc.sphere, c.toSphere)),
              el('span', { class: 'turn-hex' }, hexGlyph(state.bits ^ (1 << (c.line - 1)), c.line, `Гексаграмма ${hexName(c.toHex)}`), el('span', { class: 'hexno' }, `№${c.toHex}`))))))))),
    peopleStrip(sc.people),
    pathStrip(),
    el('footer', { class: 'table-foot' }, restartControl()),
  ));
  if (DEBUG) root.append(debugPanel(sc));
  keyHandler = (e) => {
    const n = Number(e.key);
    if (n >= 1 && n <= sc.choices.length && !e.metaKey && !e.ctrlKey && !e.altKey) choose(sc.choices[n - 1].id, document.getElementById(`choice-${n}`));
  };
}

function renderResult() {
  const j = pendingResult(state);
  const fork = forkOf(state, j);
  const next = () => { state = acknowledge(state); persist(); render(); window.scrollTo(0, 0); };
  const rem = j.remembers || [];
  const sp = fork ? fork.sphere : j.sphere;
  const go = el('div', { class: 'go-bar' }, el('button', { class: 'btn-go', id: 'next', onclick: next },
    isOver(state) ? 'К концу жизни' : `Дальше · ${ageText(ageOf(state.episode))}`));
  root.append(el('article', { class: 'result' },
    el('section', { class: `card result-card flip sp${sp}` },
      el('header', { class: 'result-band' },
        el('span', { class: 'turn-to' }, fork ? icon(sp) : null, fork ? turnText(j.sphere, fork.sphere, true) : 'Последняя карта сыграна'),
        el('span', { class: 'turn-hex', 'aria-label': `Гексаграмма №${j.fromHex} стала №${j.toHex}` },
          hexGlyph(j.from, null, `Было: ${hexName(j.fromHex)}`), el('span', { class: 'arrow', 'aria-hidden': 'true' }, '→'), hexGlyph(j.to, j.line, `Стало: ${hexName(j.toHex)}`))),
      el('div', { class: 'card-body' },
        el('p', { class: 'card-meta' }, `${j.title} · ${ageText(ageOf(j.episode))}`),
        el('h2', { class: 'result-title' }, j.text),
        el('p', { class: 'cost' }, j.cost),
        el('div', { class: 'outcome' }, el('h3', { class: 'label' }, 'Что было дальше'), el('p', {}, j.note)),
        rem.length ? el('div', { class: 'remember' }, el('h3', { class: 'label' }, rem.length > 1 ? 'Это запомнят' : `${rem[0].name} это запомнит`),
          el('ul', { class: 'tokens' }, rem.map((r) => el('li', {}, el('span', { class: 'token', 'aria-hidden': 'true' }, r.name.charAt(0)), el('span', {}, el('b', {}, r.name), ` — ${r.status}`))))) : null)),
    fork ? el('section', { class: 'fork', 'aria-label': 'Следующая сцена' },
      el('h3', { class: 'table-title' }, `Следующая карта · через ${fork.years} ${yearsWord(fork.years)}`),
      el('div', { class: fork.closed.length ? 'fork-row' : 'fork-row solo' },
        el('div', { class: `mini open deal sp${fork.sphere}`, style: '--i:3' },
          el('span', { class: 'mini-suit' }, icon(fork.sphere), SUITS[fork.sphere].name),
          el('b', { class: 'mini-title' }, `«${fork.title}»`),
          fork.hook ? el('p', { class: 'mini-hook' }, fork.hook) : null),
        fork.closed.length ? el('div', { class: 'closed-stack' },
          el('p', { class: 'closed-note' }, fork.closed.length > 1 ? 'Другие дороги закрылись' : 'Другая дорога закрылась'),
          el('ul', { class: 'closed-list' }, fork.closed.map((c, i) => el('li', { class: `mini closed deal sp${c.sphere}`, style: `--i:${i + 4}` },
            el('span', { class: 'mini-suit' }, icon(c.sphere), SUITS[c.sphere].name),
            el('s', { class: 'mini-title' }, `«${c.title}»`))))) : null,
        go)) : go,
    pathStrip(),
  ));
  if (DEBUG) root.append(el('aside', { class: 'debug' }, el('h3', {}, 'Отладка'), el('pre', {}, `${j.choiceId}: черта ${j.line} (${j.role}), №${j.fromHex} → №${j.toHex}\nопиралась на эпизоды: ${j.sources.join(', ') || '—'}`)));
  keyHandler = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next(); } };
}

function lifeMap(path) {
  const seen = seenSet();
  const mine = new Set(path);
  const rows = sceneMap(state.sex);
  const total = rows.reduce((n, r) => n + r.scenes.filter(Boolean).length, 0);
  const opened = rows.reduce((n, r) => n + r.scenes.filter((x) => x && (seen.has(x.key) || mine.has(x.key))).length, 0);
  return el('section', { class: 'map', id: 'map' },
    el('h3', { class: 'table-title' }, 'Карта жизни'),
    el('p', { class: 'muted small' }, `Твоя жизнь прошла через 16 сцен из ${total}. За все жизни открыто ${opened}. Другие карты привели бы в другие сцены: сыграй ещё раз, и жизнь пойдёт иначе.`),
    el('div', { class: 'map-grid', role: 'table', 'aria-label': 'Карта жизни' },
      el('div', { class: 'map-row head', role: 'row' }, el('span', { class: 'map-age' }, ''), SUITS.map((s, i) => el('span', { class: `map-h sp${i}` }, icon(i), el('span', {}, s.name)))),
      rows.map((r) => el('div', { class: 'map-row', role: 'row' },
        el('span', { class: 'map-age' }, String(r.age)),
        r.scenes.map((x) => {
          if (!x) return el('span', { class: 'cell none' });
          if (mine.has(x.key)) return el('span', { class: `cell mine sp${x.sphere}`, title: x.title }, x.title);
          if (seen.has(x.key)) return el('span', { class: 'cell seen', title: x.title }, x.title);
          return el('span', { class: 'cell unknown', title: 'Ещё не прожито' }, '?');
        })))));
}

// Короткие пояснения к стихиям и способам поступать для разбора типа.
const QUAD_SHORT = { air: 'идеи и возможности', fire: 'принципы и направление', water: 'люди и связи', earth: 'дом и вещи' };
const ROLE_SHORT = { EN: 'сделать первый шаг', IN: 'сначала понять', IS: 'довести до конца', ES: 'собрать людей' };

/** Целые проценты, сумма ровно 100 (метод наибольших остатков). */
function wholePercents(shares, keys) {
  const out = Object.fromEntries(keys.map((k) => [k, Math.floor(shares[k])]));
  let left = 100 - keys.reduce((n, k) => n + out[k], 0);
  for (const k of [...keys].sort((a, b) => (shares[b] - Math.floor(shares[b])) - (shares[a] - Math.floor(shares[a])))) {
    if (left <= 0) break;
    out[k]++; left--;
  }
  return out;
}

function bars(shares, order, names, hints, lead) {
  const pc = wholePercents(shares, order);
  return el('ul', { class: 'bars' }, order.map((k) => el('li', { class: k === lead ? 'bar lead' : 'bar' },
    el('span', { class: 'bar-name' }, el('b', {}, names[k]), el('span', { class: 'bar-hint' }, hints[k])),
    el('span', { class: 'bar-num' }, `${pc[k]}%`),
    el('span', { class: 'bar-track' }, el('span', { class: 'bar-fill', style: `width:${shares[k]}%` })))));
}

function renderEnding() {
  const ep = buildEpilogue(state);
  const t = ep.type;
  const pq = wholePercents(t.quadShares, QUAD_ORDER), pr = wholePercents(t.roleShares, ROLE_ORDER);
  const lastJ = state.journal[TOTAL_EPISODES - 1];
  const again = () => { if (LS) storage.clear(LS); state = null; render(); window.scrollTo(0, 0); };
  const routeRows = ep.route.map((r) => el('tr', {},
    el('td', { class: 'num' }, String(r.age)),
    el('td', {}, el('span', { class: 'hexno' }, `№${r.hex}`), ' ', r.motif, el('span', { class: 'muted' }, ` · ${QUAD_RU[r.quadrum]} · ${r.sphere}`)),
    el('td', { class: 'num' }, `${r.line} · ${ROLE_RU[r.role]}`),
    el('td', {}, r.choice)));
  root.append(el('article', { class: 'ending' },
    el('section', { class: 'card finale deal' },
      art(imageFor(lastJ.img), 'Последний вечер', lastJ.sphere),
      el('div', { class: 'card-body' },
        el('p', { class: 'card-meta' }, 'Конец жизни'),
        el('h2', { class: 'scene-title' }, 'Что осталось'),
        el('div', { class: 'prose' },
          el('p', {}, ep.opening),
          el('p', {}, ep.legacy.join(' ')),
          ep.references.length ? el('p', {}, 'Люди потом вспоминали три вещи. ' + ep.references.map((r) => r.text).join(' ')) : null))),
    agesStrip(state.sex),
    el('section', { class: 'legendary deal', id: 'type', style: '--i:2' },
      el('div', { class: 'legendary-in' },
        el('p', { class: 'type-kicker' }, g('Ты {прожил|прожила} эту жизнь как')),
        el('h2', { class: Math.max(...t.name.split(/\s+/).map((w) => w.length)) > 10 ? 'type-name long' : 'type-name' }, t.name),
        el('p', { class: 'type-essence' }, t.essence),
        el('div', { class: 'type-why' },
          el('h3', { class: 'label' }, 'Из чего сложился тип'),
          el('div', { class: 'type-sum' },
            el('div', { class: 'axis-card' },
              el('span', { class: 'axis-q' }, 'Чего в жизни было больше всего'),
              el('b', { class: 'axis-v' }, t.quadRu),
              el('span', { class: 'axis-hint' }, t.quadHint),
              el('span', { class: 'axis-pct' }, `${pq[t.quad]}% решений`)),
            el('span', { class: 'type-plus', 'aria-hidden': 'true' }, '+'),
            el('div', { class: 'axis-card' },
              el('span', { class: 'axis-q' }, g('Как ты чаще всего {поступал|поступала}')),
              el('b', { class: 'axis-v' }, t.roleRu),
              el('span', { class: 'axis-hint' }, t.roleHint),
              el('span', { class: 'axis-pct' }, `${pr[t.role]}% решений`))),
          el('p', { class: 'type-rule' }, g('Тип складывается из двух вещей: чего в жизни было больше и как ты чаще {поступал|поступала}. Стихий четыре и способов поступать четыре, поэтому всего типов шестнадцать.'))),
        el('div', { class: 'type-part' }, el('h3', { class: 'label' }, 'Какой это человек'), el('p', {}, [t.about, t.price].filter(Boolean).join(' '))),
        el('div', { class: 'type-part' }, el('h3', { class: 'label' }, 'Это видно по твоим поступкам'),
          el('ul', { class: 'deeds' }, t.deeds.map((d) => el('li', {}, el('span', { class: 'deed-age' }, `${d.age} ${yearsWord(d.age)}`), el('span', { class: 'deed-text' }, d.text))))),
        el('details', { class: 'type-more' },
          el('summary', {}, 'Как распределились все решения'),
          el('div', { class: 'type-grid' },
            el('div', {}, el('h3', { class: 'label' }, 'Чего было больше'), bars(t.quadShares, QUAD_ORDER, QUAD_RU, QUAD_SHORT, t.quad)),
            el('div', {}, el('h3', { class: 'label' }, g('Как ты {поступал|поступала}')), bars(t.roleShares, ROLE_ORDER, ROLE_RU, ROLE_SHORT, t.role))),
          el('p', { class: 'type-note' }, 'Решения в 35–51 год считаются вдвое: это зрелость, главная часть жизни.')))),
    el('p', { class: 'table-text' }, ep.final.text),
    ep.people.length ? el('section', { class: 'people-end' }, el('h3', { class: 'table-title' }, 'Что стало с людьми твоей жизни'),
      el('ul', { class: 'cast' }, ep.people.map((p) => el('li', { class: 'person' },
        el('span', { class: 'token', 'aria-hidden': 'true' }, p.name.charAt(0)),
        el('span', {}, el('b', {}, p.name), p.who ? el('span', { class: 'muted' }, `, ${p.who}`) : null, ` — ${p.status}`))))) : null,
    lifeMap(ep.path),
    pathStrip(),
    el('details', { class: 'reveal', id: 'reveal' },
      el('summary', {}, 'Как сложилась эта жизнь'),
      el('p', { class: 'muted small' }, 'Каждое состояние жизни — одна из 64 гексаграмм И-Цзин, каждое решение переворачивает ровно одну её черту. Первая, вторая и третья или шестая черта поворачивают жизнь в другую сторону (дом, дорога, дело, близкие), четвёртая и пятая оставляют её в прежней. Поэтому четыре карты сцены всегда ведут в четыре разные сцены. Стихия решения считается по тому, куда оно привело, роль — по тому, какую черту оно изменило. Зрелость (35–51 год) весит вдвое. Сопоставление гексаграмм с драматическими темами — авторская гипотеза игры, а не канон и не психологический тест.'),
      el('div', { class: 'table-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, el('th', {}, 'Возраст'), el('th', {}, 'Состояние'), el('th', {}, 'Черта · роль'), el('th', {}, 'Поступок'))),
        el('tbody', {}, routeRows))),
      el('p', {}, `Финальное состояние: №${ep.final.hex} «${ep.final.motif}», черты снизу вверх ${ep.final.bits}. Разных состояний за жизнь: ${ep.distinctNodes} из 16 сцен.`),
      ep.repeated.length ? el('p', {}, 'Повторились: ' + ep.repeated.map((r) => `«${r.motif}» в ${r.ages.join(' и ')} лет`).join('; ') + '.') : el('p', {}, 'Ни одно состояние не повторилось.'),
      el('p', {}, `Сколько раз менялась каждая черта, снизу вверх: ${ep.lineFlips.join(' · ')}.`),
      el('div', { class: 'final-hex' }, hexGlyph(state.bits, lastJ.line, `Финальная гексаграмма ${hexName(ep.final.hex)}`))),
    el('div', { class: 'actions' }, el('button', { class: 'btn-go', id: 'again', onclick: again }, 'Прожить другую жизнь')),
  ));
  if (DEBUG) root.append(el('aside', { class: 'debug' }, el('h3', {}, 'Маршрут (JSON)'),
    el('textarea', { id: 'route-json', rows: '6', readonly: true }, JSON.stringify({ sex: state.sex, ids: state.journal.map((j) => j.choiceId) }))));
  keyHandler = null;
}

function debugPanel(sc) {
  const { x, y } = coords(state.bits);
  const facts = Object.entries(state.facts).map(([k, v]) => `${k} = ${v.v}  (эп. ${v.src})`).join('\n') || '—';
  const options = sc.allChoices.map((c) => `  ${c.id} ${c.role} → №${c.toHex} (сфера ${c.toSphere}, «${c.toTitle}»)  ${c.text}`).join('\n');
  const toggle = el('label', { class: 'toggle' }, el('input', { type: 'checkbox', id: 'pattern-effect', checked: debugOpts.patternEffect, onchange: (e) => { debugOpts = { patternEffect: e.target.checked }; render(); } }), ' влияние узла (выключение — абляция, только для проверки)');
  return el('aside', { class: 'debug' },
    el('h3', {}, 'Отладка'), toggle,
    el('pre', {}, [
      `эпизод ${sc.episode}, акт ${sc.act + 1}, сфера ${sc.sphereRu}, №${sc.hex} «${sc.pattern.motif}» (${sc.pattern.variation}, ${QUAD_RU[sc.pattern.quadrum]})`,
      `черты снизу вверх ${bitString(state.bits)}, x=${x}, y=${y}; скрыты черты ${sc.hidden.join(' и ')}; картинка ${sc.img}`,
      `память, на которую опирается сцена: эпизоды ${sc.sources.join(', ') || '—'}`,
      sc.revisit ? `возврат паттерна из эпизода ${sc.revisit.episode}` : 'возврата нет',
      '', glyph(state.bits), '', 'четыре перехода:', options, '', 'память:', facts,
    ].join('\n')));
}

let keyHandler = null;
document.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (keyHandler) keyHandler(e);
});

state = LS ? storage.load(LS) : null;
render();
