/** 武器技能与剧情联动 — 章节门控 + Boss/任务自动解锁 */
export const STORY_SKILL_META = {
  's-blade': { chapter: 1, lore: '位面流浪者：「先学会挥剑，再学会在位面间挥剑。」' },
  's-combo': { chapter: 2, loreFragments: 1, lore: '精灵斥候：「连击不是炫耀 — 是压制。」' },
  's-riposte': { chapter: 2, boss: 'shadow-warden', lore: '影界守护者倒下后，你理解了弹反的 rhythm。' },
  's-finisher': { chapter: 3, boss: 'archmagus', lore: '大奥术师的最后一击被你学去 — 用于终结连段。' },
  'm-arcane': { chapter: 2, lore: '魔法遗境的残页记载：奥术共鸣始于营火。' },
  'm-charge': { chapter: 3, loreFragments: 2, lore: '蓄力是信任 — 信任法力会回应你。' },
  'm-mana': { chapter: 2, quest: 'spells', lore: '宇航员回声：「时间在这里是圆的 — 法力也是。」' },
  'm-transform': { chapter: 4, boss: 'singularity-herald', lore: '奇点领主的化身术式被你逆向解析。' },
};

/** Boss/章节击败后自动解锁（0 技能点） */
export const NARRATIVE_SKILLS = {
  sword: [
    {
      id: 's-shadow-cut',
      name: '影界斩',
      desc: '近战 +5% · 弹反窗口 +0.05s',
      effect: { melee: 0.05, riposte: 0.05 },
      unlock: { boss: 'shadow-warden' },
      lore: '影界守护者的剑意残留于你的位面长剑。',
    },
    {
      id: 's-realm-slash',
      name: '位面斩强化',
      desc: '位面斩 R 伤害 +25%',
      effect: { skill: 0.25 },
      unlock: { boss: 'singularity-herald' },
      lore: '奇点领主坍缩瞬间，你截获了引力刃的一缕余波。',
    },
    {
      id: 's-infinity',
      name: '无尽行者',
      desc: '终结技伤害 +30% · 连击 +10%',
      effect: { finisher: 0.3, combo: 0.1 },
      unlock: { boss: 'chaos-overlord' },
      lore: '斩裂混沌后，你的剑成为位面行者的证明。',
    },
  ],
  staff: [
    {
      id: 'm-arcane-ii',
      name: '奥术共鸣 II',
      desc: '法术 +8%',
      effect: { spell: 0.08 },
      unlock: { boss: 'archmagus' },
      lore: '大奥术师萨尔林的法杖碎片融入你的杖芯。',
    },
    {
      id: 'm-chrono',
      name: '时线洞察',
      desc: '蓄力伤害 +15% · 打断时停',
      effect: { charge: 0.15 },
      unlock: { boss: 'void-chronarch' },
      lore: '时线执政官的钟表停在你胜利的那一刻。',
    },
    {
      id: 'm-chaos-weave',
      name: '混沌织法',
      desc: '法力 +20 · 法术 +5%',
      effect: { mana: 20, spell: 0.05 },
      unlock: { chapter: 5 },
      lore: 'Ch5 边境的混沌低语被你驯服为法力。',
    },
  ],
};

export function getStoryLockReason(game, skillId) {
  const meta = STORY_SKILL_META[skillId];
  if (!meta) return null;
  const q = game.quests;
  if (meta.chapter && (q.chapter ?? 1) < meta.chapter) {
    return `需 Chapter ${meta.chapter}`;
  }
  if (meta.loreFragments) {
    const fr = game.storyJournal?.getCounts?.().fragment ?? 0;
    if (fr < meta.loreFragments) return `需 ${meta.loreFragments} 条叙事碎片 (${fr}/${meta.loreFragments})`;
  }
  if (meta.boss) {
    const map = {
      'shadow-warden': q.stats.bossDefeated,
      archmagus: q.stats.boss2Defeated,
      'singularity-herald': q.stats.boss3Defeated,
      'void-chronarch': q.stats.voidBossDefeated,
      'chaos-overlord': q.stats.chaosBossDefeated,
    };
    if (!map[meta.boss]) return '需击败对应 Boss';
  }
  return null;
}
