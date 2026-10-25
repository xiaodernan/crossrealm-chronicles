/**
 * 区际蜿蜒道路门禁 —— 钉 `content/windingRoutes.js`。
 *
 * 被 6 个模块跨 `ui/`（HUD 小地图、WorldMapPanel 世界地图）与 `world/`
 * （WorldTerrain 压平路面、WorldDecorations 沿路撒装饰）读取，正是当年把它从
 * `world/` 搬到 `content/` 以避免 `chunk-ui → chunk-world` 回边（B37）的那份数据，
 * 但此前**零直接测试**。
 *
 * 消费端实际依赖的不变量：
 * - 每条路 `points` 是 [x,z] 数对数组、`color` 是数字、`id` 唯一非空；
 * - **恰有一条 `hub-ring`**（WorldTerrain 给它路面宽 5、其余 7；WorldDecorations
 *   沿路撒装饰时 `continue` 跳过它）—— 缺一条或多条都会让特判落空；
 * - 5 条辐条路（to-*）共用枢纽原点 [0,55]（道路在枢纽交汇）；
 * - hub-ring 是**闭合环**（首尾点重合）且每点在以 [0,55] 为心、半径 22 的圆上。
 *
 * 两枚变异探针走真数据（grep 确认落盘、预言命中、原字节还原）。
 */
import { describe, it, expect } from 'vitest';
import { WINDING_ROUTES } from '../src/content/windingRoutes.js';

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

describe('WINDING_ROUTES 结构', () => {
  it('每条路 id 唯一非空、color 为数字、points 为非空 [x,z] 数对数组', () => {
    const ids = new Set();
    for (const r of WINDING_ROUTES) {
      expect(typeof r.id, 'id 串').toBe('string');
      expect(r.id.length, 'id 非空').toBeGreaterThan(0);
      ids.add(r.id);
      expect(typeof r.color, 'color 数').toBe('number');
      expect(Array.isArray(r.points), 'points 数组').toBe(true);
      expect(r.points.length, 'points 非空').toBeGreaterThan(0);
      for (const p of r.points) {
        expect(Array.isArray(p), '点是数组').toBe(true);
        expect(p.length, '点是 [x,z] 二元').toBe(2);
        expect(isNum(p[0]), 'x 有限数').toBe(true);
        expect(isNum(p[1]), 'z 有限数').toBe(true);
      }
    }
    expect(ids.size, 'id 唯一').toBe(WINDING_ROUTES.length);
  });

  it('恰有一条 hub-ring（WorldTerrain 宽度 / WorldDecorations 剔除都特判它）', () => {
    const rings = WINDING_ROUTES.filter((r) => r.id === 'hub-ring');
    expect(rings.length).toBe(1);
  });
});

describe('WINDING_ROUTES 拓扑', () => {
  it('5 条辐条路（to-*）共用枢纽原点 [0,55]', () => {
    const spokes = WINDING_ROUTES.filter((r) => r.id.startsWith('to-'));
    expect(spokes.length).toBe(5);
    for (const r of spokes) {
      expect(r.points[0], `${r.id} 起点`).toEqual([0, 55]);
    }
  });

  it('hub-ring 是闭合环：首尾点重合', () => {
    const ring = WINDING_ROUTES.find((r) => r.id === 'hub-ring');
    const first = ring.points[0];
    const last = ring.points[ring.points.length - 1];
    expect(last[0]).toBeCloseTo(first[0], 6);
    expect(last[1]).toBeCloseTo(first[1], 6);
  });

  it('hub-ring 每点都在以 [0,55] 为心、半径 22 的圆上', () => {
    const ring = WINDING_ROUTES.find((r) => r.id === 'hub-ring');
    for (const [x, z] of ring.points) {
      expect(Math.hypot(x, z - 55)).toBeCloseTo(22, 6);
    }
  });
});
