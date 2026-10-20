/**
 * draw call 预算（W-C2 切片4，#157）—— 同一份数字的**两个读者**。
 *
 * ## 为什么住在 src 而不是只写在 scripts 里
 *
 * `renderer.info.render.calls` 有两个人在读：开发期 HUD（`engine/PerfHUD.js`）要在画面上判断
 * "这一帧超没超"，`npm run perf` 要在 CI 里判断"这一站越没越线"。此前 HUD 里那句
 * `calls > 400` 是**硬编码的字面量**：门禁把上限改了，画面上的红绿不会跟着变 —— "达标"这件事
 * 就有了两处定义。本模块是那一处的**唯一所有者**，两边都从这里取。
 *
 * 它**不 import three**（只 import `content/ZoneIdentity.js` 那张纯数据表），所以
 * `scripts/perf-budgets.mjs` 能用 node 直接读它，`tests/perf-smoke.test.js` 也能 ——
 * 门禁判据不许把一个浏览器模块拖进单测。
 *
 * ## 口径：读数只有在配方钉死时才是数
 *
 * 2026-10-18 的分母重测（`.tmp-20261018-b94/`，台账 B94）实测过这四个自由度，每一个都足以
 * 让"同一份代码"读出不同的值，所以它们写进表里而不是散在脚本里：
 * - **朝向**：同一站转四向读 237 ↔ 476（视锥里站着的东西不同）；不钉 yaw，门禁红绿由噪声决定。
 * - **时刻**：`timeOfDay` 0.02–0.85 九档今天读**同一个数**（402），所以它现在不是自由度 ——
 *   但"现在不是"不等于"以后不是"（雾、光照、区域 enhancer 都在读它），钉住比事后解释便宜。
 * - **结算帧**：推完第 1 帧读 289，推到第 300 帧恒 402 —— 首帧那一趟有东西还没就位。
 *   不写结算帧数，读到的是哪一档取决于脚本碰巧在哪一帧取样。
 * - **站点**：分母按站列（151–918 的跨度已经证明"一个全局上限"会同时放过坏站和冤枉好站）。
 *
 * ## 三列：整帧 = 本体 + 阴影
 *
 * `frame` 是整帧口径（`autoReset = false` + 帧界 `info.reset()`，累计场景趟 + bloom/DoF/输出趟，
 * 见 B93）。`body` 是**关掉 `renderer.shadowMap.enabled` 之后**的同一帧，`shadow` 是两者的差。
 * 静置那一帧实测 402 = 211 + **191**：将近一半的 call 花在"给阴影框再画一遍"，
 * 而可画 1215 个网格里 `castShadow` 有 511 个、受影只有 33 个 —— 分列之后这句话才有地方落地。
 * 关掉阴影不是"另一种画质档位"，它只是**取账的一把尺**：脚本读完立刻拧回来并回读确认。
 *
 * ## 站点坐标**不抄**（B120 / B121 那一课）
 *
 * 本表只列**站点的 id**，一个坐标都不写：
 * - 站点名单 = `ZONE_IDS.HUB` + `ZONE_ORDER`（`content/ZoneIdentity.js` 的真表）——
 *   加一个区域，站点名单自动跟着长，而上限表缺那一格时门禁当场红（"静默漏一站等于把这站放开"）。
 * - 枢纽坐标 = `HUB_ZONE.center`（真源）。
 * - 其余坐标 = **运行时从 `world.zones` 里按 id 读那一实例自己的 `center`**。
 *
 * 抄一份坐标就是 B120 的第二份真相：区域一搬家，抄本烂在原地，而门禁还绿着。
 * 站到区心 ⇒ 到自己区的距离为 0 ⇒ `zoneIdAt` 的"取最近"必然判给它自己，不靠半径互不重叠。
 *
 * ## 上限怎么来的（不是 §1 那条 400）
 *
 * 每站的三个上限 = 本机（无头 + SwiftShader 软件光栅）**同配方实测值 × 1.15 上取整到 10**，
 * 而"实测值"取的是**五轮里的最大值**（理由见 `DRAW_CALL_CEILINGS` 上面那张表）。
 * 它是**灾难护栏**（防"垮一个数量级"，与 `perf-budgets.mjs` 里 `frameAvgMs` 同一取向），
 * 不是"达标"的同义词。§1 那条验收线 `acceptLine: 400` 单列着给 HUD 用，两者在文档里对账：
 * 2026-10-21（区域静态合批之后）的同配方五轮最大值里**八站有六站已经落进 400 以内**
 * （hub 278、fantasy 273、space 209、gloom 177、void 133、abyss 124），只有 magic 567 与
 * radiant 432 还越线 —— 切片4 之前那句"这一条从来没成立过"从此不再成立，但真机读数出来之前，
 * 这一条仍只当**开发期提示**用，门禁认的是逐站三列。
 */
import { ZONE_IDS, ZONE_ORDER, HUB_ZONE } from '../content/ZoneIdentity.js';

