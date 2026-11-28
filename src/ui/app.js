// Интерфейс «Колода жизни»: старт (его или её жизнь), сцена-карта и четыре карты поступков,
// итог поступка с развилкой, финал с картой-типом. Внизу экранов — путь по И-Цзин. Скрытая отладка: ?debug=1.
import { newGame, buildScene, applyChoice, acknowledge, isOver, pendingResult, buildEpilogue, ageText, ageOf, forkOf, sceneMap, yearsWord, TOTAL_EPISODES, START_OPTIONS } from '../core/engine.js';
import { storage } from '../core/save.js';
import { AGES, CHAPTERS } from '../data/life.js';
import { imageFor, portraitFor, ageFor, hasFace, PORTRAIT_AGES, chapterArt, COVER_ART, endArt, typeArt, personArt } from '../data/images.js';
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
    // у прерванной черты две половины: левая и правая (финал строит их от середины к краям)
    for (const [x, w, half] of line(bits, l) ? [[0, 20, '']] : [[0, 7.8, 'half-l'], [12.2, 7.8, 'half-r']]) {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', w); r.setAttribute('height', '2.2'); r.setAttribute('rx', '.4');
      const cls = [l === hl ? 'hl' : '', half].filter(Boolean).join(' ');
      if (cls) r.setAttribute('class', cls);
      r.style.setProperty('--l', l - 1); // номер черты снизу: по нему черты ложатся по очереди
      svg.append(r);
    }
  }
  return svg;
}

/** Шестьдесят четыре гексаграммы квадратом 8×8 (столбец — нижняя триграмма, строка — верхняя): клетка этой жизни светится. */
function sixtyFour(bits) {
  const NS = 'http://www.w3.org/2000/svg';
  const { x: cx, y: cy } = coords(bits);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('class', 'map64');
  svg.setAttribute('aria-hidden', 'true');
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const on = x === cx && y === cy;
    const r = document.createElementNS(NS, 'rect');
    const s = on ? 6 : 3.4, o = (8 - s) / 2;
    r.setAttribute('x', x * 8 + o); r.setAttribute('y', (7 - y) * 8 + o); r.setAttribute('width', s); r.setAttribute('height', s); r.setAttribute('rx', on ? 1.4 : 1);
    if (on) r.setAttribute('class', 'on');
    svg.append(r);
  }
  return svg;
}

/** Печать итога в карте типа: гексаграмма жизни, её номер и имя, её место среди шестидесяти четырёх.
 *  Черта последнего решения выделена. Как печать проявляется — см. revealSeal. */
function seal(n, hl) {
  return el('div', { class: 'seal' },
    el('div', { class: 'seal-hex', 'aria-hidden': 'true' }, hexGlyph(state.bits, hl, '')),
    el('p', { class: 'seal-text' }, el('span', { class: 'seal-k' }, 'Итог по И-Цзин'), ' ', el('span', { class: 'seal-n' }, hexName(n))),
    el('figure', { class: 'seal-map', role: 'img', 'aria-label': `№${n} — одна из 64 гексаграмм` }, sixtyFour(state.bits),
      el('figcaption', { 'aria-hidden': 'true' }, 'Одна из 64 жизней')));
}

/** Когда печать впервые видна целиком, черты ложатся по одной снизу вверх (так строится гексаграмма),
 *  черта последнего решения вспыхивает, клетка жизни среди 64 загорается, потом проявляется тип.
 *  Один раз; при «меньше движения» всё видно сразу и без движения. */
