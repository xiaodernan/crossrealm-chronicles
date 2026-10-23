import { SKILL_BRANCHES, nodesOf, skillById, skillBranchText } from '../content/skillTrees.js';
import { bossNameKeyOf } from '../content/bossRoster.js';
import { refreshKeyText, keyText } from '../content/keyHints.js';
import { getLanguage, t } from '../engine/i18n.js';

/**
 * [J] 流派 Tab — 三条技能树一览。
 *
 * 流派清单与营火面板同源（`SKILL_BRANCHES`）：修前这里手抄了两行
 * `renderBranch('sword', '⚔ 位面长剑')` / `renderBranch('staff', '✦ 奥术法杖')`，
 * 于是"加第三条流派"在日志里少一整棵树而不会报错。故事文本也不再读
 * `STORY_SKILL_META` —— 那份名单已并回节点行自己的 `lore`。
 */
export class WeaponSkillJournalTab {
  constructor(game) {
    this.game = game;
  }

  render(panelEl) {
    const ws = this.game.weaponSkills;
    const unlocked = ws?.unlocked ?? new Set();
    const points = ws?.skillPoints ?? 0;

    const renderBranch = (branch) => {
      const skills = nodesOf(branch.id).filter((s) => !s.grant);
      const cards = skills.map((s) => {
        const ok = unlocked.has(s.id);
        const lore = skillById(s.id)?.lore ? t(skillById(s.id).lore) : null;
        return `<div class="sk-card${ok ? ' sk-on' : ''}">
          <div class="sk-name">${t(s.name)}</div>
          <div class="sk-desc">${t(s.desc)}</div>
          ${lore ? `<span class="sk-lore">${ok ? lore : '—'}</span>` : ''}
          <div class="sk-cost">${ok ? t('achievement_unlocked_label') : `${t('weapon_skill_cost_fmt', { cost: s.cost })}${s.reqs?.length ? t('weapon_skill_need_prereq') : ''}`}</div>
        </div>`;
      }).join('');
      return `<div class="sk-branch"><h3>${skillBranchText(branch, getLanguage()).name}</h3><div class="sk-grid">${cards}</div></div>`;
    };

    const renderNarrative = () => {
      const narrative = SKILL_BRANCHES.flatMap((b) => nodesOf(b.id)).filter((s) => s.grant);
      const cards = narrative.map((s) => {
        const ok = unlocked.has(s.id);
        const lore = skillById(s.id)?.lore ? t(skillById(s.id).lore) : null;
        const cond = s.grant ? (s.grant.boss ? t('weapon_skill_need_boss_fmt', { boss: t(bossNameKeyOf(s.grant.boss)) }) : t('weapon_skill_need_chapter_fmt', { chapter: s.grant.chapter })) : '';
        return `<div class="sk-card${ok ? ' sk-on' : ''} sk-narrative">
          <div class="sk-name">${t(s.name)} <span class="sk-tag">${t('weapon_skill_tag_narrative')}</span></div>
          <div class="sk-desc">${t(s.desc)}</div>
          ${lore ? `<span class="sk-lore">${ok ? lore : '—'}</span>` : ''}
          <div class="sk-cost">${ok ? t('achievement_unlocked_label') : cond}</div>
        </div>`;
      }).join('');
      return `<div class="sk-branch"><h3>${t('weapon_skill_narrative_title')}</h3><div class="sk-grid">${cards}</div></div>`;
    };

    panelEl.innerHTML = `
      <h2>${keyText(t('journal_tab_weapon_skills'))}</h2>
      <p class="sk-stats">${t('weapon_skill_stats_fmt', { points, unlocked: unlocked.size })}</p>
      ${SKILL_BRANCHES.map(renderBranch).join('')}
      ${renderNarrative()}
      <p class="hint">${keyText(t('weapon_skill_narrative_hint'))}</p>
    `;

    refreshKeyText(panelEl);
  }
}
