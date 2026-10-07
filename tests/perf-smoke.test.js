/**
 * 性能冒烟门禁的门禁 —— W-D4 切片2。
 *
 * `npm run perf` 起真游戏推真帧，量逻辑价（update）与全帧价。预算表是它红绿的唯一依据，
 * 而"把预算改松"和"把脚本删了"是同一种静默腐烂 —— 这里直接 **import 预算表**按值断言：
 * 数值只能比这里的上限更严，不能更松；接线（npm script）也钉住。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PERF_BUDGETS } from '../scripts/perf-smoke.mjs';

const ROOT = process.cwd();

describe('性能冒烟（W-D4 切片2）', () => {
  it('脚本在，npm script 接上了（没接线的门禁只有写它的人会跑）', () => {
    expect(existsSync(join(ROOT, 'scripts', 'perf-smoke.mjs')), 'perf-smoke.mjs 不在了').toBe(true);
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts.perf, 'package.json 里没有 "perf" 脚本').toBe('node scripts/perf-smoke.mjs');
  });

  it('预算表按值钉死：只许收紧，不许放松（基线实测 2026-10-07，见脚本头注）', () => {
    expect(PERF_BUDGETS.updateAvgMs, 'update 平均预算被放松（基线 ~7ms，门禁值 40）').toBeLessThanOrEqual(40);
    expect(PERF_BUDGETS.updateP95Ms, 'update p95 预算被放松（基线 ~10ms，门禁值 80）').toBeLessThanOrEqual(80);
    expect(PERF_BUDGETS.frameAvgMs, '全帧预算被放松（软渲染基线 ~150ms，灾难护栏 600）').toBeLessThanOrEqual(600);
    expect(PERF_BUDGETS.heapMb, '堆预算被放松（实测 ~77MB，护栏 1200）').toBeLessThanOrEqual(1200);
    expect(PERF_BUDGETS.exceptions).toBe(0);
    // 每一项都得是正数 —— 预算格写成 0 或负数，门禁就在空转
    for (const [k, v] of Object.entries(PERF_BUDGETS)) {
      if (k !== 'exceptions') expect(v, `预算 "${k}" 不是正数`).toBeGreaterThan(0);
    }
  });

  it('量的是"推帧"而不是真实 rAF（无头合成器会饿死 rAF，那种读数是节流不是性能）', () => {
    const 源码 = readFileSync(join(ROOT, 'scripts', 'perf-smoke.mjs'), 'utf8');
    expect(源码).toContain('window.__game.update()');
    expect(源码).toContain('window.__game.render()');
  });
});
