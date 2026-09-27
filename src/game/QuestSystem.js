import { ZONE_IDS, ZONE_NAMES } from '../content/ZoneIdentity.js';
import { keyText } from '../content/keyHints.js';
import {
  BOSS_STAT_KEYS, STAT_EVENTS, applyStatEvent, conditionHolds,
  emptyStats, interactGateCondition, objectiveDone,
} from '../content/objectives.js';

export const QUESTS = [
  { id: 'anchor', title: '觉醒：世界之锚', desc: '触摸枢纽中心的世界之锚。', type: 'interact', targetId: 'hub-anchor' },
  { id: 'training', title: '战斗训练', desc: '训练木人命中 8 次。', type: 'hits', target: 8 },
  { id: 'soldiers', title: '影之试炼', desc: '击败 2 名影之战士。', type: 'kills', enemyType: 'soldier', target: 2 },
  { id: 'fantasy-frag', title: '第一碎片', desc: '调查至尊石环。', type: 'discovery', targetId: 'fantasy-ring' },
  { id: 'boss', title: '影界守护者', desc: '击败灰白森林 Boss。', type: 'boss', bossId: 'shadow-warden' },
  { id: 'magic-frag', title: '第二碎片', desc: '调查悬浮城堡。', type: 'discovery', targetId: 'magic-castle' },
  { id: 'golem', title: '构装体歼灭', desc: '击败 1 名魔法构装体。', type: 'kills', enemyType: 'golem', target: 1 },
  { id: 'space-frag', title: '第三碎片', desc: '触碰五维_tesseract。', type: 'discovery', targetId: 'space-tesseract' },
  { id: 'finale', title: '重铸锚点', desc: '集齐碎片后再次触摸世界之锚。', type: 'interact', targetId: 'hub-anchor', requireAllFragments: true },
  // Chapter 2
  { id: 'chests', title: 'Hidden Treasures', desc: '开启 5 个隐藏宝箱。', type: 'chests', target: 5 },
  { id: 'talk-wanderer', title: '位面流浪者', desc: '与枢纽的位面流浪者对话。', type: 'npc', targetId: 'wanderer' },
  { id: 'boss2', title: '大奥术师', desc: '击败魔法遗境深处的大奥术师。', type: 'boss2', bossId: 'archmagus' },
  { id: 'elite', title: '虚空骑士', desc: '击败精英·虚空骑士。', type: 'kills', enemyType: 'elite', target: 1 },
  { id: 'level', title: '穿越者之路', desc: '将等级提升至 5。', type: 'level', target: 5 },
  { id: 'epilogue', title: '无尽位面', desc: '与宇航员回声对话，开启无尽探索。', type: 'npc', targetId: 'astronaut-echo' },
  // Chapter 3
  { id: 'learn-spell', title: '奥术入门', desc: '施放任意法术 8 次（{spell1}–{spell4}）。', type: 'spells', target: 8 },
  { id: 'crypt', title: '灰白遗城', desc: '清空森林地下城。', type: 'dungeon', dungeonId: 'ruin-crypt' },
  { id: 'library', title: '禁书图书馆', desc: '清空魔法地下城。', type: 'dungeon', dungeonId: 'forbidden-library' },
  { id: 'rift', title: '五维裂隙', desc: '清空星际地下城。', type: 'dungeon', dungeonId: 'five-dim-rift' },
  { id: 'boss3', title: '奇点领主', desc: '击败米勒荒原的引力化身。', type: 'boss3', bossId: 'singularity-herald' },
  { id: 'mind', title: '心智觉醒', desc: '在营火将「心智」升级至 2。', type: 'mind', target: 2 },
  { id: 'ascension', title: '位面飞升', desc: '完成三界试炼后再次触摸世界之锚。', type: 'interact', targetId: 'hub-anchor', requireAscension: true },
  // Chapter 4
  { id: 'void-rift', title: '时线裂隙', desc: '调查破碎时线的裂隙。', type: 'discovery', targetId: 'void-rift' },
  { id: 'charge-spell', title: '蓄力奥术', desc: '施放 5 次蓄力法术（长按 {spell1}/{spell2}/{spell3}）。', type: 'charged', target: 5 },
  { id: 'void-boss', title: '时线执政官', desc: '击败破碎时线隐藏 Boss。', type: 'voidboss', bossId: 'void-chronarch' },
  { id: 'void-tablet', title: '五维碑文', desc: '阅读时线位面的碑文。', type: 'discovery', targetId: 'void-tablet' },
  { id: 'true-end', title: '真·位面行者', desc: '集齐四枚碎片后触摸世界之锚。', type: 'interact', targetId: 'hub-anchor', requireTrueEnd: true },
  // Chapter 5 — 混沌边境
  { id: 'chaos-core', title: '混沌之核', desc: '触碰混沌边境的能量核心。', type: 'discovery', targetId: 'chaos-core' },
  { id: 'skills', title: '流派入门', desc: '解锁 3 个武器技能。', type: 'skills-unlocked', target: 3 },
  { id: 'chaos-boss', title: '裂隙领主', desc: '击败混沌边境 Boss。', type: 'chaosboss', bossId: 'chaos-overlord' },
  { id: 'dungeon-rerun', title: '深渊再探', desc: '再次清空一座地下城。', type: 'dungeon-rerun' },
  { id: 'infinity', title: '无尽行者', desc: '完成混沌试炼后触摸世界之锚。', type: 'interact', targetId: 'hub-anchor', requireInfinity: true },
];

