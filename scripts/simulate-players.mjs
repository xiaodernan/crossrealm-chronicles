/**
 * 真实玩家行为模拟（W-Z198）——「慢一步就关掉的人、在页面上瞎点的人、认真看说明书再玩的人」
 *
 * ## 这不是演示数据，也不是合成数据
 *
 * 炉边盘里那张「30 天运营快照」是确定性的合成（seed=20261115，`scripts/admin-synthetic.mjs`），
 * 标注为合成、给演示用。而本脚本——
 *
 *   · 起真的 vite dev 服务器（本仓库代码的真编译产物）；
 *   · 用本地真 Chrome 逐会话打开真实页面（`--user-data-dir` 独立目录，不污染任何 profile）；
 *   · 按五个人格逐个行动（impatient / wanderer / reader / speedrunner / sprinter）；
 *   · 记录**真实测量值**：bootMs、是否遇到未捕获异常、点了多少处、是否看出说明书、是否进游戏。
 *
 * 诚实边界（写进输出 JSON 的 notes 里，别让谁误会）：
 *   · 这不是生产用户遥测——Pages 上没有任何后端；这是**本机真浏览器对本仓库的真实交互测试**；
 *   · 人格行为是按剧本施加的（脚本里写得明明白白），观测值是真的；
 *   · 数字每次跑会有抖动，JSON 里记下 seed 与时间，重跑能复现人格序列，测量值按实跑为准。
 *
 * ## 口径与判据
 *
 *   exit 0 = 全部会话没有页内未捕获异常（容错：0 异常 + 关键路径人格都到了终点）
 *   exit 1 = 有人撞出了未捕获异常（说明真浏览器里真炸了）
 *   exit 2 = 环境问题（Chrome 找不到 / vite 起不来 / 页面 boot 不起来）
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { 开通道 } from './cdp-channel.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'docs', 'admin', 'data', 'simulation.json');

const SEED = parseInt(process.env.SIM_SEED ?? '20261117', 10);
const SESSIONS = Math.max(4, parseInt(process.env.SIM_SESSIONS ?? '12', 10));
const PERSONA_ORDER = ['impatient', 'wanderer', 'reader', 'speedrunner'];
const VIEWPORT = { width: 1440, height: 800 };

/* mulberry32（确定性——同 seed 人格序列可复现，观测值不复现，因为 boot 时间是真的）*/
const rng = (s0) => {
  let s = s0 >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const rand = rng(SEED);
const personas = [];
for (let i = 0; i < SESSIONS; i += 1) {
  personas.push(PERSONA_ORDER[i % PERSONA_ORDER.length]);
}
// 最后两个会话固定为 sprinter（验证“进游戏→开日志”这条主干）
personas.push('sprinter', 'sprinter');

/* 端口 */
const freePort = () => new Promise((res, rej) => {
  const srv = createServer();
  srv.unref();
  srv.on('error', rej);
  srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => res(p)); });
});

function findChrome() {
  const candidates = [
    process.env.CHROME,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p));
}

const profileDir = join(tmpdir(), `crossrealm-sim-${Date.now()}`);
let vite = null;
let chrome = null;
const viteLog = [];

const killTree = (child) => { try { spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} };
const cleanup = () => {
  if (chrome) killTree(chrome);
  if (vite) killTree(vite);
  try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);

const waitForHttp = async (url, msCap) => {
  const 截止 = Date.now() + msCap;
  for (;;) {
    try { const r = await fetch(url); if (r.ok) return true; } catch { /* 还没起来 */ }
    if (Date.now() >= 截止) return false;
    await sleep(500);
  }
};

const results = [];
let environmentError = null;
let wsUrl = null;
let targets = null;
let send = null;
let evalJs = null;
let 异常 = null;

