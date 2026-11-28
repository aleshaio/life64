import test from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS } from '../src/data/patterns.js';
import { LIFE, AGES, LEGACY, CHAPTERS } from '../src/data/life.js';
import { TYPES } from '../src/data/types.js';
import { holds } from '../src/core/engine.js';
import { PEOPLE } from '../src/data/people.js';

const BAD = /TODO|здесь будет|\.\.\.|…|undefined/i;
const SEXES = ['M', 'F'];
const sits = (sex) => LIFE[sex].flatMap((e) => Object.entries(e.s).map(([sp, s]) => ({ ep: e.n, sp: Number(sp), s })));
const paraText = (p) => (Array.isArray(p) ? p[1] : p);
const condOf = (p) => (Array.isArray(p) ? p[0] : null);

test('64 паттерна: уникальные номера и вариации, полные тексты', () => {
  assert.equal(PATTERNS.length, 64);
  assert.equal(new Set(PATTERNS.map((p) => p.n)).size, 64);
  assert.equal(new Set(PATTERNS.map((p) => p.variation)).size, 64);
  for (const p of PATTERNS) for (const f of ['motif', 'tension', 'hook']) assert.ok(p[f] && p[f].length > 5 && !BAD.test(p[f]), `№${p.n} ${f}`);
});

test('в каждой квадре ровно 16 узлов', () => {
  const c = {};
  PATTERNS.forEach((p) => { c[p.quadrum] = (c[p.quadrum] || 0) + 1; });
  assert.deepEqual(c, { air: 16, fire: 16, water: 16, earth: 16 });
});

test('две жизни по 16 возрастов; в каждом возрасте, и в шесть лет тоже, сцены на все четыре стороны', () => {
  for (const sex of SEXES) {
    assert.deepEqual(LIFE[sex].map((e) => e.age), AGES);
    LIFE[sex].forEach((e) => assert.deepEqual(Object.keys(e.s).sort(), ['0', '1', '2', '3'], `${sex} эпизод ${e.n}`));
    assert.equal(sits(sex).length, 64);
  }
});

test('в каждой сцене 4 поступка: черты 1 и 2, одна из 3/6, одна из 4/5; у каждого цена, итог и след', () => {
  for (const sex of SEXES) for (const { ep, sp, s } of sits(sex)) {
    const where = `${sex}${ep}-${sp}`;
    assert.ok(s.title && s.img && s.p.length >= 2, where);
    const lines = s.a.map((a) => a.l);
    assert.equal(s.a.length, 4, where);
    assert.ok(lines.includes(1) && lines.includes(2), where);
    assert.ok(lines.includes(3) !== lines.includes(6) && lines.includes(4) !== lines.includes(5), where);
    for (const a of s.a) {
      for (const f of ['t', 'c', 'n', 'e']) assert.ok(a[f] && !BAD.test(a[f]), `${where} черта ${a.l} ${f}`);
      assert.ok(a.s && (Object.keys(a.s).length > 0 || (a.alt || []).every((v) => v.s)), `${where} черта ${a.l}: поступок оставляет след`);
    }
    assert.equal(new Set(s.a.map((a) => a.t)).size, 4, where);
  }
});

test('каждое условие опирается на факт, который какой-то поступок записывает', () => {
  for (const sex of SEXES) {
    const writable = new Set(['son', 'daughter', 'base', ...PEOPLE[sex].map((p) => `@${p.key}`)]);
    sits(sex).forEach(({ s }) => s.a.forEach((a) => { Object.keys(a.s).forEach((k) => writable.add(k)); (a.alt || []).forEach((v) => v.s && Object.keys(v.s).forEach((k) => writable.add(k))); }));
    const used = [];
    const add = (c) => c && c.split('&').forEach((t) => used.push(t.trim().replace(/^!/, '').split('=')[0]));
    sits(sex).forEach(({ s }) => {
      s.p.forEach((p) => add(condOf(p)));
      if (Array.isArray(s.hook)) s.hook.forEach((h) => add(condOf(h)));
      s.a.forEach((a) => (a.alt || []).forEach((v) => add(v.if)));
    });
    LEGACY[sex].forEach((r) => add(r.if));
    for (const k of used) assert.ok(writable.has(k), `${sex}: условие на факт «${k}», который никто не записывает`);
  }
});

test('условия: синтаксис', () => {
  assert.equal(holds('a', { a: 1 }), true);
  assert.equal(holds('!a', { a: 1 }), false);
  assert.equal(holds('a=x|y', { a: 'y' }), true);
  assert.equal(holds('a=x&!b', { a: 'x', b: 0 }), true);
  assert.equal(holds('!a=x|y', { a: 'z' }), true);
});

