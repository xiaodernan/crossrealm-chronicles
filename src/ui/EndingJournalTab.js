import { ECHO_EPITAPHS } from '../content/echoEpitaphs.js';
import { endingDialogKey } from '../content/objectives.js';
import { keyText, refreshKeyText } from './keyHints.js';
import { t } from '../engine/i18n.js';

/**
 * [J] 归途残卷 —— 终局之后才点亮的那一页（W-Z51）。
 *
 * ## 这一页守的三条
 * - **通关之前全是锁着的**：`quests.completed` 才是「锚火属于你」的门槛——
 *   打开此页的玩家要么已走完主线，要么在老档里看见「锚火属于走完这段路的人」。
 * - **铭文直接复用星尘铭文**：母题毕业那一行（`ach_ept_*`）在这里再亮一遍——
 *   不是把成就墙抄一份，是把「走完了之后你读到的东西」收拢到一页里。
 * - **抉择取名走同一条路**：keep/quiet 的分岔判据**只能**经 `endingDialogKey()`
 *   取正文键名来反推（`ending_dialog_text_keep` / `_quiet`）——与结局对话框、谢幕碑同一口径
 *   （W-E3 切片46 / B155）。本文件里不许出现摸 decisions 的第二份判定（choice-objective 门禁钉死）。
 */
export class EndingJournalTab {
  constructor(game) {
    this.game = game;
  }

  render(panelEl) {
    const q = this.game.quests;
    const stats = q?.stats;
    const completed = q?.completed === true;

    if (!completed) {
      panelEl.innerHTML = `
        <h2>${keyText(t('journal_tab_ending'))}</h2>
        <div class="ending-locked">
          <div class="ending-locked-glyph" aria-hidden="true">🔒</div>
          <p class="ending-locked-text">${t('ending_epitaph_locked')}</p>
        </div>`;
      refreshKeyText(panelEl);
      return;
    }

    // 沿用 endingDialogKey 的同一口径（B155 唯一取名路径）：读终局正文键来反推
    // keep/quiet —— 绝不在这里自己摸 `decisions`（那是 choice-objective 门禁钉死的两份真相）。
    const 结局 = endingDialogKey(stats ?? {});
    const introKey = 结局 === 'ending_dialog_text_keep' ? 'ending_epitaph_intro_keep'
      : 结局 === 'ending_dialog_text_quiet' ? 'ending_epitaph_intro_quiet'
      : 'ending_epitaph_intro';

    const unlocked = this.game.achievements?.unlocked ?? new Set();
    const total = ECHO_EPITAPHS.length;
    const done = ECHO_EPITAPHS.filter((e) => unlocked.has(e.ach)).length;

    const cards = ECHO_EPITAPHS.map((e) => {
      const ok = unlocked.has(e.ach);
      const theme = t(e.themeKey);
      return ok
        ? `<div class="ach-epitaph ach-epitaph-unlocked"><div class="ach-epitaph-glyph">🕯</div><div class="ach-epitaph-theme">${theme}</div><div class="ach-epitaph-text">${t(e.key)}</div></div>`
        : `<div class="ach-epitaph"><div class="ach-epitaph-glyph">🔒</div><div class="ach-epitaph-theme">${theme}</div><div class="ach-epitaph-text">${t('ach_epitaphs_locked')}</div></div>`;
    }).join('');

    panelEl.innerHTML = `
      <h2>${keyText(t('journal_tab_ending'))}</h2>
      <p class="ending-intro">${t(introKey)}</p>
      <p class="ach-stats">${t('ending_epitaph_unlocked_fmt', { done, total })}</p>
      <div class="ach-ept-grid">${cards}</div>`;
    refreshKeyText(panelEl);
  }
}
