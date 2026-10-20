/**
 * 无头 E2E 自动通关门禁（W-D4 切片3）—— `npm run e2e`。
 *
 * W-D4 的切片1 把三门禁（lint / test / build）接上了 CI，切片2 立了性能冒烟，
 * 定义里剩的最后半句是**"无头 E2E 自动通关"** —— 一句话：**这个游戏还能从头走到尾吗**。
 * 单元测试问的是"每个零件对不对"，性能冒烟问的是"跑起来贵不贵"，
 * 没有一条问"整条主线还走得通吗"：任务表改一行、事件名改一个、章节门配错一格，
 * 单元测试全绿而玩家卡在第三章 —— 这一片就是那道岗。
 *
 * ## 驱动哪一条路（以及为什么不是另一条）
 *
 * 游戏里"自动通关"有两条路：
 * - `PlayerAutoPlay` + `startAutoPlay()`：机器人**真的跑图**（走路、开火、打 Boss）。
 * - `startFullDemo()`：同一条步骤清单，但每一步**传送到位**再派发事件。
 *
 * 这里走**第二条**。理由是"门禁的可靠性优先于覆盖面"：真跑图在无头软渲染下要跑很久，
 * 而且它的成功取决于寻路与 AI 会不会卡在某个角落 —— **一条时绿时红的门禁比没有门禁更糟**
 * （它会教人忽略红灯）。所以这一条**不**声称覆盖移动 / 碰撞 / 战斗；
 * 那三样由 `npm run perf`（真推帧）与单元层（`tests/*combat*`、`tests/*dungeon*`）各自守着。
 *
 * 它覆盖的是**主线的骨架**：`_buildDemoSteps()` 那 44 步每一步都过**真的** `QuestSystem`
 * （`checkProgress` → `advance` → 章节门 → `game-completed`），事件全走真的总线，
 * 七个位面的发现点 / NPC / 四个 Boss / 三座试炼地下城 / 宝箱 / 法术 / 技能各一次。
 * 也就是说：**任务表、章节门、事件名、统计键**这几样任意一处对不上，这一步就红。
 *
 * ## 确定性（这一条是它敢当门禁的前提）
 *
 * 无头页的 rAF 会被合成器饿死（`perf-smoke` 头注里记过 18 秒的单帧距），
 * 所以这里**不用 rAF**：把 `game.clock.getDelta` 换成常量 `1/60`，
 * 然后由驱动器手工推 `game.update()`。于是 44 步里每一处 `scheduler.wait(0.3)` /
 * `wait(0.5)` 都是**精确的帧数**，读数与机器快慢无关（与 `Time.js` 那句
 * "只有能被固定步长驱动的东西才是可验证的东西"同一条口径）。
 *
 * 推帧**只调 update()，不调 render()**：软渲染一帧 ~150ms（`perf-smoke` 实测），
 * 两千多帧会把这个门禁拖成五分钟。任务推进不经过渲染路径 —— 渲染价的回归归 perf-smoke。
 *
 * ## 退出码
 *
 * `0` 通关且在预算内；`1` 没通关 / 超帧预算 / 有未捕获异常；`2` 环境问题（找不到 Chrome、
 * dev 口或游戏没起来）。与 `perf-smoke` 同一套约定 —— 将来接进 CI（W-D4 切片4）时就是红绿的来源。
 *
 * 用法：`npm run e2e`（自己起 dev 口与浏览器，结束自己收）。
 */
import { spawn } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { createServer } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import { E2E_BUDGETS } from './e2e-budgets.mjs';

/**
 * 预算表在 `./e2e-budgets.mjs` —— **判据与执行分家**。
 *
 * 为什么不在本文件里定义：本文件是"导入即执行"的（顶层就起 vite 与 Chrome）。
 * 门禁要的只是那张表，可它一旦 import 本文件就会在 `npm test` 里真跑一遍 E2E。
 * `perf-smoke.mjs` 踩过这个坑（全量套件里那条 `process.exit` 噪声就是它），
 * 这里不重复。**本文件不导出任何东西**，谁想拿判据就去 `e2e-budgets.mjs`。
 */

