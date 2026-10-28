/**
 * 性能站点的世界种子（W-C2 尾巴 / B125 同源，2026-10-28）。
 *
 * 为什么需要它：`npm run perf` 的 draw call 上限表是"同配方全部读数的最大 ×1.15"，
 * 而每次真门重载页面都会拿到**另一份**未播种的碎石 / 障碍散布（B125 的位面散布吃
 * `Math.random()`）⇒ 八站的上限里始终留着一块"跨世界噪声"，收紧一格就可能被运气咬。
 * 生产上世界每局不同是**有意的**（B125 的结论：治的是测试读它时的运气，不是把世界钉死），
 * 所以这里不改 `src/`，只在性能脚本这一侧、页面任何模块执行**之前**把 `Math.random`
 * 换成一条定长 LCG —— 世界仍按同一套代码生成，只是这一轮的布局可复现。
 *
 * 与 `tests/helpers/seededWorld.js` 同一个 LCG（1664525 / 1013904223），所以测试侧
 * 钉死的布局与性能站点看到的是同一种"确定性"，不是两套随机。
 */

/** 出厂种子。改它等于换一份世界布局 —— 上限表要重测，别顺手改。 */
export const WORLD_SEED = 20261028;

/**
 * 返回一段注入页面的脚本：把 `Math.random` 换成以 `seed` 为起点的 LCG。
 *
 * `>>> 0` 把中间值压回 uint32：LCG 的乘法在 JS 双精度里会丢低位，`Math.imul`
 * 给的是 32 位乘积的低半，两者合起来才是与测试助手逐位相同的序列。
 */
export function worldSeedSource(seed = WORLD_SEED) {
  if (!Number.isInteger(seed) || seed <= 0 || seed > 0xffffffff) {
    throw new Error(`worldSeedSource: 种子必须是 1..2^32-1 的整数（收到 ${seed}）`);
  }
  return `(() => {
  let s = ${seed} >>> 0;
  Math.random = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
})();`;
}
