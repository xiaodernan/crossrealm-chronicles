/**
 * 玩家动画 GLB 清单契约门禁 —— 钉 `assets/AnimationGLBManifest.js`。
 *
 * `ANIMATION_GLB_MANIFEST`（真 clip GLB 列表）与 `ANIM_PRIORITY`（clip 合并优先级）
 * 被 `player/CharacterModel.js` 消费：真 clip 到位即按优先级覆盖同名程序化片段。
 * 此前零直接测试。契约：
 * - `ANIM_PRIORITY` 恰为 {real, procedural, fallback} 三键，且**严格递减**
 *   real > procedural > fallback（合并时"真 clip → 程序化 → 素材"的优先序）；
 * - `ANIMATION_GLB_MANIFEST` 是数组，每个元素都是非空 `/` 路径字符串（当前为空表，
 *   空表合法；此处守卫未来登记项的形状）。
 *
 * 一枚变异探针走真数据（grep 确认落盘、预言命中、原字节还原）。
 */
import { describe, it, expect } from 'vitest';
import { ANIMATION_GLB_MANIFEST, ANIM_PRIORITY } from '../src/assets/AnimationGLBManifest.js';

describe('ANIM_PRIORITY 合并优先级契约', () => {
  it('恰为 real / procedural / fallback 三键', () => {
    expect(Object.keys(ANIM_PRIORITY).sort()).toEqual(['fallback', 'procedural', 'real']);
  });

  it('三键均为正整数', () => {
    for (const [k, v] of Object.entries(ANIM_PRIORITY)) {
      expect(Number.isInteger(v), `${k}=${v}`).toBe(true);
      expect(v, `${k} 正`).toBeGreaterThan(0);
    }
  });

  it('严格递减：real > procedural > fallback', () => {
    expect(ANIM_PRIORITY.real).toBeGreaterThan(ANIM_PRIORITY.procedural);
    expect(ANIM_PRIORITY.procedural).toBeGreaterThan(ANIM_PRIORITY.fallback);
  });
});

describe('ANIMATION_GLB_MANIFEST 形状', () => {
  it('是数组', () => {
    expect(Array.isArray(ANIMATION_GLB_MANIFEST)).toBe(true);
  });

  it('每个登记项都是非空 / 路径字符串（当前空表，守卫未来项）', () => {
    for (const url of ANIMATION_GLB_MANIFEST) {
      expect(typeof url, '字符串').toBe('string');
      expect(url.length, '非空').toBeGreaterThan(0);
      expect(url.startsWith('/'), '/ 路径').toBe(true);
    }
  });
});
