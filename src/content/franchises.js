/**
 * 次元回声的「母题」（franchise）身份表 —— 与 `src/content/ZoneIdentity.js` 同一个套路（修 B36）。
 *
 * 目录条目里的 `franchise` 字段以前直接写中文母题名，成就与支线再拿
 * `e.franchise === '魔法学院'` 做判定：改一行文案，十条成就和四条支线就会静默失效。
 * 现在条目存 id，中文只在这张表的值里出现一次，显示统一走 `franchiseLabel()`。
 */
import { STRINGS_ZH } from './strings.zh.js';
import { STRINGS_EN } from './strings.en.js';

// 双表住在**同层**（content/strings.*）—— 内容层读它不违反"地基层不向上够"那条约定。
const 双表 = { zh: STRINGS_ZH, en: STRINGS_EN };
const 表 = (lang) => 双表[lang] ?? STRINGS_ZH;

export const FRANCHISE = {
  WIZARD: 'wizard',
  INTERSTELLAR: 'interstellar',
  UPSIDE: 'upside',
  MIDDLE_EARTH: 'middle-earth',
  BORDER: 'border',
  FAMILY: 'family',
  DEEPSPACE: 'deepspace',
  CYBER: 'cyber',
  SAMURAI: 'samurai',
  COSMIC: 'cosmic',
  STARPORT: 'starport',
  CROSSOVER: 'crossover',
};

/**
 * 母题显示名：值是**文案键**（W-D2 切片16o），不是文案本身 —— 显示侧在那一刻展开。
 * 键名 `franchise_<母题 id>_label`。
 */
export const FRANCHISE_LABELS = {
  all: 'franchise_all_label',
  [FRANCHISE.WIZARD]: 'franchise_wizard_label',
  [FRANCHISE.INTERSTELLAR]: 'franchise_interstellar_label',
  [FRANCHISE.UPSIDE]: 'franchise_upside_label',
  [FRANCHISE.MIDDLE_EARTH]: 'franchise_middle_earth_label',
  [FRANCHISE.BORDER]: 'franchise_border_label',
  [FRANCHISE.FAMILY]: 'franchise_family_label',
  [FRANCHISE.DEEPSPACE]: 'franchise_deepspace_label',
  [FRANCHISE.CYBER]: 'franchise_cyber_label',
  [FRANCHISE.SAMURAI]: 'franchise_samurai_label',
  [FRANCHISE.COSMIC]: 'franchise_cosmic_label',
  [FRANCHISE.STARPORT]: 'franchise_starport_label',
  [FRANCHISE.CROSSOVER]: 'franchise_crossover_label',
};

/** 母题显示名（按语言展开；键找不到就退回 id） */
export const franchiseLabel = (id, lang = 'zh') => {
  const key = FRANCHISE_LABELS[id];
  if (!key) return id;
  return 表(lang)[key] ?? id;
};
