/**
 * CG 画廊 bonus 条目数据表（W-B2：消灭 Wave/Extras 叠加）。
 *
 * 原 CG_GALLERY_BONUS_EXTRA 从 CgGalleryRegistryExtras.js 迁移而来。
 * 基础 CG 目录在 CgGalleryRegistry.js 中由 REST_DIALOGUE_CG + 固定 bonus 构建。
 * 这里只存额外的 bonus 条目。
 *
 * `caption` 是**文案键**而不是文案本身（W-D2 切片13）：这张表是数据层，显示侧
 * （画廊卡片 / 灯箱 / 解锁 toast / 画进 CG 的那一行）统一在播出那一刻 `t()` 展开。
 * 改前这里是五条中文字面量，而同一张目录的其余行已经存键 —— 于是 `t('荒原留影')`
 * 报 `[MISSING: 荒原留影]`，开发期字样被画到玩家脸上。
 */

export const CG_GALLERY_BONUS_EXTRA = [
  { id: 'bonus:style-ss', scene: 'execution_art', caption: 'cg_gallery_style_ss', mood: 'warn', zone: 'combat', speaker: '战斗记忆', accent: '#ffdd44', unlock: 'style:ss', sort: 103 },
  { id: 'bonus:rematch', scene: 'boss_shadow', caption: 'cg_gallery_rematch', mood: 'calm', zone: 'hub', speaker: '信标', accent: '#c9a962', unlock: 'boss-rematch', sort: 115 },
  { id: 'bonus:codex-full', scene: 'quest_scroll', caption: 'cg_gallery_codex_full', mood: 'calm', zone: 'hub', speaker: '纪事', accent: '#aa88ff', unlock: 'codex:full', sort: 116 },
  { id: 'bonus:photo', scene: 'space_endurance', caption: 'cg_gallery_photo', mood: 'calm', zone: 'space', speaker: '拍照', accent: '#66ccff', unlock: 'photo-mode', sort: 117 },
  { id: 'bonus:campfire-all', scene: 'anchor_fire', caption: 'cg_gallery_campfire_all', mood: 'calm', zone: 'hub', speaker: '营火', accent: '#ff9944', unlock: 'campfire:all', sort: 118 },
];