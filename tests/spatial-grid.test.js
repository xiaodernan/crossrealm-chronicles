import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SpatialGrid } from '../src/ai/SpatialGrid.js';
import { bodyOf, separationPush } from '../src/ai/Separation.js';
import { AI } from '../src/content/tuning.js';

/**
 * W-Z2：空间哈希网格的**等价性**门禁。
 *
 * 最重要的一条不是「快了」，而是「推力一个字节都没变」：网格只产出候选集，
 * 最终的距离判定仍在 `repel` 里。所以这里对拍随机群体，逐只比较
 * `separationPush(self, 全量)` 与 `separationPush(self, grid.query(self))`。
 * 少给一个邻居 = 一只怪会突然叠进另一只，而所有单测都还是绿的 —— 这正是
 * 「优化了但玩法悄悄变了」最难查的形态。
 */
const 读 = (p) => readFileSync(join(process.cwd(), p), 'utf8');
const at = (x, z) => ({ x, z });

/** 确定性伪随机，不用 Math.random：红的用例下次还能复现 */
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function crowd(seed, n, spread = 50) {
  const rnd = lcg(seed);
  return Array.from({ length: n }, (_, i) => bodyOf(
    at((rnd() - 0.5) * spread * 2, (rnd() - 0.5) * spread * 2),
    0.5 + rnd() * 2.5,
    i,
  ));
}

function samePush(a, b) {
  if (a === null || b === null) return a === b;
  return Math.abs(a.x - b.x) < 1e-8 && Math.abs(a.z - b.z) < 1e-8;
}

describe('SpatialGrid · 结构不变量', () => {
  it('insert 只收有限坐标的身体；clear/rebuild 可反复用', () => {
    const g = new SpatialGrid(4);
    expect(g.insert(bodyOf(at(1, 2), 1))).toBe(true);
    expect(g.insert(bodyOf(at(NaN, 2), 1))).toBe(false);
    expect(g.insert({})).toBe(false);
    expect(g.bodies).toHaveLength(1);
    expect(g.maxRadius).toBe(1);
    g.rebuild([bodyOf(at(3, 4), 2.5), bodyOf(at(9, 9), 1)]);
    expect(g.bodies).toHaveLength(2);
    expect(g.maxRadius).toBe(2.5);
    expect(g.cells.size).toBeGreaterThan(0);
  });

  it('同一个身体插入两次只算一个邻居（否则推力会翻倍）', () => {
    const g = new SpatialGrid(4);
    const b = bodyOf(at(0, 0), 1);
    expect(g.insert(b)).toBe(true);
    expect(g.insert(b)).toBe(false);
    const self = bodyOf(at(0.5, 0), 1);
    expect(g.query(self, 0.5)).toHaveLength(1);
  });

  it('负坐标与格子边界不得漏：AABB 覆盖圆，跨格也要查到', () => {
    const g = new SpatialGrid(6);
    const self = bodyOf(at(-6.1, 5.9), 1);
    const near = bodyOf(at(-5.9, 6.1), 1); // 边界两侧、距离 < 0.3
    g.rebuild([self, near]);
    expect(g.query(self, 0.35)).toContain(near);
  });

  it('maxRadius 是查询上界：大个子哪怕离得远也必须进候选', () => {
    const g = new SpatialGrid(6);
    const big = bodyOf(at(8, 0), 8);
    const self = bodyOf(at(0, 0), 1);
    g.rebuild([self, big]);
    // want = 1 + 8 + 0.35 = 9.35 > 距离 8：这一对真的会推
    expect(g.radiusFor(self, 0.35)).toBeGreaterThan(8);
    expect(g.query(self, 0.35)).toContain(big);
  });

  it('传自己的 out 数组时不污染默认复用数组', () => {
    const g = new SpatialGrid(4);
    const other = bodyOf(at(0.5, 0), 1);
    g.rebuild([other]);
    const mine = [];
    const self = bodyOf(at(0, 0), 1);
    expect(g.query(self, 0.35, mine)).toBe(mine);
    expect(mine).toContain(other);
    expect(g._out).toHaveLength(0);
  });
});

