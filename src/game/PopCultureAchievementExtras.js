/** 次元回声成就的**监听**（数据在 content/achievements.js，母题分组只认 franchises.js 的 id —— 修 B36） */
import { ECHO_FRANCHISE_BUCKETS } from '../content/achievements.js';

export function attachPopCultureAchievements(ach) {
  window.addEventListener('pop-culture-unlocked', () => {
    const sys = ach.game?.popCulture;
    if (!sys) return;
    const stats = sys.getStats();
    ach.stats.echoPercent = stats.percent;
    const unlocked = sys.getEntries('all').filter((e) => sys.unlocked.has(e.id));
    for (const [key, franchise] of ECHO_FRANCHISE_BUCKETS) {
      ach.stats[key] = unlocked.filter((e) => e.franchise === franchise).length;
    }
    ach.checkAll();
  });
}