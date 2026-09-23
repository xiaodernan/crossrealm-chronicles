/**
 * W-A5 切片2 —— 锁定重定位阻尼 + 锁定力臂常数（短板 A4 的"锁定无阻尼"半区）。
 *
 * 病灶：锁定一个身后的敌人时，`CombatController` 每帧把 `player.targetYaw` 硬写成"指向目标"，
 * 而 `PlayerController` 过去 `yaw = targetYaw` 一帧直赋 —— 镜头当场甩 180°，玩家失去方向感。
 * 命中朝向另走 `getCombatForwardXZ()`（读目标位置，与镜头 yaw 无关），所以这里只缓观感、不削准头。
 *
 * 这里测的是 `_advanceYaw` 的**协议**：什么时候直赋（未锁定＝鼠标手感）、什么时候阻尼（锁定＝指数
 * 逼近）、阻尼是不是走最短弧、稳态是不是与帧率无关；外加 `_updateThirdPersonCamera` 真的读了
 * `LOCK_ON_CAMERA.distance`（锁定把拉远的力臂收回来）。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { PlayerController } from '../src/player/PlayerController.js';
import { CAMERA_FOV, LOCK_ON_CAMERA } from '../src/content/tuning.js';
import { installWindowShim, makeWorld } from './helpers/enemyHarness.js';

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

const mkPlayer = () => {
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV.third, 1.6, 0.1, 200);
  const game = { paused: false, cinematicActive: false, autoPlayMode: false, combatCamera: null, restScene: null };
  const p = new PlayerController({ add() {}, remove() {} }, camera, makeWorld(), game);
  p.teleport(0, 0, 0);
  p.yaw = 0; p.pitch = 0; p.targetYaw = 0; p.targetPitch = 0;
  return { p, camera };
};
const lockAt = (x, z) => ({ position: new THREE.Vector3(x, 0, z), alive: true });
const setLock = (p, target) => { p.combat = { getLockTarget: () => target }; };

describe('_advanceYaw：未锁定直赋，锁定才阻尼', () => {
  it('没锁定 → yaw/pitch 当场等于 target（鼠标手感不被抹一层）', () => {
    const { p } = mkPlayer();
    setLock(p, null);
    p.targetYaw = 1.234; p.targetPitch = 0.5;
    p._advanceYaw(1 / 60);
    expect(p.yaw).toBeCloseTo(1.234, 12);
    expect(p.pitch).toBeCloseTo(0.5, 12);
  });

  it('锁定一个身后的敌人 → 第一帧不甩到位（这就是过去硬切的那一下）', () => {
    const { p } = mkPlayer();
    setLock(p, lockAt(0, 10));          // 正后方 → targetYaw = atan2(0,10)=0；用 x 造侧后方
    p.targetYaw = Math.PI;              // 直接摆一个 180° 的重定位
    p.yaw = 0;
    p._advanceYaw(1 / 60);
    expect(Math.abs(p.yaw)).toBeLessThan(Math.PI * 0.5);   // 只挪了一小步，没瞬移
    expect(p.yaw).toBeGreaterThan(0);
  });

  it('锁定后持续逼近，约一秒内收敛到 targetYaw', () => {
    const { p } = mkPlayer();
    setLock(p, lockAt(0, -10));
    p.yaw = 0; p.targetYaw = Math.PI * 0.6;
    for (let t = 0; t < 1; t += 1 / 60) p._advanceYaw(1 / 60);
    expect(p.yaw).toBeCloseTo(Math.PI * 0.6, 3);
  });

  it('pitch 即使锁定也直赋（竖直向是鼠标控制，锁定不改俯仰）', () => {
    const { p } = mkPlayer();
    setLock(p, lockAt(0, -10));
    p.targetPitch = 0.42;
    p._advanceYaw(1 / 60);
    expect(p.pitch).toBeCloseTo(0.42, 12);
  });
});

describe('阻尼走最短弧，且稳态与帧率无关', () => {
  it('跨过 ±π 时走短的那段，而不是绕一圈', () => {
    const { p } = mkPlayer();
    setLock(p, lockAt(0, -10));
    p.yaw = 3.0; p.targetYaw = -3.0;     // 差 -6 rad，折回最短是 +0.283（越过 π）
    p._advanceYaw(1 / 60);
    // 走短弧：yaw 略增（朝 π / 回绕），而非朝 0 一路掉下去（那会是绕远）
    expect(p.yaw).toBeGreaterThan(3.0);
    expect(p.yaw).toBeLessThan(3.3);
  });

  it('同样的秒数，30 / 60 / 144 Hz 收敛到同一个朝向', () => {
    const settle = (dt) => {
      const { p } = mkPlayer();
      setLock(p, lockAt(0, -10));
      p.yaw = 0; p.targetYaw = 2.4;
      for (let t = 0; t < 1.5; t += dt) p._advanceYaw(dt);
      return p.yaw;
    };
    const a = settle(1 / 30), b = settle(1 / 60), c = settle(1 / 144);
    expect(Math.abs(a - b)).toBeLessThan(1e-3);
    expect(Math.abs(b - c)).toBeLessThan(1e-3);
  });
});

describe('锁定力臂读 LOCK_ON_CAMERA.distance', () => {
  /** 机位到支点的水平距离：未锁定时 ≈ cameraDistance，锁定拉远后应被收回到设定档 */
  const planarDist = (p, camera) => Math.hypot(
    camera.position.x - p.position.x, camera.position.z - p.position.z);

  const settleTP = (p, camera) => {
    p.yaw = 0; p.pitch = 0; p.cameraMode = 'third';
    for (let t = 0; t < 2; t += 1 / 60) p.updateCamera(1 / 60);
  };

  it('把镜头拉远到 8 米后锁定，力臂应收回而不是停在 8 米', () => {
    const { p, camera } = mkPlayer();
    p.cameraDistance = 8;
    setLock(p, null);
    settleTP(p, camera);
    const free = planarDist(p, camera);

    setLock(p, lockAt(0, -10));
    p.currentCameraPos.set(0, 1.38, 8);   // 从远端开始收敛
    settleTP(p, camera);
    const locked = planarDist(p, camera);

    const want = THREE.MathUtils.lerp(8, LOCK_ON_CAMERA.distance, LOCK_ON_CAMERA.distanceBlend);
    expect(free).toBeGreaterThan(7.5);
    expect(locked).toBeLessThan(7);                 // 明确收进来了
    expect(locked).toBeCloseTo(want, 0);            // 收的就是常数那一档
  });

  it('锁定目标存在时第三人称机位仍处处有限（阻尼与遮挡不打架）', () => {
    const { p, camera } = mkPlayer();
    setLock(p, lockAt(3, -6));
    settleTP(p, camera);
    expect(Number.isFinite(camera.position.x)).toBe(true);
    expect(Number.isFinite(camera.position.y)).toBe(true);
    expect(Number.isFinite(camera.position.z)).toBe(true);
  });
});
