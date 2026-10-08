import * as THREE from 'three';
import { Enemy } from './Enemy.js';
import { GROUND_HAZARD } from '../content/tuning.js';
import { ARENA_MOVES, arenaScriptFor } from '../content/arenaScripts.js';
import { barrageLayout } from './BarragePattern.js';
import { BossStateMachine, BossPhase, PhaseTransitionCondition } from './BossStateMachine.js';
import { phaseTuningFor } from '../content/bossPhases.js';
import { applyShadow } from '../engine/shadowPolicy.js';

/** 影界守护者 — 首个 Boss，三阶段 */
export class Boss extends Enemy {
  constructor(scene, world, config) {
    super(scene, world, {
      ...config,
      type: 'boss',
      hp: 800,
      posture: 120,
      damage: 18,
      speed: 4.5,
      aggroRange: 40,
      attackRange: 3.5,
      respawn: false,
      name: config.name ?? '影界守护者',
    });

    this.bossId = config.bossId ?? 'shadow-warden';
    // 没有 `this.phase = 1`：阶段由状态机初始化（构造它的那几行在下面），
    // `phase` 是取/设值器（见类里那段注释）—— 在这一行 `this.sm` 还不存在
    this.arenaCenter = config.arenaCenter ?? this.position.clone();
    this.arenaRadius = config.arenaRadius ?? 22;
    this.enraged = false;
    /** 危险区系统由 `EnemyManager` 在生成 Boss 时交出（与远程招的 `projectiles` 同一条路） */
    this.hazards = config.hazards ?? null;
    /** 本场砸地许诺出去的那个圈；`done` 之前 Boss 一直站在 slam 态 */
    this.slamHazard = null;
    /**
     * 场地脚本按 `bossId` 取（`content/arenaScripts.js`，加载期整表校验过）。
     * `_arenaCd` 与条目同序、构造期一次分配：热路径只读写，不再建对象。
     */
    this.arenaScript = arenaScriptFor(this.bossId);
    this._arenaCd = this.arenaScript.map(() => 0);
    this.phaseTriggered = { p2: false, p3: false };
    /** 状态机（W-B8 切片1） */
    this.sm = new BossStateMachine(this);
    /* 门槛用**枚举**而不是字面量：写 `'hp_threshold'` 就是给这张枚举再抄一份真源，
     * 抄错了不报错（只是那条条件永远不成立、那只 Boss 永远不进二阶段）。 */
    this.sm.registerTransitionCondition(BossPhase.PHASE_2, {
      type: PhaseTransitionCondition.HP_THRESHOLD, threshold: 0.5,
    });
    this.sm.registerTransitionCondition(BossPhase.PHASE_3, {
      type: PhaseTransitionCondition.HP_THRESHOLD, threshold: 0.25,
    });
    this.sm.debug = false;
    /* 把三档参数注册成**阶段行为表**（W-B8 切片5）。
     *
     * 这正是切片1 就设计好、却一直没人用的那条钩子（切片4 曾如实记过"保留但今天还没人用"）——
     * 它现在有位置了：`getCurrentBehavior()` 返回的就是"当前这一档该怎么打"，
     * 各 Boss 的 `update` 不再按 `this.phase` 现算。 */
    for (const phase of [BossPhase.PHASE_1, BossPhase.PHASE_2, BossPhase.PHASE_3]) {
      this.sm.registerPhaseBehavior(phase, phaseTuningFor(this.bossId, phase));
    }
  }

