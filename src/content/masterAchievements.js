/**
 * 大成就（master）册——"真正把一条线路走通"的那几块石头。
 *
 * 与两个消费者共享一份名册，不许各抄一份：
 *   1. `ui/AchievementsJournalTab` —— 牌匾专属烫金样式（ach-master）；
 *   2. `effects/ExecutionEffects` —— 解锁瞬间金迸（W-V8）。
 * 加一块 Master 碑 = 这里加一行，两边同时生效。
 */
export const MASTER_ACHIEVEMENT_IDS = Object.freeze([
  'echo-homecoming-master',
  'echo-original',
  'echo-wave4',
  'echo-triad',
  // W-Z31「炉主」—— 全母题共鸣成就：与 echo-triad 同级的旅程封印
  'echo-keeper',
]);
