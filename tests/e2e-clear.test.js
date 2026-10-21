/**
 * 无头 E2E 自动通关的门禁 —— W-D4 切片3。
 *
 * `npm run e2e` 起真游戏、驱动 `startFullDemo()` 把整条主线走一遍。这条门禁守两样：
 *
 * ① **预算表不许被放松**（与 `tests/perf-smoke.test.js` 同一把尺）：把 `maxFrames` 调大
 *    或把 `requireCompleted` 关掉，门禁就变成了"跑完就算过"的摆设；
 * ② **那三个让读数可信的装置不许被拆掉** —— 固定步长、手工推帧、动态端口。
 *    它们看着像实现细节，其实是"这条门禁说的话算不算数"的全部依据：
 *    拆掉固定步长 → 读数随机器快慢漂；改回 rAF → 无头页被饿死，读的是节流不是游戏；
 *    改回写死端口 → 连跑两次必有一次红（实测过）。拆掉"通关断言"更是直接静默通过；
 * ③ **这一轮连的是不是自己起的那台浏览器、那个页**（W-C2 切片6c，与 `perf-smoke` 同一把尺）：
 *    口不能靠探（Chrome 撞口时不报错、只是不开口，而探到别人的口就连进别人的浏览器），
 *    页地址必须落在本进程的 dev 口上，"异常 0 条"那句预算更是要先见证事件通道真的在送东西
 *    —— "通道断了"与"页面没抛错"读出来是同一个 0；
 * ④ **这一轮从头到尾是同一个页**（W-C2 切片6d）：这 44 步要靠几百次 `evalJs` 打在同一个页面上跑完，
 *    共用工作树里谁往 `src/` 写一下就是一次 vite 全量重载 —— `window.__game` 变回 undefined，
 *    最先红的是一句 `TypeError: … reading 'quests'`，读起来像主线坏了。
 *    作废判据 `重载问题` 的正反行为在 `tests/perf-smoke.test.js` 测（判据不抄两份），这里钉接线。
 *
 * 归属三判（`解析CDP口` / `页地址问题` / `通道问题`）住在 `scripts/harness-readings.mjs`，
 * **它们的正反行为在那里测**（`tests/perf-smoke.test.js`）。这里只钉接线：调了没、不合格抛了没、
 * 顺序对不对、旧写法回潮了没。这么分是因为 2026-10-22 的变异臂实测：把判据写成"源码里有没有那句
 * 拒绝话术"的正则，`if (条件)` 换成 `if (false)` 也不会红 —— 声明式腿等于没有腿。
 *
 * 这里按**结构**断言（源码里有那几行），因为脚本跑一次要几十秒、要起浏览器 ——
 * 把它塞进 `npm test` 会让整个套件慢一个量级，那正是 W-D4 把它单列成 `npm run e2e` 的理由。
 * 真读数由 `npm run e2e` 出（实测：5160 帧 / 86 秒模拟 / questIndex=32 / 主线 33 步 / 0 异常，
 * 连跑三次逐帧相同）。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { E2E_BUDGETS } from '../scripts/e2e-budgets.mjs';

const ROOT = process.cwd();
const SCRIPT = join(ROOT, 'scripts', 'e2e-clear.mjs');
const 源文 = existsSync(SCRIPT) ? readFileSync(SCRIPT, 'utf8') : '';

/**
 * 判据写成函数 —— 这样它们能同时喂给真源码（必须全过）与一份**人造坏脚本**（必须全挂）。
 * 不这么写的话，"判据永远返回 true"与"源码真的没问题"在读数上一模一样。
 */
