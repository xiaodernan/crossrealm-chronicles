/**
 * UI 走查（`npm run walkthrough:ui`）—— 手机 / 平板视口下每个可见表面的**真布局**，
 * 不是 JS 逻辑，而是"这行字到底被切了没有"。
 *
 * ## 为什么这件事存在
 *
 * 2026-11-07 一轮走查连抓两起真浏览器里才会炸的 bug，单测一个都没拦住：
 *   ① `#help-close` 越出屏幕右沿 132px（en 大档）—— `.panel-box button { width:100% }`
 *      是为菜单项满幅设计的，说明书横向 space-between 的头部被迫吃下整行宽；
 *   ② 说明书 / HUD 顶栏芯片越界（en + 大档界面文字）、quest-panel 被顶栏第二行压住。
 * 两起缺陷的共同点：**全部发生在真的 layout 计算里**，jsdom/假 DOM 一个量都量不出来。
 * 走查就是让浏览器回答这个问题。
 *
 * ## 它量什么（每个组合 = 视口 × 语言 × 界面文字档）
 *
 *   ① 页面级横向溢出：`document.documentElement.scrollWidth > innerWidth`；
 *   ② 可见元素自己的 `getBoundingClientRect` 越出视口左/右沿（x 轴；页内量尺挑
 *      最坏 8 个交出来，按宽度排序）—— `.boss-beacon-label` 是 3D 世界投影的
 *      CSS2D 标签，离屏是常态，不算 UI 溢出；
 *   ③ y 轴挤叠：HUD 顶栏换行后，stats 第二行的底压进 `.quest-panel` 的顶。
 *
 * 十三个表面：开始界面 / HUD / 暂停菜单 / 设置面板 / 营火升级面板 / 日志抽屉 /
 * 世界地图 / 说明书 / 快速旅行 / 提示 toast / 升级面板三个页签（装备 / 武器技能 / 剧情技能）。
 * 视口三档：360×640（窄屏沿）/ 390×844（手机竖屏）/ 768×1024（平板）；
 * 语言 × 文字档按 zh medium / zh large / en large（en 大档是最长的文本）。
 *
 * ## 口径
 *
 * vite 的口当下空闲的取（`freePort` 同款）；CDP 口 `--remote-debugging-port=0` 由
 * Chrome 自己挑，再从自己的 stderr 读回来（"口是从我 spawn 的那个进程亲口报的"）。
 * 收尾 `taskkill /T /F` 把自己的树连根拔掉——Windows 上 `kill()` 只终止一个 PID。
 * 判据（越线）住在 `harness-readings.mjs` 的 `走查越线`；本文件只放**执行**，
 * 所以判据能被单测毫秒级跑正反两面（tests/ui-walkthrough.test.js）。
 *
 * ## 退出码
 *
 * 0 = 全绿；1 = 判据红（越线表里有条目）；2 = 环境问题（口占用 / Chrome 找不到 / boot 不起来）。
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { 开通道 } from './cdp-channel.mjs';
import { 走查越线, 重载线索, 原话尾巴 } from './harness-readings.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CDP_SPEC = 0;

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

async function waitForHttp(url, tries = 80) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch { /* 还没起来 */ }
    await sleep(500);
  }
  return false;
}

// vite 的口当下空闲的取；CDP 的口不取，等 Chrome 自己报（见 cdp-channel 与 e2e-clear 的同款纪律）
const VITE_PORT = await freePort();

/** dev server 自己说的话（stdout + stderr 都收）—— 红的时候要带上它的原话尾巴 */
const dev输出 = [];
const vite话 = () => {
  const 全文 = dev输出.join('');
  const 行 = 重载线索(全文);
  if (行.length) return 行.join('\n - ');
  const 尾 = 原话尾巴(全文);
  return 尾.length
    ? `判据没收到带 [vite] 的行 —— 别读成"vite 没说话"，它最后说的 ${尾.length} 行：\n - ${尾.join('\n - ')}`
    : '(dev server 一个字都没输出 —— 这一轮的重载不是它发的)';
};

const viteBin = join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
const vite = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'],
  { stdio: ['ignore', 'pipe', 'pipe'], cwd: process.cwd() });
vite.stdout.on('data', (b) => dev输出.push(String(b)));
vite.stderr.on('data', (b) => dev输出.push(String(b)));

