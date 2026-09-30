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
 * 6. 统一的调试/日志开关
 */

export const BossState = {
  IDLE: 'idle',
  WINDUP: 'windup',
  STRIKE: 'strike',
  STAGGER: 'stagger',
  SLAM: 'slam',
  DEAD: 'dead',
};

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
    this.state = BossState.IDLE;
    this.phase = BossPhase.PHASE_1;
    this.prevPhase = BossPhase.PHASE_1;
    this.phaseStartTime = 0;
    this.phaseData = {}; // per-phase scratchpad
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

    this.prevPhase = this.phase;
    this.phase = phase;
    this.phaseStartTime = performance.now();
    this.phaseData = {};

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

  /** 序列化（用于存档） */
  toJSON() {
    return {
      state: this.state,
      phase: this.phase,
      prevPhase: this.prevPhase,
      phaseStartTime: this.phaseStartTime,
      phaseData: this.phaseData,
    };
  }

  /** 反序列化 */
  fromJSON(data) {
    if (!data) return;
    this.state = data.state ?? BossState.IDLE;
    this.phase = data.phase ?? 1;
    this.prevPhase = data.prevPhase ?? 1;
    this.phaseStartTime = data.phaseStartTime ?? 0;
    this.phaseData = data.phaseData ?? {};
  }
}

export default BossStateMachine;