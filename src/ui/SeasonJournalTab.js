/**
 * [J] 赛季 Tab（W-F2 切片1）。
 *
 * ## 为什么这一页把"来源"写在脸上
 *
 * 同一个"还剩 3 天"，可能是本地按日界算的，也可能是赛季服务确认过的。
 * 玩家自己改了 `cycle-days`（服务端配置中心）之后，这两者会短暂不一致 ——
 * 与其藏起来，不如直接标一行：`本地轮转` / `在线赛季`。这一行的成本是一句话，
 * 收益是"读数为什么和昨天不一样"不必靠猜。
 *
 * 词缀只显示名字与一句话，**不显示数值**：数值属于试炼（W-F3），
 * 写在赛季页上就是一句玩家无法验证的承诺。
 */

import { keyText, refreshKeyText } from './keyHints.js';
import { t } from '../engine/i18n.js';

export class SeasonJournalTab {
  constructor(game) {
    this.game = game;
  }

  render(panelEl) {
    const state = this.game.seasons?.getState?.();
    if (!state || !state.season) {
      panelEl.innerHTML = `
        <h2>${keyText(t('journal_tab_season'))}</h2>
        <p class="season-empty">${t('season_unavailable')}</p>
      `;
      refreshKeyText(panelEl);
      return;
    }

    const mods = state.modifiers.map((m) => `<li class="season-mod">
        <span class="season-mod-name">${t(m.label)}</span>
        <span class="season-mod-desc">${t(m.desc)}</span>
      </li>`).join('');

    panelEl.innerHTML = `
      <h2>${keyText(t('journal_tab_season'))}</h2>
      <div class="season-card">
        <div class="season-name">${t(state.season.name)}</div>
        <div class="season-tagline">${t(state.season.tagline)}</div>
        <div class="season-line">${t('season_days_left_fmt', { days: state.daysRemaining })} · ${t('season_bonus_fmt', { pct: state.soulsBonusPct })}</div>
        <div class="season-source ${state.source === 'online' ? 'is-online' : ''}">${state.source === 'online' ? t('season_source_online') : t('season_source_local')}</div>
        <div class="season-mods-label">${t('season_modifiers_label')}</div>
        <ul class="season-mods">${mods}</ul>
      </div>
    `;
    refreshKeyText(panelEl);
  }
}
