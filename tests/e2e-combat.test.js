/**
 * 战斗 E2E 冒烟的门禁 —— W-D4 切片7。
 *
 * `npm run e2e:combat` 起真游戏、贴脸一只影之战士、给真输入把整条战斗链跑通
 * （感知 → 追击 → 互殴 → 击杀 → 魂火入账 → 击杀账本 +1）。这条门禁守六样：
 *
 * ① **阈值不许被放松**（`E2E_COMBAT_BUDGETS` 按值钉）：把 `maxKillFrames` 从 2400 抬到 24000，
 *    门禁还在跑，但它已经改成"总有一天打得死"；把 `aiProbeFrames` 调大是同一件事的慢版本。
 * ② **不许走白盒捷径**：这条门禁的全部价值在于结算由 `CombatController` 的打击窗口
 *    **自己撞出来**。脚本里一旦出现 `兵.hp = 0` / `takeDamage(` 这种直接扣血，
 *    "打得死"就退化成"赋值能执行"，链条断在任何一环（感知、追击、打击窗口、结算、账本）都读不出来。
 *    同一条还管**页内那个对象路径**：脚本写 `g.combat.mouseDown` 而游戏锁存在 `g.player.combat` 上，
 *    这一条门禁从写下到切片7 **一次都没绿过**（它先死在更前面的旧形状上），
 *    路径按 `Game.js` 里真 mousedown 监听那一句现取，游戏改名时红话点得出"两边不是同一个对象"。
 * ③ **这一轮连的是不是自己起的那台浏览器、那个页**（W-C2 切片6c，与 `perf-smoke` / `e2e-clear`
 *    同一把尺）：口不能靠探（Chrome 撞口时不报错、只是不开口；探到别人的口就连进别人的浏览器），
 *    页地址必须落在本进程的 dev 口上，"异常 0 条"那句要先见证事件通道真的在送东西
 *    —— "通道断了"与"页面没抛错"读出来是同一个 0；收尾要拔整棵树，
 *    否则 Windows 上的孤儿 Chrome 会把下一轮变成假红。
 * ④ **这一轮从头到尾是同一个页**（切片6d 同一条）：这一轮要跑几十秒、几百次 `evalJs`，
 *    共用工作树里谁往 `src/` 写一下就是一次 vite 全量重载 —— `window.__game` 变回 undefined，
 *    最先红的是一句 `TypeError: … reading 'enemyManager'`，读起来像战斗链坏了。
 *    作废判据 `重载问题` 的正反行为在 `tests/perf-smoke.test.js` 测（判据不抄两份），这里钉接线。
 * ⑤ **这一轮得跑得完**（切片7b，换上口径之后第一次真跑才看得见的）：步长要钉成 `1/60`
 *    （`Game.update()` 读 `clock.getDelta()`，手动推帧时 dt = 上一帧的真实耗时，秒级 dt 让每帧
 *    推进好几秒的世界 ⇒ 越跑越贵），绘制要按 `renderEvery` 的节拍走（无头页是软件 GL，
 *    实测一帧 `render()` ~2.1 秒 ⇒ 每帧都画就是四十分钟）。方向与①相反的那一条：
 *    这里**收紧**节拍（收到 1）才是坏事 —— 一条没人跑得动的门禁等于没有门禁。
 * ⑥ **判据问的必须是它以为自己问的那件事**（切片7c，①~⑤ 全部接上之后第一次跑完整轮才红出来的）：
 *    r7 交回两条越线，两条都是判据踩空 —— 站 1 拿首末两个 state 点当"卡死"（那只兵打完一套
 *    连段又回到 `windup`，而 `我掉血` 明明是 `true`），站 2 在敌人断气那一帧读 `stats.souls`
 *    （魂火是掉在地上的一件掉落物，要玩家走进拾取半径才入账）。这一族在脚本里改不动：
 *    脚本要么真起浏览器要么什么都不测，所以越线表搬进 `scripts/harness-readings.mjs` 的
 *    `战斗越线`，本文件拿**合成读数**把"走完连段必须绿 / 卡在单一态必须红 / 空尺必须红"逐格演一遍。
 *    同一条还管词汇表：`aiEngagedStates` 逐格与 `EnemyFSM` 的真名册对账 —— r7 手抄那份里
 *    `attack` / `light` / `heavy` 三格是**玩家**的态，敌人永远不可能等于它们。
 *
 *
 * 归属三判（`解析CDP口` / `页地址问题` / `通道问题`）住在 `scripts/harness-readings.mjs`，
 * **它们的正反行为在那里测**。这里只钉接线：调了没、不合格抛了没、顺序对不对、旧写法回潮了没。
 * 这么分是因为 2026-10-22 的变异臂实测：把判据写成"源码里有没有那句拒绝话术"的正则，
 * `if (条件)` 换成 `if (false)` 也不会红 —— 声明式腿等于没有腿。
 *
 * 这里按**结构**断言（源码里有那几行），因为脚本跑一次要几十秒、要起浏览器。
 * 真读数由 `npm run e2e:combat` 出（读数见 `docs/MASTER_PLAN.md` §9 的回填）。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { E2E_COMBAT_BUDGETS } from '../scripts/e2e-budgets.mjs';
import { 战斗越线 } from '../scripts/harness-readings.mjs';
import { ENEMY_STATE_NAMES } from '../src/ai/EnemyFSM.js';

const ROOT = process.cwd();
const SCRIPT = join(ROOT, 'scripts', 'e2e-combat.mjs');
const 源文 = existsSync(SCRIPT) ? readFileSync(SCRIPT, 'utf8') : '';
/** 页内那句"按下左键"要贴在**游戏自己的**那个锁存对象上，所以对象路径从这里现取而不是在门禁里抄第二份 */
const 游戏 = readFileSync(join(ROOT, 'src', 'core', 'Game.js'), 'utf8');

/**
 * 站 2 那一段（到墙钟交账为止）。
 *
 * 为什么要切出来：`g.player.teleport(...)` 在**站 0 是正当的**（摆夹具：把玩家扔到兵跟前），
 * 在站 2 的收尸窗口里就是作弊（用传送踩上掉落，等于不证"玩家走得过去"）。
 * 全文级 `!s.includes('teleport')` 会连站 0 一起禁掉，写的人只好把传送改名 —— 那是把判据
 * 改成障碍赛。按站切段之后，同一条禁令只咬它该咬的那一段。
 */
const 站2段 = (s) => (s.split('  // 站2')[1] ?? '').split('R.墙钟秒.站2')[0];

/**
 * 判据写成函数 —— 这样它们能同时喂给真源码（必须全过）与一份**人造坏脚本**（必须全挂）。
 * 不这么写的话，"判据永远返回 true"与"源码真的没问题"在读数上一模一样。
 */
