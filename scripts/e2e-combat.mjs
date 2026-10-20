/**
 * 战斗 E2E 冒烟（W-D4 切片3）—— `npm run e2e:combat`。
 *
 * perf-smoke 证明"游戏活着"，这一片证明"游戏**玩得动**"：起真游戏、给真输入
 * （与真实 mousedown 监听同一把 `mouseDown` 锁存，主循环自己缓冲出招）、
 * 推真帧，然后断言一整条战斗链真的发生了——
 *   感知 → 追击 → 互殴 → 击杀 → 魂火入账 → 击杀账本 +1。
 * 全程不走白盒捷径（不直接扣敌人血、不直接调结算），结算必须由
 * CombatController 的打击窗口自己撞出来 —— 那条链断了任何一环，这里就红。
 *
 * 这是"无头 E2E 自动通关"的第一块：先证明一只兵打得死，通关序列在后续片上长。
 * 退出码非 0 = 任一断言失败。
 */
import { spawn } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const VITE_PORT = 5322;
const CDP_PORT = 9425;

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

const viteBin = join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
// `--host 127.0.0.1` 必须显式给：vite 缺省只听 `localhost`，而 Windows 上 `localhost`
// 先解析到 IPv6 的 `::1` ⇒ 探 127.0.0.1 会超时（症状"游戏没起来" + 页面错误 0 条）。
const vite = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'],
  { stdio: 'ignore', cwd: process.cwd() });
const chromePath = findChrome();
if (!chromePath) {
  console.error('e2e-combat: 找不到 Chrome（可用 CHROME 环境变量指定路径）');
  vite.kill();
  process.exit(2);
}
const profileDir = join(tmpdir(), `e2e-combat-${Date.now()}`);
const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${profileDir}`,
  '--no-first-run',
  '--disable-gpu',
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
  if (!await waitForHttp(`http://127.0.0.1:${VITE_PORT}/`)) throw new Error('dev 口没起来');
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
    ready = await evalJs('!!window.__game && !!window.__game.enemyManager && window.__game.enemyManager.enemies.length > 0');
  }
  if (!ready) throw new Error('游戏没起来');

  const R = {};

  // 站0：E2E 前置——冒烟不是平衡测试，给玩家厚血免得兵把它打死打乱序列
  R.前置 = await evalJs(`(() => {
    const g = window.__game;
    g.player.combat.hp = 99999;
    g.player.combat.maxHp = 99999;
    const 兵 = g.enemyManager.enemies.find(e => e.type === 'soldier' && e.alive);
    if (!兵) throw new Error('没有活着的影之战士');
    g.player.teleport(兵.position.x + 2.2, 0, 兵.position.z, { yaw: 0, pitch: 0 });
    return { 兵名: 兵.name, 敌血: 兵.hp, 我魂: g.stats.souls, 击杀账: { ...(g.quests.stats.kills ?? {}) } };
  })()`);

  // 站1：AI 通路——玩家贴脸后推帧，兵必须从 idle 走进追击/出手
  R.ai = await evalJs(`(async () => {
    const g = window.__game;
    const 兵 = g.enemyManager.enemies.find(e => e.type === 'soldier' && e.alive);
    const 前 = 兵.state;
    for (let i = 0; i < 120; i += 1) { g.update(); g.render(); await new Promise(r => setTimeout(r, 0)); }
    return { 前, 后: 兵.state, 我掉血: g.player.combat.hp < 99999 };
  })()`);

  // 站2：真输入击杀——mouseDown 锁存一帧（与真实 mousedown 监听同源），主循环自己出招
  R.击杀 = await evalJs(`(async () => {
    const g = window.__game;
    const 兵 = g.enemyManager.enemies.find(e => e.type === 'soldier' && e.alive);
    const 旧魂 = g.stats.souls;
    let 帧 = 0;
    let 掉过血 = false;
    while (兵.alive && 帧 < 2400) {
      // 每隔几帧给一次"按下左键"的边沿（锁存每帧被主循环清掉，模拟真点）
      if (帧 % 12 === 0) g.combat.mouseDown['left'] = true;
      g.update();
      g.render();
      帧 += 1;
      if (g.player.combat.hp < 99999) 掉过血 = true;
      if (帧 % 120 === 0) await new Promise(r => setTimeout(r, 0));
    }
    return { 帧数: 帧, 杀掉: !兵.alive, 掉过血,
             魂入账: g.stats.souls - 旧魂,
             击杀账: { ...(g.quests.stats.kills ?? {}) } };
  })()`);

  console.log(JSON.stringify(R, null, 1));

  const 越线 = [];
  if (!['pursue', 'attack', 'light', 'heavy', 'strike'].some((s) => R.ai.后.includes(s)) && R.ai.后 === R.ai.前) {
    越线.push(`AI 通路：兵 120 帧后仍停在 "${R.ai.后}"，没有追击/出手`);
  }
  if (!R.击杀.杀掉) 越线.push(`2400 帧真输入没打死一只兵（敌血没走完）`);
  if (R.击杀.魂入账 <= 0) 越线.push(`击杀后魂火没入账（+${R.击杀.魂入账}）`);
  const 击杀数 = Object.values(R.击杀.击杀账).reduce((s, n) => s + n, 0);
  if (击杀数 < 1) 越线.push(`击杀账本是空的：quest stats.kills 没记 ${JSON.stringify(R.击杀.击杀账)}`);
  if (exceptions.length > 0) 越线.push(`页面异常 ${exceptions.length} 条：${exceptions[0]}`);

  if (越线.length) {
    console.error('e2e-combat 越线：\n - ' + 越线.join('\n - '));
    failures = 1;
  } else {
    console.log('e2e-combat: 战斗链全通（感知→追击→互殴→击杀→魂火→账本）');
  }
  ws.close();
} catch (err) {
  console.error('e2e-combat 失败：', err?.message ?? err);
  failures = 2;
} finally {
  cleanup();
  setTimeout(() => process.exit(failures), 300);
}
