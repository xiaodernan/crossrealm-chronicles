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
 * 2026-10-20 的同配方读数里**枢纽站五轮读 411–438**（灰白森林一带更不必说），所以"draw call < 400
 * 达标"这句在无头软渲染上从来没成立过；真机读数出来之前，这一条只当**开发期提示**用。
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
 * **数从哪来**：2026-10-20 在 detached 平面（HEAD `2e74047` + 本片六个文件，`D:/3a-plane-wc2s4`）
 * 用本配方**连跑五轮**（`.tmp-20261018-b94/wc2s4-plane-perf{4,5,7,9,10}.log`），
 * 下表是**逐列取五轮最大值**，再 × 1.15 **上取整到 10**（推导脚本 `.tmp-20261020-wc2s4/repin.mjs`，
 * 它读日志算上限，不手抄数）：
 *
 * | 站 | 整帧 | 本体 | 阴影 |
 * |---|---|---|---|
 * | hub | 438 | 232 | 206 |
 * | fantasy | 627 | 327 | 300 |
 * | magic | 901 | 743 | 160 |
 * | space | 236 | 159 | 79 |
 * | void | 150 | 80 | 70 |
 * | abyss | 183 | 75 | 109 |
 * | gloom | 214 | 129 | 85 |
 * | radiant | 877 | 668 | 214 |
 *
 * **为什么是"五轮最大值"而不是"某一轮的数"**：静置读数本身在抖 —— 同一配方同一站，
 * abyss 阴影五轮读 91/109/97/90/94（跨度 19），radiant 阴影 190/209/214/214/202（跨度 24），
 * hub 整帧 411–438（跨度 27）。第一版上限是按单轮（perf4）钉的，于是第二次真跑就出现
 * "阴影 214 vs 上限 220"这种只剩 6 个 call 余量的格 —— 门禁的红绿从此由噪声决定，
 * 而这正是本模块头部"口径"一节要避免的事。取最大值 ⇒ 余量来自实测抖动，不来自运气。
 *
 * 这批数**替代**了上一版本按 2026-10-18 只读普查推的第一版上限 —— 那版没有本体/阴影分列的
 * 同配方读数，三列里两列是猜的。第一次真跑就红了三次（magic 本体 739 > 620、abyss 阴影 91 > 90、
 * radiant 本体 648 > 640），那三条红是**表的功劳**：它量出了自己没量过的东西。
 *
 * **键必须与 `DRAW_CALL_STATION_IDS` 完全一致** —— 多一格是"给一个没测过的站发通行证"，
 * 少一格是"这一站被静默放开"，两种都由 `tests/draw-call-budget.test.js` 当场拦。
 */
export const DRAW_CALL_CEILINGS = Object.freeze({
  [ZONE_IDS.HUB]: Object.freeze({ frame: 510, body: 270, shadow: 240 }),
  [ZONE_IDS.FANTASY]: Object.freeze({ frame: 730, body: 380, shadow: 350 }),
  [ZONE_IDS.MAGIC]: Object.freeze({ frame: 1040, body: 860, shadow: 190 }),
  [ZONE_IDS.SPACE]: Object.freeze({ frame: 280, body: 190, shadow: 100 }),
  [ZONE_IDS.VOID]: Object.freeze({ frame: 180, body: 100, shadow: 90 }),
  [ZONE_IDS.ABYSS]: Object.freeze({ frame: 220, body: 90, shadow: 130 }),
  [ZONE_IDS.GLOOM]: Object.freeze({ frame: 250, body: 150, shadow: 100 }),
  [ZONE_IDS.RADIANT]: Object.freeze({ frame: 1010, body: 770, shadow: 250 }),
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