const 判据 = {
  固定步长在: (s) => s.includes('window.__game.clock.getDelta = () => 1 / 60'),
  // 比的是**两条语句**的先后（不是整份源码里两个词的位置）：头注里两个词都出现过，
  // 拿全文 indexOf 比会拿注释当代码 —— 第一版就这么红的。
  先换步长再起跑: (s) => {
    const 补丁 = s.indexOf('window.__game.clock.getDelta = () => 1 / 60');
    const 起跑 = s.indexOf('qa.startFullDemo()');
    return 补丁 >= 0 && 起跑 >= 0 && 补丁 < 起跑;
  },
  手工推帧: (s) => s.includes('window.__game.update()'),
  不用rAF: (s) => !s.includes('requestAnimationFrame'),
  // dev 口仍按当下空闲的取；CDP 那上口不再抢（下面 口由Chrome自报 / 不探口 两条管它）
  端口动态: (s) => s.includes('const VITE_PORT = await freePort()') && !/const VITE_PORT = \d/.test(s),
  通关断言在: (s) => s.includes('requireCompleted'),
  失败退出码在: (s) => s.includes('process.exit(failures)'),
  失败信息可排查: (s) => s.includes('主线没走完') && s.includes('questIndex=') && s.includes('耗尽预算'),

  // —— 归属三件（切片6c）：口、页、通道 ——
  口由Chrome自报: (s) => s.includes('const CDP_SPEC = 0;')
    && s.includes('--remote-debugging-port=${CDP_SPEC}')
    // 只收"语句"形状：头注里那句"此前这里写的是 `const CDP_PORT = await freePort()`"
    // 是**故意留下的历史**，不该被这条腿当成回潮（注释里的 token 会自己进门禁）。
    && !/^\s*const CDP_PORT\s*=/m.test(s),
  收浏览器说的话: (s) => s.includes("stdio: ['ignore', 'pipe', 'pipe']")
    && s.includes("chrome.stderr.on('data'") && s.includes("chrome.stdout.on('data'"),
  取口有界且判据在外: (s) => /读CDP口\(等待毫秒 = \d+\)/.test(s)
    && s.includes('解析CDP口(全文)') && s.includes('Date.now() >= 截止')
    && /from '\.\/harness-readings\.mjs'/.test(s),
  不探口: (s) => !/waitForHttp\([^)]*CDP/.test(s) && !s.includes('/json/version'),
  页归属在: (s) => s.includes('const 页问 = 页地址问题(页地址, VITE_PORT);')
    && s.includes('if (页问.length) throw new Error('),
  通道见证在: (s) => s.includes('const 通问 = 通道问题(通道);')
    && s.includes('if (通问.length) throw new Error(')
    && s.includes('Runtime.executionContextCreated') && s.includes('Page.loadEventFired'),
  页目标有守卫: (s) => s.includes('没有 page 目标') && s.includes("targets.find((t) => t.type === 'page')"),
  拔整棵树: (s) => s.includes("'/T', '/F'") && s.includes('function 拔树(')
    // 裸 kill() 的清理写法回潮 = Windows 上留下孤儿 Chrome = 下一轮假红
    && !/try \{ chrome\.kill\(\); \} catch/.test(s),
  抛错带原话: (s) => s.includes('d.exception?.description') && s.includes('页面内抛错 @'),
};

/**
 * 切片6d 的接线腿（#167）：页在中途被重建 ⇒ 本轮读数作废。
 *
 * 与 `tests/perf-smoke.test.js` 里同名的那一组**形状一致、锚点不同**：
 * 那边用第一站当"测量开始"的锚，这边用 `qa.startFullDemo()`；
 * 预算表也各是各的（`PERF_BUDGETS` / `E2E_BUDGETS`）。
 * 判据本体（`重载问题` 收到什么输入报什么话）只在 `tests/perf-smoke.test.js` 测一遍 ——
 * 在两个文件里各复刻一遍判断，就会有两把尺子各自漂。
 */
const 接腿 = {
  调了判据: (s) => /const 重问 = 重载问题\(基线上下文, 通道\.执行上下文\);/.test(s),
  不合格就作废: (s) => s.includes('if (重问.length) {') && s.includes('废.读数作废 = true;') && s.includes('throw 废;'),
  基线取在见证之后起跑之前: (s) => {
    const 见 = s.indexOf('const 通问 = 通道问题(通道)');
    const 基 = s.indexOf('基线上下文 = 通道.执行上下文;');
    const 起跑 = s.indexOf('qa.startFullDemo()');
    return 见 >= 0 && 基 >= 0 && 起跑 >= 0 && 见 < 基 && 基 < 起跑;
  },
  作废在算越线之前: (s) => {
    const 作 = s.indexOf('const 重问 = 重载问题(');
    const 预 = s.indexOf('const 预算 = E2E_BUDGETS;');
    return 作 >= 0 && 预 >= 0 && 作 < 预;
  },
  归因在catch里: (s) => s.includes('if (!err?.读数作废) {')
    && s.includes('const 归因 = 重载问题(基线上下文, 通道.执行上下文);')
    && s.includes("console.error('e2e-clear 归因："),
  // 计数器只能有一份，且声明在 try 外面（catch 读得到）。try 内再 const 一次 = 遮蔽 = 归因永远读到 0。
  通道只有一份: (s) => (s.match(/^\s*const 通道 = /gm) ?? []).length === 1
    && (s.match(/^\s*let 基线上下文 = /gm) ?? []).length === 1
    && s.search(/^\s*const 通道 = /m) < s.indexOf('let failures = 0;'),
};

