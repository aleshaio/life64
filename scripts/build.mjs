// Собирает все модули в один самодостаточный HTML: работает офлайн, в том числе из file://.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORDER = ['src/data/patterns.js', 'src/core/hexagram.js', 'src/core/sphere.js',
  'src/data/life-m1.js', 'src/data/life-m2.js', 'src/data/life-m3.js', 'src/data/life-m4.js',
  'src/data/life-f1.js', 'src/data/life-f2.js', 'src/data/life-f3.js', 'src/data/life-f4.js', 'src/data/life.js',
  'src/data/types.js', 'src/data/images.js', 'src/data/people.js', 'src/core/engine.js', 'src/core/save.js', 'src/ui/app.js'];

const strip = (src) => src
  .replace(/^import\s[^;]+;\s*$/gm, '')
  .replace(/^export\s+(const|function|let)\s/gm, '$1 ');

const code = ORDER.map((f) => `// ---- ${f} ----\n${strip(readFileSync(join(root, f), 'utf8'))}`).join('\n');
if (/^\s*(import|export)\s/m.test(code)) throw new Error('остались import/export');
const body = readFileSync(join(root, 'src/ui/template.html'), 'utf8');
const script = `<script>\n"use strict";\n(() => {\n${code}\n})();\n</script>\n`;

mkdirSync(join(root, 'dist'), { recursive: true });
// Для публикации как Artifact: без doctype/head (их добавляет хостинг).
writeFileSync(join(root, 'dist/artifact.html'), body + script);
// Самостоятельная страница.
writeFileSync(join(root, 'dist/index.html'),
  `<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${body}${script}</body>\n</html>\n`);
console.log('dist/index.html и dist/artifact.html собраны,', Math.round((body.length + script.length) / 1024), 'КБ');
