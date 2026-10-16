/**
 * 营火对话 CG 的预设表 —— 纯数据（W-B1 切片1）。
 *
 * 从 `ui/DialogCGRenderer*.js` 四个文件里搬过来。它们原本是"数据与绘制混住"：
 * 表定义在渲染器旁边，于是 `game/CgGalleryRegistry.js`（要枚举全部 CG 建画廊目录）
 * 只能 `import ... from '../ui/DialogCGRenderer.js'` —— 那是 `chunk-core → chunk-ui`
 * 的一条回边，B37 循环分块的成因之一。
 *
 * 拆分口径：**"有哪些 CG、叫什么、什么场景"是数据**，留在 `ui/` 的是
 * "怎么把它画出来"（`ui/DialogCGRenderer.js` 的 `CG_PAINTERS` 与致敬层的 `POP_CG_PAINTERS`）。
 * 数据进了 `content/` 之后，画廊目录与渲染器读的是同一份，不会再各有一半。
 *
 * 合并顺序：基础表 → `_EXTRA` → `_POP`。三张名单**必须互不相交** ——
 * spread 的同名键是后层静默盖掉前层，界面上只看得到后一张的画面，谁也不知道少了一层。
 * 这条不相交由 `registry.js` 的 `checkDialogueCgPresets` 在开机时逐键核（注册表条目 `restDialogueCg`）。
 *
 * 键是 `<营火 id>:<节点 id>` 的复合串，而 `game/CgGalleryRegistry.js` 直接按每个键建一行画廊目录：
 * 写错的节点名 = 一条玩家永远解锁不了的画廊行，而 `side-cg-half` / 成就 `cg-half` 读的分母就是那张目录。
 */
export const REST_DIALOGUE_CG_BASE = {
  'hub:start': { scene: 'anchor_fire', caption: 'cg_caption_hub_start' },
  'hub:origin': { scene: 'anchor_fire', caption: 'cg_caption_hub_origin' },
  'hub:quest': { scene: 'quest_scroll', caption: 'cg_caption_hub_quest' },
  'hub:walker': { scene: 'walker_silhouette', caption: 'cg_caption_hub_walker' },
  'fantasy:start': { scene: 'forest_camp', caption: 'cg_caption_fantasy_start' },
  'fantasy:deep': { scene: 'forest_map', caption: 'cg_caption_fantasy_deep' },
  'fantasy:tip': { scene: 'combat_tutorial', caption: 'cg_caption_fantasy_tip' },
  'fantasy:boss1': { scene: 'boss_shadow', caption: 'cg_caption_fantasy_boss1', mood: 'warn' },
  'magic:start': { scene: 'magic_castle', caption: 'cg_caption_magic_start' },
  'magic:spell': { scene: 'spell_orbs', caption: 'cg_caption_magic_spell' },
  'magic:boss2': { scene: 'boss_mage', caption: 'cg_caption_magic_boss2', mood: 'warn' },
  'space:start': { scene: 'space_endurance', caption: 'cg_caption_space_start' },
  'space:well': { scene: 'gravity_well', caption: 'cg_caption_space_well', mood: 'warn' },
  'space:boss3': { scene: 'boss_singularity', caption: 'cg_caption_space_boss3' },
  'void:start': { scene: 'void_time', caption: 'cg_caption_void_start' },
  'void:stop': { scene: 'time_stop', caption: 'cg_caption_void_stop', mood: 'warn' },
  'void:hidden': { scene: 'hidden_boss', caption: 'cg_caption_void_hidden' },
  'void:exec': { scene: 'execution_art', caption: 'cg_caption_void_exec' },
  'abyss:start': { scene: 'chaos_border', caption: 'cg_caption_abyss_start', mood: 'warn' },
  'abyss:end': { scene: 'final_gate', caption: 'cg_caption_abyss_end' },
  'abyss:boss5': { scene: 'boss_chaos', caption: 'cg_caption_abyss_boss5', mood: 'warn' },
  'gloom:start': { scene: 'misty_camp', caption: 'cg_caption_gloom_start' },
  'gloom:deep': { scene: 'misty_map', caption: 'cg_caption_gloom_deep' },
  'gloom:wraith': { scene: 'gloom_wraith', caption: 'cg_caption_gloom_wraith', mood: 'warn' },
  'gloom:lantern': { scene: 'misty_camp', caption: 'cg_caption_gloom_lantern' },
  'radiant:start': { scene: 'golden_sands', caption: 'cg_caption_radiant_start' },
  'radiant:deep': { scene: 'radiant_map', caption: 'cg_caption_radiant_deep' },
  'radiant:knight': { scene: 'radiant_knight', caption: 'cg_caption_radiant_knight', mood: 'warn' },
  'radiant:gold': { scene: 'golden_sands', caption: 'cg_caption_radiant_gold' },
};