function revealSeal(card) {
  const mark = card && card.querySelector('.seal');
  if (!mark || calm() || typeof IntersectionObserver !== 'function') return;
  card.classList.add('armed');
  const io = new IntersectionObserver((es) => {
    if (!card.isConnected) { io.disconnect(); return; }
    // видна целиком — или её быстро пролистали вверх: тогда тип не остаётся спрятанным
    const seen = es.some((e) => (e.isIntersecting && e.intersectionRatio > .98) || (e.rootBounds && e.boundingClientRect.bottom < e.rootBounds.top));
    if (!seen) return;
    io.disconnect();
    card.classList.add('play');
  }, { threshold: [0, 1], rootMargin: '0px 0px -10% 0px' });
  io.observe(mark);
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

/** Иллюстрация: сначала локальная копия img/, затем оригинал; если ничего не загрузилось, остаётся заглушка.
 *  eager — грузить сразу (следующая карта, воспоминание), а не когда до картинки дойдёт прокрутка. */
// Ширина картинки на экране для выбора из srcset: телефон, планшет, ноутбук (замерено по вёрстке).
const SIZES = {
  scene: '(min-width: 800px) 740px, calc(100vw - 32px)',
  mini: '(min-width: 800px) 434px, calc(100vw - 32px)',
  finale: '(min-width: 1100px) 832px, calc(100vw - 32px)',
  album: '200px',
  memory: '(min-width: 800px) 704px, calc(100vw - 24px)',
  cover: '(min-width: 1024px) 992px, calc(100vw - 32px)',
  chapter: '(min-width: 1216px) 1184px, calc(100vw - 32px)',
  face: '(min-width: 48rem) 52px, 44px',
  hero: '(min-width: 48rem) 340px, calc(50vw - 24px)',
  strip: '(min-width: 40rem) 104px, 25vw',
  typeArt: '(min-width: 52rem) 828px, calc(100vw - 36px)',
};
function picture(src, alt, cls, eager = false, sizes = SIZES.scene) {
  if (!src) return null;
  const img = el('img', { srcset: src.set || null, sizes: src.set ? sizes : null, src: src.local, alt, loading: eager ? 'eager' : 'lazy', decoding: 'async' });
  const fig = el('figure', { class: cls }, img);
  if (img.complete && img.naturalWidth) fig.classList.add('ready'); // уже в кэше: без мигания
  let tried = 0;
  img.addEventListener('error', () => {
    // браузер без WebP или нет файла: назад к JPEG из src
    if (img.hasAttribute('srcset')) { img.removeAttribute('srcset'); img.removeAttribute('sizes'); return; }
    tried++;
    if (tried === 1 && src.remote) img.src = src.remote;
    else fig.classList.add('gone');
  });
  img.addEventListener('load', () => fig.classList.add('ready'));
  return fig;
}
/** Картинка сцены на карте: пока грузится или если её нет, видна заливка масти со значком. */
function art(src, alt, sp, { cls = '', eager = false, sizes = SIZES.scene } = {}) {
  const c = `art sp${sp}${cls ? ` ${cls}` : ''}`;
  const fig = picture(src, alt, c, eager, sizes) || el('figure', { class: c });
  fig.append(el('span', { class: 'art-mark' }, icon(sp)));
  return fig;
}
/** Заранее грузит картинку сцены в том размере, в каком её покажет сцена: следующая карта вырастет в неё без мигания.
 *  Возвращает null, чтобы стоять прямо в списке детей el(). */
function preloadScene(key) {
  const src = imageFor(key);
  if (!src || !src.set) return null;
  const im = new Image();
  im.decoding = 'async';
  im.sizes = SIZES.scene;
  im.srcset = src.set;
  im.src = src.local;
  return null;
}

// Картины глав и обложка старта: их может ещё не быть. Что уже известно про файл, помнится,
// чтобы экран сразу рисовался в нужном виде, без прыжка вёрстки, когда картина не нашлась.
const paintings = new Map(); // адрес → 'wait' | 'ok' | 'gone'
/** Загрузить картину заранее: к нужному экрану она уже в кэше или уже ясно, что её нет. */
function prefetch(src, sizes = SIZES.chapter) {
  if (!src || paintings.has(src.local)) return;
  paintings.set(src.local, 'wait');
  const im = new Image();
  im.decoding = 'async';
  im.onload = () => paintings.set(src.local, 'ok');
  im.onerror = () => {
    // браузер без WebP: ещё раз, уже JPEG
    if (im.hasAttribute('srcset')) { im.removeAttribute('srcset'); im.removeAttribute('sizes'); return; }
    paintings.set(src.local, 'gone');
  };
  if (src.set) { im.sizes = sizes; im.srcset = src.set; }
  im.src = src.local;
}
/** Картина, которой может не быть: тогда у фигуры класс gone, а вместо картины остаётся текст. */
function painting(src, alt, cls, sizes = SIZES.chapter) {
  if (paintings.get(src.local) === 'gone') return el('figure', { class: `${cls} gone` });
  const fig = picture(src, alt, cls, true, sizes);
  if (src.focus != null) fig.style.setProperty('--focus', `${src.focus}%`);
  const img = fig.querySelector('img');
  img.addEventListener('load', () => paintings.set(src.local, 'ok'));
  // нет WebP — picture() сам откатится к JPEG; картины нет, только когда не нашёлся и он
  img.addEventListener('error', () => { if (fig.classList.contains('gone')) paintings.set(src.local, 'gone'); });
  return fig;
}

// 1.1: времена года над картинами глав. Сначала видна картина, потом замечаешь, что она чуть живая:
// летят лепестки, тёплые пылинки, листья или снег. Частицы рисуются кодом на холсте между картиной и тенью с подписью.
const rnd = (a, b) => a + Math.random() * (b - a);
/** Заготовка частицы на маленьком холсте (рисуется в квадрате −1…1): на кадре её только копируют, без теней и фильтров. */
function sprite(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.ceil(w));
  c.height = Math.max(2, Math.ceil(h));
  const x = c.getContext('2d');
  if (x) { x.scale(c.width / 2, c.height / 2); x.translate(1, 1); draw(x); }
  return c;
}
/** Мягкая светлая точка: пыльца, пылинка света, снежинка. soft — где яркость спадает вдвое, core — цвет середины. */
const glow = (rgb, soft, core = rgb) => sprite(24, 24, (x) => {
  const gr = x.createRadialGradient(0, 0, 0, 0, 0, 1);
  gr.addColorStop(0, `rgba(${core}, 1)`); gr.addColorStop(soft, `rgba(${rgb}, .5)`); gr.addColorStop(1, `rgba(${rgb}, 0)`);
  x.fillStyle = gr; x.fillRect(-1, -1, 2, 2);
});
/** Лепесток яблони: к основанию розовее, на кончике выемка, край чуть размыт. */
const petal = (px, base, tip) => sprite(px * 10, px * 14, (x) => {
  x.scale(.86, .86);
  x.shadowColor = tip; x.shadowBlur = px * 1.2;
  x.beginPath(); x.moveTo(0, 1);
  x.bezierCurveTo(-.7, .72, -1.12, .02, -.84, -.62); x.bezierCurveTo(-.66, -1, -.18, -1.04, 0, -.8);
  x.bezierCurveTo(.18, -1.04, .66, -1, .84, -.62); x.bezierCurveTo(1.12, .02, .7, .72, 0, 1);
  const gr = x.createLinearGradient(0, 1, 0, -1);
  gr.addColorStop(0, base); gr.addColorStop(.6, tip); gr.addColorStop(1, tip);
  x.fillStyle = gr; x.fill();
});
/** Лист с черешком и жилкой: берёзовый (овальный, с острым кончиком) или кленовый (пять лопастей). Свет сверху слева. */
const leaf = (px, maple, light, dark) => sprite(px * 16, px * 20, (x) => {
  x.scale(.92, .92);
  x.beginPath();
  if (maple) {
    const at = (a, r) => [Math.cos(a * Math.PI / 180) * r, .1 + Math.sin(a * Math.PI / 180) * r];
    const lobes = [[145, .55], [210, .85], [270, 1], [330, .85], [395, .55]];
    x.moveTo(...at(90, .2));
    lobes.forEach(([a, r], i) => {
      const next = lobes[i + 1];
      x.quadraticCurveTo(...at(a - 18, .8 * r), ...at(a, r));
      x.quadraticCurveTo(...at(a + 18, .8 * r), ...(next ? at((a + next[0]) / 2, .42) : at(90, .2)));
    });
  } else {
    x.moveTo(0, .7);
    x.bezierCurveTo(-1.05, .5, -.7, -.5, 0, -1); x.bezierCurveTo(.7, -.5, 1.05, .5, 0, .7);
  }
  x.closePath();
  const gr = x.createLinearGradient(-1, -1, 1, 1);
  gr.addColorStop(0, light); gr.addColorStop(1, dark);
  x.fillStyle = gr; x.fill();
  x.globalAlpha = .45; x.strokeStyle = dark; x.lineWidth = .07; x.stroke();
  x.beginPath(); x.moveTo(0, 1); x.lineTo(0, maple ? -.72 : -.8);
  x.globalAlpha = .6; x.lineWidth = .09; x.stroke();
});
/** Пушинка одуванчика: пушистый шарик из тонких волосков со светлой серединкой. */
const fluff = (px) => sprite(px * 15, px * 15, (x) => {
  x.beginPath();
  for (let i = 0; i < 22; i++) {
    const a = i * Math.PI / 11 + .15 * Math.sin(i * 2.3), r = .55 + .35 * Math.abs(Math.sin(i * 1.7));
    x.moveTo(0, 0); x.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  x.strokeStyle = 'rgba(255, 250, 236, .7)'; x.lineWidth = .05; x.stroke();
  const gr = x.createRadialGradient(0, 0, 0, 0, 0, .6);
  gr.addColorStop(0, 'rgba(255, 248, 228, .9)'); gr.addColorStop(.3, 'rgba(255, 248, 228, .35)'); gr.addColorStop(1, 'rgba(255, 248, 228, 0)');
  x.fillStyle = gr; x.fillRect(-.6, -.6, 1.2, 1.2);
});
// Что летит в каждое время года. k — доля от обычного числа частиц (от 14 на телефоне до 36 на широком экране);
// у вида: доля, заготовки (px — пиксели экрана на пиксель картины) и движение частицы глубины z от 0 (даль) до 1:
// size — размер в пикселях, скорости vx и vy — в сотых высоты картины в секунду, A и w — размах и темп качания,
// lift — насколько медленнее падает на краях размаха, spin и tilt — вращение и покачивание, fw — переворот,
// a — непрозрачность, tw и tf — глубина и темп мерцания.
const AIR = [null,
  { k: .9, kinds: [ // весна: бледные лепестки летят наискосок и переворачиваются, между ними едва видна пыльца
    { share: .6, look: (px) => [petal(px, '#f2c4cd', '#fffaf5'), petal(px, '#e8adbc', '#fde9ed'), petal(px, '#efd0c0', '#fff8ef')],
      make: (z) => ({ size: 10 + 6 * z, vx: rnd(4.5, 7), vy: rnd(3, 4.5), A: rnd(1.5, 3), w: rnd(.7, 1.3), spin: rnd(-.6, .6), fw: rnd(1.4, 2.6), ax: Math.random() < .5, a: .65 + .25 * z }) },
    { share: .4, look: () => [glow('255, 241, 208', .28)],
      make: (z) => ({ size: 3.5 + 2.5 * z, vx: rnd(.8, 2), vy: rnd(-.6, .8), A: rnd(1, 2.5), w: rnd(.3, .7), a: .3 + .3 * z, tw: .55, tf: rnd(.8, 1.6) }) },
  ] },
  { k: .9, kinds: [ // лето: тёплые пылинки света медленно поднимаются и мерцают, изредка проплывает пух одуванчика
    { share: .65, look: () => [glow('255, 220, 146', .36, '255, 251, 238')],
      make: (z) => ({ size: 8 + 11 * z, vx: rnd(-.5, .8), vy: -rnd(2.2, 4.5), A: rnd(1.5, 3.5), w: rnd(.25, .6), a: .6 + .35 * z, tw: .5, tf: rnd(.6, 1.5) }) },
    { share: .35, look: (px) => [fluff(px)],
      make: (z) => ({ size: 14 + 8 * z, vx: rnd(.8, 2.2), vy: -rnd(2.5, 4), A: rnd(2, 4), w: rnd(.35, .8), spin: rnd(-.4, .4), a: .7 + .25 * z, tw: .25, tf: rnd(.5, 1) }) },
  ] },
  { k: .75, kinds: [ // осень: янтарные, ржавые и золотые листья кружат и падают медленнее на краях размаха
    { share: 1, look: (px) => [leaf(px, 0, '#f2c45a', '#c58a2a'), leaf(px, 0, '#e8a040', '#b0621f'), leaf(px, 1, '#d77a3c', '#8e3b1d'), leaf(px, 1, '#e6a743', '#b5682a')],
      make: (z) => ({ size: 11 + 7 * z, vx: rnd(-1, 2), vy: 4.5 + 4 * z, A: rnd(4, 8), w: rnd(.7, 1.25), lift: .5, tilt: rnd(.45, .85), spin: rnd(-.3, .3), fw: rnd(.6, 2), ax: Math.random() < .5, a: .75 + .2 * z }) },
  ] },
  { k: 1, kinds: [ // зима: снег в два слоя — мелкий вдали падает медленнее, крупный и мягкий ближе
    { share: .6, look: () => [glow('246, 250, 255', .45)],
      make: (z) => ({ z: .4 * z, size: 4.5 + 2.5 * z, vx: .5, vy: rnd(3.4, 4.6), A: rnd(1, 2.2), w: rnd(.5, 1), a: rnd(.55, .75) }) },
    { share: .4, look: () => [glow('246, 250, 255', .55)],
      make: (z) => ({ z: .6 + .4 * z, size: 10 + 5 * z, vx: .8, vy: rnd(6.5, 8.5), A: rnd(2.5, 5), w: rnd(.3, .75), a: rnd(.6, .85) }) },
  ] },
];
// живые холсты: будятся, когда вкладку снова открыли, и убирают за собой, когда экран сменился
const airs = new Set();
document.addEventListener('visibilitychange', () => airs.forEach((wake) => wake()));
/** Холст времени года над картиной главы (season 1–4: весна, лето, осень, зима). Работает, только пока картина
 *  загрузилась, видна на экране и вкладка открыта; проявляется через секунду с небольшим. При «меньше движения» его нет. */
function ambience(fig, season) {
  const air = AIR[season];
  const img = fig.querySelector('img');
  if (!air || !img || calm() || fig.classList.contains('gone') || typeof IntersectionObserver !== 'function') return;
  const cv = el('canvas', { class: 'ambience', 'aria-hidden': 'true' });
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  img.after(cv); // над картиной, но под тенью ::after и подписью
  const kinds = air.kinds;
  let parts = [], looks = [], lookKey = 0;
  let W = 0, H = 0, dpr = 1, s = 1, raf = 0, last = 0, clock = 0, seen = false, was = false, lit = false;
  const born = (p) => Object.assign(p, { z: p.r, vx: 0, vy: 0, A: 0, w: 1, lift: 0, rot: rnd(0, 6.3), spin: 0, tilt: 0, fw: 0, ax: false, tw: 0, tf: 1,
    ph: rnd(0, 6.3), fl: rnd(0, 6.3), t0: rnd(0, 6.3), si: Math.floor(Math.random() * looks[p.k].length) }, kinds[p.k].make(p.r));
  // улетевшая частица возвращается с наветренной стороны: сверху, снизу или сбоку, как больше входит потоком
  const enter = (p) => {
    born(p);
    const m = p.size * s, fy = Math.abs(p.vy) * W, fx = Math.abs(p.vx) * H;
    if (Math.random() * (fx + fy) < fy) { p.y = p.vy > 0 ? -m : H + m; p.x = rnd(-m, W + m); }
    else { p.x = p.vx > 0 ? -m : W + m; p.y = rnd(-m, H + m); }
  };
  // размер холста по картине; число и размер частиц — по её ширине, скорости — по высоте
  const fit = () => {
    const w = fig.clientWidth, h = fig.clientHeight, d = Math.min(2, window.devicePixelRatio || 1);
    if (!w || !h || (w === W && h === H && d === dpr)) return;
    if (W) parts.forEach((p) => { p.x *= w / W; p.y *= h / H; });
    W = w; H = h; dpr = d;
    s = Math.min(1.3, Math.max(.9, .85 + W / 2600));
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    if (lookKey !== Math.round(s * dpr * 8)) { lookKey = Math.round(s * dpr * 8); looks = kinds.map((k) => k.look(s * dpr)); }
    const n = Math.min(36, 12 + W / 50) * air.k;
    const want = kinds.map((k) => Math.round(n * k.share));
    parts = parts.filter((p) => want[p.k]-- > 0);
    want.forEach((c, k) => { while (c-- > 0) parts.push(born({ k, r: Math.random(), x: rnd(0, W), y: rnd(0, H) })); });
    parts.sort((a, b) => a.z - b.z); // дальние под ближними
  };
  const frame = (now) => {
    raf = 0;
    if (!cv.isConnected || fig.classList.contains('gone')) return wake();
    const dt = last ? Math.min(.05, (now - last) / 1000) : 0;
    last = now;
    clock += dt;
    if (!lit && clock > 1.2) { lit = true; cv.classList.add('on'); }
    const v = H / 100, gust = Math.sin(clock * .13) * .7 + Math.sin(clock * .047 + 2) * .4; // общий ветер то сильнее, то тише
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const p of parts) {
      p.ph += p.w * dt; p.rot += p.spin * dt; p.fl += p.fw * dt;
      const sw = Math.cos(p.ph), size = p.size * s;
      p.x += (p.vx + gust * p.z + p.A * p.w * sw) * v * dt;
      p.y += p.vy * (1 - p.lift * (1 - Math.abs(sw))) * v * dt;
      if (p.x < -size || p.x > W + size || p.y < -size || p.y > H + size) enter(p);
      const im = looks[p.k][p.si], wd = size * im.width / im.height;
      // переворот: лепесток или лист на миг виден почти с ребра
      const f = p.fw ? Math.cos(p.fl) : 1, flip = f < 0 ? Math.min(f, -.15) : Math.max(f, .15);
      const ang = p.rot + p.tilt * Math.sin(p.ph), c = Math.cos(ang) * dpr, sn = Math.sin(ang) * dpr;
      if (p.ax) ctx.setTransform(c, sn, -sn * flip, c * flip, p.x * dpr, p.y * dpr);
      else ctx.setTransform(c * flip, sn * flip, -sn, c, p.x * dpr, p.y * dpr);
      ctx.globalAlpha = p.a * (1 - p.tw * (.5 + .5 * Math.sin(clock * p.tf + p.t0)));
      ctx.drawImage(im, -wd / 2, -size / 2, wd, size);
    }
    raf = requestAnimationFrame(frame);
  };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => (cv.isConnected ? fit() : wake())) : null;
  const io = new IntersectionObserver((es) => { seen = es[es.length - 1].isIntersecting; was = true; wake(); });
  const die = () => { cancelAnimationFrame(raf); raf = 0; io.disconnect(); if (ro) ro.disconnect(); airs.delete(wake); };
  function wake() {
    if (!cv.isConnected) { if (was) die(); return; } // экран сменился: холст убирает за собой
    was = true;
    const run = seen && fig.classList.contains('ready') && !fig.classList.contains('gone') && document.visibilityState !== 'hidden';
    if (run && !raf) { fit(); last = 0; raf = requestAnimationFrame(frame); }
    else if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  airs.forEach((w) => w()); // заодно убрать холсты прежних экранов
  airs.add(wake);
  io.observe(fig);
  if (ro) ro.observe(fig);
  img.addEventListener('load', wake);
}

