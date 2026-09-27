/**
 * ObjectiveEngine — 统一目标/任务引擎（W-B3）。
 *
 * 支持：
 * - 声明式目标定义（data-driven，来自 content/objectives.js）
 * - 分支：branchTo + branchCondition
 * - 条件：requires（前置标志）、condition（运行时条件）
 * - 标志：完成时设置 flags
 * - 失败：failsOn + failMessage + onFail（reset/restart/branch）
 * - 重访：revisit: true 允许完成后再次触发
 * - 章节门控：完成 `chapter-gate` 那一格时把章节推到它标的那一档
 * - 事件总线集成：进度、完成、失败、分支、章节变更
 *
 * **现状（W-B3 切片2 实测）**：本类还没有消费者 —— 在役主线是 `game/QuestSystem.js`
 * （`core/Game.js` 装配它）。这里之所以把三本账接成同一份而不是继续自己抄一遍：
 * 判据（`objectiveDone`）、记账（`STAT_EVENTS`）、名册（`BOSS_STAT_KEYS`）都来自
 * `content/objectives.js`，切片3 把 sequencer 换过来时不需要再对一次行为。
 * 接线之前，本文件只由 `tests/objective-engine.test.js` 供着，别把它当成在跑的那套。
 */
import {
  BOSS_STAT_KEYS, OBJECTIVES, CONDITIONS, FAIL_CONDITIONS,
  STAT_EVENTS, applyStatEvent, conditionHolds, emptyStats,
  interactGateCondition, objectiveDone, statsFromJSON, statsToJSON,
} from '../content/objectives.js';
import { keyText } from '../content/keyHints.js';
import { emit, on, offAll } from '../engine/EventBus.js';

const EVENT_TAG = 'game/ObjectiveEngine';

/**
 * 目标状态枚举
 */
export const OBJECTIVE_STATUS = {
  LOCKED: 'locked',       // 前置条件未满足
  AVAILABLE: 'available', // 可接取/进行中
  ACTIVE: 'active',       // 正在进行
  DONE: 'done',           // 已完成
  FAILED: 'failed',       // 失败
  BRANCHED: 'branched',   // 已分支
};

/**
 * 目标实例类
 */
export class ObjectiveInstance {
  constructor(def, engine) {
    this.def = def;
    this.engine = engine;
    this.status = OBJECTIVE_STATUS.LOCKED;
    this.progress = 0;
    this.startedAt = null;
    this.completedAt = null;
    this.failedAt = null;
    this.visitCount = 0;
  }

  /** 判断是否可激活（前置标志 + 章节） */
  canActivate(state) {
    if (this.def.requires) {
      for (const [flag, value] of Object.entries(this.def.requires)) {
        if (state.flags[flag] !== value) return false;
      }
    }
    if (this.def.chapter && state.chapter < this.def.chapter) return false;
    return true;
  }

  /** 判断运行时条件 */
  checkCondition(state) {
    if (!this.def.condition) return true;
    const fn = CONDITIONS[this.def.condition];
    if (!fn) {
      console.warn(`[ObjectiveEngine] 条件函数不存在: ${this.def.condition}`);
      return true;
    }
    return fn(state);
  }

  /** 判断分支条件 */
  checkBranch(state) {
    if (!this.def.branchTo || !this.def.branchCondition) return false;
    const fn = CONDITIONS[this.def.branchCondition];
    if (!fn) return false;
    return fn(state);
  }

  /** 判断失败条件 */
  checkFail(state) {
    if (!this.def.failsOn) return false;
    const fn = FAIL_CONDITIONS[this.def.failsOn];
    if (!fn) return false;
    return fn(state);
  }

