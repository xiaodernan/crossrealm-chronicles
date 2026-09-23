import * as THREE from 'three';
import { GROUND_HAZARD, TIME_SCALE_LEASH } from '../content/tuning.js';

/**
 * 场地危险区（红圈）—— 施法者与危险区解耦：圈画出口就自己走完生命周期。
 *
 * 为什么要单独一层：`Enemy` 的范围招（招式表 `aoe`）把危险圈长在敌人脚下，敌人被硬直、
 * 被打死、被拉开，这一招就整体消失。那是"围殴里的一记横扫"该有的样子；而 Boss 的场地机制
 * （砸地 / 弹幕落点 / 引力井）要的是"这块地已经许诺出去了"，玩家躲开是因为**自己走了出去**，
 * 不是因为把施法者打死。旧实现把这套生命周期手抄在 `Boss` 里，三个会砸地的 Boss 共用一份，
 * 而且圈涨到实际伤害范围的四倍 —— 预警说的是谎。
 *
 * 时间一律由主循环的 `dt` 推进（B39）；几何体全系统共用一份，网格按 `pool` 回收复用，
 * `update()` 里不分配任何对象。
 *
 * 时停域（切片5）要单独交代一句它**不**做什么：它改的是**玩家的时标**，不去拧世界时标
 * （`Time.timeScale`）。域自己走主循环 `dt`，若它把世界调慢，就会连自己的 `duration` 一起
 * 在现实时间里拉长 —— 越慢越久、越久越慢，还要和 hitstop 互相咬住。这条写死在这里，
 * 免得下一位顺手接一个 `game.time.hitstop(...)` 上去。
 */

/** 脉动频率（1/秒）：只影响透明度，不影响判定，所以不需要进内容表 */
const PULSE = 14;

export class GroundHazards {
  constructor(scene, world) {
    this.world = world;
    this.geometry = new THREE.CircleGeometry(1, 48);
    this.group = new THREE.Group();
    this.group.name = 'ground-hazards';
    scene.add(this.group);
    /** 正在走的危险区 */
    this._items = [];
    /** 用完的圆盘摘出场景存这里：一场围山下来新建的网格数应当只等于同时在场的最大数量 */
    this._pool = [];
    /** 只用来给"会在玩家身上留状态"的项生成唯一 key（一次自增，不建对象） */
    this._spawnSeq = 0;
  }

