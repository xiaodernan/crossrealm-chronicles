import { keyText } from '../ui/keyHints.js';
import { dungeonDefOf, TRIAL_DUNGEON_IDS } from '../content/dungeons.js';
import {
  BOSS_STAT_KEYS, MAINLINE, STAT_EVENTS, applyStatEvent, chapterAt, chapterGateAfter,
  conditionHolds, emptyStats, interactGateCondition, objectiveDone,
  objectiveChosen, objectiveReward, objectiveDesc, applyObjectiveFlags,
} from '../content/objectives.js';
import { on, offAll } from '../engine/EventBus.js';
import { t } from '../engine/i18n.js';

/** 本文件自己的监听出口（W-A1 迁移第五处）：十个记账事件（`STAT_EVENTS`）都挂在同一个所有权下，
 *  `dispose()` 里一次结清。事件名来自 `STAT_EVENTS`（运行时才知道是哪个），
 *  所以这里带 tag 的那一层尤其要紧 —— 不然这十条监听没有任何退订路径。 */
const QUEST_EVENT_TAG = 'game/QuestSystem';
const questsOn = (name, handler) => on(name, handler, QUEST_EVENT_TAG);

/* ------------------------------------------------------------------ *
 * 主线只有一张表（W-B3 切片3）
 *
 * 这个文件以前自己带着 32 行任务定义（`QUESTS`）、一张按 id 抄的路点表
 * （`QUEST_WAYPOINTS`）和四行"哪一步完成时翻章"的硬编码 —— 三份都是
 * `content/objectives.js` 那张表的抄本，而抄本会漂：新表把五只 Boss 都写成
 * `type: 'boss'` + 各自的 `bossId`、给每行标了 `chapter`，抄本这边却按类型名
 * 读计数器、根本不读 `chapter`。两份各自都"对"，所以没有任何一处会红。
 *
 * 现在这里只剩**序列**：按表序走、问判据、指路。表说什么它做什么。
 * 玩家序列 = `MAINLINE`（`OBJECTIVES` 去掉章节门控行），与旧抄本同序同 32 行，
 * 所以磁盘上的 `quests.questIndex` 语义不变，不需要存档迁移。
 * ------------------------------------------------------------------ */

const ROW_BY_ID = new Map(MAINLINE.map((r) => [r.id, r]));
const rowWaypoint = (id) => ROW_BY_ID.get(id)?.waypoint ?? null;

/**
 * 表里那些"拿到某样东西"的步，按 `flags` 的前缀认领。
 *
 * 为什么不写死 id 清单：`checkAllFragments` 已经在 `CONDITIONS` 里数过那三枚碎片，
 * 这里再抄一遍就是又一份"哪几样算碎片"—— 加一枚要改四处，而漏掉的那处只是
 * 指路箭头少指一个地方（不报错）。
 */
const targetIdsByFlag = (prefix) => MAINLINE
  .filter((r) => Object.keys(r.flags ?? {}).some((k) => k.startsWith(prefix)))
  .map((r) => r.targetId);

/** 三枚主线碎片 / 时线那两件 —— 都由行自己的 `flags` 说话 */
const FRAGMENT_IDS = targetIdsByFlag('hasFragment');
const VOID_DISCOVERY_IDS = targetIdsByFlag('hasVoid');

/**
 * 指路用的"还有哪几座没清"直接问 `content/dungeons.js` 的 `TRIAL_DUNGEON_IDS`。
 * 这里以前自己算第五份（`MAINLINE.filter(r => r.type === 'dungeon')`）：与飞升门那条算式恰好同值，
 * 而局部名 `DUNGEON_IDS` 又和副本表导出的同名常量（**全部**几座）撞名 —— 真把两处混成一个，
 * 症状是三座试炼清完、门已开，箭头却改口让玩家去清其余的可选副本。
 */

/**
 * POI 的路点。这张**不是**主线行的抄本：它按 `targetId` 认领的是"那个物件在哪儿"
 * （同一个石环可以被主线步、快速旅行、地图图标各自指向），而主线行上的 `waypoint`
 * 说的是"这一步让你去哪儿"。两者今天数值相同，职责不同。
 */
