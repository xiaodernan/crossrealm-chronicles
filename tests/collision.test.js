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

  /**
   * `blockedBy()` 是 `blocked()` 的同一件事、只是把**答案**交出来（B125 的门禁要说
   * "闷在哪一块上"）。两条必须逐段同意 —— 谁抄了谁的采样、或谁漏了一种形状，这里就红。
   */
  it('blocked() 就是 blockedBy() 非空：逐段一致，交出的正是挡住那一份', () => {
    const w = new CollisionWorld();
    w.addCylinder({ x: 5, z: 0, r: 1.5, top: 8 });
    w.addBox({ x: 0, z: 6, hx: 1, hz: 3, base: 0, top: 4 });
    w.build();
    const 段 = [
      [0, 0, 10, 0, 1],      // 穿柱
      [0, 5, 10, 5, 1],      // 从盒子边上过去
      [0, 4.2, 10, 4.2, 1],  // 更贴盒子边（1.25 米那一格刚好在外）
      [0, 0, 0, 12, 1],      // 穿盒
      [0, 0, 10, 0, 9],      // 高于一切顶面
      [0, 0, 1, 0, 1],       // 短于一拍：段内一个采样点都不取
    ];
    for (const [x1, z1, x2, z2, y] of 段) {
      const 报名 = w.blockedBy(x1, z1, x2, z2, y) !== null;
      expect(报名, `线段 (${x1},${z1})→(${x2},${z2}) y=${y}：两条判据说的不是一件事`)
        .toBe(w.blocked(x1, z1, x2, z2, y));
    }
    expect(w.blockedBy(0, 0, 10, 0, 1).shape).toBe('cyl');
    expect(w.blockedBy(0, 0, 0, 12, 1).shape).toBe('box');
    expect(w.blockedBy(0, 4.2, 10, 4.2, 1)).toBe(null);
    expect(w.blockedBy(0, 0, 1, 0, 1), '短于一拍却报出了东西 —— 采样语义与文档不一致').toBe(null);
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

  /**
   * 斜墙的三个可观测面，一起构成"按朝向阻挡"这句话的意思。
   *
   * 为什么旧的那句 `expect(r.z).toBeLessThan(5)` 要撤掉：它在**法线漏转**时恰好成立。
   * 漏转把盒局部系的 (0,−1) 当成世界系法线交出去，于是玩家被原路顶回世界 −z，z 当然过不去
   * ——一条给错几何盖绿灯的断言，比没有断言更糟（实测：漏转版终点 (0, 5.15)，切向走了 0 米）。
   * 真正的朝向证据是切向：45° 墙把 +z 的推力转成沿墙面的位移，而轴对齐的墙不该有这份位移。
   */
  describe('旋转盒按其朝向阻挡', () => {
    /** 世界系 → 盒局部系：与 contact()/blockersAt() 同一套约定 R(−rot) */
    const 局部 = (点, 中心, 转角) => ({
      lx: (点.x - 中心.x) * Math.cos(转角) + (点.z - 中心.z) * Math.sin(转角),
      lz: (点.z - 中心.z) * Math.cos(转角) - (点.x - 中心.x) * Math.sin(转角),
    });

    const 斜墙 = { x: 0, z: 6, hx: 40, hz: 0.4, rot: Math.PI / 4 };

    it('斜墙前直冲：沿墙面被送走，且始终留在起始那一侧、没贴进实体里', () => {
      const w = new CollisionWorld();
      w.addBox({ ...斜墙, top: 5 });
      const 起 = { x: 0, z: 0 };
      const r = w.moveCircle(起.x, 起.z, R, 0, 20);
      expect(r.hit).toBe(true);
      const 起点局部 = 局部(起, 斜墙, 斜墙.rot);
      const 终点局部 = 局部(r, 斜墙, 斜墙.rot);
      // ① 没穿过墙面：起始在 lz<0 那一侧，结束仍在那一侧
      expect(终点局部.lz).toBeLessThan(0);
      // ② 没被埋：到盒最近点的距离 ≥ 玩家半径（贴着面站，而不是嵌在里面）
      expect(Math.abs(终点局部.lz) - 斜墙.hz).toBeGreaterThanOrEqual(R - 1e-3);
      // ③ 朝向的证据：+z 的 20 米推力里，沿墙切向占 sin45≈0.707；漏转法线时这一项是 0
      expect(终点局部.lx - 起点局部.lx).toBeGreaterThan(8);
    });

    it('对照：轴对齐的墙把纯法向推力全部吃掉，不该冒出切向滑行', () => {
      const w = new CollisionWorld();
      const 墙 = { x: 0, z: 6, hx: 40, hz: 0.4, rot: 0 };
      w.addBox({ ...墙, top: 5 });
      const r = w.moveCircle(0, 0, R, 0, 20);
      expect(r.hit).toBe(true);
      expect(Math.abs(r.x)).toBeLessThan(1e-9);
    });

    it('已经嵌在斜墙里时脱困：出口在墙的法线上，而不是在世界坐标轴上', () => {
      const w = new CollisionWorld();
      w.addBox({ ...斜墙, top: 5 });
      w.build();
      const 出 = w.unpenetrate(斜墙.x, 斜墙.z, R);
      const Δx = Math.abs(出.x - 斜墙.x);
      const Δz = Math.abs(出.z - 斜墙.z);
      // 45° 墙的浅出口 = 局部 ±z 轴，转回世界系后 x、z 位移必然等量；漏转版只有 z 在动
      expect(Math.abs(Δx - Δz)).toBeLessThan(1e-6);
      expect(Δx).toBeGreaterThan(0.1);
      const 终点局部 = 局部(出, 斜墙, 斜墙.rot);
      expect(Math.abs(终点局部.lz)).toBeGreaterThanOrEqual(斜墙.hz + R - 1e-3);
    });
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