  /**
   * 交出一个危险区。`spec` 的字段与 `GROUND_HAZARD` 同名（radius / telegraph / damage / color），
   * `x`、`z` 是圆心，`owner` 是"谁许诺的"—— 施法者倒地时由 `cancelFor` 撤掉还没落下的圈，
   * 免得玩家被一个已经死掉的 Boss 从坟里打一下。
   *
   * 给了 `duration` 就是**域**而不是**一击**：落地那一拍照常结算，之后 `duration` 秒内
   * 每 `tick` 秒对圈内的玩家再结算一次，并按 `pull` 把玩家往圆心拽（引力井那一档）。
   *
   * 域还可以**不掉血**：给了 `slow` 的那一档在玩家站在圈里时向 `playerRef.applyTimeScale()`
   * 续一格时标（`damage: 0` 的时停域）。这种"人身上的状态"必须由这一项活着期间持有，
   * 所以 `spawn()` 替它生成一个专属 key，出圈 / 到期 / 主人倒地三条路都当场还账。
   *
   * 返回的就是内部那一项：调用方拿它判 `done`（这一招落地了），不需要另一套句柄记账。
   */
  spawn(spec) {
    const disc = this._acquire(spec.color);
    const y = (this.world?.getGroundHeight(spec.x, spec.z) ?? 0) + GROUND_HAZARD.yOffset;
    disc.position.set(spec.x, y, spec.z);
    disc.scale.setScalar(spec.radius * GROUND_HAZARD.growFrom);
    const item = {
      x: spec.x,
      z: spec.z,
      radius: spec.radius,
      telegraph: spec.telegraph,
      damage: spec.damage,
      owner: spec.owner ?? null,
      /** 域的持续时长；0 / undefined = 落地一击定音 */
      duration: spec.duration ?? 0,
      /** 域内每段结算的间隔（秒） */
      tick: spec.tick ?? 0,
      /** 每秒施加给玩家的向心冲量（米/秒²）；0 = 不拽人 */
      pull: spec.pull ?? 0,
      /** 玩家在圈内时的时标（0.45 = 只剩四成半速度）；0 = 不改时标 */
      slow: spec.slow ?? 0,
      /** 时标账本里属于这一项的 key（只有 `slow` 的才需要，一个项一格，两个域不互相顶账） */
      timeKey: spec.slow ? `hazard:${++this._spawnSeq}` : null,
      /** 这一项此刻是否持有玩家那一格时标 */
      slowing: false,
      /** 挂过账的那个玩家（`_letGo` 由 `cancelFor` 调用时也拿得到，不必把 playerRef 一路传下来） */
      slave: null,
      tickT: 0,
      t: 0,
      done: false,
      /** 域正在持续（只有给了 `duration` 的会进这一段） */
      active: false,
      cancelled: false,
      disc,
    };
    // 一个"域"必须往地上留下点什么：按段掉血、拽人、或者改时标 —— 三者皆无就是铺了一块看不见的空地
    if (item.duration > 0 && !(item.tick > 0) && !item.slow && !item.pull) {
      throw new Error('持续型危险区必须结算点什么：正的 tick、pull 或 slow');
    }
    // 一击定音的老圈子（`duration` 为 0）不走这条：它的伤害在落地那一拍结，与 tick 无关
    if (item.duration > 0 && item.damage > 0 && !(item.tick > 0)) {
      throw new Error('按段结算的伤害必须有正的 tick，否则段数无从谈起');
    }
    this._items.push(item);
    return item;
  }

  _acquire(color) {
    const disc = this._pool.pop() ?? new THREE.Mesh(
      this.geometry,
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    );
    disc.material.color.setHex(color);
    disc.visible = true;
    this.group.add(disc);
    return disc;
  }

  update(dt, playerPos, playerRef) {
    for (let i = this._items.length - 1; i >= 0; i--) {
      const it = this._items[i];
      it.t += dt;
      if (!it.done) {
        const p = Math.min(1, it.t / it.telegraph);
        const g = GROUND_HAZARD.growFrom;
        it.disc.scale.setScalar(it.radius * (g + (1 - g) * p));
        // 脉动乘以前摇进度：刚画出来时几乎透明，越接近落点越实、也跳得越显眼
        const { warn, pulse } = GROUND_HAZARD.opacity;
        it.disc.material.opacity = (warn + pulse * Math.sin(it.t * PULSE)) * p;
        if (p < 1) continue;
        this._land(it, playerPos, playerRef);
        it.t = 0;
        it.tickT = 0;
        // `_land` 已把这一招标成落地：一击定音的到此转入余像，给了 `duration` 的再持续一段
        if (it.duration > 0) it.active = true;
        continue;
      }
      if (it.active) {
        this._sustain(it, dt, playerPos, playerRef);
        if (it.t >= it.duration) {
          // 域到期那一帧就还账：余像只是给眼睛看的，不许留在玩家身上
          this._letGo(it);
          it.active = false;
          it.t = 0;
        }
        continue;
      }
      const q = Math.min(1, it.t / GROUND_HAZARD.linger);
      it.disc.material.opacity = GROUND_HAZARD.opacity.burst * (1 - q);
      if (q >= 1) this._release(i);
    }
  }

