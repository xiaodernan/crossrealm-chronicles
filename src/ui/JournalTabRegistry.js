/** [J] 日志 Tab 扩展 */
export const JOURNAL_EXTRA_TABS = {
  cg: 'CG画廊',
  achievements: '成就',
  codex: '秘典',
  memory: '营火记忆',
  dungeons: '地下城',
  skills: '流派',
  side: '支线',
  echoes: '次元回声',
};

export function mergeJournalCategories(base) {
  return { ...base, ...JOURNAL_EXTRA_TABS };
}
