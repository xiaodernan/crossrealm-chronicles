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
 * - `startFullDemo()`：同一张推导步表（`src/ui/demoSteps.js`），但每一步**传送到位**再派发事件。
 *
 * 这里走**第二条**。理由是"门禁的可靠性优先于覆盖面"：真跑图在无头软渲染下要跑很久，
 * 而且它的成功取决于寻路与 AI 会不会卡在某个角落 —— **一条时绿时红的门禁比没有门禁更糟**
 * （它会教人忽略红灯）。所以这一条**不**声称覆盖移动 / 碰撞 / 战斗；
 * 那三样由 `npm run perf`（真推帧）与单元层（`tests/*combat*`、`tests/*dungeon*`）各自守着。
 *
 * 它覆盖的是**主线的骨架**：那张**由主线推导**的步表（`src/ui/demoSteps.js`），每一步都过**真的** `QuestSystem`
 * （`checkProgress` → `advance` → 章节门 → `game-completed`），事件全走真的总线。
 * 也就是说：**任务表、章节门、事件名、统计键**这几样任意一处对不上，这一步就红。
 *
 * **这一步覆盖了几样东西，本文件不抄**（切片9b）：步数 = `buildDemoSteps().length`，
 * 每格是什么型（发现点 / NPC / Boss / 副本 / 宝箱 / 法术 / 技能）由 `src/content/objectives.js`
 * 那一张表的 `type` 列说了算。这里曾写着"四个 Boss / 三座试炼地下城" —— 那份清单和当年的帧预算
 * 是同一个病：表从 44 行走成 78 行，注释一个字没动，于是它成了一句听起来很具体的假话。
 *
 * ## 确定性（这一条是它敢当门禁的前提）
 *
 * 无头页的 rAF 会被合成器饿死（`perf-smoke` 头注里记过 18 秒的单帧距），
 * 所以这里**不用 rAF**：把 `game.clock.getDelta` 换成常量 `1/60`，
 * 然后由驱动器手工推 `game.update()`。于是走完那张表时每一处 `scheduler.wait(0.3)` /
 * `wait(0.5)` 都是**精确的帧数**，读数与机器快慢无关（与 `Time.js` 那句
 * "只有能被固定步长驱动的东西才是可验证的东西"同一条口径）。
 *
 * 推帧**只调 update()，不调 render()**：软渲染一帧 ~150ms（`perf-smoke` 实测），
 * 八千多帧（实测 r2 / r4 逐帧相同）会把这个门禁拖成几十分钟。任务推进不经过渲染路径 ——
 * 渲染价的回归归 perf-smoke。
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
 * ## 这一轮从头到尾是同一个页吗（W-C2 切片6d）
 *
 * 上面那三问都发生在**测量开始之前**，而这条门禁的测量要跑几十秒、几百次 `evalJs`。
 * 这个工作树是并发会话共用的：谁在这期间往 `src/` 写一下，vite 就发一次全量重载，
 * `window.__game` 当场变回 undefined，最先红的是一句
 * `TypeError: Cannot read properties of undefined (reading 'quests')` ——
 * 那句红读起来像"主线第 N 步坏了"，而真实原因是"这一轮的页被换掉了"：归因记错地方，
 * 下一个人会去查一个没被改过的文件。重载得晚时更坏 —— 它**不红**，只是那几十步的读数来自两个页。
 *
 * 正面信号还是 `Runtime.executionContextCreated` 的条数：本仓不起 worker、不挂 iframe，
 * 一次正常轮次里它不该动。基线取在通道见证之后、起跑之前，收尾时再问一次；
 * 动过 ⇒ 整轮**作废**（抛出，退出码 2），而不是把那批数拿去和预算比、报成"越线"（退出码 1）。
 * 判据 `重载问题` 也住在 `./harness-readings.mjs`，与 `perf-smoke` 同一把尺。
 *
 * ## 退出码
 *
 * `0` 通关且在预算内；`1` 没通关 / 超帧预算（总量或单步）/ 有未捕获异常；`2` 环境问题
 * （找不到 Chrome、dev 口或游戏没起来、这一轮的页中途被重建、**这一轮没走到交账**）。
 * 与 `perf-smoke` 同一套约定 —— 将来接进 CI（W-D4 切片4）时就是红绿的来源。
 *
 * 退出码这一族的前提是"**0 就说得出读数**"，所以切片9b 起多了一道闩：没打出 `[读数]` 那一行的
 * 一轮**不许**是 0（见下面 `不交账就红`）。
 *
 * 用法：`npm run e2e`（自己起 dev 口与浏览器，结束自己收）。
 */
