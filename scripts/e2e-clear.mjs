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
 * ## 这一轮连的是哪台浏览器、哪个页（W-C2 切片6c，与 `perf-smoke` 同一套口径）
 *
 * 这条门禁只报一个数：**异常 0 条**。而"CDP 事件通道一条都没送"与"页面真的没抛错"
 * 读出来是同一个 0 —— 所以通道的**正面见证**（有执行上下文、有 load）是这条预算的前提，
 * 不是装饰。同理，口不能靠探：`--remote-debugging-port=<固定口>` 在端口被占时 Chrome
 * **不报错，只是不开这个口**，而探口探到**别人**那台 Chrome 时，脚本会在别人的 profile 里
 * 跑这一轮，读数不再属于这个工作树。所以口交给 Chrome 自己挑（`=0`），再从**它自己的话**里读回来；
 * 页地址必须落在本进程的 vite 口上。三样判据（`解析CDP口` / `页地址问题` / `通道问题`）
 * 都住在 `./harness-readings.mjs` —— 那是两个 harness 共用的判据模块，写成本文件的私有函数
 * 就等于把"这条门禁说的话算不算数"复制两份、各自漂移。
 *
 * ## 退出码
 *
 * `0` 通关且在预算内；`1` 没通关 / 超帧预算 / 有未捕获异常；`2` 环境问题（找不到 Chrome、
 * dev 口或游戏没起来）。与 `perf-smoke` 同一套约定 —— 将来接进 CI（W-D4 切片4）时就是红绿的来源。
 *
 * 用法：`npm run e2e`（自己起 dev 口与浏览器，结束自己收）。
 */
import { spawn, spawnSync } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { createServer } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import { E2E_BUDGETS } from './e2e-budgets.mjs';
import { 解析CDP口, 页地址问题, 通道问题 } from './harness-readings.mjs';

/**
 * 预算表在 `./e2e-budgets.mjs` —— **判据与执行分家**。
 *
 * 为什么不在本文件里定义：本文件是"导入即执行"的（顶层就起 vite 与 Chrome）。
 * 门禁要的只是那张表，可它一旦 import 本文件就会在 `npm test` 里真跑一遍 E2E。
 * `perf-smoke.mjs` 踩过这个坑（全量套件里那条 `process.exit` 噪声就是它），
 * 这里不重复。**本文件不导出任何东西**，谁想拿判据就去 `e2e-budgets.mjs`。
 */