const TARGET_WAYPOINTS = {
  'hub-anchor': { x: 0, z: 55, label: 'wp_label_anchor' },
  'fantasy-ring': { x: -200, z: -30, label: 'wp_label_one_ring' },
  'magic-castle': { x: 0, z: -195, label: 'demo_step_magic_castle' },
  'space-tesseract': { x: 200, z: 80, label: 'echo_tesseract_title' },
  'void-rift': { x: 0, z: 220, label: 'obj_void_rift_title' },
  'void-tablet': { x: 0, z: 225, label: 'wp_label_void_tablet' },
  'chaos-core': { x: -200, z: 220, label: 'wp_label_chaos_core' },
  wanderer: { x: -8, z: 45, label: 'wp_label_wanderer' },
  'astronaut-echo': { x: 200, z: 90, label: 'wp_label_astronaut_echo' },
};

/**
 * 地下城入口的路点：坐标与名字现问 `content/dungeons.js`。这里以前手抄过三行，
 * 而副本表是同一件事的另一份说法 —— 表里挪一次入口，指路这一份不会跟着动，
 * 也没有任何一处会红。`dungeonDefOf` 认不出就抛：能走到这里的 id 只有主线
 * `type: 'dungeon'` 那几行，注册表已经拿 `ref: 'dungeons'` 钉住它们的 `dungeonId`。
 *
 * **W-E3 切片25**：主线那九行副本步各抄过一格 `waypoint`（x/z 逐格等于 `entrance`，label 却另开
 * 一套 `wp_label_*` 文案键）。玩家看到的从来是这里问出来的那一份 ⇒ 抄本是第二套词汇，删了，
 * 注册表现在禁止 `type: 'dungeon'` 的行写 `waypoint`。
 */
const dungeonWaypoint = (id) => {
  const d = dungeonDefOf(id);
  return { x: d.entrance.x, z: d.entrance.z, label: d.name };
};

/**
 * 地图骷髅自己的两个字段（简称与配色）。**坐标与章节不在这里** ——
 * 以前那张五行表是手抄的，"第 i 个骷髅是哪只 Boss"只剩顺序这一条隐式约定，
 * 而查它的人用的是 `MAP_BOSSES[名册下标]`：表里插一行或换一次序，骷髅就指到别处，
 * 没有任何一处会红。如今按 `bossId` 从主线表取。
 */
const MAP_BOSS_META = {
  'shadow-warden': { label: 'map_boss_label_shadow', short: 'B1', color: '#ff5555' },
  'archmagus': { label: 'map_boss_label_mage', short: 'B2', color: '#aa55ff' },
  'singularity-herald': { label: 'map_boss_label_singularity', short: 'B3', color: '#5588ff' },
  'void-chronarch': { label: 'hud_map_anchor_timeline', short: 'B4', color: '#ddbb55' },
  'chaos-overlord': { label: 'hud_map_anchor_chaos', short: 'B5', color: '#ff3366' },
};

/** 世界地图 Boss 标记（小地图骷髅），顺序 = 主线表里那五行 Boss 的表序 */
export const MAP_BOSSES = MAINLINE
  .filter((r) => BOSS_STAT_KEYS[r.bossId])
  .map((r) => ({
    bossId: r.bossId,
    x: r.waypoint.x,
    z: r.waypoint.z,
    chapter: r.chapter,
    ...MAP_BOSS_META[r.bossId],
  }));

/**
 * Boss 那一族的界面话术，按 `bossId` 认领。
 *
 * 为什么不再按类型名（`boss` / `boss2` / …）各写一遍"读哪个计数器"：那是把
 * `BOSS_STAT_KEYS` 那份名册抄进显示层。这里的文本含坐标读数，由用例逐格对过主线表。
 */
export const BOSS_DISPLAY = {
  'shadow-warden': { progress: 'boss_progress_shadow', waypoint: 'boss_waypoint_shadow' },
  'archmagus': { progress: 'boss_progress_mage', waypoint: 'boss_waypoint_mage' },
  'singularity-herald': { progress: 'boss_progress_singularity', waypoint: 'boss_waypoint_singularity' },
  'void-chronarch': { progress: 'boss_progress_void', waypoint: 'boss_waypoint_void' },
  'chaos-overlord': { progress: 'boss_progress_chaos', waypoint: 'boss_waypoint_chaos' },
};

