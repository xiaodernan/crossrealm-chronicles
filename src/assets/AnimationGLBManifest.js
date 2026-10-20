/**
 * 玩家额外动画 GLB 清单（W-C6 余项续：真 Mixamo clip 管线）
 *
 * 真 clip 准备好后放入 `public/assets/models/animations/`，在此登记即可自动合并。
 * 约定：
 * - 每个 GLB 只含**动画**（可带一个不可见的根骨架用于绑定，或直接只含 clip）
 * - clip 名建议与 `ANIM_MANIFEST` 键一致（如 `attack1`、`dodge`、`block`...）
 * - 真 clip 到位即优先覆盖同名程序化片段（`__sk:*` 退位）
 * - 缺失的招式自动回退到 `SkeletonMotion`（程序化）
 */

// 真 clip GLB 列表（相对 public/）
export const ANIMATION_GLB_MANIFEST = [
  // 例：
  // '/assets/models/animations/attack1.glb',
  // '/assets/models/animations/dodge.glb',
  // '/assets/models/animations/block.glb',
];

/** 与 ANIM_MANIFEST 键对齐的优先级：真 clip → 程序化 → 素材 fallback */
export const ANIM_PRIORITY = {
  // 真 clip 优先级最高（100）
  // 程序化次之（50）
  // 素材 fallback 最低（10）
  // 供 catalog 合并时比较用
  real: 100,
  procedural: 50,
  fallback: 10,
};