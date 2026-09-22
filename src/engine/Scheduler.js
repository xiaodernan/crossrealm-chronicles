/**
 * 主循环驱动的延时调度器 —— 替代游戏逻辑里的 `setTimeout`。
 *
 * 为什么不能用 `setTimeout`（缺陷 B39）：
 * 1. 它挂的是**墙钟**：暂停、后台标签页、掉帧时行为都不可预期；
 * 2. 它不受主循环节制 —— 命中停顿（`timeScale`）与慢动作期间照常触发，
 *    于是"Boss 阶段横幅"和"这一刀停住"用两套时间感，玩家能感觉到撕裂；
 * 3. 它**无法整体撤销**：面板关闭、系统 `dispose()`、换副本时留下的回调
 *    会打到已经失效的对象上（B19 就是这一类）；
 * 4. 它在单测里不可复现 —— 只有能被固定步长驱动的东西才是可验证的东西。
 *
 * 推进用 **rawDt**（不受 hitstop / 慢动作影响）：演出与 UI 节奏不该被战斗时停拉长。
 * 玩法自身的计时仍走各自系统的 dt 积分（见 `CombatController.schedule`）。
 *
 * 唯一仍然允许 `requestAnimationFrame` 的场合：为 CSS 过渡制造一次"绘制间隔"。
 * 那不是游戏逻辑计时，而是让浏览器看到起始值；用 `after(0)` 代替会与赋值同帧，
 * 过渡根本不会发生（见 `ExecutionSkipBurst.burst()` 的注释）。
 */

export class Scheduler {
  constructor() {
    /** @type {{id:number, remain:number, fn:()=>void, tag:string}[]} */
    this._tasks = [];
    this._seq = 0;
  }

  /**
   * @param {number} seconds 延时（秒），负数按 0 处理
   * @param {() => void} fn 到期回调
   * @param {string} [tag] 分组标签，便于 `clear(tag)` 整体撤销
   * @returns {number} 任务 id
   */
  after(seconds, fn, tag = '') {
    const id = ++this._seq;
    this._tasks.push({ id, remain: Math.max(0, seconds), fn, tag });
    return id;
  }

  /**
   * Promise 版延时，取代 `new Promise(r => setTimeout(r, ms))`。
   * 不脱离主循环：后台标签页里 rAF 停摆，任务因此**不会在看不见的地方偷偷跑完**。
   * 注意与"游戏内暂停"区分：暂停菜单只挡玩法子系统，`Game.update()` 仍在跑帧，
   * 所以 UI 与演出类的延时照常到期（它们量的是真实观看时间，不是世界时间）。
   * @param {number} seconds
   * @param {string} [tag]
   * @returns {Promise<void>}
   */
  wait(seconds, tag = '') {
    return new Promise((resolve) => this.after(seconds, resolve, tag));
  }

  /** @param {number} id */
  cancel(id) {
    const i = this._tasks.findIndex((t) => t.id === id);
    if (i >= 0) this._tasks.splice(i, 1);
  }

  /** 撤销某一分组下所有未到期的任务（面板关闭 / 系统 dispose 时用） */
  clear(tag) {
    this._tasks = this._tasks.filter((t) => t.tag !== tag);
  }

  clearAll() {
    this._tasks = [];
  }

  /** 未到期任务数（测试与 PerfHUD 观察用） */
  get pending() {
    return this._tasks.length;
  }

  /**
   * @param {number} dt 秒
   */
  update(dt) {
    if (!this._tasks.length) return;
    const keep = [];
    const due = [];
    for (const t of this._tasks) {
      t.remain -= dt;
      if (t.remain <= 0) due.push(t);
      else keep.push(t);
    }
    // 先摘出再执行：回调里新增的任务不该在同一帧被推进（否则 after(0) 会变成同步递归）
    this._tasks = keep;
    // 一个回调抛错不该连累同帧到期的其他任务（setTimeout 就是这个语义），
    // 但也绝不吞掉 —— 全部跑完后把第一个异常原样抛出。
    let firstError = null;
    for (const t of due) {
      try {
        t.fn();
      } catch (err) {
        if (!firstError) firstError = err;
      }
    }
    if (firstError) throw firstError;
  }
}

/**
 * 模块级单例 —— 与 `engine/Shake.js` 同一个理由：各系统直接引用，
 * 不必把一个调度器实例层层传参穿过 100 个子系统。
 */
export const scheduler = new Scheduler();
