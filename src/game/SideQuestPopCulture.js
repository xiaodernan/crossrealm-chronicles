/** 致敬向支线追加 —— 母题分组只认 franchises.js 的 id（修 B36） */
import { FRANCHISE } from '../content/franchises.js';
export const SIDE_QUESTS_POP = [
  {
    id: 'side-echo-half',
    title: '次元共鸣者',
    desc: '次元回声解锁 50%',
    check: (g) => (g.popCulture?.getStats()?.percent ?? 0) >= 50,
    reward: 25,
    journal: '你与六个位面的「回声」同频 — 海报墙为你亮起。',
  },
  {
    id: 'side-wizard-tour',
    title: '咒术学院巡礼',
    desc: '共鸣 3 个魔法学院回声',
    check: (g) => countFranchise(g, FRANCHISE.WIZARD) >= 3,
    reward: 15,
    journal: '环赛、温室、分院 — 学院的三道门都已叩响。',
  },
  {
    id: 'side-space-tour',
    title: '星际方程',
    desc: '共鸣 3 个星际穿越回声',
    check: (g) => countFranchise(g, FRANCHISE.INTERSTELLAR) >= 3,
    reward: 15,
    journal: '沙漏、书架、对接 — 方程的三个变量齐了。',
  },
  {
    id: 'side-upside-tour',
    title: '逆相界幸存者',
    desc: '共鸣 3 个逆相界回声',
    check: (g) => countFranchise(g, FRANCHISE.UPSIDE) >= 3,
    reward: 18,
    journal: '广播塔、裂口、霓虹 — 1983 年的风不再追你。',
  },
  {
    id: 'side-echo-full',
    title: '全频行者',
    desc: '解锁全部次元回声',
    check: (g) => (g.popCulture?.getStats()?.percent ?? 0) >= 100,
    reward: 40,
    journal: '所有回声同频 — 海报墙六色齐亮，六个梦在同一句台词里醒来。',
  },
  {
    id: 'side-western-tour',
    title: '边境巡礼',
    desc: '共鸣 3 个边境往事回声',
    check: (g) => countFranchise(g, FRANCHISE.BORDER) >= 3,
    reward: 18,
    journal: '沙龙、决斗圈、铁道 — 边境三声枪响都已共鸣。',
  },
  {
    id: 'side-gangster-tour',
    title: '幽冥入会',
    desc: '共鸣 3 个幽冥帮派回声',
    check: (g) => countFranchise(g, FRANCHISE.FAMILY) >= 3,
    reward: 20,
    journal: '禁酒窖、圣龛、货仓 — 帮派的三道门都已叩响。',
  },
  {
    id: 'side-scifi-tour',
    title: '深空编年',
    desc: '共鸣 3 个深空纪元回声',
    check: (g) => countFranchise(g, FRANCHISE.DEEPSPACE) >= 3,
    reward: 18,
    journal: '穹顶、AI、跃迁门 — 科幻方程的三个变量齐了。',
  },
  {
    id: 'side-triad-master',
    title: '三巨头同频',
    desc: '边境+帮派+深空各系列全共鸣',
    check: (g) =>
      countFranchise(g, FRANCHISE.BORDER) >= 3 &&
      countFranchise(g, FRANCHISE.FAMILY) >= 3 &&
      countFranchise(g, FRANCHISE.DEEPSPACE) >= 3,
    reward: 35,
    journal: '西部、黑帮、科幻 — 三巨头母题在同一条位面线上对齐。',
  },
  { id: 'side-cyber-tour', title: '赛博巡礼', desc: '共鸣 3 个赛博霓虹回声', check: (g) => countFranchise(g, FRANCHISE.CYBER) >= 3, reward: 18, journal: '霓虹、诊所、尖塔 — 赛博三灯齐亮。' },
  { id: 'side-samurai-tour', title: '武士入门', desc: '共鸣 3 个武士残响回声', check: (g) => countFranchise(g, FRANCHISE.SAMURAI) >= 3, reward: 18, journal: '鸟居、道场、刃冢 — 最后一式已共鸣。' },
  { id: 'side-cosmic-tour', title: '旧日幸存者', desc: '共鸣 3 个旧日低语回声', check: (g) => countFranchise(g, FRANCHISE.COSMIC) >= 3, reward: 22, journal: '方尖碑、抄写室、深井 — 回声不再数你。' },
  { id: 'side-starport-tour', title: '星港常客', desc: '共鸣 3 个星港商路回声', check: (g) => countFranchise(g, FRANCHISE.STARPORT) >= 3, reward: 18, journal: '酒肆、码头、星图 — 航线已谈判通过。' },
  { id: 'side-wave4-master', title: '四系行者', desc: 'Wave4 四系列全共鸣', check: (g) => [FRANCHISE.CYBER, FRANCHISE.SAMURAI, FRANCHISE.COSMIC, FRANCHISE.STARPORT].every((f) => countFranchise(g, f) >= 3), reward: 45, journal: '赛博、武士、旧日、星港 — 四系在同一条回声线上对齐。' },
];

function countFranchise(game, franchise) {
  const sys = game.popCulture;
  if (!sys) return 0;
  return sys.getEntries('all').filter((e) => e.franchise === franchise && sys.unlocked.has(e.id)).length;
}

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
