import { keyText } from '../content/keyHints.js';
import {
  BOSS_STAT_KEYS, MAINLINE, STAT_EVENTS, applyStatEvent, chapterAt, chapterGateAfter,
  conditionHolds, emptyStats, interactGateCondition, objectiveDone,
} from '../content/objectives.js';

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
/** 三界试炼要的三座地下城 = 表里 `type: 'dungeon'` 的那三行（`'dungeon-rerun'` 是另一族） */
const DUNGEON_IDS = MAINLINE.filter((r) => r.type === 'dungeon').map((r) => r.dungeonId);

/**
 * POI 与地下城入口的路点。这两张**不是**主线行的抄本：它们按 `targetId` / `dungeonId`
 * 认领的是"那个物件在哪儿"（同一个石环可以被主线步、快速旅行、地图图标各自指向），
 * 而主线行上的 `waypoint` 说的是"这一步让你去哪儿"。两者今天数值相同，职责不同。
 */
const TARGET_WAYPOINTS = {
  'hub-anchor': { x: 0, z: 55, label: '世界之锚' },
  'fantasy-ring': { x: -200, z: -30, label: '至尊石环' },
  'magic-castle': { x: 0, z: -195, label: '悬浮城堡' },
  'space-tesseract': { x: 200, z: 80, label: '五维_tesseract' },
  'void-rift': { x: 0, z: 220, label: '时线裂隙' },
  'void-tablet': { x: 0, z: 225, label: '五维碑文' },
  'chaos-core': { x: -200, z: 220, label: '混沌之核' },
  wanderer: { x: -8, z: 45, label: '位面流浪者' },
  'astronaut-echo': { x: 200, z: 90, label: '宇航员回声' },
};

const DUNGEON_WAYPOINTS = {
  'ruin-crypt': { x: -190, z: 25, label: '灰白遗城' },
  'forbidden-library': { x: -35, z: -200, label: '禁书图书馆' },
  'five-dim-rift': { x: 175, z: 95, label: '五维裂隙' },
};

/**
 * 地图骷髅自己的两个字段（简称与配色）。**坐标与章节不在这里** ——
 * 以前那张五行表是手抄的，"第 i 个骷髅是哪只 Boss"只剩顺序这一条隐式约定，
 * 而查它的人用的是 `MAP_BOSSES[名册下标]`：表里插一行或换一次序，骷髅就指到别处，
 * 没有任何一处会红。如今按 `bossId` 从主线表取。
 */
