/**
 * 开发期静态服务器：把 `npm run build` 的 dist/ 挂到 127.0.0.1:5321。
 * 只服务于无头浏览器 e2e（见 scripts/e2e-advisor.mjs），不是生产部署路径。
 * 路径从脚本自身位置解析，换机器/换盘符不用改这里。
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const server = http.createServer((req, res) => {
  try {
    let p = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(root, path.normalize(p).replace(/^([/\\])+/, ''));
    if (!f.startsWith(root)) { res.writeHead(403); res.end(); return; }
    const buf = fs.readFileSync(f);
    res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(buf);
  } catch {
    res.writeHead(404); res.end('nf');
  }
});
server.listen(5321, '127.0.0.1', () => {
  console.log('STATIC_PORT=5321');
});