/**
 * 任务导航目标 — 小地图金色标记 + 屏幕指引。
 *
 * 凡是指向**整个位面**的路点，label 一律取 `ZONE_NAMES`：此前这里另抄了一份区名，
 * 于是文案漂移成"提示让你去『魔法遗境』，站进去招牌却写着『霍格沃兹遗境』"。
 * 指向具体物件（石环、木人、Boss、地下城入口）的仍写自己的名字，那不是区域文案的第二真源。
 */
const QUEST_WAYPOINTS = {
  anchor: { x: 0, z: 55, label: '世界之锚' },
  training: { x: 12, z: 52, label: '训练木人' },
  soldiers: { x: -200, z: 0, label: ZONE_NAMES[ZONE_IDS.FANTASY] },
  'fantasy-frag': { x: -200, z: -30, label: '至尊石环' },
  boss: { x: -250, z: -35, label: '影界守护者' },
  'magic-frag': { x: 0, z: -180, label: ZONE_NAMES[ZONE_IDS.MAGIC] },
  golem: { x: 20, z: -210, label: '构装体' },
  'space-frag': { x: 200, z: 80, label: ZONE_NAMES[ZONE_IDS.SPACE] },
  finale: { x: 0, z: 55, label: '世界之锚' },
  chests: { x: -190, z: 25, label: '宝箱/地下城' },
  'talk-wanderer': { x: -8, z: 45, label: '位面流浪者' },
  boss2: { x: 5, z: -220, label: '大奥术师' },
  elite: { x: -50, z: -60, label: '虚空骑士' },
  level: { x: 0, z: 55, label: '营火升级' },
  epilogue: { x: 200, z: 90, label: '宇航员回声' },
  'learn-spell': { x: 12, z: 52, label: '训练木人' },
  crypt: { x: -190, z: 25, label: '灰白遗城入口' },
  library: { x: -35, z: -200, label: '禁书图书馆' },
  rift: { x: 175, z: 95, label: '五维裂隙' },
  boss3: { x: 235, z: 155, label: '奇点领主' },
  mind: { x: 0, z: 55, label: '营火升级' },
  ascension: { x: 0, z: 55, label: '世界之锚' },
  'void-rift': { x: 0, z: 220, label: ZONE_NAMES[ZONE_IDS.VOID] },
  'charge-spell': { x: 12, z: 52, label: '训练木人' },
  'void-boss': { x: 0, z: 235, label: '时线执政官' },
  'void-tablet': { x: 0, z: 225, label: '五维碑文' },
  'true-end': { x: 0, z: 55, label: '世界之锚' },
  'chaos-core': { x: -200, z: 220, label: '混沌之核' },
  skills: { x: 0, z: 55, label: '营火·武器技能' },
  'chaos-boss': { x: -200, z: 285, label: '混沌领主' },
  'dungeon-rerun': { x: -190, z: 25, label: '地下城入口' },
  infinity: { x: 0, z: 55, label: '世界之锚' },
};

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

