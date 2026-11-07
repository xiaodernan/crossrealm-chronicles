/**
 * 生产构建开机冒烟（`npm run preview:boot`）—— dist/ 真的能在浏览器开机吗？
 *
 * ## 为什么这件事存在
 *
 * 2026-11-07 一轮真浏览器读数发现：dev 全绿、所有门禁全绿、e2e 全绿，而
 * **dist/ 在浏览器里直接白屏**——`#loading` 永远转圈、`#boot-error` 空、
 * `start-screen` 不出。根因（`ce26dd4`）：`questFactsWritten()` 的源码正则
 * `stats.<格>` 在生产构建里被 esbuild minify 吃掉（参数改名 `stats` → `s`），
 * 校验在 import 期抛错，整个模块图求值失败。
 *
 * 教训：**dev 通过不代表 dist/ 能开机**——构建产物是另一条代码（打包 / 拆 chunk /
 * minify / 摇树），`fn.toString()` 类的源码扫描在产物里是另一份文本。
 * 这条门禁就是让"产物在浏览器里真能启动并真进得了游戏"这件事可以被随时问。
 *
 * ## 它量什么
 *
 *   ① 开机：loading 必须在 60 秒内藏起、start-screen 必须可见、boot-error 必须为空；
 *   ② 真进游戏：真点 `#start-btn` 后，`#start-screen` 必须隐藏、`#hud` 必须有子节点、
 *      `<canvas>` 必须存在、页面无横向溢出；
 *   ③ `Runtime.exceptionThrown` 必须 0 条（构建产物里任何一条未捕获异常都算红）。
 *
 * ## 口径
 *
 * 口是当下空闲的取（`freePort` 同款）；CDP 口 `--remote-debugging-port=0` 由 Chrome
 * 自己挑，从自己的 stderr 读回来。收尾 `taskkill /T /F` 拔整棵树。
 * 判据（逐格判）留在本文件里——这不是布局门禁，`walkthrough:ui` 管那个；
 * 本文件只问"能不能开机 + 能不能进游戏 + 有没有抛异常"，三件事，写死唯一判据。
 *
 * ## 退出码
 *
 * 0 = 生产开机全绿；1 = 有问题（开机报错 / 进不去 / 有异常）；2 = 环境问题。
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { 开通道 } from './cdp-channel.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const freePort = () => new Promise((res, rej) => {
  const srv = createServer();
  srv.unref();
  srv.on('error', rej);
  srv.listen(0, '127.0.0.1', () => {
    const { port } = srv.address();
    srv.close(() => res(port));
  });
});

function findChrome() {
  const candidates = [
    process.env.CHROME,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p));
}

/** vite preview 起静态口（只读 dist/）——它不碰 dev server，也不碰 src/ */
const PREVIEW_PORT = await freePort();
const viteBin = join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
const preview = spawn(process.execPath, [viteBin, 'preview', '--host', '127.0.0.1', '--port', String(PREVIEW_PORT), '--strictPort'],
  { stdio: ['ignore', 'pipe', 'pipe'], cwd: process.cwd() });
preview.stdout.on('data', (b) => process.stdout.write(`[preview] ${String(b)}`));
preview.stderr.on('data', (b) => process.stderr.write(`[preview err] ${String(b)}`));

const chromePath = findChrome();
if (!chromePath) {
  console.error('preview-boot: 找不到 Chrome（可用 CHROME 环境变量指定路径）');
  spawnSync('taskkill', ['/PID', String(preview.pid), '/T', '/F'], { stdio: 'ignore' });
  process.exit(2);
}
const profileDir = join(tmpdir(), `preview-boot-${Date.now()}`);
const 浏览器输出 = [];
const chrome = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=0',
  `--user-data-dir=${profileDir}`,
  '--no-first-run',
  '--disable-gpu',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
chrome.stderr.on('data', (b) => 浏览器输出.push(String(b)));
chrome.stdout.on('data', (b) => 浏览器输出.push(String(b)));

function 拔树(子进程) {
  if (!子进程?.pid) return;
  try {
    if (process.platform === 'win32') {
      const r = spawnSync('taskkill', ['/PID', String(子进程.pid), '/T', '/F'], { stdio: 'ignore' });
      if (r.status !== 0) 子进程.kill();
    } else {
      子进程.kill();
    }
  } catch { /* 已退出 */ }
}
const cleanup = () => {
  拔树(chrome);
  拔树(preview);
  try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* 留着也无害 */ }
};
process.on('exit', cleanup);

