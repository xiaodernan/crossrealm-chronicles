import { ZONE_IDS, ZONE_NAMES } from '../content/ZoneIdentity.js';
import { keyText } from '../content/keyHints.js';

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
  { id: 'learn-spell', title: '奥术入门', desc: '施放任意法术 8 次（键 1–4）。', type: 'spells', target: 8 },
  { id: 'crypt', title: '灰白遗城', desc: '清空森林地下城。', type: 'dungeon', dungeonId: 'ruin-crypt' },
  { id: 'library', title: '禁书图书馆', desc: '清空魔法地下城。', type: 'dungeon', dungeonId: 'forbidden-library' },
  { id: 'rift', title: '五维裂隙', desc: '清空星际地下城。', type: 'dungeon', dungeonId: 'five-dim-rift' },
  { id: 'boss3', title: '奇点领主', desc: '击败米勒荒原的引力化身。', type: 'boss3', bossId: 'singularity-herald' },
  { id: 'mind', title: '心智觉醒', desc: '在营火将「心智」升级至 2。', type: 'mind', target: 2 },
  { id: 'ascension', title: '位面飞升', desc: '完成三界试炼后再次触摸世界之锚。', type: 'interact', targetId: 'hub-anchor', requireAscension: true },
  // Chapter 4
  { id: 'void-rift', title: '时线裂隙', desc: '调查破碎时线的裂隙。', type: 'discovery', targetId: 'void-rift' },
  { id: 'charge-spell', title: '蓄力奥术', desc: '施放 5 次蓄力法术（长按 1/2/3）。', type: 'charged', target: 5 },
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
const VOID_FRAG_IDS = ['fantasy-ring', 'magic-castle', 'space-tesseract', 'void-rift'];

export class QuestSystem {
  constructor(dialog) {
    this.dialog = dialog;
    this.questIndex = 0;
    this.stats = {
      hits: 0,
      kills: {},
      discoveries: new Set(),
      bossDefeated: false,
      boss2Defeated: false,
      boss3Defeated: false,
      voidBossDefeated: false,
      chaosBossDefeated: false,
      dungeonRerun: false,
      npcTalked: new Set(),
      chestsOpened: 0,
      spellCasts: 0,
      chargedCasts: 0,
      dungeonsCleared: new Set(),
      skillsUnlocked: 0,
    };
    this.completed = false;
    this.chapter = 1;
    this.setupListeners();
    this.syncProgress();
    this.notifyUpdate();
  }

  get current() { return QUESTS[this.questIndex] ?? null; }

