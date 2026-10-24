import { keyText } from '../ui/keyHints.js';
import { t } from '../engine/i18n.js';

import { on, offAll } from '../engine/EventBus.js';

const GAME_DEATHHINTDIRECTOR = 'game/DeathHintDirector';
const deathHintOn = (name, handler) => on(name, handler, GAME_DEATHHINTDIRECTOR);
/**
 * 倒下提示 —— 键名写成 `{动作}` 令牌，到 `onRespawn` 才展开。
 * 写在模块顶层的字符串若在加载期就拼成真实键名，玩家改绑之后这段文字会永远停在出厂键位上。
 *
 * `text` 存的是**文案键**（W-D2 切片16d）：提示正文进双表，`{动作}` 令牌那层
 * 仍由 `keyText()` 在播出那一刻展开 —— 两层占位各管各的。
 */
const HINTS = [
  { test: (g) => (g.player?.combat?.comboCount ?? 0) >= 4, text: 'death_hint_combo' },
  { test: (g) => g.enemyManager?.boss?.alive, text: 'death_hint_boss' },
  { test: (g) => g.dungeons?.active, text: 'death_hint_dungeon' },
  { test: () => true, text: 'death_hint_campfire' },
];

export class DeathHintDirector {
  /** 本文件的监听都挂在同一个所有权下，`dispose()` 一次结清（W-A1 迁移第八处） */
  dispose() {
    offAll(GAME_DEATHHINTDIRECTOR);
  }

  constructor(game) {
    this.game = game;
    this.deathCount = 0;
    deathHintOn('player-respawn', () => this.onRespawn());
  }

  onRespawn() {
    this.deathCount += 1;
    // 两层展开：先 `t()` 取文案（键 → 句子），再 `keyText()` 把 `{动作}` 令牌换成真实键名。
    const hint = keyText(t(HINTS.find((h) => h.test(this.game))?.text ?? HINTS[HINTS.length - 1].text));
    this.game.dialog.toast(`${t('death_hint_prefix')} ${hint}`, 4200);
    this.game.storyJournal?.add?.({
      id: `death-${this.deathCount}-${Date.now()}`,
      category: 'poi',
      title: t('death_journal_title', { n: this.deathCount }),
      text: hint,
      chapter: this.game.quests?.chapter ?? 1,
    });
    window.dispatchEvent(new CustomEvent('player-death-count', { detail: { count: this.deathCount } }));
  }

  toJSON() {
    return { deathCount: this.deathCount };
  }

  fromJSON(data) {
    if (data) this.deathCount = data.deathCount ?? 0;
  }
}