  /** 推进进度（返回是否完成）。delta 不许把已有进度倒回去：同一事件重放或账本已越过目标时，
   *  宁可这一步不动，也不让一个已完成的读数退回 3/5 */
  advance(delta = 1) {
    if (this.status === OBJECTIVE_STATUS.DONE && !this.def.revisit) return false;
    if (this.status === OBJECTIVE_STATUS.FAILED) return false;

    if (delta > 0) this.progress += delta;
    const target = this.def.target ?? 1;
    if (this.progress >= target) {
      this.complete();
      return true;
    }
    return false;
  }

  /** 完成目标 */
  complete() {
    this.status = OBJECTIVE_STATUS.DONE;
    this.completedAt = Date.now();
    this.progress = this.def.target ?? 1;

    // 设置标志
    if (this.def.flags) {
      for (const [flag, value] of Object.entries(this.def.flags)) {
        this.engine.setFlag(flag, value);
      }
    }

    // 触发分支
    if (this.checkBranch(this.engine.getState())) {
      this.status = OBJECTIVE_STATUS.BRANCHED;
      this.engine.activateObjective(this.def.branchTo);
    }

    // 发射事件
    emit('objective-complete', { objective: this.def, instance: this }, EVENT_TAG);
    this.engine.onObjectiveCompleted(this.def);
  }

  /** 失败目标 */
  fail(reason) {
    this.status = OBJECTIVE_STATUS.FAILED;
    this.failedAt = Date.now();
    emit('objective-fail', { objective: this.def, instance: this, reason }, EVENT_TAG);

    if (this.def.onFail === 'reset') {
      this.reset();
    } else if (this.def.onFail === 'restart') {
      this.restart();
    } else if (this.def.onFail === 'branch' && this.def.branchTo) {
      this.engine.activateObjective(this.def.branchTo);
    }
  }

  /** 重置目标（回到可用态） */
  reset() {
    this.status = OBJECTIVE_STATUS.AVAILABLE;
    this.progress = 0;
    this.startedAt = null;
    this.completedAt = null;
    this.failedAt = null;
    emit('objective-reset', { objective: this.def, instance: this }, EVENT_TAG);
  }

  /** 重新开始（回到激活态） */
  restart() {
    this.status = OBJECTIVE_STATUS.ACTIVE;
    this.progress = 0;
    this.startedAt = Date.now();
    this.completedAt = null;
    this.failedAt = null;
    emit('objective-restart', { objective: this.def, instance: this }, EVENT_TAG);
  }

  /** 进度文本。这里只**读**账本做显示，判据仍然是 `objectiveDone` 那一份 */
  getProgressText(state) {
    const q = this.def;
    if (!q) return '';
    const stats = state.stats ?? {};

    switch (q.type) {
      case 'hits':
        return `${Math.min(stats.hits || 0, q.target)} / ${q.target} 命中`;
      case 'kills':
        return `${Math.min(stats.kills?.[q.enemyType] || 0, q.target)} / ${q.target}`;
      case 'spells':
        return `${Math.min(stats.spellCasts || 0, q.target)} / ${q.target} 次施法`;
      case 'charged':
        return `${Math.min(stats.chargedCasts || 0, q.target)} / ${q.target} 蓄力施法`;
      case 'skills-unlocked':
        return `${Math.min(stats.skillsUnlocked || 0, q.target)} / ${q.target} 技能`;
      case 'chests':
        return `${stats.chestsOpened || 0} / ${q.target} 宝箱`;
      case 'dungeon':
        return stats.dungeonsCleared?.has(q.dungeonId) ? '完成' : '寻找地下城入口';
      case 'dungeon-rerun':
        return stats.dungeonRerun ? '完成' : '再次清空一座地下城';
      case 'npc':
        return stats.npcTalked?.has(q.targetId) ? '完成' : '寻找 NPC';
      case 'level':
        return `在营火休息升级至 Lv.${q.target}`;
      case 'mind':
        return `营火升级「心智」至 ${q.target}`;
      case 'discovery':
        return stats.discoveries?.has(q.targetId) ? '已完成' : `寻找 ${q.waypoint?.label ?? '标记点'}`;
      case 'interact':
        if (stats.discoveries?.has(q.targetId) && !interactGateCondition(q)) return '已完成触摸';
        return keyText(q.desc);
      default: {
        const bossKey = BOSS_STAT_KEYS[q.bossId];
        if (bossKey) {
          return stats[bossKey] ? '完成' : `寻找 ${q.waypoint?.label ?? 'Boss 区域'}`;
        }
        return keyText(q.desc);
      }
    }
  }