/**
 * 取一个当下空闲的端口。
 *
 * 为什么不用写死的端口（`perf-smoke` 用的是 5321/9424 那一对）：实测连跑两次，
 * 第二次会以 "Chrome CDP 口没起来" 收场 —— 上一轮的 Chrome 还没退干净，端口还占着。
 * 一条**时绿时红**的门禁比没有门禁更糟（它会教人忽略红灯），所以端口按当下空闲的取。
 * 竞态窗口（探测与占用之间）在单机上是毫秒级，且真撞上也只是这一条红，不会静默假绿。
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

// 端口按当下空闲的取（见 `freePort` 的注释）：两个都先占好再起进程，
// 免得 vite 与 Chrome 之间互相抢
const VITE_PORT = await freePort();
const CDP_PORT = await freePort();

// 直接用当前 node 调 vite.js：Windows 上 spawn .cmd 要开 shell（引号/quoting 风险），绕开它
//
// `--host 127.0.0.1` 是**必须**的：vite 缺省只听 `localhost`，而 Windows 上 `localhost`
// 先解析到 IPv6 的 `::1` ⇒ 脚本探 `http://127.0.0.1:<port>/` 会**超时**（症状："游戏没起来"
// + 页面错误 0 条 —— 一次把责任错记到构建上的假红）。显式绑到 IPv4 回环，三者逐字对齐。
const viteBin = join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
const vite = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'],
  { stdio: 'ignore', cwd: process.cwd() });

const chromePath = findChrome();
if (!chromePath) {
  console.error('e2e-clear: 找不到 Chrome（可用 CHROME 环境变量指定路径）');
  vite.kill();
  process.exit(2);
}
const profileDir = join(tmpdir(), `e2e-clear-${Date.now()}`);
const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${profileDir}`,
  '--no-first-run',
  '--disable-gpu',
  // 与 perf-smoke 同款三连：无头页被当后台页时定时器与渲染都会被节流
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
    else if (m.method === 'Runtime.exceptionThrown') {
      exceptions.push(m.params?.exceptionDetails?.exception?.description
        ?? m.params?.exceptionDetails?.text ?? '?');
    }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params }));
  });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: false, returnByValue: true });
    if (r.result?.exceptionDetails) {
      throw new Error('页面内抛错: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    }
    return r.result?.result?.value;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${VITE_PORT}/` });

  let ready = false;
  for (let i = 0; i < 60 && !ready; i += 1) {
    await sleep(500);
    ready = await evalJs('!!window.__game && !!window.__game.quests && !!window.__game.questAssistant');
  }
  if (!ready) throw new Error('游戏 30 秒内没起来');

  // ① 换成固定步长：这一句是"读数与机器快慢无关"的全部依据（见头注"确定性"）
  await evalJs('window.__game.clock.getDelta = () => 1 / 60; true');

  // ② 起跑。**不能 await**：演示每一步都在等主循环的 `scheduler.wait`，
  //    而主循环要靠下面那个推帧循环来转 —— 在这里 await 就是自己把自己锁死。
  //    完成信号挂在 `questAssistant.demoRunning` 上（`startFullDemo` 的 finally 之外
  //    没有别的出口，所以另记一个 error 槽，让"抛了"与"跑完了"分得开）。
  await evalJs(`(() => {
    const qa = window.__game.questAssistant;
    window.__e2e = { error: null, started: false };
    Promise.resolve()
      .then(() => { window.__e2e.started = true; return qa.startFullDemo(); })
      .catch((e) => { window.__e2e.error = String(e && e.stack || e); });
    return true;
  })()`);

  // ③ 推帧直到跑完或耗尽预算。60 帧一批（= 1 秒模拟时间）：
  //    批内微任务不排空（同一段同步代码里 Promise 回调不会插队），
  //    所以每一批之间演示才往前走一步 —— 这正是"批"存在的理由，不是随手取的大小。
  const BATCH = 60;
  let frames = 0;
  let 演示跑完 = false;
  while (frames < E2E_BUDGETS.maxFrames) {
    await evalJs(`(() => { for (let i = 0; i < ${BATCH}; i += 1) window.__game.update(); return true; })()`);
    frames += BATCH;
    const st = await evalJs(`(() => {
      const qa = window.__game.questAssistant;
      const qs = window.__game.quests;
      return { running: !!qa.demoRunning, err: window.__e2e?.error ?? null,
        index: qs.questIndex, completed: !!qs.completed };
    })()`);
    if (st?.err) throw new Error('演示里抛错：' + String(st.err).slice(0, 400));
    // 头一批不算数：起跑那个微任务要等本次 evaluate 返回才排空，
    // 所以"第一批之后 running 还是 false"是起跑还没发生，不是演示已经结束
    if (!st?.running && frames > BATCH) { 演示跑完 = true; break; }
  }

  // ④ 收尾读数：走到第几步、第几章、有没有通关
  const 读数 = await evalJs('(() => {'
    + 'const qs = window.__game.quests;'
    + 'return { index: qs.questIndex, completed: !!qs.completed, chapter: qs.chapter };'
    + '})()');

  // 主线步数 = 走到的下标 + （通关了再加一）。分母守卫：任务表被掏空时"通关"是空转
  const 主线步数 = 读数.index + (读数.completed ? 1 : 0);

  const 模拟秒 = Math.round(frames / 60 * 10) / 10;
  console.log(`e2e-clear [读数] frames=${frames} 模拟时间=${模拟秒}s `
    + `questIndex=${读数.index} 主线步数=${主线步数} chapter=${读数.chapter} `
    + `completed=${读数.completed} 演示跑完=${演示跑完} exceptions=${exceptions.length}`);
  if (exceptions.length) console.log('e2e-clear [异常] ' + exceptions.slice(0, 5).join(' | '));

  const 预算 = E2E_BUDGETS;
  const 越线 = [];
  if (预算.requireCompleted && !读数.completed) {
    越线.push(`主线没走完：questIndex=${读数.index} chapter=${读数.chapter}（演示${演示跑完 ? '停了' : '没停'}）`);
  }
  if (主线步数 < 预算.minMainlineSteps) {
    越线.push(`主线只有 ${主线步数} 步（下限 ${预算.minMainlineSteps}）—— "通关"是空转`);
  }
  if (frames >= 预算.maxFrames) 越线.push(`推帧 ${frames} 耗尽预算 ${预算.maxFrames}（主线某一步走不完）`);
  if (exceptions.length > 预算.exceptions) 越线.push(`页面异常 ${exceptions.length} 条 > ${预算.exceptions}`);

  if (越线.length) {
    console.error('e2e-clear 未通过：\n - ' + 越线.join('\n - '));
    failures = 1;
  } else {
    console.log('e2e-clear: 通关 ✓（主线走完、零异常）');
  }
  ws.close();
} catch (err) {
  console.error('e2e-clear 失败：', err?.message ?? err);
  failures = 2;
} finally {
  cleanup();
  setTimeout(() => process.exit(failures), 300);
}
