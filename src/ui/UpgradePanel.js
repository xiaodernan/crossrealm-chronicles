import { WEAPON_SKILLS } from '../game/WeaponSkillTree.js';
import { focusFirstItem } from './FocusNav.js';

export class UpgradePanel {
  constructor(game) {
    this.game = game;
    this.panel = document.getElementById('upgrade-panel');
    this.open = false;
    this.skillTab = 'stats';
    document.getElementById('upgrade-close')?.addEventListener('click', () => this.hide());
    document.getElementById('tab-stats')?.addEventListener('click', () => { this.skillTab = 'stats'; this.refresh(); });
    document.getElementById('tab-skills')?.addEventListener('click', () => { this.skillTab = 'skills'; this.refresh(); });
    document.getElementById('tab-lore')?.addEventListener('click', () => { this.skillTab = 'lore'; this.refresh(); });
    this.panel?.querySelectorAll('[data-stat]').forEach((btn) => {
      btn.addEventListener('click', () => this.upgrade(btn.dataset.stat));
    });
  }

  show(restName) {
    this.open = true;
    this.panel.classList.remove('hidden');
    document.exitPointerLock?.();
    this.game.weaponSkills?.tryNarrativeUnlocks?.(this.game);
    this.refresh(restName);
    // 落焦第一格（切片24 / B55）：这一层今天登记了 `nav`，↑↓ 与手柄十字键走进来要有落点；
    // A 那一下仍然问浏览器（`activateFocused` 点当前聚焦那一格），这里不再另开第二个激活口
    focusFirstItem(this.panel);
  }

  hide() {
    this.open = false;
    this.panel.classList.add('hidden');
  }

  refresh(restName) {
    const s = this.game.stats;
    const ws = this.game.weaponSkills;
    document.getElementById('upgrade-rest-name').textContent = restName ?? '营火';
    document.getElementById('upgrade-souls').textContent = s.souls;
    document.getElementById('upgrade-cost').textContent = s.levelUpCost();
    document.getElementById('upgrade-level').textContent = s.level;
    document.getElementById('stat-vigor').textContent = s.vigor;
    document.getElementById('stat-endurance').textContent = s.endurance;
    document.getElementById('stat-strength').textContent = s.strength;
    document.getElementById('stat-arcane').textContent = s.arcane;
    document.getElementById('stat-mind').textContent = s.mind;
    document.getElementById('stat-hp-preview').textContent = s.maxHp;
    document.getElementById('stat-st-preview').textContent = s.maxStamina;
    document.getElementById('skill-points-display').textContent = ws?.skillPoints ?? 0;

    document.getElementById('upgrade-stats-section')?.classList.toggle('hidden', this.skillTab !== 'stats');
    document.getElementById('upgrade-skills-section')?.classList.toggle('hidden', this.skillTab !== 'skills');
    document.getElementById('upgrade-lore-section')?.classList.toggle('hidden', this.skillTab !== 'lore');

    if (this.skillTab === 'skills' && ws) {
      this.renderSkills('sword-skills', 'sword', ws);
      this.renderSkills('staff-skills', 'staff', ws);
    }
    if (this.skillTab === 'lore' && ws) {
      this.renderLore(ws);
    }
  }

  renderSkills(containerId, branch, ws) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = ws.getAllSkills(branch).map((sk) => {
      const owned = ws.unlocked.has(sk.id);
      const can = sk.narrative ? false : ws.canUnlock(sk);
      const lock = !owned && !sk.narrative ? ws.getStoryLock(sk.id) : null;
      const narrative = sk.narrative;
      const tag = narrative ? (owned ? '叙事✓' : '击败 Boss 解锁') : (sk.cost ? `${sk.cost}点` : '');
      return `<button type="button" class="skill-btn ${owned ? 'owned' : ''} ${narrative ? 'narrative' : ''}" data-id="${sk.id}" data-branch="${branch}" ${owned || !can || narrative ? 'disabled' : ''}>
        ${sk.name} ${tag ? `(${tag})` : ''}<br><span>${sk.desc}</span>
        ${lock ? `<em class="skill-lock">${lock}</em>` : ''}
        ${owned && ws.getStoryLore(sk.id) ? `<em class="skill-lore">${ws.getStoryLore(sk.id)}</em>` : ''}
      </button>`;
    }).join('');
    el.querySelectorAll('.skill-btn:not([disabled])').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (ws.unlock(btn.dataset.id, btn.dataset.branch)) this.refresh();
      });
    });
  }

  renderLore(ws) {
    const el = document.getElementById('upgrade-lore-body');
    if (!el) return;
    const ch = this.game.quests.chapter ?? 1;
    const fr = this.game.storyJournal?.getCounts?.().fragment ?? 0;
    const narrative = [...ws.getAllSkills('sword'), ...ws.getAllSkills('staff')].filter((s) => s.narrative);
    const ownedN = narrative.filter((s) => ws.unlocked.has(s.id));
    el.innerHTML = `
      <p class="lore-intro">营火不仅是休息点 — 位面行者的剑与杖在此与<strong>剧情</strong>共鸣。击败 Boss、推进章节、收集叙事碎片，都会解锁新技能。</p>
      <p>当前 Chapter ${ch} · 叙事碎片 ${fr} 条 · 叙事技能 ${ownedN.length}/${narrative.length}</p>
      <ul class="lore-skill-list">
        ${narrative.map((s) => `<li class="${ws.unlocked.has(s.id) ? 'owned' : 'locked'}">
          <strong>${s.name}</strong> — ${s.lore ?? s.desc}
          ${ws.unlocked.has(s.id) ? '' : `<br><span class="hint">${s.unlock.boss ? '需击败 Boss' : `需 Chapter ${s.unlock.chapter}`}</span>`}
        </li>`).join('')}
      </ul>
    `;
  }

  upgrade(stat) {
    if (this.game.stats.levelUp(stat)) {
      this.game.stats.applyToCombat(this.game.player.combat);
      this.game.spells?.syncMana();
      this.game.player.combat.hp = this.game.stats.maxHp;
      this.game.player.combat.stamina = this.game.stats.maxStamina;
      this.game.weaponSkills?.addPoint(1);
      this.game.audio.levelUp();
      this.game.dialog.toast(`升级成功：${stat} · 获得 1 技能点`);
      this.refresh();
    } else {
      this.game.dialog.toast('位面之魂不足');
    }
  }
}