  setupListeners() {
    window.addEventListener('discovery', (e) => {
      this.stats.discoveries.add(e.detail.id);
      this.checkProgress();
    });

    window.addEventListener('enemy-defeated', (e) => {
      // 修 B36：击杀归类看 `type`，不看显示名。此前用「名字里含『虚空』」判定精英，
      // 于是 Boss 召出的「虚空仆从」（type=soldier）全被记成了 elite ——
      // 精英任务白送，而「影之试炼」要的两名 soldier 永远数不满。
      if (e.detail.type !== 'boss') {
        this.stats.kills[e.detail.type] = (this.stats.kills[e.detail.type] || 0) + 1;
      }
      if (e.detail.bossId === 'shadow-warden') this.stats.bossDefeated = true;
      if (e.detail.bossId === 'archmagus') this.stats.boss2Defeated = true;
      if (e.detail.bossId === 'singularity-herald') this.stats.boss3Defeated = true;
      if (e.detail.bossId === 'void-chronarch') this.stats.voidBossDefeated = true;
      if (e.detail.bossId === 'chaos-overlord') this.stats.chaosBossDefeated = true;
      this.checkProgress();
    });

    window.addEventListener('spell-cast', (e) => {
      this.stats.spellCasts++;
      if (e.detail.charged) this.stats.chargedCasts++;
      this.checkProgress();
    });

    window.addEventListener('dungeon-cleared', (e) => {
      if (this.stats.dungeonsCleared.has(e.detail.id)) {
        this.stats.dungeonRerun = true;
      }
      this.stats.dungeonsCleared.add(e.detail.id);
      this.checkProgress();
    });

    window.addEventListener('weapon-skill-unlocked', () => {
      this.stats.skillsUnlocked++;
      this.checkProgress();
    });

    window.addEventListener('combat-hit', () => { this.stats.hits++; this.checkProgress(); });

    window.addEventListener('poi-interact', (e) => {
      if (e.detail.id) this.stats.discoveries.add(e.detail.id);
      const q = this.current;
      const id = e.detail.id;
      if (q?.type === 'interact' && id === q.targetId
        && !q.requireAllFragments && !q.requireAscension && !q.requireTrueEnd && !q.requireInfinity) {
        this.advance();
        return;
      }
      if (q?.type === 'interact' && q.requireAllFragments && id === q.targetId) {
        if (['fantasy-ring', 'magic-castle', 'space-tesseract'].every((id) => this.stats.discoveries.has(id))) this.advance();
        return;
      }
      if (q?.type === 'interact' && q.requireAscension && e.detail.id === q.targetId) {
        if (this.canAscend()) this.advance();
        return;
      }
      if (q?.type === 'interact' && q.requireTrueEnd && e.detail.id === q.targetId) {
        if (this.canTrueEnd()) this.advance();
        return;
      }
      if (q?.type === 'interact' && q.requireInfinity && e.detail.id === q.targetId) {
        if (this.canInfinity()) this.advance();
        return;
      }
      this.checkProgress();
    });

    window.addEventListener('chest-opened', () => {
      this.stats.chestsOpened++;
      this.checkProgress();
    });

    window.addEventListener('npc-talk', (e) => {
      this.stats.npcTalked.add(e.detail.id);
      this.checkProgress();
    });

    window.addEventListener('stats-changed', (e) => {
      if (this.current?.type === 'level' && e.detail.level >= this.current.target) this.advance();
      if (this.current?.type === 'mind' && (e.detail.mind ?? 0) >= this.current.target) this.advance();
    });
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

  isQuestObjectiveDone(q) {
    if (!q) return false;
    switch (q.type) {
      case 'interact':
        if (q.requireAllFragments || q.requireAscension || q.requireTrueEnd || q.requireInfinity) return false;
        return this.stats.discoveries.has(q.targetId);
      case 'hits': return this.stats.hits >= q.target;
      case 'kills': return (this.stats.kills[q.enemyType] || 0) >= q.target;
      case 'discovery': return this.stats.discoveries.has(q.targetId);
      case 'boss': return this.stats.bossDefeated;
      case 'boss2': return this.stats.boss2Defeated;
      case 'boss3': return this.stats.boss3Defeated;
      case 'spells': return this.stats.spellCasts >= q.target;
      case 'dungeon': return this.stats.dungeonsCleared.has(q.dungeonId);
      case 'mind': return false;
      case 'charged': return this.stats.chargedCasts >= q.target;
      case 'voidboss': return this.stats.voidBossDefeated;
      case 'skills-unlocked': return this.stats.skillsUnlocked >= q.target;
      case 'chaosboss': return this.stats.chaosBossDefeated;
      case 'dungeon-rerun': return this.stats.dungeonRerun;
      case 'chests': return this.stats.chestsOpened >= q.target;
      case 'npc': return this.stats.npcTalked.has(q.targetId);
      case 'level': return false;
      default: return false;
    }
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

  canAscend() {
    return this.stats.boss3Defeated
      && ['ruin-crypt', 'forbidden-library', 'five-dim-rift'].every((id) => this.stats.dungeonsCleared.has(id));
  }

  canTrueEnd() {
    return this.stats.voidBossDefeated
      && ['fantasy-ring', 'magic-castle', 'space-tesseract', 'void-rift'].every((id) => this.stats.discoveries.has(id));
  }

  canInfinity() {
    return this.stats.chaosBossDefeated && this.stats.skillsUnlocked >= 3;
  }

  checkProgress() {
    if (this.completed) return;
    const q = this.current;
    if (!q) return;

    let done = false;
    switch (q.type) {
      case 'interact':
        if (q.requireAllFragments || q.requireAscension || q.requireTrueEnd || q.requireInfinity) {
          done = false;
        } else {
          done = this.stats.discoveries.has(q.targetId);
        }
        break;
      case 'hits':
        done = this.stats.hits >= q.target;
        break;
      case 'kills':
        done = (this.stats.kills[q.enemyType] || 0) >= q.target;
        break;
      case 'discovery':
        done = this.stats.discoveries.has(q.targetId);
        break;
      case 'boss':
        done = this.stats.bossDefeated;
        break;
      case 'boss2':
        done = this.stats.boss2Defeated;
        break;
      case 'boss3':
        done = this.stats.boss3Defeated;
        break;
      case 'spells':
        done = this.stats.spellCasts >= q.target;
        break;
      case 'dungeon':
        done = this.stats.dungeonsCleared.has(q.dungeonId);
        break;
      case 'mind':
        done = false;
        break;
      case 'charged':
        done = this.stats.chargedCasts >= q.target;
        break;
      case 'voidboss':
        done = this.stats.voidBossDefeated;
        break;
      case 'skills-unlocked':
        done = this.stats.skillsUnlocked >= q.target;
        break;
      case 'chaosboss':
        done = this.stats.chaosBossDefeated;
        break;
      case 'dungeon-rerun':
        done = this.stats.dungeonRerun;
        break;
      case 'chests':
        done = this.stats.chestsOpened >= q.target;
        break;
      case 'npc':
        done = this.stats.npcTalked.has(q.targetId);
        break;
      case 'level':
        done = false;
        break;
      default:
        break;
    }
    if (done) this.advance();
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
      case 'boss': return this.stats.bossDefeated ? '完成' : '进入灰白森林 Boss 红圈 (X≈-250 Z≈-35)';
      case 'boss2': return this.stats.boss2Defeated ? '完成' : '魔法 Boss 红圈 (X≈5 Z≈-220)';
      case 'boss3': return this.stats.boss3Defeated ? '完成' : '星际 Boss 红圈 (X≈235 Z≈155)';
      case 'spells': return `${Math.min(this.stats.spellCasts, q.target)} / ${q.target} 次施法`;
      case 'dungeon': return this.stats.dungeonsCleared.has(q.dungeonId) ? '完成' : '寻找地下城入口（紫环）';
      case 'mind': return '营火升级「心智」至 2';
      case 'charged': return `${Math.min(this.stats.chargedCasts, q.target)} / ${q.target} 蓄力施法`;
      case 'voidboss': return this.stats.voidBossDefeated ? '完成' : '时线 Boss 红圈 (Z≈235 · Ch4+)';
      case 'skills-unlocked': return `${Math.min(this.stats.skillsUnlocked, q.target)} / ${q.target} 技能`;
      case 'chaosboss': return this.stats.chaosBossDefeated ? '完成' : '混沌 Boss 红圈 (X≈-200 Z≈285 · Ch5+)';
      case 'dungeon-rerun': return this.stats.dungeonRerun ? '完成' : '再次进入地下城（Chapter 5 后）';
      case 'chests': return `${this.stats.chestsOpened} / ${q.target} 宝箱`;
      case 'npc': return this.stats.npcTalked.has(q.targetId) ? '完成' : '寻找 NPC（绿点）';
      case 'level': return '在营火休息升级至 Lv.5';
      case 'discovery': return this.stats.discoveries.has(q.targetId) ? '已完成' : `寻找 ${TARGET_WAYPOINTS[q.targetId]?.label ?? '标记点'}`;
      case 'interact':
        if (this.stats.discoveries.has(q.targetId) && !q.requireAllFragments && !q.requireAscension && !q.requireTrueEnd && !q.requireInfinity) {
          return '已完成触摸 — 若未跳转请点右下角「同步任务」';
        }
        return q.desc;
      default: return q.desc;
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

    if (q.type === 'boss' && !this.stats.bossDefeated) return { ...MAP_BOSSES[0], label: '影界守护者 Boss 区' };
    if (q.type === 'boss2' && !this.stats.boss2Defeated) return { ...MAP_BOSSES[1], label: '大奥术师 Boss 区' };
    if (q.type === 'boss3' && !this.stats.boss3Defeated) return { ...MAP_BOSSES[2], label: '奇点领主 Boss 区' };
    if (q.type === 'voidboss' && !this.stats.voidBossDefeated) return { ...MAP_BOSSES[3], label: '时线执政官 Boss 区' };
    if (q.type === 'chaosboss' && !this.stats.chaosBossDefeated) return { ...MAP_BOSSES[4], label: '混沌领主 Boss 区' };

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
    if (q.type === 'boss' || q.type === 'boss2' || q.type === 'boss3' || q.type === 'voidboss' || q.type === 'chaosboss') {
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
