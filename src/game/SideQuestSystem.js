import { SIDE_QUESTS_ALL } from '../content/sideQuests.js';

/**
 * 支线任务 —— 自动检测完成（名单在 `content/sideQuests.js`，两族合并成一份）
 *
 * 改前的形状：基础那 7 条住在 `game/SideQuestRegistry.js`，致敬那 14 条住在内容层，
 * 由 `attachPopCultureSideQuests()` **改写本对象的 `checkAll` 方法**挂上来
 * （`Game.js` 里调一句）。于是"支线一共几条"这件事有两个答案：完成检测走 21 条、
 * 分母与页签走 7 条 —— HUD 可以显示 "(12/7)"，而 14 条致敬支线能完成、会弹提示、
 * 会写日志，却永远不出现在名单里。现在只有一份名单、一处遍历。
 */
const 轮询间隔 = 2;   // 秒：支线判据都不要求逐帧精度（计数、百分比、集合大小）

export class SideQuestSystem {
  constructor(game) {
    this.game = game;
    this.completed = new Set();
    this._tick = 0;
    // 一条判据抛错时喊一次就够：每 2 秒重复同一条消息会把日志刷满，而没人会读第二遍
    this._报错过的 = new Set();
  }

  update(dt) {
    this._tick += dt;
    if (this._tick < 轮询间隔) return;
    this._tick = 0;
    this.checkAll();
  }

  /**
   * 逐条问判据。
   *
   * 这里原来包着 `try { … } catch (_) { /* ignore *\/ }`（致敬族那半壁还有第二个同样的空块）：
   * 判据抛错的后果不是报错，是**那条支线永远完成不了，而且没人知道** —— 与 B36/B63 同一族
   * （静默兜底说假话）。现在抛错照样不打断这一帧（一帧里 21 条判据，一条坏不该拖垮其余），
   * 但每条只喊一次、喊出来带 id，并且用例盯住"它喊了"这件事（见 `tests/side-quest-roster.test.js`）。
   */
  checkAll() {
    for (const q of SIDE_QUESTS_ALL) {
      if (this.completed.has(q.id)) continue;
      let 成了 = false;
      try {
        成了 = q.check(this.game) === true;
      } catch (e) {
        if (!this._报错过的.has(q.id)) {
          this._报错过的.add(q.id);
          console.error(`[sideQuests] 判据抛错，这条支线永远不会完成：${q.id}（${q.title}）—— ${e?.message ?? e}`);
        }
        continue;
      }
      if (成了) this.complete(q);
    }
  }

  complete(q) {
    this.completed.add(q.id);
    this.game.stats.addSouls(q.reward);
    this.game.dialog.toast(`支线完成：${q.title} · +${q.reward} 魂火`, 3200);
    this.game.storyJournal?.add?.({
      id: q.id,
      category: 'quest',
      title: `支线 · ${q.title}`,
      text: q.journal ?? q.desc,
      chapter: this.game.quests?.chapter ?? 1,
    });
    window.dispatchEvent(new CustomEvent('side-quest-complete', { detail: q }));
    // W-B6 切片4：记录支线完成
    this.game?.stats?.onQuestCompleted(q.id);
  }

  /** 分母与页签都走这一句：它数的就是这一片遍历的那一份名单，不是其中一族 */
  getProgress() {
    return { done: this.completed.size, total: SIDE_QUESTS_ALL.length };
  }

  toJSON() {
    return { completed: [...this.completed] };
  }

  fromJSON(data) {
    if (data?.completed) this.completed = new Set(data.completed);
  }
}