function allTexts(sex) {
  const raw = [];
  for (const { s } of sits(sex)) {
    raw.push(s.title, ...s.p.map(paraText));
    if (s.hook) raw.push(...(Array.isArray(s.hook) ? s.hook.map(paraText) : [s.hook]));
    s.a.forEach((a) => { raw.push(a.t, a.c, a.n, a.e); (a.alt || []).forEach((v) => ['t', 'c', 'n', 'e'].forEach((k) => v[k] && raw.push(v[k]))); });
  }
  LEGACY[sex].forEach((r) => raw.push(r.t));
  return raw;
}

const fillHeir = (t) => t.replace(/\{heir\w*\}/g, 'Ася');

test('после подстановки имени преемника не остаётся скобок', () => {
  for (const sex of SEXES) for (const t of allTexts(sex)) assert.ok(!/[{}|]/.test(fillHeir(t)), `${sex}: ${t}`);
});

test('героиня не говорит о себе в мужском роде, герой — в женском (эвристика)', () => {
  const masc = /(?:^|[\s,:])(?:[Тт]ы)\s+(?:(?:не|уже|так|ещё|всё|и|бы|долго|наконец|тогда|снова|сам|первым|впервые|всю жизнь)\s+)*([а-яё]+(?:ел|ал|ил|ял|ыл|ул|ёл|лся|ён|ен)|сам|один|рад|прав|готов|уверен|должен|виноват|нужен)(?![а-яё])/g;
  const fem = /(?:^|[\s,:])(?:[Тт]ы)\s+(?:(?:не|уже|так|ещё|всё|и|бы|долго|наконец|тогда|снова|сама|впервые)\s+)*([а-яё]+(?:ла|лась)|сама|одна|рада|права|готова|уверена|должна|виновата|нужна)(?![а-яё])/g;
  const bad = [];
  const scan = (sex, re) => { for (const t of allTexts(sex)) { const plain = t.replace(/«[^»]*»/g, ''); for (const m of plain.matchAll(re)) bad.push(`${sex}: …${plain.slice(Math.max(0, m.index - 20), m.index + 40)}…`); } };
  scan('F', masc); scan('M', fem);
  assert.deepEqual(bad, []);
});

test('его и её жизни — разные истории: общих абзацев и поступков нет', () => {
  const set = (sex) => new Set(sits(sex).flatMap(({ s }) => [...s.p.map(paraText), ...s.a.map((a) => a.t)]));
  const m = set('M'), f = set('F');
  const common = [...m].filter((x) => f.has(x));
  assert.deepEqual(common, []);
  const titles = (sex) => new Set(sits(sex).map(({ s }) => s.title));
  const ct = [...titles('M')].filter((x) => titles('F').has(x));
  assert.ok(ct.length <= 3, `общие названия сцен: ${ct.join(', ')}`);
});

test('цены не повторяются внутри одной жизни', () => {
  for (const sex of SEXES) {
    const costs = sits(sex).flatMap(({ s }) => s.a.flatMap((a) => [a.c, ...(a.alt || []).map((v) => v.c).filter(Boolean)]));
    const dup = costs.filter((c, i) => costs.indexOf(c) !== i);
    assert.deepEqual(dup, [], sex);
  }
});

test('след поступка не называет возраст: «в N лет ты …» пишет движок', () => {
  const AGE_START = /^(в|к)\s+(шест|десят|четырнадцат|семнадцат|двадцат|тридцат|сорок|пятьдесят|шестьдесят|семьдесят|восемьдесят)/i;
  for (const sex of SEXES) for (const { ep, sp, s } of sits(sex)) for (const a of s.a) {
    for (const e of [a.e, ...(a.alt || []).map((v) => v.e)].filter(Boolean)) assert.ok(!AGE_START.test(e), `${sex}${ep}-${sp}: «${e}»`);
  }
});

test('нет латиницы в русских текстах (Y вместо У и т. п.)', () => {
  for (const sex of SEXES) for (const t of allTexts(sex)) assert.ok(!/[A-Za-z]/.test(fillHeir(t)), `латиница: ${t}`);
  for (const q of Object.values(TYPES)) for (const t of Object.values(q)) assert.ok(!/[A-Za-z]/.test(t.base.replace(/\{[^}]*\}/g, '')));
});

test('четыре главы жизни по временам года, по четыре возраста; у каждой эпиграф для его и её жизни', () => {
  assert.equal(CHAPTERS.length * 4, AGES.length);
  assert.deepEqual(CHAPTERS.map((c) => c.title.split('.')[0]), ['Весна', 'Лето', 'Осень', 'Зима']);
  for (const c of CHAPTERS) {
    assert.match(c.title, /^[А-ЯЁ][а-яё]+\. [А-ЯЁ][а-яё]+$/);
    for (const sex of SEXES) {
      const t = c.epigraph[sex];
      // одна короткая строка; эпиграф показывается как есть, поэтому без вариантов {он|она} и латиницы
      assert.ok(t && t.length >= 20 && t.length <= 80 && /[.!]$/.test(t) && !BAD.test(t) && !/[{|}A-Za-z]/.test(t), `${c.title}, ${sex}: ${t}`);
    }
  }
});

