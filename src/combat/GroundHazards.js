import * as THREE from 'three';
import { GROUND_HAZARD } from '../content/tuning.js';

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
  }

  /**
   * 交出一个危险区。`spec` 的字段与 `GROUND_HAZARD` 同名（radius / telegraph / damage / color），
   * `x`、`z` 是圆心，`owner` 是"谁许诺的"—— 施法者倒地时由 `cancelFor` 撤掉还没落下的圈，
   * 免得玩家被一个已经死掉的 Boss 从坟里打一下。
   *
   * 给了 `duration` 就是**域**而不是**一击**：落地那一拍照常结算，之后 `duration` 秒内
   * 每 `tick` 秒对圈内的玩家再结算一次，并按 `pull` 把玩家往圆心拽（引力井那一档）。
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
      tickT: 0,
      t: 0,
      done: false,
      /** 域正在持续（只有给了 `duration` 的会进这一段） */
      active: false,
      cancelled: false,
      disc,
    };
    if (item.duration > 0 && !(item.tick > 0)) {
      throw new Error('持续型危险区必须有正的 tick，否则按段结算无从谈起');
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
    it.disc.material.opacity = warn + (0.5 + 0.5 * Math.sin(it.t * PULSE)) * (burst - warn);
    if (!playerPos || !playerRef) return;
    const dx = it.x - playerPos.x;
    const dz = it.z - playerPos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > it.radius * it.radius) return;
    const d = Math.sqrt(d2);
    const vel = playerRef.velocity;
    // 圆心一米内不再加速：那里已经算被吸住了，继续推只会让它在原点上抖
    if (vel && it.pull && d > 0.4) {
      const k = (it.pull * dt) / d;
      vel.x += dx * k;
      vel.z += dz * k;
    }
    it.tickT += dt;
    while (it.tickT >= it.tick) {
      it.tickT -= it.tick;
      if (!playerRef.combat.isInvulnerable()) playerRef.combat.takeDamage(it.damage);
    }
  }

  /** 落地那一帧：只看水平距离（能不能跳过去是后续切片的题），一击定音、不重复扣血 */
  _land(it, playerPos, playerRef) {
    it.done = true;
    if (playerPos && playerRef && !it.cancelled) {
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
