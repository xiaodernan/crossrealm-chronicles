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
 * 退出码：`1` = 越预算（量到了，而且贵了）；`2` = 环境一侧的红 —— 口/页/通道不成、
 * 某一站没交出读数、或**这一轮的页在中途被重建**（切片6d：那批数作废，不拿去比预算）。
 * 将来接进 CI（W-D4 切片3）时就是红绿的来源。
 */
import { spawn, spawnSync } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PERF_BUDGETS, overCeiling, missingCeilings, extraCeilings, 过期格 } from './perf-budgets.mjs';
import { draw读数问题, 普查读数问题, cpu读数问题, 覆盖问题, 解析CDP口, 页地址问题, 通道问题, 重载问题 } from './harness-readings.mjs';
import { WORLD_SEED, worldSeedSource } from './world-seed.mjs';

/**
 * 预算表在 `./perf-budgets.mjs` —— **判据与执行分家**（W-D4 切片3 修）。
 *
 * 本文件是"导入即执行"的（顶层就起 vite 与 Chrome）。此前门禁为了拿这张表
 * `import` 了本文件，于是 `npm test` 里真跑了一遍性能冒烟，还多出一条
 * `process.exit unexpectedly called` 的未捕获异常。**本文件不导出任何东西**，
 * 谁想拿判据就去 `perf-budgets.mjs`。
 */

const VITE_PORT = 5321;
/**
 * CDP 口交给 **Chrome 自己挑**（W-C2 切片6b，#165）。
 *
 * 此前这里写的是 `const CDP_PORT = 9424`，配一段"开跑前先探这个口是不是空的"。占口检查
 * 把那批红变**响**了，但没把它变**准**：`--remote-debugging-port=9424` 在端口被占时
 * Chrome **不报错，只是不开这个口**，于是脚本只剩两种结局 —— 红成"CDP 口没起来"（2026-10-21
 * 连撞四次：`.tmp-wc2s5/perf-r2.log`、`perf-r5.log`、`perf-r7.log`、`perf-nb2.log`，
 * 都是 123~126 字节、一句 `Chrome CDP 口没起来`、退出码 2），或者更坏的一种：探口探到**别人**
 * 那台 Chrome 上，然后在它那个 profile / 那套启动参数里跑我们这一轮 —— 读数不再属于这台浏览器。
 *
 * `=0` 之后口由 Chrome 挑一个真空闲的，再通过它自己的 stderr 交回来（`DevTools listening on ws://…`）。
 * 于是"口是从**我 spawn 的那个进程**的 stderr 里读出来的"由构造成立：既撞不上别人的口，
 * 也不可能连到别人的浏览器。解析与拒绝在 `./harness-readings.mjs`（判据与执行分家）。
 */
const CDP_SPEC = 0;

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

/**
 * **开跑前先看这两个口是不是空的**（2026-10-20 加的，起因是两次假红）。
 *
 * 症状：连着两轮 `npm run perf` 红，一轮报"Chrome CDP 口没起来"、一轮报"游戏 30 秒内没起来"，
 * 而代码根本没动。查下来是上一轮泄漏的无头 Chrome 还占着 9424：Chrome 发现口被占时
 * **不报错，只是不开这个口**，于是脚本探的是自己那个从没听过的浏览器；更坏的一种是
 * 探口探到了**别人**的 Chrome 上，在它那个 about:blank / 别的构建的页里等 `window.__game`，
 * 最后红成"游戏没起来" —— 把责任错记到刚改的代码上。vite 那一侧同理：`--strictPort`
 * 会让自家服务起不来，但探口那一下会连到外来的 vite，读到的是另一个工作树的构建。
 *
 * 所以这里反过来用同一把尺子：**探得通 = 有人占着 = 这一轮不作数**，当场拒掉并说清是哪一口。
 * 修之前"空口"与"别人的口"两种情形走的是同一条代码，红的原因却完全不同。
 */
async function 口被占(端口) {
  try {
    await fetch(`http://127.0.0.1:${端口}/`, { signal: AbortSignal.timeout(800) });
    return '有人在这个口上应答（不是本脚本起的）';
  } catch (e) {
    const 码 = e?.cause?.code ?? e?.code ?? '';
    if (/ECONNREFUSED|ENOTFOUND/.test(String(码))) return null; // 真空着
    if (e?.name === 'TimeoutError' || /UND_ERR_CONNECT_TIMEOUT/.test(String(码))) {
      return '连得上但不答话（有东西在听这个口）';
    }
    return `探测失败：${码 || e?.message}`;
  }
}

