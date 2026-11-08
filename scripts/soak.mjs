/**
 * 稳定性浸泡门禁（W-E2 切片2）—— `npm run soak`。
 *
 * ## 这一片在量什么
 *
 * §1.4 的稳定性验收：「连续游玩 30 分钟，`renderer.info` 三项零增长；无未捕获异常」。
 * 此前没有机器量它：`perf-smoke` 两站各 240 帧（四秒游戏时间），`e2e-clear` 刻意不渲染，
 * B94 台账那句"30 分钟长跑待真机复测"从 2026-10-06 挂到现在。这一片起真游戏、真推帧、
 * 真渲染，跑满三十分钟**游戏时间**，在热身之后取基线、游玩之后再取终局，逐项对账。
 *
 * ## 为什么是"游戏时间"而不是墙钟三十分钟
 *
 * 与 e2e-clear 同一条口径：无头页的 rAF 会被合成器饿死（perf-smoke 头注记过 18 秒的单帧距），
 * 所以 `clock.getDelta` 钉成常量 1/60，由驱动器手工推 `update()` —— 一秒游戏时间 = 60 帧，
 * 三十分钟 = 108,000 帧。墙钟三十分钟量到的是软渲染的慢，不是游戏的长。
 *
 * ## 渲染为什么抽帧
 *
 * 软渲染一帧 80–900ms（perf 台账），逐帧渲染会把 108,000 帧拉成几小时；而泄漏是按
 * "每次入画/每帧"线性攒的，抽到 `--render-every`（默认 240 帧 = 4 秒游戏时间）之后
 * 仍有上千帧样本。**update 一帧不抽**，逻辑与生命周期全在跑。
 *
 * ## 路线（热身圈与每个游玩圈走同一条）
 *
 * 八站巡游（站点名单与配方来自 `src/engine/drawCallBudget.js` —— 不抄坐标，传送落点后
 * 还核对当前区就是该站），每站：每 8 秒一个微循环，回站心、走两秒（按住 W），然后站定
 * 打：每秒把准星转回最近的活敌、隔帧点左键、隔 300 帧回满血；奇数循环先传送到最近的活敌
 * 身边。然后五座 Boss 场各停一次
 * （场与 Boss 从 `enemyManager.arenas` 现读，坐标同样不抄）—— 第一章能开的三场会真开战，
 * 后两场的章节门槛会挡住（如实记，不硬开）。
 *
 * **热身圈不算游玩**：它把"首次入画/首次开战"的缓存推到稳态，基线取在热身之后 ——
 * 否则首圈的一次性加载会被记成泄漏。热身之后再静置复读一遍，基线自己还在涨就作废
 * （那是路线没热到位，不是游玩的账）。
 *
 * 镜头覆盖不到的场景静物是另一笔：热身之后再做一次**全场首绘**（六个轴向各画一帧
 * 170° 大锥，隐藏件临时翻成可见再翻回去），把"看见才上传"的几何/材质也推进基线。
 * 否则游玩段第一次转到某个方向，账上就多几条热身圈没看见的静物 —— 判定跟着当圈的
 * 追敌朝向走，红绿都不可复现（2026-10-29 校准实测 +13 条，溯源全是场景里的锥/环/柱）。
 *
 * ## 这一轮连的是哪台浏览器、哪个页、是不是同一个页到底
 *
 * 与 perf-smoke / e2e-clear 同一套（W-C2 切片6b/6c/6d）：CDP 口交给 Chrome 自己挑
 * （`--remote-debugging-port=0`，从**它自己孩子的 stderr** 里读回来），页地址必须落在
 * 本进程的 dev 口上，事件通道要有正面见证，`Runtime.executionContextCreated` 的条数
 * 从测量开始到结束必须不变 —— 变了就是页被重建过（共享工作树里最常见：别人往 `src/` 写了一下），
 * 整轮**作废**（退出码 2），而不是把两截页的读数拿去比。
 *
 * 这四个判据都在 `./harness-readings.mjs`；本片的判据（参数 / 计划 / 快照 / 增长 / 覆盖）
 * 在 `./soak-readings.mjs` —— 判据与执行分家，`npm test` 不跑浏览器。
 *
 * ## 退出码
 *
 * `0` 三十分钟跑满、三项零增长、异常 0；
 * `1` 量到了而且越线（资源增长 / 有未捕获异常 / 行程没跑满）；
 * `2` 环境一侧的红（口被占、Chrome/vite/页起不来、页中途被重建、热身之后基线仍未稳态）。
 *
 * 用法：`npm run soak`（默认 30 分钟游玩）；校准用 `npm run soak -- --minutes=2`。
 */

import { spawn, spawnSync } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PERF_BUDGETS } from './perf-budgets.mjs';
import {
  SOAK_COLUMNS, parseSoakArgs, planSoak, snapshotProblem, growthProblem, programFamilyProblem, journeyProblem,
} from './soak-readings.mjs';
import { 解析CDP口, 页地址问题, 通道问题, 重载问题 } from './harness-readings.mjs';

const VITE_PORT = 5323;

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
 * dev 口必须是空的（与 perf-smoke 同一把尺，2026-10-20 那两次假红换来的）。
 *
 * 探得通 = 有人占着 = 这一轮可能连到**别人的** vite 上，读的是另一个工作树的构建。
 * 连得上但不答话 = 上一轮的 vite 正在断气，给它一个有限的等待窗口。
 *
 * 这段与 perf-smoke 里的同形但**不共享代码**：`perf-smoke.mjs` 导入即执行、按纪律不导出
 * 任何东西（`tests/perf-smoke.test.js` 钉着）。三条腿共用的判据在 `harness-readings.mjs`，
 * 起服务的动作留在各自的脚本里。
 */
async function 口被占(端口) {
  try {
    await fetch(`http://127.0.0.1:${端口}/`, { signal: AbortSignal.timeout(800) });
    return '有人在这个口上应答（不是本脚本起的）';
  } catch (e) {
    const 码 = e?.cause?.code ?? e?.code ?? '';
    if (/ECONNREFUSED|ENOTFOUND/.test(String(码))) return null;
    if (e?.name === 'TimeoutError' || /UND_ERR_CONNECT_TIMEOUT/.test(String(码))) {
      return '连得上但不答话（有东西在听这个口）';
    }
    return `探测失败：${码 || e?.message}`;
  }
}

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

/** 收尾：只拔自己起的这棵树（Windows 上 Chrome 有一整棵子进程，kill() 杀不干净） */
function 拔树(子进程) {
  if (!子进程?.pid) return;
  try {
    if (process.platform === 'win32') {
      const r = spawnSync('taskkill', ['/PID', String(子进程.pid), '/T', '/F'], { stdio: 'ignore' });
      if (r.status !== 0) 子进程.kill();
    } else {
      子进程.kill();
    }
  } catch { /* 已经退出 */ }
}

let 参数;
try {
  参数 = parseSoakArgs(process.argv.slice(2));
} catch (e) {
  console.error(`soak: ${e.message}`);
  process.exit(2);
}

const 口问 = await 等口空(VITE_PORT);
if (口问) {
  console.error(`soak 拒绝开跑：dev 口不是空的。\n  127.0.0.1:${VITE_PORT} —— ${口问}\n`
    + '占口的是上一轮泄漏的 vite（或并行的另一条门禁）—— 这一轮会连到它的进程上，读数不再属于这个工作树。');
  process.exit(2);
}

const viteBin = join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
const vite = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'],
  { stdio: 'ignore', cwd: process.cwd() });

const chromePath = findChrome();
if (!chromePath) {
  console.error('soak: 找不到 Chrome（可用 CHROME 环境变量指定路径）');
  拔树(vite);
  process.exit(2);
}
const profileDir = join(tmpdir(), `soak-${Date.now()}`);
/** 浏览器自己的话（stderr 为主，stdout 一起收 —— 有的构建把 DevTools 行打到 stdout） */
const 浏览器输出 = [];
const chrome = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=0',
  `--user-data-dir=${profileDir}`,
  '--no-first-run',
  '--disable-gpu',
  // 无头页被当后台页时 rAF 会被节流（perf-smoke 实测过 18 秒帧距）—— 三连禁用作保险
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
chrome.stderr.on('data', (b) => 浏览器输出.push(String(b)));
chrome.stdout.on('data', (b) => 浏览器输出.push(String(b)));

const cleanup = () => {
  拔树(chrome);
  拔树(vite);
  try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* 留着也无害 */ }
};
process.on('exit', cleanup);

