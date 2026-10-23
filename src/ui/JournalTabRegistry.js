/** [J] 日志 Tab 扩展。值是**文案键**（W-D2 切片16b），显示侧 `t()` 展开。 */
export const JOURNAL_EXTRA_TABS = {
  cg: 'journal_tab_cg',
  // 复用键：`journal_tab_achievements` 是成就**子面板标题**（「成就墙 · {journal} 关闭」），
  // 同名不同义 —— 早先这格新开同名键会把子面板标题顶掉（eslint no-dupe-keys 当场拦下）。
  // 页签标签用 `journal_achievements`（值逐字相同，此前无消费者）。
  achievements: 'journal_achievements',
  codex: 'journal_tab_codex',
  memory: 'journal_tab_memory',
  // 这座页签显示的是 totalClears（清空次数统计），与基础表里的 'dungeon'（清空记录日志，
  // rest 对话点名它是"记清空记录"的那一页）是两个不同的东西 —— 早先两处都写 '地下城'，
  // 页签条上并排两个同名按钮，玩家分不出谁是谁。消歧落在两把不同的键上：
  // `journal_tab_dungeon`（地下城）/ `journal_tab_dungeons`（地下城通关），
  // 展开后必须不同 —— tests/journal-tab-registry.test.js 钉住。
  dungeons: 'journal_tab_dungeons',
  skills: 'journal_tab_skills',
  side: 'journal_tab_side',
  echoes: 'journal_tab_echoes',
};

export function mergeJournalCategories(base) {
  return { ...base, ...JOURNAL_EXTRA_TABS };
}