const 判据 = {
  // —— 战斗链自己（切片3 立的那三站，本片只搬 bootstrap）——
  三站都在: (s) => s.includes('R.前置 = await evalJs(') && s.includes('R.ai = await evalJs(')
    && s.includes('R.击杀 = await evalJs('),
  // 真输入：按下左键的**边沿**交给主循环自己缓冲出招，而不是脚本替游戏结算
  // 只判"边沿的形状"（每 12 帧给一次按下），对象归属交给下面那条同源腿 ——
  // 两条腿各判一件事，路径变了时红的是"两边不是同一个对象"，而不是顺带把边沿那条也带走。
  真输入边沿: (s) => /mouseDown\['left'\] = true/.test(s) && s.includes('if (帧 % 12 === 0)'),
  /**
   * 页内那句锁存写的是**哪个对象**，从 `Game.js` 里真 mousedown 监听那一句现取。
   *
   * 这一条是本片真红出来的：脚本此前写的是 `g.combat.mouseDown`，而游戏里那把锁存在
   * `g.player.combat` 上 ⇒ 站 2 一进门就是 `TypeError: … reading 'mouseDown'`，
   * 一轮十几分钟的浏览器跑下来只换来一句"页内抛错"。路径抄第二份在门禁里，
   * 游戏改名时门禁只会说"腿不过"；从这里现取，游戏改名时这条腿说的是"两边不是同一个对象"。
   */
  锁存路径同游戏: (s) => {
    const 得 = /if \(e\.button === 0\) this\.([A-Za-z0-9_.]+)\.mouseDown\.left = true;/.exec(游戏);
    return !!得 && s.includes(`g.${得[1]}.mouseDown['left'] = true`);
  },
  不白盒扣血: (s) => !/\.takeDamage\(/.test(s) && !/兵\.hp\s*=[^=]/.test(s) && !/\.die\(\)/.test(s),
  推的是真帧: (s) => s.includes('g.update();') && s.includes('g.render();'),
  击杀要见魂火与账本: (s) => s.includes('魂入账') && s.includes('击杀账') && s.includes('g.stats.souls'),
  /**
   * 站 1 交的是**走过的那条轨迹**，不是"第一帧的态 + 最后一帧的态"两个点（切片7c）。
   *
   * r7 那次假红就是这么来的：夹具把玩家扔到兵跟前时它已经在 `windup`，120 帧打完一套连段
   * 又回到 `windup` ⇒ `后 === 前` ⇒ 报"没有追击/出手"，而同一份读数里 `我掉血` 是 `true`。
   * 三个锚各判一件事：采样的位置（循环里，不是循环外）、交回来的字段、旧的两点写法不许回潮。
   */
  站1交轨迹: (s) => {
    const 段 = s.split('  // 站2')[0] ?? '';
    return (段.match(/记一笔\(\)/g) ?? []).length >= 2 && /return \{ 轨迹:/.test(段)
      && !段.includes('const 前 = 兵.state');
  },
  /**
   * 站 2 断气之后还有一段**收尸**：魂火是掉在地上的一件掉落物，要玩家走进去才入账
   * （`EnemyManager.js:516` 掉 → `LootSystem.js:388` 捡），在断气那一帧读账读到的 0 不是断链。
   * 走路用真输入（`KeyW` + 面向最近掉落），不 `teleport`：站 0 传送是**摆夹具**，
   * 收尸那一段要证的正是"玩家自己走得过去"，用传送踩点等于把这一站改成赋值能执行。
   */
  站2收尸走真输入: (s) => {
    const 段 = 站2段(s);
    // 三样各判一件事：真输入在、帧数从表里取、窗口**自己会走**（`while` 且带"账动了就停"那个逃生条件）。
    // 最后一样是被变异臂逼出来的：只查三个 token 在不在的话，`while (…)` 换成 `if (false && …)`
    // 三个 token 一个不少，腿照绿，而窗口已经永远不会走一步。
    return 段.includes("g.keys['KeyW'] = true") && 段.includes('收尸帧')
      && /while \(收尸帧 < \$\{预算\.lootProbeFrames\} && g\.stats\.souls === 旧魂\)/.test(段);
  },
  收尸不抄近路: (s) => !站2段(s).includes('.teleport('),
  /** 越线表搬进 `harness-readings`；手抄那份态名单里躺着三个玩家态，不许回潮 */
  越线表搬进判据: (s) => s.includes('战斗越线(R, 预算, exceptions)')
    && /import \{[^}]*战斗越线[^}]*\} from '\.\/harness-readings\.mjs';/.test(s)
    && !s.includes("'attack', 'light', 'heavy'"),
  断言不许静默: (s) => s.includes('if (越线.length) {') && s.includes('failures = 1;')
    && s.includes('process.exit(failures)'),
  阈值走表: (s) => s.includes('const 预算 = E2E_COMBAT_BUDGETS;')
    && s.includes('${预算.maxKillFrames}') && s.includes('${预算.aiProbeFrames}')
    && s.includes('${预算.renderEvery}'),
  厚血只有一个真源: (s) => (s.match(/\$\{预算\.playerHp\}/g) ?? []).length >= 3
    && !/hp = 99999/.test(s),

  // —— 墙钟（切片7b）：这一条门禁**跑不跑得完**也是判据的一部分 ——
  /**
   * 钉步长。`Game.update()` 读 `clock.getDelta()`，手动推帧时那个 dt = 上一帧的**真实耗时**：
   * 无头页一帧两秒 ⇒ 每帧推进两秒的世界 ⇒ 下一帧更贵。探针读到"贴脸纯 update 1152 ms/帧"，
   * 而 perf 榜上同一台机器的 `updateP95` 是 12~16 ms —— 差的一百倍是 dt，不是机器。
   * 不钉住就没有"2400 帧"这个预算可言：那个数此前测的是这台机器当时多忙。
   */
  步长钉住: (s) => s.includes("evalJs('window.__game.clock.getDelta = () => 1 / 60; true')"),
  /**
   * 绘制有节拍。判的是**节拍写在表里**且**没有一处无条件绘制**（每帧都绘 = 四十分钟；一帧不绘 =
   * "打着打着画面管线炸了"没人管）。两处循环都要挂同一个 `${预算.renderEvery}`，否则改一处只是半条腿。
   */
  绘制有节拍: (s) => (s.match(/% \$\{预算\.renderEvery\} === 0\) g\.render\(\);/g) ?? []).length >= 2
    && !/^\s*g\.render\(\);$/m.test(s),
  墙钟有读数: (s) => s.includes('R.墙钟秒.站1 = 秒表.读();') && s.includes('R.墙钟秒.站2 = 秒表.读();')
    && s.includes('墙钟 ${R.墙钟秒.站2} 秒'),
  步长在起跑之前: (s) => {
    const 钉 = s.indexOf("window.__game.clock.getDelta = () => 1 / 60");
    const 基 = s.indexOf('基线上下文 = 通道.执行上下文;');
    const 起跑 = s.indexOf('R.前置 = await evalJs(');
    return 钉 >= 0 && 基 >= 0 && 起跑 >= 0 && 基 < 钉 && 钉 < 起跑;
  },

  // —— harness 口径（切片6b/6c 那一族，本片把最后一个旧形状接进来）——
  端口动态: (s) => s.includes('const VITE_PORT = await freePort()') && !/const VITE_PORT = \d/.test(s),
  口由Chrome自报: (s) => s.includes('const CDP_SPEC = 0;')
    && s.includes('--remote-debugging-port=${CDP_SPEC}')
    // 只收"语句"形状：头注里那句"此前它把 vite 口与 CDP 口都写死"是**故意留下的历史**，
    // 拿全文 indexOf 比会拿注释当代码（注释里的 token 会自己进门禁）。
    && !/^\s*const CDP_PORT\s*=/m.test(s),
  收浏览器说的话: (s) => s.includes("], { stdio: ['ignore', 'pipe', 'pipe'] });")
    && s.includes("chrome.stderr.on('data'") && s.includes("chrome.stdout.on('data'"),
  // dev server 的话同理得收：`--strictPort` 撞口那句、以及 `[vite] page reload <文件>` 那句成因，
  // 都只存在于这一条流里 —— `stdio: 'ignore'` 时脚本只剩"dev 口没起来"这一句无据可查的红。
  收dev的话: (s) => s.includes("const dev输出 = [];")
    && s.includes("vite.stdout.on('data'") && s.includes("vite.stderr.on('data'")
    && s.includes("{ stdio: ['ignore', 'pipe', 'pipe'], cwd: process.cwd() });"),
  线索来自判据: (s) => s.includes('重载线索(全文)')
    && /import \{[^}]*重载线索[^}]*\} from '\.\/harness-readings\.mjs';/.test(s),
  /**
   * 判据空手时必须交出原话尾巴。
   *
   * 这一条防的是本片**自己刚犯过的错**：过滤器按行首 `[vite]` 认，而 vite 打的是
   * `00:59:12 [vite] …`（时间戳在前缀之前）⇒ 真轮次里恒空 ⇒ 红话说"vite 一句都没说"。
   * 那句话在当时为真，可它把"过滤器写错了"报成了"没人动过手"。尾巴交出来之后，
   * "真的一个字都没输出"只有在尾巴也是空的时候才可能说出口 —— 那种红才是"重载不是 dev server 发的"。
   */
  白卷带尾巴: (s) => s.includes('原话尾巴(全文)')
    && /import \{[^}]*原话尾巴[^}]*\} from '\.\/harness-readings\.mjs';/.test(s)
    && !/vite 一句/.test(s),
  红话带成因: (s) => (s.match(/谁动的：/g) ?? []).length >= 2,
  取口有界且判据在外: (s) => /读CDP口\(等待毫秒 = \d+\)/.test(s)
    && s.includes('解析CDP口(全文)') && s.includes('Date.now() >= 截止')
    && /from '\.\/harness-readings\.mjs'/.test(s),
  四判据一次import: (s) => /import \{[^}]*解析CDP口[^}]*页地址问题[^}]*通道问题[^}]*重载问题[^}]*\} from '\.\/harness-readings\.mjs';/.test(s),
  不探口: (s) => !/waitForHttp\([^)]*CDP/.test(s) && !s.includes('/json/version'),
  页归属在: (s) => s.includes('const 页问 = 页地址问题(页地址, VITE_PORT);')
    && s.includes('if (页问.length) throw new Error('),
  通道见证在: (s) => s.includes('const 通问 = 通道问题(通道);')
    && s.includes('if (通问.length) throw new Error(')
    && s.includes('Runtime.executionContextCreated') && s.includes('Page.loadEventFired'),
  页目标有守卫: (s) => s.includes('没有 page 目标') && s.includes("targets.find((t) => t.type === 'page')"),
  开机窗口按冷缓存: (s) => /for \(let i = 0; i < 240 && !ready; i \+= 1\)/.test(s),
  // 锚的是**调用形状**（`awaitPromise: true` 与 `returnByValue: true` 同时出现），不是光一个 token：
  // 脚本头注里写着"`evalJs` 这里用 `awaitPromise: true`"，那一句会让"把 token 删掉"的坏法
  // 只改到注释 —— 第一版就是这么绿的（注释里的 token 自己进了门禁，同 `口由Chrome自报` 那条防的历史）。
  异步站等得到账: (s) => s.includes('awaitPromise: true, returnByValue: true'),
  拔整棵树: (s) => s.includes("'/T', '/F'") && s.includes('function 拔树(')
    // 裸 kill() 的清理写法回潮 = Windows 上留下孤儿 Chrome = 下一轮假红
    && !/try \{ chrome\.kill\(\); \} catch/.test(s),
  抛错带原话: (s) => s.includes('d.exception?.description') && s.includes('页面内抛错 @'),
};

