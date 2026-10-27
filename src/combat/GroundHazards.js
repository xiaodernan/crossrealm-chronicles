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
 *
 * 「全场时停」（切片13）是切片5 那条禁令的**唯一**合法例外，走的是显式契约而不是就地默认：
 * - 构造时必须传入 `time`（`TimeController`）通道 —— 没有通道的层当场在 `spawn()` 抛错，
 *   世界时钟不允许被一个"只是想画个圈"的调用方顺手段持；
 * - 持有只经 `Time.holdScale(id, scale)` 这一扇门，本层任何代码都**不直接写** `timeScale`，
 *   也不碰 hitstop（两套语义在 Time 里互取更小）；
 * - 世界减速项自己的账本（前摇 / tick / duration）吃 **`rawDt`**：它把世界调慢的那几秒里，
 *   若自己的秒数也跟着缩水，"持续 3.6 秒"就会变成"持续到天荒地老" —— 越慢越久、越久越慢。
 *   吃 rawDt 之后，"3.6 秒"说的就是**墙钟**的 3.6 秒，期间世界只走 3.6 × 0.35 的游戏秒；
 * - 圈**不是**这一档的边界：世界时钟不归任何一块地管，走出圈照样慢。圈只是宣告
 *   （"这一拍世界要厚了"）与**伤害**的边界 —— 这是位置能拥有的全部。
 */

/** 脉动频率（1/秒）：只影响透明度，不影响判定，所以不需要进内容表 */
const PULSE = 14;

/**
 * 边缘环的厚度占半径比（W-A6 切片9，M5）：环是**单位环**按半径缩放，
 * 所以厚度随半径等比变 —— 半径 4.5 的砸地圈环厚约 0.5 米，半径 3 的弹幕圈约 0.33 米。
 * 与 `PULSE` 同一条纪律：纯表现常数，不进内容表。
 */
const RING_INNER = 0.88;
/** 环比盘面再抬高这么多：同高度会 Z-fighting，玩家看到的是闪烁而不是边界 */
const RING_LIFT = 0.02;

/**
 * 出场涟漪（W-A6 切片12）：`spec.ripple` 为真的圈（阶段入场招）在画下的那一刻，
 * 从**真实半径**向外再扩出一圈会淡去的波 —— 圈不是"凭空出现"，是"砸进场地里"。
 * 与 `RING_INNER` 同一条纪律：纯表现常数，不进内容表。
 */
const RIPPLE_SPREAD = 1.35;
const RIPPLE_LIFE = 0.55;

