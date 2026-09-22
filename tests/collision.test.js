import { describe, it, expect } from 'vitest';
import { CollisionWorld, PLATFORM, GHOST } from '../src/engine/Collision.js';

const R = 0.4;

describe('CollisionWorld', () => {
  it('无障碍时直线移动', () => {
    const w = new CollisionWorld();
    w.build();
    const r = w.moveCircle(0, 0, R, 5, 0);
    expect(r.x).toBeCloseTo(5);
    expect(r.hit).toBe(false);
  });

  it('正对圆柱时停在表面外，不穿透', () => {
    const w = new CollisionWorld();
    w.addCylinder({ x: 3, z: 0, r: 1, top: 5 });
    const r = w.moveCircle(0, 0, R, 10, 0);
    expect(r.x).toBeLessThan(3 - 1 - R + 0.01);
    expect(r.hit).toBe(true);
  });

  it('沿墙滑行：斜向推入不丢失切向位移', () => {
    const w = new CollisionWorld();
    w.addBox({ x: 0, z: 2, hx: 40, hz: 0.5, top: 5 }); // 一堵横墙
    const r = w.moveCircle(0, -20, R, 0.5, 1.0);
    expect(r.z).toBeGreaterThan(-20);
    expect(r.z).toBeLessThan(-16);
    // 法向（z）被墙挡住大半，切向（x）应基本保留
    expect(r.x).toBeGreaterThan(0.4);
  });

  it('高架横梁不阻挡低处通行，抬脚后阻挡', () => {
    const w = new CollisionWorld();
    w.addBox({ x: 0, z: 5, hx: 4, hz: 0.5, base: 3, top: 4 });
    expect(w.moveCircle(0, 0, R, 0, 12, 0).z).toBeCloseTo(12);
    expect(w.moveCircle(0, 0, R, 0, 12, 3.5).z).toBeLessThan(5);
  });

  it('盒碰撞：从侧面被推出，不穿墙', () => {
    const w = new CollisionWorld();
    w.addBox({ x: 0, z: 6, hx: 5, hz: 1, top: 5 });
    const r = w.moveCircle(0, 0, R, 0, 20);
    expect(r.z).toBeLessThan(6 - 1 - R + 0.01);
  });

  it('圆心在盒内时可脱困', () => {
    const w = new CollisionWorld();
    w.addBox({ x: 0, z: 0, hx: 2, hz: 2, top: 5 });
    const out = w.unpenetrate(0, 0, R);
    expect(Math.hypot(out.x, out.z)).toBeGreaterThan(1.5);
  });

  it('ghost 不参与碰撞', () => {
    const w = new CollisionWorld();
    w.addCylinder({ x: 0, z: 2, r: 1, top: 5, kind: GHOST });
    expect(w.moveCircle(0, 0, R, 0, 10).z).toBeCloseTo(10);
  });

  it('platform 顶面可站立，stepUp 限制生效', () => {
    const w = new CollisionWorld();
    w.addBox({ x: 0, z: 0, hx: 3, hz: 3, base: 0, top: 1.2, kind: PLATFORM });
    expect(w.supportAt(0, 0, R, 1.0, 0.6)).toBeCloseTo(1.2);
    expect(w.supportAt(0, 0, R, 0.2, 0.6)).toBe(null);
    expect(w.supportAt(20, 20, R, 0.2, 0.6)).toBe(null);
  });

  it('视线遮挡判定', () => {
    const w = new CollisionWorld();
    w.addCylinder({ x: 5, z: 0, r: 1.5, top: 8 });
    expect(w.blocked(0, 0, 10, 0, 1)).toBe(true);
    expect(w.blocked(0, 5, 10, 5, 1)).toBe(false);
    expect(w.blocked(0, 0, 10, 0, 9)).toBe(false); // 高于障碍顶面
  });

  it('空间哈希只返回邻域候选', () => {
    const w = new CollisionWorld(8);
    for (let i = 0; i < 200; i++) w.addCylinder({ x: i * 3, z: 0, r: 0.5, top: 4 });
    w.build();
    expect(w.candidates(0, 0, 1).length).toBeLessThan(10);
    // 远处障碍不参与：从 (0,-30) 向 (0,+5) 移动无障碍可走满
    expect(w.moveCircle(0, -30, R, 0, 5).z).toBeCloseTo(-25, 3);
  });

  it('穿越柱阵后不落在任何障碍内部', () => {
    const w = new CollisionWorld(8);
    const many = [];
    for (let i = 0; i < 60; i++) {
      const x = (i % 10) * 4 - 18;
      const z = Math.floor(i / 10) * 4 - 8;
      w.addCylinder({ x, z, r: 1, top: 5 });
      many.push({ x, z, r: 1 });
    }
    w.build();
    const a = w.moveCircle(0, 0, R, 1.2, 0.9);
    expect(a.hit).toBe(true);
    for (const c of many) {
      expect(Math.hypot(a.x - c.x, a.z - c.z)).toBeGreaterThanOrEqual(c.r + R - 1e-3);
    }
  });

  it('高速冲刺不穿墙（隧穿保护）', () => {
    const w = new CollisionWorld();
    w.addBox({ x: 0, z: 3, hx: 6, hz: 0.3, top: 5 });
    // 单帧 20 单位的位移（低帧率 / 冲刺）也必须被墙挡住
    expect(w.moveCircle(0, 0, R, 0, 20).z).toBeLessThan(3);
  });

  it('旋转盒按其朝向阻挡', () => {
    const w = new CollisionWorld();
    // 45° 斜墙：从墙角正前方出发应被挡住
    w.addBox({ x: 0, z: 6, hx: 8, hz: 0.4, top: 5, rot: Math.PI / 4 });
    const r = w.moveCircle(0, 0, R, 0, 20);
    expect(r.hit).toBe(true);
    expect(r.z).toBeLessThan(5);
  });

  it('密林场景单帧碰撞开销低于 0.3ms', () => {
    const w = new CollisionWorld(16);
    let seed = 1;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 900; i++) {
      w.addCylinder({ x: (rand() - 0.5) * 500, z: (rand() - 0.5) * 600, r: 0.6 + rand(), base: -1, top: 6 });
    }
    w.build();
    let x = 0;
    let z = 0;
    const t0 = performance.now();
    for (let f = 0; f < 600; f++) {
      const r = w.moveCircle(x, z, R, 0.25, 0.18, 0);
      x = r.x;
      z = r.z;
      w.supportAt(x, z, R, 0, 0.65);
    }
    const perFrame = (performance.now() - t0) / 600;
    expect(perFrame).toBeLessThan(0.3);
  });
});
