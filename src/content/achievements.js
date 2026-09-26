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
  { id: 'style-a', title: '风格 A', desc: '单场战斗风格达 A 级', check: (s) => (s.styleBest ?? 0) >= 250 },
  { id: 'style-ss', title: '修罗舞', desc: '单场战斗风格达 SS 级', check: (s) => (s.styleBest ?? 0) >= 700 },
  { id: 'cg-half', title: '插画收藏家', desc: 'CG 画廊解锁 50%', check: (s) => (s.cgPercent ?? 0) >= 50 },
  { id: 'codex-half', title: '秘典学者', desc: '秘典收录 50%', check: (s) => (s.codexPercent ?? 0) >= 50 },
  { id: 'rematch-3', title: '信标猎人', desc: 'Boss 再战 3 次', check: (s) => (s.rematches ?? 0) >= 3 },
  { id: 'campfire-all', title: '六火皆憩', desc: '在全部 6 处营火休息', check: (s) => (s.campfireZones ?? 0) >= 6 },
  { id: 'photo-mode', title: '位面摄影师', desc: '使用拍照模式', check: (s) => s.photoMode },
];

export const ACHIEVEMENTS_POP_CULTURE = [
  { id: 'echo-half', title: '半频共鸣', desc: '次元回声解锁 50%', check: (s) => (s.echoPercent ?? 0) >= 50 },
  { id: 'echo-full', title: '全频行者', desc: '解锁全部次元回声', check: (s) => (s.echoPercent ?? 0) >= 100 },
  { id: 'echo-wizard', title: '学院毕业生', desc: '共鸣全部魔法学院回声', check: (s) => (s.echoWizard ?? 0) >= 8 },
  { id: 'echo-space', title: '方程闭合', desc: '共鸣全部星际穿越回声', check: (s) => (s.echoSpace ?? 0) >= 8 },
  { id: 'echo-upside', title: '逆相幸存者', desc: '共鸣全部逆相界回声', check: (s) => (s.echoUpside ?? 0) >= 9 },
  { id: 'echo-western', title: '边境枪手', desc: '共鸣全部边境往事回声', check: (s) => (s.echoWestern ?? 0) >= 3 },
  { id: 'echo-gangster', title: '幽冥话事人', desc: '共鸣全部幽冥帮派回声', check: (s) => (s.echoGangster ?? 0) >= 3 },
  { id: 'echo-scifi', title: '深空领航员', desc: '共鸣全部深空纪元回声', check: (s) => (s.echoSciFi ?? 0) >= 3 },
  { id: 'echo-triad', title: '三巨头同频', desc: '边境+帮派+深空各系列全共鸣', check: (s) => (s.echoWestern ?? 0) >= 3 && (s.echoGangster ?? 0) >= 3 && (s.echoSciFi ?? 0) >= 3 },
  { id: 'echo-cyber', title: '霓虹行者', desc: '共鸣全部赛博霓虹回声', check: (s) => (s.echoCyber ?? 0) >= 3 },
  { id: 'echo-samurai', title: '残响剑士', desc: '共鸣全部武士残响回声', check: (s) => (s.echoSamurai ?? 0) >= 3 },
  { id: 'echo-cosmic', title: '深井生还', desc: '共鸣全部旧日低语回声', check: (s) => (s.echoCosmic ?? 0) >= 3 },
  { id: 'echo-starport', title: '星港老手', desc: '共鸣全部星港商路回声', check: (s) => (s.echoStarport ?? 0) >= 3 },
  { id: 'echo-wave4', title: '四系同频', desc: 'Wave4 四系列全共鸣', check: (s) => (s.echoCyber ?? 0) >= 3 && (s.echoSamurai ?? 0) >= 3 && (s.echoCosmic ?? 0) >= 3 && (s.echoStarport ?? 0) >= 3 },
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