/**
 * 墙钟保险：帧数固定，正常一定会结束；挂住说明页面里某一句不再返回。
 * 上限默认 `minutes × 3 + 10` —— 软渲染满载机器约要 20–25 分钟（30 分钟游玩），
 * 三倍余量之后仍然没完，就是挂住而不是慢。
 */
const 墙钟保险 = setTimeout(() => {
  console.error(`soak: 墙钟超过 ${参数.wallLimitMinutes} 分钟 —— 这一轮挂住了（帧数固定，正常一定会结束）。`
    + `已推的进度见最后一行日志；退出码 2，读数作废。`);
  process.exit(2);
}, 参数.wallLimitMinutes * 60 * 1000);
墙钟保险.unref?.();

async function 读CDP口(等待毫秒 = 25000) {
  const 截止 = Date.now() + 等待毫秒;
  for (;;) {
    const 得 = 解析CDP口(浏览器输出.join(''));
    if (得) return 得;
    if (Date.now() >= 截止) {
      throw new Error(`Chrome ${Math.round(等待毫秒 / 1000)} 秒内没报出 DevTools 口。它自己的话：\n${浏览器输出.join('').slice(0, 1200) || '(空)'}`);
    }
    await sleep(250);
  }
}

/** 通道计数（切片6b/6d）：exceptions=0 的前提是通道真的在送东西 */
const 通道 = { 执行上下文: 0, 加载完成: 0 };
let 基线上下文 = null;
/** 控制台 error 只收集、不判红（有些兜底路径本来就 console.error 后继续）—— 但日志里要能看见 */
const 控制台错误 = [];