  toJSON() {
    return {
      id: this.def.id,
      status: this.status,
      progress: this.progress,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      failedAt: this.failedAt,
      visitCount: this.visitCount,
    };
  }

  fromJSON(data) {
    this.status = data.status;
    this.progress = data.progress;
    this.startedAt = data.startedAt;
    this.completedAt = data.completedAt;
    this.failedAt = data.failedAt;
    this.visitCount = data.visitCount || 0;
  }
}

/**
 * ObjectiveEngine 主类
 */
export class ObjectiveEngine {
  constructor(dialog) {
    this.dialog = dialog;
    this.objectives = new Map(); // id -> ObjectiveInstance
    this.flags = {};             // 全局标志表
    this.chapter = 1;
    this.activeObjectiveId = null;
    this._tick = 0;
    // 统计账本由引擎**自己记**（形状与记账表都在 `content/objectives.js`）。
    // 以前这里写着 `collectStats() { return this._stats || {} }` 等外部喂，而全仓没人调
    // `setStatsSource` —— 于是判据永远读到一本空账，`CONDITIONS` 里那些函数也就永远为假。
    this.stats = emptyStats();

    // 实例化所有目标
    for (const def of OBJECTIVES) {
      this.objectives.set(def.id, new ObjectiveInstance(def, this));
    }

    this.setupListeners();
    this.syncState();
  }

  /**
   * 一个循环把 `STAT_EVENTS` 里那十件事各挂一条监听：记一笔账，再重算一次进度。
   * 门控的「摸锚点」与不门控的走两条路（前者要条件齐时那一下交互，后者判据直接认账本），
   * 但两边用的都是 `content/objectives.js` 里的同一份口径。
   */
  setupListeners() {
    for (const name of Object.keys(STAT_EVENTS)) {
      on(name, (e) => this.onGameEvent(name, e.detail), EVENT_TAG);
    }
    on('chapter-changed', (e) => this.onChapterChanged(e.detail), EVENT_TAG);
  }

  /** 获取当前引擎状态（供条件函数使用） */
  getState() {
    return {
      flags: this.flags,
      chapter: this.chapter,
      stats: this.stats,
      objectives: this,
    };
  }

  /** 设置标志 */
  setFlag(flag, value) {
    const old = this.flags[flag];
    this.flags[flag] = value;
    if (old !== value) {
      emit('flag-changed', { flag, value, old }, EVENT_TAG);
      this.checkActivations();
    }
  }

  /** 获取标志 */
  getFlag(flag) {
    return this.flags[flag];
  }

  /** 检查所有目标的激活条件 */
  checkActivations() {
    for (const instance of this.objectives.values()) {
      if (instance.status === OBJECTIVE_STATUS.LOCKED && instance.canActivate(this.getState())) {
        instance.status = OBJECTIVE_STATUS.AVAILABLE;
        emit('objective-available', { objective: instance.def, instance }, EVENT_TAG);
      }
    }
  }

  /** 同步状态（读档时）：当前那一格已经过了就只挪指针，不重复结算标志与分支 */
  syncState() {
    let guard = 0;
    while (guard++ < 50) {
      const instance = this.objectives.get(this.activeObjectiveId);
      if (!instance || instance.status !== OBJECTIVE_STATUS.DONE) break;
      this.findNextActive();
    }
    this.checkActivations();
    // 开局（或读档后指针为空）也要有一格在手：以前构造函数只做 `checkActivations`，
    // 于是引擎带着 0 个 ACTIVE 目标上线，任何玩家事件都推不动它（`advanceActive` 直接 return）
    if (!this.activeObjectiveId) this.findNextActive();
  }