describe('SpatialGrid · 与全遍历逐只对拍（不改玩法）', () => {
  it.each([1, 7, 20261112])('随机群体 seed=%i：200 只的推力逐值相等', (seed) => {
    const bodies = crowd(seed, 200);
    const g = new SpatialGrid(6);
    g.rebuild(bodies);
    for (const self of bodies) {
      const full = separationPush(self, bodies, AI);
      const pruned = separationPush(self, g.query(self, AI.separationPad), AI);
      expect(samePush(full, pruned), `seed=${seed} 某只怪的分离推力变了`).toBe(true);
    }
  });

  it('密集重叠（全部挤在原点附近）：退化散开方向也不许漏', () => {
    const bodies = Array.from({ length: 40 }, (_, i) => bodyOf(at(0.001 * i, 0), 1, i));
    const g = new SpatialGrid(6);
    g.rebuild(bodies);
    for (const self of bodies) {
      const full = separationPush(self, bodies, AI);
      const pruned = separationPush(self, g.query(self, AI.separationPad), AI);
      expect(samePush(full, pruned)).toBe(true);
    }
  });

  it('显式调参对象（pad 与真值不同）也按 self 自己的 pad 算半径', () => {
    const ai = { separationPad: 5, separationForce: 7 };
    const bodies = crowd(99, 60, 12);
    const g = new SpatialGrid(6);
    g.rebuild(bodies);
    for (const self of bodies) {
      const full = separationPush(self, bodies, ai);
      const pruned = separationPush(self, g.query(self, ai.separationPad), ai);
      expect(samePush(full, pruned)).toBe(true);
    }
  });
});

describe('SpatialGrid · 剪枝的结构读数（不看墙钟）', () => {
  it('1000 只均匀分布：平均候选数不到全量的 10%', () => {
    const bodies = crowd(424242, 1000, 100);
    const g = new SpatialGrid(6);
    g.rebuild(bodies);
    for (const self of bodies) g.query(self, AI.separationPad);
    expect(g.stats.queries).toBe(1000);
    // 全遍历要做 n² = 1,000,000 次 repel；这里只做 candidates 次
    expect(g.stats.candidates).toBeLessThan(100_000);
    expect(g.candidateRatio()).toBeLessThan(0.1);
    expect(g.stats.bucketsScanned / g.stats.queries).toBeLessThan(16);
  });
});

describe('W-Z2 接线：网格真的接到每帧的敌人更新上', () => {
  const enemy = 读('src/combat/Enemy.js');
  const mgr = 读('src/combat/EnemyManager.js');

  it('Enemy._advance 优先取邻域候选，且把 self 的 separationPad 传下去', () => {
    expect(enemy).toMatch(/ctx\.neighborsFor\s*===\s*['"]function['"]/);
    expect(enemy).toMatch(/ctx\.neighborsFor\(this,\s*this\.ai\?\.separationPad/);
    expect(enemy).toMatch(/:\s*\(ctx\.neighbors \?\? \[\]\)/);
  });

  it('EnemyManager 每帧 rebuild 一次，且玩家身体在同一份名单里', () => {
    expect(mgr).toMatch(/this\._grid\s*\?\?=\s*new SpatialGrid\(\)/);
    expect(mgr).toMatch(/this\._grid\.rebuild\(neighbors\)/);
    expect(mgr).toMatch(/neighbors\.push\(this\._playerBody\)/);
    expect(mgr).toMatch(/ctx\.neighborsFor\s*=\s*this\._neighborsFor/);
  });

  it('ctx 初值显式声明 neighborsFor，老 ctx 走全量兜底', () => {
    expect(mgr).toMatch(/neighborsFor:\s*null/);
  });
});
