/**
 * 围攻名额 —— 同一时刻只允许有限数量的敌人处于"出手资格"。
 *
 * 老版本是每只怪各自一个 `attackCooldown`：八只怪一起围上来同时起手，
 * 玩家无论往哪边滚都要吃伤害，"难"变成了"不讲理"。这里把进攻权变成**名额**：
 * 抢到名额才进 windup，落地的这一帧就交还，其余敌人绕成外圈等待（`EnemyFSM` 的 orbit 态）。
 *
 * 名额是**租约**而不是锁：持有者可能突然死亡、被传送走或状态机出岔，
 * 所以每次 `claim` 续期、`tick(dt)` 回收过期租约，绝不允许出现"永久占位导致没人能攻击"。
 *
 * ## 这一版把"谁能进内圈"从每帧抢改成排队轮转
 *
 * `roomFor` 以前读的是**容量**（`leases.size < slots`）—— 那是一格所有敌人共用、且被同伴
 * 每帧改写的读数：谁在这个帧进了前摇，别人眼里"坑"就没了；谁收了招，"坑"又出现。走位判据
 * （`EnemyFSM.slotOpenFor` → `pursue` 那一格与 `holdRadius` 的设定点）吃的正是这一格，
 * 于是六个挤在 2 米一圈的场景里，单只的"坑"在 14 秒里翻 **17–30 次**（≈2 次/秒，
 * `.tmp-20261031-s25/wb7-9-census-before.log` 的 `每只坑翻`），设定点跟着在 2.465 ↔ 4.35 米
 * 之间翻页 ⇒ 冲进来 / 退出去接力，最短一档 1 帧，比一次步态交叉淡化（9 帧）短得多。
 * #33 的死区治的是"被同伴顶过停脚线"，治不了这个：**读数本身在抖**。
 *
 * 现在坑是一张**名单**：`line` 收报名的（仇恨中）敌人，`seats` 记被轮到进内圈的那几只，
 * 只在 `tick`（补坑 / 超时让位）与显式的 `release`（打完一轮）、`drop`（死亡 / 移除）时改动。
 * 一只敌人自己的"有没有坑"因此只随**事件**翻页 —— 一轮围攻是好几秒，不是一帧。
 * `claim` 也要求有座：走位与出手读同一张表，不许出现"允许你冲进来、却不给你出手"的分裂账本。
 */
import { AI } from '../content/tuning.js';

export class SquadController {
  /**
   * @param slots 同时在场的进攻位数量
   * @param timeout 租约/占位的回收时长（秒）：持有者失联时坑不能永远占着
   */
  constructor(slots = AI.attackSlots, timeout = AI.slotTimeout) {
    this.slots = slots;
    this.timeout = timeout;
    /** @type {Map<object, number>} 出手中的敌人 -> 剩余租约（秒） */
    this.leases = new Map();
    /** @type {Map<object, number>} 被准许进内圈的敌人 -> 已持座（秒） */
    this.seats = new Map();
    /** @type {object[]} 排队顺序：轮转唯一认的依据，先进先轮 */
    this.line = [];
  }

  /**
   * 报名 / 退报 —— 每帧由 `Enemy.update` 递当前的仇恨读数，坑的归属只在名单变化时重算。
   *
   * 幂等：重复报名不改变名次（否则每帧重排等于回到"每帧抢"）。退报把坑与租约一起交掉 ——
   * 脱战的那只不再占位（老实现里它要到租约超时才撒手，中间那几秒整群少一个进攻位）。
   * Boss 不进名单：它不占小怪的坑，也就不该把自己排进轮转里。
   */
  note(enemy, wants) {
    if (!enemy || enemy.isBoss) return;
    const i = this.line.indexOf(enemy);
    if (!wants) {
      this.drop(enemy);
      return;
    }
    if (i >= 0) return;
    this.line.push(enemy);
    this._refill();                                 // 空着的坑按名次填，不等下一次 tick
  }

  /**
   * 这只敌人现在**是不是**被轮到进内圈的那一只 —— 只看名单，不看距离、冷却与朝向。
   *
   * 单列成一枚**无副作用**的读数是给走位判定用的（`EnemyFSM` 要问"现在压上去有没有意义"）：
   * `claim` 只在首次拿座时建租约，之后不再每帧续期（#45），把"读"保持为纯读数，
   * 优先级判断不再是副作用的来源。
   * Boss 那一格与 `claim` 共用，两处不许各抄一份"谁是 Boss"。
   */
  roomFor(enemy) {
    if (!enemy) return false;
    // Boss 不占名额：围攻上限是给小怪讲理用的，主角不该被自己的随从挡住
    if (enemy.isBoss) return true;
    return this.seats.has(enemy);
  }