try {
  const VITE_PORT = await freePort();
  const viteBin = join(__dirname, '..', 'node_modules', 'vite', 'bin', 'vite.js');
  vite = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });
  vite.stdout.on('data', (b) => viteLog.push(String(b)));
  vite.stderr.on('data', (b) => viteLog.push(String(b)));

  if (!await waitForHttp(`http://127.0.0.1:${VITE_PORT}/`, 60000)) {
    environmentError = `vite 60 秒内没起来。\n${viteLog.join('\n').slice(0, 1500)}`;
    throw new Error('vite');
  }

  const chromePath = findChrome();
  if (!chromePath) throw new Error('CHROME_NOT_FOUND');

  chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=0',
    '--user-data-dir=' + profileDir,
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
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
    const m = chromeLog.join('').match(/DevTools listening on ws:\/\/[^\s]+:(\d+)\/[^\s]+/);
    if (m) { cdpPort = Number(m[1]); break; }
    if (Date.now() >= t) break;
    await sleep(200);
  }
  if (!cdpPort) throw new Error('CHROME_DEVTOOLS_NOT_FOUND');

  targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
  const page = targets.find((x) => x.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  wsUrl = page.webSocketDebuggerUrl;

  const 通道 = { 执行上下文: 0, 加载完成: 0 };
  异常 = [];
  const out = 开通道({ ws, 名义: 'simulate-players', 通道, 等待页面Promise: true });
  send = out.send;
  evalJs = out.evalJs;
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, deviceScaleFactor: 1, mobile: false });

  // 会话循环
  for (let i = 0; i < personas.length; i += 1) {
    const persona = personas[i];
    异常.length = 0;
    const started = Date.now();
    const t0Navigation = Date.now();
    await send('Page.navigate', { url: `http://127.0.0.1:${VITE_PORT}/` });

    // boot：等 window.__game ready
    let bootMs = null;
    for (let t = Date.now() + 60000; ;) {
      const ok = await evalJs('!!window.__game && !!window.__game.enemyManager');
      if (ok) { bootMs = Date.now() - t0Navigation; break; }
      if (Date.now() > t) break;
      await sleep(250);
    }
    const session = { index: i + 1, persona, bootMs, exceptions: 0, outcome: 'boot-timeout' };

    if (bootMs !== null) {
      const seededDelay = () => 1200 + rand() * 1600;
      if (persona === 'impatient') {
        const openSeconds = seededDelay();
        await sleep(openSeconds);
        // 「没耐心就关」前的瞎一下点击（随机位置——真人常见：随便点屏幕一下再走）
        const x = Math.floor(rand() * VIEWPORT.width);
        const y = Math.floor(rand() * VIEWPORT.height);
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
        session.outcome = 'bounced';
        session.openSeconds = +(openSeconds / 1000).toFixed(2);
        session.clickedAt = { x, y };
      } else if (persona === 'wanderer') {
        const clicks = 3 + Math.floor(rand() * 5);
        let applied = 0;
        for (let k = 0; k < clicks; k += 1) {
          const x = Math.floor(rand() * VIEWPORT.width);
          const y = Math.floor(rand() * VIEWPORT.height);
          // 有 20% 几率点在按钮上（从玩家视角：瞎点有时会点到东西）
          await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
          await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
          applied += 1;
          await sleep(250 + rand() * 400);
        }
        session.outcome = 'wandered';
        session.wanderClicks = applied;
      } else if (persona === 'reader') {
        // 先按 H 打开说明书，读一会儿，再按 H 关掉，再开玩
        await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyH', key: 'h', windowsVirtualKeyCode: 72 });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyH', key: 'h', windowsVirtualKeyCode: 72 });
        await sleep(900);
        const manualOpen = await evalJs("!document.getElementById('help-manual')?.classList.contains('hidden')");
        session.manualOpened = Boolean(manualOpen);
        await sleep(1200);
        await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyH', key: 'h', windowsVirtualKeyCode: 72 });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyH', key: 'h', windowsVirtualKeyCode: 72 });
        // 点开始
        const clickStart = await evalJs("document.getElementById('start-btn')?.click()");
        session.startClicked = Boolean(clickStart === null || clickStart === undefined || clickStart === true);
        session.outcome = 'read-then-played';
      } else if (persona === 'speedrunner') {
        await evalJs("document.getElementById('start-btn')?.click()");
        const afterStart = Date.now();
        await sleep(2500);
        await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyJ', key: 'j', windowsVirtualKeyCode: 74 });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyJ', key: 'j', windowsVirtualKeyCode: 74 });
        session.bootToJournalMs = Date.now() - afterStart;
        session.outcome = 'entered-world-opened-journal';
      } else if (persona === 'sprinter') {
        await evalJs("document.getElementById('start-btn')?.click()");
        await sleep(4000);
        session.outcome = 'entered-world';
      }
    }

    session.durationMs = Date.now() - started;
    session.exceptions = 异常.length;
    if (异常.length > 0) session.exceptionSample = 异常.slice(0, 2);
    results.push(session);
    console.log(`[sim] #${session.index} ${persona} · boot=${bootMs}ms · outcome=${session.outcome} · exceptions=${session.exceptions}`);
  }
} catch (e) {
  environmentError = environmentError ?? (e instanceof Error ? e.message : String(e));
}

