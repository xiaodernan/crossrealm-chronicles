/**
 * 可变观测量 + 变化订阅 —— 取代"每帧派发一条 CustomEvent"（B41）。
 *
 * 为什么需要它：
 * `CombatController.update()` 每帧派发一条 `'stamina-changed'`（60fps 下每秒 60 条），
 * `SpellSystem.emitMana()` 同理。这不是"事件"，是**状态轮询**：
 * 1. 每帧都 `dispatchEvent` 会把整条监听链（HUD、教程、辅助系统）在同一帧反复唤醒，
 *    内容却与上一帧一模一样；
 * 2. 载荷是即时值，不是变化 —— 语义上就错了；
 * 3. 它把"写 UI"这件事绑死在一帧内的调用顺序上，任何时序调整都会静默影响表现。
 *
 * 改法：持有者把最新值写进 `Observable`，订阅者只在**值真的变了**时被通知一次。
 * 为了让"有没有变"在数值连续变化的量（精力随时间回复）上仍然有意义，
 * `set()` 支持 `quantize` —— 先量化再比较，避免每帧都是"新值"而退化成原来那样。
 *
 * 注意：`Observable` **不缓存消费者**，它不碰 DOM；`subscribe` 返回退订函数，
 * 系统 `dispose()` 时必须调用（全局事件那种"无一处注销"的状况不在这里重演）。
 */

export class Observable {
  /**
   * @param {*} initial
   * @param {{ quantize?: number }} [options] quantize 为量化步长（0 或省略表示不量化）
   */
  constructor(initial, options = {}) {
    this._value = initial;
    /** @type {Set<(value: *, prev: *) => void>} */
    this._subs = new Set();
    this.quantize = options.quantize ?? 0;
    /** 广播次数（测试与 PerfHUD 观察用：这是"实际通知了几次"，不是"写了几次"） */
    this.emits = 0;
    /** 写入次数（含未变化的写入，用于验证去重确实在起作用） */
    this.writes = 0;
  }

  get value() {
    return this._value;
  }

  /** 按 quantize 折算后的比较键 */
  _key(v) {
    if (!this.quantize) return v;
    if (typeof v !== 'number') return v;
    // 注意 `-0` 与 `0` 的 `Math.round` 结果同为 `-0`/`0`，但 `Object.is` 视二者不同；
    // 比较用的是 `===`（`-0 === 0` 为真），所以不会把"归零"当成变化。
    return Math.round(v / this.quantize);
  }

  /**
   * @param {*} next
   * @returns {boolean} 是否真的发生了变化并广播
   */
  set(next) {
    this.writes += 1;
    if (this._key(next) === this._key(this._value)) {
      // 同一量化档位内不广播：但值仍要写进去，读取方拿到的必须是最新精确值
      this._value = next;
      return false;
    }
    const prev = this._value;
    this._value = next;
    this.emits += 1;
    // 一个订阅者抛错不该连累剩下的（与 setTimeout 的隔离语义一致），
    // 但也绝不吞掉：全部跑完后把第一个异常原样抛出。
    let firstError = null;
    for (const fn of this._subs) {
      try {
        fn(next, prev);
      } catch (err) {
        if (!firstError) firstError = err;
      }
    }
    if (firstError) throw firstError;
    return true;
  }

  /** 强制广播一次（读档/重生这类"值没变但必须刷新 UI"的场合） */
  emit() {
    this.emits += 1;
    let firstError = null;
    for (const fn of this._subs) {
      try {
        fn(this._value, this._value);
      } catch (err) {
        if (!firstError) firstError = err;
      }
    }
    if (firstError) throw firstError;
  }

  /**
   * @param {(value: *, prev: *) => void} fn
   * @returns {() => void} 退订
   */
  subscribe(fn) {
    this._subs.add(fn);
    return () => this._subs.delete(fn);
  }

  /** 当前订阅者数（泄漏检查用） */
  get subscriberCount() {
    return this._subs.size;
  }
}

/**
 * 一小撮相关观测量打成一包 —— 目的只是把"订阅/退订/散发"收在一处，
 * 让 UI 侧写成 `bundle.subscribeAll(fn)` 而不是逐个字段订阅。
 */
export class ObservableBundle {
  /** @param {Record<string, Observable>} fields */
  constructor(fields) {
    this.fields = fields;
  }

  /** @returns {Observable} */
  get(name) {
    const o = this.fields[name];
    if (!o) throw new Error(`ObservableBundle: 未知字段 ${name}`);
    return o;
  }

  /**
   * @param {(name: string, value: *, prev: *) => void} fn
   * @returns {() => void} 一次性退订全部字段
   */
  subscribeAll(fn) {
    const offs = Object.entries(this.fields).map(([name, o]) =>
      o.subscribe((v, prev) => fn(name, v, prev))
    );
    return () => offs.forEach((off) => off());
  }

  /**
   * 写入多个字段。`quantize` 由各字段自己的配置决定。
   * @param {Record<string, *>} patch
   * @returns {string[]} 实际发生变化的字段名
   */
  set(patch) {
    const changed = [];
    for (const [name, value] of Object.entries(patch)) {
      if (this.fields[name]?.set(value)) changed.push(name);
    }
    return changed;
  }
}
