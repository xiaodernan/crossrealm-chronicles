/**
 * 氛围事件扩写 — 合并进 WorldAmbientEvents
 *
 * `text` 存**文案键**（W-D2 切片16a），不是文案本身：显示侧（`WorldAmbientEvents.update()`）
 * 在播出那一刻 `keyText(t(键))` 展开。键名 `ambient_<区>_e<序号>` —— `_e` 是扩展层
 * 的后缀（基础层无后缀、致敬层 `_p`），三张表的同区条目因此不会撞名。
 */
export const ZONE_EVENTS_EXTRA = {
  hub: [
    { text: 'ambient_hub_e0', weight: 0.5 },
    { text: 'ambient_hub_e1', weight: 0.4 },
  ],
  fantasy: [
    { text: 'ambient_fantasy_e0', weight: 0.5, minChapter: 2 },
    { text: 'ambient_fantasy_e1', weight: 0.4 },
  ],
  magic: [
    { text: 'ambient_magic_e0', weight: 0.5 },
    { text: 'ambient_magic_e1', weight: 0.6 },
  ],
  space: [
    { text: 'ambient_space_e0', weight: 0.4 },
    { text: 'ambient_space_e1', weight: 0.5 },
  ],
  void: [
    { text: 'ambient_void_e0', weight: 0.5 },
    { text: 'ambient_void_e1', weight: 0.4 },
  ],
  abyss: [
    { text: 'ambient_abyss_e0', weight: 0.5 },
    { text: 'ambient_abyss_e1', weight: 0.7 },
  ],
};

export function mergeZoneEvents(base) {
  const out = {};
  for (const [zone, list] of Object.entries(base)) {
    out[zone] = [...list, ...(ZONE_EVENTS_EXTRA[zone] ?? [])];
  }
  return out;
}
