/**
 * Boss 状态机（W-B8 切片1：状态机与阶段切换架构）。
 *
 * 设计目标：
 * 1. 显式的状态枚举，避免字符串/数字散在各处
 * 2. 显式的阶段枚举，phase 1/2/3 统一管理
 * 3. 状态/阶段的 enter/exit 钩子，Boss 子类只需重写 onEnter/onExit
 * 4. 阶段切换时的显式事件（enterPhase/leavePhase），可挂载视觉/音效/粒子
 * 5. 阶段特有的行为表（per-phase behavior tables），取代散在 update 里的 if (this.phase >= N)
 * 6. 统一的阶段切换条件判定（血量阈值 / 时间 / 自定义条件）
 * 7. 统一的调试/日志开关
 *
 * **这一类的边界（W-B8 切片4 定）**：它只管**阶段**，不管战斗状态。
 *
 * 切片3 量出这里有两条轴，`state` 那条没人驱动；切片4 查清了它为什么不该存在：
 * `Enemy` 已经有一套**真的在跑**的战斗状态机（`ai/EnemyFSM` 的 `createEnemyFSM`，
 * `Enemy.update` 每帧 `this.state = this.fsm.current`），`Boss extends Enemy` 因此也有它。
 * 本类再持一条 `state` 轴 = **同一件事记两份账**，而且那份账没人写、永远是 IDLE。
 * 所以那一条连同它的枚举一起**删掉**（不是"先留着以后可能用得上" —— 那正是本项目
 * 反复记过的那条错）。战斗状态问 `this.fsm.current` / `this.state`，阶段问这里。
 *
 * 同理删掉的还有 `toJSON` / `fromJSON`：全仓没有一处调用，而存档也确实**不持久化**
 * Boss 的战斗状态（`SaveSystem` 只存 `bossRematch` 与 `bossApproach`）。留着它们会让人
 * 以为"Boss 打到二阶段时存档，读回来还在二阶段"—— 那件事不存在。
 *
 * **保留但今天还没人用的**：`registerPhaseBehavior` / `getCurrentBehavior` /
 * `onEnterPhase` / `onLeavePhase` 这条阶段钩子。目标 5（阶段行为表取代散落的
 * `if (this.phase >= N)`）就是靠它落地，五只 Boss 目前都还没接 —— 这是 W-B8 的后续，
 * 不是死代码，所以留着并在这里写明现状。
 */

export const BossPhase = {
  PHASE_1: 1,
  PHASE_2: 2,
  PHASE_3: 3,
};

export const PhaseTransitionCondition = {
  HP_THRESHOLD: 'hp_threshold',
  TIME_ELAPSED: 'time_elapsed',
  CUSTOM: 'custom',
};

export class BossStateMachine {
  constructor(boss) {
    this.boss = boss;
    this.phase = BossPhase.PHASE_1;
    /** 进这一阶段的时刻，`TIME_ELAPSED` 那条条件读它（其余地方不读） */
    this.phaseStartTime = 0;
    this.phaseBehaviors = new Map(); // phase -> behavior table
    this.transitionConditions = new Map(); // phase -> condition
    this.debug = false;
  }

  /** 注册某阶段的行为表（供 updateArenaCasts 等复用） */
  registerPhaseBehavior(phase, behavior) {
    this.phaseBehaviors.set(phase, behavior);
  }

  /** 获取当前阶段的行为表 */
  getCurrentBehavior() {
    return this.phaseBehaviors.get(this.phase);
  }

  /** 注册阶段切换条件 */
  registerTransitionCondition(phase, condition) {
    this.transitionConditions.set(phase, condition);
  }

  /** 检查是否满足切换到某阶段的条件 */
  checkTransition(phase) {
    const cond = this.transitionConditions.get(phase);
    if (!cond) return false;
    if (cond.type === PhaseTransitionCondition.HP_THRESHOLD) {
      return this.boss.hp / this.boss.maxHp <= cond.threshold;
    }
    if (cond.type === PhaseTransitionCondition.TIME_ELAPSED) {
      return (performance.now() - this.phaseStartTime) / 1000 >= cond.seconds;
    }
    if (cond.type === PhaseTransitionCondition.CUSTOM) {
      return cond.fn(this.boss);
    }
    return false;
  }

  /** 执行阶段切换 */
  transitionTo(phase) {
    if (phase === this.phase) return false;
    if (phase < 1 || phase > 3) return false;

    this.log(`Phase ${this.phase} -> ${phase}`);

    // 离开旧阶段
    this.onLeavePhase(this.phase);

    this.phase = phase;
    this.phaseStartTime = performance.now();

    // 进入新阶段
    this.onEnterPhase(phase);

    // 广播事件
    window.dispatchEvent(new CustomEvent('boss-phase', {
      detail: { phase, name: this.boss.name, bossId: this.boss.bossId }
    }));

    return true;
  }

  /** 检查并自动触发阶段切换（血量阈值） */
  checkPhaseTransitions() {
    // Phase 2: HP <= 50%
    if (this.phase === BossPhase.PHASE_1 && this.checkTransition(BossPhase.PHASE_2)) {
      this.transitionTo(BossPhase.PHASE_2);
      return true;
    }
    // Phase 3: HP <= 25%
    if (this.phase === BossPhase.PHASE_2 && this.checkTransition(BossPhase.PHASE_3)) {
      this.transitionTo(BossPhase.PHASE_3);
      return true;
    }
    return false;
  }

  /** 进入阶段钩子：子类可重写或通过 phaseBehaviors 注册 */
  onEnterPhase(phase) {
    const behavior = this.phaseBehaviors.get(phase);
    if (behavior?.onEnter) behavior.onEnter(this.boss);
    this.boss.onPhaseEnter?.(phase);
  }

  /** 离开阶段钩子 */
  onLeavePhase(phase) {
    const behavior = this.phaseBehaviors.get(phase);
    if (behavior?.onLeave) behavior.onLeave(this.boss);
    this.boss.onPhaseLeave?.(phase);
  }

  /** 调试日志 */
  log(msg) {
    if (this.debug) console.log(`[BossSM:${this.boss.bossId}] ${msg}`);
  }

  /**
   * 这里**没有** `toJSON` / `fromJSON`（W-B8 切片4 删掉）。
   *
   * 它们原先在，注释还写着"用于存档"，但全仓没有一处调用 —— 而存档也确实**不持久化**
   * Boss 的战斗状态（`SaveSystem` 只存 `bossRematch` 与 `bossApproach`）。留着的坏处是
   * 读代码的人会以为"Boss 打到二阶段时存档，读回来还在二阶段"，而那是**不存在的行为**。
   * 真要做"战斗中途存档"时，要连 Boss 的位置/血量/仇恨一起谈，不是补一对方法就完事。
   */
}

export default BossStateMachine;