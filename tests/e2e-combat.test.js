/**
 * 战斗 E2E 冒烟的门禁 —— W-D4 切片7。
 *
 * `npm run e2e:combat` 起真游戏、贴脸一只影之战士、给真输入把整条战斗链跑通
 * （感知 → 追击 → 互殴 → 击杀 → 魂火入账 → 击杀账本 +1）。这条门禁守六样：
 *
 * ① **阈值不许被放松**（`E2E_COMBAT_BUDGETS` 按值钉，上限钉在**实测值**上）：把 `maxKillFrames`
 *    抬回 2400 就是抬回"切片7 之前那个没测过的猜测"，抬到 24000 则是"总有一天打得死"；
 *    把 `aiProbeFrames` 调大是同一件事的慢版本。同一批钉子也有**下限**：预算收到实测帧数以下是
 *    把每一轮都判红，那不是更严而是坏尺（切片7e 两头一起钉）。
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
 * ⑦ **"入账了"入账的是哪一枚**（切片7d，⑥ 修好之后第一轮绿暴露的）：r8 绿了，可同一份读数里
 *    `掉落在场 = 15` —— 竞技场地上躺着十几份**别人**的旧掉落，而收尸那一站朝"最近的一份"走。
 *    于是 `魂入账 > 0` 严格说的是"这片地上有一份被踩到了"，不是"这一只兵掉的那一枚被踩到了"。
 *    现在页那边按**对象身份**认出那一枚（断气前不在册 + `!gear && souls > 0` + 断气点半米内），
 *    判据多吃 `认领souls` / `魂火离场` 两格：认不出来红，入账了但那一枚还躺在场上也红。
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
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { E2E_COMBAT_BUDGETS } from '../scripts/e2e-budgets.mjs';
import { 战斗越线 } from '../scripts/harness-readings.mjs';
import { ENEMY_STATE_NAMES } from '../src/ai/EnemyFSM.js';

const ROOT = process.cwd();
/**
 * 读源码只有这一把尺。为什么要在这里归一次 EOL，理由写在文件末尾那条 B161 普查的注释里。
 */
