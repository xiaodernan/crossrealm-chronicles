/**
 * 极简分层状态机 — 玩家、敌人、Boss、镜头共用。
 * 状态对象：{ enter?, update?, exit?, canEnter? }
 * 转换由 change() 显式触发；blocked 由外部（如硬直、锁定）决定。
 */
export class StateMachine {
  constructor(owner, states = {}, initial = null) {
    this.owner = owner;
    this.states = states;
    this.current = null;
    this.time = 0;
    if (initial) this.change(initial);
  }

  has(name) {
    return !!this.states[name];
  }

  can(name) {
    const s = this.states[name];
    if (!s) return false;
    return s.canEnter ? s.canEnter(this.owner, this) !== false : true;
  }

  change(name, payload) {
    if (!this.states[name]) return false;
    if (this.current && this.current === name) return false;
    if (!this.can(name)) return false;
    const prev = this.states[this.current];
    if (prev?.exit) prev.exit(this.owner, this, name);
    this.current = name;
    this.time = 0;
    this.states[name].enter?.(this.owner, this, payload);
    return true;
  }

  update(dt, ctx) {
    if (!this.current) return;
    this.time += dt;
    this.states[this.current].update?.(this.owner, this, dt, ctx);
  }
}
