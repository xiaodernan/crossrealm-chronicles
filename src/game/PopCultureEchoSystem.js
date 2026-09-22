import { POP_CULTURE_ECHOES } from './PopCultureHomageRegistry.js';

/** 次元回声解锁 — 发现 POI / 致敬点时写入 */
export class PopCultureEchoSystem {
  constructor(game) {
    this.game = game;
    this.unlocked = new Set();
    this.setupListeners();
  }

  setupListeners() {
    window.addEventListener('discovery', (e) => {
      const id = e.detail?.id;
      if (id) this.tryUnlock(`discovery:${id}`);
    });
    window.addEventListener('pop-culture-echo', (e) => {
      const key = e.detail?.trigger;
      if (key) this.tryUnlock(key);
    });
  }

  tryUnlock(triggerKey) {
    for (const echo of POP_CULTURE_ECHOES) {
      if (echo.trigger !== triggerKey || this.unlocked.has(echo.id)) continue;
      this.unlocked.add(echo.id);
      this.game.dialog?.toast(`📡 次元回声：${echo.title}`, 3400);
      this.game.storyJournal?.add?.({
        id: echo.id,
        category: 'fragment',
        title: `[${echo.franchise}] ${echo.title}`,
        text: echo.desc,
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
    return POP_CULTURE_ECHOES.filter((e) => franchise === 'all' || e.franchise === franchise);
  }

  getStats() {
    const total = POP_CULTURE_ECHOES.length;
    return { unlocked: this.unlocked.size, total, percent: total ? Math.round((this.unlocked.size / total) * 100) : 0 };
  }

  toJSON() {
    return { unlocked: [...this.unlocked] };
  }

  fromJSON(data) {
    if (data?.unlocked) this.unlocked = new Set(data.unlocked);
  }
}