const ROMAN = ['I', 'II', 'III', 'IV'];
/** Глава жизни, которую открывает этот эпизод (1, 5, 9, 13): номер, время года и возрасты, или null. */
function chapterAt(episode) {
  const per = TOTAL_EPISODES / CHAPTERS.length;
  const k = (episode - 1) / per;
  if (!Number.isInteger(k) || !CHAPTERS[k]) return null;
  const to = AGES[k * per + per - 1];
  return { ...CHAPTERS[k], n: k + 1, roman: ROMAN[k], ages: `${AGES[k * per]}–${to}\u00A0${yearsWord(to)}` };
}
/** Шапка главы над картой сцены: широкая картина времени года с подписью, под ней эпиграф. Без картины — заголовок на столе.
 *  Проявляется спокойно; если следующая карта вырастает в сцену, то уже после перелёта. */
function chapterHead(ch, grown) {
  const fig = painting(chapterArt(state.sex, ch.n), '', 'chapter-art');
  fig.append(el('figcaption', { class: 'chapter-cap' },
    el('span', { class: 'chapter-kicker' }, el('span', { class: 'chapter-k' }, `Глава\u00A0${ch.roman}`), el('span', { class: 'chapter-ages' }, ch.ages)),
    el('h2', { class: 'chapter-name' }, ch.title)));
  ambience(fig, ch.n);
  return el('header', { class: calm() ? 'chapter' : grown ? 'chapter enter late' : 'chapter enter' },
    fig,
    el('p', { class: 'chapter-epi' }, ch.epigraph[state.sex]));
}

// Смена экранов. Где браузер умеет View Transitions, выбранная карта переворачивается и становится итогом,
// следующая карта вырастает в сцену, а лицо в табло взрослеет плавно. Без них или при «меньше движения» всё как раньше.
const canMorph = () => !calm() && typeof document.startViewTransition === 'function';
let morph = null; // какая карта сейчас перелетает в новый экран: 'played' (сыгранная) или 'next' (следующая)
let swaps = 0;
function swap(update, name = null) {
  if (!canMorph()) { update(); return; }
  const mine = ++swaps;
  morph = name;
  const done = () => {
    if (mine !== swaps) return; // уже идёт следующая смена экрана: убирать будет она
    morph = null;
    document.querySelectorAll('[data-vt]').forEach((n) => { n.style.removeProperty('view-transition-name'); n.removeAttribute('data-vt'); });
  };
  let t;
  try { t = document.startViewTransition(update); } catch { done(); update(); return; }
  t.finished.then(done, done);
}
/** Имя для перелёта: у старого элемента ставится перед сменой экрана, у нового — при отрисовке. */
const fly = (node, name) => { node.style.setProperty('view-transition-name', name); node.setAttribute('data-vt', ''); return node; };
const buzz = () => { try { if (navigator.vibrate) navigator.vibrate(8); } catch { /* ignore */ } };

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
/** Шесть старых ступеней лица: от них зависит, показывать ли «лицо повзрослеет» в итоге поступка. */
const faceGroup = (age) => (age <= 6 ? 6 : age <= 14 ? 12 : age <= 23 ? 20 : age <= 39 ? 35 : age <= 59 ? 52 : 75);
/** Лицо для возраста: портрет ровно этого возраста, а если его нет, ближайшая старая ступень. */
const faceAge = (age, sex = state && state.sex) => (sex && hasFace(sex, age) ? age : faceGroup(age));
/** Возрасты жизни, для которых есть портреты: все 16, когда дорисованы, иначе шесть старых. */
const lifeFaces = (sex) => (AGES.every((a) => hasFace(sex, a)) ? AGES : PORTRAIT_AGES);

