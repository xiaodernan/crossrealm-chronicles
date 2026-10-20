import * as THREE from 'three';
import { Enemy } from './Enemy.js';
import { bossNameKeyOf } from '../content/bossRoster.js';
import { t } from '../engine/i18n.js';
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
      // 这一组是**基类影界守护者**的缺省档，不是所有 Boss 的。写死字面量会把子类递上来的
      // 覆盖成死数据（B100：契约在子类夹具里写着、在世界里一条都不成立，且无闸门会响）——
      // Magic/Space/Void/Chaos 各写各的 hp/damage/posture/speed，DungeonBoss 还另写
      // aggroRange/attackRange 与 `480 + rooms*25` 血量，全被下面这一串静默盖掉（修前五只
      // 外强中干都是 800/18/120 韧性/4.5 速/40 仇恨/3.5 出手）。整组改成"拿子类递上来的、
      // 缺省才落基类档"，让每个声明的 tunable 都能在实例上读回来。
      hp: config.hp ?? 800,
      posture: config.posture ?? 120,
      damage: config.damage ?? 18,
      speed: config.speed ?? 4.5,
      aggroRange: config.aggroRange ?? 40,
      attackRange: config.attackRange ?? 3.5,
      respawn: false,
      name: config.name ?? t(bossNameKeyOf(config.bossId ?? 'shadow-warden')),
    });

    this.bossId = config.bossId ?? 'shadow-warden';
    // 没有 `this.phase = 1`：阶段由状态机初始化（构造它的那几行在下面），
    // `phase` 是取/设值器（见类里那段注释）—— 在这一行 `this.sm` 还不存在
    this.arenaCenter = config.arenaCenter ?? this.position.clone();
    this.arenaRadius = config.arenaRadius ?? 22;
    /**
     * **有墙的那个场**（W-B10 切片5e，B101）：`{ x, z, hw, hd }` 是墙**内表面**围出来的矩形，
     * 由布局推出来交给这里（`room.w / 2 − wallT / 2`），不是再抄一个数。
     *
     * 与上面那一对的分工要说清，否则就是第二份真源：`arenaCenter / arenaRadius` 是**没有墙的再战**
     * 用的名义圈（世界 Boss 的拴绳，22 那个数没有任何几何与它对齐），而 `field` 一旦出现就代表
     * 这里真有一圈撞得到的墙 —— 落点钳制改按矩形逐轴走（`clampIntoArena`），并且砸地那种
     * "圆心在自己脚下"的招在放不下时**不起手**（`startSlamTelegraph`）。
     *
     * 为什么值得为砸地单开一条：那记的圈不走钳制（圆心就是 Boss 自己），改前实测把 Boss 摆到墙根
     * 能站到距场心 15.6 米，而 4.5 米的圈因此**越墙 3.40 米**（`.tmp-20261009/wb10s5b-probe3.mjs`）；
     * 墙那侧不是虚空而是邻居房走得到的地板 ⇒ 那半枚圈是一记玩家看不见、却真打得到人的伤害。
     */
    this.field = config.field ?? null;
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
    /**
     * 最近一次已知的玩家位置（W-A6 切片8）。转阶段发生在 `takeDamage` 里，
     * 那条路上没有 playerPos 参数 —— 入场招要"对着玩家铺"只能回头问这里。
     * 存引用不拷贝：位置对象由玩家原地改写，读到的永远是最新值，热路径也零分配。
     */
    this._lastPlayerPos = null;
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
   *
   * 两种场分开走：有 `field`（真有一圈墙）时按**矩形逐轴**夹，因为场的形状就是那圈墙围出来的
   * 方子 —— 用内切圆去夹会把四个角白白让出去（一枚 6 米的圈在 16.7 的方场里，角上还能再进去
   * 数米）；没有 `field` 时仍是名义圆的拴绳，与改前逐字同形。
   */
  clampIntoArena(x, z, margin = 0) {
    if (this.field) {
      const f = this.field;
      const 半x = Math.max(0, f.hw - margin);
      const 半z = Math.max(0, f.hd - margin);
      return {
        x: Math.min(Math.max(x, f.x - 半x), f.x + 半x),
        z: Math.min(Math.max(z, f.z - 半z), f.z + 半z),
      };
    }
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
   * 一枚半径 `r` 的圈放在 `(x, z)` 能不能**整枚**待在场里。
   * 按轴判就是精确判：圆的 x 跨度正好是 `[x − r, x + r]`，两轴都在场内则整枚在场内。
   * 没有 `field`（没有墙的再战）时恒真 —— 那里没有"越墙"这回事，不该拿名义圈去砍实招。
   */
  fieldFits(x, z, r) {
    const f = this.field;
    if (!f) return true;
    return Math.abs(x - f.x) + r <= f.hw && Math.abs(z - f.z) + r <= f.hd;
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
    // 有墙的第三种"不起手"（B101）：这记的圆心就是 Boss 自己的脚，它不走 `clampIntoArena`，
    // 所以贴墙那一下会把半枚圈画进墙里 —— 而墙那侧是走得到的地板（B79 让 Boss 场的墙穿过邻居房），
    // 症状是一记看不见却打得着的伤害。宁可这一刀退回普通挥砍（`tryArenaMelee` 的 false 分支
    // 就是给"没放成"留的），也不铺一枚圆心在脚下、边缘在墙外的假预告。
    // 代价如实写在这里：玩家贴着墙打会少掉砸地，那是这一片换来的东西，不是漏掉的分支。
    if (!this.fieldFits(this.position.x, this.position.z, spec.radius)) return false;
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
    // 砸地接管这一拍：挥砍前摇作废（近战路径起手时本来就没有圈激活，这行是幂等的）；
    // 入场砸地可能打断 windup，而挥砍圈的清理只在 strike 分支里 —— 那条路径不会再
    // 走到，不清就是一圈永久挂着的假预警。
    this.clearTelegraph();
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
   * 转阶段入场招（W-A6 切片8）：转进某一档的那一帧，先把这一档的招牌圈铺下去。
   *
   * 这是 `BossStateMachine.onEnterPhase` 钩子的第一个消费者。它排在 `boss-phase`
   * 事件**之前**（`transitionTo` 的次序：离开钩子 → 改档 → 进入钩子 → 派事件），
   * 于是横幅/闪白落下的那一帧圈已经铺在玩家脚下 —— 演出和圈同帧见证，而不是
   * "先亮个标题、圈下一帧才出现"。
   *
   * 与 `updateArenaCasts` 的闸门差异只有两处：
   * - **绕反应闸**：不看 `chance` / `rate` / opportunity 冷却 —— 标记的语义就是
   *   "这一档开场先来一招"，掷骰子会把入场变成"多半不亮"；`opportunity` 起手
   *   成功后照落 `_arenaCd`，入场之后的常规节奏从这一刻起算。
   * - **保留 `opportunity` 的 range 空间闸**：入场不是无条件铺 —— 引力化身那套
   *   "贴身连吃两份、退开只吃弹幕"的距离博弈不因入场而破（井刻意没标 entry）。
   *
   * 两道自己的守卫：
   * - `_lastPlayerPos` 为空（一帧都没跑过）就整组不点火：生产上转阶段必然发生在
   *   开战之后；而"生成后、首帧前就转档"是用例与工具链的写法，不该顺带放出
   *   一发没人躲的圈；
   * - 已死不放：致死一击跨过门槛时状态机仍会转档（既有行为，本切片不动它），
   *   但圈绝不能从坟里放出来 —— `die()` 刚把没落下的圈全部撤走（`cancelFor`），
   *   这里再补一发就正好是那条注释要防的"死后从坟里砸玩家一下"。
   */
  onPhaseEnter(phase) {
    if (!this.hazards || !this.alive) return;
    const p = this._lastPlayerPos;
    if (!p) return;
    const script = this.arenaScript;
    for (let i = 0; i < script.length; i++) {
      const e = script[i];
      if (e.entry !== true || e.phase !== phase) continue;
      if (e.trigger === 'opportunity' && this.distanceTo(p) >= e.range) continue;
      if (!this.castArenaMove(e, p)) continue;
      if (e.trigger === 'opportunity') this._arenaCd[i] = e.cooldown;
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

    // 转阶段发生在 `takeDamage` 那条路上，而那条路没有 playerPos 参数 ——
    // 入场招要"对着玩家铺"只能回头问这里（W-A6 切片8）。这里不加"playerPos 为空就跳过"
    // 的守卫：本方法往下 `distanceTo(playerPos)` 无条件读它，那个参数在这条链上是**必需**的，
    // 为它补一条只有测试能走到的分支，只会让门禁去证明一段不存在的路。
    this._lastPlayerPos = playerPos;

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
    // 计时先记再判：`TIME_ELAPSED` 那条条件读的是"这一阶段在世界里走了多久"，
    // 而这里正是世界 dt 的入口 —— 放在别处（例如墙钟）就让暂停菜单替 Boss 读条（W-A1 切片8 / B118②）
    this.sm.tick(dt);
    this.sm.checkPhaseTransitions();

    // 入场砸地（W-A6 切片8）就发生在上面那一行里：它把 state 拨进 'slam'，
    // 本帧剩下的决策（仇恨早退 / 出刀）都会把这笔账改写掉 —— 那记圈就永远等不到
    // `updateSlam` 来收（`slamHazard` 卡住，后续砸地全被它挡掉）。
    if (this.state === 'slam') return;

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