const 读源 = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const SCRIPT = join(ROOT, 'scripts', 'e2e-combat.mjs');
const 源文 = existsSync(SCRIPT) ? 读源(SCRIPT) : '';
/** 页内那句"按下左键"要贴在**游戏自己的**那个锁存对象上，所以对象路径从这里现取而不是在门禁里抄第二份 */
const 游戏 = 读源(join(ROOT, 'src', 'core', 'Game.js'));

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
   * 走路用真输入（`KeyW` + 面向**认出来的那一枚**），不 `teleport`：站 0 传送是**摆夹具**，
   * 收尸那一段要证的正是"玩家自己走得过去"，用传送踩点等于把这一站改成赋值能执行。
   */
  站2收尸走真输入: (s) => {
    const 段 = 站2段(s);
    // 三样各判一件事：真输入在、帧数从表里取、窗口**自己会走**（`while` 且带"账动了就停"那个逃生条件）。
    // 最后一样是被变异臂逼出来的：只查三个 token 在不在的话，`while (…)` 换成 `if (false && …)`
    // 三个 token 一个不少，腿照绿，而窗口已经永远不会走一步。
    // 切口的形状（7d）：`魂火 &&` 是"认不出那一枚就根本不进窗"的守卫，删了它窗口会朝着 null 走。
    return 段.includes("g.keys['KeyW'] = true") && 段.includes('收尸帧')
      && /while \(魂火 && 收尸帧 < \$\{预算\.lootProbeFrames\} && g\.stats\.souls === 旧魂\)/.test(段);
  },
  /**
   * 收尸认的是**这一只兵自己的那一枚**，不是"地上最近的那一份"（切片7d）。
   *
   * 由来是 r8 那份绿读数里的 `掉落在场 = 15`：按最近挑会挑到隔壁那堆旧掉落，`魂入账 > 0`
   * 于是只证了"这片地上有东西被踩到"。三样合起来才叫"它自己的那一枚"：
   * ① 断气前不在册 —— 对象身份 diff（`LootSystem._spawn` 每次新建一条记录，池化的只有
   *    mesh/ring/beam 三件，所以身份可用）；② `!gear && souls > 0` —— 魂火那一份不带装备；
   * ③ 落在断气点半米内 —— `EnemyManager.js:516` 把魂火下在 `enemy.position` 上。
   * 再加"走路的方向指向 `魂火`"这一条，把"认出来了但朝别处走"那种半吊子也挡掉；
   * 最后一条是禁令：旧的"最近的一份"那套取值法不许回潮。
   */
  收尸认身份: (s) => {
    const 段 = 站2段(s);
    return 段.includes('!断气前.has(d)') && 段.includes('!d.gear && d.souls > 0')
      && 段.includes('Math.hypot(d.mesh.position.x - 死点.x, d.mesh.position.z - 死点.z) < 0.5')
      && 段.includes('Math.atan2(魂火.mesh.position.x - p.x')
      && !/最近掉落|最距/.test(段);
  },
  /**
   * 认出来还得**把身份交出去**（产侧，切片7d 的另一半）。
   *
   * 判据新吃的那三格（`认领souls` / `魂火离场` / `新掉落数`）全部是页那边读的。脚本停止返回它们时
   * 真轮次会红 —— 那是 fail-closed 在设计上该有的表现，可它是"起了浏览器才发现"的形状问题；
   * 而切片7c 把越线表搬出来的全部意义正是：形状问题在单测里就该红。这一条钉产侧，与上一条各管一头。
   */
  认身份交读数: (s) => {
    const 段 = 站2段(s);
    return /认领souls: 魂火\?\.souls \?\? 0/.test(段) && /魂火离场: 魂火 \?/.test(段)
      && 段.includes('新掉落数: 新增.length');
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
   * 不钉住就没有"帧预算"这个数可言：那个数此前测的是这台机器当时多忙。
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
  /**
   * 通道自证：判据调了、不合格就抛。
   *
   * 这里**不再钉那两个事件名**（`Runtime.executionContextCreated` / `Page.loadEventFired`）：
   * 切片10 之后"收到事件就给 `通道` +1"住在 `cdp-channel.mjs`，它的正反行为由
   * `tests/cdp-channel.test.js` 直接喂事件验 —— 在本文件再钉一遍源码文本就是判据抄两份。
   * 被数的那个对象有没有交出去，由下面的 `通道走真源` 钉。
   */
  通道见证在: (s) => s.includes('const 通问 = 通道问题(通道);')
    && s.includes('if (通问.length) throw new Error('),
  页目标有守卫: (s) => s.includes('没有 page 目标') && s.includes("targets.find((t) => t.type === 'page')"),
  开机窗口按冷缓存: (s) => /for \(let i = 0; i < 240 && !ready; i \+= 1\)/.test(s),
  /**
   * 站点等得到账：钉的是**调用方说了这一格**，不是管道内部那两行。
   *
   * `awaitPromise: true, returnByValue: true` 自切片10 起写在 `cdp-channel.mjs`，由
   * `tests/cdp-channel.test.js` 按工厂选项跑正反；三家共用一份管道，区别就在这一个开关 ——
   * `e2e-clear` 推同步表达式（false），这里与 `perf-smoke` 的站点是页内 async IIFE（true）。
   * 开关写错的后果不是红，是**读数换形状**：两个 async 站交出的是 Promise 对象，
   * 于是每一条越线都读着像"战斗变慢了"。（锚的是调用形状，不是光一个 token：注释里也写着那个词。）
   */
  异步站等得到账: (s) => /开通道\(\{[^}]*等待页面Promise: true/.test(s),
  拔整棵树: (s) => s.includes("'/T', '/F'") && s.includes('function 拔树(')
    // 裸 kill() 的清理写法回潮 = Windows 上留下孤儿 Chrome = 下一轮假红
    && !/try \{ chrome\.kill\(\); \} catch/.test(s),
  /**
   * 通道走真源（W-D4 切片10）：本文件**不许再有第二段管道**。
   *
   * 被换掉的那一份只有 `pending.set(id, res)`：没有 `rej`、没有 close 监听、没有每请求的钟，
   * 于是"Chrome 活着但一条都不回"在这条门禁上不是红，是永远挂着。这一格挡四种坏，缺一格
   * 就有一种坏能活下来：不 import 工厂（抄本还在）/ import 了却不交 `名义`（三家共用一句
   * "通道关闭"，红了分不清是谁家）/ `异常` 不接成 `exceptions`（`[读数]` 与越线表读的不是
   * 通道收到的那份数组）/ 本地又长出 `pending`·`ws.onmessage`·`ws.addEventListener`（第二份真源）。
   */
  通道走真源: (s) => s.includes("import { 开通道 } from './cdp-channel.mjs';")
    && /开通道\(\{ ws, 名义: 'e2e-combat', 通道, 浏览器输出, 等待页面Promise: true \}\)/.test(s)
    && s.includes('异常: exceptions')
    && !/const pending = new Map\(\)/.test(s)
    && !/ws\.onmessage/.test(s)
    && !/ws\.addEventListener\(/.test(s),
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
    const pkg = JSON.parse(读源(join(ROOT, 'package.json')));
    expect(pkg.scripts['e2e:combat'], 'package.json 里没有 "e2e:combat" 脚本')
      .toBe('node scripts/e2e-combat.mjs');
  });

  it('阈值按值钉死：只许收紧，不许放松', () => {
    /**
     * 上限按**当前实测值**钉（切片7e）。原来那道 `<= 2400` 拦不住"退回旧猜测"：
     * 2400 是切片7 之前写下的数，那时这条门禁**一次都没跑完过**，它不是读数。
     * 现在这条门禁跑完整轮三次，`帧数` 是 833（r7）/ 827（r8）/ 855（r9）—— 散布 3.4%，
     * 1600 留 ≈1.9 倍余量。**同一条腿也有下限**：预算收到实测最大值以下是把每一轮都判红，
     * 那是"收紧过头"，与放松一样坏（同 `renderEvery >= 60` 那条的方向）。
     */
    expect(E2E_COMBAT_BUDGETS.maxKillFrames, '击杀帧预算被放松（1600 = 三轮实测 833/827/855 的 ≈1.9 倍；更大就退成"总有一天打得死"）')
      .toBeLessThanOrEqual(1600);
    expect(E2E_COMBAT_BUDGETS.maxKillFrames, '击杀帧预算收到实测最大值（855）以下 —— 这一轮必红，收紧过头不是更严')
      .toBeGreaterThanOrEqual(855);
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
    expect(判据.通道走真源(源文), '通道不是走 ./cdp-channel.mjs 那一份 —— 或者本地又长出了第二段抄本').toBe(true);
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

  it('收尾拔的是整棵树（页面异常那半挪进 cdp-channel，切片10）', () => {
    // Windows 上 child.kill() 只终止那一个 PID，headless Chrome 的孤儿们把主进程钉住
    // ⇒ 上一轮的浏览器还活着 ⇒ 下一轮撞上占口，红成"CDP 口没起来"（责任落在没改过的代码上）
    expect(判据.拔整棵树(源文), '清理回潮成裸 kill() —— 占口假红的因还在').toBe(true);
    const 拔 = 源文.indexOf('拔树(chrome);');
    const 删 = 源文.indexOf('rmSync(profileDir');
    expect(拔 >= 0 && 删 >= 0 && 拔 < 删, '先删 profile 再拔树 —— 浏览器还活着时那目录删不动').toBe(true);
    // 只报"页面内抛错"的 JSON 前 300 字，会把 description 正好切掉：红得看不出是哪一句拒
    // 「页面抛错要带原话与位置」自切片10 起住在 `cdp-channel.mjs` 的 `evalJs` 里：那一处测的是**行为**
    // （假 exceptionDetails 进、看抛出的话带不带 `description` 与 `@url:line:col`），比在这里钉源码文本强。
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
    // 「谁在数执行上下文条数」自切片10 起的答案是：通道工厂数的是**我们交出去的那个对象**。
    // 那句 `通道.执行上下文 += 1` 现在在 `cdp-channel.mjs`，由 `tests/cdp-channel.test.js` 喂事件验它真的动；
    // 本文件留下的是上面那圈接线腿与 `接腿.通道只有一份`（声明只有一处、且在 try 外）。
  });

  it('反向控制：6d 的四处拆法各自被对应的腿抓住', () => {
    // 与 perf / e2e-clear 一侧同一批坏法 —— 三个 harness 要坏得一样红，否则"共用一把尺"只是话术
    const 坏 = {
      不调判据: 源文.replace('const 重问 = 重载问题(基线上下文, 通道.执行上下文);', 'const 重问 = [];'),
      条件废掉: 源文.replace('if (重问.length) {', 'if (false) {'),
      基线不取: 源文.replace('  基线上下文 = 通道.执行上下文;', ''),
      归因删掉: 源文.replace('if (!err?.读数作废) {', 'if (false) {'),
      计数器遮蔽: 源文.replace("开通道({ ws, 名义: 'e2e-combat', 通道, 浏览器输出, 等待页面Promise: true });",
        "开通道({ ws, 名义: 'e2e-combat', 通道, 浏览器输出, 等待页面Promise: true });\n  const 通道 = { 执行上下文: 0, 加载完成: 0 };"),
    };

    // #36：每一处坏法都必须**真的改动文本**。锚点被上一片的改动挪走时 `replace` 是**静默 no-op**，
    // 于是"判据在坏脚本上必须不过"那一串会拿真源码喂自己 —— 反向控制腿悄悄变成装饰品。
    for (const [名, 变体] of Object.entries(坏)) {
      expect(变体 !== 源文, `坏法"${名}"没改动任何文本 —— 锚点已不在源码里，这一格是自证（#36）`).toBe(true);
    }
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

    // #36：每一处坏法都必须**真的改动文本**。锚点被上一片的改动挪走时 `replace` 是**静默 no-op**，
    // 于是"判据在坏脚本上必须不过"那一串会拿真源码喂自己 —— 反向控制腿悄悄变成装饰品。
    for (const [名, 变体] of Object.entries(坏)) {
      expect(变体 !== 源文, `坏法"${名}"没改动任何文本 —— 锚点已不在源码里，这一格是自证（#36）`).toBe(true);
    }
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
    const 表 = 读源(join(ROOT, 'scripts', 'e2e-budgets.mjs'));
    expect(表, 'E2E_COMBAT_BUDGETS 不在 e2e-budgets.mjs 里').toMatch(/export const E2E_COMBAT_BUDGETS/);
    expect(表, '预算表自己成了导入即执行的东西（它必须只导出常量）').not.toMatch(/^\s*(spawn|new WebSocket|process\.exit)/m);
  });

  it('反向控制：同一批判据喂给人造坏脚本，必须全部报错（自证判据不是空转）', () => {
    // 坏法分两批。旧的那批是切片6c/6d 在另两个 harness 上真红过的形状（口、页、通道、清理）；
    // 新的一条 `白盒扣血` 是本片特有的：它红的时候源码看起来"更简单"，而那正是危险的地方。
    /**
     * 坏法列成**带锚点的清单**而不是链式 `replace`（#36，与 `tests/e2e-clear.test.js` 同规）。
     *
     * 链式写法的老毛病：锚点已经不存在的 `replace` 是静默 no-op，整批坏法少了一处而没人报。
     * 这一片恰好搬走了它里面的两处（`const 原话 = …` 与 `awaitPromise: true, returnByValue: true`
     * 都进了 `cdp-channel.mjs`）—— 没有这条规矩，那一轮之后这两臂会安静消失，而屏幕仍然全绿。
     */
    const 拆法 = [
      ['dev 口写死', 'const VITE_PORT = await freePort();', 'const VITE_PORT = 5322;'],
      ['CDP 口回潮成自己定', 'const CDP_SPEC = 0;', 'const CDP_PORT = await freePort();'],
      ['启动参数跟着改口', '--remote-debugging-port=${CDP_SPEC}', '--remote-debugging-port=${CDP_PORT}'],
      ['不收 Chrome 的话', "], { stdio: ['ignore', 'pipe', 'pipe'] });", "], { stdio: 'ignore' });"],
      ['解析判据搬回本地', 'const 得 = 解析CDP口(全文);', 'const 得 = /DevTools listening on ws/.test(全文) ? { 口: CDP_PORT } : null;'],
      ['探 CDP 口回潮', '  const targets = await', "  if (!await waitForHttp(`http://127.0.0.1:${CDP_PORT}/json/version`)) throw new Error('Chrome CDP 口没起来');\n  const targets = await"],
      ['页归属不调判据', 'const 页问 = 页地址问题(页地址, VITE_PORT);', 'const 页问 = [];'],
      ['通道见证降级成 warn', 'if (通问.length) throw new Error(', 'if (通问.length) console.warn('],
      ['缺页的话改写成含糊', 'CDP 口 ${CDP口} 通了但 /json/list 里没有 page 目标', '连不上页'],
      ['清理退回裸 kill()', "spawnSync('taskkill', ['/PID', String(子进程.pid), '/T', '/F'], { stdio: 'ignore' })", '子进程.kill()'],
      ['开机窗口缩回 30 秒', 'for (let i = 0; i < 240 && !ready; i += 1)', 'for (let i = 0; i < 60 && !ready; i += 1)'],
      ['async 站不等 Promise', '等待页面Promise: true', '等待页面Promise: false'],
      ['白盒扣血', "if (帧 % 12 === 0) { g.player.combat.mouseDown['left'] = true; 按下 += 1; }", '兵.takeDamage(99999);'],
      // 帧预算回潮成字面量要**两处一起**换（页内那一句 + 越线话术里那一句），只换第一处的话
      // `includes('${预算.maxKillFrames}')` 会靠第二处蒙过这一臂 —— 所以这里是两条各带锚点的拆法。
      ['页内循环的预算抄成字面量', 'while (兵.alive && 帧 < ${预算.maxKillFrames})', 'while (兵.alive && 帧 < 24000)'],
      ['越线话术里的预算抄成字面量', '｜${预算.maxKillFrames} 帧预算用了', '｜24000 帧预算用了'],
      ['判据 import 搬回本地', 'import { 解析CDP口, 页地址问题, 通道问题, 重载问题, 重载线索, 原话尾巴, 战斗越线 } from', 'import { 页地址问题, 通道问题, 重载问题 } from'],
      ['厚血抄成第二份字面量', 'if (c.hp < ${预算.playerHp}) { c.hp = ${预算.playerHp}; }', 'if (c.hp < ${预算.playerHp}) { c.hp = 99999; }'],
      ['通道不接工厂', "import { 开通道 } from './cdp-channel.mjs';\n", ''],
    ];
    for (const [名, 锚] of 拆法) {
      expect(源文.includes(锚), `锚点"${名}"已不在源码里：那一处坏法是静默 no-op，整条腿变成自证（#36）`).toBe(true);
    }
    let 坏 = 源文;
    for (const [, 锚, 换成] of 拆法) 坏 = 坏.replace(锚, 换成);
    expect(坏 !== 源文, '这一串拆法一处都没改动文本').toBe(true);
    expect(判据.端口动态(坏), 'dev 口写死却仍判为"动态"').toBe(false);
    expect(判据.口由Chrome自报(坏), '口回潮成自己定却仍判为"Chrome 自报"').toBe(false);
    expect(判据.收浏览器说的话(坏), '不收 Chrome 的话却仍判为"收了"').toBe(false);
    expect(判据.取口有界且判据在外(坏), '解析判据搬回本地却仍判为"在外面"').toBe(false);
    expect(判据.四判据一次import(坏), '解析判据搬回本地时 import 那条也变了，腿却仍判为"四个都在"').toBe(false);
    expect(判据.不探口(坏), '探口回潮却仍判为"没探"').toBe(false);
    expect(判据.页归属在(坏), '页归属不调判据却仍判为"在"').toBe(false);
    expect(判据.通道见证在(坏), '通道见证降级成 console.warn 却仍判为"会抛"').toBe(false);
    expect(判据.页目标有守卫(坏), '缺页的话术被换掉却仍判为"有守卫"').toBe(false);
    expect(判据.通道走真源(坏), '通道那段搬回本地抄本却仍判为"走了真源"').toBe(false);
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
    expect({ ...E2E_COMBAT_BUDGETS, maxKillFrames: 24000 }.maxKillFrames <= 1600, '把帧预算抬到 24000 却仍判为"没放松"').toBe(false);
    // 反向控制：钉子**真的移动了**。切片7e 把上限从 2400（没测过的猜测）挪到 1600（三轮实测的 ≈1.9 倍），
    // 那旧上限 2400 在新口径下必须判为"放松" —— 否则这条腿只是在念旧数字，重导没有落地。
    expect({ ...E2E_COMBAT_BUDGETS, maxKillFrames: 2400 }.maxKillFrames <= 1600, '帧预算的钉子还停在旧上限（2400 又能过了）').toBe(false);
    expect({ ...E2E_COMBAT_BUDGETS, lootProbeFrames: 600 }.lootProbeFrames <= 300, '收尸窗的钉子还停在旧上限（600 又能过了）').toBe(false);
    // 下限那一侧（收紧过头）：预算低于实测最大值 = 每一轮必红，那不是严判据而是坏尺
    expect({ ...E2E_COMBAT_BUDGETS, maxKillFrames: 600 }.maxKillFrames >= 855, '把帧预算收到实测（855 帧）以下却仍判为"更严"').toBe(false);
    expect({ ...E2E_COMBAT_BUDGETS, lootProbeFrames: 60 }.lootProbeFrames >= 110, '把收尸窗收到实测两倍以内却仍判为"更严"').toBe(false);
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
   * 只有 `render()` 撞得出来。按节拍画 = 一整场仍有真绘制，代价从"每帧一次"降到个位数。

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
   *
   * 切片7d 在同一格里补了第三个形状：r8 绿了，可那份读数里 `掉落在场 = 15` —— 收尸那一站朝
   * **最近的一份**走，于是 `魂入账 > 0` 证的是"这片地上有东西被踩到"。踩到掉落 ≠ 踩到这一只兵掉的
   * 那一枚，而这一站要证的正是后者；现在判据多吃 `认领souls` / `魂火离场` 两格，下面各演一遍。
   */
  it('合成读数：走完连段必须绿、卡在单一态必须红、认不出这一枚兵自己的那枚魂火必须红（切片7c/7d）', () => {
    const 过 = {
      ai: { 轨迹: ['windup', 'strike', 'recover', 'windup'], 我掉血: true },
      击杀: { 杀掉: true, 魂入账: 25, 认领距: 4.3, 认领souls: 25, 新掉落数: 2, 魂火离场: true,
              收尸帧: 61, 击杀账: { soldier: 1 } },
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
    const 够不着 = 战斗越线({ ...过, 击杀: { ...过.击杀, 魂入账: 0, 认领距: 6.2, 收尸帧: 300 } }, E2E_COMBAT_BUDGETS, []);
    expect(够不着.some((条) => 条.includes('认领距 6.2') && 条.includes('收尸用了 300')),
      `魂火没入账时的红话要报出认领距与用了多少帧（窗尽头 = 预算 300），否则下一次红还是同一轮考古：${够不着.join(' / ')}`).toBe(true);

    /**
     * —— 切片7d：认不出"这一只兵自己的那一枚" ⇒ 后面那句"入账了"没有依据 ——
     *
     * 这三格合起来钉的是同一句话：`魂入账 > 0` 只有在**那一枚**被认出来、并且离场了的时候
     * 才算证明了"击杀→掉落→拾取"这条链。少了任何一格，读起来都像过的其实是"地上有东西被踩到"。
     */
    // r8 的形状：场上 15 份旧掉落，朝最近的那份走，踩到了别人的账
    const 踩错 = 战斗越线({ ...过, 击杀: { ...过.击杀, 认领souls: 0, 认领距: null, 新掉落数: 3, 魂火离场: false } },
      E2E_COMBAT_BUDGETS, []);
    expect(踩错.length, `认不出那一枚却踩着别的入了账，应当两格各红一次，实际 ${踩错.length} 条：${踩错.join(' / ')}`).toBe(2);
    expect(踩错[0], '第一条该点名"认不出这一只兵自己的那枚魂火"，并带上新增几份掉落这个下一步该看的数')
      .toContain('认不出这一只兵自己的那枚魂火');
    expect(踩错[0]).toContain('断气后新增 3 份掉落');
    expect(踩错[1], '第二条该说"这笔账不是那一枚带来的"').toContain('还躺在场上');
    // 认得出、就是没走过去：只红入账那一格，且不许把"没认领"的话说出来
    const 没走到 = 战斗越线({ ...过, 击杀: { ...过.击杀, 魂入账: 0, 魂火离场: false, 收尸帧: 300 } }, E2E_COMBAT_BUDGETS, []);
    expect(没走到.length, `认得出那一枚、只是没踩上去，应当只红入账一格，实际：${没走到.join(' / ')}`).toBe(1);
    expect(没走到[0]).not.toContain('认不出');
    /**
     * 空尺的第四格：页**根本没交** `认领souls`（脚本退回旧形状时就是这个样子）⇒ 必须红。
     * 这一格与 7c 那格 `魂入账` 的 NaN 教训是同一把尺：判据若写成 `认领souls !== 0`，
     * `undefined !== 0` 为真 ⇒ "认不出"这一句永远说不到，而读数明明是空的。
     */
    const 无认领 = { ...过.击杀 };
    delete 无认领.认领souls;
    const 缺字段 = 战斗越线({ ...过, 击杀: 无认领 }, E2E_COMBAT_BUDGETS, []);
    expect(缺字段.filter((条) => 条.includes('认不出')).length,
      `页没交 认领souls 却判为"认得出"：${缺字段.join(' / ')}`).toBe(1);
    expect(缺字段[0], '数读不出来时红话要老实说读到的是 undefined，不许含糊成"没踩到"').toContain('souls 读到 undefined');
    // 入账了、但那一枚还躺在场上 ⇒ 钱是别的东西给的
    const 白捡 = 战斗越线({ ...过, 击杀: { ...过.击杀, 魂火离场: false } }, E2E_COMBAT_BUDGETS, []);
    expect(白捡.length, '那一枚没离场而账却动了，说明入账的不是它').toBe(1);
    expect(白捡[0], '红话要直接说这笔账是谁入的（不是它）').toContain('这笔账是别的东西入的');
    // 反向控制：身份对上的那份（上面那张 `过`）必须还是绿的 —— 补洞不许把绿的判红
    expect(战斗越线(过, E2E_COMBAT_BUDGETS, [])).toEqual([]);

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
    // 收尸窗同样按实测重导（切片7e）：认出**自己那一枚**之后真机两轮各走 54 / 55 帧（认领距 3.29 / 3.33 米）。
    // 300 帧 = 5 秒模拟 ≈ 18 米步行余量；同时它是 `DROP_LIFE = 30 秒`（钉步长下 1800 帧）的六分之一 ——
    // 这一窗里那一枚不可能因过期离场，"离场 + 入账"就不会被"过期"冒充成"被捡起"。
    // 下限取实测两倍（110）：收到两倍以内就是每一轮都在赌掉落点周围的几何，与放松一样坏。
    expect(E2E_COMBAT_BUDGETS.lootProbeFrames, '收尸窗为 0 = 这一站又回到断气那一帧读账（r7 那条假红的原样）').toBeGreaterThan(0);
    expect(E2E_COMBAT_BUDGETS.lootProbeFrames, '收尸窗超过 300 帧 = 把"没踩到"改成"多等一会儿"（实测 54 / 55）')
      .toBeLessThanOrEqual(300);
    expect(E2E_COMBAT_BUDGETS.lootProbeFrames, '收尸窗收到实测（55 帧）两倍以内 = 每一轮都在赌几何')
      .toBeGreaterThanOrEqual(110);
  });

  it('接线：站 1 每帧采、站 2 断气后朝**自己那一枚**收尸、越线表住在 harness 里（切片7c/7d）', () => {
    for (const [名, 尺] of Object.entries({ 站1交轨迹: 判据.站1交轨迹, 站2收尸走真输入: 判据.站2收尸走真输入, 收尸认身份: 判据.收尸认身份, 认身份交读数: 判据.认身份交读数, 收尸不抄近路: 判据.收尸不抄近路, 越线表搬进判据: 判据.越线表搬进判据 })) {
      expect(尺(源文), `"${名}"在真源码上不过`).toBe(true);
    }
    const 坏 = {
      循环里不采: 源文.replace('g.render();\n      记一笔();\n      await', 'g.render();\n      await'),
      不交轨迹: 源文.replace('return { 轨迹: 轨迹.slice(0, 40), 后: 兵.state,', 'return { 后: 兵.state,'),
      不收尸: 源文.replace("      g.keys['KeyW'] = true;", '      /* 站着等 */;'),
      窗口不走: 源文.replace('while (魂火 && 收尸帧 < ${预算.lootProbeFrames} && g.stats.souls === 旧魂) {',
        'if (false && 魂火 && 收尸帧 < ${预算.lootProbeFrames} && g.stats.souls === 旧魂) {'),
      // 认不出就不该进窗：把守卫摘掉，窗口会朝着 null 走（页里是一句 TypeError，不是一条红话）
      窗口不认: 源文.replace('while (魂火 && 收尸帧 < ${预算.lootProbeFrames}', 'while (收尸帧 < ${预算.lootProbeFrames}'),
      // 切片7d 的正主：把身份那三样换成 r8 的取值法（全场最近的一份，不管是谁掉的）
      按最近挑: 源文.replace(`    const 掉落探针 = window.__e2c魂火探针 ? [...(window.__e2c魂火掉落 ?? [])] : null;
    const 新增 = 掉落探针 ?? (g.loot?.drops ?? []).filter((d) => !断气前.has(d));
    const 魂火 = 新增.find((d) => !d.gear && d.souls > 0
      && Math.hypot(d.mesh.position.x - 死点.x, d.mesh.position.z - 死点.z) < 0.5)
      ?? 新增.find((d) => !d.gear && d.souls > 0) ?? null;`,
        `    let 最 = null, 最距 = Infinity;
    for (const d of (g.loot?.drops ?? [])) {
      const d距 = Math.hypot(g.player.position.x - d.mesh.position.x, g.player.position.z - d.mesh.position.z);
      if (d距 < 最距) { 最距 = d距; 最 = d; }
    }
    const 魂火 = 最;`),
      只丢身份diff: 源文.replace('.filter((d) => !断气前.has(d))', '.slice()'),
      只丢魂火谓词: 源文.replaceAll('find((d) => !d.gear && d.souls > 0', 'find((d) => d.souls > 0'),
      只丢断气点容差: 源文.replace(' && Math.hypot(d.mesh.position.x - 死点.x, d.mesh.position.z - 死点.z) < 0.5)', ')'),
      // 认得出但不把身份交出去：判据会在真轮次里红在 fail-closed 那一格，可这条门禁从此只能靠浏览器发现
      不交身份读数: 源文.replace(`             新掉落数: 新增.length, 认领距, 认领souls: 魂火?.souls ?? 0,
             魂火离场: 魂火 ? !(g.loot?.drops ?? []).includes(魂火) : false,`, '             认领距,'),
      传送踩点: 源文.replace("      g.keys['KeyW'] = true;", '      g.player.teleport(魂火.mesh.position.x, p.y, 魂火.mesh.position.z, { yaw: 0, pitch: 0 });'),
      手抄名单回潮: 源文.replace('const 越线 = 战斗越线(R, 预算, exceptions);',
        "const 越线 = !['pursue', 'attack', 'light', 'heavy', 'strike'].some((s) => R.ai.后.includes(s)) ? ['AI 没出手'] : []"),
    };
    // 反向控制的一条硬规矩：每一处拆法**必须真的把文本改了**，否则"腿不过"是假不过、
    // "腿过"也可能是假过（拿不存在的锚点做 replace 是静默 no-op —— 见 #36）。
    for (const [名, 变体] of Object.entries(坏)) {
      expect(变体 !== 源文, `坏法"${名}"没改动任何文本（锚点抄错了？那条断言是在自证）`).toBe(true);
    }
    expect(判据.站1交轨迹(坏.循环里不采), '只在循环外采一次，腿却仍判为"每帧采"').toBe(false);
    expect(判据.站1交轨迹(坏.不交轨迹), '轨迹不再交出去，腿却仍判为"交轨迹"').toBe(false);
    expect(判据.站2收尸走真输入(坏.不收尸), '走路那一下没了，腿却仍判为"真输入收尸"').toBe(false);
    expect(判据.站2收尸走真输入(坏.窗口不走), '窗口换成 if (false && …)：三个 token 一个没少，可它永远不会走一步').toBe(false);
    expect(判据.收尸不抄近路(坏.窗口不走), '把窗口关掉不该顺带把"没用传送"这条也带走').toBe(true);
    expect(判据.站2收尸走真输入(坏.窗口不认), '守卫摘掉了，腿却仍判为"认得出才走"').toBe(false);
    expect(判据.收尸认身份(坏.窗口不认), '摘守卫那一处只该红"会走"那条，不该连累身份腿').toBe(true);
    expect(判据.收尸认身份(坏.按最近挑), '退回"全场最近的一份"，身份腿却仍判为认得出这一只兵的那一枚').toBe(false);
    expect(判据.站2收尸走真输入(坏.按最近挑), '只换取值法不该把"真输入走路"也带走').toBe(true);
    expect(判据.收尸不抄近路(坏.按最近挑), '只换取值法不该把"没用传送"也带走').toBe(true);
    for (const 拆 of ['只丢身份diff', '只丢魂火谓词', '只丢断气点容差']) {
      expect(判据.收尸认身份(坏[拆]), `${拆}：身份三样少了一样，腿却仍判为"认得出那一枚"`).toBe(false);
      expect(判据.站2收尸走真输入(坏[拆]), `${拆}不该连累"真输入走路"那条`).toBe(true);
    }
    expect(判据.认身份交读数(坏.不交身份读数), '页不再交身份读数，产侧腿却仍判为"交了"').toBe(false);
    expect(判据.收尸认身份(坏.不交身份读数), '只删返回字段不该把"怎么认"那条也带走（两头的洞要分开红）').toBe(true);
    expect(判据.击杀要见魂火与账本(坏.不交身份读数), '魂火/账本仍在读数里，不该跟着红').toBe(true);
    expect(判据.站2收尸走真输入(坏.传送踩点), '用 teleport 踩掉落也算"真输入"的话，这条腿就是装饰品').toBe(false);
    expect(判据.收尸不抄近路(坏.传送踩点), '站 2 里出现 teleport 却仍判为"没抄近路"').toBe(false);
    expect(判据.越线表搬进判据(坏.手抄名单回潮), '手抄那份含玩家态的名单回潮，腿却仍判为"搬进判据了"').toBe(false);
    // 控制的控制：每一处只坏在自己那一格
    expect(判据.站1交轨迹(坏.不收尸), '收尸那一处不该连累轨迹腿').toBe(true);
    expect(判据.站2收尸走真输入(坏.循环里不采), '采样那一处不该连累收尸腿').toBe(true);
    expect(判据.越线表搬进判据(坏.传送踩点), '传送那一处不该把"越线表搬走"也带走').toBe(true);
    expect(判据.收尸认身份(坏.手抄名单回潮), '名单回潮那一处不该连累身份腿').toBe(true);
    // 分段为什么是必须的：站 0 的传送夹具本来就存在，全文级禁令在**没被改坏的源码**上就是红的。
    // 锚的是**调用形状**（`.teleport(`）不是光一个词：站 2 那三行注释里就写着"不 teleport"，
    // 拿 `includes('teleport')` 判会把注释当代码 —— 与本文件 `口由Chrome自报` 同一条教训。
    expect(源文.includes('g.player.teleport('), '站 0 的传送夹具不在了 —— 那这条"按站分段"的判据本身要重写').toBe(true);
    expect(站2段(源文).includes('.teleport('), '站 2 里本来就不该有传送调用：全文级禁令会把站 0 的正当夹具一起抓走').toBe(false);
    // 三站与白盒禁令都不该被这一片动到
    expect(判据.三站都在(源文), '搬判据那一步把某一站搬没了').toBe(true);
    expect(判据.不白盒扣血(源文), '收尸那一段顺手写了直接扣血/直接捡').toBe(true);
  });

  /**
   * 切片7d —— 这一条是本片**自己撞出来的**，不是补装饰。
   *
   * r9 那一轮浏览器根本没起：`node` 在 import 阶段报
   * `SyntaxError: missing ) after argument list`（`scripts/e2e-combat.mjs:396`），
   * 因是我在**页面驱动那一段模板字符串里面**的注释里写了反引号 —— 反引号当场把字符串截断，
   * 剩下的 `)` 就没了配对。当时 18 条腿**全绿**：它们全部把脚本当**文本**读
   * （readFileSync + includes/正则），没有一条真的解析过它。
   *
   * `tests/soak-readings.test.js` 早就为**同一件事**立过一条 `node --check` 腿，注释一字一字
   * 写着"注释里出现一个反引号就会提前截断它"—— 可那条只钉 `soak.mjs` 一个文件，教训留在原地
   * 没跟着搬进新写的 harness。所以这里一次钉三个文件，代价是一次子进程（~60ms）。
   */
  it('脚本本身要能被解析：反引号掉进页面模板字符串里 = 这一轮连浏览器都没起（切片7d）', () => {
    for (const 名 of ['e2e-combat.mjs', 'harness-readings.mjs', 'e2e-budgets.mjs']) {
      expect(() => execFileSync(process.execPath, ['--check', join(ROOT, 'scripts', 名)], { stdio: 'pipe' }),
        `${名} 解析不过 —— 上面那些文本腿读的是字节，语法断了它们一句都不会红`)
        .not.toThrow();
    }
  });
});

/**
 * B161：这道门禁此前只在自己的那个检出环境里成立过。
 *
 * `readFileSync` 交回的是**检出环境的字节**，而 vite 的 transform 把本文件自己的多行字面量归成
 * LF ⇒ 在 CRLF 检出的平面上，拿多行锚点做 replace 是静默 no-op：臂没有改到文本，判据却照样读到
 * "好源码"。这条腿先在 CRLF 平面上红过一次（红话 `坏法"按最近挑"没改动任何文本`），LF 平面上它
 * 一直是绿的。与 B104 同族，只是方向相反。
 *
 * 归一化只放在 `读源` 那一把尺里，然后用下面这条普查钉住"不许再有人裸读磁盘字节"。
 * 每条腿都配了反面控制：普查认得出裸读的写法（不是空转）、归一化不许退回。
 */
describe('读源码的 EOL 只许归一次（B161：多行锚点在 CRLF 检出的平面上会静默 no-op）', () => {
  const 裸读 = (行文) => /(^|[^.\w])readFileSync\(/.test(行文);

  it('本文件里读源码只许走 读源（普查的载体是自己，不是编出来的字符串）', () => {
    const 自 = 读源(join(ROOT, 'tests', 'e2e-combat.test.js'));
    const 违例 = 自.split('\n')
      .map((行文, i) => [行文, i + 1])
      .filter(([行文]) => 裸读(行文) && !行文.startsWith('const 读源'))
      .map(([行文, i]) => `${i}: ${行文.trim()}`);
    expect(违例, `这些行绕过 读源 直接读磁盘字节 —— 多行锚点又会变成静默 no-op:\n${违例.join('\n')}`).toEqual([]);
  });

  it('反向控制：裸读的写法要被谓词认出来，归一化的写法不要误伤', () => {
    // 桩按原语拼出来，免得这一行自己成了上面那条普查的违例
    const 桩 = 'const 别处 = readFile' + 'Sync(join(ROOT, "x.mjs"), "utf8");';
    expect(裸读(桩), '谓词认不出裸读 ⇒ 上面那条普查拦不住任何东西').toBe(true);
    expect(裸读('const 别处 = 读源(join(ROOT, "x.mjs"));'), '不该拦的写法被拦了').toBe(false);
  });

  it('归一化不是装饰品：两处源读进来都不许带 CR（退回裸读，这一格当场红）', () => {
    expect(源文.includes('\r'), '读源 没有把 CRLF 归掉 ⇒ 本文件那些多行锚点又是静默 no-op').toBe(false);
    expect(游戏.includes('\r'), 'Game.js 没归一 —— 同一把尺不许只量一处：它今天只贴单行锚点，将来贴跨行的那条不许再踩一次空').toBe(false);
  });
});
