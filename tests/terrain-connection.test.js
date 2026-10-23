// connectionTerrain 的覆盖 —— 它是地形组件族（hubPlateau / continentalNoise / corridorRidge /
// connectionTerrain / sampleGlobalHeight*）里**唯一**没被 terrain-height.test.js 覆盖的成员，
// 于是它的 `export` 在全仓没有消费者（扫描器把它列为"孤儿导出"）。按"族里其它成员都是靠用例
// 消费"的既有做法，正确的收口是**补测试**，不是删导出。
//
// 这个测试同时钉住一件比"覆盖率"更要紧的事：connectionTerrain 必须是 sampleGlobalHeight
// 里那一条连接项 —— 谁把 `+ connectionTerrain(...)` 从合成式里拿掉，第三条残差恒等当场红。
import { describe, it, expect } from 'vitest';
import {
  connectionTerrain, sampleGlobalHeight, continentalNoise, hubPlateau,
} from '../src/world/TerrainHeight.js';

describe('区际走廊地形 connectionTerrain', () => {
  it('离所有走廊足够远时归零（corridorRidge 在 2.2×halfWidth 之外返回 0）', () => {
    expect(connectionTerrain(5000, 5000)).toBe(0);
    expect(connectionTerrain(-5000, 3000)).toBe(0);
  });

  it('走廊中心"略低"（负值）、两侧隆起是正值（corridorRidge 的 -0.8 / 2.8 两档）', () => {
    // CORRIDORS 有一条 [0,55,0,220]（沿 x=0）。中心线 (0,100) 距它 0m → -0.8。
    expect(connectionTerrain(0, 100)).toBeLessThan(0);
    // (12,100) 距中心线 12m = halfWidth → 隆起峰 2.8。
    expect(connectionTerrain(12, 100)).toBeGreaterThan(0);
  });

  it('它是 sampleGlobalHeight 里的那一条连接项（残差恒等：从合成式里拿掉它这条会红）', () => {
    const pts = [[0, 100], [12, 100], [200, 80], [-100, 30], [0, -100], [5000, 5000]];
    for (const [x, z] of pts) {
      // sampleGlobalHeight(x,z,[]) = continentalNoise + connectionTerrain + hubPlateau（无区）
      const residual = sampleGlobalHeight(x, z, []) - continentalNoise(x, z) - hubPlateau(x, z);
      expect(residual, `(${x},${z}) 的连接项`).toBeCloseTo(connectionTerrain(x, z), 9);
    }
  });

  it('采样网格上恒为有限数（NaN 的地形高度会让网格与碰撞一起塌）', () => {
    for (let x = -250; x <= 250; x += 25) {
      for (let z = -250; z <= 250; z += 25) {
        expect(Number.isFinite(connectionTerrain(x, z)), `(${x},${z})`).toBe(true);
      }
    }
  });
});
