/** 致敬向支线的**挂载**（条目在 content/sideQuests.js；母题分组只认 franchises.js 的 id —— 修 B36） */
import { SIDE_QUESTS_POP } from '../content/sideQuests.js';

export function attachPopCultureSideQuests(sideQuestSystem) {
  const origCheck = sideQuestSystem.checkAll.bind(sideQuestSystem);
  sideQuestSystem.checkAll = function () {
    origCheck();
    for (const q of SIDE_QUESTS_POP) {
      if (this.completed.has(q.id)) continue;
      try {
        if (q.check(this.game)) this.complete(q);
      } catch (_) { /* ignore */ }
    }
  };
}