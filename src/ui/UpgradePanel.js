import { SKILL_BRANCHES, skillBranchText } from '../content/skillTrees.js';
import { GEAR_SLOTS, gearLabel, gearSlotName } from '../content/gear.js';
import { focusFirstItem } from './FocusNav.js';
import { t, getLanguage } from '../engine/i18n.js';

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
    document.getElementById('tab-gear')?.addEventListener('click', () => { this.skillTab = 'gear'; this.refresh(); });
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
    document.getElementById('upgrade-skill-points').textContent = ws?.skillPoints ?? 0;

    document.getElementById('upgrade-stats-section')?.classList.toggle('hidden', this.skillTab !== 'stats');
    document.getElementById('upgrade-skills-section')?.classList.toggle('hidden', this.skillTab !== 'skills');
    document.getElementById('upgrade-lore-section')?.classList.toggle('hidden', this.skillTab !== 'lore');
    document.getElementById('upgrade-gear-section')?.classList.toggle('hidden', this.skillTab !== 'gear');

    if (this.skillTab === 'gear') {
      this.renderGear();
    }

    if (this.skillTab === 'skills' && ws) {
      this._ensureSkillBranches();
      for (const b of SKILL_BRANCHES) this.renderSkills(b.id, ws);
    }
    if (this.skillTab === 'lore' && ws) {
      this.renderLore(ws);
    }
  }

  /**
   * 装备页签：两行槽 + 一格背包（W-B5 切片4）。
   *
   * 这一层只负责"把账显示出来、把一次点击翻译成一次调用"：能不能卸、卸下来去哪、穿上之后换下谁，
   * 全在 `PlayerStats.storeFromSlot` / `wearFromBag` 里 —— 面板不许自己摆弄 `stats.bag`
   * （静态门禁扫的就是这一条：第二本包账就是 B36 那一族，抄一遍就会与账本分家）。
   *
   * 显示也只问 `gearLabel`：槽名问 `GEAR_SLOT_NAMES`、件名问 `gearLabel`、格数问 `bagCapacity`，
   * 这一层不出现任何一个能被当成数据的字面量。
   */
  renderGear() {
    const s = this.game.stats;
    const slotsEl = document.getElementById('gear-slots');
    const bagEl = document.getElementById('gear-bag');
    const countEl = document.getElementById('gear-bag-count');
    if (!slotsEl || !bagEl) return;
    if (countEl) countEl.textContent = `${s.bagCount}/${s.bagCapacity}`;
    slotsEl.innerHTML = GEAR_SLOTS.map((slot) => {
      const inst = s.gear[slot];
      return `<div class="gear-row">
        <span class="gear-slot-name">${gearSlotName(slot, getLanguage())}</span>
        <span class="gear-item">${inst ? gearLabel(inst, getLanguage()) : t('gear_slot_empty')}</span>
        ${inst ? `<button type="button" class="gear-row-btn" data-store="${slot}"${s.bagFull ? ' disabled' : ''}>${s.bagFull ? t('gear_bag_full') : t('gear_unequip')}</button>` : ''}
      </div>`;
    }).join('');
    slotsEl.querySelectorAll('[data-store]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const previous = s.storeFromSlot(btn.dataset.store);
        if (!previous) {
          this.game.dialog.toast(t('gear_bag_full_cannot_unequip'));
          return;
        }
        this.game.dialog.toast(t('gear_unequip_to_bag', {
          item: gearLabel(previous, getLanguage()), n: s.bagCount, cap: s.bagCapacity,
        }));
        this.refresh();
      });
    });
    bagEl.innerHTML = s.bag.length
      ? s.bag.map((inst, i) => `<button type="button" class="skill-btn" data-wear="${i}">${gearLabel(inst, getLanguage())}<br><span>${t('gear_wear_this')}</span></button>`).join('')
      : `<p class="gear-bag-empty">${t('gear_bag_empty')}</p>`;
    bagEl.querySelectorAll('[data-wear]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const worn = s.wearFromBag(Number(btn.dataset.wear));
        if (worn) {
          this.game.dialog.toast(worn.replaced
            ? t('gear_equip_swapped_bag', { item: gearLabel(worn.instance, getLanguage()), old: gearLabel(worn.replaced, getLanguage()) })
            : t('gear_equip_new', { item: gearLabel(worn.instance, getLanguage()) }));
        }
        this.refresh();
      });
    });
  }

  /**
   * 流派那几行按 `SKILL_BRANCHES` 在运行期生成。
   *
   * 修前"有哪两条流派"被抄在三处：`index.html` 的两组标题 + 容器、这里的两次调用、
   * 日志页签里的两次 `renderBranch(...)`。加第三条流派时三处都得改，漏一处的症状是
   * **面板上少一整棵树而没有任何报错** —— 与 B36 / B45 同族（稳定清单靠人肉复制）。
   * 现在只有 `content/skillTrees.js` 那一份名单。
   */
  _ensureSkillBranches() {
    const host = document.getElementById('upgrade-skills-section');
    if (!host) return;
    if (host.dataset.built !== '1') {
      host.innerHTML = SKILL_BRANCHES.map((b) => `
        <h3 class="skill-branch-title" data-skill-branch-title="${b.id}"></h3>
        <div class="skill-list" data-skill-branch="${b.id}"></div>`).join('');
      host.dataset.built = '1';
    }
    // 标题每次刷新都重写（W-D2 切片16o：标题是**文案键**，换语言后它必须跟着变 ——
    // 只在构造那一刻写一次的话，英文界面上的流派名会永远停在中文）。
    for (const b of SKILL_BRANCHES) {
      const h = host.querySelector(`[data-skill-branch-title="${b.id}"]`);
      if (h) h.textContent = skillBranchText(b, getLanguage()).name;
    }
  }

  renderSkills(branch, ws) {
    const el = this.panel?.querySelector(`[data-skill-branch="${branch}"]`);
    if (!el) return;
    el.innerHTML = ws.getAllSkills(branch).map((sk) => {
      const owned = ws.unlocked.has(sk.id);
      const can = sk.narrative ? false : ws.canUnlock(sk);
      const lock = !owned && !sk.narrative ? ws.getStoryLock(sk.id) : null;
      const narrative = sk.narrative;
      const tag = narrative ? (owned ? '叙事✓' : '击败 Boss 解锁') : (sk.cost ? `${sk.cost}点` : '');
      return `<button type="button" class="skill-btn ${owned ? 'owned' : ''} ${narrative ? 'narrative' : ''}" data-id="${sk.id}" data-branch="${branch}" ${owned || !can || narrative ? 'disabled' : ''}>
        ${t(sk.name)} ${tag ? `(${tag})` : ''}<br><span>${t(sk.desc)}</span>
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
    const narrative = SKILL_BRANCHES.flatMap((b) => ws.getAllSkills(b.id)).filter((s) => s.narrative);
    const ownedN = narrative.filter((s) => ws.unlocked.has(s.id));
    el.innerHTML = `
      <p class="lore-intro">营火不仅是休息点 — 位面行者的剑与杖在此与<strong>剧情</strong>共鸣。击败 Boss、推进章节、收集叙事碎片，都会解锁新技能。</p>
      <p>当前 Chapter ${ch} · 叙事碎片 ${fr} 条 · 叙事技能 ${ownedN.length}/${narrative.length}</p>
      <ul class="lore-skill-list">
        ${narrative.map((s) => `<li class="${ws.unlocked.has(s.id) ? 'owned' : 'locked'}">
          <strong>${t(s.name)}</strong> — ${t(s.lore ?? s.desc)}
          ${ws.unlocked.has(s.id) ? '' : `<br><span class="hint">${s.grant.boss ? '需击败 Boss' : `需 Chapter ${s.grant.chapter}`}</span>`}
        </li>`).join('')}
      </ul>
    `;
  }

  upgrade(stat) {
    if (this.game.stats.levelUp(stat)) {
      // 升级之后的推送只有 `PlayerStats.pushToConsumers` 那一处（`levelUp` 里已经走过）：
      // 这里再手抄一遍 `applyToCombat` + `syncMana` 就是第二份 chore，少抄一句的症状是"蓝条没跟着变"
      this.game.player.combat.hp = this.game.stats.maxHp;
      this.game.player.combat.stamina = this.game.stats.maxStamina;
      this.game.weaponSkills?.addPoint(1);
      this.game.audio.levelUp();
      this.game.dialog.toast(t('upgrade_success', { stat }));
      this.refresh();
    } else {
      this.game.dialog.toast(t('upgrade_not_enough_souls'));
    }
  }
}