// 直接用当前 node 调 vite.js：Windows 上 spawn .cmd 要开 shell（引号/quoting 风险），绕开它
//
// `--host 127.0.0.1` 是**必须**的，不是可选优化：vite 缺省只听 `localhost`，
// 而在 Windows 上 `localhost` 先解析到 IPv6 的 `::1` —— 于是"起 dev 口"成功、
// 脚本拿 `http://127.0.0.1:5321/` 去探却**超时**（实测：探 localhost 200、探 127.0.0.1 超时）。
// 症状是"游戏 30 秒内没起来" + 页面错误 0 条 —— 一次把责任错记到构建上的假红。
// 显式把口绑到 IPv4 回环，脚本探什么、浏览器开什么、vite 听什么，三者逐字对齐。
/**
 * 占口检查的**重试形状**：分两种占法。
 * - 有人在**应答** ⇒ 那是别人的 vite / 别人的浏览器，等多久都不会变成我的 ⇒ 当场拒。
 * - 连得上但**不答话** ⇒ 是上一轮自己那份正在断气（`taskkill /F` 之后 socket 关掉要一点时间）
 *   ⇒ 给它一个有限的等待窗口；窗口过了还答不上来，也照样拒（不猜）。
 * 2026-10-20 实测：连跑两轮时第二轮就撞上这个窗口，红成"CDP 口没起来"的前身。
 */
async function 等口空(端口, 等待毫秒 = 12000) {
  const 截止 = Date.now() + 等待毫秒;
  for (;;) {
    const 由 = await 口被占(端口);
    if (!由) return null;
    if (!/不答话/.test(由)) return 由;
    if (Date.now() >= 截止) return `${由}（等了 ${Math.round(等待毫秒 / 1000)} 秒仍在听）`;
    await sleep(500);
  }
}

/**
 * 占口检查的**重试形状**：分两种占法。
 * - 有人在**应答** ⇒ 那是别人的 vite，等多久都不会变成我的 ⇒ 当场拒。
 * - 连得上但**不答话** ⇒ 是上一轮自己那份正在断气（`taskkill /F` 之后 socket 关掉要一点时间）
 *   ⇒ 给它一个有限的等待窗口；窗口过了还答不上来，也照样拒（不猜）。
 * 2026-10-20 实测：连跑两轮时第二轮就撞上这个窗口，红成"CDP 口没起来"的前身。
 *
 * **只剩 dev 口要查**（切片6b）：CDP 那上口现在由 Chrome 自己挑（`--remote-debugging-port=0`），
 * 挑中的那一刻它就是空的，没什么可查 —— 那一侧"连到别人浏览器"的可能由构造消失。
 * vite 这一侧不能同样放手：浏览器打开的就是 `http://127.0.0.1:5321/`，
 * 连到外来 vite = 读到另一个工作树的构建，而那仍然会是一次**绿**的红。
 */
const 被占的口 = [];
for (const [名, 口] of [['dev 口 (vite)', VITE_PORT]]) {
  const 由 = await 等口空(口);
  if (由) 被占的口.push(`  ${名} 127.0.0.1:${口} —— ${由}`);
}
if (被占的口.length > 0) {
  console.error('perf-smoke 拒绝开跑：dev 口不是空的。\n' + 被占的口.join('\n')
    + '\n占口的是上一轮泄漏的 vite —— 这一轮会连到它的进程上，读数不再属于这个工作树。');
  process.exit(2);
}
const viteBin = join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
const vite = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'],
  { stdio: 'ignore', cwd: process.cwd() });