export class QuestSystem {
  constructor(dialog) {
    this.dialog = dialog;
    this.questIndex = 0;
    // 账本的形状与"哪个事件改哪一格"都在 `content/objectives.js`（W-B3 切片2）：
    // 这里以前自己抄一份，于是 `ObjectiveEngine` 那份少读两个键也没人发现
    this.stats = emptyStats();
    this.completed = false;
    this.chapter = 1;
    this.setupListeners();
    this.syncProgress();
    this.notifyUpdate();
  }

  get current() { return MAINLINE[this.questIndex] ?? null; }

  /**
   * 读档落点：指针必须在表里，章节由那一格所在的位置说话（W-B3 切片4）。
   *
   * `SaveSystem` 以前把盘上的 `index` 直接写进 `questIndex`，于是 `index: 999` 只是让
   * `current` 变成 `null` —— 少一行 HUD 任务、指路箭头失踪，而**不报错**；章节则要么信盘上
   * 那份，要么用一句 `index > 8 ? 2 : 1` 猜（那个 8 是"第一道门在第几格"的抄本）。
   * 现在这两件事都由表说话，盘上的值只在**与表一致**时被采纳；不一致就是坏档，
   * 当场留下一条能读懂的理由，而不是静默地把玩家放进一个表说不可能存在的位置。
   *
   * @param {{ index?: unknown, completed?: unknown, chapter?: unknown }} saved `data.quests`
   * @returns {{ index: number, chapter: number, 采纳的: { index: boolean, chapter: boolean } }}
   */
  restoreFromSave(saved = {}) {
    const 上限 = MAINLINE.length - 1;
    const raw = saved?.index;
    const 是整数 = Number.isInteger(raw);
    const 落点 = 是整数 ? Math.min(Math.max(raw, 0), 上限) : 0;
    const 采纳了index = 是整数 && raw >= 0 && raw <= 上限;
    if (!采纳了index) {
      console.warn(`[quests] 存档里的 index ${JSON.stringify(raw)} 不能落在这条 ${MAINLINE.length} 步的主线上，`
        + `已按第 ${落点} 步（"${MAINLINE[落点]?.id}"）继续`);
    }
    this.questIndex = 落点;
    this.completed = Boolean(saved?.completed ?? false);
    const 该在哪章 = chapterAt(落点);
    const 采纳了章节 = saved?.chapter === undefined || saved.chapter === 该在哪章;
    if (!采纳了章节) {
      console.warn(`[quests] 存档写着 chapter ${JSON.stringify(saved.chapter)}，但第 ${落点} 步`
        + `（"${MAINLINE[落点]?.id}"）在表上属于第 ${该在哪章} 章 —— 以表为准`);
    }
    this.chapter = 该在哪章;
    return { index: 落点, chapter: 该在哪章, 采纳的: { index: 采纳了index, chapter: 采纳了章节 } };
  }

  /**
   * 监听器只做两件事：把事件记到账上（记账表在 `content/objectives.js`，全仓一份），
   * 然后问一句「当前这一步完成了没有」。
   *
   * 为什么不再逐事件自己写计数：那九段与旧 `ObjectiveEngine` 的十一段是同一条算式的两份抄本（引擎已删），
   * 而 `poi-interact` 那一段把"记账 / 推进 / 门控"混在一起写了五遍同一句 `id === q.targetId`。
   */
  setupListeners() {
    for (const name of Object.keys(STAT_EVENTS)) {
      questsOn(name, (e) => {
        applyStatEvent(this.stats, name, e.detail);
        if (name === 'poi-interact') this._onInteract(e.detail);
        this.checkProgress();
      });
    }
  }

  /** 十条记账监听的唯一退订路径（W-A1 迁移第五处）：由 `Game._adopt` 登记，反序执行 */
  dispose() {
    offAll(QUEST_EVENT_TAG);
  }

