/**
 * 武器技能树 —— 三条流派的**解锁状态与技能点账本**（W-B6 切片1）。
 *
 * 节点数据（有哪些流派、每一格花多少点、效果是什么、前置是谁）住在
 * `content/skillTrees.js`；这个类只管状态：谁解锁了、还剩多少点、存读档。
 *
 * 修前数据与本类混在一个文件里，于是面板、日志页签、存档、成就想读"有哪些技能"
 * 都得反向依赖游戏装配点 —— 这正是 W-B1 切片1 立 `content/` 的那条规矩。
 */
import { SKILL_BRANCH_IDS, SKILL_TREES, isGrant, nodesOf, skillById } from '../content/skillTrees.js';
import { t } from '../engine/i18n.js';
import { bossDefeated, getStoryLockReason } from './StoryWeaponSkills.js';

/**
 * 兼容出口：修前这张表住在**本文件**里，读取方 import 的就是这个名字。
 * 现在数据在 `content/skillTrees.js`，这里同名再导出 —— 不为了让"数据搬了家"
 * 变成一次全仓改名而留。**新代码请直接读 `content/skillTrees.js`。**
 */
export const WEAPON_SKILLS = SKILL_TREES;

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

  /**
   * 叙事技的门槛判定。条件只有两种（Boss 击破 / 章节），与 `content/skillTrees.js`
   * 的 `grant` 形状一一对应 —— 多一种形状就要在这里多一个分支，所以不预造第三种。
   * Boss 那一格问 `bossDefeated`（它读 `BOSS_STAT_KEYS` 那份唯一真源）。
   */
  _checkNarrativeCondition(cond) {
    if (!cond) return false;
    if (cond.boss) return bossDefeated(this.game, cond.boss);
    if (cond.chapter) return (this.game?.quests?.chapter ?? 1) >= cond.chapter;
    return false;
  }

  /** 叙事技：条件一满足就白送（名字进日志、发一条事件）。遍历的是流派清单本身 */
  tryNarrativeUnlocks(game) {
    this.game = game ?? this.game;
    let any = false;
    for (const branch of SKILL_BRANCH_IDS) {
      for (const sk of nodesOf(branch)) {
        if (!isGrant(sk) || this.unlocked.has(sk.id)) continue;
        if (!this._checkNarrativeCondition(sk.grant)) continue;
        this.unlocked.add(sk.id);
        this.narrativeUnlocked.add(sk.id);
        this.dialog.toast(t('skill_narrative_unlocked', { title: t(sk.name) }));
        this.game?.storyJournal?.addSilent({
          id: `skill-${sk.id}`,
          category: 'quest',
          title: t('skill_journal_title', { title: t(sk.name) }),
          text: t(sk.lore ?? sk.desc),
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
    const l = skillById(skillId)?.lore;
    return l ? t(l) : '';
  }

  /**
   * 现在能不能加点。
   *
   * `reqs` 是**前置 id 数组**（空数组 = 根节点）。修前是单个 `req` 字符串，
   * 于是"两条支脉汇合"那种节点根本表达不出来（它正是技能树上最像"树"的那一格）；
   * 改成数组之后逐个问，缺哪一个都不行。
   */
  canUnlock(skill) {
    if (this.unlocked.has(skill.id)) return false;
    // 叙事技不花技能点，也不该出现在"可购买"这条路上（它走 tryNarrativeUnlocks）
    if (isGrant(skill)) return false;
    if (this.skillPoints < skill.cost) return false;
    for (const r of skill.reqs ?? []) if (!this.unlocked.has(r)) return false;
    if (this.getStoryLock(skill.id)) return false;
    return true;
  }

  unlock(skillId, branch) {
    const skill = nodesOf(branch).find((s) => s.id === skillId);
    if (!skill || !this.canUnlock(skill)) return false;
    this.skillPoints -= skill.cost;
    this.unlocked.add(skill.id);
    const lore = this.getStoryLore(skill.id);
    this.dialog.toast(t('skill_unlocked', { title: t(skill.name) }));
    if (lore) {
      this.game?.storyJournal?.addSilent({
        id: `skill-unlock-${skill.id}`,
        category: 'quest',
        title: t(skill.name),
        text: lore,
        chapter: this.game?.quests?.chapter ?? 1,
      });
    }
    window.dispatchEvent(new CustomEvent('weapon-skill-unlocked', { detail: skill }));
    window.dispatchEvent(new CustomEvent('skill-points-changed', { detail: { points: this.skillPoints } }));
    return true;
  }

  /**
   * 这一流的全部节点（含叙事技）。叙事技就地标成 `narrative: true` 且 `cost: 0` ——
   * 面板据此把它画成"击败 Boss 解锁"而不是"可购买"。
   */
  getAllSkills(branch) {
    return nodesOf(branch).map((s) => (isGrant(s) ? { ...s, narrative: true, cost: 0 } : s));
  }

  /** 已解锁节点折算出的加成总和（`effect` 的每一格都有人读，见 SKILL_EFFECT_CONSUMERS） */
  getModifiers() {
    const m = { melee: 0, combo: 0, riposte: 0, finisher: 0, spell: 0, charge: 0, mana: 0, transform: 0, skill: 0 };
    for (const branch of SKILL_BRANCH_IDS) {
      for (const s of nodesOf(branch)) {
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