/**
 * 切片6d 的接线腿（页中途被重建 ⇒ 本轮读数作废）。
 *
 * 与 `tests/e2e-clear.test.js` 里同名的那一组**形状一致、锚点不同**：
 * 那边用 `qa.startFullDemo()` 当"测量开始"的锚，这边用第一站 `R.前置`；
 * 预算表也各是各的（`E2E_BUDGETS` / 越线数组）。
 * 判据本体（`重载问题` 收到什么输入报什么话）只在 `tests/perf-smoke.test.js` 测一遍 ——
 * 在两个文件里各复刻一遍判断，就会有两把尺子各自漂。
 */
const 接腿 = {
  调了判据: (s) => /const 重问 = 重载问题\(基线上下文, 通道\.执行上下文\);/.test(s),
  不合格就作废: (s) => s.includes('if (重问.length) {') && s.includes('废.读数作废 = true;') && s.includes('throw 废;'),
  基线取在见证之后起跑之前: (s) => {
    const 见 = s.indexOf('const 通问 = 通道问题(通道)');
    const 基 = s.indexOf('基线上下文 = 通道.执行上下文;');
    const 起跑 = s.indexOf('R.前置 = await evalJs(');
    return 见 >= 0 && 基 >= 0 && 起跑 >= 0 && 见 < 基 && 基 < 起跑;
  },
  作废在算越线之前: (s) => {
    const 作 = s.indexOf('const 重问 = 重载问题(');
    const 越 = s.indexOf('const 越线 = 战斗越线(');
    return 作 >= 0 && 越 >= 0 && 作 < 越;
  },
  归因在catch里: (s) => s.includes('if (!err?.读数作废) {')
    && s.includes('const 归因 = 重载问题(基线上下文, 通道.执行上下文);')
    && s.includes('e2e-combat 归因：'),
  // 计数器只能有一份，且声明在 try 外面（catch 读得到）。try 内再 const 一次 = 遮蔽 = 归因永远读到 0。
  通道只有一份: (s) => (s.match(/^\s*const 通道 = /gm) ?? []).length === 1
    && (s.match(/^\s*let 基线上下文 = /gm) ?? []).length === 1
    && s.search(/^\s*const 通道 = /m) < s.indexOf('let failures = 0;'),
};

/**
 * 切片7 的静置腿（"等页面不再重启，再认它"）。
 *
 * 为什么这半组不属于 6d 那一批：6d 管的是"**测过之后**发现页被换过 ⇒ 那批数作废"，
 * 这一组管的是"**测之前**就别赶上那次重启"。守卫本身挑不出错 —— 2026-10-31 连着两轮
 * 死在同一个位置（见证之后、第一站之前），守卫说的话句句都对，可它每一轮都这么说：
 * 那次 reload 是 vite 冷启动自己发的（按 mtime 对过账，那两百多秒里 `src/` 没写过）。
 * 一条永远红的门禁与没有门禁等价，所以这一组钉的是启动顺序，不是作废顺序。
 */
