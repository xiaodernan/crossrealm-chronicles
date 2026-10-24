/**
 * 剧情旗标名表（W-D2 切片55）—— 旗标族的显示名册。
 *
 * 为什么是现在：`r-archivist` 的锁因（`storyFlag: void-chronicle-read x1`）自切片51 接驳后
 * 一直出裸 id —— 另外七族的锁因都已在切片45/53 翻成人话，只剩这一族。全仓旗标今天只有
 * 一枚（`void-chronicle-read`：秘典十二条全解锁那一刻由 `LoreCodexSystem.tryUnlock` 落，
 * 切片51），口径在切片51 的 ADR 定名"读罢虚空编年史"。
 *
 * **名册只管显示名**：旗标族的 id 宇宙仍由 `onStoryFlag 调用点` 调用点推导
 *（`tests/skill-lock-refs.test.js` ④ 腿钉着）—— 有没有生产者与有没有名字是两件事，
 * 一枚没人落的旗标照样是悬空引用，不会因为进了本表就变活。
 *
 * 形状与其它名册一致：id → **文案键**（不是文案本身），显示侧在播出那一刻 `t()` 展开。
 * 键是否两表都在场，由 `tests/content-i18n-keys.test.js` 的映射表清单核。
 */
export const STORY_FLAG_NAMES = {
  'void-chronicle-read': 'story_flag_void_chronicle_read',
};
