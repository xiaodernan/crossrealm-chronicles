import { Boss } from './Boss.js';
import { BossPhase, PhaseTransitionCondition } from './BossStateMachine.js';

/** 迷宫终点 Boss — 双阶段，地牢专用 */
export class DungeonBoss extends Boss {
  constructor(scene, world, config) {
    super(scene, world, {
      ...config,
      bossId: config.bossId ?? 'dungeon-warden',
      name: config.name ?? '迷宫守钥者',
      hp: config.hp ?? 520,
      posture: 100,
      damage: 20,
      speed: 5,
      aggroRange: 28,
      attackRange: 3.8,
    });
    this.dungeonId = config.dungeonId;
    this.phaseTriggered = { p2: false, p3: false };
    this.dialogToast = null;
    /* 副本 Boss 的二阶段门槛是 **45%**，比父类那张 50% 的表晚一点。
     *
     * 注册到状态机上而不是自己另判一遍：父类 `Boss.update()` 会调 `sm.checkPhaseTransitions()`，
     * 修前这里又自己看着 `ratio <= 0.45` 改 `this.phase` 并**自己派一次 `boss-phase`** ——
     * 于是同一次二阶段会派**两遍**（状态机在 50% 派一次、这里在 45% 又派一次），
     * 横幅、台词、音效三层都会响应两次。W-B8 要的就是"阶段切换只有一条路"，
     * 所以这里只改**门槛那一格**，推进与派发仍由状态机负责。 */
    this.sm.registerTransitionCondition(BossPhase.PHASE_2, {
      type: PhaseTransitionCondition.HP_THRESHOLD,
      threshold: 0.45,
    });
  }

  setDialogToast(fn) {
    this.dialogToast = fn;
  }

  checkPhase() {
    /* 只推进 1 → 2：副本 Boss 是双阶段的，父类那张 25% 的三阶段条件表对它不适用。
     *
     * 推进与派发**都交给状态机**（`transitionTo` 改阶段、走钩子、派一次 `boss-phase`），
     * 这里只做"进二阶段之后副本 Boss 自己那点变化"。修前这些和"改阶段 + 派事件"写在一起，
     * 于是父类那条路径与这条路径各派一次 —— 同一件事说两遍，听的人做两遍。 */
    if (this.sm.phase !== BossPhase.PHASE_1) return;
    if (!this.sm.checkTransition(BossPhase.PHASE_2)) return;
    this.sm.transitionTo(BossPhase.PHASE_2);
    this.phaseTriggered.p2 = true;
    this.speed = 6.5;
    this.damage = 26;
    this.dialogToast?.('守钥者进入第二阶段！');
  }
}
