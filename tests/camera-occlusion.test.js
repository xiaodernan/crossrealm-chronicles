/**
 * M3 第二切片：第三人称镜头对实体遮挡（修 B3）。
 *
 * 旧实现只对地形高度采样 —— 于是镜头穿过所有墙、柱、树干：玩家靠墙一站，
 * 画面就是"从墙里长出来的半个模型"。这一组用例钉住四件事：
 * 挡得住（几何）、看得懂高度（矮墙不该挡住高机位）、退得快出得慢（不弹跳）、
 * 以及**不许误用 `blocked()` 当逐段查询**（它对短段恒为"没挡住"）。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { PlayerController } from '../src/player/PlayerController.js';
import { CollisionWorld } from '../src/engine/Collision.js';
import { CAMERA_FOV, CAMERA_OCCLUSION } from '../src/content/tuning.js';
import { installWindowShim } from './helpers/enemyHarness.js';

beforeAll(installWindowShim);

const mkWorld = (build = () => {}, ground = () => 0) => {
  const cw = new CollisionWorld(16);
  build(cw);
  cw.build();
  return { getGroundHeight: ground, collision: cw, bounds: null };
};

const mkPlayer = (world) => {
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV.third, 1.6, 0.1, 100);
  const game = {
    paused: false, cinematicActive: false, autoPlayMode: false,
    dialog: { toast() {} }, combatCamera: null, restScene: null,
  };
  const p = new PlayerController({ add() {}, remove() {} }, camera, world, game);
  p.teleport(0, 0, 0);
  p.yaw = 0;                       // 正前方 +Z → 机位落在 -Z 一侧
  p.pitch = 0;
  return { p, camera };
};

/** 收敛到稳态（阻尼是指数式的，跑一秒足够） */
const settle = (p, camera, seconds = 1.2, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) { p.updateCamera(dt); }
  return camera.position.clone();
};

const wall = (cw, { z = -3, top = 6, hz = 0.3, base = -1 } = {}) =>
  cw.addBox({ x: 0, z, hx: 6, hz, base, top });

describe('实体真的能挡住镜头', () => {
  it('没有遮挡时机位停在期望距离上', () => {
    const { p, camera } = mkPlayer(mkWorld());
    const at = settle(p, camera);
    expect(at.z).toBeCloseTo(-p.cameraDistance, 1);
  });

  it('一堵墙插在中间：相机收到墙前，不再穿到墙后', () => {
    const { p, camera } = mkPlayer(mkWorld((cw) => wall(cw)));
    const at = settle(p, camera);
    // 墙近表面在 z = -2.7，含 pointPad 的接触点在 -2.48，再留 wallMargin → 大约 -2.2
    expect(at.z).toBeGreaterThan(-2.55);
    expect(at.z).toBeLessThan(-1.9);               // 也不许远远停在开外（那是"一米外就挡不住"的老毛病）
    expect(Math.abs(at.z)).toBeLessThan(p.cameraDistance);
  });

  it('力臂下限不许反过来把镜头停在障碍物里面（浏览器实读踩出来的坑）', () => {
    // 柱子近表面在 1.5 米处；旧参数 minPull=0.3 会算出 1.56 米的"安全位"，正好在柱子里
    const { p, camera } = mkPlayer(mkWorld((cw) => cw.addCylinder({ x: 0, z: -2.6, r: 1.1, base: -1, top: 8 })));
    const at = settle(p, camera);
    const distToAxis = Math.hypot(at.x, at.z + 2.6);
    expect(distToAxis).toBeGreaterThan(1.1);                 // 在柱面之外
    expect(distToAxis).toBeGreaterThan(1.1 + CAMERA_OCCLUSION.pointPad - 0.02);
    expect(Math.hypot(at.x, at.z)).toBeGreaterThan(0.4);     // 也没钻进玩家身体
  });

  it('柱子（圆柱实体）同样挡：树干不是可以被镜头穿过去的东西', () => {
    const { p, camera } = mkPlayer(mkWorld((cw) => cw.addCylinder({ x: 0, z: -3, r: 0.9, base: -1, top: 9 })));
    const at = settle(p, camera);
    expect(Math.abs(at.z)).toBeLessThan(3 - 0.9);
  });

  it('旋转过的盒子按旋转后的面来挡，不是按外接方框', () => {
    const thin = mkWorld((cw) => cw.addBox({ x: 0, z: -3, hx: 0.2, hz: 4, rot: Math.PI / 2, base: -1, top: 6 }));
    const { p, camera } = mkPlayer(thin);
    const at = settle(p, camera);
    // 旋转 90° 后这条薄墙横在机位路径上，必须挡住
    expect(Math.abs(at.z)).toBeLessThan(p.cameraDistance);
  });

  it('只有比机位更高的东西才算挡住：矮墙不该把镜头拽下来', () => {
    const { p, camera } = mkPlayer(mkWorld((cw) => wall(cw, { top: 0.6 })));
    const at = settle(p, camera);
    expect(at.z).toBeCloseTo(-p.cameraDistance, 1);   // 机位在 1.38 米，0.6 米的矮墙挡不着
  });

  it('高架障碍（横梁）只在它的高度区间内挡人，脚下照样空', () => {
    const { p, camera } = mkPlayer(mkWorld((cw) => wall(cw, { base: 4, top: 8 })));
    const at = settle(p, camera);
    expect(at.z).toBeCloseTo(-p.cameraDistance, 1);
  });

  it('地形遮挡仍然是第一公民：镜头不该钻进山坡里', () => {
    // 身后 3 米处一道 4 米高坎
    const worldGround = (z) => (z < -3 ? 4 : 0);
    const { p, camera } = mkPlayer(mkWorld(() => {}, (x, z) => worldGround(z)));
    const at = settle(p, camera);
    // 真不变量：机位不许埋进山体（在坎后就必须在坎顶之上），并且确实被收进来一点
    const buried = at.z < -3 && at.y < 4;
    expect(buried).toBe(false);
    expect(Math.abs(at.z)).toBeLessThan(p.cameraDistance);
  });
});

