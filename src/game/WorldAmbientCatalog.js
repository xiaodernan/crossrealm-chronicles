/** 氛围事件扩写 — 合并进 WorldAmbientEvents */
export const ZONE_EVENTS_EXTRA = {
  hub: [
    { text: 'CG 画廊在日志 [J] — 营火对话会解锁插画。', weight: 0.5 },
    { text: '战斗风格评级在弹反与处决后闪现。', weight: 0.4 },
  ],
  fantasy: [
    { text: '影界守护者信标光柱在东北 — 击败后可 E 再战。', weight: 0.5, minChapter: 2 },
    { text: '精灵斥候在营火边哼着旧战歌。', weight: 0.4 },
  ],
  magic: [
    { text: '奥术屑在禁书方向聚集 — 秘典条目等待收录。', weight: 0.5 },
    { text: '大奥术师法球破空声从城堡传来。', weight: 0.6 },
  ],
  space: [
    { text: 'F2 拍照模式可捕捉引力透镜与信标光柱。', weight: 0.4 },
    { text: 'Endurance 号残骸在风里发出金属共鸣。', weight: 0.5 },
  ],
  void: [
    { text: '时线折叠处，Esc 可跳过处决慢镜头。', weight: 0.5 },
    { text: '营火记忆会记录你睡过的每一簇火。', weight: 0.4 },
  ],
  abyss: [
    { text: '成就墙在日志 [J] — 终局后仍可收集。', weight: 0.5 },
    { text: '混沌脉冲与闪电同步 — 裂隙在呼吸。', weight: 0.7 },
  ],
};

export function mergeZoneEvents(base) {
  const out = {};
  for (const [zone, list] of Object.entries(base)) {
    out[zone] = [...list, ...(ZONE_EVENTS_EXTRA[zone] ?? [])];
  }
  return out;
}
