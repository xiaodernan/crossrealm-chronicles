import { VOW_QUESTIONS, VOW_ENDINGS } from '../content/vigilVow.js';
import { getLanguage, t } from '../engine/i18n.js';
import { keyText, refreshKeyText } from './keyHints.js';

/**
 * [J] 星轨 · Vigil Vow — 炉火祈愿 · 三问（StateGraph 驱动）
 *
 * 锚火三问之后那三个祈愿：
 *   - 它们问的不是你今天想做什么——而是你对一炉火到底忠诚什么；
 *   - 每一天都放开「心」——今天没答完，明天再来。
 */
const MAX_HIST = 8;

export class VigilVowTab {
  constructor(game) {
    this.game = game;
    this._picked = [null, null, null];
    this._resolved = false;
  }

  render(panelEl) {
    const fp = this.game?.vigilVow;
    const lang = getLanguage() === 'en' ? 'en' : 'zh';
    const snap = fp?.snapshot?.() ?? {};
    const todayEnding = fp?.todayEnding?.() ?? null;
    const history = fp?.history?.() ?? [];
    const historyChips = history.slice(0, MAX_HIST).map(({ ending, ymd }) => {
      if (!ending) return '';
      const text = lang === 'en' ? ending.en : ending.zh;
      return `<span class="path-chip" title="${ymd}">${text.name}</span>`;
    }).filter(Boolean).join('');

    const body = todayEnding
      ? this._renderEnding(todayEnding, lang)
      : this._renderQuestions(lang);

    panelEl.innerHTML = `
      <h2>${keyText(t('journal_tab_vigil'))}</h2>
      <p class="path-intro">${t('vow_intro')}</p>
      <div class="path-inner">${body}</div>
      <div class="path-footer">
        <span class="path-totals">${typeof snap?.totalDraws === 'number' ? t('vow_total_draws_fmt', { n: snap.totalDraws }) : ''}${typeof snap?.totalSoulsEarned === 'number' ? ' · ' + t('vow_total_souls_fmt', { n: snap.totalSoulsEarned }) : ''}</span>
      </div>
      <p class="path-history-title">${t('vow_history_title')}</p>
      <div class="path-history">${historyChips || `<span class="path-history-empty">${t('vow_history_empty')}</span>`}</div>
    `;

    refreshKeyText(panelEl);

    if (!todayEnding) {
      panelEl.querySelectorAll('.path-question').forEach((qEl) => {
        const idx = Number(qEl.getAttribute('data-idx'));
        qEl.querySelectorAll('.path-option').forEach((opt) => {
          const axis = Number(opt.getAttribute('data-axis'));
          opt.addEventListener('click', () => {
            this._picked[idx] = axis;
            refreshKeyText(panelEl);
            qEl.querySelectorAll('.path-option').forEach((o) => o.classList.toggle('is-picked', o === opt));
            this._maybeResolve(panelEl);
          });
        });
      });
    }
  }

  _renderQuestions(lang) {
    const q = questionsHTML(VOW_QUESTIONS, lang, this._picked);
    return `<div class="path-questions">${q}</div><p class="path-hint">${t('vow_hint')}</p>`;
  }

  _renderEnding(ending, lang) {
    const text = lang === 'en' ? ending.en : ending.zh;
    return `
      <div class="path-ending path-ending-visible">
        <div class="path-ending-rarity path-rarity-${ending.rarity}" aria-hidden="true"></div>
        <h3 class="path-ending-name">${text.name}</h3>
        <p class="path-ending-line">${text.line}</p>
        <p class="path-ending-souls">+${ending.souls} ${keyText(t('vow_souls_reward'))}</p>
      </div>`;
  }

  _maybeResolve(panelEl) {
    if (this._resolved) return;
    if (this._picked.some((p) => p === null)) return;
    const fp = this.game?.vigilVow;
    const result = fp?.resolve?.(this._picked);
    this._resolved = true;
    if (result?.drewNew && result?.ending) {
      try { this.game?.stats?.addSouls?.(result.souls ?? result.ending.souls ?? 0); } catch { /* stats absent — silent */ }
    }
    try { (window.__crossrealmTelemetry)?.record?.('vow_draw'); } catch { /* ignore */ }
    this.render(panelEl);
  }
}

function questionsHTML(questions, lang, picked) {
  return questions.map((q, i) => {
    const copy = lang === 'en' ? q.en : q.zh;
    return `
      <section class="path-question" data-idx="${i}">
        <h3 class="path-q-num">${i + 1}. ${copy.text}</h3>
        <div class="path-options" role="group" aria-label="${copy.text}">
          ${['a', 'b', 'c'].map((k, axis) => `<button type="button" class="path-option${picked[i] === axis ? ' is-picked' : ''}" data-axis="${axis}">${copy[k]}</button>`).join('')}
        </div>
      </section>`;
  }).join('');
}
