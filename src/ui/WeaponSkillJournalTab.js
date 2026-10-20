import { SKILL_BRANCHES, nodesOf, skillById, skillBranchText } from '../content/skillTrees.js';
import { refreshKeyText } from '../content/keyHints.js';
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
          <div class="sk-name">${s.name}</div>
          <div class="sk-desc">${s.desc}</div>
          ${lore ? `<span class="sk-lore">${ok ? lore : '—'}</span>` : ''}
          <div class="sk-cost">${ok ? '已解锁' : `${s.cost} 点${s.reqs?.length ? ' · 需前置' : ''}`}</div>
        </div>`;
      }).join('');
      return `<div class="sk-branch"><h3>${skillBranchText(branch, getLanguage()).name}</h3><div class="sk-grid">${cards}</div></div>`;
    };

    const renderNarrative = () => {
      const narrative = SKILL_BRANCHES.flatMap((b) => nodesOf(b.id)).filter((s) => s.grant);
      const cards = narrative.map((s) => {
        const ok = unlocked.has(s.id);
        const lore = skillById(s.id)?.lore ? t(skillById(s.id).lore) : null;
        const cond = s.grant ? (s.grant.boss ? `需击败 ${s.grant.boss}` : `需 Chapter ${s.grant.chapter}`) : '';
        return `<div class="sk-card${ok ? ' sk-on' : ''} sk-narrative">
          <div class="sk-name">${s.name} <span class="sk-tag">叙事</span></div>
          <div class="sk-desc">${s.desc}</div>
          ${lore ? `<span class="sk-lore">${ok ? lore : '—'}</span>` : ''}
          <div class="sk-cost">${ok ? '已解锁' : cond}</div>
        </div>`;
      }).join('');
      return `<div class="sk-branch"><h3>叙事技能 (击败 Boss / 推进章节自动解锁)</h3><div class="sk-grid">${cards}</div></div>`;
    };

    panelEl.innerHTML = `
      <h2 data-ktext="流派技能 · {journal} 关闭"></h2>
      <p class="sk-stats">可用技能点 ${points} · 已解锁 ${unlocked.size} · 营火升级面板可加点</p>
      ${SKILL_BRANCHES.map(renderBranch).join('')}
      ${renderNarrative()}
      <p class="hint" data-ktext="剧情节点会自动解锁叙事技 · {swapWeapon} 切换剑/杖影响加成"></p>
    `;

    refreshKeyText(panelEl);
  }
}
