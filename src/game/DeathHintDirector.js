import { keyText } from '../content/keyHints.js';

import { on, offAll } from '../engine/EventBus.js';

const GAME_DEATHHINTDIRECTOR = 'game/DeathHintDirector';
const deathHintOn = (name, handler) => on(name, handler, GAME_DEATHHINTDIRECTOR);
/**
 * 倒下提示 —— 键名写成 `{动作}` 令牌，到 `onRespawn` 才展开。
 * 写在模块顶层的字符串若在加载期就拼成真实键名，玩家改绑之后这段文字会永远停在出厂键位上。
 */
const HINTS = [
  { test: (g) => (g.player?.combat?.comboCount ?? 0) >= 4, text: '高连击时别贪刀 — 留精力翻滚。' },
  { test: (g) => g.enemyManager?.boss?.alive, text: 'Boss 战：{lockOn} 锁定，红圈前 {parry} 弹反或 {roll} 翻滚。' },
  { test: (g) => g.dungeons?.active, text: '迷宫内先清小怪再进 Boss 房，留意小地图未探索房间。' },
  { test: () => true, text: '营火 {interact} 可回满生命；{journal} 日志有 Boss 攻略与流派说明。' },
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
    const hint = keyText(HINTS.find((h) => h.test(this.game))?.text ?? HINTS[HINTS.length - 1].text);
    this.game.dialog.toast(`提示 · ${hint}`, 4200);
    this.game.storyJournal?.add?.({
      id: `death-${this.deathCount}-${Date.now()}`,
      category: 'poi',
      title: `第 ${this.deathCount} 次倒下`,
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
