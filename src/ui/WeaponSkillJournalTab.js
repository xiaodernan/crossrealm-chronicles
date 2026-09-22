import { WEAPON_SKILLS } from '../game/WeaponSkillTree.js';
import { STORY_SKILL_META } from '../game/StoryWeaponSkills.js';

/** [J] 流派 Tab — 剑/杖技能树一览 */
export class WeaponSkillJournalTab {
  constructor(game) {
    this.game = game;
  }

  render(panelEl) {
    const ws = this.game.weaponSkills;
    const unlocked = ws?.unlocked ?? new Set();
    const points = ws?.skillPoints ?? 0;

    const renderBranch = (branch, title) => {
      const skills = WEAPON_SKILLS[branch] ?? [];
      const cards = skills.map((s) => {
        const ok = unlocked.has(s.id);
        const story = STORY_SKILL_META[s.id];
        return `<div class="sk-card${ok ? ' sk-on' : ''}">
          <div class="sk-name">${s.name}</div>
          <div class="sk-desc">${s.desc}</div>
          ${story?.lore ? `<span class="sk-lore">${ok ? story.lore : '—'}</span>` : ''}
          <div class="sk-cost">${ok ? '已解锁' : `${s.cost} 点${s.req ? ' · 需前置' : ''}`}</div>
        </div>`;
      }).join('');
      return `<div class="sk-branch"><h3>${title}</h3><div class="sk-grid">${cards}</div></div>`;
    };

    panelEl.innerHTML = `
      <h2>流派技能 · J 关闭</h2>
      <p class="sk-stats">可用技能点 ${points} · 已解锁 ${unlocked.size} · 营火升级面板可加点</p>
      ${renderBranch('sword', '⚔ 位面长剑')}
      ${renderBranch('staff', '✦ 奥术法杖')}
      <p class="hint">剧情节点会自动解锁叙事技 · X 切换剑/杖影响加成</p>
    `;
  }
}