  /**
   * 持续段：每 `tick` 秒对圈内的玩家结算一次，并按 `pull` 把人往圆心拽。
   *
   * 段与段之间用 `while` 补齐，所以 30Hz 与 144Hz 在一秒里挨的段数一样（B39 那条纪律）。
   * 拉力不看无敌帧：无敌帧是"这一下不算"，不是"这一下别把我拖进去" —— 拖进去之后
   * 下一段照样落在身上，这才是"站进引力井里"该有的代价。
   */
  _sustain(it, dt, playerPos, playerRef) {
    const { warn, burst } = GROUND_HAZARD.opacity;
    it.disc.scale.setScalar(it.radius);
    // 时停域的脉动按它自己的时标放慢：这块地"时间变厚"要在圈上读得出来（M5 的起点）
    it.disc.material.opacity = warn
      + (0.5 + 0.5 * Math.sin(it.t * PULSE * (it.slow || 1))) * (burst - warn);
    if (!playerPos || !playerRef) return;
    const dx = it.x - playerPos.x;
    const dz = it.z - playerPos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > it.radius * it.radius) {
      // 走出去那一帧就还账，不等绳子自己烧完 —— 玩家的直觉是"我出来了"，不是"我再慢 0.12 秒"
      if (it.slowing) this._letGo(it);
      return;
    }
    const d = Math.sqrt(d2);
    const vel = playerRef.velocity;
    // 圆心一米内不再加速：那里已经算被吸住了，继续推只会让它在原点上抖
    if (vel && it.pull && d > 0.4) {
      const k = (it.pull * dt) / d;
      vel.x += dx * k;
      vel.z += dz * k;
    }
    if (it.slow) this._hold(it, playerRef);
    if (!it.tick) return;
    it.tickT += dt;
    while (it.tickT >= it.tick) {
      it.tickT -= it.tick;
      if (!playerRef.combat.isInvulnerable()) playerRef.combat.takeDamage(it.damage);
    }
  }

  /** 在玩家身上挂一格时标：每帧续一次绳，域死了/到期了/人走出去了都不需要谁记得来注销 */
  _hold(it, playerRef) {
    playerRef.applyTimeScale(it.timeKey, it.slow, TIME_SCALE_LEASH);
    it.slowing = true;
    it.slave = playerRef;
  }

  /** 还账（幂等：没有持有时什么都不做） */
  _letGo(it) {
    if (!it.slowing) return;
    it.slowing = false;
    it.slave?.releaseTimeScale(it.timeKey);
    it.slave = null;
  }

  /** 落地那一帧：只看水平距离（能不能跳过去是后续切片的题），一击定音、不重复扣血 */
  _land(it, playerPos, playerRef) {
    it.done = true;
    // `damage: 0` 的域（时停）落地那拍不掉血：它改的是时标，一条伤害数字都不该冒出来
    if (it.damage > 0 && playerPos && playerRef && !it.cancelled) {
      const dx = playerPos.x - it.x;
      const dz = playerPos.z - it.z;
      const inside = dx * dx + dz * dz <= it.radius * it.radius;
      if (inside && !playerRef.combat.isInvulnerable()) playerRef.combat.takeDamage(it.damage);
    }
    it.disc.material.opacity = GROUND_HAZARD.opacity.burst;
  }

  /**
   * 撤掉某位施法者**还没落下**的圈（它死了 / 这场仗结束了）：已经落下的不撤，余像该看完。
   *
   * 域（`active`）是唯一的例外：它还在按段扣血，而"还在扣血"依附的是施法者活着这件事 ——
   * 井塌了就是塌了，玩家不该被一个已死的引力井继续拖着挨段。已经落下的那一拍仍算数。
   */
  cancelFor(owner) {
    for (let i = this._items.length - 1; i >= 0; i--) {
      const it = this._items[i];
      if (it.owner !== owner) continue;
      if (!it.done) {
        it.cancelled = true;
        it.done = true;
        this._release(i);
      } else if (it.active) {
        it.cancelled = true;
        this._letGo(it);
        it.active = false;
        it.t = 0;
      }
    }
  }

  _release(i) {
    const it = this._items[i];
    this._items.splice(i, 1);
    this.group.remove(it.disc);
    it.disc.visible = false;
    this._pool.push(it.disc);
  }

  count() {
    return this._items.length;
  }

  /** 池里备用网格数：泄漏 watchdog（F3）与用例都看这个，不翻内部结构 */
  pooled() {
    return this._pool.length;
  }
}
