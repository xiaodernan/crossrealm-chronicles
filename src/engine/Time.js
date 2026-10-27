/**
 * 时间控制 — 主循环唯一时间来源。
 * - dt 上限防止切标签页回来后的巨大步长
 * - timeScale 供 hitstop / 慢动作使用，游戏逻辑计时必须走这里而非 setTimeout
 * - 固定步长累加器供需要确定性的系统（未来的物理/回放）使用
 *
 * 世界时标的**持有通道**（切片13）：想慢世界全场的系统（危险区的「全场时停」）不写
 * `timeScale` 字段，而是 `holdScale(id, scale)` 挂一条具名持有、`releaseScale(id)` 还账。
 * 多条持有取最狠（最小）的那条，再与 hitstop 取更小 —— 两套语义互不顶账。reset 清账。
 */
export class TimeController {
  constructor({ maxDelta = 0.05, fixedStep = 1 / 60 } = {}) {
    this.maxDelta = maxDelta;
    this.fixedStep = fixedStep;
    this.timeScale = 1;
    this.scaledDt = 0;
    this.rawDt = 0;
    this.elapsed = 0;
    this.accumulator = 0;
    this.now = 0;
    this._hitstopUntil = 0;
    this._hitstopScale = 1;
    this._hitstopRealEnd = 0;
    /** 具名持有的世界时标：id → scale。`_holdMin` 缓存最小值，tick 每帧零分配地读它 */
    this._holds = new Map();
    this._holdMin = 1;
  }

  /**
   * @param rawDt 未经缩放的秒数
   * @param now   实时秒（performance.now()/1000），用于 hitstop 到期
   */
  tick(rawDt, now = this.now) {
    const clamped = Math.min(Math.max(rawDt, 0), this.maxDelta);
    this.now = now;
    this.rawDt = clamped;
    if (now >= this._hitstopRealEnd) this._hitstopScale = 1;
    // 持有与 hitstop 互取更小：hitstop 是"这一拳定格"，持有是"这段时间变厚"，谁更狠听谁的
    this.timeScale = this._hitstopScale < this._holdMin ? this._hitstopScale : this._holdMin;
    this.scaledDt = clamped * this.timeScale;
    this.elapsed += this.scaledDt;
    this.accumulator += this.scaledDt;
    return this.scaledDt;
  }

  /** 消耗固定步长；返回本次需要执行的步数（用于确定性物理） */
  fixedSteps() {
    let n = 0;
    while (this.accumulator >= this.fixedStep && n < 8) {
      this.accumulator -= this.fixedStep;
      n++;
    }
    return n;
  }

  /** 命中停顿：realSeconds 为现实时间时长，scale 为期间的时间缩放；已有的更长停顿不会被削弱。
   *  now 缺省用当前 tick 记录的实时秒，调用方无需自己取 performance.now()。 */
  hitstop(realSeconds, scale = 0.08, now = this.now) {
    const end = now + Math.max(0, realSeconds);
    if (end > this._hitstopRealEnd) {
      this._hitstopRealEnd = end;
      this._hitstopScale = scale;
    }
  }

  /**
   * 挂一条具名世界时标持有（切片13 的显式契约）：生效到 `releaseScale(id)` 为止，
   * 谁持有谁还账，本控制器不做超时。多条并存取最狠；`scale` 必须在 (0,1) 开区间 ——
   * 挂 1 等于没挂（脏账），挂 0 是把整个世界永久钉死，都不许从这扇门过。
   */
  holdScale(id, scale) {
    if (!(scale > 0 && scale < 1)) {
      throw new Error(`holdScale 需要开区间 (0,1) 的时标，收到 ${scale}`);
    }
    this._holds.set(id, scale);
    this._recomputeHoldMin();
  }

  /** 还一条持有（幂等：没挂过的 id 什么都不做）。还完重算最小值，剩下的持有继续生效 */
  releaseScale(id) {
    if (!this._holds.delete(id)) return;
    this._recomputeHoldMin();
  }

  _recomputeHoldMin() {
    let m = 1;
    for (const s of this._holds.values()) if (s < m) m = s;
    this._holdMin = m;
  }

  reset() {
    this.timeScale = 1;
    this._hitstopScale = 1;
    this._hitstopRealEnd = 0;
    this._holds.clear();
    this._holdMin = 1;
    this.accumulator = 0;
  }
}