import { spawn, spawnSync } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { createServer } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import { E2E_BUDGETS, E2E_DEMO_STEPS } from './e2e-budgets.mjs';
import { 解析CDP口, 页地址问题, 通道问题, 重载问题, 重载线索, 原话尾巴 } from './harness-readings.mjs';

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

/**
 * dev server 自己说的话（stdout + stderr 都收）—— W-D4 切片8 搬进这一族。
 *
 * 此前这里是 `stdio: 'ignore'`：这条门禁要跑几百次 `evalJs` 走完那张表，中途只要页被换掉，
 * 最先红的就是一句 `TypeError: … reading 'quests'`，而**唯一能点名成因的东西正好在这条被扔掉
 * 的流里**（`[vite] page reload src/core/Game.js` 说的是"谁动了"，`✨ new dependencies optimized`
 * 说的是它自己的冷启动噪声 —— 两种红完全不同）。`e2e-combat` 切片7 量到过这件事：连着两轮死在
 * 同一格，按 mtime 对过账那两百多秒里 `src/` 没写过，而红话指着"有人往 src/ 写了一下"。
 * 收进来，红的时候带上它的原话。
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
// 先解析到 IPv6 的 `::1` ⇒ 脚本探 `http://127.0.0.1:<port>/` 会**超时**（症状："游戏没起来"
// + 页面错误 0 条 —— 一次把责任错记到构建上的假红）。显式绑到 IPv4 回环，三者逐字对齐。
const viteBin = join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
const vite = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'],
  { stdio: ['ignore', 'pipe', 'pipe'], cwd: process.cwd() });
vite.stdout.on('data', (b) => dev输出.push(String(b)));
vite.stderr.on('data', (b) => dev输出.push(String(b)));

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
 * Chrome 自己说的话（W-D4 切片9b）。`vite话()` 那一族立的规矩在这里照用：**交白卷也要交尾巴**。
 *
 * 为什么这条门禁要它：**断线那句话点不出成因**。崩在渲染进程、显存不够、上一轮泄漏的浏览器被
 * `taskkill` 打掉 —— 在 CDP 这一侧全都只写成同一句"通道关闭（码=1006）"。能点名的一样都在浏览器
 * 这条流上（`# Crash` / out of memory / renderer gone）。**收了却不读**等于没收。
 */
const 浏览器话 = () => {
  const 尾 = 原话尾巴(浏览器输出.join(''), 5);
  return 尾.length ? 尾.join('\n - ') : '(浏览器一个字都没输出 —— 那句"通道断了"不是它说的)';
};

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

/**
 * 事件通道的**自证**（切片6c）+ 中途重载的**基线**（切片6d，#167），声明在 try 外面。
 *
 * 数两样一定会来的东西（`Runtime.enable` 会 flush 现存执行上下文；导航后必有 load）：
 * 这条门禁的预算里有一条"异常 0 条"，而"通道一条都没送"与"页面真的没抛"读出来是同一个 0。
 * 作用域要在 try 外面，是因为 catch 也要能问"上下文条数动过没有"——中途有人往 `src/` 写了一下
 * ⇒ vite 发全量重载 ⇒ 下一句 `evalJs` 红成 `TypeError: … reading 'quests'`，
 * 那句红读着像代码坏了，实际是这一轮的量被换掉了。
 */
