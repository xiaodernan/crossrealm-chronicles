/**
 * [J] 敌人图鉴 Tab（W-F1 切片1）。
 *
 * ## 遮什么、露什么
 *
 * 未记录的条目**仍然占一格**（灰色的 ???），而不是从册子里消失 ——
 * 图鉴的价值有一半在"你知道还有多少没遇到"，藏掉空格就只剩一句"已收集 N 条"。
 *
 * 记录之后的读数是**分层的**：名字与击杀数第一档就给；数值、特征、属性相性
 * 要杀过一次才露（`known`）。这样"第一次遇到某一类"仍然有信息增量，
 * 而不是一进图鉴就被剧透干净。
 *
 * ## 为什么筛选用"位面"而不是"等级/血量"
 *
 * 玩家的心智是"我在幽暗林地见过它"，不是"它是 240 血那一档"。而位面归属在 id 前缀里
 * 写着（见 `content/bestiary.js` 文件头），不需要第二份数据。
 */

import {
  BESTIARY_ELEMENTS, BESTIARY_FILTERS, BESTIARY_TIERS, BESTIARY_TRAITS,
} from '../content/bestiary.js';
import { keyText, refreshKeyText } from './keyHints.js';
import { t } from '../engine/i18n.js';

/** 元素 id → 那句话（抗性/弱点两处共用一份展开逻辑） */
const elemLabel = (id) => {
  const hit = BESTIARY_ELEMENTS.find((e) => e.id === id);
  return hit ? t(hit.label) : id;
};

export class BestiaryJournalTab {
  constructor(game) {
    this.game = game;
    this.filter = 'all';
  }

  render(panelEl) {
    const bestiary = this.game.bestiary;
    const stats = bestiary?.getStats() ?? { total: 0, seen: 0, mastered: 0, percent: 0 };

    // 只显示**真的有条目**的筛选档（空档按钮会让玩家以为图鉴漏了一页）
    const filters = BESTIARY_FILTERS.filter((f) => f.id === 'all' || (bestiary?.entries(f.id)?.length ?? 0) > 0)
      .map((f) => `<button type="button" class="bestiary-filter-btn${this.filter === f.id ? ' active' : ''}" data-z="${f.id}">${t(f.label)}</button>`)
      .join('');

    const list = bestiary?.entries(this.filter) ?? [];
    const cards = list.map((e) => this._card(e)).join('');

    panelEl.innerHTML = `
      <h2>${keyText(t('journal_tab_bestiary'))}</h2>
      <p class="bestiary-stats">${t('bestiary_stats_fmt', {
        seen: stats.seen, total: stats.total, mastered: stats.mastered,
      })}</p>
      <div class="bestiary-filter">${filters}</div>
      <div class="bestiary-grid">${cards || `<p class="bestiary-empty">${t('bestiary_empty')}</p>`}</div>
    `;

    refreshKeyText(panelEl);
    panelEl.querySelectorAll('.bestiary-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.filter = btn.dataset.z;
        this.render(panelEl);
      });
    });
  }

  /** 一张卡。未记录时只给 ??? 与一句提示，其余字段一律不渲染（省得被"查看源码"剧透） */
  _card(e) {
    const tier = BESTIARY_TIERS.find((row) => row.id === e.tierId);
    const name = e.known ? t(e.nameKey) : t('bestiary_locked_name');
    const tierBadge = tier ? `<span class="bestiary-tier">${t(tier.label)}</span>` : '';
    if (!e.known) {
      return `<div class="bestiary-card bestiary-locked">
        <div class="bestiary-head"><span class="bestiary-name">${name}</span>${tierBadge}</div>
        <div class="bestiary-hint">${t('bestiary_locked_hint')}</div>
      </div>`;
    }
    const traits = e.traits.map((id) => {
      const hit = BESTIARY_TRAITS.find((row) => row.id === id);
      return hit ? `<span class="bestiary-trait">${t(hit.label)}</span>` : '';
    }).join('');
    const affinity = [];
    if (e.affinity.weak) affinity.push(t('bestiary_weak_fmt', { elem: elemLabel(e.affinity.weak.id) }));
    if (e.affinity.resist) affinity.push(t('bestiary_resist_fmt', { elem: elemLabel(e.affinity.resist.id) }));
    return `<div class="bestiary-card">
      <div class="bestiary-head"><span class="bestiary-name">${name}</span>${tierBadge}</div>
      <div class="bestiary-kills">${t('bestiary_kills_fmt', { n: e.kills })}</div>
      <div class="bestiary-line">${t('bestiary_stats_line_fmt', {
        hp: e.stats.hp, posture: e.stats.posture, damage: e.stats.damage, speed: e.stats.speed,
      })}</div>
      ${traits ? `<div class="bestiary-traits">${traits}</div>` : ''}
      <div class="bestiary-affinity">${affinity.join(' · ') || t('bestiary_no_affinity')}</div>
    </div>`;
  }
}
