import { describe, it, expect } from 'vitest';
import {
  hubPlateau,
  continentalNoise,
  corridorRidge,
  sampleGlobalHeight,
  sampleGlobalHeightSmooth,
  sampleGroundNormal,
} from '../src/world/TerrainHeight.js';

const fakeZone = (x, z, h) => ({ getHeightAt: (px, pz) => (px === x && pz === z ? h : 0) });

describe('TerrainHeight', () => {
  it('枢纽台地在中心最高、超出半径后归零', () => {
    expect(hubPlateau(0, 55)).toBeGreaterThan(3);
    expect(hubPlateau(0, 200)).toBe(0);
  });

  it('大陆噪声有界（保证 M1 碰撞层可用有限范围做空间哈希）', () => {
    let min = Infinity;
    let max = -Infinity;
    for (let x = -600; x <= 600; x += 7) {
      for (let z = -600; z <= 600; z += 11) {
        const h = continentalNoise(x, z);
        min = Math.min(min, h);
        max = Math.max(max, h);
      }
    }
    expect(min).toBeGreaterThan(-25);
    expect(max).toBeLessThan(25);
  });

  it('走廊中心凹陷、两侧隆起', () => {
    const seg = [0, 55, 200, 80];
    const center = corridorRidge(100, 67.5, ...seg, 12);
    const ridge = corridorRidge(98.5, 79.4, ...seg, 12);
    const far = corridorRidge(100, 900, ...seg, 12);
    expect(far).toBe(0);
    expect(center).toBeLessThan(0);
    expect(ridge).toBeGreaterThan(center);
  });

  it('zone 高度参与取最大值', () => {
    const zones = [fakeZone(3, 4, 99)];
    expect(sampleGlobalHeight(3, 4, zones)).toBeGreaterThanOrEqual(99);
  });

  it('平滑采样与单点采样偏差很小（四角平均不应制造台阶）', () => {
    const raw = sampleGlobalHeight(37, -91, []);
    const smooth = sampleGlobalHeightSmooth(37, -91, []);
    expect(Math.abs(raw - smooth)).toBeLessThan(0.5);
  });

  it('法线为单位向量且朝上', () => {
    const n = sampleGroundNormal(10, 10, []);
    expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 5);
    expect(n.y).toBeGreaterThan(0);
  });
});
