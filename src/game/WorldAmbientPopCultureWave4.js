export const ZONE_EVENTS_POP_WAVE4 = {
  magic: [{ text: '霓虹后巷全息短路 — 赛博渗入遗境。', weight: 0.4 }],
  fantasy: [{ text: '鸟居残门在雾里发红 — 武士残响未散。', weight: 0.4 }],
  void: [{ text: '螺旋深井回声在数数 — 别靠近井口。', weight: 0.45 }],
  space: [{ text: '星港酒肆百种方言混成一种笑。', weight: 0.4 }],
};

export const LORE_FRAGMENTS_POP_WAVE4 = [
  { id: 'lore-neon', title: '霓虹收据', text: '「义眼 99% 真实 — 1% 是广告。」', chapter: 2 },
  { id: 'lore-torii', title: '鸟居残铭', text: '「门后不是神域 — 是决斗。」', chapter: 1 },
  { id: 'lore-obelisk', title: '方尖碑拓片', text: '「铭文是角度 — 不是字。」', chapter: 4 },
  { id: 'lore-cantina', title: '星港菜单', text: '「特供：跃迁合同、赏金、坐标。」', chapter: 3 },
];

export function mergePopCultureAmbientWave4(base) {
  const out = { ...base };
  for (const [z, list] of Object.entries(ZONE_EVENTS_POP_WAVE4)) {
    out[z] = [...(out[z] ?? []), ...list];
  }
  return out;
}

export function mergeNpcChapterLinesWave4(base) {
  return base;
}
