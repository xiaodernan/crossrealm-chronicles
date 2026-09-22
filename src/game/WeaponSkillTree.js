/** 武器技能树 — 剑/杖双流派，营火消耗技能点 + 剧情门控 + 叙事自动解锁 */
import { STORY_SKILL_META, NARRATIVE_SKILLS, getStoryLockReason } from './StoryWeaponSkills.js';

export const WEAPON_SKILLS = {
  sword: [
    { id: 's-blade', name: '锋刃精通 I', cost: 1, desc: '近战 +8%', effect: { melee: 0.08 } },
    { id: 's-combo', name: '连击延伸', cost: 2, desc: '连击倍率 +15%', effect: { combo: 0.15 }, req: 's-blade' },
    { id: 's-riposte', name: '处决强化', cost: 2, desc: '处决伤害 +40%', effect: { riposte: 0.4 }, req: 's-blade' },
    { id: 's-finisher', name: '修罗终结', cost: 3, desc: '终结技范围 +50%', effect: { finisher: 0.5 }, req: 's-combo' },
  ],
  staff: [
    { id: 'm-arcane', name: '奥术共鸣 I', cost: 1, desc: '法术 +10%', effect: { spell: 0.1 } },
    { id: 'm-charge', name: '蓄力增幅', cost: 2, desc: '蓄力伤害 +20%', effect: { charge: 0.2 }, req: 'm-arcane' },
    { id: 'm-mana', name: '法力泉涌', cost: 2, desc: '法力上限 +25', effect: { mana: 25 }, req: 'm-arcane' },
    { id: 'm-transform', name: '化身延长', cost: 3, desc: '大圣化身 +4 秒', effect: { transform: 4 }, req: 'm-charge' },
  ],
};

export class WeaponSkillTree {
  constructor(stats, dialog, game = null) {
    this.stats = stats;
    this.dialog = dialog;
    this.game = game;
    this.unlocked = new Set();
    this.skillPoints = 0;
    this.narrativeUnlocked = new Set();
  }

  setGame(game) {
    this.game = game;
  }

  addPoint(n = 1) {
    this.skillPoints += n;
    window.dispatchEvent(new CustomEvent('skill-points-changed', { detail: { points: this.skillPoints } }));
  }

  _bossDefeated(bossId) {
    const s = this.game?.quests?.stats;
    if (!s) return false;
    const map = {
      'shadow-warden': s.bossDefeated,
      archmagus: s.boss2Defeated,
      'singularity-herald': s.boss3Defeated,
      'void-chronarch': s.voidBossDefeated,
      'chaos-overlord': s.chaosBossDefeated,
    };
    return !!map[bossId];
  }

  _checkNarrativeCondition(unlock) {
    if (unlock.boss) return this._bossDefeated(unlock.boss);
    if (unlock.chapter) return (this.game?.quests?.chapter ?? 1) >= unlock.chapter;
    return false;
  }

  tryNarrativeUnlocks(game) {
    this.game = game ?? this.game;
    let any = false;
    for (const branch of ['sword', 'staff']) {
      for (const sk of NARRATIVE_SKILLS[branch]) {
        if (this.unlocked.has(sk.id)) continue;
        if (!this._checkNarrativeCondition(sk.unlock)) continue;
        this.unlocked.add(sk.id);
        this.narrativeUnlocked.add(sk.id);
        this.dialog.toast(`📜 叙事技能：${sk.name}`);
        this.game?.storyJournal?.addSilent({
          id: `skill-${sk.id}`,
          category: 'quest',
          title: `技能 · ${sk.name}`,
          text: sk.lore,
          chapter: this.game?.quests?.chapter ?? 1,
        });
        window.dispatchEvent(new CustomEvent('weapon-skill-unlocked', { detail: sk }));
        any = true;
      }
    }
    if (any) window.dispatchEvent(new CustomEvent('skill-points-changed', { detail: { points: this.skillPoints } }));
    return any;
  }

  getStoryLock(skillId) {
    if (!this.game) return null;
    return getStoryLockReason(this.game, skillId);
  }

  getStoryLore(skillId) {
    return STORY_SKILL_META[skillId]?.lore ?? '';
  }

  canUnlock(skill) {
    if (this.unlocked.has(skill.id)) return false;
    if (this.skillPoints < skill.cost) return false;
    if (skill.req && !this.unlocked.has(skill.req)) return false;
    if (this.getStoryLock(skill.id)) return false;
    return true;
  }

  unlock(skillId, branch) {
    const list = WEAPON_SKILLS[branch] ?? [];
    const skill = list.find((s) => s.id === skillId);
    if (!skill || !this.canUnlock(skill)) return false;
    this.skillPoints -= skill.cost;
    this.unlocked.add(skill.id);
    const lore = this.getStoryLore(skill.id);
    this.dialog.toast(`技能解锁：${skill.name}`);
    if (lore) {
      this.game?.storyJournal?.addSilent({
        id: `skill-unlock-${skill.id}`,
        category: 'quest',
        title: skill.name,
        text: lore,
        chapter: this.game?.quests?.chapter ?? 1,
      });
    }
    window.dispatchEvent(new CustomEvent('weapon-skill-unlocked', { detail: skill }));
    window.dispatchEvent(new CustomEvent('skill-points-changed', { detail: { points: this.skillPoints } }));
    return true;
  }

  getAllSkills(branch) {
    const base = WEAPON_SKILLS[branch] ?? [];
    const narrative = (NARRATIVE_SKILLS[branch] ?? []).map((s) => ({ ...s, narrative: true, cost: 0 }));
    return [...base, ...narrative];
  }

  getModifiers() {
    const m = { melee: 0, combo: 0, riposte: 0, finisher: 0, spell: 0, charge: 0, mana: 0, transform: 0, skill: 0 };
    for (const branch of Object.values(WEAPON_SKILLS)) {
      for (const s of branch) {
        if (!this.unlocked.has(s.id)) continue;
        for (const [k, v] of Object.entries(s.effect)) m[k] = (m[k] ?? 0) + v;
      }
    }
    for (const branch of Object.values(NARRATIVE_SKILLS)) {
      for (const s of branch) {
        if (!this.unlocked.has(s.id)) continue;
        for (const [k, v] of Object.entries(s.effect)) m[k] = (m[k] ?? 0) + v;
      }
    }
    return m;
  }

  toJSON() {
    return { unlocked: [...this.unlocked], skillPoints: this.skillPoints, narrativeUnlocked: [...this.narrativeUnlocked] };
  }

  fromJSON(data) {
    if (!data) return;
    this.unlocked = new Set(data.unlocked ?? []);
    this.skillPoints = data.skillPoints ?? 0;
    this.narrativeUnlocked = new Set(data.narrativeUnlocked ?? []);
  }
}