/** 世界地图 Boss 标记（小地图骷髅） */
export const MAP_BOSSES = [
  { x: -250, z: -35, label: '影界', short: 'B1', color: '#ff5555', chapter: 1 },
  { x: 5, z: -220, label: '奥术', short: 'B2', color: '#aa55ff', chapter: 2 },
  { x: 235, z: 155, label: '奇点', short: 'B3', color: '#5588ff', chapter: 3 },
  { x: 0, z: 235, label: '时线', short: 'B4', color: '#ddbb55', chapter: 4 },
  { x: -200, z: 285, label: '混沌', short: 'B5', color: '#ff3366', chapter: 5 },
];

const FRAGMENT_IDS = ['fantasy-ring', 'magic-castle', 'space-tesseract'];

/**
 * Boss 那一族的界面话术，按 `bossId` 认领。
 *
 * 为什么不再按类型名（`boss` / `boss2` / …）各写一遍"读哪个计数器"：那是把
 * `BOSS_STAT_KEYS` 那份名册抄进显示层，而新表把所有 Boss 都写成 `type: 'boss'` + `bossId`，
 * 抄本会当场读错格子（在役表今天侥幸不错，只因为类型名里也编了号）。
 * 顺序与 `MAP_BOSSES` 的对应由 `BOSS_ORDER` 说出，并由用例逐格钉住。
 */
const BOSS_DISPLAY = {
  'shadow-warden': { progress: '进入灰白森林 Boss 红圈 (X≈-250 Z≈-35)', waypoint: '影界守护者 Boss 区' },
  'archmagus': { progress: '魔法 Boss 红圈 (X≈5 Z≈-220)', waypoint: '大奥术师 Boss 区' },
  'singularity-herald': { progress: '星际 Boss 红圈 (X≈235 Z≈155)', waypoint: '奇点领主 Boss 区' },
  'void-chronarch': { progress: '时线 Boss 红圈 (Z≈235 · Ch4+)', waypoint: '时线执政官 Boss 区' },
  'chaos-overlord': { progress: '混沌 Boss 红圈 (X≈-200 Z≈285 · Ch5+)', waypoint: '混沌领主 Boss 区' },
};