async function 读CDP口(等待毫秒 = 25000) {
  const 截止 = Date.now() + 等待毫秒;
  for (;;) {
    const 全文 = 浏览器输出.join('');
    const m = 全文.match(/DevTools listening on ws:\/\/[^\s]+:(\d+)\/[^\s]+/);
    if (m) return Number(m[1]);
    if (Date.now() >= 截止) throw new Error(`Chrome 没报出 DevTools 口。它自己的话：\n${全文.slice(0, 1200)}`);
    await sleep(250);
  }
}

const 通道 = { 执行上下文: 0, 加载完成: 0 };
/** 环境错（口占用 / Chrome 不起来 / dev 口没起来）走 exit 2，其余（页内抛错 / 开机没进）走 exit 1 */
class 环境错误 extends Error {}
let evalJsRef = null;
let 异常Ref = [];
let failures = 0;
try {
  const deadline = Date.now() + 30000;
  for (;;) {
    try { const r = await fetch(`http://127.0.0.1:${PREVIEW_PORT}/`); if (r.ok) break; } catch { /* */ }
    if (Date.now() > deadline) throw new 环境错误('preview 口 30 秒内没起来 —— 环境问题，不是游戏坏了');
    await sleep(400);
  }
  const cdpPort = await 读CDP口().catch((e) => { throw new 环境错误(`Chrome 起不来 —— 环境问题：${e?.message ?? e}`); });
  const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const { send, evalJs, 异常 } = 开通道({ ws, 名义: 'preview-boot', 通道, 等待页面Promise: true });
  evalJsRef = evalJs;
  异常Ref = 异常;
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PREVIEW_PORT}/` });

  // 生产构建没有 __game（DEV-only）。就绪信号 = loading 藏起 + start-btn 可见 + boot-error 为空
  const 开机截止 = Date.now() + 60000;
  for (;;) {
    const ok = await evalJs(`(() => {
      const be = document.getElementById('boot-error');
      const beText = (be?.textContent ?? '').trim();
      if (beText) return 'ERROR:' + beText;
      const btn = document.getElementById('start-btn');
      const loading = document.getElementById('loading');
      return btn && loading?.classList.contains('hidden') ? 'OK' : 'WAIT';
    })()`);
    if (String(ok).startsWith('ERROR:')) {
      console.error('开机报错：', String(ok).slice(6));
      failures = 1;
      break;
    }
    if (ok === 'OK') break;
    if (Date.now() > 开机截止) throw new Error('60 秒内没进开始界面');
    await sleep(400);
  }

  if (failures === 0) {
    const before = await evalJs(`(() => ({
      startVisible: !!document.getElementById('start-screen') && getComputedStyle(document.getElementById('start-screen')).display !== 'none',
      bootError: document.getElementById('boot-error')?.textContent ?? '',
      loadingClass: document.getElementById('loading')?.className ?? '',
    }))()`);
    console.log('① 开机态：', JSON.stringify(before));

    // 真点 #start-btn 进游戏
    await evalJs(`(() => { document.getElementById('start-btn')?.click(); return true; })()`);
    await sleep(3000);
    const after = await evalJs(`(() => ({
      startHidden: getComputedStyle(document.getElementById('start-screen')).display === 'none',
      hudChildren: document.getElementById('hud')?.children.length ?? -1,
      canvas: !!document.querySelector('canvas'),
      bodyOverflow: document.body.scrollWidth > window.innerWidth,
    }))()`);
    console.log('② 进入游戏：', JSON.stringify(after));
    console.log('③ 页面异常：', 异常.length, 异常.length ? 异常 : '');

    if (!before.startVisible || before.bootError || before.loadingClass !== 'hidden'
        || !after.startHidden || after.hudChildren <= 0 || after.canvas !== true || after.bodyOverflow
        || 异常.length > 0) {
      failures = 1;
    }
  }
  ws.close();
} catch (e) {
  console.error('preview-boot 失败：', e?.message ?? e);
  try {
    const diag = await evalJsRef?.(`(() => ({
      href: location.href,
      readyState: document.readyState,
      loadingClass: document.getElementById('loading')?.className ?? '(no #loading)',
      startDisplay: getComputedStyle(document.getElementById('start-screen') ?? document.body).display,
      bootError: document.getElementById('boot-error')?.textContent ?? '(none)',
      scriptCount: document.scripts?.length ?? -1,
    }))()`);
    console.error('页内诊断：', JSON.stringify(diag));
  } catch (e2) {
    console.error('页内诊断失败：', String(e2?.message ?? e2));
  }
  console.error('通道异常：', JSON.stringify(异常Ref.slice(-5), null, 1));
  failures = (e instanceof 环境错误) ? 2 : 1;
} finally {
  cleanup();
}

if (failures === 0) console.log('preview-boot: 生产构建开机全绿');
process.exit(failures);