  createMesh(config) {
    const group = new THREE.Group();

    const cloakMat = new THREE.MeshStandardMaterial({
      color: 0x1a1028,
      emissive: 0x220044,
      emissiveIntensity: 0.4,
      roughness: 0.6,
    });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 1.8, 12, 24), cloakMat);
    body.position.y = 2.0;
    applyShadow(body, 'actor');
    body.name = 'body';
    group.add(body);

    const crown = new THREE.Mesh(
      new THREE.TorusGeometry(0.9, 0.12, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0xc9a962, emissive: 0x664400, emissiveIntensity: 0.6, metalness: 0.8 })
    );
    crown.rotation.x = Math.PI / 2;
    crown.position.y = 3.6;
    group.add(crown);

    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 2.2, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x8899aa, emissive: 0x224466, emissiveIntensity: 0.5, metalness: 0.9 })
    );
    blade.position.set(1.0, 2.0, 0);
    blade.rotation.z = -0.4;
    blade.name = 'blade';
    group.add(blade);

    return group;
  }

  /** Boss 体型大一圈：血条更宽、离地更高（W-A3 之后由 `_buildHpBar` 统一创建） */
  hpBarSpec() {
    return { width: 2.4, height: 0.18, color: 0xaa2222, bg: 0x111111, offsetY: 4.5 };
  }

  takeDamage(amount, postureDamage = 0) {
    if (!this.alive) return false;
    // 必须把"是否致死"回传，否则处决/掉落判定对 Boss 永远不触发
    const killed = super.takeDamage(amount, postureDamage);
    this.checkPhase();
    this._emitHealth();
    return killed;
  }

  /** 仅在数值变化时广播，避免每帧一条事件（B10） */
  _emitHealth() {
    const sig = `${this.hp}|${this.phase}`;
    if (sig === this._healthSig) return;
    this._healthSig = sig;
    window.dispatchEvent(new CustomEvent('boss-health', {
      detail: { hp: this.hp, maxHp: this.maxHp, phase: this.phase, name: this.name },
    }));
  }

  /**
   * 阶段：**读**回状态机那本账，**写**走状态机的唯一入口（W-B8 切片6）。
   *
   * 修前 `phase` 是一个普通字段，由 `checkPhase()` 每帧从 `sm.phase` 抄回来 ——
   * 两个字段记同一件事，于是"直接给 `this.phase` 赋值"是个能骗过一半读者的后门：
   * 场地脚本读 `this.phase`、阶段参数表读 `sm.phase`，两边会给出不同的阶段。
   * 切片5 接上阶段表时这件事当场显形（两个既有用例红）。
   *
   * 现在它是取/设值器：
   * - **读**永远等于 `sm.phase`，"谁是权威"不再靠约定；
   * - **写**走 `sm.transitionTo()` —— 那一条同时负责范围校验、进入/离开钩子与
   *   `boss-phase` 事件，于是"改了阶段却没派事件"或"派了事件却没改阶段"都不再可能。
   *
   * 因此 `boss.phase = N` 这种写法**仍然有效**（切片6 之前有 7 个测试文件这么写、
   * 46 条用例），只是它现在真的经过状态机 —— 那是本片想要的：**写法不必改，
   * 但语义从此只有一条路**。
   */
  get phase() {
    return this.sm.phase;
  }

  set phase(p) {
    this.sm.transitionTo(p);
  }

  /**
   * 当前这一档的参数（W-B8 切片5）。**各 Boss 的 `update` 都从这里取数** ——
   * 于是"这只 Boss 二阶段什么样"有唯一一处可读，而不是散在三段算术里。
   *
   * 取不到时（理论上不会：构造时把三档都注册了）退回基类缺省那一档，
   * 而不是让调用方拿到 `undefined` 再自己 `?.` —— 后者会变成"某只 Boss 忘了兜底，
   * 于是它的 `attackCooldown` 是 `undefined`、`strike` 之后立刻又能出手"。
   */
  tuning() {
    return this.sm.behaviorFor(this.phase) ?? phaseTuningFor(this.bossId, this.phase);
  }

  checkPhase() {
    // 阶段推进由状态机负责；同步一次 phase（防止外部直接改了 this.phase 绕过状态机）
    this.phase = this.sm.phase;
    this.sm.checkPhaseTransitions();
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.state = 'dead';
    this.setBodyVisible(false);
    this.clearTelegraph();
    // 还没落下的圈跟着主人一起撤：死后还从坟里砸玩家一下，是最难解释的一种伤害
    this.hazards?.cancelFor(this);
    this.slamHazard = null;
    window.dispatchEvent(new CustomEvent('enemy-defeated', {
      detail: { name: this.name, type: 'boss', bossId: this.bossId },
    }));
    window.dispatchEvent(new CustomEvent('boss-defeated', { detail: { bossId: this.bossId } }));
  }

  /**
   * 把场地落点夹回竞技场内，四周留出 `margin` 米边距（危险区传自己的半径）。
   * 圈不该画到墙外：玩家贴边躲雨时，场外的圈既打不着他、也不该铺出来 ——
   * 那等于用一片"永远走不进去也躲不开"的假预告糊满场地。
   */
  clampIntoArena(x, z, margin = 0) {
    const c = this.arenaCenter;
    const limit = Math.max(0, this.arenaRadius - margin);
    const dx = x - c.x;
    const dz = z - c.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d <= limit || d === 0) return { x, z };
    const k = limit / d;
    return { x: c.x + dx * k, z: c.z + dz * k };
  }

  /**
   * 起手砸地：把红圈交给场地危险区系统，本体只说"这一招我许诺出去了"。
   *
   * 返回 false 表示没能起手（已经有一圈在走 / 没有危险区系统 —— 例如用例直接 `new Boss`）。
   * 后者必须让调用方退回普通起手，而不是把 Boss 钉死在一个永远落地的 slam 态。
   */
  startSlamTelegraph() {
    if (this.slamHazard || !this.hazards) return false;
    const spec = GROUND_HAZARD.bossSlam;
    this.slamHazard = this.hazards.spawn({
      x: this.position.x,
      z: this.position.z,
      radius: spec.radius,
      telegraph: spec.telegraph,
      damage: spec.damage,
      color: spec.color,
      owner: this,
    });
    this.state = 'slam';
    this.stateTimer = 0;
    return true;
  }

  /**
   * slam 态的唯一退出条件：圈落地了。伤害、半径、时机都在危险区那一侧结算，
   * 这里不复制一份判定 —— 两处时钟迟早会漂，漂了的症状是"圈已经散了人还在挨打"。
   * 也不写网格高度：悬停型 Boss（引力化身）在这一段自己管浮沉。
   */
  updateSlam() {
    const h = this.slamHazard;
    if (h?.done) {
      this.slamHazard = null;
      this.state = 'idle';
      this.attackCooldown = GROUND_HAZARD.bossSlam.recover;
    } else if (!h) {
      this.state = 'idle';
    }
  }

  /** 这条脚本条目对应的数值档（形状/伤害/颜色都在 `GROUND_HAZARD` 那一份里） */
  arenaSpec(entry) {
    return GROUND_HAZARD[ARENA_MOVES[entry.move]];
  }

  /** 放出一招场地招。返回 false = 没放成（没有危险区系统 / 已有一圈在走），冷却也不该重置 */
  castArenaMove(entry, playerPos) {
    if (entry.move === 'barrage') return this.startBarrage(playerPos, entry);
    if (entry.move === 'slam') return this.startSlamTelegraph();
    return this.startDomain(playerPos, entry);
  }

  /**
   * 计时型与机会型场地招：每帧按脚本表推进，**与 Boss 自己处在什么状态无关**。
   *
   * 排在 `update` 的 slam 早退之前 —— 砸地的那 1.2 秒里，别的地方的圈照样该落、
   * 冷却照样该走。旧实现把这条写在四个子类的 `super.update` 之前，语义一样，只是各抄一遍。
   */
  updateArenaCasts(dt, playerPos) {
    if (!this.hazards) return;
    const script = this.arenaScript;
    for (let i = 0; i < script.length; i++) {
      const e = script[i];
      if (e.trigger === 'melee' || this.phase < e.phase) continue;
      if (e.trigger === 'timed') {
        // `rate * dt`：期望次数按秒算，帧率换了概率跟着换，144Hz 不会比 30Hz 多挨几圈
        if (Math.random() < e.rate * dt) this.castArenaMove(e, playerPos);
        continue;
      }
      this._arenaCd[i] = Math.max(0, this._arenaCd[i] - dt);
      if (this._arenaCd[i] > 0 || this.distanceTo(playerPos) >= e.range) continue;
      if (this.castArenaMove(e, playerPos)) this._arenaCd[i] = e.cooldown;
    }
  }

  /**
   * 近战位上的场地招：脚本里 `trigger:'melee'` 的条目来抢这一次挥击。
   * 抢到了就不进 windup —— 玩家读到的前摇是"圈在脚下铺开"，不是一刀。
   */
  tryArenaMelee() {
    const script = this.arenaScript;
    for (let i = 0; i < script.length; i++) {
      const e = script[i];
      if (e.trigger !== 'melee' || this.phase < e.phase) continue;
      if (Math.random() < e.chance && this.castArenaMove(e, this.position)) return true;
    }
    return false;
  }

  /**
   * 落点圈阵列：以玩家**此刻**的位置为心，铺一片由内向外错时落下的圈。
   * 铺完就不再关心玩家往哪跑 —— 这一招买的是"你还站在原地没有"，逼的是持续移动。
   *
   * `entry.tint` 让不同 Boss 用同一份圈几何、各自的配色（引力和混沌不该都掉进奥术紫里）。
   */
  startBarrage(playerPos, entry) {
    if (!this.hazards) return false;
    const spec = GROUND_HAZARD[ARENA_MOVES.barrage];
    for (const p of barrageLayout(playerPos.x, playerPos.z, spec)) {
      const at = this.clampIntoArena(p.x, p.z, spec.radius);
      this.hazards.spawn({
        x: at.x,
        z: at.z,
        radius: spec.radius,
        telegraph: p.telegraph,
        damage: spec.damage,
        color: entry?.tint ?? spec.color,
        owner: this,
      });
    }
    return true;
  }

  /**
   * 有长度的场：在玩家**此刻**脚下开一片会持续存在的圈 —— 引力井与时停域共用这一份接线，
   * 区别只在 `GROUND_HAZARD` 那一档里填了什么（井有 `tick/damage/pull`，时停域 `damage: 0` 而带 `slow`）。
   * 再要第三、四种域时只需加一档数值，不必再进一次 `Boss`。
   *
   * 前摇那一秒多走出去很容易，难的是走出去之后别再回来：井每段拽你一把，
   * 时停域则把你钉在原地，让砸地和弹幕来收这份迟缓。
   */
  startDomain(playerPos, entry) {
    if (!this.hazards || !playerPos) return false;
    const spec = this.arenaSpec(entry);
    const at = this.clampIntoArena(playerPos.x, playerPos.z, spec.radius);
    this.hazards.spawn({
      x: at.x,
      z: at.z,
      radius: spec.radius,
      telegraph: spec.telegraph,
      damage: spec.damage,
      color: entry.tint ?? spec.color,
      duration: spec.duration,
      tick: spec.tick,
      pull: spec.pull,
      slow: spec.slow,
      owner: this,
    });
    return true;
  }

  update(dt, playerPos, playerRef) {
    if (!this.alive) return;

    // 场地招排在 slam 早退之前：砸地的那 1.2 秒里，别处的圈照样该落下
    this.updateArenaCasts(dt, playerPos);

    if (this.state === 'slam') {
      this.stateTimer += dt;
      this.updateSlam();
      return;
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.staggerTimer = Math.max(0, this.staggerTimer - dt);
    this.stateTimer += dt;

    if (this.staggerTimer > 0) {
      this.state = 'stagger';
      this.mesh.rotation.z = Math.sin(this.stateTimer * 18) * 0.12;
      return;
    }
    if (this.state === 'stagger') {
      this.state = 'idle';
      this.stateTimer = 0;
    }
    this.mesh.rotation.z = 0;

    // 阶段切换检查（W-B8 切片1：状态机驱动）
    this.sm.checkPhaseTransitions();

    const dist = this.distanceTo(playerPos);
    if (dist > this.aggroRange) {
      this.state = 'idle';
      this.updateMeshY();
      return;
    }

    if (this.state === 'windup') {
      if (this.stateTimer > 0.85) {
        this.state = 'strike';
        this.stateTimer = 0;
        if (dist < this.attackRange + 1 && playerRef && !playerRef.combat.isInvulnerable()) {
          playerRef.combat.takeDamage(this.damage, null, null, { from: this.position });
        }
        this.clearTelegraph();
      }
      this.updateMeshY();
      return;
    }

    if (this.state === 'strike') {
      if (this.stateTimer > 0.4) {
        this.state = 'idle';
        this.attackCooldown = this.tuning().attackCooldown;
      }
      return;
    }

    if (dist > this.attackRange) {
      const dx = playerPos.x - this.position.x;
      const dz = playerPos.z - this.position.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      this.position.x += (dx / len) * this.speed * dt;
      this.position.z += (dz / len) * this.speed * dt;
      this.mesh.rotation.y = Math.atan2(dx, dz);
    } else if (this.attackCooldown <= 0) {
      if (!this.tryArenaMelee()) {
        this.state = 'windup';
        this.stateTimer = 0;
        this.showTelegraph();
      }
    }

    this.updateMeshY();
    this._emitHealth();
  }

  /** 预警圈常驻复用：旧实现每次出手新建几何 + 材质，清除时只 remove 不 dispose */
  showTelegraph() {
    if (!this.telegraphRing) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.3, 1.2, 16),
        new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.1;
      ring.name = 'telegraph';
      this.telegraphRing = ring;
      this.mesh.add(ring);
    }
    this.telegraphRing.visible = true;
  }

  clearTelegraph() {
    if (this.telegraphRing) this.telegraphRing.visible = false;
  }
}
