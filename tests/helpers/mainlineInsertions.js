/**
 * W-E3 S87：集中维护 mainline-table.test.js 历史腿使用的“v21 后插步排除名单”。
 *
 * 这些名单用于把“今天的 MAINLINE”投影回某个历史切片后的视图，以验证当时的结构契约。
 * 新增 v21 插步时：把新 id 追加到需要包含它的各名单末尾（通常是所有仍覆盖该插入点的名单）。
 * 这是纯测试维护辅助，不改变运行时/内容语义。
 */

/** v21 冻结后新增的所有主线 id（按首次纳入顺序追加）。 */
export const POST_V21 = [
  'void-oath',
  'choice-ascend', 'ascend-observe', 'ascend-retrace',
  'choice-second', 'second-ember', 'second-stone',
  'choice-first', 'first-arrow', 'first-camp',
  'choice-final', 'final-keep', 'final-quiet',
  'archon-hunt', 'gloom-shade-hunt', 'void-phantom-hunt',
  'abyss-reaver-hunt', 'abyss-watcher-hunt', 'void-riftwalker-hunt',
  'abyss-brute-hunt', 'abyss-shade-hunt', 'void-lurker-hunt',
  'void-marauder-hunt', 'abyss-hound-hunt', 'void-stinger-hunt',
  'abyss-mire-hunt', 'void-ruptor-hunt', 'abyss-scarbearer-hunt',
  'void-chasmer-hunt', 'abyss-gnasher-hunt', 'void-revenant-hunt',
  'abyss-hollow-hunt', 'void-siphoner-hunt',
];

/** 切片41 之后仍需从 v21 投影中排除的 id（不含 void-oath）。 */
export const AFTER_SLICE_40 = POST_V21.filter((id) => id !== 'void-oath');

/** 切片42 之后仍需排除的 id。 */
export const AFTER_SLICE_41 = AFTER_SLICE_40.filter((id) => !['choice-ascend', 'ascend-observe', 'ascend-retrace'].includes(id));

/** 切片45 之后仍需排除的 id。 */
export const AFTER_SLICE_42 = AFTER_SLICE_41.filter((id) => !['choice-second', 'second-ember', 'second-stone'].includes(id));

/** 切片46 之后仍需排除的 id。 */
export const AFTER_SLICE_45 = AFTER_SLICE_42.filter((id) => !['choice-first', 'first-arrow', 'first-camp'].includes(id));

/** 切片67+ 历史腿常用：在切片46 基线之上继续排除后续插步。 */
export const AFTER_SLICE_46 = AFTER_SLICE_45.filter((id) => !['choice-final', 'final-keep', 'final-quiet'].includes(id));

/** 从 id 序列中排除指定 id 集合。 */
export function idsWithout(ids, excluded) {
  const set = new Set(excluded);
  return ids.filter((id) => !set.has(id));
}
