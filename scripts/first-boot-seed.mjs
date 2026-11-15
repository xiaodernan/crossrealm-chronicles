/**
 * 首次开机种子（W-Z91 配套 / W-Z94）
 *
 * ## 为什么需要它
 *
 * `npm run e2e` / `npm run perf` 用的是**全新 temp profile**（空 localStorage）。
 * 《跨界纪元》出场页第一次会自动弹「炉边快速上手」（W-Z91 的 `maybeShowOnBoot`）——
 * 它 `role="dialog"` 全屏背板 + blur，会挡住 e2e 对开始界面的点击、也会给 perf 的
 * frame budget 采样混入遮罩绘制成本。
 *
 * ## 做法
 *
 * 用 CDP `Page.addScriptToEvaluateOnNewDocument` 在**任何页面脚本执行之前**
 * 把 `crossrealm_quickstart_seen = '1'` 播种进去，模拟「回访玩家」的 profile。
 * 与 `world-seed.mjs` 同一条原理（页面执行前后的注入）、同一个位置（enable 之后、navigate 之前）。
 *
 * ## 它不做什么
 *
 * - 不碰存档、设置、音频、快捷键绑定、`worldSeedSource`
 * - 不替玩家「记住」任何其它状态——只这一枚键
 * - 不参与产品构建：只被 e2e / perf 两个脚本 import
 */

/** 给 `Page.addScriptToEvaluateOnNewDocument` 用的源码（幂等、吞错） */
export function firstBootSeedSource() {
  return `(() => {
  try {
    if (localStorage.getItem('crossrealm_quickstart_seen') !== '1') {
      localStorage.setItem('crossrealm_quickstart_seen', '1');
    }
  } catch (_) { /* 私密模式等写不了 localStorage——静默放弃播种，e2e 仍会走显真实场景 */ }
})();`;
}
