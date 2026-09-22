/**
 * 时间控制 — 主循环唯一时间来源。
 * - dt 上限防止切标签页回来后的巨大步长
 * - timeScale 供 hitstop / 慢动作使用，游戏逻辑计时必须走这里而非 setTimeout
 * - 固定步长累加器供需要确定性的系统（未来的物理/回放）使用
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
    this.timeScale = this._hitstopScale;
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

  reset() {
    this.timeScale = 1;
    this._hitstopScale = 1;
    this._hitstopRealEnd = 0;
    this.accumulator = 0;
  }
}