test('у каждой сцены есть иллюстрация; локальные картинки лежат в dist/img', async () => {
  const { SCENE_ART, LOCAL, imageFor } = await import('../src/data/images.js');
  const { existsSync } = await import('node:fs');
  for (const sex of SEXES) for (const { ep, sp } of sits(sex)) {
    const key = `${sex}${ep}-${sp}`;
    assert.ok(SCENE_ART[key], key);
    if (SCENE_ART[key] === LOCAL) assert.ok(existsSync(`dist/${imageFor(key).local}`), `нет файла dist/${imageFor(key).local}`);
  }
});

test('1.1: лицо героя есть в каждом возрасте жизни, и у всех картинок есть WebP из srcset', async () => {
  const { ageFor, hasFace, imageFor, chapterArt, COVER_ART, endArt, TYPE_ART, typeArt } = await import('../src/data/images.js');
  const { AGES } = await import('../src/data/life.js');
  const { existsSync } = await import('node:fs');
  const files = (pic) => [pic.local, ...pic.set.split(',').map((c) => c.trim().split(/\s+/)[0])];
  const pics = [COVER_ART, ...[...TYPE_ART].map((k) => typeArt(...k.split('-')))];
  for (const sex of SEXES) {
    for (const a of AGES) { assert.ok(hasFace(sex, a), `нет портрета ${sex} ${a}`); pics.push(ageFor(sex, a)); }
    for (let n = 1; n <= 4; n++) pics.push(chapterArt(sex, n));
    pics.push(endArt(sex));
    for (const { ep, sp } of sits(sex)) pics.push(imageFor(`${sex}${ep}-${sp}`));
  }
  for (const pic of pics) for (const f of files(pic)) assert.ok(existsSync(`dist/${f}`), `нет файла dist/${f}`);
});

test('1.1: у каждой картины типа есть миниатюра для стола «Шестнадцать жизней», и все файлы из typeThumb лежат в dist', async () => {
  const { TYPE_ART, typeThumb } = await import('../src/data/images.js');
  const { QUAD_ORDER, ROLE_ORDER } = await import('../src/data/types.js');
  const { existsSync } = await import('node:fs');
  for (const q of QUAD_ORDER) for (const r of ROLE_ORDER) assert.ok(TYPE_ART.has(`${q}-${r}`), `нет картины типа ${q}-${r}`);
  for (const k of TYPE_ART) {
    assert.ok(existsSync(`dist/img/sm/type-${k}.webp`), `нет миниатюры dist/img/sm/type-${k}.webp`);
    const pic = typeThumb(...k.split('-'));
    const files = [pic.local, ...pic.set.split(',').map((c) => c.trim().split(/\s+/)[0])];
    assert.ok(files.includes(`img/sm/type-${k}.webp`), `миниатюры нет в srcset ${k}`);
    for (const f of files) assert.ok(existsSync(`dist/${f}`), `нет файла dist/${f}`);
  }
});

test('у каждой сцены свой промпт иллюстрации на английском, без кириллицы', () => {
  for (const sex of SEXES) for (const { ep, sp, s } of sits(sex)) assert.ok(/^[\x20-\x7e]+$/.test(s.img) && s.img.length > 60, `${sex}${ep}-${sp}`);
});

test('в исходниках нет слов, смешивающих кириллицу и латиницу', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const files = ['src/ui/template.html', ...['src/core', 'src/ui', 'src/data'].flatMap((d) => readdirSync(d).map((f) => `${d}/${f}`))];
  for (const f of files) {
    const src = readFileSync(f, 'utf8').replace(/\\n/g, ' ');
    const m = src.match(/[а-яёА-ЯЁ][A-Za-z]|[A-Za-z][а-яёА-ЯЁ]/);
    assert.ok(!m, `${f}: «${m && src.slice(Math.max(0, m.index - 15), m.index + 15)}»`);
  }
});

test('шрифт подписей не подменяет кириллицу капителью', async () => {
  const { readFileSync } = await import('node:fs');
  assert.ok(!/Alegreya\+?\s?Sans\s?SC/.test(readFileSync('src/ui/template.html', 'utf8')));
});

test('1.1: портреты людей жизни — только для людей из people.js, и все файлы на месте', async () => {
  const { PEOPLE_ART, personArt } = await import('../src/data/images.js');
  const { PEOPLE } = await import('../src/data/people.js');
  const { existsSync } = await import('node:fs');
  for (const id of PEOPLE_ART) {
    const [sex, key] = id.split('-');
    assert.ok(PEOPLE[sex] && PEOPLE[sex].some((p) => p.key === key), `нет человека ${id}`);
    const pic = personArt(sex, key);
    for (const f of [pic.local, ...pic.set.split(',').map((c) => c.trim().split(/\s+/)[0])]) assert.ok(existsSync(`dist/${f}`), `нет файла dist/${f}`);
  }
});
