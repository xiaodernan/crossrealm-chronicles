import { ALL_ACHIEVEMENTS_EXTRA } from '../content/achievements.js';

import { on, offAll } from '../engine/EventBus.js';
import { t } from '../engine/i18n.js';

const GAME_ACHIEVEMENTSYSTEM = 'game/AchievementSystem';
const achieveOn = (name, handler) => on(name, handler, GAME_ACHIEVEMENTSYSTEM);

/** 扩写成就追加在主表之后（W-B2：条目本体在 content/achievements.js） */
const mergeAchievements = (base) => [...base, ...ALL_ACHIEVEMENTS_EXTRA];

export const ACHIEVEMENTS = mergeAchievements([
  { id: 'first-blood', title: 'ach_first_blood_title', desc: 'ach_first_blood_desc', check: (s) => s.kills >= 1 },
  { id: 'parry-master', title: 'ach_parry_master_title', desc: 'ach_parry_master_desc', check: (s) => s.parries >= 5 },
  { id: 'boss-trio', title: 'ach_boss_trio_title', desc: 'ach_boss_trio_desc', check: (s) => s.boss1 && s.boss2 && s.boss3 },
  { id: 'dungeon-clear', title: 'ach_dungeon_clear_title', desc: 'ach_dungeon_clear_desc', check: (s) => s.dungeons >= 3 },
  { id: 'charged-10', title: 'ach_charged_10_title', desc: 'ach_charged_10_desc', check: (s) => s.charged >= 10 },
  { id: 'void-slayer', title: 'ach_void_slayer_title', desc: 'ach_void_slayer_desc', check: (s) => s.voidBoss },
  { id: 'chaos-lord', title: 'ach_chaos_lord_title', desc: 'ach_chaos_lord_desc', check: (s) => s.chaosBoss },
  { id: 'skill-master', title: 'ach_skill_master_title', desc: 'ach_skill_master_desc', check: (s) => s.skills >= 4 },
  { id: 'combo-6', title: 'ach_combo_6_title', desc: 'ach_combo_6_desc', check: (s) => s.comboFinishers >= 1 },
  { id: 'explorer', title: 'ach_explorer_title', desc: 'ach_explorer_desc', check: (s) => s.discoveries >= 12 },
  { id: 'lore-scholar', title: 'ach_lore_scholar_title', desc: 'ach_lore_scholar_desc', check: (s) => s.loreFragments >= 6 },
  { id: 'journal-keeper', title: 'ach_journal_keeper_title', desc: 'ach_journal_keeper_desc', check: (s) => s.journalEntries >= 20 },
]);

export class AchievementSystem {
  /** 成就监听（八个）都挂在同一个所有权下，`dispose()` 一次结清（W-A1 迁移第六处） */
  dispose() {
    offAll(GAME_ACHIEVEMENTSYSTEM);
  }

  constructor(dialog) {
    this.dialog = dialog;
    this.unlocked = new Set();
    this.stats = {
      kills: 0,
      parries: 0,
      boss1: false,
      boss2: false,
      boss3: false,
      voidBoss: false,
      chaosBoss: false,
      skills: 0,
      dungeons: 0,
      charged: 0,
      comboFinishers: 0,
      discoveries: 0,
      loreFragments: 0,
      journalEntries: 0,
      styleBest: 0,
      cgPercent: 0,
      codexPercent: 0,
      rematches: 0,
      campfireZones: 0,
      photoMode: false,
      echoPercent: 0,
      echoWizard: 0,
      echoSpace: 0,
      echoUpside: 0,
      echoWestern: 0,
      echoGangster: 0,
      echoSciFi: 0,
      echoCyber: 0,
      echoSamurai: 0,
      echoCosmic: 0,
      echoStarport: 0,
    };
    this.setupListeners();
  }

  setupListeners() {
    achieveOn('enemy-defeated', (e) => {
      if (e.detail.type !== 'dummy') this.stats.kills++;
      if (e.detail.bossId === 'shadow-warden') this.stats.boss1 = true;
      if (e.detail.bossId === 'archmagus') this.stats.boss2 = true;
      if (e.detail.bossId === 'singularity-herald') this.stats.boss3 = true;
      if (e.detail.bossId === 'void-chronarch') this.stats.voidBoss = true;
      if (e.detail.bossId === 'chaos-overlord') this.stats.chaosBoss = true;
      this.checkAll();
    });
    achieveOn('discovery', () => {
      this.stats.discoveries++;
      this.checkAll();
    });
    achieveOn('dungeon-cleared', () => {
      this.stats.dungeons++;
      this.checkAll();
    });
    achieveOn('spell-cast', (e) => {
      if (e.detail.charged) this.stats.charged++;
      this.checkAll();
    });
    achieveOn('combo-finisher', () => {
      this.stats.comboFinishers++;
      this.checkAll();
    });
    achieveOn('weapon-skill-unlocked', () => {
      this.stats.skills++;
      this.checkAll();
    });
    achieveOn('parry-success', () => {
      this.stats.parries++;
      this.checkAll();
    });
    achieveOn('journal-entry', (e) => {
      if (e.detail.category === 'fragment') this.stats.loreFragments++;
      this.stats.journalEntries++;
      this.checkAll();
    });
  }

  checkAll() {
    for (const a of ACHIEVEMENTS) {
      if (this.unlocked.has(a.id)) continue;
      if (a.check(this.stats)) this.unlock(a);
    }
  }

  unlock(a) {
    this.unlocked.add(a.id);
    // W-D2 切片16l：成就的 title 是**文案键** —— 展开在播出的那一刻。
    this.dialog.toast(t('achievement_unlocked', { title: t(a.title) }));
    // W-D2 切片48：解锁这一刻写进 PlayerStats 的 achievementsUnlocked 桶（经 stats-changed
    // 镜像进任务账本）—— 技能树两族的成就锁因读的就是那一格，改前全仓零写入。
    this.game?.stats?.onAchievementUnlocked(a.id);
    window.dispatchEvent(new CustomEvent('achievement-unlocked', { detail: a }));
  }

  toJSON() {
    return { unlocked: [...this.unlocked], stats: this.stats };
  }

  fromJSON(data) {
    if (!data) return;
    this.unlocked = new Set(data.unlocked ?? []);
    Object.assign(this.stats, data.stats ?? {});
  }
}