  /**
   * 激活指定目标。
   *
   * 激活之后立刻重算一次进度：表里 `chapter-gate` 那几格写的是 `autoComplete`，
   * 意思就是"走到这一格本身即完成"。没有这一喊，它们会一直 ACTIVE 到下一个玩家事件，
   * 章节推进（`onObjectiveCompleted`）也就跟着晚一个事件才发生。
   */
  activateObjective(id) {
    const instance = this.objectives.get(id);
    if (!instance) return false;
    if (instance.status === OBJECTIVE_STATUS.LOCKED || instance.status === OBJECTIVE_STATUS.AVAILABLE) {
      instance.status = OBJECTIVE_STATUS.ACTIVE;
      instance.startedAt = Date.now();
      instance.visitCount++;
      this.activeObjectiveId = id;
      emit('objective-activate', { objective: instance.def, instance }, EVENT_TAG);
      this.advanceActive();
      return true;
    }
    return false;
  }

  /** 推进当前激活目标 */
  advanceActive() {
    if (!this.activeObjectiveId) return;
    const instance = this.objectives.get(this.activeObjectiveId);
    if (!instance) return;

    // 已完成的那一格不重复结算：`advance()` 对 DONE 只在 revisit 行放手，
    // 但判据可能还在说"完成"（账本不会倒退），所以先把指针挪走
    if (instance.status === OBJECTIVE_STATUS.DONE && !instance.def.revisit) {
      this.findNextActive();
      return;
    }

    // 检查失败条件
    if (instance.checkFail(this.getState())) {
      instance.fail(instance.def.failMessage || '任务失败');
      this.findNextActive();
      return;
    }

    // 根据目标类型推进
    const done = this.progressObjective(instance);
    if (done) {
      this.findNextActive();
    }
  }

  /**
   * 推进当前目标：判据只有 `content/objectives.js` 里那一份（`objectiveDone`）。
   *
   * 以前这里是一份 15 段的 switch，与 `QuestSystem` 里那两份是同一条算式的三份抄本。
   * 抄本会漂：新表把五只 Boss 一律写成 `type: 'boss'` + 各自的 `bossId`，而这份抄本
   * 按类型名读计数器，于是**影界守护者一倒地，大奥术师那一步就被判完成**（切片2 实测）。
   */
  progressObjective(instance) {
    const q = instance.def;
    // 门控的「摸锚点」不因摸了一下就完成：推进它的是条件齐时的那一下交互（见 onInteract）
    if (interactGateCondition(q)) return false;
    if (!objectiveDone(q, this.stats)) return false;
    // 数值步的进度直接对齐到账本口径：判据说过了，就不该留一个 3/5 的读数在那儿
    return instance.advance(Math.max((q.target ?? 1) - instance.progress, 1));
  }

  /** 寻找下一个可激活目标 */
  findNextActive() {
    const current = this.objectives.get(this.activeObjectiveId);
    // 手上那一格还没结算（进行中，或分支刚把目标激活）就别抢位：分支目标必须自己走完，
    // 否则它会永远停在 ACTIVE，而 sequencer 已经在看别处 —— 章节门控就是这样被抢掉的
    if (current
      && current.status !== OBJECTIVE_STATUS.DONE
      && current.status !== OBJECTIVE_STATUS.FAILED) return;

    // 优先查找当前章节的可用目标
    for (const instance of this.objectives.values()) {
      if (instance.status === OBJECTIVE_STATUS.AVAILABLE
        && instance.def.chapter === this.chapter
        && instance.canActivate(this.getState())
        && instance.checkCondition(this.getState())) {
        this.activateObjective(instance.def.id);
        return;
      }
    }
    // 兜底：任何章节的可用目标
    for (const instance of this.objectives.values()) {
      if (instance.status === OBJECTIVE_STATUS.AVAILABLE
        && instance.canActivate(this.getState())
        && instance.checkCondition(this.getState())) {
        this.activateObjective(instance.def.id);
        return;
      }
    }
    this.activeObjectiveId = null;
  }

