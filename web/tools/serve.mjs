// Zero-dependency local server for the dashboard. Serves the REPO ROOT so that
// relative links from web/ to tracks/.../resources/*.pdf work exactly as they
// will on GitHub Pages.
//
// Run from anywhere:  node web/tools/serve.mjs  [port]
// Then open:          http://localhost:8000/web/          (real data)
//                     http://localhost:8000/web/?mock=1   (MOCK data)

import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, normalize, sep } from 'node:path';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const PORT = Number(process.argv[2]) || 8000;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.pdf': 'application/pdf',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/plain; charset=utf-8',
};

createServer((req, res) => {
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (path === '/') { res.writeHead(302, { Location: '/web/' }).end(); return; }
  let file = normalize(join(ROOT, path));
  if (file !== ROOT && !file.startsWith(ROOT + sep)) { res.writeHead(403).end(); return; }
  try {
    if (statSync(file).isDirectory()) file = join(file, 'index.html');
    statSync(file);
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`GhatWatch running at http://localhost:${PORT}/web/   (MOCK preview: http://localhost:${PORT}/web/?mock=1)`);
});
