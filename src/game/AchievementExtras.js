/** 成就扩写 */
import { ACHIEVEMENTS_POP_CULTURE } from './PopCultureAchievementExtras.js';

export const ACHIEVEMENTS_EXTRA = [
  { id: 'style-a', title: '风格 A', desc: '单场战斗风格达 A 级', check: (s) => (s.styleBest ?? 0) >= 250 },
  { id: 'style-ss', title: '修罗舞', desc: '单场战斗风格达 SS 级', check: (s) => (s.styleBest ?? 0) >= 700 },
  { id: 'cg-half', title: '插画收藏家', desc: 'CG 画廊解锁 50%', check: (s) => (s.cgPercent ?? 0) >= 50 },
  { id: 'codex-half', title: '秘典学者', desc: '秘典收录 50%', check: (s) => (s.codexPercent ?? 0) >= 50 },
  { id: 'rematch-3', title: '信标猎人', desc: 'Boss 再战 3 次', check: (s) => (s.rematches ?? 0) >= 3 },
  { id: 'campfire-all', title: '六火皆憩', desc: '在全部 6 处营火休息', check: (s) => (s.campfireZones ?? 0) >= 6 },
  { id: 'photo-mode', title: '位面摄影师', desc: '使用拍照模式', check: (s) => s.photoMode },
  ...ACHIEVEMENTS_POP_CULTURE,
];

export function mergeAchievements(base) {
  return [...base, ...ACHIEVEMENTS_EXTRA];
}