describe('退得快、出得慢', () => {
  /** 同一堵墙装上去 / 拆下来，量两段瞬态：收回必须快，伸出必须慢 */
  const probe = () => {
    const world = mkWorld();
    const { p, camera } = mkPlayer(world);
    settle(p, camera);
    const free = camera.position.clone();

    wall(world.collision);
    world.collision.build();
    const retract = [];
    for (let i = 0; i < 8; i++) {
      p.updateCamera(1 / 60);
      retract.push(camera.position.distanceTo(free));      // 离自由机位越来越远 = 正在让位
    }
    const blocked = settle(p, camera, 1.5);                // 收敛后的被挡位
    const gap = free.distanceTo(blocked);

    world.collision.clear();
    world.collision.build();
    const extend = [];
    for (let i = 0; i < 8; i++) {
      p.updateCamera(1 / 60);
      extend.push(camera.position.distanceTo(free));       // 离自由机位还剩多少
    }
    return { free, blocked, gap, retract, extend };
  };

  it('贴墙时立刻让位：八帧就走完了九成以上的路程', () => {
    const { retract, gap, blocked } = probe();
    expect(gap).toBeGreaterThan(1);                 // 挡得动才谈得上手感
    expect(blocked.z).toBeGreaterThan(-3);
    expect(retract[7] / gap).toBeGreaterThan(0.9);
  });

  it('离开墙时慢慢展开：同样八帧还剩一成以上没走完', () => {
    const { retract, extend, gap } = probe();
    expect(extend[7] / gap).toBeGreaterThan(0.05);
    expect(extend[7]).toBeGreaterThan((gap - retract[7]) * 3);
  });

  it('两段都会收敛到底（阻尼不是"永远差一点"）', () => {
    const { free, gap } = probe();
    const world = mkWorld((cw) => wall(cw));
    const { p, camera } = mkPlayer(world);
    settle(p, camera);
    expect(camera.position.distanceTo(free)).toBeGreaterThan(gap * 0.9);
    world.collision.clear();
    world.collision.build();
    settle(p, camera, 2.5);
    expect(camera.position.distanceTo(free)).toBeLessThan(0.02);
  });

  it('稳态机位与帧率无关（30 / 60 / 144 Hz 收到同一个点）', () => {
    const run = (dt) => {
      const world = mkWorld((cw) => wall(cw));
      const { p, camera } = mkPlayer(world);
      for (let t = 0; t < 3; t += dt) p.updateCamera(dt);
      return camera.position.clone();
    };
    const a = run(1 / 30);
    const b = run(1 / 60);
    const c = run(1 / 144);
    expect(a.distanceTo(b)).toBeLessThan(0.02);
    expect(b.distanceTo(c)).toBeLessThan(0.02);
  });
});

describe('不许误用线段查询做逐段遮挡', () => {
  it('blocked() 对短于一拍的线段恒为"没挡住"，所以镜头必须用 blocksPoint()', () => {
    const cw = new CollisionWorld(16);
    cw.addBox({ x: 0, z: -3, hx: 6, hz: 0.3, base: -1, top: 6 });
    cw.build();
    // 逐段推进时每一步只有 ~0.65 米：拿线段查询会一路得到 false，遮挡静默失效
    expect(cw.blocked(0, -2.6, 0, -3.0, 1.38)).toBe(false);
    expect(cw.blocksPoint(0, -3, 1.38)).toBe(true);
    // 0.6 米厚的墙会被 1.5 米一格的视线 march 整步跨过 —— blocked() 现在就这样，
    // AI 视线因此对薄墙偏乐观。这里把它钉住：哪天要改，得是明知故改而不是顺手碰。
    expect(cw.blocked(0, 0, 0, -8, 1.38)).toBe(false);
    expect(cw.blocksPoint(0, -3, 1.38, 0)).toBe(true);
  });

  it('pad 让镜头停在面前而不是贴面：同一高度上 padding 内外结果不同', () => {
    const cw = new CollisionWorld(16);
    cw.addCylinder({ x: 0, z: -3, r: 1, base: -1, top: 6 });
    cw.build();
    expect(cw.blocksPoint(0, -1.9, 1.38)).toBe(false);            // 离轴心 1.1 米，树冠半径 1 米
    expect(cw.blocksPoint(0, -1.9, 1.38, CAMERA_OCCLUSION.pointPad)).toBe(true);
  });
});

describe('没有碰撞世界的场景', () => {
  it('副本里没有实体登记：不抛错，退回只看地形的行为', () => {
    const world = { getGroundHeight: () => 0, collision: null, bounds: null };
    const { p, camera } = mkPlayer(world);
    const at = settle(p, camera);
    expect(at.z).toBeCloseTo(-p.cameraDistance, 1);
  });
});