  /**
   * 带门控的那几格「摸一下锚点」：条件没齐时摸了不算完成（判据对它们一律返回 false），
   * 条件齐了才由这一下交互推进。不门控的 interact 交给 `objectiveDone`，所以这里先返回。
   *
   * 「条件齐了没有」本身也只有一处算式（`content/objectives.js` 的 `CONDITIONS`）：
   * 这里以前自己写 `canAscend` / `canTrueEnd` / `canInfinity` 三个方法，与表里那三份
   * 是同一条话的两种写法，并且差了一格（表里的 `checkAllDungeons` 少算第三只 Boss）。
   */
  _onInteract(detail) {
    const q = this.current;
    if (!q || q.type !== 'interact' || detail?.id !== q.targetId) return;
    const gate = interactGateCondition(q);
    if (gate && conditionHolds(gate, this.stats)) this.advance();
  }

  /** 若已完成当前步但未推进（读档/重复交互），自动跳到正确任务 */
  syncProgress() {
    let advanced = 0;
    let guard = 0;
    while (this.current && this.isQuestObjectiveDone(this.current) && guard++ < 40) {
      this.advance();
      advanced++;
    }
    return advanced;
  }

  /** 「这一步完成了没有」只有一处定义（`content/objectives.js` 的 `objectiveDone`），这里只把账本递过去 */
  isQuestObjectiveDone(q) {
    return objectiveDone(q, this.stats);
  }

  _firstMissing(ids) {
    for (const id of ids) {
      if (!this.stats.discoveries.has(id) && TARGET_WAYPOINTS[id]) {
        return { ...TARGET_WAYPOINTS[id], targetId: id };
      }
    }
    return null;
  }

  /**
   * 门控「摸锚点」的指路：条件还没齐时指向**还缺的那件事**（少一片碎片就指碎片，
   * 第三只 Boss 没打就指它的红圈），齐了才指回锚点。
   *
   * 分派键是行自己写的那个 `condition` 函数名（`interactGateCondition` 读出来的就是它）。
   * 以前这里读的是抄本上的四个旗标（`requireAscension` 之类），于是"这一步门的是哪道关"
   * 在两张表上各说一遍，而条件算式只有 `CONDITIONS` 那一份。
   */
  _resolveInteractWaypoint(q) {
    switch (interactGateCondition(q)) {
      case 'checkAllFragments': {
        const m = this._firstMissing(FRAGMENT_IDS);
        if (m) return m;
        return { ...TARGET_WAYPOINTS['hub-anchor'], hint: t('quest_waypoint_hint_touch_anchor') };
      }
      case 'checkAllDungeons': {
        if (!this.stats.boss3Defeated) return { ...rowWaypoint('boss3'), hint: t('quest_waypoint_hint_boss3') };
        for (const id of TRIAL_DUNGEON_IDS) {
          if (!this.stats.dungeonsCleared.has(id)) {
            return { ...dungeonWaypoint(id), hint: t('quest_waypoint_hint_dungeon') };
          }
        }
        return { ...TARGET_WAYPOINTS['hub-anchor'], hint: t('quest_waypoint_hint_touch_anchor_3') };
      }
      case 'checkTrueEnd': {
        if (!this.stats.voidBossDefeated) return { ...rowWaypoint('void-boss'), hint: t('quest_waypoint_hint_void_boss') };
        const m = this._firstMissing(VOID_DISCOVERY_IDS);
        if (m) return m;
        return { ...TARGET_WAYPOINTS['hub-anchor'], hint: t('quest_waypoint_hint_touch_anchor_2') };
      }
      case 'checkInfinity': {
        if (!this.stats.chaosBossDefeated) return { ...rowWaypoint('chaos-boss'), hint: t('quest_waypoint_hint_chaos_boss') };
        if (this.stats.skillsUnlocked < ROW_BY_ID.get('skills').target) {
          return { ...rowWaypoint('skills'), hint: t('quest_waypoint_hint_skills') };
        }
        return { ...TARGET_WAYPOINTS['hub-anchor'], hint: t('quest_waypoint_hint_touch_anchor_3') };
      }
      default:
        // 没有门控的那一格：摸过就没有指示了
        if (this.stats.discoveries.has(q.targetId)) return null;
        return rowWaypoint(q.id) ? { ...rowWaypoint(q.id) } : null;
    }
  }

