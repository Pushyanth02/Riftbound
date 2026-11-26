/* Local GitHub Pages simulator: serves out/ under /Riftbound/ exactly like
   the deployed Pages site, so the static export can be smoke-tested before
   pushing. Run: bun scripts/serve-pages.ts [port] */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PORT = Number(process.argv[2] ?? 4173);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'out');
const BASE = '/Riftbound';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
  '.woff2': 'font/woff2',
};

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    let p = decodeURIComponent(url.pathname);
    if (p === BASE || p === BASE + '/') p = BASE + '/index.html';
    if (!p.startsWith(BASE + '/') && p !== '/favicon.ico') {
      return new Response('Not found', { status: 404 });
    }
    let rel = p.startsWith(BASE) ? p.slice(BASE.length) : p;
    if (rel === '') rel = '/index.html';
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT)) return new Response('Forbidden', { status: 403 });
    const f = Bun.file(file);
    if (await f.exists()) {
      const ext = path.extname(file).toLowerCase();
      return new Response(f, { headers: { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': 'no-store' } });
    }
    return new Response('Not found', { status: 404 });
  },
});

console.log(`GitHub Pages simulator: http://localhost:${PORT}${BASE}/ (root: ${ROOT})`);
