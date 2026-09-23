/**
 * M4 切片1 —— 玩家相机热路径零分配。
 *
 * 登记在册的欠账（OVERHAUL_PLAN M3 残留 / M4 零分配清单）：第三人称与第一人称相机每帧被调
 * 60~144 次，过去 `_resolveThirdPersonLook` 每帧 `new THREE.Vector3` 三处、`getRightXZ()`
 * 又各造一枚 —— 短命对象堆满 young-gen，低端机上是持续的 GC 抖动。这里把它们收进复用 temp。
 *
 * 与 `new THREE.` 相比，更难防的是"以后有人图省事又塞一个 new 回热路径"，所以主门禁是一道
 * **静态扫描**：相机四个方法的函数体里不许出现 `new THREE.*`，也不许出现不带 out 参数的
 * `getRightXZ()/getForwardXZ()`（那等于每次调用又新造一枚）。运行期用例则验复用没算错（三种
 * 朝向分支机位/注视点仍有限且落对），以及 `out` 参数确实是写进去、不是返回新对象。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PlayerController } from '../src/player/PlayerController.js';
import { CAMERA_FOV } from '../src/content/tuning.js';
import { installWindowShim, makeWorld } from './helpers/enemyHarness.js';

const SRC = readFileSync(fileURLToPath(new URL('../src/player/PlayerController.js', import.meta.url)), 'utf8');

/** 取一个方法的源码体：从 `  name(` 到下一处恰两空格缩进的 `  }`（内部块缩进更深，不会误闭合） */
const methodBody = (name) => {
  const m = SRC.match(new RegExp('^  ' + name + '\\([\\s\\S]*?\\n  \\}', 'm'));
  if (!m) throw new Error(`找不到方法：${name}`);
  return m[0];
};

beforeAll(() => {
  installWindowShim();
  class FakeElement {
    constructor() { this.children = []; this.style = { setProperty() {}, opacity: '' }; this.classList = { add() {}, remove() {}, contains: () => false }; }
    appendChild(c) { this.children.push(c); return c; }
    setAttribute() {}
  }
  globalThis.document = { createElement: () => new FakeElement(), body: new FakeElement() };
  globalThis.requestAnimationFrame = () => 0;
});

describe('相机热路径静态零分配门禁', () => {
  const HOT = ['_updateFirstPersonCamera', '_updateThirdPersonCamera', '_resolveThirdPersonLook', '_pullInFromSolids'];
  for (const name of HOT) {
    it(`${name} 里不再 new 任何 THREE 对象`, () => {
      const hits = [...methodBody(name).matchAll(/new\s+THREE\.\w+/g)].map((x) => x[0]);
      expect(hits, `${name} 每帧跑 60~144 次，不该分配`).toEqual([]);
    });
    it(`${name} 里 get(Right|Forward)XZ 一律带 out 参数`, () => {
      const bare = [...methodBody(name).matchAll(/get(?:Right|Forward)XZ\(\s*\)/g)].map((x) => x[0]);
      expect(bare, `${name} 无参调用会每帧新造一枚朝向向量`).toEqual([]);
    });
  }
});

describe('out 参数：写进传入的向量，缺省时才新建（向后兼容）', () => {
  const mk = () => {
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV.third, 1.6, 0.1, 100);
    const game = { paused: false, cinematicActive: false, autoPlayMode: false, combatCamera: null, restScene: null };
    const p = new PlayerController({ add() {}, remove() {} }, camera, makeWorld(), game);
    p.teleport(0, 0, 0); p.pitch = 0;
    return p;
  };

  it('getRightXZ(out) 复用同一对象并返回它', () => {
    const p = mk(); p.yaw = 0;
    const out = new THREE.Vector3(99, 99, 99);
    const r = p.getRightXZ(out);
    expect(r).toBe(out);
    expect(out.x).toBeCloseTo(1);
    expect(out.y).toBeCloseTo(0);
    expect(out.z).toBeCloseTo(0);
  });

  it('getForwardXZ(out) 复用同一对象并返回它', () => {
    const p = mk(); p.yaw = Math.PI / 2;
    const out = new THREE.Vector3();
    const f = p.getForwardXZ(out);
    expect(f).toBe(out);
    expect(f.x).toBeCloseTo(1, 6);
    expect(f.z).toBeCloseTo(0, 6);
  });

  it('不传 out 仍返回一枚全新的正确向量（老调用点不受影响）', () => {
    const p = mk(); p.yaw = 0;
    const a = p.getForwardXZ();
    const b = p.getForwardXZ();
    expect(a).not.toBe(b);
    expect(a.toArray()).toEqual([0, 0, 1]);
  });
});

describe('复用 temp 没把三条朝向分支算错（别名回归护栏）', () => {
  const camera = () => new THREE.PerspectiveCamera(CAMERA_FOV.third, 1.6, 0.1, 100);
  const finite = (v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

  const build = (game) => {
    const cam = camera();
    const p = new PlayerController({ add() {}, remove() {} }, cam, makeWorld(), game);
    p.teleport(0, 0, 0); p.yaw = 0; p.pitch = 0; p.cameraMode = 'third';
    return { p, cam };
  };

  it('空闲：机位停在玩家身后 cameraDistance 处', () => {
    const { p, cam } = build({ paused: false, cinematicActive: false, autoPlayMode: false, combatCamera: null, restScene: null });
    for (let i = 0; i < 120; i++) p.updateCamera(1 / 60);
    expect(finite(cam.position)).toBe(true);
    expect(cam.position.z).toBeCloseTo(-p.cameraDistance, 1);
  });

  it('锁定：注视点被拉向目标（若 lookAt 与 pivot/desired 撞了同一个 temp，这里会算错）', () => {
    const { p } = build({ paused: false, cinematicActive: false, autoPlayMode: false, combatCamera: null, restScene: null });
    p.combat = { getLockTarget: () => ({ position: new THREE.Vector3(6, 0, 8), alive: true }) };
    for (let i = 0; i < 120; i++) p.updateCamera(1 / 60);
    const look = p.rig.lookPoint();
    expect(finite(look)).toBe(true);
    // 注视点应明显偏向 (6,·,8) 一侧，而不是仍贴着玩家原点
    expect(look.x).toBeGreaterThan(1);
    expect(look.z).toBeGreaterThan(1);
  });

  it('focus（营火/接管）：走 restScene 覆盖量的 focus 分支且各分量有限', () => {
    const restScene = {
      getCameraOverrides: () => ({
        pull: 0, fovAdd: 0, lookBias: 0.6, focus: { x: -4, y: 1, z: -10 }, lockOrbit: false, orbit: null, gaze: 0,
      }),
    };
    const { p, cam } = build({ paused: false, cinematicActive: false, autoPlayMode: false, combatCamera: null, restScene });
    for (let i = 0; i < 120; i++) p.updateCamera(1 / 60);
    const look = p.rig.lookPoint();
    expect(finite(cam.position)).toBe(true);
    expect(finite(look)).toBe(true);
    expect(look.x).toBeLessThan(-1);   // 被拉向 focus 的 -X 侧
    expect(look.z).toBeLessThan(-1);
  });
});