describe('无头 E2E 自动通关（W-D4 切片3）', () => {
  it('脚本在，npm script 接上了（没接线的门禁只有写它的人会跑）', () => {
    expect(existsSync(SCRIPT), 'scripts/e2e-clear.mjs 不在了').toBe(true);
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts.e2e, 'package.json 里没有 "e2e" 脚本').toBe('node scripts/e2e-clear.mjs');
  });

  it('预算表按值钉死：只许收紧，不许放松（实测 5160 帧 / 86 秒模拟，见脚本头注）', () => {
    expect(E2E_BUDGETS.maxFrames, '推帧预算被放松（实测 5160，门禁值 12000）').toBeLessThanOrEqual(12000);
    expect(E2E_BUDGETS.exceptions).toBe(0);
    expect(E2E_BUDGETS.requireCompleted, '关掉"必须通关"这条，门禁就废了').toBe(true);
    expect(E2E_BUDGETS.minMainlineSteps, '分母守卫被放松（实测主线 33 步）').toBeGreaterThanOrEqual(30);
    // 每一项都得是正数 —— 写成 0，门禁就在空转
    expect(E2E_BUDGETS.maxFrames).toBeGreaterThan(0);
    expect(E2E_BUDGETS.minMainlineSteps).toBeGreaterThan(0);
  });

  it('三个让读数可信的装置都在（固定步长 / 手工推帧 / 动态端口）', () => {
    expect(判据.固定步长在(源文), '固定步长那一步不见了 —— 读数不再可复现').toBe(true);
    expect(判据.先换步长再起跑(源文), '先起跑后换步长 —— 前几步仍按真实 dt 走').toBe(true);
    expect(判据.手工推帧(源文), '推帧那一句不见了').toBe(true);
    expect(判据.不用rAF(源文), '用了 rAF —— 无头页的帧由合成器供给，那种读数量的是节流不是游戏').toBe(true);
    expect(判据.端口动态(源文), '端口又写死了 —— 上一轮 Chrome 没退干净时连跑两次必红').toBe(true);
  });

  it('不许静默通过：通关断言与失败退出码都在，且失败信息点得出卡在哪一步', () => {
    expect(判据.通关断言在(源文), '通关断言不见了 —— 那样"跑完就算过"').toBe(true);
    expect(判据.失败退出码在(源文), '失败退出码不见了').toBe(true);
    // 只报一句"没通过"等于把排查成本推给下一个人：必须带上"走到第几步 / 第几章"
    expect(判据.失败信息可排查(源文), '失败信息里看不出卡在哪一步').toBe(true);
  });

  it('CDP 口由 Chrome 自报，不再靠探（探到的"空"只属于那一瞬间）', () => {
    expect(判据.口由Chrome自报(源文), '口又回潮成脚本自己定的了 —— Chrome 撞口时不开口，只红成"CDP 口没起来"').toBe(true);
    expect(判据.收浏览器说的话(源文), "没收 Chrome 的 stderr/stdout —— 那句 'DevTools listening on' 无处可读").toBe(true);
    expect(判据.取口有界且判据在外(源文), '取口没有界，或解析判据没走 harness-readings —— 挂住而不是红，且判据在两个 harness 里各漂一份').toBe(true);
    expect(判据.不探口(源文), '还在用 waitForHttp 探 CDP 口：口通了不等于那是本进程的浏览器').toBe(true);
  });

  it('这一轮连的是自己那个页，且"异常 0 条"有通道正面见证', () => {
    expect(判据.页目标有守卫(源文), '没有 page 目标时裸 TypeError（reading webSocketDebuggerUrl）会把"缺页"报成脚本坏了').toBe(true);
    expect(判据.页归属在(源文), '页归属见证不见了 —— 那 44 步可能走的是别人的构建').toBe(true);
    expect(判据.通道见证在(源文), '通道正面见证不见了 —— 通道断了与页面没抛错读出来是同一个 0，那条预算就在空转').toBe(true);
    // 见证必须**在起跑之前**：跑完再看通道，中间那些异常是不是送进来了无从可证
    const 见证 = 源文.indexOf('const 通问 = 通道问题(通道)');
    const 起跑 = 源文.indexOf('qa.startFullDemo()');
    expect(见证 >= 0 && 起跑 >= 0 && 见证 < 起跑, '先起跑再验通道 —— exceptions=0 那句已经失去依据').toBe(true);
    // dev 口与页地址用同一个口：页归属比的是 VITE_PORT，不是另一个数
    expect(判据.端口动态(源文), 'dev 口不再是取自当下空闲 —— 页归属那条就没有可比的口').toBe(true);
  });

  it('收尾拔的是整棵树，页面异常带得出原话', () => {
    // Windows 上 child.kill() 只终止那一个 PID，headless Chrome 的孤儿们把主进程钉住
    // ⇒ 上一轮的浏览器还活着 ⇒ 下一轮撞上占口，红成"CDP 口没起来"（责任落在没改过的代码上）
    expect(判据.拔整棵树(源文), '清理回潮成裸 kill() —— 占口假红的因还在').toBe(true);
    const 拔 = 源文.indexOf('拔树(chrome);');
    const 删 = 源文.indexOf('rmSync(profileDir');
    expect(拔 >= 0 && 删 >= 0 && 拔 < 删, '先删 profile 再拔树 —— 浏览器还活着时那目录删不动').toBe(true);
    // 只报"页面内抛错"的 JSON 前 300 字，会把 description 正好切掉：红得看不出是哪一句拒
    expect(判据.抛错带原话(源文), '页面异常没带原话与位置').toBe(true);
  });

  it('页在中途被重建 ⇒ 本轮读数作废并点名，而不是红成一句页面内 TypeError', () => {
    /**
     * 这 44 步要靠几百次 `evalJs` 打在同一个页面上跑完。共用工作树里谁往 `src/` 写一下
     * ⇒ vite 发一次全量重载 ⇒ `window.__game` 变回 undefined ⇒ 最先红的是一句
     * `TypeError: Cannot read properties of undefined (reading 'quests')` ——
     * 那句红读起来像"主线第 N 步坏了"，而真实原因是"这一轮的页被换掉了"。
     * 归因记错地方，下一个人就会去查一个没被改过的文件。
     *
     * 正面信号是 `Runtime.executionContextCreated` 的条数：本仓不起 worker、不挂 iframe，
     * 一次正常轮次里它不该动（实测见 `docs/MASTER_PLAN.md` §9 的回填）。它一动就是页被重建过。
     */
    expect(源文, '脚本没有 import 重载问题').toMatch(/import \{[^}]*重载问题[^}]*\} from '\.\/harness-readings\.mjs'/);
    for (const [名, 尺] of Object.entries(接腿)) {
      expect(尺(源文), `接线腿"${名}"在真源码上不过`).toBe(true);
    }
    // 计数的正面来源：谁在数执行上下文条数（没人数的话，这一判读的是两个常数）
    expect(源文, '没有人在数执行上下文条数').toMatch(/通道\.执行上下文 \+= 1/);
  });

  it('反向控制：6d 的四处拆法各自被对应的腿抓住', () => {
    // 与 perf 一侧同一批坏法 —— 两个 harness 要坏得一样红，否则"共用一把尺"只是话术
    const 坏 = {
      不调判据: 源文.replace('const 重问 = 重载问题(基线上下文, 通道.执行上下文);', 'const 重问 = [];'),
      条件废掉: 源文.replace('if (重问.length) {', 'if (false) {'),
      基线不取: 源文.replace('  基线上下文 = 通道.执行上下文;', ''),
      归因删掉: 源文.replace('if (!err?.读数作废) {', 'if (false) {'),
      计数器遮蔽: 源文.replace('  const exceptions = [];', '  const exceptions = [];\n  const 通道 = { 执行上下文: 0, 加载完成: 0 };'),
    };
    expect(接腿.调了判据(坏.不调判据), '判据不调，腿却仍判为"调了"').toBe(false);
    expect(接腿.作废在算越线之前(坏.不调判据), '判据被换成常量，"作废排在越线之前"却仍判为真').toBe(false);
    expect(接腿.不合格就作废(坏.条件废掉), 'if 改成 if (false)，腿却仍判为"会抛"').toBe(false);
    expect(接腿.基线取在见证之后起跑之前(坏.基线不取), '基线不取了，腿却仍判为"顺序对"').toBe(false);
    expect(接腿.归因在catch里(坏.归因删掉), '归因没了，腿却仍判为"在 catch 里"').toBe(false);
    expect(接腿.通道只有一份(坏.计数器遮蔽), 'try 内再 const 一次把外层遮蔽了，腿却仍判为"只有一份"').toBe(false);
    // 控制的控制：每一处只坏在自己那一格上（其余腿照过），否则一条红带倒五条就说不清是哪只蝴蝶
    expect(接腿.不合格就作废(坏.不调判据), '不调判据那一处连累了别的腿').toBe(true);
    expect(接腿.归因在catch里(坏.条件废掉)).toBe(true);
    expect(接腿.调了判据(坏.归因删掉)).toBe(true);
    expect(接腿.调了判据(坏.计数器遮蔽)).toBe(true);
  });

  it('判据与执行分家：可执行脚本不许导出东西，判据在无副作用的表里', () => {
    // 这一条防的是本文件自己踩过的坑：一开始 `E2E_BUDGETS` 定义在 `e2e-clear.mjs` 里，
    // 于是 `import` 它 = 在 `npm test` 里真起一个浏览器把 E2E 跑一遍（实测 151 秒，
    // 外加一条 `process.exit unexpectedly called`）。`perf-smoke.mjs` 至今是这个形状。
    expect(源文, 'e2e-clear.mjs 又导出了东西 —— 下一个人会 import 它，然后单测里跑起浏览器')
      .not.toMatch(/^export /m);
    expect(existsSync(join(ROOT, 'scripts', 'e2e-budgets.mjs')), '预算表模块不在了').toBe(true);
  });

  it('反向控制：同一批判据喂给人造坏脚本，必须全部报错（自证判据不是空转）', () => {
    // 坏的地方分两批。老的四条：拆掉固定步长、改回 rAF、dev 口写死、把"必须通关"关掉。
    // 切片6c 新加的七处：口回潮成自己定、不收 Chrome 的话、探口回潮、两处见证拆成不抛、
    // 页归属判据不调、清理退回裸 kill()。每一条都应当被对应的腿抓住 ——
    // 抓不住的那条就是空转的腿（2026-10-22 电池上 A4/A5 就是这么被发现的）。
    const 坏 = 源文
      .replace('window.__game.clock.getDelta = () => 1 / 60; true', '')
      .replace('window.__game.update()', 'requestAnimationFrame(() => window.__game.update())')
      .replace('const VITE_PORT = await freePort();', 'const VITE_PORT = 5322;')
      .replace('const CDP_SPEC = 0;', 'const CDP_PORT = await freePort();')
      .replace("--remote-debugging-port=${CDP_SPEC}", '--remote-debugging-port=${CDP_PORT}')
      .replace("stdio: ['ignore', 'pipe', 'pipe']", "stdio: 'ignore'")
      .replace('const 得 = 解析CDP口(全文);', 'const 得 = /DevTools listening on ws/.test(全文) ? { 口: CDP_PORT } : null;')
      .replace('  const targets = await', "  if (!await waitForHttp(`http://127.0.0.1:${CDP_PORT}/json/version`)) throw new Error('Chrome CDP 口没起来');\n  const targets = await")
      .replace('const 页问 = 页地址问题(页地址, VITE_PORT);', 'const 页问 = [];')
      .replace('if (通问.length) throw new Error(', 'if (通问.length) console.warn(')
      .replace('CDP 口 ${CDP口} 通了但 /json/list 里没有 page 目标', '连不上页')
      .replace('const 原话 = d.exception?.description ?? d.exception?.value ?? d.text', "const 原话 = '?'")
      .replace("spawnSync('taskkill', ['/PID', String(子进程.pid), '/T', '/F'], { stdio: 'ignore' })", '子进程.kill()')
      .replace('requireCompleted: true', 'requireCompleted: false');
    expect(判据.固定步长在(坏), '拆掉固定步长却仍判为"在"').toBe(false);
    expect(判据.先换步长再起跑(坏), '拆掉固定步长却仍判为"顺序对"').toBe(false);
    expect(判据.不用rAF(坏), '改回 rAF 却仍判为"没用"').toBe(false);
    expect(判据.端口动态(坏), '端口写死却仍判为"动态"').toBe(false);
    expect(判据.口由Chrome自报(坏), '口回潮成自己定却仍判为"Chrome 自报"').toBe(false);
    expect(判据.收浏览器说的话(坏), '不收 Chrome 的话却仍判为"收了"').toBe(false);
    expect(判据.取口有界且判据在外(坏), '解析判据搬回本地却仍判为"在外面"').toBe(false);
    expect(判据.不探口(坏), '探口回潮却仍判为"没探"').toBe(false);
    expect(判据.页归属在(坏), '页归属不调判据却仍判为"在"').toBe(false);
    expect(判据.通道见证在(坏), '通道见证降级成 console.warn 却仍判为"会抛"').toBe(false);
    expect(判据.拔整棵树(坏), '清理退回裸 kill() 却仍判为"拔整棵树"').toBe(false);
    // 预算表那两条是**按值**判的，坏脚本改的是源码文本，所以另拿一份改过的值来验
    expect({ ...E2E_BUDGETS, requireCompleted: false }.requireCompleted, '关掉通关断言却仍判为真').toBe(false);
  });
});
