/** [J] 日志 Tab 扩展 */
export const JOURNAL_EXTRA_TABS = {
  cg: 'CG画廊',
  achievements: '成就',
  codex: '秘典',
  memory: '营火记忆',
  // 这座页签显示的是 totalClears（清空次数统计），与基础表里的 'dungeon'（清空记录日志，
  // rest 对话点名它是"记清空记录"的那一页）是两个不同的东西 —— 早先两处都写 '地下城'，
  // 页签条上并排两个同名按钮，玩家分不出谁是谁。这里改成 '地下城通关' 消歧。
  dungeons: '地下城通关',
  skills: '流派',
  side: '支线',
  echoes: '次元回声',
};

export function mergeJournalCategories(base) {
  return { ...base, ...JOURNAL_EXTRA_TABS };
}
