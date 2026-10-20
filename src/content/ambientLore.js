/**
 * 世界氛围文案 —— 致敬向（W-B2 数据外移）。
 *
 * 这里是"区域低语 / Lore 碎片 / NPC 章节台词"的唯一真源。
 * 搬前它们散在 `WorldAmbientPopCulture.js` 与 `WorldAmbientPopCultureWave3/4.js`、
 * `LoreFragmentsPopCulture.js` 四层里，靠三层 `merge*Wave4(merge*Wave3(base))` 叠出来 ——
 * 每加一条要先回答"该加进哪一层"，而那一层除了历史顺序没有任何含义。
 * 现在按**合并以后的有效值**平铺成一张表，形状由 `content/registry.js` 在加载期校验。
 *
 * ## 文案键（W-D2 切片16a/16b）
 *
 * 这两张表里的每一个字都是玩家会看到的（toast / 对话框 / 日志条目），
 * 改前全是裸中文 —— 切到英文语言时它们**原样留在中文**，界面上一半英文一半中文，
 * 而没有任何一处会报错。现在数据层只存**文案键**，显示侧在播出那一刻展开：
 * - 区域氛围事件：`ambient_<区>_<序号>`，扩展层 `_e` 后缀、致敬层 `_p` 后缀
 * - 致敬层 lore 碎片：`lore_pop_<slug>_title` / `lore_pop_<slug>_text`
 *
 * 键即身份：`seen` 去重账用键而不是文案前若干个字 —— 换语言时同一句的文案变了，
 * 键没变，那条"已见过"才不会因为换了语言就重新弹一遍。
 */

/**
 * 区域氛围事件：zoneId → 候选台词（weight 是相对权重，0~1）
 *
 * `text` 存**文案键**，不是文案本身 —— 显示侧（`WorldAmbientEvents.update()`）
 * 在播出那一刻 `keyText(t(键))` 展开。
 */
export const ZONE_EVENTS_POP = {
  magic: [
    { text: "ambient_magic_p0", weight: 0.6 },
    { text: "ambient_magic_p1", weight: 0.5 },
    { text: "ambient_magic_p2", weight: 0.45 },
    { text: "ambient_magic_p3", weight: 0.4 },
    { text: "ambient_magic_p4", weight: 0.4 },
  ],
  space: [
    { text: "ambient_space_p0", weight: 0.5 },
    { text: "ambient_space_p1", weight: 0.6 },
    { text: "ambient_space_p2", weight: 0.4 },
    { text: "ambient_space_p3", weight: 0.45 },
    { text: "ambient_space_p4", weight: 0.35 },
    { text: "ambient_space_p5", weight: 0.5 },
    { text: "ambient_space_p6", weight: 0.45 },
    { text: "ambient_space_p7", weight: 0.4 },
    { text: "ambient_space_p8", weight: 0.4 },
  ],
  void: [
    { text: "ambient_void_p0", weight: 0.7 },
    { text: "ambient_void_p1", weight: 0.5 },
    { text: "ambient_void_p2", weight: 0.4 },
    { text: "ambient_void_p3", weight: 0.45 },
    { text: "ambient_void_p4", weight: 0.5 },
    { text: "ambient_void_p5", weight: 0.35 },
    { text: "ambient_void_p6", weight: 0.45 },
  ],
  fantasy: [
    { text: "ambient_fantasy_p0", weight: 0.5 },
    { text: "ambient_fantasy_p1", weight: 0.45 },
    { text: "ambient_fantasy_p2", weight: 0.4 },
    { text: "ambient_fantasy_p3", weight: 0.35 },
    { text: "ambient_fantasy_p4", weight: 0.4 },
  ],
  hub: [
    { text: "ambient_hub_p0", weight: 0.4 },
    { text: "ambient_hub_p1", weight: 0.35 },
  ],
  abyss: [
    { text: "ambient_abyss_p0", weight: 0.5 },
    { text: "ambient_abyss_p1", weight: 0.45 },
    { text: "ambient_abyss_p2", weight: 0.4 },
  ],
};

/**
 * Lore 碎片：章节门控的叙事碎片
 *
 * `title` / `text` 存**文案键**（W-D2 切片16b），不是文案本身 ——
 * 显示侧（`DungeonManager.tryReadLore` / `PlayerController` 的交互提示）
 * 在播出那一刻 `keyText(t(键))` 展开。
 */