/**
 * 取一个当下空闲的端口（现在只用在 **vite** 那上口）。
 *
 * 为什么 dev 口不用写死的（`perf-smoke` 那边是 5321 + "开跑前先验口空"）：实测连跑两次，
 * 第二次会以 "Chrome CDP 口没起来" 收场 —— 上一轮的进程还没退干净，端口还占着。
 * 一条**时绿时红**的门禁比没有门禁更糟（它会教人忽略红灯），所以这一侧按当下空闲的取。
 * 竞态窗口（探测与占用之间）在单机上是毫秒级，且真撞上也只是这一条红，不会静默假绿。
 *
 * CDP 那上口**不**再用它：见下面 `CDP_SPEC` —— 探来的口不等于 Chrome 会听那个口。
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
 * CDP 口交给 **Chrome 自己挑**（W-C2 切片6c，与 `perf-smoke` 切片6b 同一处修法）。
 *
 * 此前这里写的是 `const CDP_PORT = await freePort()`：先探一个空的，再把它塞给 Chrome。
 * 探到的那个"空"只属于探测那一瞬间 —— 上一轮泄漏的无头 Chrome（Windows 上 `child.kill()`
 * 杀不掉整棵树，见 `拔树`）随时可能还占着它，而 `--remote-debugging-port=<被占的口>` 的失败方式
 * 不是报错，是**不开口**：于是这一条红成"Chrome CDP 口没起来"，责任落在根本没改过的代码上。
 * 更坏的一种：探到的口上答话的是**别人**的 Chrome ⇒ 脚本连进别人的浏览器，在它那个 about:blank
 * 里等 `window.__game`，最后红成"游戏没起来"，或者（页恰好是我们那个构建时）跑成一次不属于
 * 这个工作树的**绿**。
 *
 * `=0` 之后口由 Chrome 挑一个真空闲的，再通过它自己的话交回来（`DevTools listening on ws://…`）。
 * 于是"口来自我 spawn 的那个进程"由构造成立 —— 撞不上别人的口，也连不上别人的浏览器。
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

// vite 的口按当下空闲的取（见 `freePort` 的注释）；CDP 的口不取，等 Chrome 报。
const VITE_PORT = await freePort();

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
  拔树(vite);
  process.exit(2);
}
const profileDir = join(tmpdir(), `e2e-clear-${Date.now()}`);
/** 浏览器自己报的话（stderr 为主，stdout 一起收 —— 有的构建把 DevTools 行打到 stdout） */
const 浏览器输出 = [];
const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${CDP_SPEC}`,
  `--user-data-dir=${profileDir}`,
  '--no-first-run',
  '--disable-gpu',
  // 与 perf-smoke 同款三连：无头页被当后台页时定时器与渲染都会被节流
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
 * 上限给 25 秒是为 CI —— 没有上限，一次 Chrome 起不来就变成挂住而不是红。
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
 *
 * `child.kill()` 在 Windows 上只终止那一个 PID，而 headless Chrome 有一整棵子进程
 * （crashpad、renderer、utility），主进程被孤儿们钉住不走。上一轮就是这么把 dev 口与浏览器留活的，
 * 而上面 `freePort` / `CDP_SPEC` 那两段说的"连跑两次必红"就是它的后果 —— 拔树是让那两条前提成立的那一环。
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

let failures = 0;
try {
  if (!await waitForHttp(`http://127.0.0.1:${VITE_PORT}/`)) throw new Error('dev 口 20 秒内没起来');
  const { 口: CDP口, 浏览器ws } = await 读CDP口();
  console.log(`e2e-clear：Chrome 报出自己的口 ${CDP口}（${浏览器ws.slice(0, 46)}…）`);

  const targets = await (await fetch(`http://127.0.0.1:${CDP口}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  /** 点名目标的清单：口是通的、缺的是页 —— "CDP 口没起来"这句会把责任记错地方 */
  if (!page) {
    throw new Error(`CDP 口 ${CDP口} 通了但 /json/list 里没有 page 目标：${JSON.stringify(targets).slice(0, 300)}`);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let msgId = 0;
  const pending = new Map();
  const exceptions = [];
  /**
   * 事件通道的**自证**：这条门禁的预算里有一条"异常 0 条"，
   * 而"通道一条都没送"与"页面真的没抛"读出来是同一个 0 —— 后者会被当成达标。
   * 所以顺手数两样一定会来的东西（`Runtime.enable` 会 flush 现存执行上下文；导航后必有 load），
   * 起跑前先一并核。判据在 `./harness-readings.mjs`，与 `perf-smoke` 共用同一把尺。
   */
  const 通道 = { 执行上下文: 0, 加载完成: 0 };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method === 'Runtime.exceptionThrown') {
      exceptions.push(m.params?.exceptionDetails?.exception?.description
        ?? m.params?.exceptionDetails?.text ?? '?');
    }
    else if (m.method === 'Runtime.executionContextCreated') 通道.执行上下文 += 1;
    else if (m.method === 'Page.loadEventFired') 通道.加载完成 += 1;
  };
  const send = (method, params = {}) => new Promise((res) => {
    const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params }));
  });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: false, returnByValue: true });
    if (r.result?.exceptionDetails) {
      // 把**页面里那句话**与位置带出来：抽 JSON 前 300 字会正好切掉 description，
      // 于是红只会说"页面内抛错"，责任落不到具体哪一句拒上（perf-smoke 2026-10-20 第一次真跑就这么瞎过一次）。
      const d = r.result.exceptionDetails;
      const 原话 = d.exception?.description ?? d.exception?.value ?? d.text ?? '?';
      const 位置 = `${d.url || '页内'}:${(d.lineNumber ?? -1) + 1}:${d.columnNumber ?? '?'}`;
      throw new Error(`页面内抛错 @${位置}：${String(原话).split('\n')[0].slice(0, 400)}`);
    }
    return r.result?.result?.value;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${VITE_PORT}/` });

  let ready = false;
  /**
   * 开机窗口 120 秒（不是 30 秒），与 `perf-smoke` 同一把尺：vite 冷缓存要按需转译 ~300 个模块，
   * `.tmp-20261020-wc2s5/why-no-game.mjs` 在同一条 dev 口上量到过 `window.__game` 要 **57.5 秒**才出现。
   * 30 秒那一档红的是缓存而不是代码 —— 而 CI 的 `node_modules/.vite` 每轮都是冷的。
   */
  for (let i = 0; i < 240 && !ready; i += 1) {
    await sleep(500);
    ready = await evalJs('!!window.__game && !!window.__game.quests && !!window.__game.questAssistant');
  }
  if (!ready) throw new Error('游戏 120 秒内没起来');

  /**
   * **这一轮真的连到了这一轮起的那个页**，且事件通道在送东西（切片6c）。
   *
   * 页是从 `/json/list` 里挑的第一个 `type === 'page'`；地址必须落在**本进程的 vite 口**上，
   * 否则下面那 44 步走的是别人的构建。通道那条同理是"exceptions=0 这句算不算数"的前提。
   * 判据住在 `./harness-readings.mjs`：写在本地就只能拿正则数一遍字符串，
   * "把 `if` 改成 `if (false)`"那种变异臂照样绿（2026-10-22 电池实测 A4/A5 两条作废就是这么来的）。
   */
  const 页地址 = await evalJs('location.href');
  const 页问 = 页地址问题(页地址, VITE_PORT);
  if (页问.length) throw new Error(`连到的页不对：\n - ${页问.join('\n - ')}`);
  const 通问 = 通道问题(通道);
  if (通问.length) throw new Error(`CDP 通道没有正面见证：\n - ${通问.join('\n - ')}`);
  console.log(`e2e-clear：页=${页地址.slice(0, 60)} 执行上下文=${通道.执行上下文} 加载完成=${通道.加载完成}`);

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