export const REST_DIALOGUE_CG_EXTRA = {
  'hub:gallery': { scene: 'quest_scroll', caption: 'cg_caption_hub_gallery' },
  'hub:style': { scene: 'combat_tutorial', caption: 'cg_caption_hub_style' },
  'hub:rematch': { scene: 'boss_shadow', caption: 'cg_caption_hub_rematch' },
  'fantasy:wisp': { scene: 'forest_camp', caption: 'cg_caption_fantasy_wisp' },
  'fantasy:journal': { scene: 'forest_map', caption: 'cg_caption_fantasy_journal' },
  'magic:cg': { scene: 'boss_mage', caption: 'cg_caption_magic_cg' },
  'magic:codex': { scene: 'spell_orbs', caption: 'cg_caption_magic_codex' },
  'space:photo': { scene: 'space_endurance', caption: 'cg_caption_space_photo' },
  'space:rematch': { scene: 'boss_singularity', caption: 'cg_caption_space_rematch' },
  'void:skip': { scene: 'execution_art', caption: 'cg_caption_void_skip' },
  'void:memory': { scene: 'void_time', caption: 'cg_caption_void_memory' },
  'abyss:achieve': { scene: 'final_gate', caption: 'cg_caption_abyss_achieve' },
  'abyss:legend': { scene: 'boss_chaos', caption: 'cg_caption_abyss_legend', mood: 'warn' },
  'hub:dungeon': { scene: 'forest_map', caption: 'cg_caption_hub_dungeon' },
  'hub:side': { scene: 'quest_scroll', caption: 'cg_caption_hub_side' },
  'fantasy:streak': { scene: 'combat_tutorial', caption: 'cg_caption_fantasy_streak' },
  'magic:skills': { scene: 'spell_orbs', caption: 'cg_caption_magic_skills' },
  'void:death': { scene: 'void_time', caption: 'cg_caption_void_death' },
  'abyss:credits': { scene: 'final_gate', caption: 'cg_caption_abyss_credits' },
};

export const REST_DIALOGUE_CG_POP = {
  'magic:wizard': { scene: 'wizard_school', caption: 'cg_caption_magic_wizard' },
  'magic:broom': { scene: 'broom_ring', caption: 'cg_caption_magic_broom' },
  'space:interstellar': { scene: 'murphy_shelf', caption: 'cg_caption_space_interstellar' },
  'space:stay': { scene: 'murphy_shelf', caption: 'cg_caption_space_stay' },
  'void:upside': { scene: 'upside_down', caption: 'cg_caption_void_upside' },
  'void:radio': { scene: 'radio_tower', caption: 'cg_caption_void_radio' },
  'fantasy:lotr': { scene: 'one_ring', caption: 'cg_caption_fantasy_lotr' },
  'hub:echoes': { scene: 'poster_wall', caption: 'cg_caption_hub_echoes' },
  'magic:nine': { scene: 'nine_platform', caption: 'cg_caption_magic_nine' },
  'magic:patronus': { scene: 'patronus_lake', caption: 'cg_caption_magic_patronus' },
  'space:wormhole': { scene: 'wormhole_arch', caption: 'cg_caption_space_wormhole' },
  'void:arcade': { scene: 'arcade_cab', caption: 'cg_caption_void_arcade' },
  'void:vecna': { scene: 'vecna_clock', caption: 'cg_caption_void_vecna' },
  'fantasy:western': { scene: 'western_saloon', caption: 'cg_caption_fantasy_western' },
  'fantasy:duel': { scene: 'duel_noon', caption: 'cg_caption_fantasy_duel' },
  'abyss:gangster': { scene: 'noir_speakeasy', caption: 'cg_caption_abyss_gangster' },
  'space:scifi': { scene: 'scifi_dome', caption: 'cg_caption_space_scifi' },
  'space:jump': { scene: 'jump_gate', caption: 'cg_caption_space_jump' },
  'hub:triad': { scene: 'triad_poster', caption: 'cg_caption_hub_triad' },
  'magic:cyber': { scene: 'cyber_alley', caption: 'cg_caption_magic_cyber' },
  'fantasy:samurai': { scene: 'samurai_torii', caption: 'cg_caption_fantasy_samurai' },
  'void:cosmic': { scene: 'cosmic_obelisk', caption: 'cg_caption_void_cosmic' },
  'space:starport': { scene: 'starport_cantina', caption: 'cg_caption_space_starport' },
  'hub:wave4': { scene: 'wave4_grid', caption: 'cg_caption_hub_wave4' },
};

/** 合并后的全表：基础 + 扩写 + 致敬层。画廊目录与渲染器读的都是这一份 */
export function mergeDialogueCg() {
  return { ...REST_DIALOGUE_CG_BASE, ...REST_DIALOGUE_CG_EXTRA, ...REST_DIALOGUE_CG_POP };
}

export const REST_DIALOGUE_CG = mergeDialogueCg();
