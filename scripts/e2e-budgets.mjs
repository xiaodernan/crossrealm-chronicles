/**
 * 无头 E2E 自动通关的**预算表** —— 与脚本分家的原因见下。
 *
 * ## 为什么单独一个文件（而不是写在 `e2e-clear.mjs` 里）
 *
 * `e2e-clear.mjs` 是**导入即执行**的：它顶层就起 vite、起 Chrome、跑完整个主线。
 * 门禁 `tests/e2e-clear.test.js` 要的只是这张表，可它一旦 `import` 那个脚本，
 * 就会在 `npm test` 里真起一个浏览器把 E2E 跑一遍 —— 单测因此慢一个量级，
 * 还会因为脚本里的 `process.exit` 在 vitest 里报一条"未捕获异常"。
 *
 * 这不是假想的：`perf-smoke.mjs` 就是这个形状，全量套件里那条
 * `Error: process.exit unexpectedly called with "0"`（源自 `scripts/perf-smoke.mjs:216`）
 * 就是它 —— `tests/perf-smoke.test.js` 为了拿 `PERF_BUDGETS` 而 import 了脚本本体。
 * 那一处同时改成了 `scripts/perf-budgets.mjs`。**判据与执行分家**是这一族问题的通用解。
 *
 * ## 表本身
 *
 * `maxFrames` 的来历：实测一次通关 **5160 帧 = 86 秒模拟时间**（44 步 × 传送 + 步内 + 步间，
 * 加上每步 `syncProgress()` 级联推进的等待），连跑三次逐帧相同。取 **12000 帧（200 秒）**
 * ≈ 2.3 倍余量。它防的是"主线在某一步上永远走不完"（事件名改了、目标点没了、章节门配错）——
 * 那种情况下这个数会一直涨到预算耗尽，这正是要抓的形状。
 */

/**
 * 预算表（门禁 `tests/e2e-clear.test.js` 钉住这几个数不许被悄悄放松）。
 */
export const E2E_BUDGETS = {
  /** 推帧上限（模拟时间 = frames / 60 秒）：走不完就是走不完，不许无限等 */
  maxFrames: 12000,
  /** 未捕获异常：0 条。通关路上一次都不许抛 */
  exceptions: 0,
  /** 必须真的走到"通关"（`quests.completed === true`）—— 关掉它就等于把这条门禁废了 */
  requireCompleted: true,
  /** 主线步数下限（分母守卫）：步数少到这个数以下，说明任务表被掏空了，"通关"是空转 */
  minMainlineSteps: 30,
};
