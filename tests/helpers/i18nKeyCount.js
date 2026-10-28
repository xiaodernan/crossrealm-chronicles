/**
 * 双表键数的**唯一登记处**（W-D2 欠账 · 2026-10-29）。
 *
 * ## 为什么要收
 *
 * 2436 这个数此前被 **11 个测试文件抄了 14 处**（`.toBe(2436)`）。每加一枚文案，
 * 就得把这 14 个数一起改：漏一处的症状是"新键已经登记、另一处分母还停在旧数"，
 * 而那条红只会说"键数不是 2436"，不说是谁抄漏了。这和 B120/B121 的"第二份坐标"
 * 是同一类病：**同一个数有多个所有者时，没有一个所有者**。
 *
 * 现在只在这里改一个数。各测试标题里的历史链（2353 → … → 2436）保留为历史，
 * 不再是判据；判据是下面这一个常量。
 *
 * ## 改这个数的规矩
 *
 * 加键/删键的同一片里改这里；`tests/i18n.test.js` 有一条结构门禁：测试代码里
 * 出现 `.toBe(<这个数>)` 的字面量就红 —— 防止下一个抄本悄悄长回来。
 */
export const EXPECTED_KEY_COUNT = 2436;

/**
 * 键数判据：两表相等，且等于登记值。
 * 返回问题数组（空 = 通过），与 `scripts/harness-readings.mjs` 的"问题数组"同口径。
 */
export function 键数问题(zhKeys, enKeys, 期望 = EXPECTED_KEY_COUNT) {
  const 问 = [];
  if (!Array.isArray(zhKeys) || !Array.isArray(enKeys)) {
    return ['双表键名不是数组 —— 这一条量不到任何东西'];
  }
  if (zhKeys.length !== enKeys.length) {
    问.push(`两表键数不等：中 ${zhKeys.length} / 英 ${enKeys.length}`);
  }
  if (zhKeys.length !== 期望) {
    问.push(`键数 ${zhKeys.length} ≠ 登记值 ${期望} —— 加/删键要同时改 tests/helpers/i18nKeyCount.js`);
  }
  return 问;
}
