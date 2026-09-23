/**
 * 出手帧表 — 「起手 → 命中帧 → 恢复」的时刻、判定形状与位移容许度集中定义，
 * 避免同一组手感数值散落在攻击入口、状态机与玩家位移三处（M2 数据驱动）。
 *
 * at         主循环秒数，stateTimer 跨过它的那一帧做唯一一次判定
 * duration   该状态的总时长，必须大于 at，否则判定帧会被跳过
 * range      以出手点为圆心的判定半径
 * cone       前向点积阈值，越小越宽容；-2 表示全向
 * band       垂直打击带：相对**出手者脚底**的高度区间，与受击盒重叠最多的部位被打中
 * moveScale  该招期间水平位移速度倍率（玩家状态机据此限制出手时的滑步）
 * cancel     取消关系（W-A4）：`{ from, into }`
 *            - `from`：相对本招起手的秒数，`stateTimer` 跨过它之后才开放取消
 *            - `into`：允许从本招打断进来的动作名；`[]` 表示本招必须走完
 *
 * ## 取消关系为什么必须 `from >= at`
 *
 * 取消窗口若早于命中帧，玩家就能在"这一刀还没落地"时把它取消掉 —— 那一刀
 * 永远打不出去，而 `_strike` 还挂在 `CombatController` 上。`from` 一律取
 * 命中帧之后一点（留一点"确认感"），并由 `tests/combat-cancel.test.js`
 * 断言这条不变量，防止以后调参时把它调穿。
 *
 * ## 各招为什么给这些 `into`
 *
 * - 轻击 → 轻击 / 重击 / 翻滚：连段要能接、要能主动撤。**不给弹反**：刀还在挥，
 *   没有"举盾"的空间，允许它会让弹反变成零风险的全能取消。
 * - 重击 → 只给翻滚：重击是"压出去"的承诺，命中后能滚走是保命底线，
 *   但不能再接轻击，否则重击变成没有代价的起手。
 * - 战技 → 不给：它自带 4 秒冷却，是全套里唯一的高风险高回报动作，必须走完。
 * - 翻滚 → 不给：翻滚的无敌帧（`iframes` 0.42）比它本身的时长（0.32）还长，
 *   一旦允许翻滚接翻滚，无敌帧就能首尾相接，闪避变成无敌。
 */
export const MOVES = {
  light: {
    at: 0.16, duration: 0.34, range: 3.6, cone: 0.12, band: [0.8, 2.2],
    anim: 0.32, heavy: false, moveScale: 0.4,
    cancel: { from: 0.22, into: ['light', 'heavy', 'roll'] },
  },
  heavy: {
    at: 0.28, duration: 0.58, range: 4.5, cone: 0.20, band: [1.8, 3.0],
    anim: 0.58, heavy: true, moveScale: 0.25,
    cancel: { from: 0.36, into: ['roll'] },
  },
  skill: {
    at: 0.22, duration: 0.45, range: 4.5, cone: -2, band: [0.3, 2.8],
    anim: 0.45, heavy: true, moveScale: 0.4,
    cancel: { from: Infinity, into: [] },
  },
  roll: {
    at: 0, duration: 0.32, range: 0, cone: -2, band: [0, 0],
    anim: 0.32, heavy: false, moveScale: 0, speed: 16, iframes: 0.42,
    cancel: { from: Infinity, into: [] },
  },
};

/** 锁定目标时判定锥放宽，保证锁敌手感的容错 */
export const LOCKED_CONE = 0.05;

/** 法术命中的垂直打击带：弹体走中段，引力领域从地面贯起（倍率在 content/tuning.js） */
export const SPELL_BANDS = {
  bolt: [1.0, 2.6],
  aoe: [0, 3.5],
};
