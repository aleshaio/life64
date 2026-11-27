// Простейший статический сервер для dist/: node scripts/serve.mjs [порт]. Отдаёт страницу и картинки из dist/img/.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const port = Number(process.argv[2] || 5173);

createServer(async (req, res) => {
  let path = '/';
  try { path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { /* битый адрес — отдаём страницу */ }
  const rel = normalize(path === '/' ? '/index.html' : path).replace(/^[/\\]+/, '');
  try {
    if (rel.startsWith('..')) throw new Error('outside dist');
    const body = await readFile(join(dist, rel));
    res.writeHead(200, { 'content-type': TYPES[extname(rel).toLowerCase()] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Нет такого файла');
  }
}).listen(port, () => console.log(`Открой http://localhost:${port}/  (отладка: http://localhost:${port}/?debug=1)`));