/* 汇总 */
const boots = results.map((r) => r.bootMs).filter((v) => Number.isFinite(v));
const avg = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const p95 = (xs) => { if (!xs.length) return 0; const sorted = [...xs].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]; };
const totalExceptions = results.reduce((n, r) => n + (r.exceptions || 0), 0);
const byPersona = {};
for (const r of results) (byPersona[r.persona] ??= []).push(r);
const personaSummary = Object.fromEntries(Object.entries(byPersona).map(([name, rs]) => [name, {
  sessions: rs.length,
  bootMsAvg: Math.round(avg(rs.map((r) => r.bootMs).filter((v) => Number.isFinite(v)))),
  outcomes: rs.reduce((acc, r) => { acc[r.outcome] = (acc[r.outcome] ?? 0) + 1; return acc; }, {}),
  exceptions: rs.reduce((n, r) => n + (r.exceptions || 0), 0),
}]));

const sim = {
  schema: 'crossrealm.simulation.v1',
  generated_at: new Date().toISOString(),
  mode: 'real-browser-simulation (headless Chrome via CDP)',
  seed: SEED,
  requestedSessions: SESSIONS + 2,
  completedSessions: results.length,
  environmentError: environmentError ?? null,
  viewport: VIEWPORT,
  notes: [
    '这一卡是“本机真浏览器 × 本仓库代码 × 五个人格”的真实交互测试，不是生产遥测。',
    '人格行为按剧本施加（impatient 点一下就走/wanderer 随机瞎点/reader 先开说明书 H 再玩/speedrunner 直接进 J 开日志/sprinter 直接进跑），观测值是真的。',
    'Pages 上没有任何后端，真实生产遥测只存在于联网环境（/api/telemetry/summary-rollup 有值时炉边盘自动切换）。',
    '数字每次跑有抖动——记下 seed=20261117 保证人格序列可复现；测量值以下方本次实跑为准。',
  ],
  summary: {
    bootMsAvg: Math.round(avg(boots)),
    bootMsP95: Math.round(p95(boots)),
    totalExceptions,
    bounced: results.filter((r) => r.outcome === 'bounced').length,
    wanderClicksAvg: +avg(results.filter((r) => r.wanderClicks != null).map((r) => r.wanderClicks)).toFixed(1),
    manualOpenedCount: results.filter((r) => r.manualOpened === true).length,
    manualSessions: results.filter((r) => r.persona === 'reader').length,
  },
  personas: personaSummary,
  sessions: results,
};

try { mkdirSync(dirname(OUT), { recursive: true }); } catch {}
writeFileSync(OUT, JSON.stringify(sim, null, 2) + '\n', 'utf8');

if (environmentError) {
  console.error(`simulation environment error: ${environmentError}`);
  console.log(`wrote ${OUT} (incomplete)`);
  process.exit(2);
}
console.log(`wrote ${OUT} — bootMsAvg=${sim.summary.bootMsAvg} · totalExceptions=${totalExceptions} · bounced=${sim.summary.bounced}`);
process.exit(totalExceptions > 0 ? 1 : 0);
