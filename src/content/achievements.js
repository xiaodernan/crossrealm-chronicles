/**
 * 成就数据表（W-B2：消灭 Wave/Extras 叠加）。
 *
 * 合并了 AchievementExtras + PopCultureAchievementExtras。
 * 结构：
 * - base: 基础成就（在 AchievementSystem.js 中定义，这里不重复）
 * - extra: 额外成就（原 ACHIEVEMENTS_EXTRA）
 * - popCulture: 次元回声相关成就（原 ACHIEVEMENTS_POP_CULTURE）
 * - franchiseBuckets: 母题分桶统计配置（原 ECHO_FRANCHISE_BUCKETS）
 */
import { FRANCHISE } from './franchises.js';

// 基础成就在 AchievementSystem.js 中定义（ACHIEVEMENTS 常量）
// 这里只导出额外成就与次元回声成就

export const ACHIEVEMENTS_EXTRA = [
  { id: 'style-a', title: 'ach_style_a_title', desc: 'ach_style_a_desc', check: (s) => (s.styleBest ?? 0) >= 250 },
  { id: 'style-ss', title: 'ach_style_ss_title', desc: 'ach_style_ss_desc', check: (s) => (s.styleBest ?? 0) >= 700 },
  { id: 'cg-half', title: 'ach_cg_half_title', desc: 'ach_cg_half_desc', check: (s) => (s.cgPercent ?? 0) >= 50 },
  { id: 'codex-half', title: 'ach_codex_half_title', desc: 'ach_codex_half_desc', check: (s) => (s.codexPercent ?? 0) >= 50 },
  { id: 'rematch-3', title: 'ach_rematch_3_title', desc: 'ach_rematch_3_desc', check: (s) => (s.rematches ?? 0) >= 3 },
  { id: 'campfire-all', title: 'sq_side_campfire_all_title', desc: 'ach_campfire_all_desc', check: (s) => (s.campfireZones ?? 0) >= 6 },
  { id: 'photo-mode', title: 'ach_photo_mode_title', desc: 'ach_photo_mode_desc', check: (s) => s.photoMode },
  { id: 'champion-of-hub', title: 'ach_champion_of_hub_title', desc: 'ach_champion_of_hub_desc', check: (s) => s.boss1 && s.boss2 && s.boss3 && s.voidBoss && s.chaosBoss },
];

export const ACHIEVEMENTS_POP_CULTURE = [
  { id: 'echo-half', title: 'ach_echo_half_title', desc: 'ach_echo_half_desc', check: (s) => (s.echoPercent ?? 0) >= 50 },
  { id: 'echo-full', title: 'ach_echo_full_title', desc: 'ach_echo_full_desc', check: (s) => (s.echoPercent ?? 0) >= 100 },
  { id: 'echo-wizard', title: 'ach_echo_wizard_title', desc: 'ach_echo_wizard_desc', check: (s) => (s.echoWizard ?? 0) >= 8 },
  { id: 'echo-space', title: 'ach_echo_space_title', desc: 'ach_echo_space_desc', check: (s) => (s.echoSpace ?? 0) >= 8 },
  { id: 'echo-upside', title: 'ach_echo_upside_title', desc: 'ach_echo_upside_desc', check: (s) => (s.echoUpside ?? 0) >= 9 },
  { id: 'echo-western', title: 'ach_echo_western_title', desc: 'ach_echo_western_desc', check: (s) => (s.echoWestern ?? 0) >= 3 },
  { id: 'echo-gangster', title: 'ach_echo_gangster_title', desc: 'ach_echo_gangster_desc', check: (s) => (s.echoGangster ?? 0) >= 3 },
  { id: 'echo-scifi', title: 'ach_echo_scifi_title', desc: 'ach_echo_scifi_desc', check: (s) => (s.echoSciFi ?? 0) >= 3 },
  { id: 'echo-triad', title: 'ach_echo_triad_title', desc: 'ach_echo_triad_desc', check: (s) => (s.echoWestern ?? 0) >= 3 && (s.echoGangster ?? 0) >= 3 && (s.echoSciFi ?? 0) >= 3 },
  { id: 'echo-cyber', title: 'ach_echo_cyber_title', desc: 'ach_echo_cyber_desc', check: (s) => (s.echoCyber ?? 0) >= 3 },
  { id: 'echo-samurai', title: 'ach_echo_samurai_title', desc: 'ach_echo_samurai_desc', check: (s) => (s.echoSamurai ?? 0) >= 3 },
  { id: 'echo-cosmic', title: 'ach_echo_cosmic_title', desc: 'ach_echo_cosmic_desc', check: (s) => (s.echoCosmic ?? 0) >= 3 },
  { id: 'echo-starport', title: 'ach_echo_starport_title', desc: 'ach_echo_starport_desc', check: (s) => (s.echoStarport ?? 0) >= 3 },
  { id: 'echo-wave4', title: 'ach_echo_wave4_title', desc: 'ach_echo_wave4_desc', check: (s) => (s.echoCyber ?? 0) >= 3 && (s.echoSamurai ?? 0) >= 3 && (s.echoCosmic ?? 0) >= 3 && (s.echoStarport ?? 0) >= 3 },
];

/**
 * 成就统计按母题 id 分桶。
 * 母题 id 来自 franchises.js，改名只需动那一处。
 */
export const ECHO_FRANCHISE_BUCKETS = [
  ['echoWizard', FRANCHISE.WIZARD],
  ['echoSpace', FRANCHISE.INTERSTELLAR],
  ['echoUpside', FRANCHISE.UPSIDE],
  ['echoWestern', FRANCHISE.BORDER],
  ['echoGangster', FRANCHISE.FAMILY],
  ['echoSciFi', FRANCHISE.DEEPSPACE],
  ['echoCyber', FRANCHISE.CYBER],
  ['echoSamurai', FRANCHISE.SAMURAI],
  ['echoCosmic', FRANCHISE.COSMIC],
  ['echoStarport', FRANCHISE.STARPORT],
];

// 合并导出（供外部直接使用）
export const ALL_ACHIEVEMENTS_EXTRA = [...ACHIEVEMENTS_EXTRA, ...ACHIEVEMENTS_POP_CULTURE];