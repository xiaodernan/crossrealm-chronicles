/**
 * 性能冒烟门禁（W-D4 切片2）—— `npm run perf`。
 *
 * 内容在膨胀（12 类敌人、7 个位面、三层后处理），而"帧率没垮"这件事此前没有任何
 * 机器在量。这一片把"驱动真游戏、读真帧率"的机器立起来：
 *   起本地的 dev 口 → 无头 Chrome（原生 CDP）→ 等游戏起来 →
 *   ① 枢纽空载 8 秒（主循环 + 环境系统的底价）；
 *   ② 传送到灰白森林中心 8 秒（五名影之战士 + AI 感知 + 分离推力全在跑）。
 * 两站各读平均 fps 与 p95 帧距，外加全程 JS 堆峰值与未捕获异常数。
 *
 * 预算是**软件渲染的无头值**（无 GPU），比玩家机器保守得多 —— 它防的是"垮一个数量级"
 * 的回归，不是"差 5%"的手感漂移。跑批有噪声，连跑两次取好的一次。
 *
 * 用法：`npm run perf`（自己起 dev 口与浏览器，结束自己收）。
 * 退出码非 0 = 越预算 —— 将来接进 CI（W-D4 切片3）时就是红绿的来源。
 */
import { spawn } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PERF_BUDGETS } from './perf-budgets.mjs';

/**
 * 预算表在 `./perf-budgets.mjs` —— **判据与执行分家**（W-D4 切片3 修）。
 *
 * 本文件是"导入即执行"的（顶层就起 vite 与 Chrome）。此前门禁为了拿这张表
 * `import` 了本文件，于是 `npm test` 里真跑了一遍性能冒烟，还多出一条
 * `process.exit unexpectedly called` 的未捕获异常。**本文件不导出任何东西**，
 * 谁想拿判据就去 `perf-budgets.mjs`。
 */

const VITE_PORT = 5321;
const CDP_PORT = 9424;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  const candidates = [
    process.env.CHROME,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p));
}

async function waitForHttp(url, tries = 40) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch { /* 还没起来 */ }
    await sleep(500);
  }
  return false;
}

// 直接用当前 node 调 vite.js：Windows 上 spawn .cmd 要开 shell（引号/quoting 风险），绕开它
const viteBin = join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
const vite = spawn(process.execPath, [viteBin, '--port', String(VITE_PORT), '--strictPort'],
  { stdio: 'ignore', cwd: process.cwd() });

