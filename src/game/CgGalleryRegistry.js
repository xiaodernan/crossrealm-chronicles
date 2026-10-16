import { REST_DIALOGUE_CG } from '../content/dialogueCgPresets.js';
import { REST_NPC_DEFS } from '../content/restNpcDefs.js';
import { CG_GALLERY_BONUS_EXTRA } from '../content/cgGallery.js';

/** CG 画廊完整目录 — 营火对话 + Boss 击破 + 隐藏 */
export const CG_GALLERY_CATALOG = [
  ...Object.entries(REST_DIALOGUE_CG).map(([key, preset]) => {
    const [restId, nodeId] = key.split(':');
    const npc = REST_NPC_DEFS[restId];
    return {
      id: key,
      restId,
      nodeId,
      scene: preset.scene,
      // `caption` 存**文案键**（W-D2 切片13）：这张目录是数据层，显示侧（画廊卡片 /
      // 灯箱 / 解锁 toast / 画进 CG 的那一行）各自在播出那一刻 `t()` 展开。
      // 改前这里是 `t(preset.caption)` —— 营火行导入期就冻成中文，而 bonus 行存的是键，
      // 同一张目录两套口径：`CgJournalTab` 拿到什么就显示什么，于是 bonus 行会把
      // `cg_gallery_finisher` 这样的裸键摆进玩家界面。
      caption: preset.caption,
      mood: preset.mood ?? 'calm',
      zone: restId,
      // 名与色只从 `REST_NPC_DEFS` 取（W-B4 切片1）：改前这里是 `?? restId` / `?? '#c9a962'` ——
      // 认不出这一座时把 id 当说话人名摆进画廊，再给它戴上锚火看守的金边。
      // `registry.js` 的 `checkDialogueCgPresets` 保证每个键的营火既有一棵树也有定义，
      // 而 `restDialogues` 那一条保证定义里的 name/accent 是非空串，所以这里不需要兜底。
      speaker: npc?.name,
      accent: npc?.accent,
      unlock: 'dialogue',
      sort: 10,
    };
  }),
  { id: 'bonus:finisher', scene: 'execution_art', caption: 'cg_gallery_finisher', mood: 'calm', zone: 'combat', speaker: 'cg_speaker_combat_memory', accent: '#ffcc44', unlock: 'finisher', sort: 100 },
  { id: 'bonus:riposte', scene: 'combat_tutorial', caption: 'cg_gallery_riposte', mood: 'warn', zone: 'combat', speaker: 'cg_speaker_combat_memory', accent: '#ff8866', unlock: 'riposte', sort: 101 },
  { id: 'bonus:execution', scene: 'execution_art', caption: 'cg_gallery_execution', mood: 'warn', zone: 'combat', speaker: 'cg_speaker_combat_memory', accent: '#ff4422', unlock: 'execution', sort: 102 },
  { id: 'bonus:boss-shadow', scene: 'boss_shadow', caption: 'cg_gallery_boss_shadow', mood: 'warn', zone: 'fantasy', speaker: 'cg_speaker_boss', accent: '#aa2222', unlock: 'boss:shadow-warden', sort: 110 },
  { id: 'bonus:boss-mage', scene: 'boss_mage', caption: 'cg_gallery_boss_mage', mood: 'warn', zone: 'magic', speaker: 'cg_speaker_boss', accent: '#8844ff', unlock: 'boss:archmagus', sort: 111 },
  { id: 'bonus:boss-singularity', scene: 'boss_singularity', caption: 'cg_gallery_boss_singularity', mood: 'warn', zone: 'space', speaker: 'cg_speaker_boss', accent: '#4488ff', unlock: 'boss:singularity-herald', sort: 112 },
  { id: 'bonus:boss-void', scene: 'hidden_boss', caption: 'cg_gallery_boss_void', mood: 'warn', zone: 'void', speaker: 'cg_speaker_boss', accent: '#c9a962', unlock: 'boss:void-chronarch', sort: 113 },
  { id: 'bonus:boss-chaos', scene: 'boss_chaos', caption: 'cg_gallery_boss_chaos', mood: 'warn', zone: 'abyss', speaker: 'cg_speaker_boss', accent: '#ff2244', unlock: 'boss:chaos-overlord', sort: 114 },
  { id: 'bonus:dungeon-clear', scene: 'forest_map', caption: 'cg_gallery_dungeon_clear', mood: 'calm', zone: 'dungeon', speaker: 'cg_speaker_explore', accent: '#889977', unlock: 'dungeon-clear', sort: 120 },
  { id: 'bonus:world-anchor', scene: 'anchor_fire', caption: 'cg_gallery_world_anchor', mood: 'calm', zone: 'hub', speaker: 'cg_speaker_prologue', accent: '#c9a962', unlock: 'quest:ch1', sort: 1 },
  ...CG_GALLERY_BONUS_EXTRA,
];

export const CG_ZONE_LABELS = {
  all: 'cg_zone_all',
  hub: 'cg_zone_hub',
  fantasy: 'cg_zone_fantasy',
  magic: 'cg_zone_magic',
  space: 'cg_zone_space',
  void: 'cg_zone_void',
  abyss: 'cg_zone_abyss',
  combat: 'cg_zone_combat',
  dungeon: 'cg_zone_dungeon',
};
