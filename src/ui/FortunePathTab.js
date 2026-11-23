import { QUESTIONS } from '../content/fortunePath.js';
import { getLanguage, t } from '../engine/i18n.js';
import { keyText, refreshKeyText } from './keyHints.js';

/**
 * [J] 星轨 · Fortune Path —— 锚火三问 · 命途 StateGraph（W-Z183）
 *
 * 设计口径（与锚火占卜同源、意图相反）：
 *   - 锚火占卜是「掷一张随机卡」；命途是「你必须为每一道题正视自己」。
 *     无随机、无抽奖、无概率。终局完全由你自己的三个回答决定。
 *   - 路由由 StateGraph（src/core/StateGraph.js）真实驱动——
 *     不是木偶，是一张你本能画好的地图。
 *   - 每 UTC 日一题一答；一问一答；今天已经答过的，再进来只会看到当日终局。
 *
 * 动效：底色火光 + 抬升动画；答案切换滑入；历史 chips 是每张已走的地砖。
 */
const MAX_HIST = 8;

export class FortunePathTab {
  constructor(game) {
    this.game = game;
    this._picked = [null, null, null];
    this._resolved = false;
  }

  render(panelEl) {
    const fp = this.game?.fortunePath;
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
      ? this._renderEnding(todayEnding, lang, false)
      : this._renderQuestions(lang);

    panelEl.innerHTML = `
      <h2>${keyText(t('journal_tab_path'))}</h2>
      <p class="path-intro">${t('path_intro')}</p>
      <div class="path-inner">${body}</div>
      <div class="path-footer">
        <span class="path-totals">${typeof snap?.totalDraws === 'number' ? t('path_total_draws_fmt', { n: snap.totalDraws }) : ''}${typeof snap?.totalSoulsEarned === 'number' ? ' · ' + t('path_total_souls_fmt', { n: snap.totalSoulsEarned }) : ''}</span>
      </div>
      <p class="path-history-title">${t('path_history_title')}</p>
      <div class="path-history">${historyChips || `<span class="path-history-empty">${t('path_history_empty')}</span>`}</div>
    `;

    refreshKeyText(panelEl);

    if (!todayEnding) {
      // 绑定答题交互
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
    const q = questionsHTML(QUESTIONS, lang, this._picked);
    return `
      <div class="path-questions">${q}</div>
      <p class="path-hint">${t('path_hint')}</p>`;
  }

  _renderEnding(ending, lang, placeholder) {
    const text = lang === 'en' ? ending.en : ending.zh;
    return `
      <div class="path-ending path-ending-visible">
        <div class="path-ending-rarity path-rarity-${ending.rarity}" aria-hidden="true"></div>
        <h3 class="path-ending-name">${text.name}</h3>
        <p class="path-ending-line">${text.line}</p>
        <p class="path-ending-souls">+${ending.souls} ${keyText(t('path_souls_reward'))}</p>
      </div>`;
  }

  _maybeResolve(panelEl) {
    if (this._resolved) return;
    if (this._picked.some((p) => p === null)) return;
    const fp = this.game?.fortunePath;
    const result = fp?.resolve?.(this._picked);
    this._resolved = true;
    if (result?.drewNew && result?.ending) {
      try { this.game?.stats?.addSouls?.(result.souls ?? result.ending.souls ?? 0); } catch { /* stats absent — silent */ }
    }
    try { (window.__crossrealmTelemetry)?.record?.('path_draw'); } catch { /* ignore */ }
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
