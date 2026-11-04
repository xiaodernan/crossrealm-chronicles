/**
 * 战斗 E2E 冒烟（W-D4 切片3 立，切片7 上到共用 harness 口径）—— `npm run e2e:combat`。
 *
 * perf-smoke 证明"游戏活着"，e2e-clear 证明"主线走得通"，这一条证明"**互殴打得赢**"：
 * 起真游戏、给真输入（与真实 mousedown 监听同一把 `mouseDown` 锁存，主循环自己缓冲出招）、
 * 推真帧，然后断言一整条战斗链真的发生了——
 *   感知 → 追击 → 互殴 → 击杀 → 魂火入账 → 击杀账本 +1。
 * 全程不走白盒捷径（不直接扣敌人血、不直接调结算），结算必须由
 * CombatController 的打击窗口自己撞出来 —— 那条链断了任何一环，这里就红。
 *
 * ## 切片7 改的是"这一轮说的话算不算数"，切片7b 改的是"这一轮跑不跑得完"
 *
 * 三站的**断言**照旧（AI 状态、敌血、魂火、账本），真输入的形状照旧（红了才知道归因给谁）。
 * 切片7 换掉的是 bootstrap 那一半：此前它把 vite 口与 CDP 口都写死（5322 / 9425）、
 * 用 `stdio: 'ignore'` 起 Chrome（于是那句 `DevTools listening on ws://…` 无处可读）、
 * 从 `/json/list` 里挑第一个 page 而不问它是谁的页、收尾用 `child.kill()`、
 * 报"异常 0 条"之前不见证事件通道真的在送东西。那六样在 `perf-smoke`（切片6b）与
 * `e2e-clear`（6c/6d）上已经各改过一次，这里把最后一个旧形状的门禁接上**同一把尺**：
 * 判据全部住在 `./harness-readings.mjs`，本文件只负责接线。
 *
 * 切片7b 补的是**换上口径之后才看得见的那一笔**：这条门禁自写下一次没绿过，此前它死在写死的口上，
 * 没人知道它走到站 2 要四十分钟。两个因，都在推帧那一行上：
 * - **dt 自反馈**：`Game.update()` 读 `clock.getDelta()`，手动推帧时 dt = 上一帧的真实耗时（秒级）
 *   ⇒ 每帧都在推进好几秒的世界 ⇒ 更慢。修法与 `e2e-clear` 同一句：钉成 `1/60`。
 * - **每帧真绘制**：无头 Chrome 用软件 GL，一帧 `render()` 实测 ~2.1 秒（探针
 *   `.tmp-20261031-s24/probe-framecost.log`：空闲 纯update 171.6 ms/帧 vs update+render 2271.5 ms/帧）。
 *   绘制按 `预算.renderEvery` 的节拍走，逻辑帧一帧不省 —— 取消绘制就没人管"打着打着画面管线炸了"，
 *   每帧都绘这一条就没人跑得动。
 *
 * 为什么"两把尺分家"是真代价：`--remote-debugging-port=9425` 在口被占时 Chrome
 * **不报错，只是不开口** ⇒ 这一条红成"CDP 口没起来"，责任落在没改过的代码上；
 * 而探口探到**别人**的 Chrome 时更坏 —— 在别人的 profile 里跑这一轮，
 * 若那个页恰好是本仓的构建，就是一次不属于这个工作树的**绿**。
 * Windows 上 `child.kill()` 只终止一个 PID，headless Chrome 的孤儿们（crashpad / renderer / utility）
 * 把主进程钉住 ⇒ 上一轮的浏览器还占着口 ⇒ 下一轮假红：`拔树` 是让"口来自本进程"成立的那一环。
 *
 * ## 中途重载 = 本轮读数作废（与 `e2e-clear` 的 6d 同一条）
 *
 * 这个工作树是并发会话共用的：这一轮要跑几十秒、几百次 `evalJs`，期间谁往 `src/` 写一下
 * ⇒ vite 发全量重载 ⇒ `window.__game` 当场变回 undefined ⇒ 最先红的是一句
 * `TypeError: … reading 'enemyManager'` —— 那句红读起来像"AI 通路坏了"，
 * 真实原因是"这一轮的页被换掉了"。正面信号还是 `Runtime.executionContextCreated` 的条数
 * （本仓不起 worker、不挂 iframe，正常轮次里它不该动）。动过 ⇒ **抛出、退出码 2**，
 * 而不是把那批数拿去和断言比、报成"越线"（退出码 1）。
 *
 * ## 与 `e2e-clear` 的一处形状不同（如实记）
 *
 * `evalJs` 这里用 `awaitPromise: true`：第二、三站是页内的 `async` IIFE（要等真帧推完），
 * 那边是同步推帧 + 下标读账。这条不同**不影响**四个判据，但它是两脚本唯一不能整段复制的原因，
 * 所以写在这里而不是让下一个人去 diff。
 *
 * ## 退出码
 *
 * `0` 战斗链全通；`1` 任一越线（AI 没出手 / 打不死 / 魂火没入账 / 账本没记 / 有未捕获异常）；
 * `2` 环境问题（找不到 Chrome、dev 口或游戏没起来、连到的页不是本进程的、
 * 通道没送东西、这一轮的页中途被重建）。与 `perf-smoke` / `e2e-clear` 同一套约定。
 */
