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
 * - 章节门控：chapter 字段
 * - 事件总线集成：进度、完成、失败、分支、章节变更
 */
import { OBJECTIVES, CONDITIONS, FAIL_CONDITIONS } from '../content/objectives.js';
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

  /** 推进进度（返回是否完成） */
  advance(delta = 1) {
    if (this.status === OBJECTIVE_STATUS.DONE && !this.def.revisit) return false;
    if (this.status === OBJECTIVE_STATUS.FAILED) return false;

    this.progress += delta;
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
    this.engine.checkChapterTransition();
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

  /** 获取进度文本 */
  getProgressText(state) {
    const q = this.def;
    if (!q) return '';

    switch (q.type) {
      case 'hits':
        return `${Math.min(state.stats.hits || 0, q.target)} / ${q.target} 命中`;
      case 'kills':
        return `${Math.min(state.stats.kills?.[q.enemyType] || 0, q.target)} / ${q.target}`;
      case 'boss':
      case 'boss2':
      case 'boss3':
      case 'voidboss':
      case 'chaosboss': {
        const bossKey = q.type === 'boss' ? 'bossDefeated'
          : q.type === 'boss2' ? 'boss2Defeated'
          : q.type === 'boss3' ? 'boss3Defeated'
          : q.type === 'voidboss' ? 'voidBossDefeated'
          : 'chaosBossDefeated';
        return state.stats[bossKey] ? '完成' : `寻找 ${q.def?.waypoint?.label ?? 'Boss 区域'}`;
      }
      case 'spells':
        return `${Math.min(state.stats.spellCasts || 0, q.target)} / ${q.target} 次施法`;
      case 'dungeon':
        return state.stats.dungeonsCleared?.has(q.dungeonId) ? '完成' : '寻找地下城入口';
      case 'mind':
        return '营火升级「心智」至 ' + q.target;
      case 'charged':
        return `${Math.min(state.stats.chargedCasts || 0, q.target)} / ${q.target} 蓄力施法`;
      case 'skills-unlocked':
        return `${Math.min(state.stats.skillsUnlocked || 0, q.target)} / ${q.target} 技能`;
      case 'chests':
        return `${state.stats.chestsOpened || 0} / ${q.target} 宝箱`;
      case 'npc':
        return state.stats.npcTalked?.has(q.targetId) ? '完成' : '寻找 NPC';
      case 'level':
        return `在营火休息升级至 Lv.${q.target}`;
      case 'discovery':
        return state.stats.discoveries?.has(q.targetId) ? '已完成' : `寻找 ${q.def?.waypoint?.label ?? '标记点'}`;
      case 'interact':
        if (state.stats.discoveries?.has(q.targetId) && !q.requireAllFragments && !q.requireAscension && !q.requireTrueEnd && !q.requireInfinity) {
          return '已完成触摸';
        }
        return q.desc;
      default:
        return q.desc;
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

    // 实例化所有目标
    for (const def of OBJECTIVES) {
      this.objectives.set(def.id, new ObjectiveInstance(def, this));
    }

    this.setupListeners();
    this.syncState();
  }

  setupListeners() {
    // 监听游戏事件，转发给目标实例
    on('discovery', (e) => this.onDiscovery(e.detail), EVENT_TAG);
    on('enemy-defeated', (e) => this.onEnemyDefeated(e.detail), EVENT_TAG);
    on('spell-cast', (e) => this.onSpellCast(e.detail), EVENT_TAG);
    on('dungeon-cleared', (e) => this.onDungeonCleared(e.detail), EVENT_TAG);
    on('weapon-skill-unlocked', () => this.onSkillUnlocked(), EVENT_TAG);
    on('combat-hit', () => this.onHit(), EVENT_TAG);
    on('poi-interact', (e) => this.onInteract(e.detail), EVENT_TAG);
    on('chest-opened', () => this.onChestOpened(), EVENT_TAG);
    on('npc-talk', (e) => this.onNPCTalk(e.detail), EVENT_TAG);
    on('stats-changed', (e) => this.onStatsChanged(e.detail), EVENT_TAG);
    on('chapter-changed', (e) => this.onChapterChanged(e.detail), EVENT_TAG);
  }

  /** 获取当前引擎状态（供条件函数使用） */
  getState() {
    return {
      flags: this.flags,
      chapter: this.chapter,
      stats: this.collectStats(),
      objectives: this,
    };
  }

  /** 收集统计数据（从各系统聚合） */
  collectStats() {
    // 由外部系统通过事件更新，这里返回引用
    return this._stats || {};
  }

  /** 设置外部统计引用 */
  setStatsSource(stats) {
    this._stats = stats;
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

  /** 同步状态（读档时） */
  syncState() {
    let guard = 0;
    while (this.activeObjectiveId && guard++ < 50) {
      const instance = this.objectives.get(this.activeObjectiveId);
      if (!instance) break;
      if (instance.status === OBJECTIVE_STATUS.DONE) {
        this.advanceActive();
      } else break;
    }
    this.checkActivations();
  }

  /** 激活指定目标 */
  activateObjective(id) {
    const instance = this.objectives.get(id);
    if (!instance) return false;
    if (instance.status === OBJECTIVE_STATUS.LOCKED || instance.status === OBJECTIVE_STATUS.AVAILABLE) {
      instance.status = OBJECTIVE_STATUS.ACTIVE;
      instance.startedAt = Date.now();
      instance.visitCount++;
      this.activeObjectiveId = id;
      emit('objective-activate', { objective: instance.def, instance }, EVENT_TAG);
      return true;
    }
    return false;
  }

  /** 推进当前激活目标 */
  advanceActive() {
    if (!this.activeObjectiveId) return;
    const instance = this.objectives.get(this.activeObjectiveId);
    if (!instance) return;

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

  /** 根据类型推进目标进度 */
  progressObjective(instance) {
    const q = instance.def;
    const state = this.getState();

    switch (q.type) {
      case 'interact':
        if (q.targetId && state.stats.discoveries?.has(q.targetId)) {
          // 交互类由 poi-interact 事件直接触发 advance()
          return false;
        }
        break;
      case 'hits':
        return instance.advance(state.stats.hits - instance.progress);
      case 'kills':
        return instance.advance((state.stats.kills?.[q.enemyType] || 0) - instance.progress);
      case 'spells':
        return instance.advance(state.stats.spellCasts - instance.progress);
      case 'charged':
        return instance.advance(state.stats.chargedCasts - instance.progress);
      case 'skills-unlocked':
        return instance.advance(state.stats.skillsUnlocked - instance.progress);
      case 'chests':
        return instance.advance(state.stats.chestsOpened - instance.progress);
      case 'dungeon':
        if (state.stats.dungeonsCleared?.has(q.dungeonId)) {
          instance.progress = 1;
          return true;
        }
        break;
      case 'level':
        if ((state.stats.level || 0) >= q.target) {
          instance.progress = q.target;
          return true;
        }
        break;
      case 'mind':
        if ((state.stats.mind || 0) >= q.target) {
          instance.progress = q.target;
          return true;
        }
        break;
      case 'discovery':
        if (state.stats.discoveries?.has(q.targetId)) {
          instance.progress = 1;
          return true;
        }
        break;
      case 'boss':
        if (state.stats.bossDefeated) { instance.progress = 1; return true; }
        break;
      case 'boss2':
        if (state.stats.boss2Defeated) { instance.progress = 1; return true; }
        break;
      case 'boss3':
        if (state.stats.boss3Defeated) { instance.progress = 1; return true; }
        break;
      case 'voidboss':
        if (state.stats.voidBossDefeated) { instance.progress = 1; return true; }
        break;
      case 'chaosboss':
        if (state.stats.chaosBossDefeated) { instance.progress = 1; return true; }
        break;
      case 'dungeon-rerun':
        if (state.stats.dungeonRerun) { instance.progress = 1; return true; }
        break;
      case 'npc':
        if (state.stats.npcTalked?.has(q.targetId)) {
          instance.progress = 1;
          return true;
        }
        break;
      case 'chapter-gate':
        if (q.autoComplete) {
          instance.progress = 1;
          return true;
        }
        break;
    }
    return false;
  }

  /** 寻找下一个可激活目标 */
  findNextActive() {
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

  /** 章节转换检查 */
  checkChapterTransition() {
    // 由 advance() 中的章节门控目标触发
  }

  // 事件处理器
  onDiscovery(detail) { this.advanceActive(); }
  onEnemyDefeated(detail) { this.advanceActive(); }
  onSpellCast(detail) { this.advanceActive(); }
  onDungeonCleared(detail) { this.advanceActive(); }
  onSkillUnlocked() { this.advanceActive(); }
  onHit() { this.advanceActive(); }
  onInteract(detail) {
    const instance = this.objectives.get(this.activeObjectiveId);
    if (instance && instance.def.type === 'interact' && detail.id === instance.def.targetId) {
      instance.advance(1);
      this.advanceActive();
    }
  }
  onChestOpened() { this.advanceActive(); }
  onNPCTalk(detail) { this.advanceActive(); }
  onStatsChanged(detail) { this.advanceActive(); }
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
    };
  }

  fromJSON(data) {
    if (!data) return;
    this.flags = data.flags || {};
    this.chapter = data.chapter || 1;
    this.activeObjectiveId = data.activeObjectiveId || null;
    if (data.objectives) {
      for (const [id, objData] of Object.entries(data.objectives)) {
        const instance = this.objectives.get(id);
        if (instance) instance.fromJSON(objData);
      }
    }
    this.syncState();
  }
}