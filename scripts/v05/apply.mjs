// Одноразовый инструмент v0.5: применяет правки сюжета (patch-*.mjs) к данным и пересобирает файлы life-*.js.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILES = { M: ['m1', 'm2', 'm3', 'm4'], F: ['f1', 'f2', 'f3', 'f4'] };

const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const val = (v) => (typeof v === 'string' ? q(v) : String(v));
const obj = (o) => `{ ${Object.entries(o).map(([k, v]) => `${/^[a-zA-Z_]\w*$/.test(k) ? k : q(k)}: ${val(v)}`).join(', ')} }`;

function serAction(a, ind) {
  const head = `${ind}{ l: ${a.l}, t: ${q(a.t)}, c: ${q(a.c)},`;
  const lines = [head, `${ind}  n: ${q(a.n)},`];
  let tail = `${ind}  e: ${q(a.e)}, s: ${obj(a.s || {})}`;
  if (a.alt && a.alt.length) {
    tail += ',';
    lines.push(tail);
    const alts = a.alt.map((v) => {
      const parts = [`if: ${q(v.if)}`];
      for (const k of ['t', 'c', 'n', 'e']) if (v[k] !== undefined) parts.push(`${k}: ${q(v[k])}`);
      if (v.s !== undefined) parts.push(`s: ${obj(v.s)}`);
      return `${ind}    { ${parts.join(', ')} },`;
    });
    lines.push(`${ind}  alt: [`, ...alts, `${ind}  ] },`);
  } else {
    lines.push(`${tail} },`);
  }
  return lines.join('\n');
}

function serScene(sp, s) {
  const out = [`    ${sp}: {`, `      title: ${q(s.title)},`];
  if (Array.isArray(s.hook)) {
    out.push('      hook: [');
    for (const h of s.hook) out.push(Array.isArray(h) ? `        [${q(h[0])}, ${q(h[1])}],` : `        ${q(h)},`);
    out.push('      ],');
  } else if (s.hook) out.push(`      hook: ${q(s.hook)},`);
  out.push(`      img: ${q(s.img)},`, '      p: [');
  for (const p of s.p) out.push(Array.isArray(p) ? `        [${q(p[0])}, ${q(p[1])}],` : `        ${q(p)},`);
  out.push('      ],', '      a: [');
  for (const a of s.a) out.push(serAction(a, '        '));
  out.push('      ],', '    },');
  return out.join('\n');
}

function serFile(name, eps, header) {
  const out = [header.trimEnd(), '', `export const ${name.toUpperCase()} = [`];
  eps.forEach((ep, i) => {
    out.push(`  { n: ${ep.n}, age: ${ep.age}, s: {`);
    for (const sp of Object.keys(ep.s).map(Number).sort()) out.push(serScene(sp, ep.s[sp]));
    out.push(`  } },${i < eps.length - 1 ? '\n' : ''}`);
  });
  out.push('];', '');
  return out.join('\n');
}

const textOf = (piece) => (Array.isArray(piece) ? piece[1] : piece);

/** Замена подстроки во всех текстах сцены; подстрока обязана найтись. */
function replaceEverywhere(key, s, from, to) {
  let hits = 0;
  const r = (t) => { if (typeof t !== 'string' || !t.includes(from)) return t; hits++; return t.split(from).join(to); };
  s.title = r(s.title);
  s.hook = Array.isArray(s.hook) ? s.hook.map((h) => (Array.isArray(h) ? [h[0], r(h[1])] : r(h))) : r(s.hook);
  s.p = s.p.map((p) => (Array.isArray(p) ? [p[0], r(p[1])] : r(p)));
  for (const a of s.a) {
    for (const f of ['t', 'c', 'n', 'e']) a[f] = r(a[f]);
    for (const v of a.alt || []) for (const f of ['t', 'c', 'n', 'e']) if (v[f] !== undefined) v[f] = r(v[f]);
  }
  if (!hits) throw new Error(`${key}: не найдено «${from}»`);
}

/** Абзац, в тексте которого есть подстрока; ровно один. */
function findPara(key, s, match) {
  const idx = s.p.map((p, i) => (textOf(p).includes(match) ? i : -1)).filter((i) => i >= 0);
  if (idx.length !== 1) throw new Error(`${key}: абзац «${match}» найден ${idx.length} раз`);
  return idx[0];
}

function applyPatch(sex, eps, patch) {
  const used = new Set();
  for (const ep of eps) for (const [sp, s] of Object.entries(ep.s)) {
    const key = `${sex}${ep.n}-${sp}`;
    const P = patch[key];
    if (!P) continue;
    used.add(key);
    if (P.title) s.title = P.title;
    if (P.hook) s.hook = P.hook;
    if (P.img) s.img = P.img;
    if (P.p) s.p = P.p;
    // rep: [[из, в]] — замена во всех текстах сцены.
    for (const [from, to] of P.rep || []) replaceEverywhere(key, s, from, to);
    // pr: [[подстрока абзаца, ...новые абзацы]] — заменить один абзац несколькими.
    for (const [match, ...pieces] of P.pr || []) s.p.splice(findPara(key, s, match), 1, ...pieces);
    // pa: [[подстрока абзаца или '^' или '$', ...новые абзацы]] — вставить после абзаца, в начало или в конец.
    for (const [match, ...pieces] of P.pa || []) {
      const at = match === '^' ? 0 : match === '$' ? s.p.length : findPara(key, s, match) + 1;
      s.p.splice(at, 0, ...pieces);
    }
    for (const a of s.a) {
      for (const f of ['t', 'c', 'n', 'e']) if (P[f] && P[f][a.l] !== undefined) a[f] = P[f][a.l];
      if (P.s && P.s[a.l]) a.s = P.s[a.l];
      if (P.alt && P.alt[a.l] !== undefined) a.alt = P.alt[a.l];
      // altAdd: варианты, которые проверяются раньше уже существующих.
      if (P.altAdd && P.altAdd[a.l]) a.alt = [...P.altAdd[a.l], ...(a.alt || [])];
      if (P.sAdd && P.sAdd[a.l]) a.s = { ...a.s, ...P.sAdd[a.l] };
    }
    for (const f of ['t', 'c', 'n', 'e', 's', 'alt', 'altAdd', 'sAdd']) for (const l of Object.keys(P[f] || {})) {
      if (!s.a.find((a) => String(a.l) === l)) throw new Error(`${key}: нет поступка на черте ${l} (${f})`);
    }
  }
  const missing = Object.keys(patch).filter((k) => k.startsWith(sex) && !used.has(k));
  if (missing.length) throw new Error(`лишние ключи: ${missing}`);
}

const which = process.argv.slice(2);
for (const sex of ['M', 'F']) {
  const patches = which.filter((p) => p.includes(`patch-${sex.toLowerCase()}`));
  if (!patches.length) continue;
  const parts = [];
  for (const f of FILES[sex]) {
    const path = join(root, `src/data/life-${f}.js`);
    const src = readFileSync(path, 'utf8');
    const header = src.slice(0, src.indexOf('export const'));
    const mod = await import(pathToFileURL(path).href + `?t=${Date.now()}`);
    parts.push({ f, path, header, eps: structuredClone(mod[f.toUpperCase()]) });
  }
  const all = parts.flatMap((p) => p.eps);
  for (const p of patches) {
    const mod = await import(pathToFileURL(resolve(p)).href);
    applyPatch(sex, all, mod.PATCH);
  }
  for (const part of parts) writeFileSync(part.path, serFile(part.f, part.eps, part.header));
  console.log(sex, 'обновлено:', parts.map((p) => p.f).join(', '));
}