  checkProgress() {
    if (this.completed) return;
    if (this.current && this.isQuestObjectiveDone(this.current)) this.advance();
  }

  /**
   * 走完一步，顺带跨过它后面那道章节门。
   *
   * 「哪一步开哪一章」以前是四行 `finished?.id === 'finale'` 加四句硬编码的喊话，
   * 与表里那些 `chapter` 是同一句话的两种写法（而且抄本那侧对不上：表把
   * `magic-frag`..`finale` 标成第 2 章，玩家做这四格时 HUD 上写着 Chapter 1）。
   * 现在门控行自己带 `chapter` 与 `announce`，这里只做一件事：章节变了就喊、就广播。
   */
  advance() {
    const finished = this.current;
    const finishedId = finished?.id;
    const oldChapter = this.chapter;

    // W-E3 切片23：分支树——抉择步基于玩家选的 flag 决定下一步；
    // 非抉择步若声明 branchTo 也走分支（true-end 系列 → ch4-complete）
    // ⇒ 兼容：非 choice 步但有 `branch` 映射且 `stats.decisions` 有对应标志时，也走分支
    let 分支目标 = null;
    if (finished?.type === 'choice' && finished.branch) {
      const 选中的 = objectiveChosen(finished, this.stats);
      if (选中的 && finished.branch[选中的.flag]) {
        分支目标 = finished.branch[选中的.flag];
      }
    } else if (finished?.branchTo && finished?.branch && this.stats?.decisions) {
      // W-E3 切片23：非 choice 步（如 true-end）有 branch 映射时，
      // 依 stats.decisions 里记下的旗标查对应的目标行 id
      const 匹配的Flag = Array.from(this.stats.decisions).find(
        (f) => finished.branch[f]
      );
      if (匹配的Flag && finished.branch[匹配的Flag]) {
        分支目标 = finished.branch[匹配的Flag];
      }
    } else if (finished?.branchTo) {
      分支目标 = finished.branchTo;
    }

    if (分支目标) {
      const 目标索引 = MAINLINE.findIndex((r) => r.id === 分支目标);
      if (目标索引 >= 0) {
        this.questIndex = 目标索引;
      } else {
        // 注册表应已核过 branch 目标必存在；此处仅做防御性回退
        this.questIndex++;
      }
    } else {
      this.questIndex++;
    }

    const gate = finished ? chapterGateAfter(finished.id) : null;
    // W-E3 切片24：表上每一行的 `flags`（"这一步完成就点亮哪几格"）从此有运行时读者。
    // 写完这一步，再写它身后那道章节门 —— 门控行不在 `MAINLINE` 里、不随 `questIndex`
    // 推进，但"跨过这一刻"同样是一个事实（`chaos-core` 们的 `requires` 等的就是它）。
    // 读档时历史旗标由 `SaveMigrations` 的 v17 → v18 按 `questIndex` 重放补上。
    if (finished) applyObjectiveFlags(this.stats, finished);
    if (gate) applyObjectiveFlags(this.stats, gate);
    if (gate && gate.chapter !== this.chapter) {
      this.chapter = gate.chapter;
      // W-D2 切片16j：`announce` 存的是**文案键** —— 显示侧在播出的那一刻展开
      if (gate.announce) this.dialog.toast(t('quest_toast_chapter_announce', { announce: t(gate.announce) }));
    }
    if (this.chapter !== oldChapter) {
      window.dispatchEvent(new CustomEvent('chapter-changed', { detail: { chapter: this.chapter, prev: oldChapter } }));
    }
        // W-E3 切片20：**主线那 56 步的 `reward`（完成奖励魂火）从来没有读者** ⇒
    // 玩家做完整条主线拿不到一魂火（支线那 45 条一直有）。这里把它发出去。
    // 魂火总账：主线 56 步合计 1194（升到 21 级要 11050 ⇒ 约 11%，温和）。
    const 回报 = objectiveReward(finished, this.stats);
    if (finished && 回报 > 0) this.game?.stats?.addSouls(回报);
    // 提示里那个 title 是**文案键** ⇒ 展开在播出的那一刻（改前直接传了键，
    // 玩家看到的是 "任务完成：obj_anchor_title"）。
    if (finished) this.dialog.toast(t('quest_toast_task_complete', { title: t(finished.title), reward: 回报 }));
    // W-B6 切片4：记录任务完成
    if (finishedId) this.game?.stats?.onQuestCompleted(finishedId);
    if (this.questIndex >= MAINLINE.length) {
      this.completed = true;
      window.dispatchEvent(new CustomEvent('game-completed'));
    }
    this.notifyUpdate();
  }

