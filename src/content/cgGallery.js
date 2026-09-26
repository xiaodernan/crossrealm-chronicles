/**
 * CG 画廊 bonus 条目数据表（W-B2：消灭 Wave/Extras 叠加）。
 *
 * 原 CG_GALLERY_BONUS_EXTRA 从 CgGalleryRegistryExtras.js 迁移而来。
 * 基础 CG 目录在 CgGalleryRegistry.js 中由 REST_DIALOGUE_CG + 固定 bonus 构建。
 * 这里只存额外的 bonus 条目。
 */

export const CG_GALLERY_BONUS_EXTRA = [
  { id: 'bonus:style-ss', scene: 'execution_art', caption: '战斗风格 SS', mood: 'warn', zone: 'combat', speaker: '战斗记忆', accent: '#ffdd44', unlock: 'style:ss', sort: 103 },
  { id: 'bonus:rematch', scene: 'boss_shadow', caption: 'Boss 再战', mood: 'calm', zone: 'hub', speaker: '信标', accent: '#c9a962', unlock: 'boss-rematch', sort: 115 },
  { id: 'bonus:codex-full', scene: 'quest_scroll', caption: '秘典全收录', mood: 'calm', zone: 'hub', speaker: '纪事', accent: '#aa88ff', unlock: 'codex:full', sort: 116 },
  { id: 'bonus:photo', scene: 'space_endurance', caption: '荒原留影', mood: 'calm', zone: 'space', speaker: '拍照', accent: '#66ccff', unlock: 'photo-mode', sort: 117 },
  { id: 'bonus:campfire-all', scene: 'anchor_fire', caption: '六火皆憩', mood: 'calm', zone: 'hub', speaker: '营火', accent: '#ff9944', unlock: 'campfire:all', sort: 118 },
];