const BOSS_ORDER = Object.keys(BOSS_STAT_KEYS);

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

  get current() { return QUESTS[this.questIndex] ?? null; }

  /**
   * 监听器只做两件事：把事件记到账上（记账表在 `content/objectives.js`，全仓一份），
   * 然后问一句「当前这一步完成了没有」。
   *
   * 为什么不再逐事件自己写计数：那九段与 `ObjectiveEngine` 的十一段是同一条算式的两份抄本，
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

  _resolveInteractWaypoint(q) {
    if (q.requireAllFragments) {
      const m = this._firstMissing(FRAGMENT_IDS);
      if (m) return m;
      return { ...TARGET_WAYPOINTS['hub-anchor'], hint: '集齐碎片后触摸世界之锚' };
    }
    if (q.requireAscension) {
      if (!this.stats.boss3Defeated) return { ...QUEST_WAYPOINTS.boss3, hint: '先击败奇点领主' };
      for (const id of ['ruin-crypt', 'forbidden-library', 'five-dim-rift']) {
        if (!this.stats.dungeonsCleared.has(id) && DUNGEON_WAYPOINTS[id]) {
          return { ...DUNGEON_WAYPOINTS[id], hint: '清空地下城' };
        }
      }
      return { ...TARGET_WAYPOINTS['hub-anchor'], hint: '三界试炼完成后触摸锚点' };
    }
    if (q.requireTrueEnd) {
      if (!this.stats.voidBossDefeated) return { ...QUEST_WAYPOINTS['void-boss'], hint: '击败时线执政官' };
      const m = this._firstMissing(['void-rift', 'void-tablet'].filter((id) => !this.stats.discoveries.has(id)));
      if (m) return m;
      return { ...TARGET_WAYPOINTS['hub-anchor'], hint: '条件满足后触摸锚点' };
    }
    if (q.requireInfinity) {
      if (!this.stats.chaosBossDefeated) return { ...QUEST_WAYPOINTS['chaos-boss'], hint: '击败混沌领主' };
      if (this.stats.skillsUnlocked < 3) return { ...QUEST_WAYPOINTS.skills, hint: '营火解锁3个武器技能' };
      return { ...TARGET_WAYPOINTS['hub-anchor'], hint: '完成试炼后触摸锚点' };
    }
    if (this.stats.discoveries.has(q.targetId)) return null;
    return TARGET_WAYPOINTS[q.targetId] ? { ...TARGET_WAYPOINTS[q.targetId] } : QUEST_WAYPOINTS[q.id] ? { ...QUEST_WAYPOINTS[q.id] } : null;
  }

  checkProgress() {
    if (this.completed) return;
    if (this.current && this.isQuestObjectiveDone(this.current)) this.advance();
  }

  advance() {
    const finished = this.current;
    const oldChapter = this.chapter;
    this.questIndex++;
    if (finished?.id === 'finale') {
      this.chapter = 2;
      this.dialog.toast('Chapter 2：无尽位面 已开启');
    }
    if (finished?.id === 'epilogue') {
      this.chapter = 3;
      this.dialog.toast('Chapter 3：位面飞升 已开启 — 法术 1–4、三座地下城、第三 Boss');
    }
    if (finished?.id === 'ascension') {
      this.chapter = 4;
      this.dialog.toast('Chapter 4：破碎时线 已开启 — 向北探索，长按法术蓄力');
    }
    if (finished?.id === 'true-end') {
      this.chapter = 5;
      this.dialog.toast('Chapter 5：混沌边境 已开启 — 向西北探索，营火「武器技能」解锁流派');
    }
    if (this.chapter !== oldChapter) {
      window.dispatchEvent(new CustomEvent('chapter-changed', { detail: { chapter: this.chapter, prev: oldChapter } }));
    }
    if (finished) this.dialog.toast(`任务完成：${finished.title}`);
    if (this.questIndex >= QUESTS.length) {
      this.completed = true;
      window.dispatchEvent(new CustomEvent('game-completed'));
    }
    this.notifyUpdate();
  }

  notifyUpdate() {
    window.dispatchEvent(new CustomEvent('quest-updated', {
      detail: { current: this.current, index: this.questIndex, total: QUESTS.length, completed: this.completed, chapter: this.chapter },
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
      return TARGET_WAYPOINTS[q.targetId] ? { ...TARGET_WAYPOINTS[q.targetId] } : QUEST_WAYPOINTS[q.id] ? { ...QUEST_WAYPOINTS[q.id] } : null;
    }

    const bossKey = BOSS_STAT_KEYS[q.bossId];
    if (bossKey && !this.stats[bossKey]) {
      return { ...MAP_BOSSES[BOSS_ORDER.indexOf(q.bossId)], label: BOSS_DISPLAY[q.bossId].waypoint };
    }

    if (q.type === 'dungeon' && !this.stats.dungeonsCleared.has(q.dungeonId)) {
      return DUNGEON_WAYPOINTS[q.dungeonId] ? { ...DUNGEON_WAYPOINTS[q.dungeonId] } : null;
    }

    if (q.type === 'npc' && !this.stats.npcTalked.has(q.targetId)) {
      return TARGET_WAYPOINTS[q.targetId] ? { ...TARGET_WAYPOINTS[q.targetId] } : null;
    }

    if (QUEST_WAYPOINTS[q.id]) return { ...QUEST_WAYPOINTS[q.id] };
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