import { spawn, spawnSync } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { createServer } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import { E2E_COMBAT_BUDGETS } from './e2e-budgets.mjs';
import { 解析CDP口, 页地址问题, 通道问题, 重载问题, 重载线索, 原话尾巴, 战斗越线 } from './harness-readings.mjs';
import { 开通道 } from './cdp-channel.mjs';

/**
 * 预算与阈值住在 `./e2e-budgets.mjs` —— **判据与执行分家**（与 `e2e-clear` 同一条纪律）：
 * 本文件导入即执行，门禁要拿这些数按值钉死，一旦 import 本文件就是在 `npm test` 里真起浏览器。
 */
const 预算 = E2E_COMBAT_BUDGETS;

/**
 * 取一个当下空闲的端口（只用在 **vite** 这一上口）。
 *
 * 写死 5322 的失败方式实测过：上一轮的进程还没退干净 ⇒ 这一轮 vite 因 `--strictPort` 起不来，
 * 而 `stdio: 'ignore'` 让那句话**没人听见** ⇒ 只剩"dev 口没起来"。一条时绿时红的门禁
 * 比没有门禁更糟（它会教人忽略红灯）。
 *
 * CDP 那上口**不**用探：见下面 `CDP_SPEC` —— 探来的口不等于 Chrome 会听那个口。
 */
