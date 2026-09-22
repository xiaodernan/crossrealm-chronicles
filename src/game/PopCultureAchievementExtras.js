/** 次元回声相关成就 —— 母题分组只认 `src/content/franchises.js` 里的 id（修 B36） */
import { FRANCHISE } from '../content/franchises.js';

export const ACHIEVEMENTS_POP_CULTURE = [

  { id: 'echo-half', title: '半频共鸣', desc: '次元回声解锁 50%', check: (s) => (s.echoPercent ?? 0) >= 50 },

  { id: 'echo-full', title: '全频行者', desc: '解锁全部次元回声', check: (s) => (s.echoPercent ?? 0) >= 100 },

  { id: 'echo-wizard', title: '学院毕业生', desc: '共鸣全部魔法学院回声', check: (s) => (s.echoWizard ?? 0) >= 8 },

  { id: 'echo-space', title: '方程闭合', desc: '共鸣全部星际穿越回声', check: (s) => (s.echoSpace ?? 0) >= 8 },

  { id: 'echo-upside', title: '逆相幸存者', desc: '共鸣全部逆相界回声', check: (s) => (s.echoUpside ?? 0) >= 9 },
  { id: 'echo-western', title: '边境枪手', desc: '共鸣全部边境往事回声', check: (s) => (s.echoWestern ?? 0) >= 3 },
  { id: 'echo-gangster', title: '幽冥话事人', desc: '共鸣全部幽冥帮派回声', check: (s) => (s.echoGangster ?? 0) >= 3 },
  { id: 'echo-scifi', title: '深空领航员', desc: '共鸣全部深空纪元回声', check: (s) => (s.echoSciFi ?? 0) >= 3 },
  { id: 'echo-triad', title: '三巨头同频', desc: '边境+帮派+深空各系列全共鸣', check: (s) => (s.echoWestern ?? 0) >= 3 && (s.echoGangster ?? 0) >= 3 && (s.echoSciFi ?? 0) >= 3 },
  { id: 'echo-cyber', title: '霓虹行者', desc: '共鸣全部赛博霓虹回声', check: (s) => (s.echoCyber ?? 0) >= 3 },
  { id: 'echo-samurai', title: '残响剑士', desc: '共鸣全部武士残响回声', check: (s) => (s.echoSamurai ?? 0) >= 3 },
  { id: 'echo-cosmic', title: '深井生还', desc: '共鸣全部旧日低语回声', check: (s) => (s.echoCosmic ?? 0) >= 3 },
  { id: 'echo-starport', title: '星港老手', desc: '共鸣全部星港商路回声', check: (s) => (s.echoStarport ?? 0) >= 3 },
  { id: 'echo-wave4', title: '四系同频', desc: 'Wave4 四系列全共鸣', check: (s) => (s.echoCyber ?? 0) >= 3 && (s.echoSamurai ?? 0) >= 3 && (s.echoCosmic ?? 0) >= 3 && (s.echoStarport ?? 0) >= 3 },
];

/**
 * 成就统计按母题 id 分桶。
 *
 * 写成「一张表 + 一次循环」而不是十二行 `filter`：门限值由 `tests/pop-culture-content.test.js`
 * 拿目录实际条数核对，母题改名只会动 `franchises.js` 一处。
 */
export const ECHO_FRANCHISE_BUCKETS = [
  ['echoWizard', FRANCHISE.WIZARD],
  ['echoSpace', FRANCHISE.INTERSTELLAR],
  ['echoUpside', FRANCHISE.UPSIDE],
  ['echoWestern', FRANCHISE.BORDER],
  ['echoGangster', FRANCHISE.FAMILY],
  ['echoSciFi', FRANCHISE.DEEPSPACE],
  ['echoCyber', FRANCHISE.CYBER],
  ['echoSamurai', FRANCHISE.SAMURAI],
  ['echoCosmic', FRANCHISE.COSMIC],
  ['echoStarport', FRANCHISE.STARPORT],
];

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