export const LORE_FRAGMENTS_POP = [
  { id: "lore-wizard", title: "lore_pop_wizard_title", text: "lore_pop_wizard_text", chapter: 2 },
  { id: "lore-inter", title: "lore_pop_inter_title", text: "lore_pop_inter_text", chapter: 3 },
  { id: "lore-upside", title: "lore_pop_upside_title", text: "lore_pop_upside_text", chapter: 4 },
  { id: "lore-murphy", title: "lore_pop_murphy_title", text: "lore_pop_murphy_text", chapter: 3 },
  { id: "lore-broom", title: "lore_pop_broom_title", text: "lore_pop_broom_text", chapter: 2 },
  { id: "lore-nine", title: "lore_pop_nine_title", text: "lore_pop_nine_text", chapter: 2 },
  { id: "lore-wormhole", title: "lore_pop_wormhole_title", text: "lore_pop_wormhole_text", chapter: 3 },
  { id: "lore-arcade", title: "lore_pop_arcade_title", text: "lore_pop_arcade_text", chapter: 4 },
  { id: "lore-vecna", title: "lore_pop_vecna_title", text: "lore_pop_vecna_text", chapter: 4 },
  { id: "lore-saloon", title: "lore_pop_saloon_title", text: "lore_pop_saloon_text", chapter: 1 },
  { id: "lore-speakeasy", title: "lore_pop_speakeasy_title", text: "lore_pop_speakeasy_text", chapter: 5 },
  { id: "lore-ai-core", title: "lore_pop_ai_core_title", text: "lore_pop_ai_core_text", chapter: 3 },
  { id: "lore-jump-gate", title: "lore_pop_jump_gate_title", text: "lore_pop_jump_gate_text", chapter: 3 },
  { id: "lore-duel", title: "lore_pop_duel_title", text: "lore_pop_duel_text", chapter: 1 },
  { id: "lore-neon", title: "lore_pop_neon_title", text: "lore_pop_neon_text", chapter: 2 },
  { id: "lore-torii", title: "lore_pop_torii_title", text: "lore_pop_torii_text", chapter: 1 },
  { id: "lore-obelisk", title: "lore_pop_obelisk_title", text: "lore_pop_obelisk_text", chapter: 4 },
  { id: "lore-cantina", title: "lore_pop_cantina_title", text: "lore_pop_cantina_text", chapter: 3 },
];

/**
 * NPC 章节台词：npcId → { 章节号: [台词...] }
 */
/**
 * 致敬层追加的 NPC 章节台词（W-D2 切片14）。
 *
 * 与基础池同一个口径：**这里存文案键**，正文在双表里（`npc_<谁>_c<章>_p<下标>`）。
 * 合并进 `NPC_CHAPTER_LINES` 的顺序是"基础池在前、这一池追加在后"，
 * 键里的 `_p` 前缀让"池内下标"这件事在两种来源之间不会串。
 */
export const NPC_LINES_POP = {
  "astronaut-echo": { 3: [ "npc_astronaut_c3_p0", "npc_astronaut_c3_p1", "npc_astronaut_c3_p2" ] },
  "elf-scout": { 1: [ "npc_scout_c1_p0", "npc_scout_c1_p1" ], 2: [ "npc_scout_c2_p0" ] },
  wanderer: {
    "4": [ "npc_wanderer_c4_p0", "npc_wanderer_c4_p1" ],
    "5": [ "npc_wanderer_c5_p0", "npc_wanderer_c5_p1" ],
  },
};

/** 把致敬向氛围事件并进基础表（按区域追加，不动已有条目） */
export function mergePopCultureAmbient(base) {
  const out = { ...base };
  for (const [zone, list] of Object.entries(ZONE_EVENTS_POP)) {
    out[zone] = [...(out[zone] ?? []), ...list];
  }
  return out;
}

/** 把致敬向 NPC 台词并进章节台词表 */
export function mergeNpcChapterLines(base) {
  const out = structuredClone(base);
  for (const [npc, chapters] of Object.entries(NPC_LINES_POP)) {
    if (!out[npc]) out[npc] = {};
    for (const [chapter, lines] of Object.entries(chapters)) {
      out[npc][chapter] = [...(out[npc][chapter] ?? []), ...lines];
    }
  }
  return out;
}
