/**
 * 说明书扩写章节数据表（W-B2：消灭 Wave/Extras 叠加）。
 *
 * 原 HELP_SECTIONS_EXTRA 从 HelpManualExtras.js 迁移而来。
 */

/**
 * 扩写章节数据表（W-D2 切片15 起：正文与标题进双表，这里只存文案键）。
 * 真正的中文/英文住在 `content/strings.zh.js` / `.en.js`（hm_title_* / hm_body_*），
 * 播出那一刻由 `ui/HelpManual.js` 走 `keyText(t(key))` 展开 —— 与主线章节、CG 字幕同源。
 */
export const HELP_SECTIONS_EXTRA = [
  {
    id: 'journal-tabs',
    title: 'hm_title_journal_tabs',
    body: 'hm_body_journal_tabs',
  },
  {
    id: 'meta-systems',
    title: 'hm_title_meta_systems',
    body: 'hm_body_meta_systems',
  },
  {
    id: 'pop-culture',
    title: 'hm_title_pop_culture',
    body: 'hm_body_pop_culture',
  },
];