  notifyUpdate() {
    window.dispatchEvent(new CustomEvent('quest-updated', {
      detail: { current: this.current, index: this.questIndex, total: MAINLINE.length, completed: this.completed, chapter: this.chapter },
    }));
  }

  /**
   * 记录玩家的抉择（W-E3 切片18）：派发一条 `choice-made` 事件。
   *
   * 为什么**不直接写账**：账本那一格（`stats.decisions`）的生产者必须是**一条事件**
   * （`STAT_EVENTS` 里那一条）⇒ 判据闭包门禁才扫得到它
   * （"账本里有这一格却没人写"会当场红）。
   * `setupListeners` 按 `STAT_EVENTS` 的键自动接线 ⇒ 这里派发即可，
   * 记账与判进度都由那条通用路完成（`applyStatEvent` → `checkProgress`）。
   */
  recordChoice(flag) {
    window.dispatchEvent(new CustomEvent('choice-made', { detail: { flag } }));
  }

  getProgressText() {
    const q = this.current;
    if (!q) return t('quest_progress_all_complete');
    switch (q.type) {
      case 'hits': return t('quest_progress_hits', { current: Math.min(this.stats.hits, q.target), target: q.target });
      case 'kills': return `${Math.min(this.stats.kills[q.enemyType] || 0, q.target)} / ${q.target}`;
      case 'spells': return t('quest_progress_spells', { current: Math.min(this.stats.spellCasts, q.target), target: q.target });
      case 'dungeon': return this.stats.dungeonsCleared.has(q.dungeonId) ? t('quest_progress_dungeon', { dungeon_done: t('quest_state_done') }) : t('quest_progress_dungeon', { dungeon_done: t('quest_progress_dungeon_search') });
      case 'mind': return t('quest_progress_mind', { target: q.target });
      case 'charged': return t('quest_progress_charged', { current: Math.min(this.stats.chargedCasts, q.target), target: q.target });
      case 'skills-unlocked': return t('quest_progress_skills', { current: Math.min(this.stats.skillsUnlocked, q.target), target: q.target });
      case 'dungeon-rerun': return this.stats.dungeonRerun ? t('quest_progress_dungeon_rerun', { rerun_done: t('quest_state_done') }) : t('quest_progress_dungeon_rerun', { rerun_done: t('quest_progress_dungeon_rerun_again') });
      case 'gear': return this.isQuestObjectiveDone(q)
        ? t('quest_progress_gear', { slot_done: t('quest_progress_gear_equipped') })
        : t('quest_progress_gear', { slot_done: t('quest_progress_gear_unequipped') });
      case 'choice': {
        const 选中的 = objectiveChosen(q, this.stats);
        return 选中的
          ? t('quest_progress_choice', { choice_done: t(选中的.label) })
          : t('quest_progress_choice', { choice_done: t('quest_progress_choice_pending') });
      }
      case 'chests': return t('quest_progress_chests', { current: this.stats.chestsOpened, target: q.target });
      case 'npc': return this.stats.npcTalked.has(q.targetId) ? t('quest_progress_npc', { npc_done: t('quest_state_done') }) : t('quest_progress_npc', { npc_done: t('quest_progress_npc_search') });
      case 'level': return t('quest_progress_level', { target: q.target });
      case 'discovery': return this.stats.discoveries.has(q.targetId) ? t('quest_progress_discovery', { discovery_done: t('quest_state_done_already') }) : t('quest_progress_discovery', { discovery_done: t('quest_progress_discovery_search_fmt', { label: t(TARGET_WAYPOINTS[q.targetId]?.label ?? 'quest_progress_discovery_marker') }) });
      case 'interact':
        // 门控那一格不许显示"已完成触摸"：摸过锚点不等于这一步过了（判据同一条口径）
        if (this.stats.discoveries.has(q.targetId) && !interactGateCondition(q)) {
          return t('quest_progress_touch_done');
        }
        return keyText(t(objectiveDesc(q, this.stats)));
      default: {
        const bossKey = BOSS_STAT_KEYS[q.bossId];
        if (bossKey) return this.stats[bossKey] ? t('quest_progress_dungeon', { dungeon_done: t('quest_state_done') }) : t(BOSS_DISPLAY[q.bossId].progress);
        return keyText(t(objectiveDesc(q, this.stats)));
      }
    }
  }

