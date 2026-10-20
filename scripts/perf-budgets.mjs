/**
 * 性能冒烟（`npm run perf`）的**预算表** —— W-D4 切片2 立的判据，切片3 把它从脚本里搬出来。
 *
 * ## 为什么单独一个文件
 *
 * `perf-smoke.mjs` 是**导入即执行**的：它顶层就起 vite、起 Chrome、推帧量性能。
 * 门禁 `tests/perf-smoke.test.js` 要的只是这张表，可它此前 `import` 的是**脚本本体** ——
 * 于是 `npm test` 里真的会起一个浏览器把性能冒烟跑一遍：全量套件因此慢一个量级，
 * 而且脚本末尾那句 `setTimeout(() => process.exit(failures), 300)` 会在 vitest 里
 * 报一条 `Error: process.exit unexpectedly called with "0"`（源自 `scripts/perf-smoke.mjs:216`）——
 * 那条"未捕获异常"就是它。**判据与执行分家**之后，两边都干净。
 *
 * 同族的第二处：`scripts/e2e-clear.mjs`（W-D4 切片3）从一开始就走这个形状
 * （表在 `scripts/e2e-budgets.mjs`），并且门禁里有一条"可执行脚本不许导出东西"钉住它。
 *
 * ## 表本身
 *
 * 实测基线（2026-10-07，本机无头 + SwiftShader 软件光栅）：灰白森林站
 * `update()` 单独 18.8ms / p95 33.6ms；update+render 全帧 175~286ms（渲染价在软渲染下噪声很大）。
 * 预算 = 基线 × 2 上下：防"垮一个数量级"，不防 5% 的漂移。真正的帧率回归要在真 GPU 上看，
 * 这条门禁抓的是**逻辑价**（AI/系统每帧攒的账）与灾难级的渲染/堆/稳定性回归。
 *
 * ## draw call 这一格为什么是"从 src 引进来的"（W-C2 切片4）
 *
 * `renderer.info.render.calls` 的判据有两个读者：CI 里这张表，和开发期 HUD 上那一行红绿
 * （`src/engine/PerfHUD.js`）。此前 HUD 里写的是硬编码的 `> 400` —— 两处定义"达标"，
 * 改一处另一处不会跟着变。所以 draw call 的名册（站点 / 配方 / 逐站三列上限 / 验收线）
 * **住在 `src/engine/drawCallBudget.js`**（零依赖，node 能直接 import），这张表只是把它挂进来。
 *
 * 三个**判定函数**也一起转发（`overCeiling` / `missingCeilings` / `extraCeilings`）：
 * 脚本端与门禁端必须问同一个"判"，各判一次迟早漂开 —— 这是 W-D4 切片3
 * "判据与执行分家"的同一条纪律在 draw call 这一格上的延伸。
 */
import { DRAW_CALL_BUDGETS, overCeiling, missingCeilings, extraCeilings } from '../src/engine/drawCallBudget.js';

export { overCeiling, missingCeilings, extraCeilings };

export const PERF_BUDGETS = {
  /** update() 平均耗时上限（ms）：内容膨胀拖垮的第一个数（12 类敌人的 AI、分离、感知都在这里面） */
  updateAvgMs: 40,
  /** update() p95 上限（ms）：个别重帧不许连成片 */
  updateP95Ms: 80,
  /** 全帧（update+render）平均上限（ms）：软渲染噪声大，只做灾难级护栏 */
  frameAvgMs: 600,
  /** JS 堆峰值上限（MB）：超了说明有东西在每帧攒垃圾（B 一族"只加不收"的另一种形状） */
  heapMb: 1200,
  /** 未捕获异常：0 条，性能门禁顺手兼做稳定性门禁 */
  exceptions: 0,
  /**
   * draw call 名册（站点 / 配方 / 逐站三列上限 / 验收线）—— 唯一所有者在
   * `src/engine/drawCallBudget.js`，PerfHUD 读同一份。见那个文件的头部：
   * **读数只有在配方钉死时才是数**（朝向 237↔476、首帧 289 vs 结算后 402）。
   */
  drawCalls: DRAW_CALL_BUDGETS,
};