/** Табло сверху: лицо героя в этом возрасте, кольцо прожитой жизни, масти прожитых сцен, полоса из 16 возрастов. */
let hudWas = null;
function renderHud() {
  hud.hidden = !state;
  if (!state) { hud.replaceChildren(); hudWas = null; return; }
  const pend = pendingResult(state);
  const over = isOver(state) && !pend;
  const ep = pend ? pend.episode : over ? TOTAL_EPISODES : state.episode;
  const age = ageOf(ep);
  const counts = [0, 0, 0, 0];
  for (const j of state.journal) counts[j.toSphere ?? j.sphere]++;
  // кольцо прожитой жизни дорастает от прошлого значения, счётчик сыгранной масти чуть подпрыгивает
  const p = state.journal.length / TOTAL_EPISODES;
  const was = hudWas && hudWas.sex === state.sex ? hudWas : { p, counts, age };
  hudWas = { sex: state.sex, p, counts, age };
  const ageBig = el('span', { class: 'age-big' }, `${age} ${yearsWord(age)}`);
  if (was.age < age && !calm()) countUp(ageBig, was.age, age);
  hud.replaceChildren(el('div', { class: 'wrap' },
    el('div', { class: 'hud-in' },
      el('div', { class: 'avatar', style: `--p:${p};--p0:${Math.min(was.p, p)}` }, picture(ageFor(state.sex, faceAge(age)), '', 'face', true, SIZES.face)),
      el('div', { class: 'hud-age' },
        ageBig,
        el('span', { class: 'hud-step' }, over ? 'жизнь прожита' : `решение ${ep} из ${TOTAL_EPISODES}`)),
      el('ul', { class: 'suits', 'aria-label': 'Сколько карт каждой масти сыграно' },
        SUITS.map((s, i) => el('li', { class: `suit-count sp${i}${counts[i] > was.counts[i] ? ' bump' : ''}`, title: `${s.name}: ${counts[i]}` }, icon(i), el('b', {}, String(counts[i])))))),
    el('ol', { class: 'track', 'aria-label': 'Возрасты жизни' }, AGES.map((a, i) => {
      const j = state.journal[i];
      const now = !over && i + 1 === ep && !j;
      return el('li', { class: j ? `seg done sp${j.toSphere ?? j.sphere}` : now ? 'seg now' : 'seg', 'aria-current': now ? 'step' : false },
        el('span', { class: 'seg-age' }, String(a)));
    }))));
}

/** Годы между сценами пролетают на табло: 17, 18, … 23 года. */
function countUp(node, from, to) {
  const say = (n) => { node.textContent = typo(`${n} ${yearsWord(n)}`); };
  let n = from;
  say(n);
  const t = setInterval(() => {
    if (!node.isConnected) { clearInterval(t); return; }
    say(++n);
    if (n >= to) clearInterval(t);
  }, Math.round(Math.min(110, Math.max(55, 620 / (to - from)))));
}

const shareUrls = []; // картинки карточки типа живут, пока открыт финал
function render() {
  while (shareUrls.length) URL.revokeObjectURL(shareUrls.pop());
  renderHud();
  root.replaceChildren();
  document.body.classList.toggle('at-start', !state);
  // свет над столом по времени года: глава сцены, а в конце — время года, когда герой умер (у него осень, у неё весна)
  const pend = state && pendingResult(state);
  const season = !state ? '' : isOver(state) && !pend ? (state.sex === 'F' ? '1' : '3') : String(Math.min(4, Math.ceil((pend ? pend.episode : state.episode) / 4)));
  if (document.body.dataset.season !== season) document.body.dataset.season = season;
  if (!state) return renderStart();
  if (pendingResult(state)) return renderResult();
  if (isOver(state)) return renderEnding();
  return renderScene();
}

/** Что нового — только тем, кто уже играл: пока не закроют заметку или не начнут новую жизнь. */
const NEWS_KEY = 'prozhit-zhizn:news';
const NEWS_VERSION = '1.1';
const newsSeen = () => { try { return !LS || LS.getItem(NEWS_KEY) === NEWS_VERSION; } catch { return true; } };
const newsDone = () => { try { if (LS) LS.setItem(NEWS_KEY, NEWS_VERSION); } catch { /* ignore */ } };
function newsNote(saved) {
  if (newsSeen() || (!saved && !seenSet().size)) return null;
  const note = el('aside', { class: 'news deal', style: '--i:1', 'aria-label': 'Что нового' },
    el('p', { class: 'news-k' }, 'Новое в версии 1.1'),
    el('p', { class: 'news-t' }, 'Жизнь теперь идёт четырьмя главами, от весны детства до зимы старости, у каждой своя картина. Лицо героя взрослеет с каждым ходом, а в конце ждут картина твоего типа и эпилог.'),
    el('button', { class: 'news-x', type: 'button', 'aria-label': 'Скрыть', onclick: () => {
      newsDone();
      const next = root.querySelector('#continue, .hero-card'); // фокус не теряется: переходит к следующей кнопке
      note.remove();
      if (next) next.focus();
    } }, '×'));
  return note;
}

/** Знак «Прожить жизнь»: солнце гексаграммы 64 «Перед переправой» (Огонь над Водой). Черты проявляются снизу вверх. */
const MARK_LINES = [
  'M14.65 50H27Q28 50 28 51V55Q28 56 27 56H25A25 25 0 0 1 14.65 50ZM37 50H49.35A25 25 0 0 1 39 56H37Q36 56 36 55V51Q36 50 37 50Z',
  'M9.09 42H54.91A25 25 0 0 1 51.21 48H12.79A25 25 0 0 1 9.09 42Z',
  'M7.08 34H27Q28 34 28 35V39Q28 40 27 40H8.31A25 25 0 0 1 7.08 34ZM37 34H56.92A25 25 0 0 1 55.69 40H37Q36 40 36 39V35Q36 34 37 34Z',
  'M8.31 24H55.69A25 25 0 0 1 56.92 30H7.08A25 25 0 0 1 8.31 24Z',
  'M12.79 16H27Q28 16 28 17V21Q28 22 27 22H9.09A25 25 0 0 1 12.79 16ZM37 16H51.21A25 25 0 0 1 54.91 22H37Q36 22 36 21V17Q36 16 37 16Z',
  'M25 8H39A25 25 0 0 1 49.35 14H14.65A25 25 0 0 1 25 8Z',
];
function startMark() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'start-mark');
  svg.setAttribute('viewBox', '6 6 52 52');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  MARK_LINES.forEach((d, i) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('class', i >= 3 ? 'ln fire' : 'ln');
    p.setAttribute('style', `--i:${i}`);
    p.setAttribute('d', d);
    svg.append(p);
  });
  return svg;
}

function renderStart() {
  keyHandler = null;
  const saved = LS ? storage.load(LS) : null;
  const hadBroken = LS && storage.exists(LS) && !saved;
  const hero = (sex, label, sub) => {
    const n = seenCount(sex);
    const total = sceneMap(sex).reduce((k, r) => k + r.scenes.filter(Boolean).length, 0);
    const card = el('button', { class: 'hero-card deal', id: `start-${sex.toLowerCase()}`, style: `--i:${sex === 'M' ? 1 : 2}`, onclick: (e) => start(sex, e.currentTarget) },
      picture(portraitFor(sex), label, 'portrait', true, SIZES.hero),
      el('span', { class: 'hero-name' }, label),
      el('span', { class: 'hero-sub' }, sub),
      el('span', { class: 'meter', 'aria-hidden': 'true' }, el('i', { style: `width:${Math.round((Math.min(n, total) / total) * 100)}%` })),
      el('span', { class: 'hero-progress' }, n ? `Открыто сцен: ${Math.min(n, total)} из ${total}` : `В жизни ${total} ${scenesWord(total)}, за одну увидишь 16`),
      el('span', { class: 'hero-go' }, 'Начать'));
    ageCycle(card, sex);
    return card;
  };
  // картины первых глав грузятся заранее, пока выбирают жизнь: глава откроется сразу в нужном виде
  const ch = saved && !isOver(saved) ? chapterAt(saved.episode) : null;
  if (ch) prefetch(chapterArt(saved.sex, ch.n));
  setTimeout(() => { if (!state) ['M', 'F'].forEach((sex) => prefetch(chapterArt(sex, 1))); }, 1500);
  const cover = painting(COVER_ART, 'Город на большой реке в золотой час', 'cover', SIZES.cover);
  root.append(el('section', { class: 'start' },
    cover,
    // знак игры: солнце гексаграммы 64, медаль на нижнем крае обложки
    el('span', { class: 'logo-slot' }, startMark()),
    el('p', { class: 'eyebrow' }, '16 решений · от 6 до 84 лет'),
    el('h1', { class: 'title' }, 'Прожить жизнь'),
    el('p', { class: 'lede' }, 'Город на большой реке, шестнадцать возрастов. В каждом тебе сдают сцену и четыре карты поступков, и каждая ведёт в свою сторону жизни. Люди запомнят твои поступки, а в конце станет ясно, каким человеком была прожита эта жизнь.'),
    el('ul', { class: 'suit-legend', 'aria-label': 'Четыре масти' }, SUITS.map((s, i) => el('li', {}, suitChip(i)))),
    newsNote(saved),
    hadBroken ? el('p', { class: 'warn' }, 'Прошлое сохранение повреждено и не может быть восстановлено. Можно начать новую жизнь.') : null,
    saved ? el('div', { class: 'actions' }, el('button', { class: 'btn-go', id: 'continue', onclick: () => swap(() => { state = saved; render(); window.scrollTo(0, 0); }) },
      isOver(saved) ? 'Вернуться к концу жизни' : `Продолжить · ${ageText(ageOf(saved.episode))}`)) : null,
    el('h2', { class: 'pick-title' }, saved ? 'Или начать новую жизнь' : 'Чью жизнь прожить'),
    el('div', { class: 'hero-row' },
      hero('M', 'Его жизнь', 'Мальчик из Заречья: гаражи, река, моторы'),
      hero('F', 'Её жизнь', 'Девочка из Слободы: брат, подруга, больница')),
  ));
  ambience(cover, 2); // золотой час над городом: тёплые пылинки и пух поднимаются в свете
}