const chromePath = findChrome();
if (!chromePath) {
  console.error('walkthrough: 找不到 Chrome（可用 CHROME 环境变量指定路径）');
  spawnSync('taskkill', ['/PID', String(vite.pid), '/T', '/F'], { stdio: 'ignore' });
  process.exit(2);
}
const profileDir = join(tmpdir(), `ui-walkthrough-${Date.now()}`);
const 浏览器输出 = [];
const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${CDP_SPEC}`,
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
  拔树(vite);
  try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* 留着也无害 */ }
};
process.on('exit', cleanup);

async function 读CDP口(等待毫秒 = 25000) {
  const 截止 = Date.now() + 等待毫秒;
  for (;;) {
    const 全文 = 浏览器输出.join('');
    const m = 全文.match(/DevTools listening on ws:\/\/[^\s]+:(\d+)\/[^\s]+/);
    if (m) return Number(m[1]);
    if (Date.now() >= 截止) {
      throw new Error(`Chrome ${Math.round(等待毫秒 / 1000)} 秒内没报出 DevTools 口（--remote-debugging-port=${CDP_SPEC}）。\n它自己的话：\n${全文.slice(0, 1200) || '(空)'}`);
    }
    await sleep(250);
  }
}

const 通道 = { 执行上下文: 0, 加载完成: 0 };
const 组合 = [];
let 环境错 = null;
try {
  if (!await waitForHttp(`http://127.0.0.1:${VITE_PORT}/`)) {
    环境错 = `dev 口 40 秒内没起来。vite 的话：\n - ${vite话()}`;
    throw new Error(环境错);
  }
  const cdpPort = await 读CDP口();
  const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const { send, evalJs, 异常 } = 开通道({ ws, 名义: 'ui-walkthrough', 通道, 等待页面Promise: true });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${VITE_PORT}/` });

  // 连到的必须是本进程的 vite 页（口是我自己挑的，页地址必须落在它上面）
  const 页地址 = await evalJs('location.href');
  if (!String(页地址).startsWith(`http://127.0.0.1:${VITE_PORT}/`)) {
    throw new Error(`连到的页不对：${页地址}`);
  }

  const 开机截止 = Date.now() + 120000;
  for (;;) {
    const ok = await evalJs('!!window.__game && !!window.__game.enemyManager');
    if (ok) break;
    if (Date.now() > 开机截止) {
      环境错 = `window.__game 120 秒内没出现（这一轮是 boot 不起来，不是布局问题）。\n谁动的：\n - ${vite话()}`;
      throw new Error(环境错);
    }
    await sleep(500);
  }

  // 页内量尺：x 轴越界扫描 + 页面 scrollWidth（hidden 子树的零尺寸元素天然跳过；
  // boss-beacon-label 是 3D 世界投影的 CSS2D 标签，离屏是常态，不算 UI 溢出）
  const 量尺 = `(() => {
    const vw = window.innerWidth;
    const offenders = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest?.('.boss-beacon-label')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > vw + 0.5 || r.left < -0.5) {
        offenders.push({
          tag: el.tagName, id: el.id || '', cls: String(el.className || '').slice(0, 60),
          right: +r.right.toFixed(1), left: +r.left.toFixed(1), w: +r.width.toFixed(1),
          text: (el.textContent ?? '').trim().replace(/\\s+/g, ' ').slice(0, 48),
        });
      }
    }
    offenders.sort((a, b) => (b.right - b.left) - (a.right - a.left));
    return {
      vw,
      scrollWidth: document.documentElement.scrollWidth,
      pageOverflow: document.documentElement.scrollWidth > vw,
      offenders: offenders.slice(0, 8),
    };
  })()`;

  // 页内量尺：y 轴挤叠（hud-stats 第二行与 quest-panel 的间距）
  const 量尺Y = `(() => {
    const a = document.getElementById('hud-stats')?.getBoundingClientRect();
    const b = document.querySelector('.quest-panel')?.getBoundingClientRect();
    return {
      hudStatsBottom: a ? +a.bottom.toFixed(1) : null,
      questPanelTop: b ? +b.top.toFixed(1) : null,
      overlap: a && b ? +Math.max(0, a.bottom - b.top).toFixed(1) : null,
    };
  })()`;

  // 十三个表面（真点击 tab 按钮切区块、真走 applyToGame 切档）
  const steps = (lang, scale) => [
    ['开始界面', `(() => ${量尺})()`],
    ['HUD', `(() => { document.getElementById('start-btn').click(); return new Promise(r => setTimeout(() => r(${量尺}), 150)); })()`],
    ['暂停菜单', `(() => { const g = window.__game; g.pauseMenu.show(); const m = ${量尺}; g.pauseMenu.hide(); return m; })()`],
    ['设置面板', `(() => { const g = window.__game; g.settingsPanel.show(); const m = ${量尺}; g.settingsPanel.hide(); return m; })()`],
    ['营火升级面板', `(() => { const g = window.__game; g.upgrade.show('营火'); const m = ${量尺}; g.upgrade.hide(); return m; })()`],
    ['日志抽屉', `(() => { const g = window.__game; g.hud.setJournal(true); const m = ${量尺}; g.hud.setJournal(false); return m; })()`],
    ['世界地图', `(() => { const g = window.__game; g.worldMapPanel.toggle(); const m = ${量尺}; g.worldMapPanel.hide(); return m; })()`],
    ['说明书', `(() => { const g = window.__game; g.helpManual.toggle(); const m = ${量尺}; g.helpManual.hide(); return m; })()`],
    ['快速旅行', `(() => { const g = window.__game; g.fastTravelPanel.show(null); const m = ${量尺}; g.fastTravelPanel.hide(); return m; })()`],
    // 故意塞一条长英文（装备名组合出的最坏尺寸）
    ['提示toast', `(() => { const g = window.__game; g.dialog.toast('Picked up Aethelwulf Fulminating Decree of the Crimson Sovereign — refine +2', 60000); const m = ${量尺}; return m; })()`],
    ['升级页-装备页签', `(() => { const g = window.__game; g.upgrade.show('营火'); document.getElementById('tab-gear').click(); const m = ${量尺}; g.upgrade.hide(); return m; })()`],
    ['升级页-武器技能页签', `(() => { const g = window.__game; g.upgrade.show('营火'); document.getElementById('tab-skills').click(); const m = ${量尺}; g.upgrade.hide(); return m; })()`],
    ['升级页-剧情技能页签', `(() => { const g = window.__game; g.upgrade.show('营火'); document.getElementById('tab-lore').click(); const m = ${量尺}; g.upgrade.hide(); return m; })()`],
  ];

  // 三档视口：窄屏沿 / 手机竖屏 / 平板（en 大档为最长文本档）
  const rounds = [
    [{ w: 360, h: 640 }, [['zh', 'medium'], ['zh', 'large'], ['en', 'large']]],
    [{ w: 390, h: 844 }, [['zh', 'medium'], ['zh', 'large'], ['en', 'large']]],
    [{ w: 768, h: 1024 }, [['en', 'large']]],
  ];
  for (const [viewport, 组合组] of rounds) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: viewport.w, height: viewport.h, deviceScaleFactor: 1, mobile: false,
    });
    await sleep(250);
    for (const [lang, scale] of 组合组) {
      // 设置语言与文字档（走 applyToGame，不是只改 CSS 变量）
      await evalJs(`(() => {
        const g = window.__game;
        g.settings.set('language', ${JSON.stringify(lang)});
        g.settings.set('uiTextScale', ${JSON.stringify(scale)});
        g.settings.applyToGame(g);
        return true;
      })()`);
      await sleep(120);
      for (const [label, expr] of steps(lang, scale)) {
        const r = await evalJs(expr);
        const 记号 = `${viewport.w}x${viewport.h} lang=${lang} scale=${scale} ${label}`;
        const bad = Array.isArray(r?.offenders) ? r.offenders.length : 0;
        console.log(`${bad === 0 && r?.pageOverflow !== true ? '✔' : '✘'} ${记号} | 页溢出=${r?.pageOverflow === true} 越界元素=${bad}`);
        组合.push({
          label, viewport: `${viewport.w}x${viewport.h}`, lang, scale,
          页溢出: r?.pageOverflow === true,
          越界: Array.isArray(r?.offenders) ? r.offenders : [],
        });
      }
      // y 轴挤叠（组合级一格，进报告交 走查越线 判）
      const y = await evalJs(量尺Y);
      const 挤 = Number(y?.overlap) > 0;
      console.log(`    [hud挤叠] ${viewport.w}x${viewport.h} lang=${lang} scale=${scale} | hud-stats底=${y?.hudStatsBottom} quest-panel顶=${y?.questPanelTop} overlap=${y?.overlap}${挤 ? ' ← 摞在一起了' : ''}`);
      组合.push({
        label: 'hud挤叠（组合级）', viewport: `${viewport.w}x${viewport.h}`, lang, scale,
        hud挤叠: y && typeof y === 'object' ? { hudStatsBottom: y.hudStatsBottom ?? null, questPanelTop: y.questPanelTop ?? null, overlap: y.overlap ?? null } : null,
      });
    }
  }
  ws.close();
} catch (e) {
  环境错 = 环境错 ?? e?.message ?? String(e);
  console.error('walkthrough 失败：', 环境错);
} finally {
  cleanup();
}

// 先判环境错（没量成），再拿已收集的那些格交判据 —— 顺序反过来会把"boot 不起来"读成"布局没量"，
// 而且 fail-closed 那条红的措辞听起来像判据在红，实际这一轮根本没到量。
if (环境错) process.exit(2);
const 越线 = 走查越线({ 组合 });
if (越线.length) {
  console.error('walkthrough 越线：\n - ' + 越线.join('\n - '));
  process.exit(1);
}
console.log(`walkthrough: 全绿（${组合.length} 格未越线）`);
process.exit(0);
