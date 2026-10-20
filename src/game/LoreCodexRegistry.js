/** 位面秘典 — lore 条目目录 */
export const LORE_CODEX = [
  { id: 'codex-anchor', zone: 'hub', title: 'codex_anchor_title', text: 'codex_anchor_text', unlock: 'journal:rest-hub-souls' },
  { id: 'codex-walker', zone: 'hub', title: 'codex_walker_title', text: 'codex_walker_text', unlock: 'journal:rest-hub-gallery' },
  { id: 'codex-shadow', zone: 'fantasy', title: 'boss_name_shadow', text: 'codex_shadow_text', unlock: 'journal:rest-fantasy-boss1' },
  { id: 'codex-mage', zone: 'magic', title: 'codex_mage_title', text: 'codex_mage_text', unlock: 'boss:archmagus' },
  { id: 'codex-singularity', zone: 'space', title: 'boss_short_singularity', text: 'codex_singularity_text', unlock: 'boss:singularity-herald' },
  { id: 'codex-void', zone: 'void', title: 'codex_void_title', text: 'codex_void_text', unlock: 'journal:rest-void-hidden' },
  { id: 'codex-chaos', zone: 'abyss', title: 'codex_chaos_title', text: 'codex_chaos_text', unlock: 'boss:chaos-overlord' },
  { id: 'codex-execution', zone: 'combat', title: 'style_label_execution', text: 'codex_execution_text', unlock: 'execution' },
  { id: 'codex-finisher', zone: 'combat', title: 'tip_finisher_title', text: 'codex_finisher_text', unlock: 'finisher' },
  { id: 'codex-rematch', zone: 'hub', title: 'cg_gallery_rematch', text: 'codex_rematch_text', unlock: 'journal:rest-hub-rematch' },
  { id: 'codex-cg', zone: 'hub', title: 'codex_cg_title', text: 'codex_cg_text', unlock: 'cg:bonus:world-anchor' },
  { id: 'codex-dungeon', zone: 'dungeon', title: 'codex_dungeon_title', text: 'codex_dungeon_text', unlock: 'dungeon-clear' },
];

export const CODEX_ZONE_LABELS = {
  all: 'franchise_all_label',
  hub: 'cg_zone_hub',
  fantasy: 'cg_zone_fantasy',
  magic: 'cg_zone_magic',
  space: 'codex_zone_space_label',
  void: 'cg_zone_void',
  abyss: 'cg_zone_abyss',
  combat: 'codex_zone_combat_label',
  dungeon: 'codex_zone_dungeon_label',
};
