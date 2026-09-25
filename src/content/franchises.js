/**
 * 次元回声的「母题」（franchise）身份表 —— 与 `src/content/ZoneIdentity.js` 同一个套路（修 B36）。
 *
 * 目录条目里的 `franchise` 字段以前直接写中文母题名，成就与支线再拿
 * `e.franchise === '魔法学院'` 做判定：改一行文案，十条成就和四条支线就会静默失效。
 * 现在条目存 id，中文只在这张表的值里出现一次，显示统一走 `franchiseLabel()`。
 */
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

/** 图鉴筛选：`all` 是「不按母题过滤」的哨兵，不是母题 */
export const FRANCHISE_LABELS = {
  all: '全部',
  [FRANCHISE.WIZARD]: '魔法学院',
  [FRANCHISE.INTERSTELLAR]: '星际穿越',
  [FRANCHISE.UPSIDE]: '逆相界',
  [FRANCHISE.MIDDLE_EARTH]: '中洲',
  [FRANCHISE.BORDER]: '边境往事',
  [FRANCHISE.FAMILY]: '幽冥帮派',
  [FRANCHISE.DEEPSPACE]: '深空纪元',
  [FRANCHISE.CYBER]: '赛博霓虹',
  [FRANCHISE.SAMURAI]: '武士残响',
  [FRANCHISE.COSMIC]: '旧日低语',
  [FRANCHISE.STARPORT]: '星港商路',
  [FRANCHISE.CROSSOVER]: '跨界',
};

export const franchiseLabel = (id) => FRANCHISE_LABELS[id] ?? id;
