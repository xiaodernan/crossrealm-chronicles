import { cardText } from '../content/flameDivination.js';
import { getLanguage, t } from '../engine/i18n.js';
import { keyText, refreshKeyText } from './keyHints.js';

/**
 * [J] 星轨 · Flame Reading — 锚火占卜（W-Z118）
 *
 * ## 为什么是这张子页
 *
 * 营火是这个故事里最安静、最有仪式感的场所；这张 tab 在那两个功能上是同体
 * ——在枢纽锚火边让玩家"向火问卜"，一天一卡，反馈一小笔魂。
 *
 * ## 设计口径
 *
 * 1. **确定性**：日判读按 UTC 切；同一 UTC 日第 N 次都看到同一张卡
 *    （`game.flameReading.todayCard()` 持久化在 LS 里）。
 * 2. **禁用抽卡按钮 + 显示今卡**：渲染即知今天有没有一张属于你；
 *    今日尚未占卜时按钮文案 "占火 · Ask the Flame"。
 * 3. **魂反馈**：每抽新卡就 `game.stats.addSouls(card.souls)`，
 *    配合全局 HUD 更新——没必要多写一行 FPS/render 代码。
 * 4. **存档只可能有键字段**：`{ today, todayCardId, draws[], totalSoulsEarned, totalDraws }`。
 */
const getSoulsHint = (card) => (card?.souls ?? 0);

export class FlameReadingTab {
  constructor(game) {
    this.game = game;
  }

  render(panelEl) {
    const lang = getLanguage() === 'en' ? 'en' : 'zh';
    const fs = this.game.flameReading;
    const todayCard = fs?.todayCard?.() ?? null;
    const canDraw = fs?.canDrawToday?.() ?? true;
    const snap = fs?.snapshot?.();
    const draws = fs?.history?.() ?? [];
    const historyChips = draws.slice(0, 12).map(({ card, ymd }) => {
      if (!card) return '';
      const text = cardText(card, lang);
      return `<span class="flame-history-chip" title="${ymd}"><span class="flame-history-glyph" aria-hidden="true">${card.glyph}</span>${text.name}</span>`;
    }).join('');

    const rendered = todayCard
      ? this._renderCard(todayCard, lang, false)
      : this._renderPlaceholder(lang);

    const progress = typeof snap?.totalDraws === 'number'
      ? t('flame_draws_total_fmt', { n: snap.totalDraws })
      : '';
    const souls = typeof snap?.totalSoulsEarned === 'number'
      ? t('flame_souls_total_fmt', { n: snap.totalSoulsEarned })
      : '';

    panelEl.innerHTML = `
      <h2>${keyText(t('journal_tab_flame'))}</h2>
      <p class="flame-intro">${t('flame_intro')}</p>
      <div class="flame-altar">${rendered}</div>
      <div class="flame-draw-row">
        <button type="button" class="flame-cta${canDraw ? '' : ' is-done'}" id="flame-draw-btn"${canDraw ? '' : ' disabled aria-disabled="true"'}>
          ${keyText(canDraw ? t('flame_draw_cta') : t('flame_draw_done'))}
        </button>
        <span class="flame-totals">${progress} · ${souls}</span>
      </div>
      <p class="flame-history-title">${t('flame_history_title')}</p>
      <div class="flame-history">${historyChips || `<span class="flame-history-empty">${t('flame_history_empty')}</span>`}</div>
    `;

    refreshKeyText(panelEl);

    panelEl.querySelector('#flame-draw-btn')?.addEventListener('click', () => {
      if (!canDraw) return;
      const result = fs?.draw?.();
      if (result?.drewNew && result.card) {
        try { this.game?.stats?.addSouls?.(result.souls ?? result.card.souls ?? 0); } catch { /* stats 未就位 → 静默 */ }
      }
      this.render(panelEl);
    });
  }

  _renderCard(card, lang, placeholder) {
    const text = cardText(card, lang);
    const stars = '★'.repeat(card.rarity);
    const souls = getSoulsHint(card);
    return `
      <div class="flame-card rarity-${card.rarity}" role="figure" aria-label="${keyText(text.name)}">
        <div class="flame-card-glyph" aria-hidden="true">${card.glyph}</div>
        <div class="flame-card-stars" aria-label="${stars}">${stars}</div>
        <h3 class="flame-card-name">${keyText(text.name)}</h3>
        <p class="flame-card-line">${keyText(text.line)}</p>
        <p class="flame-card-souls">+${souls} ${keyText(t('flame_souls_reward'))}</p>
      </div>`;
  }

  _renderPlaceholder(lang) {
    return `
      <div class="flame-card flame-card-placeholder" role="figure" aria-label="Undrawn">
        <div class="flame-card-glyph flame-card-flame" aria-hidden="true">🔥</div>
        <p class="flame-card-line">${t('flame_placeholder_hint')}</p>
      </div>`;
  }
}
