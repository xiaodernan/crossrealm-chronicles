import { describe, it, expect } from 'vitest';
import { bodyOf, separationPush } from '../src/ai/Separation.js';

/**
 * 分离转向（ai/Separation.js）—— 敌人互不重叠、不钻进玩家身体。
 *
 * 整模块纯数学、无 THREE / 无 DOM，是理想的"走真代码路径 + 变异探针"目标。
 * 调参对象 `ai` 在这里**显式传入**，不依赖 `content/tuning.js` 的真值（那格会变，
 * 门禁不该跟着飘）。
 *
 * `repel` / `degeneratePush` 是模块内部函数，但 `separationPush` 真调用它们，所以探针
 * 改坏内部那一行、由导出的 `separationPush` 暴露红，仍算"走真代码路径"。
 */
describe('separationPush · 基础不变量', () => {
  // 确定性调参
  const AI = { separationPad: 0.5, separationForce: 3 };
  const at = (x, z) => ({ x, z });

  it('bodyOf 把位置与半径/种子包成分离体', () => {
    const b = bodyOf(at(1, 2), 2.5, 7);
    expect(b.position).toEqual({ x: 1, z: 2 });
    expect(b.separationRadius()).toBe(2.5);
    expect(b.separationSeed()).toBe(7);
  });

  it('范围内重叠的邻居产生"远离对方"的推力', () => {
    const self = bodyOf(at(0, 0), 1);
    const other = bodyOf(at(1, 0), 1); // 相距 1，want = 1+1+0.5 = 2.5，在挤压范围
    const p = separationPush(self, [other], AI);
    expect(p).not.toBeNull();
    expect(p.x).toBeLessThan(0); // 对方在 +x，推力朝 -x（远离）
    expect(Math.abs(p.z)).toBeLessThan(1e-9);
  });

  it('超出挤压范围（dist >= want）不产生推力', () => {
    const self = bodyOf(at(0, 0), 1);
    const other = bodyOf(at(10, 0), 1); // 相距 10 >> want = 2.5
    expect(separationPush(self, [other], AI)).toBeNull();
  });

  it('没有邻居返回 null', () => {
    const self = bodyOf(at(0, 0), 1);
    expect(separationPush(self, [], AI)).toBeNull();
  });

  it('完全重叠（dist≈0）走退化散开方向，不返回 NaN', () => {
    const self = bodyOf(at(0, 0), 1, 1);
    const other = bodyOf(at(0, 0), 1, 2); // 同位置
    const p = separationPush(self, [other], AI);
    expect(p).not.toBeNull();
    expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
  });

  it('推力大小被 separationForce 上限钳住（多邻居不抖成一团）', () => {
    const self = bodyOf(at(0, 0), 1);
    // 两个紧贴邻居放在同侧，weight 累加饱和到 1，结果幅度应恰为 separationForce
    const others = [bodyOf(at(0.1, 0.05), 1), bodyOf(at(0.1, -0.05), 1)];
    const p = separationPush(self, others, AI);
    expect(p).not.toBeNull();
    const mag = Math.hypot(p.x, p.z);
    expect(mag).toBeCloseTo(AI.separationForce, 5); // = separationForce * min(1, weight)，weight 已饱和
    expect(p.x).toBeLessThan(0); // 仍朝远离对方的方向
  });
});
