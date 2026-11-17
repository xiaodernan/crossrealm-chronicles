/**
 * W-Z285 真启动探针 —— 手动最小复核。
 * 起 vite dev（与 simulate-players 同款路径）→ headless Chrome → 轮询 window.__game，90s 上限。
 * 打印 bootMs、__game/enemyManager/scene 检查、任何页面异常。
 */
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const marks = [];
const mark = (label) => { marks.push([Date.now() - t0, label]); console.log(`[probe +${Date.now() - t0}ms] ${label}`); };

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const VITE_PORT = 5519;
const profileDir = join(tmpdir(), `crossrealm-probe-${Date.now()}`);
const chromePath = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const vite = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const viteLog = [];
vite.stdout.on('data', (b) => viteLog.push(String(b)));
vite.stderr.on('data', (b) => viteLog.push(String(b)));
let viteExited = false;
vite.on('exit', () => { viteExited = true; });

let chrome = null;
let failed = null;
try {
  mark('probe start · vite spawned');
  let ready = false;
  for (let i = 0; i < 240; i += 1) { // 2 min
    try { const r = await fetch(`http://127.0.0.1:${VITE_PORT}/`); if (r.ok) { ready = true; break; } } catch {}
    if (viteExited) { failed = `vite exited early; tail: ${viteLog.join('').slice(-1500)}`; break; }
    await sleep(500);
  }
  if (!ready) throw new Error(failed ?? 'vite 120s 内没起来');
  mark('vite ready');

  chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=0',
    '--user-data-dir=' + profileDir,
    '--window-size=1440,800',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  const chromeLog = [];
  chrome.stdout.on('data', (b) => chromeLog.push(String(b)));
  chrome.stderr.on('data', (b) => chromeLog.push(String(b)));

  let cdpPort = null;
  for (let t = Date.now() + 20000; Date.now() < t;) {
    const m = chromeLog.join('').match(/DevTools listening on ws:\/\/[^\s]+:(\d+)/);
    if (m) { cdpPort = Number(m[1]); break; }
    await sleep(200);
  }
  if (!cdpPort) throw new Error('chrome CDP 口没起来');
  mark(`chrome ready on ${cdpPort}`);

  const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
  const page = targets.find((x) => x.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const send = (method, params) => new Promise((res, rej) => {
    ws.send(JSON.stringify({ id: send._id = (send._id ?? 0) + 1, method, params }));
    send._wait.set(send._id, { res, rej });
  });
  send._wait = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && send._wait.has(m.id)) {
      const p = send._wait.get(m.id);
      send._wait.delete(m.id);
      if (m.error) p.rej(new Error(m.error.message)); else p.res(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') {
      const desc = m.params?.exceptionDetails?.exception?.description ?? m.params?.exceptionDetails?.text;
      console.log(`[probe] page exception: ${desc}`);
    }
  });
  await send('Runtime.enable', {});
  await send('Page.enable', {});
  const navStart = Date.now();
  await send('Page.navigate', { url: `http://127.0.0.1:${VITE_PORT}/` });
  mark('navigated');

  const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }))?.result?.value;

  let bootMs = null;
  for (let t = Date.now() + 90000; ; ) {
    const ok = await evalJs('!!window.__game && !!window.__game.enemyManager').catch(() => false);
    if (ok) { bootMs = Date.now() - navStart; break; }
    if (Date.now() > t) break;
    await sleep(250);
  }
  mark(bootMs !== null ? `BOOT OK in ${bootMs}ms` : 'BOOT TIMEOUT');
  if (bootMs !== null) {
    console.log('title:', await evalJs('document.title'));
    console.log('fps-ish (rAF frames in 2s):', await evalJs('new Promise((r) => { let n = 0; const t1 = performance.now(); const tick = () => { n += 1; if (performance.now() - t1 < 2000) requestAnimationFrame(tick); else r(n / 2); }; requestAnimationFrame(tick); })'));
    console.log('start-btn present:', await evalJs("!!document.getElementById('start-btn')"));
  }

  ws.close();
  mark('done');
} catch (e) {
  console.error('PROBE FAIL:', e.message);
  failed = failed ?? e.message;
  try { chrome?.kill(); } catch {}
  try { vite.kill(); } catch {}
  process.exit(1);
} finally {
  try { chrome?.kill(); } catch {}
  try { vite.kill(); } catch {}
  try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
  writeFileSync(join(tmpdir(), 'crossrealm-probe-last.txt'), JSON.stringify(marks, null, 1));
}
process.exit(0);
