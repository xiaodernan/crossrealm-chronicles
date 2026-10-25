/**
 * 营火 NPC 待机微动门禁 —— 钉 `world/RestNpcIdleDirector.js`。
 *
 * 被 `core/Game.js` 真实驱动，但此前零直接测试。三条可回归契约：
 * 1. `attachRestNpcs` 只给**有 mesh** 的 NPC 记 baseY（无 mesh 跳过，null 容错）；
 * 2. 距离判定**每帧**做，超距（>20 单位，平方 >400）NPC 不微动；
 * 3. 位置抖动降频 **1/2 帧**：视觉帧才 bob，非视觉帧 y 不动；bob 公式含
 *    `phase*2 + restId 长度` 的相位偏移与 0.04 幅度。
 *
 * 帧奇偶由 `FrameBudget.resetForTest()/tick()` 精确控制（生产帧计数由主循环驱动，
 * 测试自行重置账期）。两枚变异探针走真 `update()`，预言命中后原字节还原。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { RestNpcIdleDirector } from '../src/world/RestNpcIdleDirector.js';
import { resetForTest, tick } from '../src/engine/FrameBudget.js';

function makeGame(npcs) {
  return { restNpcs: { npcs } };
}
function makeNpc(id, x, z, y) {
  return { restId: id, mesh: { position: { x, y, z } } };
}

// 每例前重置全局帧账期，保证帧奇偶确定
beforeEach(() => resetForTest());

describe('RestNpcIdleDirector 构造与挂载', () => {
  it('构造期 phase 归零', () => {
    const d = new RestNpcIdleDirector(makeGame([]));
    expect(d.phase).toBe(0);
  });

  it('attachRestNpcs 给有 mesh 的 NPC 记 baseY，无 mesh 跳过', () => {
    const d = new RestNpcIdleDirector(makeGame([]));
    const a = makeNpc('a', 0, 0, 3.5);
    const noMesh = { restId: 'b' };
    d.attachRestNpcs([a, noMesh]);
    expect(a.baseY).toBe(3.5);
    expect(noMesh.baseY).toBeUndefined();
  });

  it('attachRestNpcs 对 null/undefined 不抛', () => {
    const d = new RestNpcIdleDirector(makeGame([]));
    expect(() => d.attachRestNpcs(null)).not.toThrow();
    expect(() => d.attachRestNpcs(undefined)).not.toThrow();
  });
});

describe('RestNpcIdleDirector.update 微动', () => {
  it('视觉帧：近处 NPC 上下微动，y = baseY + bob（公式钉死）', () => {
    resetForTest(); // frame 0 → shouldUpdate(2)=true
    const near = makeNpc('ab', 1, 0, 2); // restId 长度 2
    const d = new RestNpcIdleDirector(makeGame([near]));
    d.attachRestNpcs([near]); // baseY = 2
    d.update(0.1, { x: 1, z: 0 }); // 贴身；phase → 0.1
    const expectedBob = Math.sin(0.1 * 2 + 2) * 0.04;
    expect(near.mesh.position.y).toBeCloseTo(2 + expectedBob, 10);
  });

  it('非视觉帧：位置不动（降频 1/2 帧）', () => {
    resetForTest();
    tick(); // frame 1 → shouldUpdate(2)=false
    const near = makeNpc('ab', 1, 0, 2);
    const d = new RestNpcIdleDirector(makeGame([near]));
    d.attachRestNpcs([near]);
    d.update(0.1, { x: 1, z: 0 });
    expect(near.mesh.position.y).toBe(2); // 未 bob
  });

  it('超距 NPC 不微动（距离判定每帧做，平方 >400）', () => {
    resetForTest(); // 视觉帧
    const far = makeNpc('ab', 40, 0, 2); // 40 单位 → dist²=1600 > 400
    const d = new RestNpcIdleDirector(makeGame([far]));
    d.attachRestNpcs([far]);
    d.update(0.1, { x: 0, z: 0 });
    expect(far.mesh.position.y).toBe(2); // 被距离剔除，未 bob
  });

  it('边界内（恰 20 单位，dist²=400）仍微动', () => {
    resetForTest(); // 视觉帧
    const edge = makeNpc('ab', 20, 0, 2); // dist²=400，不 > 400 → 不剔除
    const d = new RestNpcIdleDirector(makeGame([edge]));
    d.attachRestNpcs([edge]);
    d.update(0.1, { x: 0, z: 0 });
    const expectedBob = Math.sin(0.1 * 2 + 2) * 0.04;
    expect(edge.mesh.position.y).toBeCloseTo(2 + expectedBob, 10);
  });

  it('无 mesh 的 NPC 跳过不抛', () => {
    resetForTest();
    const noMesh = { restId: 'x' };
    const d = new RestNpcIdleDirector(makeGame([noMesh]));
    expect(() => d.update(0.1, { x: 0, z: 0 })).not.toThrow();
  });

  it('restNpcs 缺失时退化为空数组不抛', () => {
    resetForTest();
    const d = new RestNpcIdleDirector({});
    expect(() => d.update(0.1, { x: 0, z: 0 })).not.toThrow();
  });
});
