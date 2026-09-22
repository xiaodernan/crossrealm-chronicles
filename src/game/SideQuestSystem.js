import { SIDE_QUESTS } from './SideQuestRegistry.js';

/** 支线任务 — 自动检测完成 */
export class SideQuestSystem {
  constructor(game) {
    this.game = game;
    this.completed = new Set();
    this._tick = 0;
  }

  update(dt) {
    this._tick += dt;
    if (this._tick < 2) return;
    this._tick = 0;
    this.checkAll();
  }

  checkAll() {
    for (const q of SIDE_QUESTS) {
      if (this.completed.has(q.id)) continue;
      try {
        if (q.check(this.game)) this.complete(q);
      } catch (_) { /* ignore */ }
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
  }

  getProgress() {
    return { done: this.completed.size, total: SIDE_QUESTS.length };
  }

  toJSON() {
    return { completed: [...this.completed] };
  }

  fromJSON(data) {
    if (data?.completed) this.completed = new Set(data.completed);
  }
}
