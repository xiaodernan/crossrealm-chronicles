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
 * - 7 条辐条路（to-*）共用枢纽原点 [0,55]（道路在枢纽交汇），且逐座区一条：
 *   `to-<zoneId>` 的末点逐字等于 `ZONE_CENTERS[zoneId]`（旧版只有 5 条，gloom /
 *   radiant 没有编排过的路 —— B6 的另一半，切片33 补齐）。
 * - hub-ring 是**闭合环**（首尾点重合）且每点在以 [0,55] 为心、半径 22 的圆上。
 *
 * 两枚变异探针走真数据（grep 确认落盘、预言命中、原字节还原）。
 */
import { describe, it, expect } from 'vitest';
import { WINDING_ROUTES } from '../src/content/windingRoutes.js';
import { ZONE_CENTERS, ZONE_ORDER, HUB_ZONE } from '../src/content/ZoneIdentity.js';

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
  it('7 条辐条路（to-*）共用枢纽原点 [0,55]', () => {
    const spokes = WINDING_ROUTES.filter((r) => r.id.startsWith('to-'));
    expect(spokes.length).toBe(ZONE_ORDER.length);
    for (const r of spokes) {
      expect(r.points[0], `${r.id} 起点`).toEqual([HUB_ZONE.center.x, HUB_ZONE.center.z]);
    }
  });

  it('逐座区一条：每座 ZONE_ORDER 都有 to-<id>，且终点逐字等于它的中心', () => {
    for (const zone of ZONE_ORDER) {
      const route = WINDING_ROUTES.find((r) => r.id === `to-${zone}`);
      expect(route, `没有通往 ${zone} 的辐条路`).toBeTruthy();
      expect(route.zone, `${route.id} 的 zone 字段与 id 不一致`).toBe(zone);
      const end = route.points[route.points.length - 1];
      expect(end, `${route.id} 的终点不是 ${zone} 的中心`).toEqual([
        ZONE_CENTERS[zone].x, ZONE_CENTERS[zone].z,
      ]);
    }
  });

  it('辐条的 id 不再说别处：没有 to-forest 这种"名字与终点对不上"的旧名', () => {
    const ids = WINDING_ROUTES.map((r) => r.id);
    expect(ids).not.toContain('to-forest');
    // 反向控制：名单里的每一枚 to-* 去掉前缀都得是 ZONE_ORDER 的成员
    const 陌生 = ids.filter((id) => id.startsWith('to-') && !ZONE_ORDER.includes(id.slice(3)));
    expect(陌生, '这些辐射路指向的不是一座真实区域').toEqual([]);
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