  /**
   * 章节门控：走到 `chapter-gate` 那一格（表里的 `ch2-complete` / `ch3-start` …）
   * 就把章节推到它标的那一档，并广播 `chapter-changed`。
   *
   * 以前这里是一个空方法加一句注释（"由 advance() 中的章节门控目标触发"）——
   * 全仓没有任何代码改过 `this.chapter`，所以那条评论描述的机制不存在，
   * 表里 `chapter: 3` 这类门控字段永远等着一个不会来的章节号。
   */
  onObjectiveCompleted(def) {
    if (def.type === 'chapter-gate' && def.chapter > this.chapter) {
      const prev = this.chapter;
      this.chapter = def.chapter;
      emit('chapter-changed', { chapter: this.chapter, prev }, EVENT_TAG);
    }
    this.checkActivations();
  }

  /** 一条游戏事件：先记账，再重算进度（记账表 `STAT_EVENTS` 全仓一份，与 `QuestSystem` 同一份） */
  onGameEvent(name, detail) {
    applyStatEvent(this.stats, name, detail);
    if (name === 'poi-interact') this.onInteract(detail);
    this.advanceActive();
  }

  onInteract(detail) {
    const instance = this.objectives.get(this.activeObjectiveId);
    const q = instance?.def;
    if (!instance || q.type !== 'interact' || detail?.id !== q.targetId) return;
    const gate = interactGateCondition(q);
    // 门控格：条件齐了才由这一下交互推进；不门控的格交给 onGameEvent 里的判据
    if (gate && conditionHolds(gate, this.stats)) instance.advance(1);
  }
  onChapterChanged(detail) {
    this.chapter = detail.chapter;
    this.checkActivations();
    this.findNextActive();
  }

  /** 获取当前激活目标 */
  getCurrent() {
    return this.activeObjectiveId ? this.objectives.get(this.activeObjectiveId) : null;
  }

  /** 获取目标实例 */
  getObjective(id) {
    return this.objectives.get(id);
  }

  /** 获取所有目标列表 */
  getAllObjectives() {
    return Array.from(this.objectives.values());
  }

  /** 获取进度摘要 */
  getProgress() {
    let done = 0, total = 0;
    for (const instance of this.objectives.values()) {
      if (instance.def.chapter <= this.chapter) {
        total++;
        if (instance.status === OBJECTIVE_STATUS.DONE) done++;
      }
    }
    return { done, total, chapter: this.chapter };
  }

  /** 获取当前目标的世界坐标指引 */
  getCurrentWaypoint() {
    const instance = this.getCurrent();
    if (!instance) return null;
    return instance.def.waypoint ?? null;
  }

  dispose() {
    offAll(EVENT_TAG);
  }

  toJSON() {
    const objectives = {};
    for (const [id, instance] of this.objectives) {
      objectives[id] = instance.toJSON();
    }
    return {
      objectives,
      flags: this.flags,
      chapter: this.chapter,
      activeObjectiveId: this.activeObjectiveId,
      // 账本跟着落盘（形状由 `content/objectives.js` 推，存档层不必再逐格手抄）
      stats: statsToJSON(this.stats),
    };
  }

  fromJSON(data) {
    if (!data) return;
    this.flags = data.flags || {};
    this.chapter = data.chapter || 1;
    this.activeObjectiveId = data.activeObjectiveId || null;
    this.stats = statsFromJSON(data.stats);
    if (data.objectives) {
      for (const [id, objData] of Object.entries(data.objectives)) {
        const instance = this.objectives.get(id);
        if (instance) instance.fromJSON(objData);
      }
    }
    this.syncState();
  }
}