import { FRANCHISE_LABELS, franchiseLabel } from '../content/franchises.js';
import { keyText, refreshKeyText } from './keyHints.js';
import { t, getLanguage } from '../engine/i18n.js';

/** [J] 次元回声 Tab × 星轨顾问（Echo Lamp）——卡片上一枚 💡 按钮，请回声灯给一句暗示 */
export class PopCultureJournalTab {
  constructor(game) {
    this.game = game;
    this.filter = 'all';
    this._byId = new Map();
    this._lastSeq = 0;
  }

  render(panelEl) {
    const sys = this.game.popCulture;
    const stats = sys?.getStats() ?? { unlocked: 0, total: 0, percent: 0 };
    const filters = Object.entries(FRANCHISE_LABELS).map(([k, label]) =>
      `<button type="button" class="pc-filter-btn${this.filter === k ? ' active' : ''}" data-f="${k}">${label}</button>`
    ).join('');

    const online = this.game?.onlineServices;
    const canAsk = !!online?.enabled?.() && typeof online.fetchEchoHint === 'function';

    const cards = sys.getEntries(this.filter).map((e) => {
      const ok = sys.unlocked.has(e.id);
      if (ok) this._byId.set(e.id, e);
      const askButton = ok
        ? `<div class="pc-ask-row"><button type="button" class="pc-ask-btn" data-e="${e.id}"${canAsk ? '' : ' disabled'}>${t(canAsk ? 'pc_echo_ask_button' : 'pc_echo_ask_off')}</button></div><div class="pc-hint" id="pc-hint-${e.id}" hidden></div>`
        : '';
      return `<div class="pc-card${ok ? '' : ' pc-locked'}">
        <span class="pc-franchise">${franchiseLabel(e.franchise, getLanguage())}</span>
        <div class="pc-title">${ok ? t(e.title) : '???'}</div>
        <div class="pc-desc">${ok ? keyText(t(e.desc)) : t('pop_culture_echo_locked_hint')}</div>
        ${askButton}
      </div>`;
    }).join('');

    panelEl.innerHTML = `
      <h2>${keyText(t('journal_tab_dimension_echoes'))}</h2>
      <p class="pc-stats">${t('pop_culture_stats', { unlocked: stats.unlocked, total: stats.total, percent: stats.percent })}</p>
      <p class="pc-note">${t('pop_culture_note')}</p>
      <div class="pc-filter">${filters}</div>
      <div class="pc-grid">${cards}</div>
    `;

    refreshKeyText(panelEl);
    panelEl.querySelectorAll('.pc-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.filter = btn.dataset.f;
        this.render(panelEl);
      });
    });
    panelEl.querySelectorAll('.pc-ask-btn').forEach((btn) => {
      btn.addEventListener('click', () => this._askEchoLamp(btn));
    });
  }

  /** 问回声灯一句：走在线伙伴 → 网关 → ai-service 的 /api/ai/echo-hint。 */
  async _askEchoLamp(btn) {
    const id = btn.dataset.e;
    const cardEl = btn.closest('.pc-card');
    const hintEl = cardEl?.querySelector('.pc-hint');
    if (!cardEl || !hintEl) return;

    const entry = this._byId.get(id);
    if (!entry) return;

    const online = this.game?.onlineServices;
    if (!online?.enabled?.()) {
      hintEl.textContent = t('pc_echo_ask_off');
      hintEl.hidden = false;
      return;
    }

    btn.disabled = true;
    btn.classList.add('is-pending');
    btn.textContent = t('pc_echo_ask_loading');
    hintEl.hidden = true;

    const seq = (this._lastSeq += 1);
    const franchise = entry.franchise ?? 'stars';
    const title = t(entry.title);
    const desc = keyText(t(entry.desc));

    try {
      const res = await online.fetchEchoHint({ franchise, title, desc });
      if (seq !== this._lastSeq) return;
      const data = res?.data ?? {};
      if (res?.ok && typeof data?.hint === 'string' && data.hint.trim()) {
        hintEl.textContent = data.hint;
        hintEl.hidden = false;
        btn.classList.add('is-done');
        btn.classList.remove('is-pending');
        btn.textContent = t('pc_echo_ask_done');
        return;
      }
      // 失败信号统一回退到一个 "未听见" 的提示（v2：reason → 细分文案）
      hintEl.textContent = t('pc_echo_ask_failed');
      hintEl.hidden = false;
      btn.classList.remove('is-pending');
      btn.disabled = false;
      btn.textContent = t('pc_echo_ask_button');
    } catch (e) {
      // onlineServices 已经把所有异常吞掉；真漏出来也不能中断这一格的卡面
      console.warn('[pc-ask] echo lamp 出口抛了（已兜住）', e?.message ?? e);
      hintEl.textContent = t('pc_echo_ask_failed');
      hintEl.hidden = false;
      btn.classList.remove('is-pending');
      btn.disabled = false;
      btn.textContent = t('pc_echo_ask_button');
    }
  }
}
