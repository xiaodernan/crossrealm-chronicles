/**
 * 物品名表（W-D2 切片52）—— 全仓第一个"可收集物品"家族。
 *
 * 为什么是现在：`r-relic-hunter` 的锁因（`itemCollected: void-resonance-shard x3`）自切片44 起
 * 就计为死锁 —— `PlayerStats.onItemCollected` 与账本桶都在，缺的一直是**生产者**与**名册**。
 * 本片把两样都补上：生产者是宝箱层（`CollectibleManager.open` 逐件入账），名册就是本表。
 *
 * 形状与其它名册一致：id → **文案键**（不是文案本身），显示侧在播出那一刻 `t()` 展开。
 * 键是否两表都在场，由 `tests/content-i18n-keys.test.js` 的映射表清单核；本表在
 * `registry.js` 开机校验里过一遍形状（非空字符串）。
 */
export const ITEM_NAMES = {
  'void-resonance-shard': 'item_void_resonance_shard',
};