/**
 * 性能站点世界种子门禁（W-C2 尾巴 / B125 同源）。
 *
 * `npm run perf` 的 draw call 上限是"同配方读数的最大 ×1.15"，而每次重载页面都会
 * 拿到另一份未播种的碎石 / 障碍散布 ⇒ 上限里永远留着一块跨世界噪声。修法不是把
 * 生产世界钉死（B125 明确说"世界每局不同是有意的"），而是在性能脚本这一侧、页面
 * 任何模块执行之前把 `Math.random` 换成定长 LCG。
 *
 * 这里钉三件事：① 注入的脚本**真的**是一条可复现的序列（同种子逐位相同、异种子不同、
 * 值域 [0,1)）；② 非法种子当场抛（种子是 uint32，静默截断会让"换了一颗种子"变成
 * 空操作）；③ 接线顺序 —— 注入必须排在 `Page.navigate` 之前，否则页面模块先跑、
 * 世界先用上真随机，种子就只是日志里的一句话。
 */
import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WORLD_SEED, worldSeedSource } from '../scripts/world-seed.mjs';

/** 在独立上下文里跑注入脚本，返回它随后交出的 n 个随机数 */
const 取序列 = (seed, n = 5) => {
  const MathShim = Object.create(Math);
  vm.runInNewContext(worldSeedSource(seed), { Math: MathShim });
  return Array.from({ length: n }, () => MathShim.random());
};

describe('世界种子脚本：可复现', () => {
  it('同种子逐位相同，异种子不同（否则"钉种子"只是换了个日志字段）', () => {
    expect(取序列(WORLD_SEED)).toEqual(取序列(WORLD_SEED));
    expect(取序列(WORLD_SEED + 1)).not.toEqual(取序列(WORLD_SEED));
  });

  it('值域 [0,1) 且真的在动（不是常数）', () => {
    const seq = 取序列(WORLD_SEED, 50);
    for (const v of seq) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(new Set(seq).size).toBe(seq.length);
  });

  it('反向控制：注入脚本确实改掉了该上下文里的 Math.random', () => {
    const MathShim = Object.create(Math);
    const 原 = MathShim.random;
    vm.runInNewContext(worldSeedSource(7), { Math: MathShim });
    expect(MathShim.random).not.toBe(原);
  });

  it('非法种子当场抛（uint32 之外的整数会被静默截断成空操作）', () => {
    for (const bad of [0, -1, 1.5, 0x100000000, NaN]) {
      expect(() => worldSeedSource(bad), `种子 ${bad} 应被拒`).toThrow(/种子/);
    }
  });
});

describe('接线：种子注入必须排在导航之前', () => {
  const 源 = readFileSync(join(process.cwd(), 'scripts/perf-smoke.mjs'), 'utf8');

  /** 顺序判据抽成纯函数，正向与反向控制共用（防"改坏了却仍判真"） */
  const 先注入后导航 = (text) => {
    const 注入 = text.indexOf('Page.addScriptToEvaluateOnNewDocument');
    const 导航 = text.indexOf("Page.navigate'");
    return 注入 >= 0 && 导航 >= 0 && 注入 < 导航;
  };

  it('perf-smoke 在 Page.navigate 之前注入 worldSeedSource(WORLD_SEED)', () => {
    expect(先注入后导航(源), '注入不在导航之前 —— 世界已经用上真随机了').toBe(true);
    expect(源).toContain("from './world-seed.mjs'");
    expect(源).toContain('worldSeedSource(WORLD_SEED)');
  });

  it('反向控制：把注入挪到导航之后，同一条判据必须判假', () => {
    // 用合成串而不是拿真源去 replace：真源的缩进/换行改一次，replace 就会静默落空，
    // 而那正是"反向控制自己坏了却仍判绿"的形状。
    const 挪后 = "await send('Page.navigate', {});\n"
      + "await send('Page.addScriptToEvaluateOnNewDocument', { source: worldSeedSource(WORLD_SEED) });";
    const 正确 = "await send('Page.addScriptToEvaluateOnNewDocument', { source: worldSeedSource(WORLD_SEED) });\n"
      + "await send('Page.navigate', {});";
    expect(先注入后导航(挪后), '判据对"挪到导航之后"仍然判真').toBe(false);
    expect(先注入后导航(正确), '判据对正确顺序判假 —— 尺子坏了').toBe(true);
    expect(先注入后导航('没有注入，只有 Page.navigate')).toBe(false);
  });
});