  /** 当前任务世界坐标指引（智能：不会重复指已完成步骤） */
  getQuestWaypoint() {
    const q = this.current;
    if (!q) return null;
    if (this.isQuestObjectiveDone(q)) {
      const before = this.questIndex;
      this.syncProgress();
      if (this.questIndex === before) return null;
      return this.getQuestWaypoint();
    }

    if (q.type === 'interact') return this._resolveInteractWaypoint(q);

    if (q.type === 'discovery' && !this.stats.discoveries.has(q.targetId)) {
      return TARGET_WAYPOINTS[q.targetId] ? { ...TARGET_WAYPOINTS[q.targetId] } : rowWaypoint(q.id) ? { ...rowWaypoint(q.id) } : null;
    }

    const bossKey = BOSS_STAT_KEYS[q.bossId];
    if (bossKey && !this.stats[bossKey]) {
      return { ...MAP_BOSSES.find((b) => b.bossId === q.bossId), label: BOSS_DISPLAY[q.bossId].waypoint };
    }

    // 副本步**不问清没清**：这一支要么指到那座副本的入口，要么这行就没有指路。
    // 改前它带着 `&& !dungeonsCleared.has(...)`，于是"这座已经清了、但这一行还没走完"
    // （切片24 起 `requires` 有运行时读者 ⇒ "完成"与"资格"从此是两件事）会一路漏到函数最末那行，
    // 去读**主线行上自己抄的那一份** `waypoint`。今天九行副本步都没写 `requires`，那条路在役走不到
    // ⇒ 抄本是一份零读者的潜伏口径；这里先堵路，行上那九格随之删除（B143）。
    if (q.type === 'dungeon') {
      return dungeonWaypoint(q.dungeonId);
    }

    if (q.type === 'npc' && !this.stats.npcTalked.has(q.targetId)) {
      return TARGET_WAYPOINTS[q.targetId] ? { ...TARGET_WAYPOINTS[q.targetId] } : null;
    }

    if (rowWaypoint(q.id)) return { ...rowWaypoint(q.id) };
    return null;
  }

  getAssistantHint() {
    const q = this.current;
    if (!q) return t('quest_assistant_hint_all_done', { questTracker: keyText('{questTracker}') });
    const wp = this.getQuestWaypoint();
    if (wp?.hint) return wp.hint;
    if (q.type === 'interact' && this.stats.discoveries.has(q.targetId)) {
      return t('quest_assistant_hint_step_done');
    }
    if (BOSS_STAT_KEYS[q.bossId]) {
      return t('quest_assistant_hint_boss_dist', { progress: this.getProgressText() });
    }
    return this.getProgressText();
  }

  getQuestDirectionText(playerX, playerZ) {
    const q = this.current;
    if (!q) return t('quest_title_all_done', { questTracker: keyText('{questTracker}') });
    if (this.isQuestObjectiveDone(q)) return t('quest_assistant_hint_step_done_2');
    const wp = this.getQuestWaypoint();
    if (!wp) return this.getAssistantHint();
    const dx = wp.x - playerX;
    const dz = wp.z - playerZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 8) return t('quest_waypoint_near', { label: t(wp.label) });
    const angle = Math.atan2(dx, dz);
    const dirs = [t('dir_north'), t('dir_northeast'), t('dir_east'), t('dir_southeast'), t('dir_south'), t('dir_southwest'), t('dir_west'), t('dir_northwest')];
    const idx = Math.round((angle / (Math.PI * 2)) * 8) % 8;
    const dir = dirs[(idx + 8) % 8];
    return `▶ ${dir} · ${Math.round(dist)}m · ${t(wp.label)}`;
  }
}