const chromePath = findChrome();
if (!chromePath) {
  console.error('perf-smoke: 找不到 Chrome（可用 CHROME 环境变量指定路径）');
  vite.kill();
  process.exit(2);
}
const profileDir = join(tmpdir(), `perf-smoke-${Date.now()}`);
const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${profileDir}`,
  '--no-first-run',
  '--disable-gpu',
  // 无头页被当后台页时 rAF 会被节流到几乎不跑（实测出现过 18 秒的帧距）——三连禁用
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  'about:blank',
], { stdio: 'ignore' });

const cleanup = () => {
  try { chrome.kill(); } catch { /* 已退出 */ }
  try { vite.kill(); } catch { /* 已退出 */ }
  try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* 留着也无害 */ }
};
process.on('exit', cleanup);

let failures = 0;
try {
  if (!await waitForHttp(`http://127.0.0.1:${VITE_PORT}/`)) throw new Error('dev 口 20 秒内没起来');
  if (!await waitForHttp(`http://127.0.0.1:${CDP_PORT}/json/version`)) throw new Error('Chrome CDP 口没起来');

  const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let msgId = 0;
  const pending = new Map();
  const exceptions = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params?.exceptionDetails?.text ?? '?');
  };
  const send = (method, params = {}) => new Promise((res) => {
    const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params }));
  });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error('页面内抛错: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    return r.result?.result?.value;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${VITE_PORT}/` });

  let ready = false;
  for (let i = 0; i < 60 && !ready; i += 1) {
    await sleep(500);
    ready = await evalJs('!!window.__game && !!window.__game.enemyManager');
  }
  if (!ready) throw new Error('游戏 30 秒内没起来');

  /**
   * 一站读数：手工推帧（真 `game.update()` + 真 `game.render()`），量 CPU 耗时。
   *
   * 不用真实 rAF：无头页的帧由合成器供给，页面不被认为可见时 rAF 会被饿到几乎不跑
   * （实测出现过 18 秒的单帧距），那种读数量的是节流不是游戏。推帧是确定性的：
   * 240 帧 × (update 单独记一次账 + update+render 全帧记一次账)，60 帧一批喂给 CDP 免超时。
   */
  const 站 = async (名字, 表达式) => {
    await evalJs(表达式);
    await sleep(800); // 等传送/场景切换的尖刺过去再开始计时
    const batches = [];
    for (let b = 0; b < 4; b += 1) {
      batches.push(await evalJs(`(() => {
        const 只更新 = [];
        for (let i = 0; i < 60; i += 1) {
          const t0 = performance.now();
          window.__game.update();
          只更新.push(performance.now() - t0);
        }
        return 只更新;
      })()`));
    }
    // 全帧账单独一批：update + render 合起来量（软渲染的 render 是大头，分开两批避免相互干扰）
    const 全帧批 = [];
    for (let b = 0; b < 4; b += 1) {
      全帧批.push(await evalJs(`(() => {
        const 帧耗时 = [];
        for (let i = 0; i < 60; i += 1) {
          const t0 = performance.now();
          window.__game.update();
          window.__game.render();
          帧耗时.push(performance.now() - t0);
        }
        return 帧耗时;
      })()`));
    }
    const 更新 = batches.flat().sort((a, b) => a - b);
    const 全帧 = 全帧批.flat().sort((a, b) => a - b);
    const 取 = (a, q) => a[Math.min(a.length - 1, Math.floor(a.length * q))];
    const 均值 = (a) => a.reduce((s, n) => s + n, 0) / a.length;
    const r = {
      frames: 更新.length,
      updateAvgMs: Math.round(均值(更新) * 100) / 100,
      updateP95Ms: Math.round(取(更新, 0.95) * 100) / 100,
      frameAvgMs: Math.round(均值(全帧) * 10) / 10,
    };
    console.log(`perf-smoke [${名字}] frames=${r.frames} updateAvg=${r.updateAvgMs}ms updateP95=${r.updateP95Ms}ms frameAvg=${r.frameAvgMs}ms`);
    return r;
  };

  const 枢纽 = await 站('枢纽空载', 'window.__game.player.teleport(0, 0, 55)');
  const 森林 = await 站('灰白森林', 'window.__game.player.teleport(-200, 0, 0)');

  const heapMb = await evalJs('performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1');
  console.log(`perf-smoke [堆] usedJSHeap=${heapMb}MB exceptions=${exceptions.length}`);

  const 预算 = PERF_BUDGETS;
  const 越线 = [];
  if (枢纽.updateAvgMs > 预算.updateAvgMs) 越线.push(`枢纽 updateAvg ${枢纽.updateAvgMs}ms > ${预算.updateAvgMs}ms`);
  if (森林.updateAvgMs > 预算.updateAvgMs) 越线.push(`森林 updateAvg ${森林.updateAvgMs}ms > ${预算.updateAvgMs}ms`);
  if (枢纽.updateP95Ms > 预算.updateP95Ms) 越线.push(`枢纽 updateP95 ${枢纽.updateP95Ms}ms > ${预算.updateP95Ms}ms`);
  if (森林.updateP95Ms > 预算.updateP95Ms) 越线.push(`森林 updateP95 ${森林.updateP95Ms}ms > ${预算.updateP95Ms}ms`);
  if (枢纽.frameAvgMs > 预算.frameAvgMs) 越线.push(`枢纽 frameAvg ${枢纽.frameAvgMs}ms > ${预算.frameAvgMs}ms`);
  if (森林.frameAvgMs > 预算.frameAvgMs) 越线.push(`森林 frameAvg ${森林.frameAvgMs}ms > ${预算.frameAvgMs}ms`);
  if (heapMb > 预算.heapMb) 越线.push(`堆 ${heapMb}MB > ${预算.heapMb}MB`);
  if (exceptions.length > 预算.exceptions) 越线.push(`页面异常 ${exceptions.length} 条`);

  if (越线.length) {
    console.error('perf-smoke 越预算：\n - ' + 越线.join('\n - '));
    failures = 1;
  } else {
    console.log('perf-smoke: 全部预算内');
  }
  ws.close();
} catch (err) {
  console.error('perf-smoke 失败：', err?.message ?? err);
  failures = 2;
} finally {
  cleanup();
  setTimeout(() => process.exit(failures), 300);
}
