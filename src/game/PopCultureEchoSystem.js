import { ECHOES } from '../content/echoes.js';
import { t, getLanguage } from '../engine/i18n.js';
import { franchiseLabel } from '../content/franchises.js';

import { on, offAll } from '../engine/EventBus.js';

const GAME_POPCULTUREECHOSYSTEM = 'game/PopCultureEchoSystem';
const echoOn = (name, handler) => on(name, handler, GAME_POPCULTUREECHOSYSTEM);
/** 次元回声解锁 — 发现 POI / 致敬点时写入 */
export class PopCultureEchoSystem {
  /** 本文件的监听都挂在同一个所有权下，`dispose()` 一次结清（W-A1 迁移第八处） */
  dispose() {
    offAll(GAME_POPCULTUREECHOSYSTEM);
  }

  constructor(game) {
    this.game = game;
    this.unlocked = new Set();
    this.setupListeners();
  }

  setupListeners() {
    echoOn('discovery', (e) => {
      const id = e.detail?.id;
      if (id) this.tryUnlock(`discovery:${id}`);
    });
    echoOn('pop-culture-echo', (e) => {
      const key = e.detail?.trigger;
      if (key) this.tryUnlock(key);
    });
  }

  tryUnlock(triggerKey) {
    for (const echo of ECHOES) {
      if (echo.trigger !== triggerKey || this.unlocked.has(echo.id)) continue;
      this.unlocked.add(echo.id);
      this.game.dialog?.toast(t('pop_culture_echo_unlocked', { title: t(echo.title) }), 3400);
      this.game.storyJournal?.add?.({
        id: echo.id,
        category: 'fragment',
        title: t('pop_culture_echo_journal_title', { franchise: franchiseLabel(echo.franchise, getLanguage()), title: t(echo.title) }),
        // W-D2 切片25：`echo.desc` 是**文案键**（`content/echoes.js`，与 `echo.title` 同一口径）——
        // 修前这里直接把键当正文写进日志，玩家读到的是 `echo_wizard_school_desc` 这一串。
        text: t(echo.desc),
        chapter: this.game.quests?.chapter ?? 1,
      });
      window.dispatchEvent(new CustomEvent('pop-culture-unlocked', { detail: echo }));
      const stats = this.getStats();
      if (stats.percent >= 100 && !this.unlocked.has('echo-full-resonance')) {
        this.tryUnlock('echo:full-resonance');
      }
    }
  }

  getEntries(franchise = 'all') {
    return ECHOES.filter((e) => franchise === 'all' || e.franchise === franchise);
  }

  getStats() {
    const total = ECHOES.length;
    return { unlocked: this.unlocked.size, total, percent: total ? Math.round((this.unlocked.size / total) * 100) : 0 };
  }

  toJSON() {
    return { unlocked: [...this.unlocked] };
  }

  fromJSON(data) {
    if (data?.unlocked) this.unlocked = new Set(data.unlocked);
  }
}
