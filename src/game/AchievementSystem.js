import { mergeAchievements } from './AchievementExtras.js';

export const ACHIEVEMENTS = mergeAchievements([
  { id: 'first-blood', title: '初阵', desc: '首次击杀敌人', check: (s) => s.kills >= 1 },
  { id: 'parry-master', title: '弹反大师', desc: '成功弹反 5 次', check: (s) => s.parries >= 5 },
  { id: 'boss-trio', title: '三界审判', desc: '击败全部 3 主线 Boss', check: (s) => s.boss1 && s.boss2 && s.boss3 },
  { id: 'dungeon-clear', title: '地下城猎人', desc: '清空 3 座地下城', check: (s) => s.dungeons >= 3 },
  { id: 'charged-10', title: '蓄力宗师', desc: '蓄力施法 10 次', check: (s) => s.charged >= 10 },
  { id: 'void-slayer', title: '时线斩断者', desc: '击败时线执政官', check: (s) => s.voidBoss },
  { id: 'chaos-lord', title: '裂隙斩断者', desc: '击败混沌裂隙领主', check: (s) => s.chaosBoss },
  { id: 'skill-master', title: '流派大师', desc: '解锁 4 个武器技能', check: (s) => s.skills >= 4 },
  { id: 'combo-6', title: '连击修罗', desc: '达成 6 连击终结', check: (s) => s.comboFinishers >= 1 },
  { id: 'explorer', title: '位面学者', desc: '发现 12 个探索点', check: (s) => s.discoveries >= 12 },
  { id: 'lore-scholar', title: '碎片学者', desc: '收集 6 条迷宫叙事碎片', check: (s) => s.loreFragments >= 6 },
  { id: 'journal-keeper', title: '纪事官', desc: '日志记录 20 条', check: (s) => s.journalEntries >= 20 },
]);

export class AchievementSystem {
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
    window.addEventListener('enemy-defeated', (e) => {
      if (e.detail.type !== 'dummy') this.stats.kills++;
      if (e.detail.bossId === 'shadow-warden') this.stats.boss1 = true;
      if (e.detail.bossId === 'archmagus') this.stats.boss2 = true;
      if (e.detail.bossId === 'singularity-herald') this.stats.boss3 = true;
      if (e.detail.bossId === 'void-chronarch') this.stats.voidBoss = true;
      if (e.detail.bossId === 'chaos-overlord') this.stats.chaosBoss = true;
      this.checkAll();
    });
    window.addEventListener('discovery', () => {
      this.stats.discoveries++;
      this.checkAll();
    });
    window.addEventListener('dungeon-cleared', () => {
      this.stats.dungeons++;
      this.checkAll();
    });
    window.addEventListener('spell-cast', (e) => {
      if (e.detail.charged) this.stats.charged++;
      this.checkAll();
    });
    window.addEventListener('combo-finisher', () => {
      this.stats.comboFinishers++;
      this.checkAll();
    });
    window.addEventListener('weapon-skill-unlocked', () => {
      this.stats.skills++;
      this.checkAll();
    });
    window.addEventListener('parry-success', () => {
      this.stats.parries++;
      this.checkAll();
    });
    window.addEventListener('journal-entry', (e) => {
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
    this.dialog.toast(`🏆 成就：${a.title}`);
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