const freePort = () => new Promise((res, rej) => {
  const srv = createServer();
  srv.unref();
  srv.on('error', rej);
  srv.listen(0, '127.0.0.1', () => {
    const { port } = srv.address();
    srv.close(() => res(port));
  });
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * CDP 口交给 **Chrome 自己挑**（W-C2 切片6c，与 `perf-smoke` / `e2e-clear` 同一处修法）。
 * `=0` 之后口由 Chrome 挑一个真空闲的，再通过它自己的话（`DevTools listening on ws://…`）交回来
 * ⇒ "口来自我 spawn 的那个进程"由构造成立。
 */
const CDP_SPEC = 0;

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

// vite 的口按当下空闲的取；CDP 的口不取，等 Chrome 报。
const VITE_PORT = await freePort();

/**
 * dev server 自己说的话（stdout + stderr 都收）。
 *
 * 此前这里是 `stdio: 'ignore'` —— 那是这一族假红最难归因的形状：`--strictPort` 撞口时 vite
 * 打的正是那句 `Port 5322 is in use...`，扔掉它之后脚本只剩下"dev 口没起来"；
 * 而页被重建时，**唯一能点名成因的东西也在这一条流里**（`00:59:12 [vite] page reload src/core/Game.js`
 * 与 `[vite] ✨ new dependencies optimized: three` 是两种完全不同的红：前者是并发会话写了一下，
 * 后者是它自己的冷启动噪声，每一轮都红在同一格）。2026-10-31 连着两轮死在同一个位置，
 * 按 mtime 对过账那两百多秒里 `src/` 没写过 —— 那句"最常见的原因：有人往 src/ 写了一下"
 * 会把下一个人送去查一个没被改过的提交。收进来，红的时候带上它的原话。
 */
const dev输出 = [];
const vite话 = () => {
  const 全文 = dev输出.join('');
  const 行 = 重载线索(全文);
  if (行.length) return 行.join('\n - ');
  // 判据交白卷不等于 dev server 没说话：把它的原话尾巴一起交出去，
  // "过滤器写错了"就藏不进"没人说话"这句清白话里（2026-10-31 就是这么错了一轮）。
  const 尾 = 原话尾巴(全文);
  return 尾.length
    ? `判据没收到带 [vite] 的行 —— 别读成"vite 没说话"，它最后说的 ${尾.length} 行：\n - ${尾.join('\n - ')}`
    : '(dev server 一个字都没输出 —— 这一轮的重载不是它发的)';
};

// 直接用当前 node 调 vite.js：Windows 上 spawn .cmd 要开 shell（引号/quoting 风险），绕开它
//
// `--host 127.0.0.1` 是**必须**的：vite 缺省只听 `localhost`，而 Windows 上 `localhost`
// 先解析到 IPv6 的 `::1` ⇒ 脚本探 `http://127.0.0.1:<port>/` 会**超时**（症状"游戏没起来"
// + 页面错误 0 条 —— 一次把责任错记到构建上的假红）。显式绑到 IPv4 回环，三者逐字对齐。
const viteBin = join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
const vite = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'],
  { stdio: ['ignore', 'pipe', 'pipe'], cwd: process.cwd() });
vite.stdout.on('data', (b) => dev输出.push(String(b)));
vite.stderr.on('data', (b) => dev输出.push(String(b)));

const chromePath = findChrome();
if (!chromePath) {
  console.error('e2e-combat: 找不到 Chrome（可用 CHROME 环境变量指定路径）');
  拔树(vite);
  process.exit(2);
}
const profileDir = join(tmpdir(), `e2e-combat-${Date.now()}`);
/** 浏览器自己报的话（stderr 为主，stdout 一起收 —— 有的构建把 DevTools 行打到 stdout） */
const 浏览器输出 = [];
const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${CDP_SPEC}`,
  `--user-data-dir=${profileDir}`,
  '--no-first-run',
  '--disable-gpu',
  // 与另两条 harness 同款三连：无头页被当后台页时定时器与渲染都会被节流
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
chrome.stderr.on('data', (b) => 浏览器输出.push(String(b)));
chrome.stdout.on('data', (b) => 浏览器输出.push(String(b)));

/**
 * 从 Chrome 自己的话里取回它挑中的口（有界等待，取不到就带上它说过的话红）。
 *
 * 这一句是整条腿的**来源证明**：口不是探来的，是**我 spawn 的那个进程**亲口报的。
 * 上限 25 秒是为 CI —— 没有上限，一次 Chrome 起不来就变成挂住而不是红。
 */
async function 读CDP口(等待毫秒 = 25000) {
  const 截止 = Date.now() + 等待毫秒;
  for (;;) {
    const 全文 = 浏览器输出.join('');
    const 得 = 解析CDP口(全文);
    if (得) return { ...得, 全文 };
    if (Date.now() >= 截止) {
      throw new Error(`Chrome ${Math.round(等待毫秒 / 1000)} 秒内没报出 DevTools 口（--remote-debugging-port=${CDP_SPEC}）。它自己的话：\n${全文.slice(0, 1200) || '(空)'}`);
    }
    await sleep(250);
  }
}

/**
 * 收尾：把**自己起的**那棵树连根拔掉（Windows 上要的是 /T，不是 kill()）。
 * 只杀自己那棵树：PID 来自本次 spawn，不搜进程名（搜名字会打到别人并行跑的 Chrome/vite 上）。
 */
function 拔树(子进程) {
  if (!子进程?.pid) return;
  try {
    if (process.platform === 'win32') {
      const r = spawnSync('taskkill', ['/PID', String(子进程.pid), '/T', '/F'], { stdio: 'ignore' });
      if (r.status !== 0) 子进程.kill(); // 已经没了 / taskkill 不可用：退回原办法
    } else {
      子进程.kill();
    }
  } catch { /* 已经退出 */ }
}

const cleanup = () => {
  拔树(chrome);
  拔树(vite);
  // 临时 profile 要等浏览器真死了才删得动：先拔树，再删目录
  try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* 留着也无害 */ }
};
process.on('exit', cleanup);

/**
 * 事件通道的**自证** + 中途重载的**基线**，声明在 try 外面（catch 也要读得到它）。
 *
 * 这条门禁的断言里有一条"异常 0 条"，而"通道一条都没送"与"页面真的没抛"读出来是同一个 0；
 * 数两样一定会来的东西（`Runtime.enable` 会 flush 现存执行上下文；导航后必有 load）。
 */
const 通道 = { 执行上下文: 0, 加载完成: 0 };
/** 测量开始前的上下文条数；`null` = 还没走到见证，那一段的红不归"重载"管 */
let 基线上下文 = null;

let failures = 0;
try {
  if (!await waitForHttp(`http://127.0.0.1:${VITE_PORT}/`)) throw new Error(`dev 口 20 秒内没起来（vite 口 ${VITE_PORT}）`);
  const { 口: CDP口, 浏览器ws } = await 读CDP口();
  console.log(`e2e-combat：Chrome 报出自己的口 ${CDP口}（${浏览器ws.slice(0, 46)}…）`);

  const targets = await (await fetch(`http://127.0.0.1:${CDP口}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  /** 点名目标的清单：口是通的、缺的是页 —— "CDP 口没起来"这句会把责任记错地方 */
  if (!page) {
    throw new Error(`CDP 口 ${CDP口} 通了但 /json/list 里没有 page 目标：${JSON.stringify(targets).slice(0, 300)}`);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  /**
   * CDP 管道住在 `./cdp-channel.mjs`（W-D4 切片10）—— 三个 harness 共用一份，这里不再自己抄。
   *
   * 被换掉的那一段只有 `pending.set(id, res)`：没有 `rej`、没有 close 监听、也没有每请求的钟。
   * 那种形状下"Chrome 活着、`/json/list` 答话、`Runtime.evaluate` 一条都不回"（`soak.mjs:264`
   * 在 2026-10-31 校准8 真撞上过一次）在本脚本里**不是红，是永远挂着** —— 这里没有 soak 那只
   * 墙钟保险，只能靠人盯着 Ctrl-C，而留下的日志看不出是页不答话还是通道断了。
   * 现在两种都是当场抛出的环境问题，话里带名义、带关闭码、带 Chrome 自己的原话尾巴。
   *
   * `等待页面Promise` 那一格开成"等"：站点的代码是页内 async IIFE（要等真帧推完才交账），
   * 与 `e2e-clear` 那边推同步表达式（false）不是同一种形状，所以这一格由调用方说，不写在管道里。
   */
  const { send, evalJs, 异常: exceptions } = 开通道({ ws, 名义: 'e2e-combat', 通道, 浏览器输出, 等待页面Promise: true });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${VITE_PORT}/` });

  /** 就绪表达式：三处都要问同一件事，所以只有一个真源（复制三份时"重建后重问"会用错表达式） */
  const 就绪 = '!!window.__game && !!window.__game.enemyManager && window.__game.enemyManager.enemies.length > 0';
  let ready = false;
  /**
   * 开机窗口 120 秒（不是原来的 30 秒），与 `perf-smoke` / `e2e-clear` 同一把尺：
   * vite 冷缓存要按需转译 ~300 个模块，实测 `window.__game` 要 57 秒才出现。
   * 30 秒那一档红的是缓存而不是代码 —— 而 CI 的 `node_modules/.vite` 每轮都是冷的。
   */
  for (let i = 0; i < 240 && !ready; i += 1) {
    await sleep(500);
    ready = await evalJs(就绪);
  }
  if (!ready) throw new Error(`游戏 120 秒内没起来（页 http://127.0.0.1:${VITE_PORT}/）。vite 的话：\n - ${vite话()}`);

  /**
   * 等页面**静下来**，再认它（切片7 —— 那两轮假红的直接修法）。
   *
   * "执行上下文条数不再动"是这一条唯一可用的正面信号：页被重建会多一条上下文，
   * 而 `Runtime.enable` 会先把现存的那条报给我们（所以开机阶段本来就会涨几下）。
   * 连续三拍（1.5 秒）不动才把这一刻当成"测量开始"—— 基线取在静置**之前**的话，
   * vite 冷启动那一次自发的 reload 会正好落在基线与第一站之间，于是每一轮都红在同一格，
   * 而红话说的是"有人往 src/ 写了一下"。
   *
   * 条数又动了 = 页在这 1.5 秒里被换过 ⇒ 重新等它起来（`window.__game` 当场是 undefined），
   * 然后从头再量静置。60 秒还静不下来就红，并带上 vite 的原话：那种红是"dev server 一直在重启"，
   * 不是"战斗链坏了"，也不该被读成后者。
   */
  {
    const 静拍需要 = 3;
    const 截止 = Date.now() + 60000;
    let 上次 = 通道.执行上下文;
    let 静 = 0;
    while (静 < 静拍需要) {
      await sleep(500);
      const 现 = 通道.执行上下文;
      if (现 !== 上次) {
        上次 = 现;
        静 = 0;
        let 起 = false;
        for (let i = 0; i < 240 && !起; i += 1) {
          起 = await evalJs(就绪);
          if (起) break;
          await sleep(500);
        }
        if (!起) throw new Error(`页面重建后 120 秒内没起来。vite 的话：\n - ${vite话()}`);
      } else {
        静 += 1;
      }
      if (Date.now() >= 截止) {
        throw new Error(`静置失败：60 秒里页面的执行上下文一直在动（现 ${现} 条）—— dev server 停不下来。vite 的话：\n - ${vite话()}`);
      }
    }
  }

  /**
   * **这一轮真的连到了这一轮起的那个页**，且事件通道在送东西（切片6c 的三问）。
   * 页是从 `/json/list` 里挑的第一个 `type === 'page'`；地址必须落在**本进程的 vite 口**上，
   * 否则下面那三站走的是别人的构建。通道那条是"异常 0 条"这句算不算数的前提。
   */
  const 页地址 = await evalJs('location.href');
  const 页问 = 页地址问题(页地址, VITE_PORT);
  if (页问.length) throw new Error(`连到的页不对：\n - ${页问.join('\n - ')}`);
  const 通问 = 通道问题(通道);
  if (通问.length) throw new Error(`CDP 通道没有正面见证：\n - ${通问.join('\n - ')}`);
  console.log(`e2e-combat：页=${页地址.slice(0, 60)} 执行上下文=${通道.执行上下文} 加载完成=${通道.加载完成}`);
  // 基线取在**静置 + 见证之后、起跑之前**：此后上下文条数一旦变动，就是"页在中途被换过"的实锤
  基线上下文 = 通道.执行上下文;

  /**
   * 换成固定步长（W-D4 切片7b，与 `e2e-clear` 那一句逐字同形）—— 这一句决定这一轮**跑不跑得完**。
   *
   * `Game.update()` 自己调 `this.clock.getDelta()`，而手动推帧时那个 dt = **上一帧到这一帧的真实耗时**。
   * 无头页里软件 GL 一帧两秒 ⇒ dt 两秒 ⇒ AI、投射物、粒子、伤害数字全按两秒推进 ⇒ 下一帧更贵 ——
   * 这是一条自反馈，不是"这一台机器慢"：探针（`.tmp-20261031-s24/probe-framecost.log`）在同一条链上
   * 读到**贴脸 1152 ms/帧纯 update**，而 perf 榜上同一台机器的 `updateP95` 是 12~16 ms。
   * 2026-10-31 真跑一轮：通道见证之后 40 分钟没走到位次 2 的交账（按 2400 帧的预算推，那是四十分钟级）。
   *
   * 钉住之后 `帧数` 才是它一直想当的那个数：**模拟时间 / 60 秒**，与机器忙不忙无关。
   */
  await evalJs('window.__game.clock.getDelta = () => 1 / 60; true');
  /** 墙钟按站记账：这一条门禁的可用性本身就靠这个数，红了要知道是"打不死"还是"跑不动" */
  const 秒表 = { 起: Date.now(), 读: () => Math.round((Date.now() - 秒表.起) / 100) / 10 };

  const R = { 墙钟秒: {} };

  // 站0：E2E 前置——冒烟不是平衡测试，给玩家厚血免得兵把它打死打乱序列
  R.前置 = await evalJs(`(() => {
    const g = window.__game;
    g.player.combat.hp = ${预算.playerHp};
    g.player.combat.maxHp = ${预算.playerHp};
    const 兵 = g.enemyManager.enemies.find(e => e.type === 'soldier' && e.alive);
    if (!兵) throw new Error('没有活着的影之战士');
    g.player.teleport(兵.position.x + 2.2, 0, 兵.position.z, { yaw: 0, pitch: 0 });
    return { 兵名: 兵.name, 敌血: 兵.hp, 我魂: g.stats.souls, 击杀账: { ...(g.quests.stats.kills ?? {}) } };
  })()`);

  // 站1：AI 通路——玩家贴脸后推帧，**每帧**采一次状态，交出去的是走过的那条轨迹
  // （r7 之前采的是"第一帧的态"与"最后一帧的态"两个点，于是"打完一套连段又回到 windup"
  //  与"卡在 windup 里出不来"读出来一模一样 —— 见 `harness-readings.mjs` 的 `战斗越线`）
  R.ai = await evalJs(`(async () => {
    const g = window.__game;
    const 兵 = g.enemyManager.enemies.find(e => e.type === 'soldier' && e.alive);
    const 轨迹 = [];
    const 记一笔 = () => { const s = String(兵.state); if (轨迹[轨迹.length - 1] !== s) 轨迹.push(s); };
    记一笔();
    for (let i = 0; i < ${预算.aiProbeFrames}; i += 1) { g.update(); if (i % ${预算.renderEvery} === 0) g.render(); 记一笔(); await new Promise(r => setTimeout(r, 0)); }
    return { 轨迹: 轨迹.slice(0, 40), 后: 兵.state, 我掉血: g.player.combat.hp < ${预算.playerHp} };
  })()`);
  R.墙钟秒.站1 = 秒表.读();

  // 站2：真输入击杀——mouseDown 锁存一帧（与真实 mousedown 监听同一把锁存），主循环自己出招
  R.击杀 = await evalJs(`(async () => {
    const g = window.__game;
    const 兵 = g.enemyManager.enemies.find(e => e.type === 'soldier' && e.alive);
    const 旧魂 = g.stats.souls;
    /**
     * "这一只兵掉的那一份"用**对象身份 + 断气位置**认，不用"最近的一份"：
     * 竞技场里躺着几十份别人的旧掉落（r8 读到 掉落在场 = 15），按最近挑会挑到隔壁那堆，
     * 于是 魂入账 > 0 这句话只证明了"这片地上有东西被踩到"。
     * EnemyManager.js:516 把魂火下在 enemy.position 上，而 _spawn 每次都新建一条
     * 掉落记录（池化的只是 mesh/ring/beam 三件），所以断气前不在册、且落在断气点半米内的
     * 那枚 !gear 而 souls > 0 的就是它自己的那一份。
     * （这一段的注释里不许用反引号：它整片住在一个模板字符串里，反引号会当场把字符串断掉。）
     */
    const 在场 = () => new Set(g.loot?.drops ?? []);
    const 断气前 = 在场();
    let 帧 = 0;
    let 掉过血 = false;
    while (兵.alive && 帧 < ${预算.maxKillFrames}) {
      // 每隔几帧给一次"按下左键"的边沿（锁存每帧被主循环清掉，模拟真点）
      if (帧 % 12 === 0) g.player.combat.mouseDown['left'] = true;
      g.update();
      if (帧 % ${预算.renderEvery} === 0) g.render();
      帧 += 1;
      if (g.player.combat.hp < ${预算.playerHp}) 掉过血 = true;
      if (帧 % 120 === 0) await new Promise(r => setTimeout(r, 0));
    }
    const 死点 = { x: 兵.position.x, z: 兵.position.z };
    const 新增 = (g.loot?.drops ?? []).filter((d) => !断气前.has(d));
    const 魂火 = 新增.find((d) => !d.gear && d.souls > 0
      && Math.hypot(d.mesh.position.x - 死点.x, d.mesh.position.z - 死点.z) < 0.5) ?? null;
    const 距 = (d) => Number(Math.hypot(g.player.position.x - d.mesh.position.x,
      g.player.position.z - d.mesh.position.z).toFixed(2));
    // 收尸：这一窗只朝**那一枚**走，用真输入（KeyW + 面向它），不 teleport —— 玩家做得到才算通路。
    let 收尸帧 = 0;
    const 认领距 = 魂火 ? 距(魂火) : null;
    while (魂火 && 收尸帧 < ${预算.lootProbeFrames} && g.stats.souls === 旧魂) {
      const p = g.player.position;
      const 向 = Math.atan2(魂火.mesh.position.x - p.x, 魂火.mesh.position.z - p.z);
      g.player.yaw = 向; g.player.targetYaw = 向;
      g.keys['KeyW'] = true;
      g.update();
      if (收尸帧 % ${预算.renderEvery} === 0) g.render();
      收尸帧 += 1;
      if (收尸帧 % 120 === 0) await new Promise(r => setTimeout(r, 0));
    }
    g.keys['KeyW'] = false;
    return { 帧数: 帧, 杀掉: !兵.alive, 掉过血,
             魂入账: g.stats.souls - 旧魂,
             新掉落数: 新增.length, 认领距, 认领souls: 魂火?.souls ?? 0,
             魂火离场: 魂火 ? !(g.loot?.drops ?? []).includes(魂火) : false,
             收尸帧, 掉落在场: (g.loot?.drops ?? []).length,
             击杀账: { ...(g.quests.stats.kills ?? {}) } };
  })()`);
  R.墙钟秒.站2 = 秒表.读();

  console.log(JSON.stringify(R, null, 1));

  /**
   * **这一轮从头到尾是同一个页吗**（切片6d 同一条）—— 问在算越线之前。
   * 顺序要紧：越线那句"N 帧没打死一只兵"里的 N 取自预算表，它读的是 `帧数`，而那个数在页被重建之后
   * 来自两个不同的页。把它和预算比再报"退出码 1"，是把环境问题记到代码头上。
   */
  const 重问 = 重载问题(基线上下文, 通道.执行上下文);
  if (重问.length) {
    // 带个标记抛出：catch 里那条"归因"是给**别的原因**准备的（TypeError 那类），
    // 这一条自己已经说全了，不该再被复述一遍当成第二个结论
    const 废 = new Error(`${重问.join('\n - ')}\n谁动的：\n - ${vite话()}`);
    废.读数作废 = true;
    throw 废;
  }

  const 越线 = 战斗越线(R, 预算, exceptions);

  if (越线.length) {
    console.error('e2e-combat 越线：\n - ' + 越线.join('\n - '));
    failures = 1;
  } else {
    console.log(`e2e-combat: 战斗链全通（感知→追击→互殴→击杀→魂火→账本）`
      + `｜墙钟 ${R.墙钟秒.站2} 秒｜${预算.maxKillFrames} 帧预算用了 ${R.击杀.帧数} 帧`);
  }
  ws.close();
} catch (err) {
  console.error('e2e-combat 失败：', err?.message ?? err);
  // 中途被重建时，最先红的**总是**某一句 evalJs 的 TypeError（`reading 'enemyManager'`），
  // 它读起来像战斗链坏了。这一句把责任挪回它该在的地方：不是这一轮的代码，是这一轮的页。
  if (!err?.读数作废) {
    const 归因 = 重载问题(基线上下文, 通道.执行上下文);
    if (归因.length) console.error(`e2e-combat 归因：\n - ${归因.join('\n - ')}\n谁动的：\n - ${vite话()}`);
  }
  failures = 2;
} finally {
  cleanup();
  setTimeout(() => process.exit(failures), 300);
}