const 通道 = { 执行上下文: 0, 加载完成: 0 };
/** 测量开始前的上下文条数；`null` = 还没走到见证，那一段的红不归"重载"管 */
let 基线上下文 = null;

let failures = 0;
/**
 * **本轮必须交账**（W-D4 切片9b）。
 *
 * 由来先说清楚，因为它自己就是这一片要记的一条教训：我先把 r2 读成了"绿着退场"——
 * 当时那份日志只有 7 行、停在通道见证那一行、没有 `[读数]`，而后台任务通知已经报了"完成 0"。
 * 等进程真退完再读，`[读数] frames=8760 … completed=true` 就在那里（`.tmp-20261031-s25/clear-r2.log` 第 7 行）。
 * **那份推断作废**，两条候选成因也各自被探针打掉（`.tmp-20261031-s25/exit-probe.mjs`）：
 * ① 顶层 `await` 永不 settle 时 Node 给的退出码是 **13**（还带一句 unsettled 警告），不是 0；
 * ② Windows 上 stdout 接管道时 `process.exit()` **没有**把尾巴吞掉 —— 40000 行两种模式都收满。
 * 教训归教训，**闩照立**，因为它守的形状与那次误读无关：`finally` 里那句 `process.exit(failures)`
 * 是这一条门禁唯一的结论出口，任何走不到它的路径都该响，而不是留下一句没声音。
 *
 * 两道闩，各管一种挂法：
 * ① `process.on('exit')` 问"交过账没有"，没交过就把退出码改成 2 —— 走不到 `finally` 也照样响
 *   （实测两例：自然退出时监听看到 码=0，改完 exitCode 进程真的以 2 退出去；臂"甲"删掉成功路径那句
 *   交账 ⇒ `finally` 走到了、`[读数]` 也打出来了，退出码仍是 2 —— 这一闩认的是**旗子**，不是那句打印）；
 * ② 一只**不 `unref`** 的挂钟闩（时长见 `挂钟毫秒`）—— 通道没断、但推帧循环挂住的那种形状，① 是等不到的
 *   （事件循环里还挂着活的 handle，进程就永远不 `exit`）。
 * 两条说的都是同一句话：**没有读数就没有结论**。
 */
let 已交账 = false;
/**
 * 挂钟的时长（毫秒）。红话里那句"多少秒没走到交账"**由它自己算**，不再抄一遍 ——
 * 原先 `15 分钟` 与 `900000` 两处各写一份，改一处就会让另一处说出一个不属于本体的数。
 */
