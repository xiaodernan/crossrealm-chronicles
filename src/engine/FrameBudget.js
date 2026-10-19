/**
 * 帧计数出口（W-E2 切片1，性能回归门禁与持续优化的第一条）。
 *
 * ## 为什么要单独一份
 *
 * "看得见但按 1/2、1/4 帧率更新"的视觉效果（W-C2 切片4 余项）需要一个
 * 确定性的帧计数：第 N 帧该不该刷新。此前若每个系统自个儿维护一个
 * `frame % interval`，三条病必犯：
 *   ① 各自从 0 开始，切场景/读档后分母不同步 → 闪烁；
 *   ② 有的按 dt 累计（B118 的教训：墙钟 ≠ 帧），慢动作 / hitstop 里刷新频率跑偏；
 *   ③ 暂停菜单里帧照跑，降频效果却该停不停，没人能说清。
 *
 * 本模块只管一件事：**本帧是第几帧**。主循环每帧 `tick()` 一下，
 * 别处只读不写。不碰 dt、不碰 timeScale、不碰 hitstop —— hitstop 期间
 * 画面在变慢，帧照常数，降频刷新按真实帧数走，表现就是"慢动作里
 * 粒子依然按帧跳，不传送、不冻结"，与 B118 的"视觉相位挂世界时"
 * 口径一致。
 *
 * 它不 import three，node 可直接 import，单测不启浏览器。
 */

/** 本帧序号（从 1 开始，只增，生产不得写）。 */
let _frameCount = 0;

/** 主循环每帧调用一次（Game.update() 首部），返回本帧序号。 */
export function tick() {
  _frameCount += 1;
  return _frameCount;
}

/** 当前帧序号（只读）。 */
export function currentFrame() {
  return _frameCount;
}

/**
 * 该帧是否属于该间隔的刷新点（`frameCount % interval === 0`）。
 * 供"每隔 N 帧更新一次"的视觉系统调用，统一分母，不再各自抄一份。
 */
export function shouldUpdate(interval) {
  if (!Number.isInteger(interval) || interval <= 0) {
    throw new Error(`FrameBudget.shouldUpdate: interval 必须是正整数，读到 ${interval}`);
  }
  return _frameCount % interval === 0;
}

/**
 * 归零出口——**仅测试/重置用**。生产代码不得调用：
 * 帧计数一经启动，账期跟着主循环走，不许中途改账。
 * 函数名带 `ForTest` 就是为了让源码扫描一眼就能抓出生产里的误用。
 */
export function resetForTest() {
  _frameCount = 0;
}
