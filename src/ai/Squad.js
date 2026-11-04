/**
 * 围攻名额 —— 同一时刻只允许有限数量的敌人处于"出手资格"。
 *
 * 老版本是每只怪各自一个 `attackCooldown`：八只怪一起围上来同时起手，
 * 玩家无论往哪边滚都要吃伤害，"难"变成了"不讲理"。这里把进攻权变成**名额**：
 * 抢到名额才进 windup，落地的这一帧就交还，其余敌人绕成外圈等待（`EnemyFSM` 的 orbit 态）。
 *
 * 名额是**租约**而不是锁：持有者可能突然死亡、被传送走或状态机出岔，
 * 所以每次 `claim` 续期、`tick(dt)` 回收过期租约，绝不允许出现"永久占位导致没人能攻击"。
 */
import { AI } from '../content/tuning.js';

export class SquadController {
  constructor(slots = AI.attackSlots, timeout = AI.slotTimeout) {
    this.slots = slots;
    this.timeout = timeout;
    /** @type {Map<object, number>} 持有者 -> 剩余租约（秒） */
    this.leases = new Map();
  }

  /**
   * 这只敌人现在**能不能**拿到坑 —— 只看名额，不看距离、冷却与朝向。
   *
   * 单列成一枚**无副作用**的读数是给走位判定用的（`EnemyFSM` 要问"现在压上去有没有意义"）：
   * `claim` 会续期租约，把"读"写成"每帧都改账本"就让优先级判断成了副作用的来源。
   * Boss 那一格与 `claim` 共用，两处不许各抄一份"谁是 Boss"。
   */
  roomFor(enemy) {
    if (!enemy) return false;
    // Boss 不占名额：围攻上限是给小怪讲理用的，主角不该被自己的随从挡住
    if (enemy.isBoss) return true;
    return this.leases.has(enemy) || this.leases.size < this.slots;
  }

  /** 抢占或续期进攻名额；已满则返回 false */
  claim(enemy) {
    if (!this.roomFor(enemy)) return false;
    if (enemy.isBoss) return true;                 // Boss 拿到的是资格，不是账本上的一格
    this.leases.set(enemy, this.timeout);
    return true;
  }

  /** 交还名额（命中帧结算完、被打断、死亡、脱战都必须调用） */
  release(enemy) {
    if (enemy?.isBoss) return;
    this.leases.delete(enemy);
  }

  holds(enemy) {
    return this.leases.has(enemy);
  }

  get busy() {
    return this.leases.size;
  }

  /** 按主循环 dt 回收过期租约；返回被回收的数量便于测试与调试 */
  tick(dt) {
    let reclaimed = 0;
    for (const [enemy, ttl] of this.leases) {
      const left = ttl - dt;
      if (left <= 0) { this.leases.delete(enemy); reclaimed++; } else this.leases.set(enemy, left);
    }
    return reclaimed;
  }

  clear() {
    this.leases.clear();
  }
}
