/** 次元回声相关成就 */

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



export function attachPopCultureAchievements(ach) {

  window.addEventListener('pop-culture-unlocked', () => {

    const sys = ach.game?.popCulture;

    if (!sys) return;

    const stats = sys.getStats();

    ach.stats.echoPercent = stats.percent;

    const entries = sys.getEntries('all');

    const unlocked = entries.filter((e) => sys.unlocked.has(e.id));

    ach.stats.echoWizard = unlocked.filter((e) => e.franchise === '魔法学院').length;

    ach.stats.echoSpace = unlocked.filter((e) => e.franchise === '星际穿越').length;

    ach.stats.echoUpside = unlocked.filter((e) => e.franchise === '逆相界').length;
    ach.stats.echoWestern = unlocked.filter((e) => e.franchise === '边境往事').length;
    ach.stats.echoGangster = unlocked.filter((e) => e.franchise === '幽冥帮派').length;
    ach.stats.echoSciFi = unlocked.filter((e) => e.franchise === '深空纪元').length;
    ach.stats.echoCyber = unlocked.filter((e) => e.franchise === '赛博霓虹').length;
    ach.stats.echoSamurai = unlocked.filter((e) => e.franchise === '武士残响').length;
    ach.stats.echoCosmic = unlocked.filter((e) => e.franchise === '旧日低语').length;
    ach.stats.echoStarport = unlocked.filter((e) => e.franchise === '星港商路').length;

    ach.checkAll();

  });

}


