/** 氛围 / Lore Wave3 — 三巨头母题 */
export const ZONE_EVENTS_POP_WAVE3 = {
  fantasy: [
    { text: '沙龙镜墙方向传来旋转门吱呀声 — 边境往事在灰林边缘苏醒。', weight: 0.45 },
    { text: '正午决斗圈的 chalk 线在雾里发亮 — 别在圈里恋战。', weight: 0.4 },
    { text: '幽灵铁道远处汽笛 — 火车从不到站。', weight: 0.35 },
  ],
  abyss: [
    { text: '禁酒窖门缝漏出暖光 — 幽冥帮派在谈界关税。', weight: 0.5 },
    { text: '码头货仓木箱碰撞 — 魂火走私线仍通。', weight: 0.45 },
    { text: '家族圣龛三支蜡烛照黑镜 — 镜里不是你自己。', weight: 0.4 },
  ],
  space: [
    { text: '殖民穹顶内是人工黄昏 — 荒原外是另一个天空。', weight: 0.5 },
    { text: '休眠 AI 核心低频嗡鸣：「任务未完成。」', weight: 0.45 },
    { text: '跃迁门阵列蓝光脉动 — 三门须同相。', weight: 0.4 },
  ],
  hub: [
    { text: '海报墙新增三色 — 西部、黑帮、深空科幻母题已写入回声。', weight: 0.35 },
  ],
};

export const LORE_FRAGMENTS_POP_WAVE3 = [
  { id: 'lore-saloon', title: '沙龙镜墙残页', text: '「裂镜里的倒影永远快半拍 — 决斗前先问：你在打谁？」', chapter: 1 },
  { id: 'lore-speakeasy', title: '禁酒窖收据', text: '「关税不是金币，是魂火 — 幽冥帮派管界与界之间的缝。」', chapter: 5 },
  { id: 'lore-ai-core', title: 'AI 核心日志', text: '「任务未完成。目标：位面行者。优先级：高于跃迁。」', chapter: 3 },
  { id: 'lore-jump-gate', title: '跃迁门手册', text: '「三门同相。错相者循环第一秒 — 比米勒沙漏更残酷。」', chapter: 3 },
  { id: 'lore-duel', title: '决斗圈 chalk', text: '「正午太阳不动，直到有人拔剑 — 或 F 弹反。」', chapter: 1 },
];

export const NPC_LINES_POP_WAVE3 = {
  'elf-scout': {
    1: ['沙龙镜墙在灰林东侧 — 边境往事从裂镜开始。', '正午决斗圈别恋战 — 太阳不会等你。'],
  },
  wanderer: {
    5: ['混沌边境的禁酒窖 — 幽冥帮派谈界关税。', '深空纪元跃迁门须三门同相。'],
  },
};

export function mergePopCultureAmbientWave3(base) {
  const out = { ...base };
  for (const [z, list] of Object.entries(ZONE_EVENTS_POP_WAVE3)) {
    out[z] = [...(out[z] ?? []), ...list];
  }
  return out;
}

export function mergeNpcChapterLinesWave3(base) {
  const out = structuredClone(base);
  for (const [npc, chapters] of Object.entries(NPC_LINES_POP_WAVE3)) {
    if (!out[npc]) out[npc] = {};
    for (const [ch, lines] of Object.entries(chapters)) {
      out[npc][ch] = [...(out[npc][ch] ?? []), ...lines];
    }
  }
  return out;
}