/** 取账配方（见头部"口径"一节：这四个数不钉，读数就不是读数） */
export const DRAW_CALL_RECIPE = Object.freeze({
  /** 一天里的时刻（0–1）。开机缺省值同为 0.35（`core/Game.js`），这里写死是为了不跟着 `update()` 漂 */
  timeOfDay: 0.35,
  /** 玩家朝向（弧度）与俯角：同一站转四向能读 237 ↔ 476 */
  yaw: 0,
  pitch: -0.12,
  /** 取样前先空推这么多帧（首帧 289 vs 结算后 402） */
  settleFrames: 120,
});

/**
 * 取样站点名单 —— **只有 id，没有坐标**。
 *
 * 顺序 = 枢纽 + `ZONE_ORDER`（真实区域，`content/ZoneIdentity.js` 的真表）。
 * 坐标在运行时从世界里读：枢纽读 `HUB_ZONE.center`，其余读 `world.zones` 里那一实例的 `center`。
 * 为什么名单跟着 `ZONE_ORDER` 走：加了新区域却没给它钉上限，门禁必须当场红，
 * 而不是"这一站不在名册里，跳过"（跳过 = 静默放开这一站）。
 */
export const DRAW_CALL_STATION_IDS = Object.freeze([ZONE_IDS.HUB, ...ZONE_ORDER]);

/** 枢纽站点的坐标（真源；其余站点坐标运行时从 `world.zones` 读） */
export const DRAW_CALL_HUB_CENTER = HUB_ZONE.center;

/** §1 验收线：HUD 的 warn 与它同源（无头软渲染下静置已越线，见头部最后一节） */
export const DRAW_CALL_ACCEPT_LINE = 400;

/**
 * 逐站上限（三列，单位 = call/整帧）。
 *
 * **数从哪来**：2026-10-21 在 detached 平面（HEAD `2e74047` 之后的 W-C2 切片5 那批文件，
 * `D:/3a-plane-wc2s5`）用本配方**连跑五轮**（`.tmp-wc2s5/perf-r{1,3,4,8,9}.log`），
 * 下表是**逐列取五轮最大值**，再 × 1.15 **上取整到 10**（推导脚本 `.tmp-wc2s5/repin.mjs`，
 * 它读日志算上限，不手抄数；站点对不上本表键集时它当场抛）：
 *
 * | 站 | 整帧 | 本体 | 阴影 |
 * |---|---|---|---|
 * | hub | 278 | 202 | 77 |
 * | fantasy | 273 | 206 | 67 |
 * | magic | 567 | 524 | 43 |
 * | space | 209 | 149 | 61 |
 * | void | 133 | 91 | 46 |
 * | abyss | 124 | 77 | 47 |
 * | gloom | 177 | 109 | 68 |
 * | radiant | 432 | 387 | 49 |
 *
 * **为什么是"五轮最大值"而不是"某一轮的数"**：静置读数本身在抖 —— 同一配方同一站，
 * hub 整帧五轮跨度 8、radiant 7、void 阴影 4（完整跨度见上面那张表的推导脚本输出）。
 * 切片4 的第一版上限是按单轮（perf4）钉的，于是第二次真跑就出现"阴影 214 vs 上限 220"
 * 这种只剩 6 个 call 余量的格 —— 门禁的红绿从此由噪声决定，而这正是本模块头部"口径"
 * 一节要避免的事。取最大值 ⇒ 余量来自实测抖动，不来自运气。
 *
 * ## 这一版比上一版紧了一个量级，因为区域静态几何合批了（切片5 / B94）
 *
 * 上一版（切片4）的数：hub 510/270/240、fantasy 730/380/350、magic 1040/860/190、
 * space 280/190/100、void 180/100/90、abyss 220/90/130、gloom 250/150/100、
 * radiant 1010/770/250。同一台机器、同一配方、同一批站点，合批之后整帧读数是
 * **hub 438→278、fantasy 627→273、magic 901→567、radiant 877→432**，阴影列掉得更狠
 * （hub 206→77、fantasy 300→67、radiant 214→49）—— 阴影框里那些散件本来就要再画一遍，
 * 合一件就少一趟。
 *
 * **合批的效果另有一组对照臂**（把 `Game.js` 里那句 `batchZoneStatics` 摘掉，同平面同日跑两轮
 * `perf-nb{1,3}.log`）：无合批时 hub 读 418–430 / fantasy 603–619 / radiant 839–875，
 * 与合批后的 273–278 / 273 / 432 差出一个数量级的一半 —— 这一版上限的余量因此**不是**
 * 照着旧表打折，而是重新量出来的。
 *
 * **两格需要点名解释**（其余逐列都收紧，唯独这两格放宽；不写清楚，下一个人只会看到数字变大）：
 * - **void 本体 100 → 110**：合批**关掉**的对照臂同样读到 79 与 91 —— 这一格从来不是被合批推上去的，
 *   而是切片4 那个 100 来自另一天/另一平面的一轮（`perf4`），今天的五轮最大值 91 × 1.15 就落到 110。
 *   按"数从同一把尺来"的纪律，尺子换成今天这五轮，这一格就得跟着今天走。
 * - **abyss 本体 75 → 77（上限仍 90）**：合批之后散落的碎石被并进**一个**合并网格，而合并网格只有
 *   **一个**包围球 —— 整片场地只要有一部分进视锥就整件画。件数少了（该站阴影趟 109→47、
 *   整帧 183→124），但"这一件里有多少三角形在画面外"变粗了。这是合批的固有代价，
 *   写在 `tests/zone-batching.test.js` 的守恒口径之外，由本表这一格盯住。
 *
 * 这批数**替代**了切片4 那版 —— 那版量的是合批前的世界。第一次真跑就红了三次
 * （magic 本体 739 > 620、abyss 阴影 91 > 90、radiant 本体 648 > 640），那三条红是**表的功劳**：
 * 它量出了自己没量过的东西。今天同理：如果下一片把某站推回旧量级，这张表会当场喊。
 *
 * **键必须与 `DRAW_CALL_STATION_IDS` 完全一致** —— 多一格是"给一个没测过的站发通行证"，
 * 少一格是"这一站被静默放开"，两种都由 `tests/draw-call-budget.test.js` 当场拦。
 */
