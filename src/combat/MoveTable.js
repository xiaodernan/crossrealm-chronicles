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
 */
export const MOVES = {
  light: { at: 0.16, duration: 0.34, range: 3.6, cone: 0.12, band: [0.8, 2.2], anim: 0.32, heavy: false, moveScale: 0.4 },
  heavy: { at: 0.28, duration: 0.58, range: 4.5, cone: 0.20, band: [1.8, 3.0], anim: 0.58, heavy: true, moveScale: 0.25 },
  skill: { at: 0.22, duration: 0.45, range: 4.5, cone: -2, band: [0.3, 2.8], anim: 0.45, heavy: true, moveScale: 0.4 },
  roll: { at: 0, duration: 0.32, range: 0, cone: -2, band: [0, 0], anim: 0.32, heavy: false, moveScale: 0, speed: 16, iframes: 0.42 },
};

/** 锁定目标时判定锥放宽，保证锁敌手感的容错 */
export const LOCKED_CONE = 0.05;

/** 法术命中的垂直打击带：弹体走中段，引力领域从地面贯起（倍率在 content/tuning.js） */
export const SPELL_BANDS = {
  bolt: [1.0, 2.6],
  aoe: [0, 3.5],
};
