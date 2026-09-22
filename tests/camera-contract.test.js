/**
 * 镜头覆盖量协议的外科手术式体检（修 B34）。
 *
 * 起因是一次"live 才抓得到"的事故：营火导演的 `getCameraOverrides()` 在未激活时只返回
 * `{ lockOrbit, orbit, fovAdd }`，而读方无条件取 `.pull` —— 于是 `dist - undefined = NaN`，
 * 主相机的位置与注视点整帧变成 NaN。所有既有用例都把 `restScene` 写成 `null`，
 * 走的正是那份字段齐全的兜底常量，所以这个 bug 在测试里完全隐形。
 *
 * 这个文件不许 stub：全部拿**真实导演类**来验形状，并把真实 `PlayerController` 与真实营火导演
 * 接在一起跑帧，直接断言相机各分量有限。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { CAMERA_OVERRIDES_NONE, FOV_LAYER_OVERRIDE } from '../src/engine/CameraRig.js';
import { RestSceneDirector } from '../src/cinematic/RestSceneDirector.js';
import { CombatCameraDirector } from '../src/cinematic/CombatCameraDirector.js';
import { PlayerController } from '../src/player/PlayerController.js';
import { CAMERA_FOV, CAMERA_OCCLUSION } from '../src/content/tuning.js';
import { installWindowShim, makeWorld } from './helpers/enemyHarness.js';

beforeAll(installWindowShim);

/** 读方（`PlayerController._updateThirdPersonCamera`）真正会取的键 */
const READ_KEYS = ['pull', 'fovAdd', 'lookBias', 'focus', 'lockOrbit', 'orbit'];

const finite = (v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

function installDomShim() {
  class FakeElement {
    constructor() {
      this.children = [];
      this.style = { setProperty() {}, opacity: '' };
      this.classList = { add() {}, remove() {}, contains: () => false };
    }
    appendChild(c) { this.children.push(c); return c; }
    setAttribute() {}
  }
  globalThis.document = { createElement: () => new FakeElement(), body: new FakeElement() };
  globalThis.requestAnimationFrame = () => 0;
}

beforeAll(installDomShim);

const mkRestGame = () => {
  const fire = new THREE.Object3D();
  fire.position.set(0, 0, -12);
  const game = {
    paused: false, cinematicActive: false, autoPlayMode: false,
    dialog: { toast() {} }, combatCamera: null, restScene: null,
    restPoints: { points: [{ id: 'r1', mesh: fire }] },
    restNpcs: { getByRestId: () => null },
    player: { position: new THREE.Vector3(0, 0, 0) },
  };
  game.restScene = new RestSceneDirector(game);
  return { game, fire };
};

describe('覆盖量的形状合同', () => {
  it('空表把读方会用到的每个键都给了出去', () => {
    for (const k of READ_KEYS) expect(CAMERA_OVERRIDES_NONE, k).toHaveProperty(k);
    expect(CAMERA_OVERRIDES_NONE.pull).toBe(0);
  });

  it('营火导演未激活时交出的仍是完整形状（这就是过去 NaN 的那一处）', () => {
    const { game } = mkRestGame();
    const ov = game.restScene.getCameraOverrides();
    for (const k of READ_KEYS) expect(ov, k).toHaveProperty(k);
    expect(Number.isFinite(5.2 - ov.pull)).toBe(true);
  });

  it('营火导演激活之后形状不变，且机位算得出有限数', () => {
    const { game } = mkRestGame();
    window.dispatchEvent(new CustomEvent('rest-dialogue-open', { detail: { restId: 'r1' } }));
    expect(game.restScene.active).toBe(true);
    for (let i = 0; i < 90; i++) {
      const ov = game.restScene.getCameraOverrides();
      for (const k of READ_KEYS) expect(ov, k).toHaveProperty(k);
      expect(Number.isFinite(5.2 - ov.pull)).toBe(true);
      if (ov.orbit?.position) expect(finite(ov.orbit.position)).toBe(true);
    }
  });

  it('战斗导演两种状态下都满足同一份合同', () => {
    const { game } = mkRestGame();
    const d = new CombatCameraDirector(game);
    for (const k of READ_KEYS) expect(d.getCameraOverrides(), k).toHaveProperty(k);
    d.play('execution', { position: { x: 0, y: 0, z: -4 }, stature: 2.2, base: 0 });
    d.update(1 / 60);
    const ov = d.getCameraOverrides();
    for (const k of READ_KEYS) expect(ov, k).toHaveProperty(k);
    expect(finite(ov.orbit.position)).toBe(true);
    expect(finite(ov.orbit.lookAt)).toBe(true);
  });

  it('空表是冻结的：没有人能顺手改掉别人的兜底', () => {
    expect(Object.isFrozen(CAMERA_OVERRIDES_NONE)).toBe(true);
    expect(() => { CAMERA_OVERRIDES_NONE.pull = 3; }).toThrow();
  });
});

describe('接上真实导演之后，主相机仍然是有限数', () => {
  const mkRiggedPlayer = (withRest) => {
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV.third, 1.6, 0.1, 200);
    const { game } = mkRestGame();
    const p = new PlayerController({ add() {}, remove() {} }, camera, makeWorld(), game);
    game.player = p;
    p.teleport(0, 0, 0);
    p.yaw = 0;
    p.pitch = 0;
    if (!withRest) game.restScene = null;      // 对照组：没有营火导演时走兜底常量
    return { p, camera, game };
  };

  it('过去 NaN 的那条路径（营火导演在场但未激活）现在算得出机位', () => {
    const { p, camera } = mkRiggedPlayer(true);
    for (let i = 0; i < 120; i++) p.updateCamera(1 / 60);
    expect(finite(camera.position)).toBe(true);
    expect(camera.position.z).toBeCloseTo(-p.cameraDistance, 1);
    expect(finite(p.rig.lookPoint())).toBe(true);
  });

  it('营火真的接管镜头时也不炸，且 FOV 仍由 rig 一帧一笔地落', () => {
    const { p, camera, game } = mkRiggedPlayer(true);
    window.dispatchEvent(new CustomEvent('rest-dialogue-open', { detail: { restId: 'r1' } }));
    for (let i = 0; i < 120; i++) {
      p.updateCamera(1 / 60);
      p.rig.commitFov();
    }
    expect(finite(camera.position)).toBe(true);
    expect(camera.fov).toBeLessThan(CAMERA_FOV.third + 1e-9);
    // 营火那层偏移是玩家相机按帧申领的，没申领就不该残留
    p.rig.revokeFov(FOV_LAYER_OVERRIDE);
    expect(camera.fov).toBe(CAMERA_FOV.third);
    expect(game.player.rig.fovLayers).toBe(0);
  });

  it('实体挡镜头时同样算得出有限数（遮挡与合同两件事不互相打架）', () => {
    const { p, camera } = mkRiggedPlayer(true);
    const world = p.world;
    world.collision.addCylinder({ x: 0, z: -2.6, r: 1.0, base: -1, top: 8 });
    world.collision.build();
    for (let i = 0; i < 200; i++) p.updateCamera(1 / 60);
    expect(finite(camera.position)).toBe(true);
    const d = Math.hypot(camera.position.x - p.position.x, camera.position.z - p.position.z);
    expect(d).toBeGreaterThan(0.5);
    expect(d).toBeLessThan(p.cameraDistance - CAMERA_OCCLUSION.pointPad);
  });
});