  /** 抢占或续期进攻名额；没轮到（不在座上）则返回 false。只在没租约时才新建，已有租约的不每帧续期（#45），否则“读”就变成“每帧改账本”。 */
  claim(enemy) {
    if (!enemy) return false;
    if (enemy.isBoss) return true;                  // Boss 拿到的是资格，不是账本上的一格
    if (!this.roomFor(enemy)) return false;         // 走位与出手共用这一枚读数，不许各数一遍账
    // #45：只有第一次拿座才建租约，之后tick按dt自然衰减，冷却/够不着的敌人会超时让位，
    // 而不是每帧被claim续上永远占着坑。
    if (!this.leases.has(enemy)) {
      this.leases.set(enemy, this.timeout);
    }
    return true;
  }

  /**
   * 交还出手资格并**让座**：打完一轮的那只排回队尾，坑当场给下一位。
   *
   * 让位时不改名次队列的长度 —— 它仍在 `line` 里，只是重新排到最后。
   * 补坑紧跟让位（不等下一次 `tick`）：让位是一个事件，一个事件里把名单读干不改变"读数只随
   * 事件翻页"这件事 —— 真正会让走位发抖的是**每帧重算的容量读数**（谁续期租约都影响所有人）。
   */
  release(enemy) {
    if (enemy?.isBoss) return;
    this.leases.delete(enemy);
    this._rotateOut(enemy);
    this._refill();
  }

  /** 彻底退出：死亡、移除、脱战 —— 名单、坑、租约一起抹掉（留在名单里会让它白占一个轮次） */
  drop(enemy) {
    if (!enemy || enemy.isBoss) return;
    this.leases.delete(enemy);
    this.seats.delete(enemy);
    const i = this.line.indexOf(enemy);
    if (i >= 0) this.line.splice(i, 1);
    this._refill();
  }

  holds(enemy) {
    return this.leases.has(enemy);
  }

  get busy() {
    return this.leases.size;
  }

  /** 在场内等着出手的座位数（判据与调试用；坑的占用数走 `busy`） */
  get seated() {
    return this.seats.size;
  }

  /**
   * 按主循环 dt 推进轮转：回收失联的租约、让占着坑却打不出的人换位、按名次补坑。
   *
   * 返回**被回收的租约数**（不含让位）：这两件事在判据里不是一格，别混成一个数。
   */
  tick(dt) {
    let reclaimed = 0;
    // 只有本次 tick **开始前**就在座的才 aging：release 之后 `_refill` 当场给下一位补的座，
    // 没活过这段时间。把它一起 aging 时，一个比 `timeout` 长的 dt 会让它当场超时 —— 两次让位
    // 相互抵消，刚被回收的那只反而排回队首重新拿座（`enemy-ai.test.js` 的 名额是租约 腿踩过）。
    const 本帧在场 = [...this.seats.keys()];
    for (const [enemy, ttl] of this.leases) {
      const left = ttl - dt;
      if (left <= 0) { this.release(enemy); reclaimed++; } else this.leases.set(enemy, left);
    }
    for (const enemy of 本帧在场) {
      const held = this.seats.get(enemy);
      if (held === undefined) continue;         // 已被 `release` 摘座
      const s = held + dt;
      // 坐着却出手不了（够不着、被溜出锥面、冷却没完）超过一个回收时长：让给排队的下一位。
      // 正在出手的（有租约）不受这条管 —— 它的租约每帧续期，前摇不该被半路撤座。
      if (s > this.timeout && !this.leases.has(enemy)) this._rotateOut(enemy);
      else this.seats.set(enemy, s);
    }
    this._refill();
    return reclaimed;
  }

  clear() {
    this.leases.clear();
    this.seats.clear();
    this.line.length = 0;
  }

  /** 按名次把空坑填上：让位 / 退场 / 新报名之后都走这里，不等下一次 `tick` */
  _refill() {
    for (const enemy of this.line) {
      if (this.seats.size >= this.slots) return;
      this._takeSeat(enemy);
    }
  }

  /** 有空位就给它一个座；已有座的与满员都不改动（幂等，`note` 与 `tick` 共用） */
  _takeSeat(enemy) {
    if (this.seats.has(enemy) || this.seats.size >= this.slots) return false;
    this.seats.set(enemy, 0);
    return true;
  }

  /** 摘座并排到队尾（只在真有座时动队列，`release` 与超时让位共用） */
  _rotateOut(enemy) {
    if (!this.seats.delete(enemy)) return false;
    const i = this.line.indexOf(enemy);
    if (i >= 0) { this.line.splice(i, 1); this.line.push(enemy); }
    return true;
  }
}
