// Скачивает иллюстрации в dist/img/v5-<ключ сцены>.jpg и портреты по возрастам, чтобы игра работала с картинками без интернета.
// В 1.0 все картинки лежат в репозитории (LOCAL в src/data/images.js), качать нечего; скрипт остался для картинок со ссылкой.
// Запуск: node scripts/fetch-art.mjs (нужен доступ к d8j0ntlcm91z4.cloudfront.net).
// На macOS PNG пережимается в JPEG через sips; в других системах сохраняется как есть под именем .jpg (браузеры его покажут).
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { IMG_BASE, ART_FILES } from '../src/data/images.js';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'img');
mkdirSync(out, { recursive: true });
const items = ART_FILES;
if (!items.length) {
  console.log('Все иллюстрации лежат в репозитории (dist/img/v5-*.jpg), качать нечего.');
  process.exit(0);
}
let ok = 0;
for (const [name, id] of items) {
  const jpg = join(out, `${name}.jpg`);
  if (existsSync(jpg)) { ok++; continue; }
  try {
    const res = await fetch(`${IMG_BASE}${id}.png`);
    if (!res.ok) { console.error(`${name}: HTTP ${res.status}`); continue; }
    const png = join(out, `${name}.png`);
    writeFileSync(png, Buffer.from(await res.arrayBuffer()));
    if (process.platform === 'darwin') {
      execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '72', '-Z', '1024', png, '--out', jpg], { stdio: 'ignore' });
      rmSync(png);
    } else {
      execFileSync('mv', [png, jpg]);
    }
    ok++;
  } catch (e) {
    console.error(`${name}: ${e.cause?.code || e.message}`);
  }
}
console.log(`dist/img: ${ok} из ${items.length} иллюстраций`);