const chromePath = findChrome();
if (!chromePath) {
  console.error('perf-smoke: 找不到 Chrome（可用 CHROME 环境变量指定路径）');
  拔树(vite);
  process.exit(2);
}
const profileDir = join(tmpdir(), `perf-smoke-${Date.now()}`);
/** 浏览器自己报的话（stderr 为主，stdout 一起收 —— 有的构建把 DevTools 行打到 stdout） */
const 浏览器输出 = [];
const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${CDP_SPEC}`,
  `--user-data-dir=${profileDir}`,
  '--no-first-run',
  '--disable-gpu',
  // 无头页被当后台页时 rAF 会被节流到几乎不跑（实测出现过 18 秒的帧距）——三连禁用
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
chrome.stderr.on('data', (b) => 浏览器输出.push(String(b)));
chrome.stdout.on('data', (b) => 浏览器输出.push(String(b)));

/**
 * 从 Chrome 自己的话里取回它挑中的口（有界等待，取不到就带上 stderr 摘要红）。
 *
 * 这一句是整条腿的**来源证明**：口不是我们猜的、也不是探出来的，是**我 spawn 的那个进程**
 * 亲口报的。25 秒的上限是给 CI 的 —— 没有上限，一次 Chrome 起不来就变成挂住而不是红。
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
 * 2026-10-20 实测：`npm run perf` 正常跑完（PERF-EXIT=0）之后，它起的无头 Chrome 还活着，
 * 9424 还 LISTENING —— `child.kill()` 在 Windows 上只终止**那一个** PID，而 headless Chrome
 * 有一整棵子进程（crashpad、renderer、utility），主进程被孤儿们钉住不走。
 * 后果不是"脏"而是**假红**：下一轮脚本连到上一轮的浏览器上，红成"游戏 30 秒内没起来"，
 * 责任落在一次根本没改过的代码上（前面那两条占口拒就是把这种红变成当场可归的红）。
 *
 * 用 `taskkill /T /F /PID <我们 spawn 的那个 PID>`：只杀自己那棵树，PID 来自本次 spawn，
 * 不搜进程名（搜名字会打到别人并行跑的 Chrome/vite 上）。
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
 * 事件通道的**自证**（切片6b）+ 中途重载的**基线**（切片6d，#167）。
 *
 * 数两样一定会来的东西（`Runtime.enable` 会 flush 现存执行上下文；导航后必有 load）：
 * `exceptions.length` 那一格判的是"0 条"，而"通道一条都没送"与"页面真的没抛"读出来是同一个 0。
 * 不这么钉，这条预算格可以在通道断掉的情况下永远绿。
 *
 * 这个对象**声明在 try 外面**是 6d 要的：红的时候最有用的一句话在 catch 里 ——
 * 中途有人往 `src/` 写了一下 ⇒ vite 发全量重载 ⇒ `window.__game` 变回 undefined ⇒
 * 下一句 `evalJs` 红成 `TypeError: … reading 'player'`，看着像代码坏了，其实是这一轮的量被换掉了。
 * catch 要能问"上下文条数动过没有"，计数器就得活在它看得见的作用域里。
 */
const 通道 = { 执行上下文: 0, 加载完成: 0 };
/** 测量开始前的上下文条数；`null` = 还没走到见证，那一段的红不归"重载"管（不拿没证过的东西说话） */
let 基线上下文 = null;

let failures = 0;
try {
  if (!await waitForHttp(`http://127.0.0.1:${VITE_PORT}/`)) throw new Error('dev 口 20 秒内没起来');
  const { 口: CDP口, 浏览器ws } = await 读CDP口();
  console.log(`perf-smoke：Chrome 报出自己的口 ${CDP口}（${浏览器ws.slice(0, 46)}…）`);

  const targets = await (await fetch(`http://127.0.0.1:${CDP口}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  /** 点名目标的清单：连不上页时"CDP 口没起来"这句太粗 —— 口是通的，缺的是页 */
  if (!page) {
    throw new Error(`CDP 口 ${CDP口} 通了但 /json/list 里没有 page 目标：${JSON.stringify(targets).slice(0, 300)}`);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let msgId = 0;
  const pending = new Map();
  const exceptions = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params?.exceptionDetails?.text ?? '?');
    else if (m.method === 'Runtime.executionContextCreated') 通道.执行上下文 += 1;
    else if (m.method === 'Page.loadEventFired') 通道.加载完成 += 1;
  };
  const send = (method, params = {}) => new Promise((res) => {
    const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params }));
  });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) {
      // 把**页面里那句话**带出来：抽 JSON 前 300 字会正好切掉 description（异常自己的话），
      // 于是红只会说"页面内抛错"，责任落不到具体那条拒上（2026-10-20 第一次真跑就这样瞎了一次）。
      const d = r.result.exceptionDetails;
      const 原话 = d.exception?.description ?? d.exception?.value ?? d.text ?? '?';
      const 位置 = `${d.url || '页内'}:${(d.lineNumber ?? -1) + 1}:${d.columnNumber ?? '?'}`;
      throw new Error(`页面内抛错 @${位置}：${String(原话).split('\n')[0].slice(0, 400)}`);
    }
    return r.result?.result?.value;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  /**
   * 世界种子先于任何页面模块注入（W-C2 尾巴 / B125 同源）：否则每次重载都换一份
   * 碎石与障碍的散布，draw call 上限表里那块"跨世界噪声"永远收不掉。见 `./world-seed.mjs`。
   */
  await send('Page.addScriptToEvaluateOnNewDocument', { source: worldSeedSource(WORLD_SEED) });
  console.log(`perf-smoke：世界种子 ${WORLD_SEED}（这一轮的散布可复现）`);
  await send('Page.navigate', { url: `http://127.0.0.1:${VITE_PORT}/` });

  let ready = false;
  /**
   * 开机窗口 120 秒（不是 30 秒）：`.tmp-20261020-wc2s5/why-no-game.mjs` 在同一条 dev 口上量到过
   * `window.__game` 要 **57.5 秒**才出现（vite 冷缓存按需转译 ~300 个模块，每个的 duration 是排队
   * 时间而不是编译时间）。30 秒那一档红的是缓存，不是代码 —— 而这一条腿将来要进 CI（W-D4 切片3），
   * CI 的 node_modules/.vite 每轮都是冷的。普查侧（`.tmp-wc2s5/census.mjs`）早就放宽到 120 秒，
   * 两边同一把尺。
   */
  for (let i = 0; i < 240 && !ready; i += 1) {
    await sleep(500);
    ready = await evalJs('!!window.__game && !!window.__game.enemyManager');
  }
  if (!ready) throw new Error('游戏 120 秒内没起来');

  /**
   * **这个页就是这一轮起的那个页**（切片6b）。
   *
   * 口是从自己孩子的 stderr 读回来的，理论上不该再连错；但"页"是 `/json/list` 里挑的第一个
   * `type === 'page'`，同一台浏览器里可能同时有别人开的页。地址必须落在**本进程的 vite 口**上，
   * 否则下面那 10 个站点量的是别人的构建 —— 又一次绿的红。
   *
   * 判据住在 `./harness-readings.mjs`：写在这里的话，门禁只能拿正则数一遍字符串，
   * "把 `if` 改成 `if (false)`"那种臂照样绿（2026-10-22 电池实测 A4/A5 两条作废就是这么来的）。
   */
  const 页地址 = await evalJs('location.href');
  const 页问 = 页地址问题(页地址, VITE_PORT);
  if (页问.length) throw new Error(`连到的页不对：\n - ${页问.join('\n - ')}`);
  const 通问 = 通道问题(通道);
  if (通问.length) throw new Error(`CDP 通道没有正面见证：\n - ${通问.join('\n - ')}`);
  console.log(`perf-smoke：页=${页地址.slice(0, 60)} 执行上下文=${通道.执行上下文} 加载完成=${通道.加载完成}`);
  // 基线取在**见证之后、第一站之前**：此后上下文条数一旦变动，就是"页在中途被换过"的实锤
  基线上下文 = 通道.执行上下文;

  /**
   * 一站读数：手工推帧（真 `game.update()` + 真 `game.render()`），量 CPU 耗时。
   *
   * 不用真实 rAF：无头页的帧由合成器供给，页面不被认为可见时 rAF 会被饿到几乎不跑
   * （实测出现过 18 秒的单帧距），那种读数量的是节流不是游戏。推帧是确定性的：
   * 240 帧 × (update 单独记一次账 + update+render 全帧记一次账)，60 帧一批喂给 CDP 免超时。
   *
   * 批数与每批帧数是**这里**的两个数，"应有帧数"由它们推（不另抄一个 240）：
   * 有一批 evalJs 没回来时，交出的帧数会短，而短样本上的 `均值` 只会变小或变 NaN ——
   * 预算表那几条 `>` 抓不到 NaN（`NaN > 40` 是 false），于是这一轮会**绿在缺样上**。
   * 所以每一站交出之后先问 `cpu读数问题`，不合格就点名站点抛（读数作废，不是"记为通过"）。
   */
  const 计时批数 = 4;
  const 每批帧数 = 60;
  const 应有帧数 = 计时批数 * 每批帧数;
  const 站 = async (名字, 表达式) => {
    await evalJs(表达式);
    await sleep(800); // 等传送/场景切换的尖刺过去再开始计时
    const batches = [];
    for (let b = 0; b < 计时批数; b += 1) {
      batches.push(await evalJs(`(() => {
        const 只更新 = [];
        for (let i = 0; i < ${每批帧数}; i += 1) {
          const t0 = performance.now();
          window.__game.update();
          只更新.push(performance.now() - t0);
        }
        return 只更新;
      })()`));
    }
    // 全帧账单独一批：update + render 合起来量（软渲染的 render 是大头，分开两批避免相互干扰）
    const 全帧批 = [];
    for (let b = 0; b < 计时批数; b += 1) {
      全帧批.push(await evalJs(`(() => {
        const 帧耗时 = [];
        for (let i = 0; i < ${每批帧数}; i += 1) {
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
    const 问 = cpu读数问题(名字, r, 应有帧数);
    if (问.length) throw new Error(`站点「${名字}」的 CPU 腿不是一次测量：\n - ` + 问.join('\n - '));
    console.log(`perf-smoke [${名字}] frames=${r.frames} updateAvg=${r.updateAvgMs}ms updateP95=${r.updateP95Ms}ms frameAvg=${r.frameAvgMs}ms`);
    return r;
  };

  const 枢纽 = await 站('枢纽空载', 'window.__game.player.teleport(0, 0, 55)');
  const 森林 = await 站('灰白森林', 'window.__game.player.teleport(-200, 0, 0)');

  /**
   * ## draw call 腿（W-C2 切片4，#157）—— 放在 CPU 计时之后，因为这一腿要拧阴影开关
   *
   * 站点名单、配方与上限全部来自 `src/engine/drawCallBudget.js`（PerfHUD 读同一份），
   * 脚本自己**不发明数**。每站三列：整帧（场景趟 + bloom/DoF/输出趟，B93 的口径）、
   * 关掉 `shadowMap.enabled` 之后的本体+后处理、两者的差 = 阴影那一趟。
   *
   * **取账方式与 2026-10-18 的 `.tmp-20261018-b94/remeasure.mjs` 逐字一致**（钉时刻 →
   * update → `info.reset()` → `render()`），那批读数（151–918）就是本表上限的来源 ——
   * 口径换一套，等于拿另一把尺子量同一张桌子。
   *
   * **坐标不抄**（B120 / B121 那一课）：站点名单里只有 id，坐标在页面里从
   * `world.zones` 里那一实例自己的 `center` 读（枢纽读 `HUB_ZONE.center`）。
   * 抄一份坐标 = 区域一搬家抄本烂在原地，而门禁还绿着。
   *
   * 四处当场拒（读数作废，而不是"记为通过"）：
   * ① 站点 id 在世界里找不到（名单与世界分家）；② 站过去落在了别的区；
   * ③ `timeOfDay` 没钉住；④ **阴影趟为 0**（说明那个开关根本没改变这帧 —— 三列账就是假的）。
   * 另有一条**世界侧的对账**：世界里有的区不在站点名单里 ⇒ 当场抛
   * （加了新区域却没进 `ZONE_ORDER`，那一站会被静默跳过 = 静默放开）。
   *
   * 切片10 加上**第五拒**：阴影趟另有第二把尺 —— 按 three 的阴影趟规则**数**出来的笔数
   * （`src/engine/shadowCensus.js`）。它必须等于"冻结对"（中间不 `update()` 的两趟）减出来的那个数；
   * 不等 ⇒ 这一站的阴影列不可解释，作废。
   *
   * 切片11（B152）把**越预算那一格换成吃这把尺**：`shadow` 上限比的是数出来的 `阴影趟`，
   * 不再比 `整帧 − 本体` 那个差 —— 差的两趟之间隔着一次 `update()`，主趟剔除集合跟着动，
   * 那 33 个 call 的漂移就被记成"阴影涨了 33"。整帧 / 本体两列仍比报告列（它们各自是一趟的
   * 直接读数，不是差）。报告列的 `阴影` 继续算、继续打（三列自洽那条判据要它，账本也记它），
   * 只是它不再决定红绿。
   */
  const 名册 = PERF_BUDGETS.drawCalls;
  const 配方串 = JSON.stringify(名册.recipe);
  const 枢纽中心 = JSON.stringify(名册.hubCenter);
  const draw读数 = [];
  /** 地板过期的点名（切片13，B156）：只进这一轮的日志，**不进退出码** —— 理由见循环里那一段 */
  const 地板过期 = [];
  for (const 站id of 名册.stationIds) {
    const 源 = `(async () => {
      const g = window.__game, i = g.renderer.info;
      const 站id = ${JSON.stringify(站id)};
      const 配方 = ${配方串};
      const 枢纽 = ${枢纽中心};
      // 坐标：枢纽读静态描述，其余从世界里那一实例自己的 center 读（不抄）
      let x, z;
      if (站id === 'hub') { x = 枢纽.x; z = 枢纽.z; }
      else {
        const 找 = (g.world.zones || []).find((Z) => Z.id === 站id);
        if (!找) throw new Error('世界里没有 id 为 "' + 站id + '" 的区 —— 站点名单与世界分家了');
        x = 找.center.x; z = 找.center.z;
      }
      const y = g.world.getGroundHeight(x, z);
      if (!Number.isFinite(y)) throw new Error('站点 ' + 站id + ' 的地面高度非有限：' + y);
      g.player.teleport(x, y + 0.1, z, { yaw: 配方.yaw, pitch: 配方.pitch });
      const 钉 = () => { g.timeOfDay = 配方.timeOfDay; };
      钉(); g.update();
      for (let k = 0; k < 配方.settleFrames; k += 1) { 钉(); g.update(); }
      // 每一趟的取账顺序：update() → 钉时刻 → info.reset() → render()。
      // 钉时刻必须放在 update **之后**、render **之前**：update() 每帧都把昼夜往前推一步
      // （updateDayNight 里 timeOfDay + dt * 0.005，Game.js:1115），所以"钉完再 update"之后
      // 读到的时刻**永远**不等于配方 —— 这条拒会在第一个站点就红，量的是算式不是游戏。
      // 2026-10-20 第一次真跑就是这个红。
      // 与 2026-10-18 那批（.tmp-20261018-b94/remeasure.mjs）的差别只有一步：那边的序是
      // 钉 → update → reset → render，渲染时字段上是"配方 + 一步"（≤ 0.00025，钳在 maxDelta 0.05），
      // 光照差在小数点后第四位。这里要的是**精确相等**的拒 —— 不容差，因为容差只会变成
      // 下一个红之后被放宽的那个数。
      const 一趟 = () => {
        g.update();
        钉();
        const 钉住的 = g.timeOfDay;
        i.reset();
        g.render();
        if (钉住的 !== 配方.timeOfDay || g.timeOfDay !== 钉住的) {
          throw new Error('timeOfDay 没钉住（render 前 ' + 钉住的 + ' / render 后 ' + g.timeOfDay
            + ' / 配方 ' + 配方.timeOfDay + '）—— 这一帧的时刻不属于配方，读数作废');
        }
        return { calls: i.render.calls, triangles: i.render.triangles };
      };
      const 整帧 = 一趟();
      g.renderer.shadowMap.enabled = false;
      const 本体 = 一趟();
      g.renderer.shadowMap.enabled = true;
      if (g.renderer.shadowMap.enabled !== true) {
        throw new Error('阴影开关没拧回来（回读 ' + g.renderer.shadowMap.enabled + '）—— 后面的站都会带着这把坏尺子');
      }
      // 阴影普查（切片10，B151）：数出来的那一趟必须等于「中间不 update()」的两趟减出来的那一趟。
      // 冻结对只钉时刻 + 渲染，两趟之间唯一变的东西是 shadowMap.enabled，所以差值就是阴影趟本身。
      // 普查必须在拧着「开」的那一帧之后做：关着数会 0 == 0 空对空。判据在 ./harness-readings.mjs。
      const 普查源 = await import('/src/engine/shadowCensus.js');
      const 不推 = () => {
        钉();
        const 钉住的 = g.timeOfDay;
        i.reset();
        g.render();
        if (g.timeOfDay !== 钉住的) {
          throw new Error('timeOfDay 在"只渲染不推帧"的趟里被改掉了（' + 钉住的 + ' → ' + g.timeOfDay + '）—— 冻结对的前提不成立，阴影普查作废');
        }
        return i.render.calls;
      };
      const 冻结开 = 不推();
      const 普查 = 普查源.阴影件普查(g.scene, g.camera, g.renderer);
      g.renderer.shadowMap.enabled = false;
      const 冻结关 = 不推();
      g.renderer.shadowMap.enabled = true;
      if (g.renderer.shadowMap.enabled !== true) {
        throw new Error('阴影开关在冻结对之后没拧回来（回读 ' + g.renderer.shadowMap.enabled + '）—— 后面的站会带着这把坏尺子');
      }
      const 区 = g.world.currentZone && g.world.currentZone.id;
      if (区 !== 站id) throw new Error('站点 ' + 站id + ' 现在落在 "' + 区 + '" 区里 —— 坐标与世界分家了，这批读数作废');
      // 页龄见证（切片12，B154）：地上此刻有几件掉落、场景里有多少可画件。
      // 掉落三件套的寿命 DROP_LIFE 走的是 dt（真实时间）而不是钉住的 timeOfDay ⇒ 同一份世界
      // 随页龄能少画 20–40 个 call，而数出来的阴影列一个都不少（那些件本来就不投影）。
      // 这两份数不参与达标，只当见证：下一轮读数再差 25 个 call，看这一行就知道是内容涨了还是这一页耗尽了。
      if (!g.loot || !Array.isArray(g.loot.drops)) {
        throw new Error('页面上没有 g.loot.drops —— 掉落这份见证没处取（这一列是页龄的尺子，缺了它下一次归因只能重跑探针）');
      }
      let 可画件 = 0;
      const 数可见 = (o) => {
        if (o.visible === false) return;
        if (o.isMesh || o.isLine || o.isPoints || o.isSprite) 可画件 += 1;
        for (const c of o.children) 数可见(c);
      };
      数可见(g.scene);
      return {
        区, 整帧: 整帧.calls, 本体: 本体.calls, 阴影: 整帧.calls - 本体.calls, 三角面: 整帧.triangles,
        掉落: g.loot.drops.length, 可画件,
        // 越预算的那一列（B152）：上限吃的是**数出来的笔数**，不是上面那个差。
        // 差仍然交出去 —— 三列自洽那条判据（阴影 = 整帧 − 本体）问的是它，账本也记它。
        阴影趟: 普查.预测,
        冻结阴影: 冻结开 - 冻结关,
        普查: {
          预测: 普查.预测, 框内件数: 普查.框内件数, 可投件数: 普查.可投件数,
          榜: 普查.榜.slice(0, 40), 光源: 普查.光源, 问题: 普查.问题,
        },
      };
    })()`;
    const r = await evalJs(源);
    /**
     * 三列都得是数，而且得自洽（判据在 `./harness-readings.mjs`，脚本这里只负责"不合格就作废"）。
     * 原先这一腿只问 `r.阴影 > 0` 一条：`整帧`/`本体` 读到 NaN、`tri` 读到 0、
     * 差值列不再等于两列之差 —— 那些都会照常打出一行日志并往下走。
     */
    const 问 = draw读数问题(站id, r);
    if (问.length) throw new Error(`站点 ${站id} 的 draw call 腿不是一次测量：\n - ` + 问.join('\n - '));
    /**
     * 阴影列的第二把尺（切片10）：**数出来的**必须等于**冻结对减出来的**，否则这一站的阴影列
     * 不可解释 —— 要么模型漏了 three 的一条规则，要么渲染本身在动世界。判据在 `./harness-readings.mjs`。
     */
    const 普问 = 普查读数问题(站id, r.普查, r.冻结阴影);
    if (普问.length) throw new Error(`站点 ${站id} 的阴影普查对不上账：\n - ` + 普问.join('\n - '));
    const 读数 = { 站: 站id, ...r };
    draw读数.push(读数);
    const 上 = 名册.ceilings[站id];
    const 上串 = 上 ? `（上限 ${上.frame}/${上.body}/${上.shadow}）` : '（名册里**没有这一站**）';
    console.log(`perf-smoke [draw call|${站id}] 整帧=${r.整帧} 本体=${r.本体} 阴影=${r.阴影} 阴影趟=${r.阴影趟} tri=${r.三角面} 掉落=${r.掉落} 可画=${r.可画件} ${上串}`);
    /**
     * **地板逐格对照**（W-C2 切片13，B156）：这一轮的读数里哪几格读出了新高。
     *
     * 这一句以前**没有人问**。地板只活在测试文件的一份局部常量里，于是"地板过期"这件事只能靠
     * 人读注释发现 —— B154 就是这么从 10-24 烂到 10-29 的（十格超地板，套件全绿）。
     * 现在门自己比：读数 > 地板 ⇒ 当场点名那一格。
     *
     * **不改退出码**（判据在 `src/engine/drawCallBudget.js` 的 `过期格`，与上限的 `overCeiling` 分家）：
     * 越线那一半才是性能回归；这里说的是**这张表的出处**需要重钉。世界在动不是代码的红 ——
     * 把它记成红，下一轮就有人学会把红当噪声跳过；记成日志里一行带站点与那一格读数/地板的⚠，
     * 这一轮的输出（本仓那一族一直叫它"账本"）里就留得住。
     */
    const 过 = 过期格(读数, 名册.floors);
    地板过期.push(...过);
    for (const 句 of 过) console.log(`perf-smoke ⚠ ${句}`);
    console.log(`perf-smoke [阴影普查|${站id}] 数出来=${r.普查.预测} 冻结减出来=${r.冻结阴影} 报告减出来=${r.阴影}`
      + ` 框内 ${r.普查.框内件数} 件 / 可见可投 ${r.普查.可投件数} 件 光源=${r.普查.光源.map((L) => L.名 + '→' + L.绘 + (L.跳过 ? '(跳过:' + L.跳过 + ')' : '')).join(',')}`);
    if (r.阴影 !== r.普查.预测) {
      // 报告列与数出来的不等 **不是**坏读数：报告列的两趟之间隔了一次 update()，主趟的剔除集合跟着动，
      // 那 4 个 call 的差就在本体趟里（B152）。这里只点名、不放宽上限、也不作废 —— 作废会把"世界在动"记到代码头上。
      // 自 B152 起越预算比的是 `阴影趟`（数出来的那一列），这句话只进账本，不再解释上限的红。
      console.log(`perf-smoke [阴影普查|${站id}] ⚠ 报告列比数出来的多/少 ${r.阴影 - r.普查.预测} 个 call —— 差在**本体趟**（两趟之间那次 update() 让主趟剔除集合变了），不在阴影趟。上限比的是数出来的那一列（阴影趟=${r.阴影趟}）。`);
    }
    console.log(`perf-smoke [阴影归属|${站id}] ${r.普查.榜.slice(0, 10).map(([k, v]) => k + '×' + v).join('  ')}`);
  }

  /**
   * **每一站都得真的交出读数**（切片6b）。上面两条对账查的是"表"：名册与上限表一不一致、
   * 世界与名册一不一致。这一条查的是**这一轮**：名册里有八站而 `draw读数` 只有七行，
   * 就是有一站被跳过了（今天没有 `continue`，但把 `for` 改成 `for (…of 名单.slice(0, 7))`
   * 或提前 break 都不会被任何一条现有判据抓住 —— 少一站只是少一行日志）。
   */
  const 覆盖 = 覆盖问题(名册.stationIds, draw读数);
  if (覆盖.length) throw new Error(`draw call 腿的站点覆盖不全（名册 ${名册.stationIds.length} 站 / 交出 ${draw读数.length} 份）：\n - ` + 覆盖.join('\n - '));

  // 世界侧对账：世界里有的区必须都在站点名单里。少一站 = 那一站被静默跳过 = 静默放开。
  const 世界的区 = await evalJs('(window.__game.world.zones || []).map((Z) => Z.id)');
  const 名单漏站 = 世界的区.filter((id) => !名册.stationIds.includes(id));
  if (名单漏站.length) {
    throw new Error(`世界里有区不在 draw call 站点名单里：${名单漏站.join(', ')} —— 那一站会被静默跳过（= 静默放开），先把它加进 ZONE_ORDER 与上限表`);
  }

  // 上限表自身的对账（判定函数与门禁共用一份，见 `src/engine/drawCallBudget.js`）
  const 缺站 = missingCeilings(名册.stationIds, 名册.ceilings);
  if (缺站.length) {
    throw new Error(`draw call 上限表缺站：${缺站.join(', ')} —— 那一站会被静默跳过（= 静默放开），先给它钉上限`);
  }
  const 多站 = extraCeilings(名册.stationIds, 名册.ceilings);
  if (多站.length) {
    throw new Error(`draw call 上限表多站：${多站.join(', ')} —— 给一个没测过的站发通行证，与漏一站同罪`);
  }
  /**
   * **地板表与名册同样要一一对应**（切片13，B156）。少一站 ⇒ `过期格` 只能报"地板表里没有这一站"，
   * 那一站的新高就永远没人知道；多一站 ⇒ 那张表里躺着一个已经不测的站，读起来像"有出处"其实是抄本。
   * 对账函数是通用的（吃一张表，不比上限），所以这里复用同一份判，不另写一条。
   */
  const 地板缺站 = missingCeilings(名册.stationIds, 名册.floors);
  if (地板缺站.length) {
    throw new Error(`draw call 地板表缺站：${地板缺站.join(', ')} —— 那一站的"读出新高"没人能判，地板对它等于不存在`);
  }
  const 地板多站 = extraCeilings(名册.stationIds, 名册.floors);
  if (地板多站.length) {
    throw new Error(`draw call 地板表多站：${地板多站.join(', ')} —— 给一个不在名册里的站留着一行出处，与多一格上限同罪`);
  }

  const heapMb = await evalJs('performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1');
  console.log(`perf-smoke [堆] usedJSHeap=${heapMb}MB exceptions=${exceptions.length}`);

  /**
   * **这一轮从头到尾是同一个页吗**（切片6d，#167）—— 问在算越线之前。
   *
   * 顺序要紧：如果页在中途被重建过，上面那些数就不是从同一个页里读出来的，
   * 此时把它们和预算比、然后报一句"越预算（退出码 1）"是把**环境问题记到代码头上**。
   * 作废要单独红、并且要说清怎么重跑（先让工作树安静）。
   */
  const 重问 = 重载问题(基线上下文, 通道.执行上下文);
  if (重问.length) {
    // 带个标记抛出：catch 里那条"归因"是给**别的原因**准备的（TypeError 那类），
    // 这一条自己已经说全了，不该再被复述一遍当成第二个结论
    const 废 = new Error(`本轮读数作废：\n - ${重问.join('\n - ')}`);
    废.读数作废 = true;
    throw 废;
  }

  const 预算 = PERF_BUDGETS;
  /**
   * **地板过期的总结行**（切片13，B156）：写在越线判定**之前**，让"退出码为什么是 1"仍然是日志最后一句
   * （CI 里看红的人只看末尾）。这一行**不参与 `failures`** —— 它说的是这张表的出处要重钉，
   * 不是这一轮的代码变慢了；两件事各有一行，谁也不许替谁红。
   */
  if (地板过期.length) {
    console.log(`perf-smoke 地板过期 ${地板过期.length} 格（**不改退出码**：越线那一半由上限守着，这里要的是把这张表的出处重钉一遍）：\n - ` + 地板过期.join('\n - '));
  }
  const 越线 = [];
  for (const r of draw读数) {
    越线.push(...overCeiling(r, 预算.drawCalls.ceilings));
  }
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
  // 中途被重建时，最先红的**总是**某一句 evalJs 的 TypeError（`reading 'player'`），
  // 它读起来像代码坏了。这一句把责任挪回它该在的地方：不是这一轮的代码，是这一轮的页。
  if (!err?.读数作废) {
    const 归因 = 重载问题(基线上下文, 通道.执行上下文);
    if (归因.length) console.error('perf-smoke 归因：\n - ' + 归因.join('\n - '));
  }
  failures = 2;
} finally {
  cleanup();
  setTimeout(() => process.exit(failures), 300);
}