const 挂钟毫秒 = 900000;
const 不交账就红 = (为什么) => {
  if (已交账) return;
  console.error(`e2e-clear 未通过：${为什么} —— 本轮没打出 [读数] 那一行，没有结论就不许是绿灯`);
  已交账 = true; // 认领这次结论，防 ①② 先后各喊一次
  cleanup();
  process.exit(2);
};
process.on('exit', (码) => {
  if (!已交账 && 码 === 0) {
    console.error('e2e-clear 未通过：本轮没走到交账就退出了（退出码 0 会被读成"这一轮过了"—— 信它之前先回看 [读数] 那一行在不在）');
    process.exitCode = 2;
  }
});
setTimeout(() => 不交账就红(`${挂钟毫秒 / 1000} 秒没走到交账（推帧循环挂住 / CDP 那边不再回来）`), 挂钟毫秒);
try {
  if (!await waitForHttp(`http://127.0.0.1:${VITE_PORT}/`)) throw new Error(`dev 口 20 秒内没起来。vite 的话：\n - ${vite话()}`);
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
  // 计数的是**外层**那个 `通道` 对象（声明在 try 外面，见那里的注释）：catch 也要读得到它。
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
  /**
   * **通道一断，就把所有在等的 `await` 交回去**（切片9b）。
   *
   * 不接这一刀时，`ws` 关闭是**静默**的：`send` 的 Promise 永远不 settle，`try` 走不到头。
   * 实测那种收尾长这样：顶层 await 没 settle ⇒ Node 直接以 **13** 退出并甩一句
   * "Detected unsettled top-level await"（`.tmp-20261031-s25/exit-probe.mjs`，与退出码约定 1/2 都对不上号）；
   * 若当时还挂着别的活 handle，就更糟 —— 不是退出，是**挂住**。两种都问不出成因。
   * 接了之后，断线当场变成一句带得出**成因**的抛错（环境问题 2）—— 而 Chrome 自己那条流里正有它
   * （崩溃会打 `# Crash` / OOM / renderer gone，上一轮泄漏的浏览器被 `taskkill` 打掉也在这条流里）。
   */
  let 断线 = null;
  const 拆通道 = (为什么) => {
    断线 = 为什么;
    for (const [, 交回] of pending) 交回({ 断线: 为什么 });
    pending.clear();
  };
  const send = (method, params = {}) => new Promise((res) => {
    if (断线) { res({ 断线 }); return; } // 通道已经死了：别再往 ws 上写（那会抛成第二个结论）
    const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params }));
  });
  // 事件用**标准 WebSocket 的 API**（`addEventListener`），不是 `ws` 包的 `.on()`：
  // 这里没有 import 'ws'，`WebSocket` 是 Node 自带的全局实现，`.on` 在它身上不存在 ——
  // 写成 `ws.on('close', …)` 的后果是 r3 那句 `e2e-clear 失败： ws.on is not a function`（退出码 2，
  // 而它红的原因与浏览器、页面、主线都没关系）。`addEventListener` 也不顶掉上面
  // 那句 `ws.onopen = res; ws.onerror = rej`（属性式handler与监听器各走各的）。
  ws.addEventListener('close', (ev) => 拆通道(
    `CDP 通道关闭（码=${ev?.code ?? '?'} 干净=${ev?.wasClean === true} 理由=${String(ev?.reason ?? '').slice(0, 120) || '无'}）`,
  ));
  ws.addEventListener('error', (ev) => 拆通道(`CDP 通道报错（${String(ev?.message ?? ev?.type ?? '?').slice(0, 200)}）`));
  const evalJs = async (expr) => {
    if (断线) throw new Error(`${断线}\nChrome 的话：\n - ${浏览器话()}`);
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: false, returnByValue: true });
    if (r.断线) throw new Error(`${r.断线}\nChrome 的话：\n - ${浏览器话()}`);
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
   *
   * 就绪表达式只有**一份**（切片8，与 `e2e-combat` 同一条纪律）：下面"页重建后再等一次"用的是同一个串。
   * 两份各写各的时，开机等的是三件都在、重建后等的可能只剩 `__game` —— 于是静置腿认的形状与真跑的腿不是同一个。
   */
  const 就绪 = '!!window.__game && !!window.__game.quests && !!window.__game.questAssistant';
  for (let i = 0; i < 240 && !ready; i += 1) {
    await sleep(500);
    ready = await evalJs(就绪);
  }
  if (!ready) throw new Error(`游戏 120 秒内没起来（页 http://127.0.0.1:${VITE_PORT}/）。vite 的话：\n - ${vite话()}`);

  /**
   * 等页面**静下来**，再认它（W-D4 切片8 —— 把 `e2e-combat` 切片7 量到的那一课搬过来）。
   *
   * 这一条门禁比战斗那条**更依赖**静置：它要把整张推导步表跑完、几百次 `evalJs`，而 vite 冷启动后自己会发
   * 一次 reload（优化依赖、首次请求才转译的那批模块）。基线取在静置**之前**的话，那一次自发 reload
   * 正好落在基线与第一步之间 ⇒ 每一轮都红在同一格，而红话说的是"有人往 src/ 写了一下"。
   *
   * "执行上下文条数不再动"是唯一可用的正面信号：页被重建会多一条上下文，而 `Runtime.enable`
   * 会先把现存那条报给我们（所以开机阶段本来就会涨几下）。连续三拍（1.5 秒）不动才把这一刻
   * 当成"测量开始"。条数又动了 = 页在这 1.5 秒里被换过 ⇒ 重新等它起来（`window.__game` 当场是
   * undefined）再从头量。60 秒还静不下来就红，并带上 vite 的原话：那种红是"dev server 停不下来"，
   * 不是"主线走不完"，不该被读成后者。
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
   * **这一轮真的连到了这一轮起的那个页**，且事件通道在送东西（切片6c）。
   *
   * 页是从 `/json/list` 里挑的第一个 `type === 'page'`；地址必须落在**本进程的 vite 口**上，
   * 否则下面整张表走的是别人的构建。通道那条同理是"exceptions=0 这句算不算数"的前提。
   * 判据住在 `./harness-readings.mjs`：写在本地就只能拿正则数一遍字符串，
   * "把 `if` 改成 `if (false)`"那种变异臂照样绿（2026-10-22 电池实测 A4/A5 两条作废就是这么来的）。
   */
  const 页地址 = await evalJs('location.href');
  const 页问 = 页地址问题(页地址, VITE_PORT);
  if (页问.length) throw new Error(`连到的页不对：\n - ${页问.join('\n - ')}`);
  const 通问 = 通道问题(通道);
  if (通问.length) throw new Error(`CDP 通道没有正面见证：\n - ${通问.join('\n - ')}`);
  console.log(`e2e-clear：页=${页地址.slice(0, 60)} 执行上下文=${通道.执行上下文} 加载完成=${通道.加载完成}`);
  // 基线取在**静置 + 见证之后、起跑之前**：此后上下文条数一旦变动，就是"页在中途被换过"的实锤
  基线上下文 = 通道.执行上下文;

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
  /**
   * **每一步吃了多少帧**（W-D4 切片9b）。
   *
   * 这一列数是 `E2E_BUDGETS` 那两格帧预算的唯一合法出处：手抄的绝对数 `12000` 正是 8a 那条红的
   * 另一半 —— 表从 44 行长到 78 行，预算一个字没动，于是"走不完"与"预算过期"两种红混在同一个数里。
   * 读的键是现成的：`qa._demoStep` 是执行器每一步开头写下的序号（面板那句"演示进行中 N"读的也是它），
   * 所以游戏侧不需要新增任何状态。
   *
   * **读数（r2 / r4 / r5 与变异臂的"空跑"四轮逐帧相同，`.tmp-20261031-s25/clear-r{2,4,5}.log`
   * + `arms9b/空跑.log`）**：全表 73 步**清一色 120 帧**，总计 8760 = 73 × 120。
   * 那个 120 里有这台量具的分辨率，不全是游戏的开销：一批 60 帧，
   * 而演示正是"每批往前走一步"（见上面那段"批内微任务不排空"），所以单步开销只能读成 60 的整数倍，
   * 地板是两批。**这就是把预算写成"每步 × 表长"而不是"一个绝对数"的理由** ——
   * 表长一动，两个数的关系当场就看得见；有人往某一步里塞一个 `wait(3)`，红话点名到步号。
   *
   * `跨`：一步一批就走完时，两批之间步号会一次 +2，那一段就混了两步的账。
   * 所以记的不是"这一步的帧"而是"这一段观察的帧 + 它覆盖了几步"，单步上限比的是**每步均帧**；
   * 实测四轮都是 计段=73 / 表长=73（一步一段，跨全是 1）。
   */
  const 步帧 = [];
  let 上一步 = 0;
  let 上一步帧 = 0;
  while (frames < E2E_BUDGETS.maxFrames) {
    await evalJs(`(() => { for (let i = 0; i < ${BATCH}; i += 1) window.__game.update(); return true; })()`);
    frames += BATCH;
    const st = await evalJs(`(() => {
      const qa = window.__game.questAssistant;
      const qs = window.__game.quests;
      return { running: !!qa.demoRunning, err: window.__e2e?.error ?? null,
        index: qs.questIndex, completed: !!qs.completed, 步: qa._demoStep };
    })()`);
    if (st?.err) throw new Error('演示里抛错：' + String(st.err).slice(0, 400));
    if ((st?.步 ?? 0) !== 上一步) {
      // 记的是**这一段里在跑的那一步**吃了多少帧（第一段是起跑，步号还是 0），
      // 以及这一段跨了几步（两批之间步号一次 +2 时，那一段是两个步的账）
      步帧.push({ 步: 上一步, 帧: frames - 上一步帧, 跨: Math.max(1, (st?.步 ?? 0) - 上一步) });
      上一步 = st?.步 ?? 0;
      上一步帧 = frames;
    }
    // 头一批不算数：起跑那个微任务要等本次 evaluate 返回才排空，
    // 所以"第一批之后 running 还是 false"是起跑还没发生，不是演示已经结束
    if (!st?.running && frames > BATCH) { 演示跑完 = true; break; }
  }
  if (上一步) 步帧.push({ 步: 上一步, 帧: frames - 上一步帧, 跨: 1 });

  // ④ 收尾读数：走到第几步、第几章、有没有通关，以及**卡在哪一行**（切片9b）
  const 读数 = await evalJs('(() => {'
    + 'const qs = window.__game.quests;'
    + 'const r = qs.current || null;'
    + 'return { index: qs.questIndex, completed: !!qs.completed, chapter: qs.chapter,'
    + '  卡: r ? { id: r.id, type: r.type, target: (r.target === undefined ? null : r.target),'
    + '    requires: (r.requires === undefined ? null : r.requires) } : null };'
    + '})()');

  // 主线步数 = 走到的下标 + （通关了再加一）。分母守卫：任务表被掏空时"通关"是空转
  const 主线步数 = 读数.index + (读数.completed ? 1 : 0);

  const 模拟秒 = Math.round(frames / 60 * 10) / 10;
  /** 单步的账：跨了几步的那一段按**每步均帧**算，否则"两批走了三步"会被读成"某一步吃了 180 帧" */
  const 有账 = 步帧.filter((x) => x.步 > 0);
  const 每步均 = (x) => Math.round(x.帧 / Math.max(1, x.跨));
  const 最贵 = 有账.sort((a, b) => 每步均(b) - 每步均(a)).slice(0, 3);
  console.log(`e2e-clear [读数] frames=${frames} 模拟时间=${模拟秒}s `
    + `questIndex=${读数.index} 主线步数=${主线步数} chapter=${读数.chapter} `
    + `completed=${读数.completed} 演示跑完=${演示跑完} exceptions=${exceptions.length}`);
  /**
   * 每步帧数与卡点身份**另起一行**（切片9b）。
   *
   * 为什么不能只塞进上面那一行：上面那行是"这轮算不算过"的证据，格式有人按子串读；
   * 下面两行是"过不了的话该去查哪一格"的证据。红话里只有 `questIndex=2` 的时候，
   * 8a 那一轮我花了整整一天才从内容表反推出"停在 `hub-catacombs`，因为演示不认识那七座副本" ——
   * 那个形状本来就在 `qs.current` 这一格里，是读数没去问它。
   */
  console.log(`e2e-clear [每步] 走到第${上一步}步 计段=${有账.length}/${E2E_DEMO_STEPS} `
    + `最贵三步=${最贵.map((x) => `${x.步}:${每步均(x)}帧${x.跨 > 1 ? `(跨${x.跨}步)` : ''}`).join(' ') || '(还没进第一步)'}`);
  if (!读数.completed) {
    console.log(`e2e-clear [卡点] ${读数.卡 ? `行="${读数.卡.id}" 型=${读数.卡.type} 目标=${JSON.stringify(读数.卡.target)} 前置=${JSON.stringify(读数.卡.requires)}` : '(任务系统没有当前行)'}`);
  }
  已交账 = true; // [读数] 那行已经打出去了 —— 这一轮从此有结论，两道闩就此闭嘴
  if (exceptions.length) console.log('e2e-clear [异常] ' + exceptions.slice(0, 5).join(' | '));

  /**
   * **这一轮从头到尾是同一个页吗**（切片6d，#167）—— 问在算越线之前。
   *
   * 顺序要紧：整张推导步表是靠几百次 `evalJs` 打在同一个页面上跑完的。中途有人往 `src/` 写了一下
   * ⇒ vite 发全量重载 ⇒ `window.__game` 变回 undefined ⇒ 最先红的是一句 `TypeError: … reading 'quests'`，
   * 它读起来像"主线第 N 步坏了"，实际是这一轮的页被换掉了。就算它没红、跑到了这里，
   * 那 `questIndex` 也不是从同一个页里读出来的 —— 把它和预算比再报"退出码 1"，是把环境问题记到代码头上。
   */
  const 重问 = 重载问题(基线上下文, 通道.执行上下文);
  if (重问.length) {
    // 带个标记抛出：catch 里那条"归因"是给**别的原因**准备的（TypeError 那类），
    // 这一条自己已经说全了，不该再被复述一遍当成第二个结论
    const 废 = new Error(`本轮读数作废：\n - ${重问.join('\n - ')}\n谁动的：\n - ${vite话()}`);
    废.读数作废 = true;
    throw 废;
  }

  const 预算 = E2E_BUDGETS;
  const 越线 = [];
  if (预算.requireCompleted && !读数.completed) {
    越线.push(`主线没走完：questIndex=${读数.index} chapter=${读数.chapter}（演示${演示跑完 ? '停了' : '没停'}）`);
  }
  if (主线步数 < 预算.minMainlineSteps) {
    越线.push(`主线只有 ${主线步数} 步（下限 ${预算.minMainlineSteps}）—— "通关"是空转`);
  }
  if (frames >= 预算.maxFrames) {
    // 预算是"每步 × 表长"推出来的，所以这句话只剩一个含义：**有一步不往前走**。
    // （老写法是一个手抄的 12000：表从 44 行长到 78 行时它同时兼容"走不完"与"预算过期"两种红。）
    越线.push(`推帧 ${frames} 耗尽预算 ${预算.maxFrames}（= 每步 ${预算.framesPerStep} × 表长 ${E2E_DEMO_STEPS}）`
      + ` —— 有一步不往前走，看上面 [每步] 那行最贵的是哪一步`);
  }
  // 单步上限：总量那条要等整表跑完才红，这一条点名到步号（切片9b）
  if (最贵.length && 每步均(最贵[0]) > 预算.maxStepFrames) {
    越线.push(`第 ${最贵[0].步} 步每步均 ${每步均(最贵[0])} 帧 > 单步上限 ${预算.maxStepFrames}`
      + `（该段实测 ${最贵[0].帧} 帧 / 跨 ${最贵[0].跨} 步；实测全表清一色 120 = 两批，一批 60 帧）`);
  }
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
  // 中途被重建时，最先红的**总是**某一句 evalJs 的 TypeError（`reading 'quests'`），
  // 它读起来像主线坏了。这一句把责任挪回它该在的地方：不是这一轮的代码，是这一轮的页。
  if (!err?.读数作废) {
    const 归因 = 重载问题(基线上下文, 通道.执行上下文);
    if (归因.length) console.error(`e2e-clear 归因：\n - ${归因.join('\n - ')}\n谁动的：\n - ${vite话()}`);
  }
  failures = 2;
} finally {
  cleanup();
  setTimeout(() => process.exit(failures), 300);
}
