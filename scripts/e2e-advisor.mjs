/**
 * 星轨顾问端到端验收（W-Y2 / W-Y4）—— 无 GPU 无头 Chrome + 真实 gateway + 真实 wkapi.pro/v1：
 * 静态 dist 上打开 → localStorage seed（online=1 + base_url=28080 网关）→ reload →
 * 等 window.__game → 点 FAB 开面板 → 填输入框 → 送出 → 等 .advisor-msg.is-advisor 非空 → 打印答案。
 *
 * 前置（三条都只在**显式带密钥**的开发机上做，CI 永不跑这里）：
 *   1. npm run build
 *   2. npm run serve:dist                              # 127.0.0.1:3000
 *   3. set -a; . ./.env; set +a                       # 导出 LLM_API_KEY
 *      powershell -ExecutionPolicy Bypass -File server/scripts/e2e-advisor-boot.ps1
 *   4. npm run e2e:advisor
 *
 * 密钥不在这个文件、不在启动脚本、不在日志里；只经进程环境变量进 ai-service。
 * 退出码：0 = 走通；1 = 哪一步断了；2 = 环境问题。
 */
import { spawn, spawnSync } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const STATIC_URL = 'http://127.0.0.1:3000/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const findChrome = () => [process.env.CHROME,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
  .filter(Boolean).find((p) => existsSync(p));

const chromePath = findChrome();
if (!chromePath) { console.error('找不到 Chrome'); process.exit(2); }

const profileDir = join(tmpdir(), `advisor-e2e-${Date.now()}`);
const browserOutput = [];
const chrome = spawn(chromePath, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`,
  '--no-first-run', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding', 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
chrome.stderr.on('data', (b) => browserOutput.push(String(b)));
chrome.stdout.on('data', (b) => browserOutput.push(String(b)));

function 拔树() {
  if (!chrome.pid) return;
  try {
    if (process.platform === 'win32') {
      const r = spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
      if (r.status !== 0) chrome.kill();
    } else chrome.kill();
  } catch { /* 已经没了 */ }
}
process.on('exit', () => { 拔树(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {} });

async function 读CDP口(等待毫秒 = 25000) {
  const 截止 = Date.now() + 等待毫秒;
  for (;;) {
    const 全文 = browserOutput.join('');
    const m = 全文.match(/DevTools listening on ws:\/\/([^\s"']+)/);
    if (m) return { 口: m[1] };
    if (Date.now() >= 截止) throw new Error('Chrome 没报 DevTools 口：\n' + 全文.slice(0, 1200));
    await sleep(250);
  }
}

const CDP = { id: 0, pending: new Map() };
function send(ws, method, params = {}) {
  const id = ++CDP.id;
  return new Promise((resolve, reject) => {
    CDP.pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evalJs(ws, expr, timeoutMs = 30000) {
  const p = send(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  const timer = new Promise((_, rej) => setTimeout(() => rej(new Error('evalJs 超时：' + expr.slice(0, 120))), timeoutMs));
  const res = await Promise.race([p, timer]);
  return res?.result?.value;
}

try {
  const { 口 } = await 读CDP口();
  console.log('Chrome CDP 口:', 口);
  const json = await (await fetch(`http://${口.split('/')[0]}/json/list`)).json();
  const page = json.find((t) => t.type === 'page');
  if (!page) throw new Error('/json/list 里没有 page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && CDP.pending.has(msg.id)) {
      const { resolve, reject } = CDP.pending.get(msg.id);
      CDP.pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  };
  await send(ws, 'Runtime.enable');
  await send(ws, 'Page.enable');

  // 1) seed localStorage via addScriptToEvaluateOnNewDocument, then navigate
  const seed = `localStorage.setItem('crossrealm_online', '1'); localStorage.setItem('crossrealm_online_base_url', 'http://127.0.0.1:28080');`;
  await send(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: seed });
  await send(ws, 'Page.navigate', { url: STATIC_URL });
  console.log('navigated →', STATIC_URL);

  // 2) wait for __game with enemyManager
  let ready = false;
  for (let i = 0; i < 240 && !ready; i += 1) {
    await sleep(500);
    ready = await evalJs(ws, '!!(window.__game && window.__game.enemyManager)', 5000).catch(() => false);
  }
  if (!ready) {
    const probe = await evalJs(ws, "document.readyState + ' | __game=' + typeof window.__game + ' | boot-error=' + (document.querySelector('#boot-error')?.textContent || '(none)') + ' | err=' + (window.__lastError && window.__lastError.message)", 8000);
    console.error('游戏没起来。probe:', probe);
    process.exit(1);
  }
  console.log('__game 就绪');

  // 3) click FAB → panel opens
  const open = await evalJs(ws, `(() => {
    const fab = document.querySelector('#advisor-fab');
    if (!fab) return 'no-fab';
    fab.click();
    return document.querySelector('#advisor-panel')?.classList.contains('hidden') ? 'still-hidden' : 'open';
  })()`, 5000);
  console.log('FAB click →', open);
  if (open !== 'open') process.exit(1);

  // 4) set input + submit form
  const submitted = await evalJs(ws, `(() => {
    const input = document.querySelector('#advisor-input');
    const form = document.querySelector('#advisor-form');
    if (!input || !form) return 'missing';
    input.value = '篝火快灭了，下一步该往哪里走？';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    form.requestSubmit();
    return 'sent';
  })()`, 5000);
  console.log('submit →', submitted);
  if (submitted !== 'sent') process.exit(1);

  // 5) wait for an advisor bubble with non-empty text (LLM round trip)
  let hint = null;
  for (let i = 0; i < 150 && !hint; i += 1) {
    await sleep(1000);
    hint = await evalJs(ws, `(() => {
      const el = [...document.querySelectorAll('.advisor-msg.is-advisor')].pop();
      return el?.textContent?.trim() || null;
    })()`, 8000).catch(() => null);
  }
  if (!hint) { console.error('150 秒内没有顾问回答气泡'); process.exit(1); }
  console.log('ADVISOR ANSWER:', hint);

  // 6) meta line + status
  const meta = await evalJs(ws, `document.querySelector('#advisor-meta')?.textContent || ''`, 5000);
  const status = await evalJs(ws, `document.querySelector('#advisor-status-text')?.textContent || ''`, 5000);
  const count = await evalJs(ws, `document.querySelectorAll('.advisor-msg').length`, 5000);
  console.log('meta =', JSON.stringify(meta), '| status =', JSON.stringify(status), '| bubbles =', count);

  // 7) console errors?
  const err = await evalJs(ws, `localStorage.getItem('crossrealm_online') + ' | base=' + localStorage.getItem('crossrealm_online_base_url')`, 5000);
  console.log('stored:', err);
  console.log('E2E_ADVISOR PASSED');
  process.exit(0);
} catch (e) {
  console.error('E2E_ADVISOR FAILED:', e?.message ?? e);
  process.exit(1);
}