export const DRAW_CALL_CEILINGS = Object.freeze({
  [ZONE_IDS.HUB]: Object.freeze({ frame: 320, body: 240, shadow: 90 }),
  [ZONE_IDS.FANTASY]: Object.freeze({ frame: 320, body: 240, shadow: 80 }),
  [ZONE_IDS.MAGIC]: Object.freeze({ frame: 660, body: 610, shadow: 50 }),
  [ZONE_IDS.SPACE]: Object.freeze({ frame: 250, body: 180, shadow: 80 }),
  [ZONE_IDS.VOID]: Object.freeze({ frame: 160, body: 110, shadow: 60 }),
  [ZONE_IDS.ABYSS]: Object.freeze({ frame: 150, body: 90, shadow: 60 }),
  [ZONE_IDS.GLOOM]: Object.freeze({ frame: 210, body: 130, shadow: 80 }),
  [ZONE_IDS.RADIANT]: Object.freeze({ frame: 500, body: 450, shadow: 60 }),
});

/** 把三样东西收成一个对象，方便读者一次拿全（HUD 只取 `acceptLine`，门禁取整份） */
export const DRAW_CALL_BUDGETS = Object.freeze({
  acceptLine: DRAW_CALL_ACCEPT_LINE,
  recipe: DRAW_CALL_RECIPE,
  stationIds: DRAW_CALL_STATION_IDS,
  hubCenter: DRAW_CALL_HUB_CENTER,
  ceilings: DRAW_CALL_CEILINGS,
});

/**
 * 站点名单与上限表的**对账**（脚本与门禁共用同一份判定 —— 两处各判一次，迟早漂开）。
 *
 * - `missingCeilings`：**该有上限却没有**的站。漏一站 = 那一站被静默跳过 = 静默放开。
 * - `extraCeilings`：上限表里**多出来**的站。给一个没测过的站发通行证，与漏一站同罪。
 *
 * 两条都返回 id 数组（空 = 对得上）。"空 = 好"这件事必须由调用方显式处理：
 * 把它当成"没有消息就是通过"而直接 `if (!missing.length) 记为通过`，
 * 与"不检查"没有区别 —— 所以脚本端对这两条是**非空即抛**，不是"非空才算红"。
 */
export function missingCeilings(stationIds, ceilings) {
  return (stationIds ?? []).filter((id) => !ceilings?.[id]);
}

export function extraCeilings(stationIds, ceilings) {
  const 在册 = new Set(stationIds ?? []);
  return Object.keys(ceilings ?? {}).filter((id) => !在册.has(id));
}

/**
 * 三列比较：一条读数越过哪几列，返回可读的越线描述数组（空数组 = 全在预算内）。
 *
 * @param {{站: string, 整帧: number, 本体: number, 阴影: number}} 读数
 * @param {Record<string, {frame: number, body: number, shadow: number}>} ceilings
 * @returns {string[]}
 */
export function overCeiling(读数, ceilings) {
  const 上 = ceilings?.[读数?.站];
  if (!上) return [`draw call[${读数?.站}] 上限表里没有这一站（整帧 ${读数?.整帧}）—— 静默漏一站等于把这站放开`];
  const 越 = [];
  if (读数.整帧 > 上.frame) 越.push(`draw call[${读数.站}] 整帧 ${读数.整帧} > ${上.frame}`);
  if (读数.本体 > 上.body) 越.push(`draw call[${读数.站}] 本体 ${读数.本体} > ${上.body}`);
  if (读数.阴影 > 上.shadow) 越.push(`draw call[${读数.站}] 阴影趟 ${读数.阴影} > ${上.shadow}`);
  return 越;
}