let failures = 0;
try {
  if (!await waitForHttp(`http://127.0.0.1:${VITE_PORT}/`)) throw new Error('dev 口 20 秒内没起来');
  const { 口: CDP口 } = await 读CDP口();
  console.log(`soak：Chrome 报出自己的口 ${CDP口}（热身 ${参数.minutes} 分钟游玩 + 一圈热身，抽帧渲染每 ${参数.renderEvery} 帧一帧）`);

  const targets = await (await fetch(`http://127.0.0.1:${CDP口}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error(`CDP 口 ${CDP口} 通了但 /json/list 里没有 page 目标：${JSON.stringify(targets).slice(0, 300)}`);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let msgId = 0;
  /** id → { res, rej, 钟 }：每个在途调用都带一支表，页内不答话时能点名而不是永远等 */
  const pending = new Map();
  const exceptions = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      clearTimeout(p.钟);
      p.res(m);
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params?.exceptionDetails;
      exceptions.push(d?.exception?.description ?? d?.text ?? '?');
    } else if (m.method === 'Runtime.consoleAPICalled') {
      if (m.params?.type === 'error' && 控制台错误.length < 20) {
        控制台错误.push((m.params.args ?? []).map((a) => a?.value ?? a?.description ?? '').join(' ').slice(0, 400));
      }
    } else if (m.method === 'Runtime.executionContextCreated') 通道.执行上下文 += 1;
    else if (m.method === 'Page.loadEventFired') 通道.加载完成 += 1;
  };
  ws.onclose = () => {
    for (const [, p] of pending) {
      clearTimeout(p.钟);
      p.rej(new Error('CDP 通道被关闭（页 / 渲染进程走了）'));
    }
    pending.clear();
  };
  /**
   * 每个 CDP 调用都有上限。2026-10-31 校准8 撞到过一种沉默的坏：Chrome 活着、
   * `/json/list` 答话、vite 正常发模块，但 `Runtime.evaluate` 一条都不回 ——
   * 没有这一步，整轮就挂在"等读数"上直到墙钟保险（退出码 2，但白等十六分钟）。
   * 现在它三十秒内变成一条点名的环境红。
   */
  const send = (method, params = {}, timeoutMs = 300000) => new Promise((res, rej) => {
    const id = ++msgId;
    const 钟 = setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      rej(new Error(`CDP ${method} ${Math.round(timeoutMs / 1000)} 秒没有回应 —— 渲染进程卡死或已崩（口还在、页地址还在，但主线程不答话）`));
    }, timeoutMs);
    钟.unref?.();
    pending.set(id, { res, rej, 钟 });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalJs = async (expr, timeoutMs = 300000) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, timeoutMs);
    if (r.result?.exceptionDetails) {
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

  /* 开机窗口 120 秒：冷缓存下 vite 按需转译 ~300 个模块要 57.5 秒（perf-smoke 实测），
     CI 每轮都是冷缓存 —— 30 秒那一档红的是缓存，不是代码（两个 harness 同一把尺）。
     单次探针给 60 秒：主线程若卡死，第一支探针就点名退回，不占满整段开机窗口。 */
  let ready = false;
  for (let i = 0; i < 240 && !ready; i += 1) {
    await sleep(500);
    ready = await evalJs('!!window.__game && !!window.__game.enemyManager && !!window.__game.world', 60000);
  }
  if (!ready) throw new Error('游戏 120 秒内没起来');

  const 页地址 = await evalJs('location.href');
  const 页问 = 页地址问题(页地址, VITE_PORT);
  if (页问.length) throw new Error(`连到的页不对：\n - ${页问.join('\n - ')}`);
  const 通问 = 通道问题(通道);
  if (通问.length) throw new Error(`CDP 通道没有正面见证：\n - ${通问.join('\n - ')}`);
  console.log(`soak：页=${页地址.slice(0, 60)} 执行上下文=${通道.执行上下文} 加载完成=${通道.加载完成}`);
  基线上下文 = 通道.执行上下文;

  // 固定步长：一秒游戏时间 = 60 帧，读数与机器快慢无关（e2e-clear 同一句）
  await evalJs('window.__game.clock.getDelta = () => 1 / 60; true');

  const 站点 = PERF_BUDGETS.drawCalls.stationIds;
  const 配方 = PERF_BUDGETS.drawCalls.recipe;
  const 枢纽 = PERF_BUDGETS.drawCalls.hubCenter;
  const 场数 = await evalJs('(window.__game.enemyManager.arenas || []).length');
  if (!Number.isSafeInteger(场数) || 场数 <= 0) throw new Error(`enemyManager.arenas 读到 ${String(场数)} —— Boss 场清单是空的，路线会把"战斗资源的覆盖面"整段省掉`);
  const 场名 = await evalJs('(window.__game.enemyManager.arenas || []).map((a) => Math.round(a.center.x) + "," + Math.round(a.center.z))');

  const 计划 = planSoak({ minutes: 参数.minutes, laps: 参数.laps, stations: 站点, arenas: 场名 });
  console.log(`soak：计划 游玩 ${计划.游玩帧} 帧（${计划.laps} 圈 × ${计划.圈帧}）+ 热身 ${计划.热身帧} 帧`
    + ` | 每站 ${计划.站帧.join('/')} 帧 | 每场 ${计划.场帧} 帧 × ${场数}`);

  /* 页面侧驱动。所有坐标/配方/名单都从外面注入或从世界里现读 —— 脚本里一个坐标都不抄。 */
  const 驱动 = `(() => {
  const g = window.__game;
  if (!g) throw new Error('window.__game 不在');
  if (window.__soak) return true;
  const 配方 = ${JSON.stringify(配方)};
  const 枢纽 = ${JSON.stringify(枢纽)};
  const 渲染间隔 = ${Number(参数.renderEvery)};
  const 状态 = { 站: null, 站内帧: 0, 游帧: 0, 站访问: {}, 站光: {}, 场访问: 0, 弹窗: 0 };

  /**
   * 入画溯源：renderer.info 只给条数，涨了也指不到是谁。
   *
   * 上传只发生在 draw 路径上（WebGLGeometries.get 由 renderBufferDirect 调用），所以在
   * 这里记每个 geometry 的 uuid 与首次入画时的对象/材质/游帧，基线取一份 key 集，
   * 终局差出"基线之后新入画的几何" —— 三项涨了，日志能点名到具体类型。
   * 同一张表也记 programs（每条的 name|缓存键），程序涨了同样指得到。
   */
  const 入画 = new Map();
  /** 对象的来路：从它的 parent 一路数到根（名字/类型），留下来的东西靠这条链认领 */
  const 父链 = (o) => {
    const 链 = [];
    let p = o && o.parent;
    while (p && 链.length < 6) {
      链.push(p.name || p.type || '?');
      p = p.parent;
    }
    return 链.join(' < ');
  };
  const 在场景上 = (o) => {
    let p = o;
    while (p) {
      if (p === g.scene) return true;
      p = p.parent;
    }
    return false;
  };
  /**
   * 可见光源账：程序缓存键里带 numPointLights 等条数（第 33~46 位），光照构成一变，
   * 所有受光材质就按新键重编一次。2026-10-31 校准12：新程序唯一差位正是
   * numPointLights 34→35 —— 不把"光源怎么变"记下来，就只能在材质上打转。
   */
  const 光账 = () => {
    const 表 = [];
    g.scene.traverseVisible((o) => {
      if (o.isLight) 表.push({ 型: o.type, 名: o.name || '?', 父链: 父链(o), uuid: o.uuid, 强: Number(o.intensity) });
    });
    return 表;
  };
  /** 当前正在画的对象/材质：程序编译发生在 draw 路径里，靠这一格认领"是谁把它编出来的" */
  let 当前渲染 = null;
  const 原缓冲 = g.renderer.renderBufferDirect.bind(g.renderer);
  g.renderer.renderBufferDirect = (camera, scene, geometry, material, object, group) => {
    if (geometry && geometry.uuid && !入画.has(geometry.uuid)) {
      const 条 = {
        帧: 状态.游帧,
        几何: geometry.type,
        名: (object && (object.name || object.type)) || '?',
        材质: (material && material.type) || '?',
        对象: (object && object.type) || '?',
        父链: 父链(object),
        挂点: (geometry.attributes && geometry.attributes.position) ? geometry.attributes.position.count : -1,
        对象参: object || null,
        销毁: false,
      };
      入画.set(geometry.uuid, 条);
      // 短命特效（处决环/碎片）会当场 dispose —— 记下来，才能把"涨了又走"与"留下了"分开
      const 原销毁 = geometry.dispose.bind(geometry);
      geometry.dispose = () => { 条.销毁 = true; 原销毁(); };
    }
    当前渲染 = { object, material };
    try {
      return 原缓冲(camera, scene, geometry, material, object, group);
    } finally {
      当前渲染 = null;
    }
  };

  let 几何基线 = null;
  let 程序基线 = null;
  let 程序基线键 = null;
  let 光基线 = null;
  let 追踪开 = false;
  const 场景新增记录 = [];
  const 场景原型 = Object.getPrototypeOf(g.scene);
  const 原场景加 = 场景原型.add;
  // 游玩段往场景里添的东西才是"新造资源"的嫌疑人：记下名字/几何/来路栈
  场景原型.add = function (...参) {
    if (追踪开) {
      for (const a of 参) {
        if (a && a.geometry && 场景新增记录.length < 80) {
          场景新增记录.push({
            名: a.name || a.type || '?',
            几何: a.geometry.type || '?',
            栈: String(new Error().stack || '').split('\\n').slice(1, 5).join(' | '),
          });
        }
      }
    }
    return 原场景加.apply(this, 参);
  };
  const 程序表 = () => (g.renderer.info.programs || [])
    .map((p) => String(p.name || '?') + '|' + String(p.cacheKey || '?'));
  /**
   * 新程序的来路：info.programs 就是 three 的 programCache.programs 数组，
   * acquireProgram 里 programs.push(program) 是唯一入口。把它换掉，记下"哪一帧、
   * 正在画哪个对象/材质、从哪条路径编出来"。缓存键只能说出参数差 —— 2026-10-31 校准11
   * 就卡在这里：差 1 位在能力掩码上，而两个不同材质互相当了"最像的基线"。
   */
  /**
   * 光照变迁：程序缓存键里的灯条数是**编译那一刻**的构成。基线取的是静置后的 38 盏，
   * 但游玩中一次性特效灯（闪电/火光）亮起又灭掉，那一帧里首编的材质就带上了 35 盏的键 ——
   * 终局灯账与基线一致，程序账却多一条。每次真渲染前对一遍光源 uuid 集，把这类窗口记成帧。
   */
  const 光变迁 = [];
  let 光上次 = null;
  const 原渲染 = g.renderer.render.bind(g.renderer);
  g.renderer.render = (...参) => {
    if (追踪开) {
      const 今 = 光账();
      const 今id = new Map(今.map((o) => [o.uuid, o]));
      if (光上次) {
        const 新 = 今.filter((o) => !光上次.has(o.uuid));
        const 走 = [...光上次.values()].filter((o) => !今id.has(o.uuid));
        if (新.length || 走.length) {
          光变迁.push({
            帧: 状态.游帧, 前: 光上次.size, 后: 今.length,
            新: 新.slice(0, 6), 走: 走.slice(0, 6),
          });
        }
      }
      光上次 = 今id;
    }
    return 原渲染(...参);
  };

  const 程序新增记录 = [];
  const 程序账 = g.renderer.info.programs;
  const 原程序加 = 程序账.push;
  程序账.push = function (...参) {
    if (追踪开) {
      for (const p of 参) {
        const 物 = 当前渲染 && 当前渲染.object;
        const 材 = 当前渲染 && 当前渲染.material;
        程序新增记录.push({
          帧: 状态.游帧,
          名: String((p && p.name) || '?'),
          对象: (物 && (物.name || 物.type)) || '?',
          对象型: (物 && 物.type) || '?',
          父链: 父链(物),
          材质: (材 && 材.type) || '?',
          材质名: (材 && 材.name) || '',
          侧面: 材 && 材.side !== undefined ? String(材.side) : '?',
          劈面: 材 ? !!材.flatShading : null,
          透明: 材 ? !!材.transparent : null,
          色: 材 && 材.color && 材.color.getHexString ? 材.color.getHexString() : '',
          可见: !!(物 && 物.visible),
          在场景: 物 ? 在场景上(物) : false,
          栈: String(new Error().stack || '').split('\\n').slice(1, 6).join(' | '),
        });
      }
    }
    return 原程序加.apply(this, 参);
  };
  const 取溯源基线 = () => {
    几何基线 = new Set(入画.keys());
    程序基线键 = 程序表();
    程序基线 = new Set(程序基线键);
    光基线 = 光账();
    追踪开 = true;
    return { 几何: 几何基线.size, 程序: 程序基线.size, 程序键: 程序基线键.slice(), 光照: 光基线.length };
  };
  /**
   * 新程序的"最像的那条基线"逐位差分：缓存键是逗号分隔的参数表，
   * 位置 i 对得上 three 的 getProgramCacheKeyParameters/Booleans 的推入顺序。
   * 只跟**同长度**的键比 —— 长度不同说明是另一族着色器，无从下嘴。
   */
  const 最近差分 = (新键) => {
    const 新 = String(新键).split(',');
    let 最好 = null;
    for (const 基 of 程序基线键) {
      const 基分 = String(基).split(',');
      if (基分.length !== 新.length) continue;
      const 差 = [];
      for (let i = 0; i < 新.length; i += 1) {
        if (新[i] !== 基分[i]) 差.push({ 位: i, 基: 基分[i], 新: 新[i] });
      }
      if (差.length && (!最好 || 差.length < 最好.差.length)) 最好 = { 基: 基, 差 };
    }
    return 最好;
  };
  const 溯源新增 = () => {
    if (!几何基线 || !程序基线) throw new Error('溯源基线还没取（先取基线再跑游玩）');
    const 新几何 = [];
    for (const [id, 条] of 入画) if (!几何基线.has(id)) 新几何.push(条);
    新几何.sort((a, b) => a.帧 - b.帧);
    const 留下 = 新几何.filter((条) => !条.销毁).map((条) => ({
      帧: 条.帧,
      几何: 条.几何,
      名: 条.名,
      材质: 条.材质,
      对象: 条.对象,
      父链: 条.父链,
      挂点: 条.挂点,
      可见: !!(条.对象参 && 条.对象参.visible),
      还在场景: 条.对象参 ? 在场景上(条.对象参) : false,
    }));
    const 走了 = new Map();
    for (const 条 of 新几何) {
      if (!条.销毁) continue;
      const 键 = 条.几何 + '|' + 条.材质;
      走了.set(键, (走了.get(键) || 0) + 1);
    }
    const 新程序 = 程序表().filter((k) => !程序基线.has(k));
    const 程序差分 = 新程序.map((k) => ({ 键: k, 差分: 最近差分(k) }));
    const 光今 = 光账();
    const 基线光id = new Set((光基线 || []).map((o) => o.uuid));
    const 今id = new Set(光今.map((o) => o.uuid));
    return {
      几何: 留下.slice(0, 40),
      几何数: 新几何.length,
      仍在: 留下.length,
      走了: [...走了].sort((a, b) => b[1] - a[1]),
      程序: 新程序.slice(0, 20),
      程序差分,
      程序新增: 程序新增记录.slice(0, 20),
      程序新增数: 程序新增记录.length,
      程序数: 新程序.length,
      光照基线数: (光基线 || []).length,
      光照数: 光今.length,
      新光: 光今.filter((o) => !基线光id.has(o.uuid)).slice(0, 20),
      少了光: (光基线 || []).filter((o) => !今id.has(o.uuid)).slice(0, 20),
      光变迁: 光变迁.slice(0, 30),
      光变迁数: 光变迁.length,
      场景新增: 场景新增记录.slice(0, 40),
      场景新增数: 场景新增记录.length,
    };
  };

  const 清输入 = () => {
    g.keys['KeyW'] = false;
    g.keys['ShiftLeft'] = false;
    // 攻击锁存在 player.combat.mouseDown 上（Game.js 的鼠标监听写的也是这一格）；
    // game.combat 是幻影字段（B84），读它只会撞 TypeError
    const 锁存 = g.player.combat.mouseDown;
    if (锁存) {
      锁存['left'] = false;
      锁存['right'] = false;
    }
  };

  /**
   * 点掉挡路的教学模态 —— 玩家会点「继续」，驱动得照做。
   *
   * 首次连击终结 / 处决会走 ContextualTutorial → dialog.show()，而 canPlay 里
   * [!dialog.open] 那一格会让整个世界（玩家、敌人 AI、精力回复）整段停住。
   * 2026-10-28 校准的「击杀恒 0」就是它：第 3 段连击命中后弹出教学，之后整批帧
   * 全在暂停里空转（探针读数：dialog.open=true，敌血/精力/距离从此不动）。
   * 走 #dialog-close 的 click 而不是 dialog.hide()：教学自己的 onClose 挂在那枚
   * 按钮上，绕过去它就不再排下一条（busy 永远为真）。
   */
  const 清弹窗 = () => {
    if (!g.dialog || !g.dialog.open) return false;
    const 关 = document.getElementById('dialog-close');
    if (关) 关.click();
    else g.dialog.hide();
    状态.弹窗 += 1;
    return true;
  };

  const 满血 = () => {
    const c = g.player.combat;
    c.maxHp = 99999;
    c.hp = 99999;
  };

  const 落点 = (x, z) => {
    const y = g.world.getGroundHeight(x, z);
    if (!Number.isFinite(y)) throw new Error('地面高度非有限：' + x + ',' + z);
    g.player.teleport(x, y + 0.1, z, { yaw: 配方.yaw, pitch: 配方.pitch });
    g.timeOfDay = 配方.timeOfDay;
    清输入();
    满血();
  };

  const 站心 = (id) => {
    if (id === 'hub') return { x: 枢纽.x, z: 枢纽.z };
    const 区 = (g.world.zones || []).find((e) => e.id === id);
    if (!区) throw new Error('世界里没有 id 为 "' + id + '" 的区 —— 站点名单与世界分家了');
    return { x: 区.center.x, z: 区.center.z };
  };

  const 定位到 = (id) => {
    const c = 站心(id);
    落点(c.x, c.z);
    // teleport 只搬坐标；world.currentZone 是 WorldManager.update 里按位置重算的，
    // 不推一帧读到的还是上一站 —— 第一站就会红成"坐标与世界分家"
    g.update();
    const 落 = g.world.currentZone && g.world.currentZone.id;
    if (落 !== id) throw new Error('站点 ' + id + ' 传送到位后落在 "' + 落 + '" —— 坐标与世界分家了');
  };

  const 开站 = (id) => {
    定位到(id);
    状态.站 = id;
    状态.站内帧 = 0;
    状态.站访问[id] = (状态.站访问[id] || 0) + 1;
    状态.站光[id] = 光账().length;
    return 状态.站访问[id];
  };

  const 追敌 = () => {
    const p = g.player.position;
    let 近 = null;
    let 距 = Infinity;
    for (const e of g.enemyManager.enemies) {
      if (!e || !e.alive) continue;
      const d = Math.hypot(e.position.x - p.x, e.position.z - p.z);
      if (d < 距) { 距 = d; 近 = e; }
    }
    if (!近) return false;
    落点(近.position.x + 2.2, 近.position.z);
    const yaw = Math.atan2(近.position.x - g.player.position.x, 近.position.z - g.player.position.z);
    g.player.yaw = yaw;
    g.player.targetYaw = yaw;
    return true;
  };

  /** 站内最近的活敌（只在半径内找：够得着才转过去打，不去全图拉怪） */
  const 最近敌 = (半径) => {
    const p = g.player.position;
    let 近 = null;
    let 距 = 半径;
    for (const e of g.enemyManager.enemies) {
      if (!e || !e.alive) continue;
      const d = Math.hypot(e.position.x - p.x, e.position.z - p.z);
      if (d < 距) { 距 = d; 近 = e; }
    }
    return 近;
  };

  const 面朝 = (e) => {
    const yaw = Math.atan2(e.position.x - g.player.position.x, e.position.z - g.player.position.z);
    g.player.yaw = yaw;
    g.player.targetYaw = yaw;
  };

  /**
   * 站点里的一批帧：每 480 帧一个微循环 —— 先走两秒（覆盖移动与冲刺），再站定打。
   *
   * 站定后每 60 帧把准星转回最近的活敌；近处没有（被打飞/清光了）就全图追一只过来。
   * **不能一直按着 W**：2026-10-28 校准里 8 站 × 2 圈 0 击杀，探针量出原因是
   * 传送贴脸后按住 W 从目标身边跑了过去 —— 前两刀命中、第三刀接终结技弹教学，
   * 点掉教学时人已经跑出刀长，之后每一站都在挥空气。
   */
  const 帧 = (n) => {
    for (let i = 0; i < n; i += 1) {
      const 内 = 状态.站内帧;
      if (内 % 480 === 0) {
        const 环 = Math.floor(内 / 480);
        定位到(状态.站);
        // 首环也追敌：短轮次（校准时站帧不足 480）否则一站只站着挥空气，
        // 击杀恒为 0 —— "零增长"就少了战斗资源这一半分母
        const 追到 = (环 === 0 || 环 % 2 === 1) ? 追敌() : false;
        if (!追到) {
          // 追敌时朝向已经对准那只敌人，别再拿配方朝向把它盖掉（盖掉就是背身挥刀）
          const yaw = 配方.yaw + (环 % 4) * (Math.PI / 2);
          g.player.yaw = yaw;
          g.player.targetYaw = yaw;
        }
        g.keys['KeyW'] = true;
        g.keys['ShiftLeft'] = 环 % 4 >= 2;
      }
      // 走满两秒就站定（别从敌人身边跑过去）
      if (内 % 480 === 120) {
        g.keys['KeyW'] = false;
        g.keys['ShiftLeft'] = false;
      }
      // 站定之后每秒回一次准星；近处没敌人就传送追一只
      if (内 % 480 >= 120 && 内 % 60 === 0) {
        const 近 = 最近敌(12);
        if (近) 面朝(近);
        else 追敌();
      }
      if (内 % 12 === 0) g.player.combat.mouseDown['left'] = true;
      if (内 % 300 === 0) 满血();
      g.update();
      // 教学模态一开，canPlay 就是假 —— 照着玩家的动作把它点掉，别让整批帧停在暂停里
      if (内 % 30 === 0) 清弹窗();
      if (内 % 渲染间隔 === 0) g.render();
      状态.站内帧 += 1;
      状态.游帧 += 1;
    }
    return { 站内帧: 状态.站内帧, 游帧: 状态.游帧 };
  };

  const Boss序 = () => [g.enemyManager.boss, g.enemyManager.boss2, g.enemyManager.boss3,
    g.enemyManager.voidBoss, g.enemyManager.chaosBoss];

  const 开场 = (i) => {
    const 场 = (g.enemyManager.arenas || [])[i];
    if (!场) throw new Error('没有第 ' + i + ' 个 Boss 场');
    落点(场.center.x, 场.center.z);
    状态.场访问 += 1;
    return { 场数: (g.enemyManager.arenas || []).length };
  };

  /** Boss 场里的一批帧：每 240 帧回场心一次（别走出场），隔帧出招，回满血 */
  const 场帧 = (n, i) => {
    const 场 = (g.enemyManager.arenas || [])[i];
    const 头 = Boss序()[i] || null;
    for (let k = 0; k < n; k += 1) {
      if (k % 240 === 0) {
        落点(场.center.x, 场.center.z);
        if (头 && 头.alive) {
          const yaw = Math.atan2(头.position.x - g.player.position.x, 头.position.z - g.player.position.z);
          g.player.yaw = yaw;
          g.player.targetYaw = yaw;
        }
        g.keys['KeyW'] = true;
        g.keys['ShiftLeft'] = true;
      }
      if (k % 12 === 0) g.player.combat.mouseDown['left'] = true;
      if (k % 300 === 0) 满血();
      g.update();
      if (k % 30 === 0) 清弹窗();
      if (k % 渲染间隔 === 0) g.render();
      状态.游帧 += 1;
    }
    return { 开战: !!场.activated, bossId: 头 ? (头.bossId || null) : null, boss活: !!(头 && 头.alive) };
  };

  const 快照 = () => {
    const info = g.renderer.info;
    // info.programs 在第一次渲染之前是 null；这时读 0 会被快照形状判据当成"量到了 0 条"。
    // 快照只在真渲染过之后取，缺了就当场抛 —— 不许用 0 冒充读数。
    if (!info.programs) throw new Error('renderer.info.programs 还没有（这一页一次渲染都没发生）');
    return {
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs.length,
      calls: info.render.calls,
      triangles: info.render.triangles,
      heap: (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1),
    };
  };

  /**
   * 回枢纽、钉住配方朝向、让世界静下来，再渲染四帧后取账。
   *
   * 静置取 **240 帧（4 秒游戏时间）**，不是 90：换区流送 / 首次入画 / 延迟清理都是
   * 有限但**不在一两秒内收尾**的账。2026-10-28 校准用 90 帧时，基线自己还在涨
   * （562→562 稳过一次，也 571→572 涨过一次）；同一段换成探针在出生点静置 300 帧后
   * 再推 400 帧，几何 333→333 一动不动 —— 90 帧量到的是流送尾巴，不是泄漏。
   */
  /**
   * 全景首绘：把场景里每一件几何/材质都真画一遍，让"缓存里已有什么"不再取决于
   * 镜头这一圈恰好看见什么。
   *
   * 2026-10-29 校准读数：热身之后游玩 3 圈，geometries +13 / programs +2，而入画溯源
   * 指到的全是场地里的静物（fantasy 的锥/环、magic 的柱/球）——它们从开机起就在场景里，
   * 只是热身圈的镜头没有一次把它们纳进视锥。renderer.info.memory.geometries 记的是
   * **上传缓存**，不是存活资源：首次入画才算上传。这种"看见才上传"的账若留给游玩段，
   * 判定就听命于当圈追敌的朝向 —— 红绿都不可复现。
   *
   * 所以基线取在"全场都画过一遍"之后：六个轴向各画一帧 170° 大锥，临时把隐藏件
   * （对象池里的掉落片、伤害数字）也翻成可见，画完立刻翻回去。此后游玩段再涨，
   * 就只可能是**新造出来的**东西，而不是"这回镜头转到了它"。
   */
  let 首绘读数 = null;
  const 全场首绘 = () => {
    const 相 = g.camera.clone();
    相.fov = 170;
    相.aspect = 1;
    相.near = 0.1;
    相.far = 50000;
    相.updateProjectionMatrix();
    const 心 = g.camera.position.clone();
    心.set(枢纽.x, 0, 枢纽.z);
    相.position.copy(心);
    /**
     * 预警圈是**按需**建的：基线时刻可能一只都还没预警过（热身圈的招式/镜头未必触发），
     * 于是首绘覆盖不到它们 —— 30 分钟里第一只预警就会新造几何与程序，被判成"增长"。
     * 2026-10-31 校准10：游玩段残留的两条几何正是两只 Boss 的预警圈。
     * 所以首绘把这条**创建路径**也走一遍：每只敌人亮一次预警圈，画完立刻收起。
     * 建出来的圈留在各自身上（Boss 的圈常驻，敌人那组是常驻的世界空间组），只是藏起来。
     */
    const 起过预警 = [];
    for (const e of ((g.enemyManager && g.enemyManager.enemies) || [])) {
      if (!e || typeof e.showTelegraph !== 'function') continue;
      try {
        e.showTelegraph();
        起过预警.push(e);
      } catch (err) {
        // 单只的预警路径坏了不该拖垮首绘；它会在游玩段自己现形（异常账另算）
      }
    }
    const 翻回 = [];
    g.scene.traverse((o) => {
      if (o.visible === false) {
        翻回.push(o);
        o.visible = true;
      }
    });
    const 向 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    // 首绘期间的光照构成：翻出来的隐藏件里有灯的话，这一轮画出来的程序键就不是游玩时的键
    const 首绘光 = 光账().length;
    const 光翻 = 翻回.filter((o) => o.isLight).length;
    /**
     * 一轮 = 六向大锥 + 按类型贴近。
     *
     * 六向大锥从枢纽打出去，远处的敌人要包围球进锥才画得到；而敌人的视觉家族是**按类型**
     * 各造一次的（咒师长袍 DoubleSide 不透明、怨影罩袍半透明……）。2026-10-31 校准13：
     * 基线里缺的正是一条 DoubleSide 不透明 Standard —— 咒师长袍直到游玩第一圈才首编。
     * 所以再按类型各挑一只贴近补画：一族只要有一件入画，它的程序键就落在基线里。
     * 读数（本轮新增程序）大于 0 就证明六向确实漏了这一族，而不是游玩段"造了新东西"。
     *
     * 每轮自各带一个"画过哪些类型"的集合：第二轮（补灯）要**重画同一批**，用的是另一档光照键。
     */
    const 画一轮 = () => {
      const 起前 = 程序表().length;
      // 机位必须回到枢纽：上一轮的贴近补画把 相 留在了某只敌人跟前，第二轮若从这里发散
      // 六向大锥，画的就不是"枢纽看全场景"那一批（2026-10-31 校准16：第二轮漏掉咒师长袍）
      相.position.copy(心);
      const 灯数 = 光账().length;
      for (const [dx, dy, dz] of 向) {
        相.lookAt(心.x + dx, 心.y + dy, 心.z + dz);
        g.renderer.render(g.scene, 相);
      }
      // 每类挑一只做贴近补画，**优先挑身体可见的那只**：对象池里同族常有隐身件，
      // 对着隐身件渲染整棵树一个 draw call 都不会多（2026-10-31 校准18：两轮补画
      // 的按类新增全"无"，咒师长袍的 35 盏变体始终没落地）。
      const 本型 = new Map();
      for (const e of ((g.enemyManager && g.enemyManager.enemies) || [])) {
        if (!e || !e.mesh) continue;
        const 显 = e.mesh.visible !== false;
        const 前选 = 本型.get(e.type);
        if (!前选 || (!前选.显 && 显)) 本型.set(e.type, { e, 显 });
      }
      const 添账 = [];
      let 画数 = 0;
      for (const { e, 显 } of 本型.values()) {
        const p = e.mesh.position;
        相.position.set(p.x + 6, p.y + 3, p.z + 6);
        相.lookAt(p.x, p.y + 1, p.z);
        // 同族一只可见的都没有时，临时把这只连同隐身的祖先翻出来，画完原样翻回去：
        // visible 是继承的，只翻 mesh 自己不够（隐的是外层的组）
        const 翻起 = [];
        if (!显) {
          let o = e.mesh;
          while (o) {
            if (o.visible === false) {
              翻起.push(o);
              o.visible = true;
            }
            o = o.parent;
          }
        }
        const 前 = 程序表().length;
        const 呼前 = g.renderer.info.render.calls;
        g.renderer.render(g.scene, 相);
        const 呼 = g.renderer.info.render.calls - 呼前;
        for (const o of 翻起) o.visible = false;
        // 按类记账：哪一类在这一轮补出了程序、补画时它的身体是不是隐着的、这一下画出
        // 多少个 draw call —— 漏一族时第一眼要看的就是这三格（看不见的敌人画不出它的袍子）
        if (程序表().length > 前) 添账.push({ 型: e.type, 数: 程序表().length - 前, 显, 呼 });
        画数 += 1;
      }
      return { 近画: 画数, 近画型: 本型.size, 程序: 程序表().length - 起前, 添账, 灯数 };
    };
    /**
     * 弹体几何是**共享的一份**（ProjectileManager 的 SphereGeometry），第一次真开火才上传。
     * 2026-10-31 校准14：游帧 5900 新入画的那条 81 点 SphereGeometry 正是它 —— 终局不在场景里
     * 也没被销毁（共享件本就不该销毁），所以这不是泄漏，是基线没走过这条创建路径。
     * 朝首绘的第一个机位（+x）真发一发，画完立刻回收（回收只释放材质，几何留着）。
     */
    const 弹管 = g.projectiles || null;
    let 弹预热 = 0;
    if (弹管 && typeof 弹管.spawn === 'function') {
      try {
        const 弹起 = 心.clone();
        弹起.x += 3;
        弹管.spawn(弹起, 心.clone(), 0);
        弹预热 = 1;
      } catch (err) {
        // 弹道坏了不该拖垮首绘：游玩段开火时它自己会现形（异常账另算）
      }
    }
    /* 场地危险区：Hazards 的共享几何（圆盘 + 边缘环）只在第一次真 spawn 才上传。
     * 索克全程不打架 ⇒ 基线里没有它 ⇒ geometries 在游玩段首次 hazard spawn 时 +2
     * （2026-11-07 实锤：帧 4474 定位 ground-hazards 的两条 MeshBasicMaterial ——
     *  一次 hazard spawn 就同时上传这两份）。照弹体那一档一起的口径：真 spawn 一枚
     *  （目标伤害 0、前摇 0.001 秒），让它至少画过一轮；此后的首绘轮次覆盖它。 */
    const 危 = (g.enemyManager && g.enemyManager.hazards) || null;
    let 危预热 = 0;
    if (危 && typeof 危.spawn === 'function') {
      try {
        const 位 = g.player && g.player.position ? g.player.position : 心;
        危.spawn({
          x: 位.x, z: 位.z,
          radius: 3, telegraph: 0.001, damage: 0,
          duration: 0, color: 0xff3355, owner: null,
        });
        // 推几帧让生命周期走到可见帧；spawn 直接能进下一帧的 _land 分支
        for (let i = 0; i < 3; i += 1) g.update();
        危预热 = 1;
      } catch (err) {
        // 预热失败不拖垮首绘：游玩段第一次 hazard spawn 自己会现形（异常账另算）
      }
    }
    /* 营火余点：RestCampfireAmbient 的 8 座 Points（每座一组）在构造期就造好了，
     * 上传却要等"玩家走近那座火"才首绘。索克的站著序让它们在游玩段才第一次入画
     * （帧 5826/5848 定位到 rest:space / rest:void 的两枚）， geometries 因此 +2。
     * 这些 Points 被 update() 的 visible=near 钉成 false，需在所有 update() 之后
     * 统一翻正（否则 g.update() 会把它们重新藏起来）。 */
    const 火星组 = (() => {
      const 找到 = [];
      g.scene.traverse((o) => { if (o.isPoints) 找到.push(o); });
      return 找到;
    })();
    let 火星预热 = 0;
    for (const o of 火星组) {
      if (o.visible === false) { o.visible = true; 火星预热 += 1; }
    }

    const 一轮 = 画一轮();
    /**
     * 光照构成是程序缓存键的一位，而它有两档：WorldEffects.setZone 在 MAGIC/SPACE/FANTASY/ABYSS
     * 各挂一盏 PointLight、回枢纽摘掉，numPointLights 就在 34↔35 之间来回。2026-10-31 校准15：
     * 首绘在枢纽只有 34 盏那一档，咒师长袍的 35 盏变体直到游玩第一圈才首编（programs +1，
     * 缓存键差位 [36] "34"→"35"）—— 那不是泄漏，是基线没画过第二档。
     * 所以第二轮临时补一盏（克隆现有灯、强度 0、不投影：键只看盏数与类型，不看位置与亮度），
     * 把同一批东西再画一遍，35 盏那一档也落进基线；画完立刻摘掉，光账回到原状。
     */
    const 样灯 = (() => {
      let 找到 = null;
      g.scene.traverse((o) => { if (!找到 && o.isPointLight) 找到 = o; });
      return 找到;
    })();
    let 补灯 = 0;
    let 二轮 = null;
    if (样灯) {
      const 备灯 = 样灯.clone();
      备灯.intensity = 0;
      备灯.castShadow = false;
      备灯.visible = true;
      备灯.position.set(心.x, 心.y + 15, 心.z);
      g.scene.add(备灯);
      try {
        二轮 = 画一轮();
      } finally {
        g.scene.remove(备灯);
      }
      补灯 = 1;
    }
    if (弹预热 && 弹管.projectiles && 弹管.projectiles.length) {
      try { 弹管._recycle(弹管.projectiles.length - 1); } catch (err) { /* 回收失败留给游玩段自己收 */ }
    }
    for (const o of 翻回) o.visible = false;
    for (const e of 起过预警) {
      try { e.clearTelegraph(); } catch (err) { /* 同上 */ }
    }
    /**
     * 两轮之后的两格诊断读数：程序账按 numPointLights（键的第 36 段）分成几档、各多少条；
     * 咒师长袍那件材质**自己手里**存着几条程序（Map 按缓存键存，两档就是 2）。
     * 2026-10-31 校准17：两轮都报"按类新增 无"、却仍缺 35 盏那一档 —— 先分清是
     * "第二轮没画到它"还是"画到了但键没变"，再决定修哪边。
     */
    const 光档 = {};
    for (const k of 程序表()) {
      const n = k.split(',')[36] ?? '?';
      光档[n] = (光档[n] || 0) + 1;
    }
    let 袍材 = null;
    for (const e of ((g.enemyManager && g.enemyManager.enemies) || [])) {
      if (袍材 || e.type !== 'hexer' || !e.mesh || !e.mesh.traverse) continue;
      e.mesh.traverse((o) => {
        if (袍材 || !o.material || !o.material.color || typeof o.material.color.getHex !== 'function') return;
        if (o.material.color.getHex() === 0x6a5a9a) 袍材 = o.material;
      });
    }
    let 袍程序 = -1;
    const 袍键 = [];
    if (袍材) {
      try {
        const 属 = g.renderer.properties.get(袍材);
        袍程序 = 属 && 属.programs ? 属.programs.size : 0;
        if (属 && 属.programs) {
          // three r172 的 materialProperties.programs 是 Map（键 → program）；
          // 直接 for...of 拿到的是 [键, program] 数组，对它 split 会抛进下面的 catch（旧读数恒 −2）。
          for (const k of 属.programs.keys()) {
            const 段 = k.split(',');
            袍键.push('灯' + (段[36] ?? '?') + '/掩' + (段[52] ?? '?'));
          }
        }
      } catch (err) { 袍程序 = -2; }
    }
    首绘读数 = {
      帧: 向.length * (补灯 ? 2 : 1) + 一轮.近画 + (二轮 ? 二轮.近画 : 0),
      翻回: 翻回.length, 预警: 起过预警.length, 光照: 首绘光, 光翻,
      近画: 一轮.近画, 近画型: 一轮.近画型, 近画程序: 一轮.程序,
      弹预热, 危预热, 火星预热, 补灯, 二轮程序: 二轮 ? 二轮.程序 : 0,
      一轮添账: 一轮.添账, 二轮添账: 二轮 ? 二轮.添账 : [],
      一轮灯: 一轮.灯数, 二轮灯: 二轮 ? 二轮.灯数 : 0, 光档, 袍程序, 袍键,
    };
    return 首绘读数;
  };

  /** 回枢纽、钉住配方朝向、让世界静下来，再渲染四帧后取账。 */
  const 落定 = (要首绘 = false) => {
    定位到('hub');
    g.keys['KeyW'] = false;
    for (let i = 0; i < 240; i += 1) {
      g.update();
      if (i % 30 === 0) 清弹窗();
    }
    if (要首绘) 全场首绘();
    for (let k = 0; k < 4; k += 1) {
      g.update();
      g.timeOfDay = 配方.timeOfDay;
      g.render();
    }
    return 快照();
  };

  /** 基线/终局的复读：再推 240 帧、渲两帧，看资源账有没有自己还在动 */
  const 静置复读 = () => {
    for (let i = 0; i < 240; i += 1) {
      g.update();
      if (i % 30 === 0) 清弹窗();
    }
    for (let k = 0; k < 2; k += 1) {
      g.update();
      g.timeOfDay = 配方.timeOfDay;
      g.render();
    }
    return 快照();
  };

  /** 移动见证：按 KeyW 推 120 帧，玩家必须真的挪了位置（默认键位变了 / 输入被拦 ⇒ 作废） */
  const 行走见证 = () => {
    定位到('hub');
    清弹窗();
    const x0 = g.player.position.x;
    const z0 = g.player.position.z;
    g.keys['KeyW'] = true;
    for (let i = 0; i < 120; i += 1) g.update();
    g.keys['KeyW'] = false;
    return {
      位移: Math.hypot(g.player.position.x - x0, g.player.position.z - z0),
      区: g.world.currentZone ? g.world.currentZone.id : null,
    };
  };

  const 击杀总数 = () => {
    const k = g.quests && g.quests.stats && g.quests.stats.kills;
    if (!k) return 0;
    return Object.values(k).reduce((s, v) => s + (Number(v) || 0), 0);
  };

  const 重置计数 = () => {
    状态.站访问 = {};
    状态.场访问 = 0;
    状态.游帧 = 0;
    return true;
  };

  const 进度 = () => ({
    游帧: 状态.游帧,
    站访问: { ...状态.站访问 },
    场访问: 状态.场访问,
    // 每站开站那一刻的可见光源条数：程序键里带 numPointLights，光照一变就重编
    站光: { ...状态.站光 },
    区: g.world.currentZone ? g.world.currentZone.id : null,
    击杀: 击杀总数(),
    魂: g.stats ? g.stats.souls : null,
    弹窗: 状态.弹窗,
    // 几何/程序读数跟着站走：三项零增长若在游玩段长出来，日志要能指到具体哪一站
    几何: g.renderer.info ? {
      geo: g.renderer.info.memory.geometries,
      tex: g.renderer.info.memory.textures,
      prog: g.renderer.info.programs ? g.renderer.info.programs.length : -1,
    } : null,
  });

  window.__soak = { 开站, 帧, 开场, 场帧, 快照, 落定, 静置复读, 行走见证, 击杀总数, 重置计数, 进度, 取溯源基线, 溯源新增, 程序键: () => 程序表(), 首绘读数: () => 首绘读数 };
  return true;
})()`;
  await evalJs(驱动);

  const 快照读 = (名, s) => {
    const 问 = snapshotProblem(名, s);
    if (问.length) {
      const e = new Error(`快照不合格，这一轮读数作废：\n - ${问.join('\n - ')}`);
      e.读数作废 = true;
      throw e;
    }
    console.log(`soak [${名}] ` + SOAK_COLUMNS.map((k) => `${k}=${s[k]}`).join(' ')
      + ` calls=${s.calls} tri=${s.triangles} heap=${s.heap}MB`);
    return s;
  };

  const 行走 = await evalJs('window.__soak.行走见证()');
  if (!Number.isFinite(行走?.位移) || 行走.位移 < 0.5) {
    throw new Error(`按 KeyW 推了 120 帧，玩家只挪了 ${String(行走?.位移)} 米 —— 移动没被驱动起来`
      + `（默认键位变了，或输入被某个面板拦着；当前区 ${String(行走?.区)}）。这一轮的"游玩"不作数`);
  }
  console.log(`soak：移动见证 位移 ${Math.round(行走.位移 * 10) / 10} 米（区 ${行走.区}）`);

  let 热身段帧 = 0;
  let 游玩段帧 = 0;
  let 击杀起点 = 0;
  const 起跑 = Date.now();

  const 跑站 = async (id, 帧数, 段) => {
    await evalJs(`window.__soak.开站(${JSON.stringify(id)})`);
    let 剩 = 帧数;
    while (剩 > 0) {
      const n = Math.min(参数.batchFrames, 剩);
      await evalJs(`window.__soak.帧(${n})`);
      剩 -= n;
    }
    if (段 === '热身') 热身段帧 += 帧数;
    else 游玩段帧 += 帧数;
  };

  const 跑场 = async (i, 帧数, 段) => {
    await evalJs(`window.__soak.开场(${i})`);
    let 剩 = 帧数;
    while (剩 > 0) {
      const n = Math.min(参数.batchFrames, 剩);
      await evalJs(`window.__soak.场帧(${n}, ${i})`);
      剩 -= n;
    }
    if (段 === '热身') 热身段帧 += 帧数;
    else 游玩段帧 += 帧数;
  };

  const 跑一圈 = async (段) => {
    for (let i = 0; i < 计划.stations.length; i += 1) {
      await 跑站(计划.stations[i], 计划.站帧[i], 段);
      const 进 = await evalJs('window.__soak.进度()');
      console.log(`soak [${段}] ${计划.stations[i]} 站内完成 | 游帧=${进.游帧} 击杀=${进.击杀} 区=${进.区} 弹窗=${进.弹窗} 几何=${进.几何 ? `${进.几何.geo}/${进.几何.tex}/${进.几何.prog}` : '?'} 异常=${exceptions.length} 控制台错误=${控制台错误.length}`);
    }
    for (let i = 0; i < 场数; i += 1) {
      await 跑场(i, 计划.场帧, 段);
    }
    const 报 = await evalJs('window.__soak.进度()');
    console.log(`soak [${段}] 圈完成 | 游帧=${报.游帧} 场访问=${报.场访问} 击杀=${报.击杀} 魂=${报.魂} 弹窗=${报.弹窗}`
      + ` 异常=${exceptions.length} 墙钟=${Math.round((Date.now() - 起跑) / 1000)}s`);
  };

  await 跑一圈('热身');
  if (热身段帧 !== 计划.热身帧) {
    throw new Error(`热身段推了 ${热身段帧} 帧，计划 ${计划.热身帧} —— 批量循环少跑了一截，基线不是在同一条路线上取的`);
  }
  console.log(`soak：热身圈完成（${热身段帧} 帧），开始取基线`);

  // 基线落定带一次"全场首绘"：把"看见才上传"的静物从游玩段的账里摘出去（见 全场首绘 的注释）
  const 基线 = 快照读('基线', await evalJs('window.__soak.落定(true)'));
  const 首绘 = await evalJs('window.__soak.首绘读数()');
  console.log(`soak：全场首绘 ${首绘?.帧 ?? '?'} 帧（${首绘?.翻回 ?? '?'} 个隐藏件临时翻成可见，${首绘?.预警 ?? '?'} 只敌人亮过预警圈，光照 ${首绘?.光照 ?? '?'} 盏，其中翻出来的灯 ${首绘?.光翻 ?? 0} 盏）`);
  console.log(`soak：按类型贴近补画 ${首绘?.近画 ?? '?'} 只（${首绘?.近画型 ?? '?'} 类）—— 补画让程序账多出 ${首绘?.近画程序 ?? '?'} 条（多出来的就是六向大锥漏掉的族）；弹体预热 ${首绘?.弹预热 ? '已发一发' : '跳过'}；危险区预热 ${首绘?.危预热 ? '已 spawn 一枚' : '跳过'}；火星预热 ${首绘?.火星预热 ?? '?'} 格；补灯第二轮 ${首绘?.补灯 ? `已补（同一批多出 ${首绘?.二轮程序 ?? '?'} 条 = 区域灯那一档光照键）` : '跳过（场景里找不到点光源可克隆）'}`);
  const 账 = (列) => (列 || []).map((x) => `${x.型}+${x.数}${x.显 ? '' : '(隐)'}/呼${x.呼 ?? '?'}`).join(' ') || '无';
  console.log(`soak：第一轮按类新增 ${账(首绘?.一轮添账)}；第二轮按类新增 ${账(首绘?.二轮添账)}`);
  console.log(`soak：第一轮 ${首绘?.一轮灯 ?? '?'} 盏灯画过、第二轮 ${首绘?.二轮灯 ?? '?'} 盏；程序账按 numPointLights 分档 ${JSON.stringify(首绘?.光档 ?? {})}；咒师长袍材质手里 ${首绘?.袍程序 ?? '?'} 条程序（${(首绘?.袍键 ?? []).join(' ') || '读不到'}）`);
  const 基线复读 = 快照读('基线复读', await evalJs('window.__soak.静置复读()'));
  const 基线漂 = growthProblem(基线, 基线复读);
  if (基线漂.length) {
    const e = new Error(`热身圈不足以把资源账推到稳态：基线复读自己还在涨 —— 这不是游玩段的账，别记错地方。\n - ${基线漂.join('\n - ')}`);
    e.读数作废 = true;
    throw e;
  }

  await evalJs('window.__soak.重置计数()');
  击杀起点 = await evalJs('window.__soak.击杀总数()');
  // 入画溯源的基线取在热身 + 静置复读之后：复读里才第一次入画的东西属于热身的一次性加载
  const 溯源基线 = await evalJs('window.__soak.取溯源基线()');
  console.log(`soak：基线稳定（击杀起点 ${击杀起点}），入画溯源基线 ${溯源基线.几何} 条几何 / ${溯源基线.程序} 条程序，开始 ${参数.minutes} 分钟游玩 = ${计划.游玩帧} 帧`);

  for (let 圈 = 1; 圈 <= 计划.laps; 圈 += 1) {
    await 跑一圈(`游玩${圈}/${计划.laps}`);
  }

  const 终局 = 快照读('终局', await evalJs('window.__soak.落定()'));
  const 终局复读 = 快照读('终局复读', await evalJs('window.__soak.静置复读()'));
  const 进度 = await evalJs('window.__soak.进度()');
  const 击杀 = 进度.击杀 - 击杀起点;
  const 溯源 = await evalJs('window.__soak.溯源新增()');
  // 判据按"程序族"复核：键只差一个场景构成位（光照条数等小整数）的是同族兄弟，
  // 不是新材质族。列表与条数由 growthProblem 自己核对，缺一列就按泄漏处理。
  const 程序族 = { 基线: 溯源基线.程序键, 终局: await evalJs('window.__soak.程序键()') };

  const 重问 = 重载问题(基线上下文, 通道.执行上下文);
  if (重问.length) {
    const 废 = new Error(`本轮读数作废：\n - ${重问.join('\n - ')}`);
    废.读数作废 = true;
    throw 废;
  }

  const 越线 = [
    ...growthProblem(基线, 终局, 程序族),
    ...growthProblem(终局, 终局复读).map((s) => `终局复读仍在涨：${s}`),
    ...journeyProblem(计划, {
      游玩帧: 游玩段帧,
      热身帧: 热身段帧,
      站访问: 进度.站访问,
      场访问: 进度.场访问,
      击杀,
      异常: exceptions.length,
    }),
  ];

  console.log('soak：三项差值 ' + SOAK_COLUMNS.map((k) => `${k} ${终局[k] - 基线[k] >= 0 ? '+' : ''}${终局[k] - 基线[k]}`).join(' / ')
    + ` | 游玩帧 ${游玩段帧}/${计划.游玩帧} | 每站访问 ${JSON.stringify(进度.站访问)} | Boss 场停留 ${进度.场访问}/${计划.laps * 场数}`
    + ` | 击杀 ${击杀} | 异常 ${exceptions.length} | 控制台错误 ${控制台错误.length}`
    + ` | 墙钟 ${Math.round((Date.now() - 起跑) / 1000)}s`);
  // 原始 programs 涨了就交出族读数：族判据放行了哪几条兄弟键、有没有新族（新族已在越线里）
  if (终局.programs !== 基线.programs) {
    const 族读 = programFamilyProblem(程序族.基线, 程序族.终局);
    console.log(`soak：programs 原始 ${终局.programs - 基线.programs >= 0 ? '+' : ''}${终局.programs - 基线.programs} 条 —— 同族场景构成变体 ${族读.豁免数} 条 / 新族 ${族读.未归数} 条（同族 = 键只差一个 0..128 的整数位；原始条数只作读数，判据按族计）`);
    for (const 条 of 族读.豁免.slice(0, 6)) {
      console.log(`  ~ 兄弟键 [${条.位}] ${JSON.stringify(条.基值)}→${JSON.stringify(条.新值)}：${String(条.键).slice(0, 160)}`);
    }
    for (const 键 of 族读.未归.slice(0, 6)) console.log(`  ! 新族键：${String(键).slice(0, 160)}`);
  }
  // 溯源是诊断不是判据：只在那三项真的涨了的时候才值得看，所以永远打在差值之后
  if (溯源?.几何数 || 溯源?.程序数) {
    console.log(`soak：基线之后新入画 ${溯源.几何数} 条几何（仍在 ${溯源.仍在} 条）/ ${溯源.程序数} 条程序`
      + `（renderer.info ${SOAK_COLUMNS.map((k) => `${k} ${终局[k] - 基线[k] >= 0 ? '+' : ''}${终局[k] - 基线[k]}`).join(' / ')}）：`);
    for (const 条 of 溯源.几何) {
      console.log(`  + 帧=${条.帧} ${条.几何} 名=${条.名} 材质=${条.材质} 对象=${条.对象} 挂点=${条.挂点} 可见=${条.可见} 还在场景=${条.还在场景}`);
      console.log(`    父链=${条.父链}`);
    }
    // 入画后当场销毁的那些按"类型|材质"聚成一行：它们进出一次，账面上不该留下 +1
    for (const [键, 数] of 溯源.走了) console.log(`  + 入画后已销毁 ×${数} ${键}`);
    for (const 条 of (溯源.程序新增 || [])) {
      const 名 = 条.材质名 ? `${条.材质}「${条.材质名}」` : 条.材质;
      console.log(`  + 程序首编 帧=${条.帧} 对象=${条.对象}(${条.对象型}) 材质=${名} 侧面=${条.侧面} 劈面=${条.劈面} 透明=${条.透明} 色=${条.色} 可见=${条.可见} 在场景=${条.在场景}`);
      console.log(`    父链=${条.父链}`);
      console.log(`    栈=${条.栈}`);
    }
    for (const 条 of 溯源.程序) {
      const 差 = (溯源.程序差分 || []).find((d) => d.键 === 条)?.差分;
      console.log(`  + program ${条}`);
      if (差) console.log(`    最像的基线差 ${差.差.length} 位：${差.差.map((d) => `[${d.位}] ${JSON.stringify(d.基)}→${JSON.stringify(d.新)}`).join('；')}`);
      else console.log('    基线里没有同长度的键可比（另一族着色器）');
    }
  }
  if (溯源?.场景新增数) {
    console.log(`soak：基线之后场景树上新挂 ${溯源.场景新增数} 件（前 ${溯源.场景新增.length} 件的来路）：`);
    for (const 条 of 溯源.场景新增) console.log(`  + ${条.名} 几何=${条.几何}\n    栈=${条.栈}`);
  }
  if (溯源 && (溯源.新光?.length || 溯源.少了光?.length || 溯源.光照基线数 !== 溯源.光照数 || 溯源.光变迁数)) {
    console.log(`soak：可见光源 基线 ${溯源.光照基线数} → 终局 ${溯源.光照数}`
      + `（每站开站时：${JSON.stringify(进度.站光)}；渲染窗口里变了 ${溯源.光变迁数} 次）`
      + ' —— 程序缓存键带 numPointLights，光照构成一变受光材质就重编：');
    for (const o of 溯源.新光) console.log(`  + 新可见光源 ${o.型} 名=${o.名} 强度=${o.强} 父链=${o.父链}`);
    for (const o of 溯源.少了光) console.log(`  - 不再可见 ${o.型} 名=${o.名} 父链=${o.父链}`);
    for (const c of (溯源.光变迁 || [])) {
      const 标 = (arr) => arr.map((o) => `${o.型}/名=${o.名}/强=${o.强}`).join('、') || '无';
      console.log(`  ~ 光照变迁 帧=${c.帧} 可见灯 ${c.前}→${c.后} 盏：来 ${标(c.新)}；走 ${标(c.走)}`);
    }
  }
  if (控制台错误.length) {
    console.log('soak：控制台 error 前几条（不判红，但值得看）：\n  - ' + 控制台错误.slice(0, 5).join('\n  - '));
  }
  if (exceptions.length) {
    console.log('soak：未捕获异常前几条：\n  - ' + exceptions.slice(0, 5).map((s) => String(s).split('\n')[0]).join('\n  - '));
  }

  if (越线.length) {
    console.error('soak 越线：\n - ' + 越线.join('\n - '));
    failures = 1;
  } else {
    console.log(`soak: ${参数.minutes} 分钟游玩跑满，三项零增长，异常 0`);
  }
  ws.close();
} catch (err) {
  console.error('soak 失败：', err?.message ?? err);
  if (!err?.读数作废) {
    const 归因 = 重载问题(基线上下文, 通道.执行上下文);
    if (归因.length) console.error('soak 归因：\n - ' + 归因.join('\n - '));
  }
  failures = 2;
} finally {
  clearTimeout(墙钟保险);
  cleanup();
  setTimeout(() => process.exit(failures), 300);
}