export class GroundHazards {
  constructor(scene, world, audio = null, time = null) {
    this.world = world;
    /** 场景：拆的时候要把那一组摘下来（改前只在构造时用过一次场景，没存 ⇒ 拆不了） */
    this.scene = scene;
    /**
     * 落地前提示音的音效句柄（M6）。**可空**：node 用例与没有音频的场景不传，
     * 调用点一律走可选链 —— 这一层不因为"没带喇叭"就抛。
     */
    this.audio = audio ?? null;
    /**
     * 时间通道（切片13）：世界减速项（「全场时停」）经由 `Time.holdScale` 持有世界时标。
     * **可空**：不传的层铺不了这一档 —— `spawn()` 当场抛（显式契约），其余档位不受影响。
     */
    this.time = time ?? null;
    this.geometry = new THREE.CircleGeometry(1, 48);
    /**
     * 边缘环（M5）：与圆盘**同生同灭**的另一件几何，共享一份单位环。
     * 它回答的是圆盘回答不了的问题 —— "这一圈最终会盖到哪儿"：
     * 填充盘从 25% 涨满，前摇前半段玩家看到的是**会继续长大**的圆；
     * 环从第一帧就是判定半径，站不站得出圈从此一眼可判。
     */
    this.ringGeometry = new THREE.RingGeometry(RING_INNER, 1, 48);
    this._ringPool = [];
    /** 出场涟漪（切片12）的池：与边缘环同几何，但寿命与透明度各自推进，池也分家 */
    this._ripplePool = [];
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
   * 域还可以改**世界**的时标：给了 `worldSlow` 的那一档（切片13 的「全场时停」）在落地后
   * 经 `this.time.holdScale(worldKey, worldSlow)` 持有世界时钟，直到到期 / 主人倒地 / 拆层
   * 三条路还账 —— **走出圈不还**（世界时钟不归任何一块地管，圈只是宣告与伤害的边界）。
   * 与 `slow` 互斥（一个来源不许同时改两个时钟），且必须有正的 `duration` 与 time 通道，
   * 四条守卫见下方；它的前摇 / tick / duration 吃 `rawDt`，不被自己的减速拖长。
   *
   * 返回的就是内部那一项：调用方拿它判 `done`（这一招落地了），不需要另一套句柄记账。
   */
  spawn(spec) {
    const disc = this._acquire(spec.color);
    const ring = this._acquireRing(spec.color);
    const y = (this.world?.getGroundHeight(spec.x, spec.z) ?? 0) + GROUND_HAZARD.yOffset;
    disc.position.set(spec.x, y, spec.z);
    disc.scale.setScalar(spec.radius * GROUND_HAZARD.growFrom);
    // 环：真实半径、从第一帧就画满 —— 这正是它与填充盘的分工
    ring.position.set(spec.x, y + RING_LIFT, spec.z);
    ring.scale.setScalar(spec.radius);
    // 出场涟漪（切片12）：阶段入场招（`spec.ripple`）画下的那一刻再起一圈会淡去的波，
    // 从真实半径向外扩 —— "这一档开始铺场了"不光是圈亮起来，圈还要砸出动静。
    // 常规铺场不给：涟漪是"阶段变了"的宣告，不是每个圈的心跳。
    let rippleMesh = null;
    if (spec.ripple) {
      rippleMesh = this._acquireRipple(spec.color);
      rippleMesh.position.set(spec.x, y + RING_LIFT * 2, spec.z);
      rippleMesh.scale.setScalar(spec.radius);
    }
    const item = {
      x: spec.x,
      z: spec.z,
      radius: spec.radius,
      telegraph: spec.telegraph,
      /** 追踪落点：前摇前 `trackRatio` 段跟着玩家走（0 = 不追，画下即钉死） */
      trackRatio: spec.track ?? 0,
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
      /**
       * 世界时标（切片13 的「全场时停」）：落地后全场一起慢到这个倍率；0 = 不动世界时钟。
       * 与 `slow` 互斥 —— 一个来源不许同时改人的账本和世界的时钟。
       */
      worldSlow: spec.worldSlow ?? 0,
      /**
       * 每 tick 给**施法者**回的血（敌方治疗域，W-E3 切片2）。
       *
       * 改前 `move.healZone` 只是数据表里的一格，`src/` 里没有任何人读它 ——
       * 辉煌骑士的"圣洁冲击"写着"在原地留下一圈治愈光环"，实际那一招只是把玩家推开。
       * 现在它是**真的**：骑士站在圈里每 tick 回血，玩家进圈是威胁区（不是白给的好处），
       * 于是"吃推开"与"冒险进圈"成了真正的二选一。
       */
      heal: spec.heal ?? 0,
      /** 时标账本里属于这一项的 key（只有 `slow` 的才需要，一个项一格，两个域不互相顶账） */
      timeKey: spec.slow ? `hazard:${++this._spawnSeq}` : null,
      /** 世界时标持有通道里属于这一项的 id（切片13；与 timeKey 共用一枚自增，互斥所以不撞） */
      worldKey: spec.worldSlow ? `hazard-world:${++this._spawnSeq}` : null,
      /** 这一项此刻是否持有玩家那一格时标 */
      slowing: false,
      /** 这一项此刻是否持有世界时标（切片13） */
      holding: false,
      /** 挂过账的那个玩家（`_letGo` 由 `cancelFor` 调用时也拿得到，不必把 playerRef 一路传下来） */
      slave: null,
      tickT: 0,
      t: 0,
      done: false,
      /** 域正在持续（只有给了 `duration` 的会进这一段） */
      active: false,
      cancelled: false,
      disc,
      ring,
      /** 出场涟漪（切片12）：动画走完自己回池；项被撤走时随 `_release` 一起回池 */
      rippleMesh,
      rippleT: 0,
      /** 落地提示音响过了没有（M6：一个圈只响一次，落地后不补） */
      warned: false,
    };
    // 全场时停的四条守卫（切片13 的显式契约 —— 少一条，世界时钟就会从别的口子漏走）：
    // 互斥（一个来源一个时钟）、通道（没 time 的层不许持有）、有尽头（不许无限期持有）、开区间
    if (item.worldSlow) {
      if (item.slow) throw new Error('全场时停与玩家减速互斥：一个来源不许同时改两个时钟');
      if (!this.time) throw new Error('全场时停需要时间通道：构造时传入 time 才许持有世界时标');
      if (!(item.duration > 0)) throw new Error('全场时停必须有正的 duration：世界时标不许被无限期持有');
      if (!(item.worldSlow > 0 && item.worldSlow < 1)) {
        throw new Error('全场时停的 worldSlow 必须在 (0,1) 开区间内');
      }
    }
    // 一个"域"必须往地上留下点什么：按段掉血、拽人、改时标，或者改世界的时标 ——
    // 四者皆无就是铺了一块看不见的空地
    if (item.duration > 0 && !(item.tick > 0) && !item.slow && !item.pull && !item.worldSlow) {
      throw new Error('持续型危险区必须结算点什么：正的 tick、pull、slow 或 worldSlow');
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

  /** 边缘环：与圆盘同一套池化纪律（借用 → 整体重设 → 归还） */
  _acquireRing(color) {
    const ring = this._ringPool.pop() ?? new THREE.Mesh(
      this.ringGeometry,
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.material.color.setHex(color);
    ring.material.opacity = GROUND_HAZARD.opacity.edge;
    ring.rotation.x = -Math.PI / 2;
    ring.visible = true;
    this.group.add(ring);
    return ring;
  }

  /** 出场涟漪：与边缘环同一份单位环、同一套池化纪律，只是池分家（探针各看各的账） */
  _acquireRipple(color) {
    const ripple = this._ripplePool.pop() ?? new THREE.Mesh(
      this.ringGeometry,
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    );
    ripple.material.color.setHex(color);
    ripple.material.opacity = GROUND_HAZARD.opacity.edge;
    ripple.rotation.x = -Math.PI / 2;
    ripple.visible = true;
    this.group.add(ripple);
    return ripple;
  }

  /**
   * 出场涟漪的一帧：从真实半径向外扩到 `RIPPLE_SPREAD × radius`，浓度从 `edge` 线性到 0，
   * 走完当场回池 —— 它是一次性的宣告，不该陪着圈过完整个前摇。dt 驱动（B39）。
   */
  _stepRipple(it, dt) {
    if (!it.rippleMesh) return;
    it.rippleT += dt;
    const q = it.rippleT / RIPPLE_LIFE;
    if (q >= 1) {
      this.group.remove(it.rippleMesh);
      it.rippleMesh.visible = false;
      this._ripplePool.push(it.rippleMesh);
      it.rippleMesh = null;
      return;
    }
    it.rippleMesh.scale.setScalar(it.radius * (1 + (RIPPLE_SPREAD - 1) * q));
    it.rippleMesh.material.opacity = GROUND_HAZARD.opacity.edge * (1 - q);
  }

  update(dt, playerPos, playerRef) {
    // 世界减速项（切片13）自己的账本吃 `rawDt`：它把世界调慢的那几秒里，若也跟着 dt 缩水，
    // "持续 N 秒"就会自己把自己拉长 —— 越慢越久、越久越慢。其余项不受影响（own === dt）。
    const rawDt = this.time ? this.time.rawDt : dt;
    for (let i = this._items.length - 1; i >= 0; i--) {
      const it = this._items[i];
      const own = it.worldSlow ? rawDt : dt;
      it.t += own;
      // 涟漪先于一切状态推进：它是一次性的出场宣告，圈落地与否都不欠它一帧
      this._stepRipple(it, own);
      if (!it.done) {
        // 追踪落点（第五种场地招）：前摇的**前 `trackRatio` 段**跟着玩家走，之后锁死不再动。
        // 非追踪的圈 `trackRatio === 0`，这段整个跳过 —— 与修前逐字节一致。
        if (it.trackRatio > 0 && playerPos && it.t < it.telegraph * it.trackRatio) {
          it.x = playerPos.x;
          it.z = playerPos.z;
          const gy = (this.world?.getGroundHeight(it.x, it.z) ?? 0) + GROUND_HAZARD.yOffset;
          it.disc.position.set(it.x, gy, it.z);
          it.ring.position.set(it.x, gy + RING_LIFT, it.z);
        }
        const p = Math.min(1, it.t / it.telegraph);
        const g = GROUND_HAZARD.growFrom;
        it.disc.scale.setScalar(it.radius * (g + (1 - g) * p));
        // 脉动乘以前摇进度：刚画出来时几乎透明，越接近落点越实、也跳得越显眼
        const { warn, pulse, edge } = GROUND_HAZARD.opacity;
        it.disc.material.opacity = (warn + pulse * Math.sin(it.t * PULSE)) * p;
        // 环不参与"长大"：前摇全程按真实半径常显（M5）
        it.ring.material.opacity = edge;
        // M6：落地前 `warnLead` 秒给一声。只响一次；被 cancelFor 撤掉的圈走不到这
        // （它当场离开 _items），所以"死了的圈"不会从坟里响。
        if (!it.warned && it.telegraph - it.t <= GROUND_HAZARD.warnLead) {
          it.warned = true;
          this.audio?.hazardWarn?.();
        }
        if (p < 1) continue;
        this._land(it, playerPos, playerRef);
        it.t = 0;
        it.tickT = 0;
        // `_land` 已把这一招标成落地：一击定音的到此转入余像，给了 `duration` 的再持续一段
        if (it.duration > 0) {
          it.active = true;
          // 全场时停在落地那一拍申领世界时标；`Time` 要到下一次 `tick` 才重算 timeScale，
          // 慢下来晚一帧 —— 一帧之内世界照常走，这是持有语义的既定滞后，不是漏算
          if (it.worldSlow) this._holdWorld(it);
        }
        continue;
      }
      if (it.active) {
        this._sustain(it, own, playerPos, playerRef);
        if (it.t >= it.duration) {
          // 域到期那一帧就还账：余像只是给眼睛看的，不许留在玩家身上；世界时钟同帧还
          this._letGo(it);
          this._releaseWorld(it);
          it.active = false;
          it.t = 0;
        }
        continue;
      }
      const q = Math.min(1, it.t / GROUND_HAZARD.linger);
      it.disc.material.opacity = GROUND_HAZARD.opacity.burst * (1 - q);
      it.ring.material.opacity = GROUND_HAZARD.opacity.edge * (1 - q);
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
    const { warn, burst, edge } = GROUND_HAZARD.opacity;
    it.disc.scale.setScalar(it.radius);
    // 域的边界全程亮着：被拽的那几秒里，"再迈一步就出去"必须看得见
    it.ring.material.opacity = edge;
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
    // 圆心一米内不再加速：那里已经算被吸住了，继续推只会让它在原点上抖。
    // 走玩家的冲量账而不是写 `velocity`：写速度的话，玩家按住方向键的每一帧
    // 都会被状态机整条改写回来，"挣脱引力井"就退化成"按住方向键"（W-A6 切片6）。
    // 用 `applySustainedForce` 而不是 `applyKnockback`：拉力是加速度，稳态速度必须与帧率无关
    if (it.pull && d > 0.4) playerRef.applySustainedForce(dx, dz, it.pull, dt);
    if (it.slow) this._hold(it, playerRef);
    if (!it.tick) return;
    it.tickT += dt;
    while (it.tickT >= it.tick) {
      it.tickT -= it.tick;
      // 敌方治疗域：回的是**施法者**（`owner`），不是玩家。
      // 与伤害同一段结算：域活着的那几秒，骑士每 tick 续一次血。
      if (it.heal) it.owner?.heal?.(it.heal);
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

  /**
   * 申领世界时标（切片13）：只经 `Time.holdScale` 这一扇门，本层从不直接写 `timeScale`。
   * 通道与区间在 `spawn()` 的四条守卫里验过，这里只需照办。
   */
  _holdWorld(it) {
    it.holding = true;
    this.time.holdScale(it.worldKey, it.worldSlow);
  }

  /** 还世界时标（幂等）。**走出圈不还** —— 位置不拥有世界时钟；还账的路只有到期 / 主人倒地 / 拆层 */
  _releaseWorld(it) {
    if (!it.holding) return;
    it.holding = false;
    this.time?.releaseScale(it.worldKey);
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
        this._releaseWorld(it);
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
    this.group.remove(it.ring);
    it.ring.visible = false;
    this._ringPool.push(it.ring);
    // 涟漪跟着项走：撤掉的圈不许留下还在扩散的波 —— "撤"就是把许诺收回去
    if (it.rippleMesh) {
      this.group.remove(it.rippleMesh);
      it.rippleMesh.visible = false;
      this._ripplePool.push(it.rippleMesh);
      it.rippleMesh = null;
    }
  }

  count() {
    return this._items.length;
  }

  /** 池里备用网格数：泄漏 watchdog（F3）与用例都看这个，不翻内部结构 */
  pooled() {
    return this._pool.length;
  }

  /** 边缘环的池（M5）：与 `pooled()` 同口径，环的泄漏单独看得见 */
  ringPooled() {
    return this._ringPool.length;
  }

  /** 出场涟漪的池（切片12）：与 `ringPooled()` 同口径 */
  ripplePooled() {
    return this._ripplePool.length;
  }

  /**
   * 拆干净：把危险区那一组从场景里摘掉，逐个释放圈的材质，再释放那份共享几何。
   *
   * 为什么现在才有（W-C1 切片3g）：`Game._adopt` **拒绝**没有 `dispose()` 的子系统
   * （"假装收编"的防线），而这一层此前**没有** `dispose()` ⇒ 它从不被收编 ⇒
   * `Game.dispose()` 走完，它造的那些几何与材质**一份都不还**。
   *
   * 圈的**几何**是这一层共享的一份（所有圈同一个大小）⇒ 只释放一次；
   * 圈的**材质**逐圈一份（透明度与颜色各自推进）⇒ 逐个释放。
   */
  dispose() {
    // 拆层也还世界时标（切片13）：层都没了，持有的"全场时停"不许悬在世界时钟上
    for (const it of this._items) this._releaseWorld(it);
    this.scene.remove(this.group);
    for (const disc of [...this._pool, ...this._items.map((it) => it.disc)]) {
      disc.material?.dispose?.();
    }
    for (const ring of [...this._ringPool, ...this._items.map((it) => it.ring)]) {
      ring.material?.dispose?.();
    }
    for (const ripple of [...this._ripplePool, ...this._items.map((it) => it.rippleMesh).filter(Boolean)]) {
      ripple.material?.dispose?.();
    }
    this._pool.length = 0;
    this._ringPool.length = 0;
    this._ripplePool.length = 0;
    this._items.length = 0;
    this.geometry?.dispose?.();
    this.ringGeometry?.dispose?.();
  }
}