const MAP_BOSS_META = {
  'shadow-warden': { label: '影界', short: 'B1', color: '#ff5555' },
  'archmagus': { label: '奥术', short: 'B2', color: '#aa55ff' },
  'singularity-herald': { label: '奇点', short: 'B3', color: '#5588ff' },
  'void-chronarch': { label: '时线', short: 'B4', color: '#ddbb55' },
  'chaos-overlord': { label: '混沌', short: 'B5', color: '#ff3366' },
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
const BOSS_DISPLAY = {
  'shadow-warden': { progress: '进入灰白森林 Boss 红圈 (X≈-250 Z≈-35)', waypoint: '影界守护者 Boss 区' },
  'archmagus': { progress: '魔法 Boss 红圈 (X≈5 Z≈-220)', waypoint: '大奥术师 Boss 区' },
  'singularity-herald': { progress: '星际 Boss 红圈 (X≈235 Z≈155)', waypoint: '奇点领主 Boss 区' },
  'void-chronarch': { progress: '时线 Boss 红圈 (Z≈235 · Ch4+)', waypoint: '时线执政官 Boss 区' },
  'chaos-overlord': { progress: '混沌 Boss 红圈 (X≈-200 Z≈285 · Ch5+)', waypoint: '混沌领主 Boss 区' },
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
      window.addEventListener(name, (e) => {
        applyStatEvent(this.stats, name, e.detail);
        if (name === 'poi-interact') this._onInteract(e.detail);
        this.checkProgress();
      });
    }
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
        return { ...TARGET_WAYPOINTS['hub-anchor'], hint: '集齐碎片后触摸世界之锚' };
      }
      case 'checkAllDungeons': {
        if (!this.stats.boss3Defeated) return { ...rowWaypoint('boss3'), hint: '先击败奇点领主' };
        for (const id of DUNGEON_IDS) {
          if (!this.stats.dungeonsCleared.has(id) && DUNGEON_WAYPOINTS[id]) {
            return { ...DUNGEON_WAYPOINTS[id], hint: '清空地下城' };
          }
        }
        return { ...TARGET_WAYPOINTS['hub-anchor'], hint: '三界试炼完成后触摸锚点' };
      }
      case 'checkTrueEnd': {
        if (!this.stats.voidBossDefeated) return { ...rowWaypoint('void-boss'), hint: '击败时线执政官' };
        const m = this._firstMissing(VOID_DISCOVERY_IDS);
        if (m) return m;
        return { ...TARGET_WAYPOINTS['hub-anchor'], hint: '条件满足后触摸锚点' };
      }
      case 'checkInfinity': {
        if (!this.stats.chaosBossDefeated) return { ...rowWaypoint('chaos-boss'), hint: '击败混沌领主' };
        if (this.stats.skillsUnlocked < ROW_BY_ID.get('skills').target) {
          return { ...rowWaypoint('skills'), hint: '营火解锁3个武器技能' };
        }
        return { ...TARGET_WAYPOINTS['hub-anchor'], hint: '完成试炼后触摸锚点' };
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
    const oldChapter = this.chapter;
    this.questIndex++;
    const gate = finished ? chapterGateAfter(finished.id) : null;
    if (gate && gate.chapter !== this.chapter) {
      this.chapter = gate.chapter;
      if (gate.announce) this.dialog.toast(gate.announce);
    }
    if (this.chapter !== oldChapter) {
      window.dispatchEvent(new CustomEvent('chapter-changed', { detail: { chapter: this.chapter, prev: oldChapter } }));
    }
    if (finished) this.dialog.toast(`任务完成：${finished.title}`);
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

  getProgressText() {
    const q = this.current;
    if (!q) return '全部任务已完成 — 无尽探索模式';
    switch (q.type) {
      case 'hits': return `${Math.min(this.stats.hits, q.target)} / ${q.target} 命中`;
      case 'kills': return `${Math.min(this.stats.kills[q.enemyType] || 0, q.target)} / ${q.target}`;
      case 'spells': return `${Math.min(this.stats.spellCasts, q.target)} / ${q.target} 次施法`;
      case 'dungeon': return this.stats.dungeonsCleared.has(q.dungeonId) ? '完成' : '寻找地下城入口（紫环）';
      case 'mind': return `营火升级「心智」至 ${q.target}`;
      case 'charged': return `${Math.min(this.stats.chargedCasts, q.target)} / ${q.target} 蓄力施法`;
      case 'skills-unlocked': return `${Math.min(this.stats.skillsUnlocked, q.target)} / ${q.target} 技能`;
      case 'dungeon-rerun': return this.stats.dungeonRerun ? '完成' : '再次进入地下城（Chapter 5 后）';
      case 'chests': return `${this.stats.chestsOpened} / ${q.target} 宝箱`;
      case 'npc': return this.stats.npcTalked.has(q.targetId) ? '完成' : '寻找 NPC（绿点）';
      case 'level': return `在营火休息升级至 Lv.${q.target}`;
      case 'discovery': return this.stats.discoveries.has(q.targetId) ? '已完成' : `寻找 ${TARGET_WAYPOINTS[q.targetId]?.label ?? '标记点'}`;
      case 'interact':
        // 门控那一格不许显示"已完成触摸"：摸过锚点不等于这一步过了（判据同一条口径）
        if (this.stats.discoveries.has(q.targetId) && !interactGateCondition(q)) {
          return '已完成触摸 — 若未跳转请点右下角「同步任务」';
        }
        return keyText(q.desc);
      default: {
        const bossKey = BOSS_STAT_KEYS[q.bossId];
        if (bossKey) return this.stats[bossKey] ? '完成' : BOSS_DISPLAY[q.bossId].progress;
        return keyText(q.desc);
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

    if (q.type === 'dungeon' && !this.stats.dungeonsCleared.has(q.dungeonId)) {
      return DUNGEON_WAYPOINTS[q.dungeonId] ? { ...DUNGEON_WAYPOINTS[q.dungeonId] } : null;
    }

    if (q.type === 'npc' && !this.stats.npcTalked.has(q.targetId)) {
      return TARGET_WAYPOINTS[q.targetId] ? { ...TARGET_WAYPOINTS[q.targetId] } : null;
    }

    if (rowWaypoint(q.id)) return { ...rowWaypoint(q.id) };
    return null;
  }

  getAssistantHint() {
    const q = this.current;
    if (!q) return keyText('全部通关。按 {questTracker} 打开助手可重跑全流程演示。');
    const wp = this.getQuestWaypoint();
    if (wp?.hint) return wp.hint;
    if (q.type === 'interact' && this.stats.discoveries.has(q.targetId)) {
      return '本步已完成，点击助手「同步任务进度」';
    }
    if (BOSS_STAT_KEYS[q.bossId]) {
      return `走进地图骷髅标记的红圈激活 Boss · ${this.getProgressText()}`;
    }
    return this.getProgressText();
  }

  getQuestDirectionText(playerX, playerZ) {
    const q = this.current;
    if (!q) return '主线已完成';
    if (this.isQuestObjectiveDone(q)) return '本步已完成 — 点 U → 同步任务进度';
    const wp = this.getQuestWaypoint();
    if (!wp) return this.getAssistantHint();
    const dx = wp.x - playerX;
    const dz = wp.z - playerZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 8) return `已接近 · ${wp.label}`;
    const angle = Math.atan2(dx, dz);
    const dirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
    const idx = Math.round((angle / (Math.PI * 2)) * 8) % 8;
    const dir = dirs[(idx + 8) % 8];
    return `▶ ${dir} · ${Math.round(dist)}m · ${wp.label}`;
  }
}
