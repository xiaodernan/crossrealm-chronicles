import { cardText } from '../content/trilanceReading.js';
import { getLanguage, t } from '../engine/i18n.js';
import { keyText, refreshKeyText } from './keyHints.js';

/**
 * [J] 星轨 → 三日曜盘 · The Trisolar Tide (W-Z129)
 *
 * 与焰占卜（W-Z118）同形：系统只做「周闸 + 抽牌 + 持久化」，
 * UI 只做「三卡展示 + 合帘判定 + 本周魂结算」。Lick of flame, weekly.
 *
 * 合帘（Aligned）：全 ★ / 全 ★★ / 全 ★★★ = +30% 魂。
 * 产物的魂单独记账（trilance_total_weeks/souls），HUD 总魂即时 +N（走 addSouls）。
 */
const ROLE_KEYS = ['trilance_reveal_left', 'trilance_reveal_mid', 'trilance_reveal_right'];

export class TrilanceReadingTab {
  constructor(game) {
    this.game = game;
  }

  render(panelEl) {
    const lang = getLanguage() === 'en' ? 'en' : 'zh';
    const sys = this.game.trilanceReading;
    const week = sys?.thisWeek?.() ?? null;
    const canCast = sys?.canCastThisWeek?.() ?? true;
    const snap = sys?.snapshot?.() ?? { totalWeeks: 0, totalSoulsEarned: 0, week: '' };
    const historyRows = (sys?.history?.() ?? []).slice(0, 8).map((h) => {
      const names = (h.cards ?? []).map((c) => { const text = cardText(c, lang); return text?.name ?? ''; });
      const glyphs = (h.cards ?? []).map((c) => c?.glyph ?? '✦').join(' ');
      const souls = h.souls ?? 0;
      return `<span class="trilance-history-chip" title="${h.week} · ${names.join(' / ')}">${h.week} <span class="trilance-history-glyph" aria-hidden="true">${glyphs}</span> +${souls}</span>`;
    }).join('');

    const totalsLine = `${t('trilance_stats_weeks_fmt', { n: snap.totalWeeks ?? 0 })} · ${t('trilance_souls_total_fmt', { n: snap.totalSoulsEarned ?? 0 })}`;

    let altarHtml, verdictHtml;
    if (week) {
      altarHtml = `<div class="trilance-card-row">${week.cards.map((card, i) => this._renderCard(card, lang, i)).join('')}</div>`;
      verdictHtml = this._verdictHtml(week, lang);
    } else {
      altarHtml = `<div class="trilance-card-row">${[0, 1, 2].map(() => this._renderPlaceholder()).join('')}</div>`;
      verdictHtml = `<p class="trilance-verdict is-idle">${t('trilance_placeholder_hint')}</p>`;
    }

    panelEl.innerHTML = `
      <h2>${keyText(t('journal_tab_trilance'))}</h2>
      <p class="trilance-intro">${t('trilance_intro')}</p>
      <div class="trilance-altar">${altarHtml}</div>
      ${verdictHtml}
      <div class="trilance-draw-row">
        <button type="button" class="trilance-cta${canCast ? '' : ' is-done'}" id="trilance-cast-btn"${canCast ? '' : ' disabled aria-disabled="true"'}>
          ${keyText(canCast ? t('trilance_cast_cta') : t('trilance_cast_done'))}
        </button>
        <span class="trilance-totals">${totalsLine}</span>
      </div>
      <p class="trilance-history-title">${t('trilance_history_title')}</p>
      <div class="trilance-history">${historyRows || `<span class="trilance-history-empty">${t('trilance_history_empty')}</span>`}</div>
    `;

    refreshKeyText(panelEl);

    panelEl.querySelector('#trilance-cast-btn')?.addEventListener('click', () => {
      if (!canCast) return;
      const result = sys?.castWeek?.();
      try { (window.__crossrealmTelemetry)?.record?.('trilance_draw'); } catch { /* telemetry optional */ }
      if (result?.drewNew && result?.souls) {
        try { this.game?.stats?.addSouls?.(result.souls); } catch { /* stats missing — silent */ }
      }
      this.render(panelEl);
    });
  }

  _renderCard(card, lang, roleIndex) {
    const text = cardText(card, lang);
    const stars = '✦'.repeat(card.rarity);
    return `
      <figure class="trilance-card rarity-${card.rarity}" role="figure" aria-label="${keyText(text.name)}">
        <figcaption class="trilance-role">${keyText(t(ROLE_KEYS[roleIndex] ?? 'trilance_reveal_mid'))}</figcaption>
        <div class="trilance-card-glyph" aria-hidden="true">${card.glyph}</div>
        <div class="trilance-card-stars" aria-label="${stars}">${stars}</div>
        <h3 class="trilance-card-name">${keyText(text.name)}</h3>
        <p class="trilance-card-line">${keyText(text.line)}</p>
        <p class="trilance-card-souls">+${card.souls} ${keyText(t('trilance_souls_reward'))}</p>
      </figure>`;
  }

  _renderPlaceholder() {
    return `
      <figure class="trilance-card trilance-card-placeholder" role="figure" aria-label="Uncast">
        <div class="trilance-card-glyph trilance-card-glyph-idle" aria-hidden="true">◉</div>
        <p class="trilance-card-line">${t('trilance_placeholder_hint')}</p>
      </figure>`;
  }

  _verdictHtml(week, lang) {
    if (week.aligned) {
      const bonus = week.cards.length ? Math.round(week.cards.reduce((s, c) => s + c.souls, 0) * 0.3) : 0;
      return `<div class="trilance-verdict is-aligned"><h3 class="trilance-verdict-title">${keyText(t('trilance_aligned_title'))}</h3><p class="trilance-verdict-line">${keyText(t('trilance_aligned_text'))}</p><p class="trilance-verdict-bonus">${t('trilance_aligned_bonus_fmt', { n: bonus })}</p></div>`;
    }
    return `<div class="trilance-verdict is-staggered"><h3 class="trilance-verdict-title">${keyText(t('trilance_staggered_title'))}</h3><p class="trilance-verdict-line">${keyText(t('trilance_staggered_text'))}</p></div>`;
  }
}