const 静置腿 = {
  基线取在静置之后: (s) => {
    const 得 = /const 静拍需要 = (\d+);/.exec(s);
    const 静 = s.indexOf('const 静拍需要 =');
    const 基 = s.indexOf('基线上下文 = 通道.执行上下文;');
    const 起跑 = s.indexOf('R.前置 = await evalJs(');
    // 拍数按值判：`静拍需要 = 0` 在文本上留着"静置"那一段，行为上等于没有静置
    return !!得 && Number(得[1]) >= 2 && 静 >= 0 && 基 >= 0 && 起跑 >= 0 && 静 < 基 && 基 < 起跑;
  },
  静置有界且重建后重问: (s) => s.includes('静置失败') && s.includes('if (!起) throw new Error('),
  // 就绪表达式只能有一份：开机 / 重建后两处轮询各写一份时，"重建后重问"会用错表达式
  就绪表达式一个真源: (s) => /const 就绪 = '!!window\.__game/.test(s)
    && (s.match(/evalJs\(就绪\)/g) ?? []).length >= 2
    && !/evalJs\('!!window\.__game/.test(s),
};

describe('战斗 E2E 冒烟（W-D4 切片3 立 / 切片7 上共用 harness 口径 / 切片7b 钉步长与绘制节拍 / 切片7c 判据不再踩空）', () => {
  it('脚本在，npm script 接上了（没接线的门禁只有写它的人会跑）', () => {
    expect(existsSync(SCRIPT), 'scripts/e2e-combat.mjs 不在了').toBe(true);
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts['e2e:combat'], 'package.json 里没有 "e2e:combat" 脚本')
      .toBe('node scripts/e2e-combat.mjs');
  });

  it('阈值按值钉死：只许收紧，不许放松', () => {
    expect(E2E_COMBAT_BUDGETS.maxKillFrames, '击杀帧预算被放松（2400 → 更大就是"总有一天打得死"）')
      .toBeLessThanOrEqual(2400);
    expect(E2E_COMBAT_BUDGETS.maxKillFrames).toBeGreaterThan(0);
    expect(E2E_COMBAT_BUDGETS.aiProbeFrames, 'AI 观察帧被放松').toBeGreaterThanOrEqual(60);
    expect(E2E_COMBAT_BUDGETS.aiProbeFrames).toBeLessThan(E2E_COMBAT_BUDGETS.maxKillFrames);
    expect(E2E_COMBAT_BUDGETS.exceptions, '"异常 0 条"这条预算被放开过').toBe(0);
    expect(E2E_COMBAT_BUDGETS.minKillLedger, '击杀账本下限被放松到 0 = 空账也算过').toBeGreaterThanOrEqual(1);
    expect(E2E_COMBAT_BUDGETS.playerHp, '厚血薄到会被兵打死：序列会被打断，红的是夹具不是战斗链')
      .toBeGreaterThan(1000);
    /**
     * 绘制节拍的下限（切片7b）。这一条与其余几条**方向相反**：其余防的是"放松"，这条防的是"收紧到 1"。
     * 无头页一帧软件 GL 实测 ~2.1 秒 ⇒ `renderEvery = 1` 时这一条要跑四十多分钟（2026-10-31 真撞过），
     * 而一条没人跑得动的门禁等于没有门禁 —— 所以"每帧都画"在这里是**坏判据**，不是严判据。
     */
    expect(E2E_COMBAT_BUDGETS.renderEvery, '绘制节拍收到 60 帧以内 —— 软件 GL 会把这条门禁变回四十分钟')
      .toBeGreaterThanOrEqual(60);
  });

  it('不许走白盒捷径：结算必须由真输入撞出来', () => {
    expect(判据.三站都在(源文), '三站里有一站不见了 —— 链上少一环就没人问它通不通').toBe(true);
    expect(判据.真输入边沿(源文), '左键边沿不给了：脚本不再"玩"，改成看着').toBe(true);
    expect(判据.不白盒扣血(源文), '脚本里出现了直接扣血 / 直接杀死 —— 这条门禁已经不自证结算链').toBe(true);
    expect(判据.推的是真帧(源文), '不推 update/render 了：AI 与打击窗口都不会自己走').toBe(true);
    expect(判据.击杀要见魂火与账本(源文), '魂火或击杀账本不再被读 —— "打得死"与"记到账"分家').toBe(true);
    expect(判据.断言不许静默(源文), '越线不再置失败退出码 —— 门禁变成打印').toBe(true);
  });

  it('页内那一下"按下左键"贴在游戏自己的锁存对象上（路径从 Game.js 现取）', () => {
    /**
     * 这条腿的由来是**一次真红**：切片7 把 bootstrap 换上共用口径之后，第一轮终于走到了站 2，
     * 交回来的是一句 `TypeError: Cannot read properties of undefined (reading 'mouseDown')`
     * —— 脚本写的是 `g.combat.mouseDown`，而游戏把那把锁存在 `g.player.combat` 上。
     * 这条门禁从写下到本片**从没绿过**，因为它一直死在更前面（写死的口 / 中途重载），
     * 而"更早的假红"会把后面那一整段的真 bug 盖住：这是本片把 6 处旧形状一次搬完的直接收益。
     */
    expect(游戏, 'Game.js 里那句真 mousedown 监听换了形状 —— 同源腿的来源没了，先去看它现在写在哪').toMatch(/if \(e\.button === 0\) this\.[A-Za-z0-9_.]+\.mouseDown\.left = true;/);
    expect(判据.锁存路径同游戏(源文), '页内写的锁存对象与游戏自己的不是同一个 —— 那一下按下去没人接').toBe(true);
    // 反向控制：把它改回本片真红过的那个错路径，腿必须咬住
    const 旧写法 = 源文.replace(/g\.player\.combat\.mouseDown\['left'\] = true;/, "g.combat.mouseDown['left'] = true;");
    expect(判据.锁存路径同游戏(旧写法), '路径改回 `g.combat` 却仍判为"同源"').toBe(false);
    // 控制的控制：那一处不该把边沿那条带走（它只判 `/mouseDown\['left'\] = true/` 的形状）
    expect(判据.真输入边沿(旧写法), '只改路径不该让"边沿形状"那条跟着红').toBe(true);
  });

  it('阈值与厚血走同一张表、同一个真源（改一处不会让"掉血"证人静默失效）', () => {
    expect(判据.阈值走表(源文), '帧预算回潮成脚本里的字面量 —— 单测按不到它，放松无人红').toBe(true);
    expect(判据.厚血只有一个真源(源文), '99999 又出现成第二份字面量 —— 两处各改一份时"我掉血"就不可信了').toBe(true);
  });

  it('CDP 口由 Chrome 自报，不再靠探（探到的"空"只属于那一瞬间）', () => {
    expect(判据.端口动态(源文), 'dev 口又写死了 —— 上一轮没退干净时 vite 起不来，而 stdio 是 ignore，没人听见').toBe(true);
    expect(判据.口由Chrome自报(源文), '口又回潮成脚本自己定的了 —— Chrome 撞口时不开口，只红成"CDP 口没起来"').toBe(true);
    expect(判据.收浏览器说的话(源文), "没收 Chrome 的 stderr/stdout —— 那句 'DevTools listening on' 无处可读").toBe(true);
    expect(判据.取口有界且判据在外(源文), '取口没有界，或解析判据没走 harness-readings —— 挂住而不是红，且判据在三个 harness 里各漂一份').toBe(true);
    expect(判据.四判据一次import(源文), '四个判据没在同一条 import 里 —— 少 import 一个是"本地自己再写一份"的开始').toBe(true);
    expect(判据.不探口(源文), '还在用 waitForHttp 探 CDP 口：口通了不等于那是本进程的浏览器').toBe(true);
  });

  it('这一轮连的是自己那个页，且"异常 0 条"有通道正面见证', () => {
    expect(判据.页目标有守卫(源文), '没有 page 目标时裸 TypeError（reading webSocketDebuggerUrl）会把"缺页"报成脚本坏了').toBe(true);
    expect(判据.页归属在(源文), '页归属见证不见了 —— 那三站可能走的是别人的构建').toBe(true);
    expect(判据.通道见证在(源文), '通道正面见证不见了 —— 通道断了与页面没抛错读出来是同一个 0，那条预算就在空转').toBe(true);
    // 见证必须**在起跑之前**：跑完再看通道，中间那些异常是不是送进来了无从可证
    const 见证 = 源文.indexOf('const 通问 = 通道问题(通道)');
    const 起跑 = 源文.indexOf('R.前置 = await evalJs(');
    expect(见证 >= 0 && 起跑 >= 0 && 见证 < 起跑, '先起跑再验通道 —— exceptions=0 那句已经失去依据').toBe(true);
    expect(判据.开机窗口按冷缓存(源文), '开机窗口回到 30 秒一档 —— vite 冷缓存要 ~57 秒，红的是缓存不是代码').toBe(true);
    expect(判据.异步站等得到账(源文), 'awaitPromise 关了 —— 两个 async 站交出的是 Promise 对象，不是读数').toBe(true);
  });

  it('页面静下来之后才认它，且"为什么被换掉"带得出 vite 的原话', () => {
    /**
     * 这一条是本片的**因**，不是装饰：2026-10-31 连着两轮死在同一个位置（见证之后、第一站之前），
     * 守卫说的话完全正确（"这一轮不作数"），可它每一轮都这么说 —— 因为那次 reload 是 vite
     * 冷启动自己发的，不是别人写了一下 `src/`（按 mtime 对过账：最近一次写在这轮开始之前四分钟）。
     * 一条永远红的门禁与没有门禁等价，所以基线必须取在"条数不再动"之后。
     *
     * 另一半是**说出来**：`stdio: 'ignore'` 时脚本手里只剩"页被重建过"这一句猜测；
     * 而 `[vite] page reload src/core/Game.js` 与 `[vite] ✨ new dependencies optimized: three`
     * 是两种完全不同的红（前者重来一轮，后者是启动噪声）。判据本体（`重载线索` 收到什么文本
     * 交什么行）在 `tests/perf-smoke.test.js` 测，这里钉接线。
     */
    for (const [名, 尺] of Object.entries(静置腿)) {
      expect(尺(源文), `静置腿"${名}"在真源码上不过`).toBe(true);
    }
    expect(判据.收dev的话(源文), "没收 dev server 的话 —— '--strictPort 撞口' 与 '[vite] page reload …' 都无处可读").toBe(true);
    expect(判据.线索来自判据(源文), '成因判定没走 harness-readings（本地自己写一份 = 三个 harness 各漂一把尺）').toBe(true);
    expect(判据.白卷带尾巴(源文), '判据空手时没把 dev server 的原话尾巴交出去 —— 那句"vite 没说话"就无从证伪').toBe(true);
    expect(判据.红话带成因(源文), '作废与归因两处红话都没带 vite 的原话').toBe(true);
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
     * 这一轮要跑几十秒、几百次 `evalJs`。共用工作树里谁往 `src/` 写一下 ⇒ vite 发一次全量重载
     * ⇒ `window.__game` 变回 undefined ⇒ 最先红的是一句
     * `TypeError: Cannot read properties of undefined (reading 'enemyManager')` ——
     * 那句红读起来像"AI 通路坏了"，而真实原因是"这一轮的页被换掉了"。
     * 归因记错地方，下一个人就会去查一个没被改过的文件。
     *
     * 更坏的一种是重载来得晚：它**不红**，只是那三站的读数来自两个页 —— `帧数` 与 `魂入账`
     * 不再是同一场战斗的数。所以作废要问在算越线之前。
     */
    expect(源文, '脚本没有 import 重载问题').toMatch(/import \{[^}]*重载问题[^}]*\} from '\.\/harness-readings\.mjs'/);
    for (const [名, 尺] of Object.entries(接腿)) {
      expect(尺(源文), `接线腿"${名}"在真源码上不过`).toBe(true);
    }
    // 计数的正面来源：谁在数执行上下文条数（没人数的话，这一判读的是两个常数）
    expect(源文, '没有人在数执行上下文条数').toMatch(/通道\.执行上下文 \+= 1/);
  });

  it('反向控制：6d 的四处拆法各自被对应的腿抓住', () => {
    // 与 perf / e2e-clear 一侧同一批坏法 —— 三个 harness 要坏得一样红，否则"共用一把尺"只是话术
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

  it('反向控制：静置与"带成因"的八处拆法各自被对应的腿抓住', () => {
    const 坏 = {
      静拍归零: 源文.replace('const 静拍需要 = 3;', 'const 静拍需要 = 0;'),
      静置整段删掉: 源文.replace('    const 静拍需要 = 3;', '    // 静置搬到了基线之后'),
      重建后不重问: 源文.replace('        if (!起) throw new Error(', '        if (false) throw new Error('),
      就绪表达式抄第二份: 源文.replace('    ready = await evalJs(就绪);', "    ready = await evalJs('!!window.__game');"),
      不收dev的话: 源文.replace("  { stdio: ['ignore', 'pipe', 'pipe'], cwd: process.cwd() });", "  { stdio: 'ignore', cwd: process.cwd() });"),
      成因不调判据: 源文.replace('const 行 = 重载线索(全文);', 'const 行 = [];'),
      白卷不带尾巴: 源文.replace('  const 尾 = 原话尾巴(全文);', '  const 尾 = [];'),
      红话不带成因: 源文.replace(/谁动的：/g, '随手一写：'),
    };
    expect(静置腿.基线取在静置之后(坏.静拍归零), '静置拍数归零（等于不静置）腿却仍判为"顺序对"').toBe(false);
    expect(静置腿.基线取在静置之后(坏.静置整段删掉), '静置整段搬走腿却仍判为"在基线之前"').toBe(false);
    expect(静置腿.静置有界且重建后重问(坏.重建后不重问), '重建后那句重问被摘掉腿却仍判为"会红"').toBe(false);
    expect(静置腿.就绪表达式一个真源(坏.就绪表达式抄第二份), '表达式被抄成第二份腿却仍判为"一个真源"').toBe(false);
    expect(判据.收dev的话(坏.不收dev的话), 'dev 的 stdio 退回 ignore 腿却仍判为"收了"').toBe(false);
    expect(判据.线索来自判据(坏.成因不调判据), '成因判据不调用腿却仍判为"调了"').toBe(false);
    expect(判据.白卷带尾巴(坏.白卷不带尾巴), '判据空手时不交原话尾巴，腿却仍判为"交了"').toBe(false);
    expect(判据.红话带成因(坏.红话不带成因), '两处红话都不带成因腿却仍判为"带了"').toBe(false);
    // 控制的控制：每一处只坏在自己那一格上
    expect(静置腿.静置有界且重建后重问(坏.静拍归零), '拍数归零那一处连累了别的腿').toBe(true);
    expect(静置腿.就绪表达式一个真源(坏.重建后不重问), '重问那一处连累了表达式真源那条').toBe(true);
    expect(判据.收浏览器说的话(坏.不收dev的话), '只坏 vite 的 stdio，Chrome 那条不该跟着红').toBe(true);
    expect(判据.线索来自判据(坏.红话不带成因), '红话话术那一处不该把判据调用也带走').toBe(true);
    expect(判据.白卷带尾巴(坏.成因不调判据), '不调判据那一处不该把原话尾巴也带走').toBe(true);
    expect(判据.线索来自判据(坏.白卷不带尾巴), '尾巴那一处不该把判据调用也带走').toBe(true);
  });

  it('判据与执行分家：可执行脚本不许导出东西，阈值在无副作用的表里', () => {
    // 这一条防的是 `e2e-clear` 踩过的坑：预算定义在可执行脚本里 ⇒
    // `import` 它 = 在 `npm test` 里真起一个浏览器把 E2E 跑一遍。
    expect(源文, 'e2e-combat.mjs 又导出了东西 —— 下一个人会 import 它，然后单测里跑起浏览器')
      .not.toMatch(/^export /m);
    const 表 = readFileSync(join(ROOT, 'scripts', 'e2e-budgets.mjs'), 'utf8');
    expect(表, 'E2E_COMBAT_BUDGETS 不在 e2e-budgets.mjs 里').toMatch(/export const E2E_COMBAT_BUDGETS/);
    expect(表, '预算表自己成了导入即执行的东西（它必须只导出常量）').not.toMatch(/^\s*(spawn|new WebSocket|process\.exit)/m);
  });

  it('反向控制：同一批判据喂给人造坏脚本，必须全部报错（自证判据不是空转）', () => {
    // 坏法分两批。旧的那批是切片6c/6d 在另两个 harness 上真红过的形状（口、页、通道、清理）；
    // 新的一条 `白盒扣血` 是本片特有的：它红的时候源码看起来"更简单"，而那正是危险的地方。
    const 坏 = 源文
      .replace('const VITE_PORT = await freePort();', 'const VITE_PORT = 5322;')
      .replace('const CDP_SPEC = 0;', 'const CDP_PORT = await freePort();')
      .replace("--remote-debugging-port=${CDP_SPEC}", '--remote-debugging-port=${CDP_PORT}')
      .replace("], { stdio: ['ignore', 'pipe', 'pipe'] });", "], { stdio: 'ignore' });")
      .replace('const 得 = 解析CDP口(全文);', 'const 得 = /DevTools listening on ws/.test(全文) ? { 口: CDP_PORT } : null;')
      .replace('  const targets = await', "  if (!await waitForHttp(`http://127.0.0.1:${CDP_PORT}/json/version`)) throw new Error('Chrome CDP 口没起来');\n  const targets = await")
      .replace('const 页问 = 页地址问题(页地址, VITE_PORT);', 'const 页问 = [];')
      .replace('if (通问.length) throw new Error(', 'if (通问.length) console.warn(')
      .replace('CDP 口 ${CDP口} 通了但 /json/list 里没有 page 目标', '连不上页')
      .replace('const 原话 = d.exception?.description ?? d.exception?.value ?? d.text', "const 原话 = '?'")
      .replace("spawnSync('taskkill', ['/PID', String(子进程.pid), '/T', '/F'], { stdio: 'ignore' })", '子进程.kill()')
      .replace('for (let i = 0; i < 240 && !ready; i += 1)', 'for (let i = 0; i < 60 && !ready; i += 1)')
      .replace('awaitPromise: true, returnByValue: true', 'awaitPromise: false, returnByValue: true')
      .replace("if (帧 % 12 === 0) g.player.combat.mouseDown['left'] = true;", '兵.takeDamage(99999);')
      // 帧预算回潮成字面量：要**两处一起**换（页面里那一句 + 越线话术里那一句），
      // 只换第一处的话，`includes('${预算.maxKillFrames}')` 会靠第二处蒙过这一臂。
      .replace(/\$\{预算\.maxKillFrames\}/g, '24000')
      .replace('import { 解析CDP口, 页地址问题, 通道问题, 重载问题, 重载线索, 原话尾巴, 战斗越线 } from', 'import { 页地址问题, 通道问题, 重载问题 } from')
      .replace('  g.player.combat.hp = ${预算.playerHp};', '  g.player.combat.hp = 99999;');
    expect(判据.端口动态(坏), 'dev 口写死却仍判为"动态"').toBe(false);
    expect(判据.口由Chrome自报(坏), '口回潮成自己定却仍判为"Chrome 自报"').toBe(false);
    expect(判据.收浏览器说的话(坏), '不收 Chrome 的话却仍判为"收了"').toBe(false);
    expect(判据.取口有界且判据在外(坏), '解析判据搬回本地却仍判为"在外面"').toBe(false);
    expect(判据.四判据一次import(坏), '解析判据搬回本地时 import 那条也变了，腿却仍判为"四个都在"').toBe(false);
    expect(判据.不探口(坏), '探口回潮却仍判为"没探"').toBe(false);
    expect(判据.页归属在(坏), '页归属不调判据却仍判为"在"').toBe(false);
    expect(判据.通道见证在(坏), '通道见证降级成 console.warn 却仍判为"会抛"').toBe(false);
    expect(判据.页目标有守卫(坏), '缺页的话术被换掉却仍判为"有守卫"').toBe(false);
    expect(判据.抛错带原话(坏), '页面异常没带原话却仍判为"带了"').toBe(false);
    expect(判据.拔整棵树(坏), '清理退回裸 kill() 却仍判为"拔整棵树"').toBe(false);
    expect(判据.开机窗口按冷缓存(坏), '开机窗口缩回 30 秒却仍判为"按冷缓存"').toBe(false);
    expect(判据.异步站等得到账(坏), 'awaitPromise 关掉却仍判为"等得到账"').toBe(false);
    expect(判据.不白盒扣血(坏), '真输入换成直接扣血却仍判为"没走捷径"').toBe(false);
    expect(判据.真输入边沿(坏), '真输入边沿没了却仍判为"给了"').toBe(false);
    expect(判据.阈值走表(坏), '帧预算回潮成字面量却仍判为"走表"').toBe(false);
    expect(判据.厚血只有一个真源(坏), 'playerHp 出现第二份字面量却仍判为"一个真源"').toBe(false);
    // 控制的控制：这批坏法**不该**动的东西照旧在
    expect(判据.三站都在(坏), '上面那批坏法没有一个该删站，站却没了').toBe(true);
    expect(判据.击杀要见魂火与账本(坏), '魂火/账本不该被动，却判为不见了').toBe(true);
    expect(判据.断言不许静默(坏), '越线 → 退出码那一条不该被动，却判为不见了').toBe(true);
    expect(判据.收dev的话(坏), '这批坏法只摘 Chrome 的 stdio，dev 那条不该跟着红').toBe(true);
    expect(接腿.通道只有一份(坏), '6d 那批坏法没碰计数器，"只有一份"却不过').toBe(true);
    expect(接腿.调了判据(坏), '6d 那批坏法没碰作废判据，腿却不过').toBe(true);
    // 预算表按值判的两条：坏脚本改的是源码文本，所以另拿改过的值来验
    expect({ ...E2E_COMBAT_BUDGETS, maxKillFrames: 24000 }.maxKillFrames <= 2400, '把帧预算抬到 24000 却仍判为"没放松"').toBe(false);
    expect({ ...E2E_COMBAT_BUDGETS, exceptions: 3 }.exceptions, '把"异常 0 条"放开却仍判为 0').toBe(3);
  });

  /**
   * 切片7b —— 墙钟。这一组钉的不是"战斗链对不对"，而是"这一轮能不能走完"。
   *
   * 由来是切片7 之后**第一次真跑**：bootstrap 换上共用口径之后，这条门禁第一次走到了站 2，
   * 然后四十分钟没交账（2026-10-31 r5，`/json/list` 上那个页一直活着、`兵活: true`、`魂: 0`）。
   * 两个因都在推帧那一行上，而且都不是"战斗链坏了"：
   * - `Game.update()` 自己读 `clock.getDelta()`，手动推帧时 dt = 上一帧的真实耗时（秒级）
   *   ⇒ 每帧推进好几秒的世界 ⇒ 更贵。探针读到贴脸**纯 update 1152 ms/帧**，
   *   而 perf 榜上同一台机器的 `updateP95` 是 12~16 ms —— 那一百倍是 dt 的自反馈。
   * - 每帧真绘制：无头 Chrome 走软件 GL，`render()` 一帧 ~2.1 秒（2271.5 vs 171.6 ms/帧）。
   *
   * 为什么不干脆取消绘制：三站的断言全是逻辑的，但"打击特效的 material 在打斗中途炸掉"
   * 只有 `render()` 撞得出来。按节拍画 = 一整场仍有真绘制，代价从 2400 次降到个位数。
   */
  it('钉住步长、绘制有节拍、墙钟有读数 —— 这一条门禁得跑得完（切片7b）', () => {
    expect(判据.步长钉住(源文), '步长没钉住：dt = 上一帧的真实耗时，帧预算测的是这台机器当时多忙').toBe(true);
    expect(判据.步长在起跑之前(源文), '钉步长必须落在基线之后、站 0 之前：晚于起跑就是前半段读数是另一把尺').toBe(true);
    expect(判据.绘制有节拍(源文), '绘制没有节拍（每帧都画 = 四十分钟；一帧不画 = 画面管线炸了没人问）').toBe(true);
    expect(判据.墙钟有读数(源文), '墙钟不再交账：红了分不清"打不死"与"跑不动"').toBe(true);
    expect(判据.阈值走表(源文), '绘制节拍回潮成脚本里的字面量 —— 单测按不到它').toBe(true);

    const 钉 = "await evalJs('window.__game.clock.getDelta = () => 1 / 60; true');";
    const 不钉 = 源文.replace(钉, '/* 步长不钉 */;');
    const 坏 = {
      不钉步长: 不钉,
      每帧都画: 源文.replace('if (i % ${预算.renderEvery} === 0) g.render();', 'g.render();')
        .replace('if (帧 % ${预算.renderEvery} === 0) g.render();', 'g.render();'),
      节拍写死: 源文.replace(/% \$\{预算\.renderEvery\}/g, '% 240'),
      墙钟不报: 源文.replace('  R.墙钟秒.站2 = 秒表.读();', ''),
    };
    // 顺序那一处单独造：原位删掉，再贴到**站 0 之后**（只改注释不算搬家，所以直接拼出真语句）
    坏.步长搬到起跑之后 = `${不钉.split('  // 站1：AI 通路')[0]}\n  ${钉}\n  // 站1：AI 通路${不钉.split('  // 站1：AI 通路')[1]}`;
    expect(判据.步长钉住(坏.不钉步长), '钉步长那句删掉了，腿却仍判为"钉住了"').toBe(false);
    expect(判据.步长在起跑之前(坏.不钉步长), '整句都不在了，顺序腿却仍判为"在起跑之前"').toBe(false);
    expect(判据.步长在起跑之前(坏.步长搬到起跑之后), '钉步长搬到站 0 之后，顺序腿却仍判为"在起跑之前"').toBe(false);
    expect(判据.绘制有节拍(坏.每帧都画), '退回每帧都画，腿却仍判为"有节拍"').toBe(false);
    expect(判据.绘制有节拍(坏.节拍写死), '节拍写死成字面量，腿却仍判为"走表"').toBe(false);
    expect(判据.阈值走表(坏.节拍写死), '节拍不再从表里取，"走表"那条却仍判为真').toBe(false);
    expect(判据.墙钟有读数(坏.墙钟不报), '站 2 不交墙钟了，腿却仍判为"有读数"').toBe(false);
    // 控制的控制：每一处只坏在自己那一格上
    expect(判据.绘制有节拍(坏.不钉步长), '删钉步长那一处不该连累绘制节拍腿').toBe(true);
    expect(判据.步长钉住(坏.每帧都画), '退回每帧都画不该把钉步长也带走').toBe(true);
    expect(判据.三站都在(坏.每帧都画), '每帧都画那一处不该把站删掉').toBe(true);
    expect(判据.墙钟有读数(坏.节拍写死), '节拍写死不该把墙钟读数也带走').toBe(true);
    // 预算表按值判：把节拍收到每帧都画，值腿必须咬住（文本腿按不到值，这一条是另一半）
    expect({ ...E2E_COMBAT_BUDGETS, renderEvery: 1 }.renderEvery >= 60, '把绘制节拍收到每帧都画，值腿却仍判为"够宽"').toBe(false);
  });

  /**
   * 切片7c —— r7（2026-11-02，这条门禁**第一次跑完整轮**）红的那两条。
   *
   * 两条都不是战斗链断了，是**判据自己踩空**：
   * - 站 1 只交首末两个点。夹具把玩家扔到兵跟前时那只兵已经在 `windup` 里，120 帧（2 秒）打完
   *   一套连段又回到 `windup` ⇒ `后 === 前` ⇒ 报"没有追击/出手"，而同一份读数的 `我掉血` 是 `true`。
   *   两个点分不开"在打"与"卡住"，这是形状问题，不是数值问题 —— 调帧数救不了它。
   * - 站 2 在敌人断气那一帧就读 `stats.souls`。魂魄是 `loot.spawnKill()` 掉在地上的一件掉落物
   *   （`src/combat/EnemyManager.js:516`），要玩家走进 `LootSystem` 的拾取半径才 `addSouls`
   *   （`src/game/LootSystem.js:388-390`）⇒ 那个 0 是"还没踩上去"，不是"没结算"。
   *
   * 判据搬进 `harness-readings.战斗越线` 之后，这两个形状第一次能被**演示**而不是被叙述：
   * 下面每一格都是合成读数，不起浏览器。
   */
  it('合成读数：同是"首末都在 windup"，走完连段必须绿、卡住必须红（切片7c）', () => {
    const 过 = {
      ai: { 轨迹: ['windup', 'strike', 'recover', 'windup'], 我掉血: true },
      击杀: { 杀掉: true, 魂入账: 14, 掉距: 4.3, 收尸帧: 61, 击杀账: { soldier: 1 } },
    };
    expect(战斗越线(过, E2E_COMBAT_BUDGETS, []), `走过 strike 又回到 windup 就是 r7 的真读数，判红等于旧写法重犯`)
      .toEqual([]);
    // 同一对首末、只有中间不同：卡在半空出不来 ⇒ 轨迹与掉血两个证人各咬一口（2 条红）
    const 卡住 = { ...过, ai: { 轨迹: ['windup'], 我掉血: false } };
    const 红 = 战斗越线(卡住, E2E_COMBAT_BUDGETS, []);
    expect(红.length, `卡在单一态又没打到人，两条证人各该红一次，实际 ${红.length} 条：${红.join(' / ')}`).toBe(2);
    expect(红[0], '第一条该说轨迹').toContain('只走过 windup');
    expect(红[1], '第二条该说掉血').toContain('没打到我');
    // 两个证人各判各的：只补掉血（轨迹仍是一条直线）⇒ 只剩轨迹那一条红
    const 只掉血 = { ...过, ai: { 轨迹: ['windup'], 我掉血: true } };
    const 一条 = 战斗越线(只掉血, E2E_COMBAT_BUDGETS, []);
    expect(一条.length, `只该轨迹红一条，实际：${一条.join(' / ')}`).toBe(1);
    expect(一条[0]).toContain('只走过 windup');

    // —— 空尺三格：读不出来必须红，不许把"没采到"读成"没问题" ——
    const 没采 = 战斗越线({ ...过, ai: { 我掉血: true } }, E2E_COMBAT_BUDGETS, []);
    expect(没采.some((条) => 条.includes('没交出状态轨迹')), `轨迹那一格整个缺席，红话却没点名：${没采.join(' / ')}`).toBe(true);
    // 旧写法是 `魂入账 <= 0`：NaN 不参与大于 ⇒ 页面没交这个数时**它是绿的**。这一格钉的就是这个洞
    // （变量而不是字面量：`use-isnan` 禁的是拿 NaN 直接比，这里要的正是"一个交不出来的数长什么样"）
    const 空尺 = Number('页没交这个字段');
    expect(空尺 <= 0, '这一句是旧写法为什么会绿的凭据；它若变了，下面那条腿的来历要跟着重写').toBe(false);
    expect(战斗越线({ ...过, 击杀: { ...过.击杀, 魂入账: 空尺 } }, E2E_COMBAT_BUDGETS, []).length, '魂入账是 NaN 却仍判为已入账').toBeGreaterThan(0);
    expect(战斗越线({ ...过, 击杀: { ...过.击杀, 击杀账: {} } }, E2E_COMBAT_BUDGETS, []).length, '击杀账本空着却仍判为记到了').toBeGreaterThan(0);

    // —— 收尸窗不是逃生门：窗尽头仍是 0 照红，而且那句红要带得走下一步该看的数 ——
    const 够不着 = 战斗越线({ ...过, 击杀: { ...过.击杀, 魂入账: 0, 掉距: 6.2, 收尸帧: 600 } }, E2E_COMBAT_BUDGETS, []);
    expect(够不着.some((条) => 条.includes('掉距 6.2') && 条.includes('收尸用了 600')),
      `魂火没入账时的红话要报出掉距与用了多少帧，否则下一次红还是同一轮考古：${够不着.join(' / ')}`).toBe(true);
    // 异常那条也还在（搬进来的是一整张表，不是只搬两条新的）
    expect(战斗越线(过, E2E_COMBAT_BUDGETS, ['boom']).length, '页面异常 1 条却仍判为过').toBe(1);
  });

  it('白名单里的每一格都得是敌人的态名（r7 手抄那份里躺着三个玩家态）', () => {
    // 名册从真源数：`ENEMY_STATES` 的键就是敌人能处于的那些态
    expect(ENEMY_STATE_NAMES, `敌人名册只有 ${ENEMY_STATE_NAMES.length} 档 —— 先去看 EnemyFSM 是不是被掏空了`)
      .toEqual(expect.arrayContaining(['idle', 'pursue', 'windup', 'strike', 'recover']));
    const 名册问题 = (名单) => 名单.filter((态) => !ENEMY_STATE_NAMES.includes(态));
    for (const 态 of E2E_COMBAT_BUDGETS.aiEngagedStates) {
      expect(ENEMY_STATE_NAMES, `"${态}" 不是敌人的一档，是抄错的词`).toContain(态);
    }
    // 反向控制：r7 那份手抄名单逐格过这把尺，玩家那三档必须被点名
    expect(名册问题(['pursue', 'attack', 'light', 'heavy', 'strike']),
      'attack/light/heavy 是 CombatController 的玩家态，敌人那一侧没有这三档，白名单里它们是死字')
      .toEqual(['attack', 'light', 'heavy']);
    // 前摇与等待各不算"出手"：windup 单列出现正是要抓的形状，orbit 是没抢到围攻名额
    expect(E2E_COMBAT_BUDGETS.aiEngagedStates, '`windup` 进了出手名单 = 卡在承诺态也能绿').not.toContain('windup');
    expect(E2E_COMBAT_BUDGETS.aiEngagedStates, '`orbit` 只是绕外圈等名额，不算出手').not.toContain('orbit');
    // 收尸窗按值钉：它只许在"够得着"的量级里，抬到几千帧就是把这一站改成等着看
    expect(E2E_COMBAT_BUDGETS.lootProbeFrames, '收尸窗为 0 = 这一站又回到断气那一帧读账').toBeGreaterThan(0);
    expect(E2E_COMBAT_BUDGETS.lootProbeFrames, '收尸窗大于一千帧 = 把"没踩到"改成"多等一会儿"')
      .toBeLessThanOrEqual(1000);
  });

  it('接线：站 1 每帧采、站 2 断气后用真输入收尸、越线表住在 harness 里（切片7c）', () => {
    for (const [名, 尺] of Object.entries({ 站1交轨迹: 判据.站1交轨迹, 站2收尸走真输入: 判据.站2收尸走真输入, 收尸不抄近路: 判据.收尸不抄近路, 越线表搬进判据: 判据.越线表搬进判据 })) {
      expect(尺(源文), `"${名}"在真源码上不过`).toBe(true);
    }
    const 坏 = {
      循环里不采: 源文.replace('g.render(); 记一笔(); await', 'g.render(); await'),
      不交轨迹: 源文.replace('return { 轨迹: 轨迹.slice(0, 40), 后: 兵.state,', 'return { 后: 兵.state,'),
      不收尸: 源文.replace("      g.keys['KeyW'] = true;", '      /* 站着等 */;'),
      窗口不走: 源文.replace('while (收尸帧 < ${预算.lootProbeFrames} && g.stats.souls === 旧魂) {',
        'if (false && 收尸帧 < ${预算.lootProbeFrames} && g.stats.souls === 旧魂) {'),
      传送踩点: 源文.replace("      g.keys['KeyW'] = true;", '      g.player.teleport(目标.x, p.y, 目标.z, { yaw: 0, pitch: 0 });'),
      手抄名单回潮: 源文.replace('const 越线 = 战斗越线(R, 预算, exceptions);',
        "const 越线 = !['pursue', 'attack', 'light', 'heavy', 'strike'].some((s) => R.ai.后.includes(s)) ? ['AI 没出手'] : [];"),
    };
    expect(判据.站1交轨迹(坏.循环里不采), '只在循环外采一次，腿却仍判为"每帧采"').toBe(false);
    expect(判据.站1交轨迹(坏.不交轨迹), '轨迹不再交出去，腿却仍判为"交轨迹"').toBe(false);
    expect(判据.站2收尸走真输入(坏.不收尸), '走路那一下没了，腿却仍判为"真输入收尸"').toBe(false);
    expect(判据.站2收尸走真输入(坏.窗口不走), '窗口换成 if (false && …)：三个 token 一个没少，可它永远不会走一步').toBe(false);
    expect(判据.收尸不抄近路(坏.窗口不走), '把窗口关掉不该顺带把"没用传送"这条也带走').toBe(true);
    expect(判据.站2收尸走真输入(坏.传送踩点), '用 teleport 踩掉落也算"真输入"的话，这条腿就是装饰品').toBe(false);
    expect(判据.收尸不抄近路(坏.传送踩点), '站 2 里出现 teleport 却仍判为"没抄近路"').toBe(false);
    expect(判据.越线表搬进判据(坏.手抄名单回潮), '手抄那份含玩家态的名单回潮，腿却仍判为"搬进判据了"').toBe(false);
    // 控制的控制：每一处只坏在自己那一格
    expect(判据.站1交轨迹(坏.不收尸), '收尸那一处不该连累轨迹腿').toBe(true);
    expect(判据.站2收尸走真输入(坏.循环里不采), '采样那一处不该连累收尸腿').toBe(true);
    expect(判据.越线表搬进判据(坏.传送踩点), '传送那一处不该把"越线表搬走"也带走').toBe(true);
    // 分段为什么是必须的：站 0 的传送夹具本来就存在，全文级禁令在**没被改坏的源码**上就是红的。
    // 锚的是**调用形状**（`.teleport(`）不是光一个词：站 2 那三行注释里就写着"不 teleport"，
    // 拿 `includes('teleport')` 判会把注释当代码 —— 与本文件 `口由Chrome自报` 同一条教训。
    expect(源文.includes('g.player.teleport('), '站 0 的传送夹具不在了 —— 那这条"按站分段"的判据本身要重写').toBe(true);
    expect(站2段(源文).includes('.teleport('), '站 2 里本来就不该有传送调用：全文级禁令会把站 0 的正当夹具一起抓走').toBe(false);
    // 三站与白盒禁令都不该被这一片动到
    expect(判据.三站都在(源文), '搬判据那一步把某一站搬没了').toBe(true);
    expect(判据.不白盒扣血(源文), '收尸那一段顺手写了直接扣血/直接捡').toBe(true);
  });
});
