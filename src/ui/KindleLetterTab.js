import { getLanguage, t } from '../engine/i18n.js';
import { keyText, refreshKeyText } from './keyHints.js';

/**
 * [J] 炉火的回信 · W-Z292 —— 终章之后，你写一行，炉火回一行。
 *
 * 这一页是**回信的存档**：每一封（一行 + 炉火那一行）都落在这里，随存档带走；
 * 提交那一句走星轨顾问面板（按 {advisor}）——那个面板已经是被校核过的、不收焦点的文本框，
 * 这里再造一枚文本框只会违反焦点出口的唯一性（focus-nav 门禁）。
 *
 * 不可信文本（玩家写的、模型回的）全部 textContent，从来不进 innerHTML。
 */
export class KindleLetterTab {
  constructor(game) {
    this.game = game;
  }

  render(panelEl) {
    const snap = this.game?.kindleLetter?.snapshot?.() ?? { eligible: false, enabled: false, turns: [] };

    panelEl.innerHTML = `
      <h2>${keyText(t('journal_tab_letter'))}</h2>
      <p class="path-intro">${t('letter_intro')}</p>
      <div class="letter-inner">${snap.eligible ? this._renderArchiveShell() : this._renderLocked()}</div>
    `;
    refreshKeyText(panelEl);

    if (!snap.eligible) return;
    this._fillArchive(panelEl, snap);
  }

  _renderLocked() {
    return `<div class="letter-locked"><h3 class="letter-locked-title">${t('letter_locked')}</h3><p class="letter-locked-body">${t('letter_locked_body')}</p></div>`;
  }

  _renderArchiveShell() {
    return `
      <p class="letter-archive-hint">${keyText(t('letter_archive_hint'))}</p>
      <div class="letter-turns" id="letter-turns"></div>
    `;
  }

  _fillArchive(panelEl, snap) {
    const container = panelEl.querySelector('#letter-turns');
    if (!container) return;
    container.textContent = '';
    const turns = snap.turns ?? [];
    if (turns.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'letter-empty';
      empty.textContent = t('letter_empty');
      container.appendChild(empty);
      return;
    }
    for (const turn of turns) {
      const me = document.createElement('section');
      me.className = 'letter-turn';
      const mine = document.createElement('p');
      mine.className = 'letter-turn-line';
      const tagMe = document.createElement('span');
      tagMe.className = 'letter-turn-tag letter-turn-tag-me';
      tagMe.textContent = getLanguage() === 'en' ? 'You' : '你';
      mine.append(tagMe, document.createTextNode(turn.line));
      const fire = document.createElement('p');
      fire.className = 'letter-turn-reply';
      const tagFire = document.createElement('span');
      tagFire.className = 'letter-turn-tag letter-turn-tag-fire';
      tagFire.textContent = '炉火 · Ember';
      fire.append(tagFire, document.createTextNode(turn.reply));
      me.append(mine, fire);
      container.appendChild(me);
    }
    container.scrollTop = container.scrollHeight;
  }
}