/** На компьютере при наведении лицо на карте героя взрослеет: шесть возрастов по кругу. Слои старших лиц грузятся при первом наведении. */
function ageCycle(card, sex) {
  const fig = card.querySelector('.portrait');
  try { if (!fig || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return; } catch { return; }
  const label = (a) => `${a} ${yearsWord(a)}`;
  const ages = lifeFaces(sex); // 1.1: все шестнадцать возрастов, лицо стареет плавнее
  const step = ages.length > 6 ? 800 : 1100;
  if (ages.length > 6) card.classList.add('many'); // шестнадцать лиц: смена быстрее, каждое лицо видно чисто
  const badge = el('span', { class: 'age-badge', 'aria-hidden': 'true' }, label(ages[0]));
  fig.append(badge);
  let layers = null, k = 0, timer = null;
  const setAge = (to) => {
    if (to > k) for (let i = 0; i < to; i++) layers[i].classList.add('on');
    else if (to < k) {
      // назад: нижние слои убираются сразу (под верхним их не видно), верхний гаснет плавно
      const top = k - 1;
      layers.forEach((im, i) => { if (i >= to && i !== top) { im.classList.add('cut'); im.classList.remove('on'); } });
      layers[top].classList.remove('on');
      requestAnimationFrame(() => requestAnimationFrame(() => layers.forEach((im) => im.classList.remove('cut'))));
    }
    k = to;
    // подпись меняется, когда новое лицо уже наполовину проявилось
    clearTimeout(badge.t);
    badge.t = setTimeout(() => { badge.textContent = label(ages[k]); }, Math.round(step * .32));
  };
  card.addEventListener('mouseenter', () => {
    if (calm()) return;
    if (!layers) layers = ages.slice(1).map((a) => {
      const src = ageFor(sex, a);
      const im = el('img', { class: 'age-layer', srcset: src.set, sizes: SIZES.hero, src: src.local, alt: '', decoding: 'async' });
      im.addEventListener('error', () => { if (im.hasAttribute('srcset')) { im.removeAttribute('srcset'); im.removeAttribute('sizes'); } }, { once: true });
      return fig.insertBefore(im, badge);
    });
    card.classList.add('aging');
    clearInterval(timer);
    timer = setInterval(() => { if (!card.isConnected) { clearInterval(timer); return; } setAge((k + 1) % ages.length); }, step);
  });
  card.addEventListener('mouseleave', () => {
    clearInterval(timer);
    card.classList.remove('aging');
    if (layers) setAge(0);
  });
}

/** Старт в случайной стороне жизни; сначала те первые сцены, которых игрок ещё не видел. Номер старта = номер сферы. */
function pickStart(sex) {
  const seen = seenSet();
  const all = START_OPTIONS.map((_, k) => k);
  const fresh = all.filter((k) => !seen.has(`${sex}1-${k}`));
  const pool = fresh.length ? fresh : all;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Начать жизнь. Портрет с карты героя улетает в табло: этот ребёнок теперь ты. */
function start(sex, card) {
  const face = card && card.querySelector('.portrait.ready');
  if (face && canMorph()) fly(face, 'face');
  newsDone();
  swap(() => {
    state = newGame(sex, pickStart(sex));
    persist();
    render();
    window.scrollTo(0, 0);
  });
}

function restartControl() {
  if (!confirmRestart) return el('button', { class: 'link', id: 'restart', onclick: () => { confirmRestart = true; render(); } }, 'Начать заново');
  return el('span', { class: 'confirm' }, 'Стереть эту жизнь? ',
    el('button', { class: 'link danger', id: 'restart-yes', onclick: () => swap(() => { confirmRestart = false; if (LS) storage.clear(LS); state = null; render(); window.scrollTo(0, 0); }) }, 'Да'),
    ' · ',
    el('button', { class: 'link', id: 'restart-no', onclick: () => { confirmRestart = false; render(); } }, 'Нет'));
}

/** Лента портретов героя от шести до старости: одно лицо, которое взрослеет. В 1.1 — все шестнадцать возрастов жизни. */
function agesStrip(sex) {
  const ages = lifeFaces(sex);
  const title = ages.length === AGES.length ? 'Одно лицо, шестнадцать возрастов' : 'Одно лицо, шесть возрастов';
  return el('section', { class: 'ages', 'aria-label': title },
    el('h3', { class: 'table-title' }, title),
    el('div', { class: ages.length > 6 ? 'ages-row all' : 'ages-row' }, ages.map((a, i) => el('figure', { class: 'age-card deal', style: `--i:${Math.min(i, 8)}` },
      picture(ageFor(sex, a), `${a} ${yearsWord(a)}`, 'portrait', false, SIZES.strip),
      el('figcaption', { class: 'age-num' }, ages.length > 6 ? String(a) : `${a} ${yearsWord(a)}`)))));
}

/** Кружок человека в финале: портрет, каким герой его помнит, а если портрета нет или он не загрузился — первая буква имени. */
function personToken(p) {
  const art = state && personArt(state.sex, p.key);
  if (!art) return el('span', { class: 'token', 'aria-hidden': 'true' }, p.name.charAt(0));
  const tok = el('span', { class: 'token face', 'aria-hidden': 'true' });
  const img = el('img', { src: art.local, srcset: art.set, sizes: '(min-width: 48rem) 52px, 46px', alt: '', loading: 'lazy', decoding: 'async' });
  img.addEventListener('error', () => { tok.classList.remove('face'); tok.replaceChildren(p.name.charAt(0)); }, { once: true });
  tok.append(img);
  return tok;
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
    buzz();
    const go = () => {
      try { state = applyChoice(state, id, debugOpts); persist(); } finally { busy = false; }
      render();
      window.scrollTo(0, 0);
    };
    if (!card || calm()) return go();
    root.querySelectorAll('.choice').forEach((b) => b.classList.add(b === card ? 'picked' : 'dropped'));
    // выбранная карта приподнимается, остальные уходят; потом она переворачивается и становится итогом
    if (canMorph()) setTimeout(() => { fly(card, 'played'); swap(go, 'played'); }, 240);
    else setTimeout(go, 330);
  };
  // Если пришли кнопкой «Дальше», картинка следующей карты вырастает в картинку сцены.
  const grown = morph === 'next';
  const sceneArt = art(imageFor(sc.img), `${sc.title}, ${sc.ageText}`, sc.sphere, { eager: true });
  if (grown) fly(sceneArt, 'next');
  const chapter = chapterAt(sc.episode);
  root.append(el('article', { class: 'scene' },
    chapter ? chapterHead(chapter, grown) : null,
    el('div', { class: 'board' },
      el('section', { class: grown ? 'card scene-card' : 'card scene-card deal' },
        sceneArt,
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
  const hand = root.querySelector('.hand');
  requestAnimationFrame(() => { if (hand.isConnected && hand.offsetHeight < window.innerHeight - 130) hand.classList.add('pin'); });
  keyHandler = (e) => {
    const n = Number(e.key);
    if (n >= 1 && n <= sc.choices.length && !e.metaKey && !e.ctrlKey && !e.altKey) choose(sc.choices[n - 1].id, document.getElementById(`choice-${n}`));
  };
}

function renderResult() {
  const j = pendingResult(state);
  const fork = forkOf(state, j);
  const next = () => {
    if (busy) return;
    busy = true;
    endingFresh = isOver(state); // жизнь только что закончилась: в финале она пролетит перед глазами
    const go = () => {
      try { state = acknowledge(state); persist(); } finally { busy = false; }
      render();
      window.scrollTo(0, 0);
    };
    const pic = root.querySelector('.mini.open .mini-art');
    if (pic && canMorph()) fly(pic, 'next');
    swap(go, pic ? 'next' : null);
  };
  const rem = j.remembers || [];
  const sp = fork ? fork.sphere : j.sphere;
  const played = morph === 'played'; // эта карта прилетела перевёрнутой с прошлого экрана
  const go = el('div', { class: 'go-bar' }, el('button', { class: 'btn-go', id: 'next', onclick: next },
    isOver(state) ? 'К концу жизни' : `Дальше · ${ageText(ageOf(state.episode))}`));
  // Следующая карта уже с картинкой (она же грузится заранее), а если герой войдёт в новый возраст, видно, как изменится лицо.
  const nextKey = fork ? `${state.sex}${j.episode + 1}-${fork.sphere}` : null;
  const nextChapter = fork ? chapterAt(j.episode + 1) : null; // следующая сцена открывает главу: её картина грузится заранее
  if (nextChapter) prefetch(chapterArt(state.sex, nextChapter.n));
  const nowAge = ageOf(j.episode);
  const growFace = (a) => el('figure', { class: 'grow-face' }, picture(ageFor(state.sex, faceAge(a)), '', 'face', true, SIZES.face), el('figcaption', {}, `${a} ${yearsWord(a)}`));
  const grow = fork && faceGroup(fork.age) !== faceGroup(nowAge)
    ? el('div', { class: 'grow deal', style: '--i:2', role: 'img', 'aria-label': `Лицо повзрослеет: было ${ageText(nowAge)}, станет ${fork.ageText}` },
      growFace(nowAge), el('span', { class: 'grow-arrow', 'aria-hidden': 'true' }, '→'), growFace(fork.age))
    : null;
  root.append(el('article', { class: 'result' },
    el('section', { class: `card result-card${played ? '' : ' flip'} sp${sp}`, style: played ? 'view-transition-name:played' : false, 'data-vt': played },
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
      el('div', { class: 'fork-head' },
        el('h3', { class: 'table-title' }, `Следующая карта · через ${fork.years} ${yearsWord(fork.years)}`),
        grow),
      el('div', { class: fork.closed.length ? 'fork-row' : 'fork-row solo' },
        el('div', { class: `mini open deal sp${fork.sphere}`, style: '--i:3' },
          art(imageFor(nextKey), '', fork.sphere, { cls: 'mini-art', eager: true, sizes: SIZES.mini }), preloadScene(nextKey),
          el('div', { class: 'mini-body' },
            el('span', { class: 'mini-suit' }, icon(fork.sphere), SUITS[fork.sphere].name),
            el('b', { class: 'mini-title' }, `«${fork.title}»`),
            fork.hook ? el('p', { class: 'mini-hook' }, fork.hook) : null)),
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

/** Альбом жизни: шестнадцать сыгранных карт с картинками. По нажатию карта открывается воспоминанием. */
function album() {
  return el('section', { class: 'album', 'aria-labelledby': 'album-title' },
    el('h3', { class: 'table-title', id: 'album-title' }, 'Шестнадцать карт этой жизни'),
    el('p', { class: 'table-note' }, g('Нажми на карту, чтобы вспомнить, что ты тогда {сделал|сделала} и что было дальше.')),
    el('ol', { class: 'album-grid' }, state.journal.flatMap((j, i) => {
      const age = ageOf(j.episode);
      const ch = chapterAt(j.episode); // 1.1: альбом разложен по главам жизни, у каждой своя строка
      const head = ch ? el('li', { class: 'album-ch' },
        el('span', { class: 'chapter-k' }, `Глава\u00A0${ch.roman}`), el('span', { class: 'album-ch-t' }, ch.title), el('span', { class: 'album-ch-a' }, ch.ages)) : null;
      const card = el('li', {}, el('button', { class: `album-card sp${j.sphere}`, id: `memory-${i + 1}`, onclick: () => remember(i) },
        art(imageFor(j.img), '', j.sphere, { sizes: SIZES.album }),
        el('span', { class: 'album-body' },
          el('span', { class: 'album-age' }, icon(j.sphere), `${age} ${yearsWord(age)}`),
          el('span', { class: 'album-title' }, j.title))));
      return head ? [head, card] : [card];
    })));
}

/** Воспоминание: сыгранная карта целиком — картинка, поступок, цена и что было дальше. Листается кнопками, стрелками и свайпом. */
function remember(at) {
  let i = at;
  const n = state.journal.length;
  const dlg = el('dialog', { class: 'memory', 'aria-labelledby': 'memory-title' });
  const close = () => {
    if (typeof dlg.close === 'function') dlg.close();
    else { dlg.removeAttribute('open'); dlg.dispatchEvent(new Event('close')); }
  };
  const show = () => {
    const j = state.journal[i];
    const age = ageOf(j.episode);
    dlg.replaceChildren(el('article', { class: `card memory-card sp${j.sphere}` },
      el('button', { class: 'memory-x', id: 'memory-close', 'aria-label': 'Закрыть', autofocus: true, onclick: close }, '×'),
      art(imageFor(j.img), `${j.title}, ${ageText(age)}`, j.sphere, { eager: true, sizes: SIZES.memory }),
      el('div', { class: 'card-body' },
        el('p', { class: 'card-meta' }, suitChip(j.sphere), `Тебе ${ageText(age)} · карта ${i + 1} из ${n}`),
        el('h2', { class: 'scene-title', id: 'memory-title' }, j.title),
        el('div', { class: 'deed' }, el('h3', { class: 'label' }, g('Что ты {сделал|сделала}')), el('p', {}, j.text)),
        el('p', { class: 'cost' }, j.cost),
        el('div', { class: 'outcome' }, el('h3', { class: 'label' }, 'Что было дальше'), el('p', {}, j.note))),
      el('nav', { class: 'memory-nav', 'aria-label': 'Другие карты жизни' },
        el('button', { class: 'nav-btn', id: 'memory-prev', disabled: i === 0, onclick: () => go(-1) }, '← Раньше'),
        el('button', { class: 'nav-btn', id: 'memory-next', disabled: i === n - 1, onclick: () => go(1) }, 'Позже →'))));
    dlg.scrollTop = 0;
  };
  const go = (d) => {
    const k = i + d;
    if (k < 0 || k >= n) return;
    const keep = document.activeElement && dlg.contains(document.activeElement) ? document.activeElement.id : null;
    i = k;
    show();
    const b = keep && document.getElementById(keep);
    (b && !b.disabled ? b : dlg.querySelector('.memory-x')).focus();
  };
  dlg.addEventListener('close', () => {
    dlg.remove();
    const b = document.getElementById(`memory-${i + 1}`);
    if (b) b.focus();
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
  });
  let touch = null;
  dlg.addEventListener('touchstart', (e) => { touch = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; }, { passive: true });
  dlg.addEventListener('touchend', (e) => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.x, dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) go(dx < 0 ? 1 : -1);
  });
  show();
  document.body.append(dlg);
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
}

// ---------- карточка типа для друзей ----------
const SITE = 'life64.alesha.love';
const loadImage = (src) => new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = src; });
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
/** Строки по ширине; неразрывные пробелы типографики не рвутся, слишком длинный текст обрезается многоточием. */
function wrapText(ctx, text, width, max = 99) {
  const lines = [];
  let cur = '';
  for (const w of typo(text).split(' ')) {
    const test = cur ? `${cur} ${w}` : w;
    if (!cur || ctx.measureText(test).width <= width) cur = test;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > max) {
    const cut = lines.slice(0, max);
    let last = cut[max - 1];
    while (last.includes(' ') && ctx.measureText(`${last}…`).width > width) last = last.slice(0, last.lastIndexOf(' '));
    cut[max - 1] = `${last.replace(/[,.;:—\s]+$/, '')}…`;
    return cut;
  }
  return lines;
}
/** Картинка 1080×1350: одно лицо в шести возрастах, тип, его суть, итоговая гексаграмма и адрес игры. */
async function typeCard(t, ep) {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const F = "Onest, 'Segoe UI', Roboto, system-ui, sans-serif";
  try { await Promise.all(['700 96px Onest', '600 28px Onest', '500 40px Onest'].map((f) => document.fonts.load(f))); } catch { /* запасной шрифт */ }
  const paint = typeArt(t.quad, t.role);
  const [faces, mark, pic] = await Promise.all([Promise.all(PORTRAIT_AGES.map((a) => loadImage(ageFor(state.sex, a).local))), loadImage('mark-paper.png'), paint ? loadImage(paint.local) : null]);
  // стол
  ctx.fillStyle = '#1a2427';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, -260, 80, W / 2, -260, 1250);
  glow.addColorStop(0, '#2c3c41'); glow.addColorStop(1, 'rgba(26, 36, 39, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  // карта в золотой рамке, как в игре
  const X = 60, Y = 60, CW = W - 120, CH = H - 120;
  ctx.save();
  ctx.shadowColor = 'rgba(5, 10, 12, .5)'; ctx.shadowBlur = 48; ctx.shadowOffsetY = 18;
  const gold = ctx.createLinearGradient(X, Y, X + CW, Y + CH);
  gold.addColorStop(0, '#f2deb0'); gold.addColorStop(0.4, '#e0b25e'); gold.addColorStop(0.7, '#a98238'); gold.addColorStop(1, '#f2deb0');
  ctx.fillStyle = gold;
  roundRect(ctx, X, Y, CW, CH, 40);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#f7f3ec';
  roundRect(ctx, X + 6, Y + 6, CW - 12, CH - 12, 35);
  ctx.fill();
  const L = X + 64, R = X + CW - 64, IW = R - L;
  const gap = 12, fw = (IW - gap * 5) / 6, fh = fw * 1.25;
  let fy = Y + 64;
  // 1.1: картина типа полосой по верху карты, лица ложатся на её нижний край
  if (pic) {
    const bx = X + 6, by = Y + 6, bw = CW - 12, bh = 336;
    ctx.save();
    roundRect(ctx, bx, by, bw, CH - 12, 35);
    ctx.clip();
    const s = Math.max(bw / pic.naturalWidth, bh / pic.naturalHeight), sw = bw / s, sh = bh / s;
    ctx.drawImage(pic, (pic.naturalWidth - sw) / 2, (pic.naturalHeight - sh) * 0.45, sw, sh, bx, by, bw, bh);
    ctx.restore();
    ctx.fillStyle = 'rgba(169, 130, 56, .6)';
    ctx.fillRect(bx, by + bh, bw, 2);
    fy = by + bh - Math.round(fh * 0.5);
  }
  // одно лицо, шесть возрастов
  faces.forEach((im, k) => {
    const x = L + k * (fw + gap);
    if (pic) { // бумажная рамка с тенью, чтобы лица читались поверх картины
      ctx.save();
      ctx.shadowColor = 'rgba(20, 28, 31, .35)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
      ctx.fillStyle = '#f7f3ec';
      roundRect(ctx, x - 6, fy - 6, fw + 12, fh + 12, 20);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    roundRect(ctx, x, fy, fw, fh, 16);
    ctx.clip();
    ctx.fillStyle = '#ede7dc';
    ctx.fillRect(x, fy, fw, fh);
    if (im) {
      const s = Math.max(fw / im.naturalWidth, fh / im.naturalHeight), sw = fw / s, sh = fh / s;
      ctx.drawImage(im, (im.naturalWidth - sw) / 2, (im.naturalHeight - sh) / 2, sw, sh, x, fy, fw, fh);
    }
    ctx.restore();
    ctx.fillStyle = '#5f6769';
    ctx.font = `600 26px ${F}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(PORTRAIT_AGES[k]), x + fw / 2, fy + fh + 38);
  });
  ctx.textAlign = 'left';
  let y = fy + fh + 38 + 92;
  ctx.fillStyle = '#5f6769';
  ctx.font = `500 40px ${F}`;
  ctx.fillText(g('Ты {прожил|прожила} эту жизнь как'), L, y);
  // тип: самый крупный кегль, при котором имя входит в две строки
  let size = 108, nameLines;
  for (; size > 56; size -= 4) {
    ctx.font = `700 ${size}px ${F}`;
    nameLines = wrapText(ctx, t.name, IW);
    if (nameLines.length <= 2 && nameLines.every((ln) => ctx.measureText(ln).width <= IW)) break;
  }
  ctx.fillStyle = '#23282a';
  y += 22;
  for (const ln of nameLines) { y += size * 1.02; ctx.fillText(ln, L, y); }
  y += 30;
  ctx.font = `500 42px ${F}`;
  ctx.fillStyle = '#23282a';
  const footTop = Y + CH - 168;
  const room = Math.max(1, Math.floor((footTop - 40 - y) / 60));
  for (const ln of wrapText(ctx, t.essence, IW, Math.min(room, 6))) { y += 60; ctx.fillText(ln, L, y); }
  // поступки, по которым виден тип: сколько поместится, до трёх
  const deeds = (t.deeds || []).slice(0, 3);
  if (deeds.length && footTop - y > 240) {
    y += 78;
    ctx.fillStyle = '#5f6769';
    ctx.font = `600 28px ${F}`;
    ctx.fillText('Это видно по поступкам', L, y);
    const AW = 150;
    for (const d of deeds) {
      ctx.font = `500 34px ${F}`;
      const lines = wrapText(ctx, d.text, IW - AW, 2);
      if (y + 24 + lines.length * 46 > footTop - 36) break;
      y += 24;
      ctx.fillStyle = '#5f6769';
      ctx.font = `600 32px ${F}`;
      ctx.fillText(`${d.age} ${yearsWord(d.age)}`, L, y + 46);
      ctx.fillStyle = '#23282a';
      ctx.font = `500 34px ${F}`;
      for (const ln of lines) { y += 46; ctx.fillText(ln, L + AW, y); }
    }
  }
  // подвал: итоговая гексаграмма и адрес
  ctx.fillStyle = '#e1d9cb';
  ctx.fillRect(L, footTop, IW, 2);
  const hx = L, hy = footTop + 40, hs = 2.6;
  const hl = state.journal.length ? state.journal[state.journal.length - 1].line : 0;
  for (let l = 1; l <= 6; l++) {
    const ry = hy + (20.8 - (l - 1) * 4.16) * hs;
    ctx.fillStyle = l === hl ? '#a98238' : '#23282a';
    for (const [x0, w0] of line(state.bits, l) ? [[0, 20]] : [[0, 7.8], [12.2, 7.8]]) { roundRect(ctx, hx + x0 * hs, ry, w0 * hs, 2.2 * hs, 2); ctx.fill(); }
  }
  ctx.font = `600 30px ${F}`;
  const siteW = ctx.measureText(SITE).width;
  ctx.font = `700 36px ${F}`;
  const brandW = Math.max(ctx.measureText('Прожить жизнь').width, siteW);
  // знак игры (солнце гексаграммы 64) слева от названия и адреса
  const MS = 76, markX = R - brandW - 22 - MS;
  const tx = hx + 52 + 26, room2 = (mark ? markX - 28 : R - brandW - 36) - tx;
  if (mark) ctx.drawImage(mark, markX, hy - 8, MS, MS);
  ctx.fillStyle = '#5f6769';
  ctx.font = `500 26px ${F}`;
  ctx.fillText('Итог по И-Цзин', tx, hy + 22);
  // название узла целиком: сначала кегль поменьше, потом в две строки
  ctx.fillStyle = '#23282a';
  const motifText = `№${ep.final.hex} «${ep.final.motif}»`;
  let fs = 30;
  for (; fs > 23; fs -= 2) { ctx.font = `600 ${fs}px ${F}`; if (ctx.measureText(motifText).width <= room2) break; }
  const mLines = ctx.measureText(motifText).width <= room2 ? [motifText] : wrapText(ctx, motifText, room2, 2);
  mLines.forEach((ln, i) => ctx.fillText(ln, tx, hy + 60 + i * (fs + 6)));
  ctx.textAlign = 'right';
  ctx.font = `700 36px ${F}`;
  ctx.fillText('Прожить жизнь', R, hy + 22);
  ctx.fillStyle = '#a98238';
  ctx.font = `600 30px ${F}`;
  ctx.fillText(SITE, R, hy + 62);
  return new Promise((ok) => { try { c.toBlob(ok, 'image/png'); } catch { ok(null); } });
}

/** Под картой типа: поделиться картинкой (где можно отправить файл) или сохранить её. Картинка готовится заранее. */
function shareRow(t, ep) {
  const note = el('p', { class: 'share-note', 'aria-live': 'polite' });
  const row = el('div', { class: 'share' });
  let made = null;
  const make = () => {
    if (!made) {
      made = typeCard(t, ep).then((blob) => {
        if (!blob) throw new Error('canvas');
        const url = URL.createObjectURL(blob);
        shareUrls.push(url);
        return { blob, url, file: new File([blob], 'prozhit-zhizn.png', { type: 'image/png' }) };
      });
      made.catch(() => { made = null; });
    }
    return made;
  };
  const preview = (m) => {
    if (row.querySelector('.share-preview')) return;
    row.append(el('figure', { class: 'share-preview' },
      el('img', { src: m.url, alt: `Карточка типа «${t.name}»`, width: '1080', height: '1350' }),
      el('figcaption', {}, 'Это картинка для друзей. Её можно сохранить: нажми и подержи или нажми «Сохранить картинку».')));
  };
  let shareFiles = false;
  try { shareFiles = !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.png', { type: 'image/png' })] })); } catch { shareFiles = false; }
  const share = async () => {
    try {
      const m = await make();
      preview(m);
      await navigator.share({ files: [m.file], title: 'Прожить жизнь', text: `${g('Я {прожил|прожила} эту жизнь как')} ${t.name}. https://${SITE}` });
    } catch (e) {
      if (!e || e.name !== 'AbortError') note.textContent = 'Отправить отсюда не получилось. Картинку можно сохранить.';
    }
  };
  const save = async () => {
    try {
      const m = await make();
      preview(m);
      const a = el('a', { href: m.url, download: 'prozhit-zhizn.png' });
      document.body.append(a);
      a.click();
      a.remove();
    } catch { note.textContent = 'В этом браузере картинка не получилась.'; }
  };
  row.append(el('div', { class: 'share-actions' },
    shareFiles ? el('button', { class: 'btn-soft', id: 'share', onclick: share }, 'Поделиться типом') : null,
    el('button', { class: 'btn-soft', id: 'save-card', onclick: save }, 'Сохранить картинку')), note);
  // заранее, чтобы «Поделиться» сработало сразу по нажатию (браузеры разрешают отправку только в ответ на него)
  setTimeout(() => { if (row.isConnected) make().catch(() => {}); }, 1200);
  return row;
}

/** Вся жизнь перед глазами: в картинке финала одна за другой проходят сыгранные сцены, от шести лет до последнего вечера.
 *  Сама запускается один раз, когда жизнь только что закончилась (и не при «меньше движения»), потом — кнопкой на картинке.
 *  Нажатие на картинку во время показа его останавливает. */
let endingFresh = false;
const REEL_STEP = 850;
const REEL_ORIGINS = ['50% 42%', '38% 50%', '62% 46%', '50% 60%'];
function playIcon() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'ico ico-play');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', 'M8 5.8v12.4a.6.6 0 0 0 .92.5l9.7-6.2a.6.6 0 0 0 0-1L8.92 5.3a.6.6 0 0 0-.92.5z');
  svg.append(p);
  return svg;
}
function lifeReel(lastJ) {
  const fig = art(imageFor(lastJ.img), 'Последний вечер', lastJ.sphere, { eager: true, sizes: SIZES.finale });
  const fresh = endingFresh;
  endingFresh = false;
  const shots = state.journal.slice(0, -1).map((j) => ({ src: imageFor(j.img), age: ageOf(j.episode), title: j.title })).filter((s) => s.src);
  if (shots.length < 4) return fig;
  const last = { age: ageOf(lastJ.episode), title: lastJ.title };
  const cap = el('span', { class: 'reel-cap', 'aria-hidden': 'true' });
  const bar = el('span', { class: 'reel-bar', 'aria-hidden': 'true' });
  const btn = el('button', { class: 'reel-btn', type: 'button', 'aria-pressed': 'false' }, playIcon(), 'Пролистать жизнь');
  fig.classList.add('reel');
  fig.append(cap, bar, btn);
  const say = (s) => { cap.textContent = typo(`${s.age} ${yearsWord(s.age)} · ${s.title}`); };
  let frames = null;
  let run = 0; // номер показа: таймеры прошлого показа видят, что он уже не их, и молчат
  const frameSet = () => frames || (frames = shots.map((s, i) => fig.insertBefore(
    el('img', { class: 'reel-frame', srcset: s.src.set || null, sizes: s.src.set ? SIZES.finale : null, src: s.src.local, alt: '', decoding: 'async', fetchpriority: 'low', style: `transform-origin:${REEL_ORIGINS[i % REEL_ORIGINS.length]}`, onerror: (e) => { const im = e.currentTarget; if (im.hasAttribute('srcset')) { im.removeAttribute('srcset'); im.removeAttribute('sizes'); } } }), cap)));
  const later = (mine, ms, f) => setTimeout(() => { if (mine === run && fig.isConnected) f(); }, ms);
  const playing = (on) => { fig.classList.toggle('playing', on); btn.setAttribute('aria-pressed', String(on)); if (!on) fig.classList.remove('cued'); };
  const stop = () => {
    run++;
    playing(false);
    if (frames) frames.forEach((f) => f.classList.remove('on'));
  };
  async function play() {
    const mine = ++run;
    const list = frameSet();
    fig.classList.add('cued');
    // кадры, которые не успели загрузиться за четыре секунды, пропускаются
    await Promise.race([Promise.allSettled(list.map((f) => f.decode())), new Promise((ok) => setTimeout(ok, 4000))]);
    if (mine !== run || !fig.isConnected) return;
    const ready = list.map((f, i) => [f, shots[i]]).filter(([f]) => f.complete && f.naturalWidth);
    if (ready.length < 4) { fig.classList.remove('cued'); return; }
    list.forEach((f) => f.classList.remove('on'));
    fig.style.setProperty('--reel', `${(ready.length + 1) * REEL_STEP}ms`);
    playing(true);
    let k = 0;
    const tick = () => {
      if (k < ready.length) {
        const [f, s] = ready[k];
        const prev = k > 0 ? ready[k - 1][0] : null;
        f.classList.add('on');
        say(s);
        if (prev) later(mine, 700, () => prev.classList.remove('on')); // прошлый кадр гаснет, когда новый уже лёг поверх
        k++;
        later(mine, REEL_STEP, tick);
      } else {
        ready[ready.length - 1][0].classList.remove('on'); // под последним кадром — последний вечер
        say(last);
        later(mine, 1700, () => playing(false));
      }
    };
    tick();
  }
  btn.addEventListener('click', (e) => { e.stopPropagation(); if (fig.classList.contains('playing')) stop(); else play(); });
  fig.addEventListener('click', () => { if (fig.classList.contains('playing')) stop(); });
  if (fresh && !calm()) {
    // кадры начинают грузиться, когда уже видна сама картинка последнего вечера: на медленной сети она важнее
    fig.classList.add('cued');
    const main = fig.querySelector('img');
    let begun = false;
    const begin = () => {
      if (begun) return;
      begun = true;
      frameSet();
      setTimeout(() => { if (fig.isConnected && !run) play(); }, 1300);
    };
    if (!main || (main.complete && main.naturalWidth)) begin();
    else {
      main.addEventListener('load', begin, { once: true });
      main.addEventListener('error', begin, { once: true });
      setTimeout(begin, 6000);
    }
  }
  return fig;
}

/** Последняя картина жизни перед «Прожить другую жизнь»: каким героя запомнили. Без картины блока нет. */
const EPI_SEASON = { M: 'Поздняя осень, город над рекой.', F: 'Ранняя весна, на реке трогается лёд.' };
function epilogue() {
  const fig = painting(endArt(state.sex), g('{Старик|Старушка} у реки в золотой час'), 'chapter-art epi-art');
  if (fig.classList.contains('gone')) return null;
  fig.append(el('figcaption', { class: 'chapter-cap' },
    el('span', { class: 'chapter-kicker' }, el('span', { class: 'chapter-k' }, 'Эпилог'), el('span', { class: 'chapter-ages' }, `84\u00A0${yearsWord(84)}`)),
    el('h2', { class: 'chapter-name' }, g('{Таким|Такой} тебя запомнили'))));
  ambience(fig, state.sex === 'F' ? 1 : 3); // у неё ранняя весна, у него осень
  return el('section', { class: 'chapter epilogue', 'aria-label': 'Эпилог' }, fig, el('p', { class: 'chapter-epi' }, EPI_SEASON[state.sex]));
}

function renderEnding() {
  const ep = buildEpilogue(state);
  const t = ep.type;
  const pq = wholePercents(t.quadShares, QUAD_ORDER), pr = wholePercents(t.roleShares, ROLE_ORDER);
  const lastJ = state.journal[TOTAL_EPISODES - 1];
  const again = () => swap(() => { if (LS) storage.clear(LS); state = null; render(); window.scrollTo(0, 0); });
  const routeRows = ep.route.map((r) => el('tr', {},
    el('td', { class: 'num' }, String(r.age)),
    el('td', {}, el('span', { class: 'hexno' }, `№${r.hex}`), ' ', r.motif, el('span', { class: 'muted' }, ` · ${QUAD_RU[r.quadrum]} · ${r.sphere}`)),
    el('td', { class: 'num' }, `${r.line} · ${ROLE_RU[r.role]}`),
    el('td', {}, r.choice)));
  root.append(el('article', { class: 'ending' },
    el('section', { class: 'card finale deal' },
      lifeReel(lastJ),
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
        seal(ep.final.hex, lastJ.line),
        el('p', { class: 'type-kicker' }, g('Ты {прожил|прожила} эту жизнь как')),
        el('h2', { class: Math.max(...t.name.split(/\s+/).map((w) => w.length)) > 10 ? 'type-name long' : 'type-name' }, t.name),
        el('p', { class: 'type-essence' }, t.essence),
        typeArt(t.quad, t.role) ? painting(typeArt(t.quad, t.role), `Картина к типу «${t.name}»`, 'type-art', SIZES.typeArt) : null,
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
    shareRow(t, ep),
    el('p', { class: 'table-text' }, ep.final.text),
    album(),
    ep.people.length ? el('section', { class: 'people-end' }, el('h3', { class: 'table-title' }, 'Что стало с людьми твоей жизни'),
      el('ul', { class: 'cast' }, ep.people.map((p) => el('li', { class: 'person' },
        personToken(p),
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
    epilogue(),
    el('div', { class: 'actions' }, el('button', { class: 'btn-go', id: 'again', onclick: again }, 'Прожить другую жизнь')),
  ));
  revealSeal(root.querySelector('#type'));
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
