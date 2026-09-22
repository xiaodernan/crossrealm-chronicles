import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PlayerController } from '../src/player/PlayerController.js';
import { Shake } from '../src/engine/Shake.js';
import { SHAKE } from '../src/content/tuning.js';

/**
 * 相机接线用例 —— `engine/Shake.js` 必须真的被镜头读到。
 *
 * 震屏逻辑本身在 `hit-feedback.test.js` 里已经测透；这里只钉住**集成面**：
 * PlayerController 不再自带 `shakeOffset`，抖动由共享实例提供、且只在相机一处落地。
 * 这两个约束最容易被"顺手加回一行 `pos.add(...)`"破坏，而浏览器里 0×0 视口量不出 NaN 之外的差异。
 */
const mkPlayer = () => {
  const scene = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 100);
  const world = { getGroundHeight: () => 0, collision: null, bounds: null };
  const game = {
    paused: false, cinematicActive: false, autoPlayMode: false,
    dialog: { toast() {} }, combatCamera: null, restScene: null,
  };
  const p = new PlayerController(scene, camera, world, game);
  p.teleport(0, 0, 0);
  return { p, camera, scene };
};

describe('震屏 → 相机的唯一接线', () => {
  it('PlayerController 不再自带抖动状态（只有 Shake 一个写入者）', () => {
    const { p } = mkPlayer();
    expect(p.shakeOffset).toBeUndefined();
    expect(typeof p.applyShake).toBe('undefined');
    expect(p.shake).toBeInstanceOf(Shake);
  });

  it('有请求时相机偏离静止位置，无请求时严格静止', () => {
    const { p, camera } = mkPlayer();
    for (let i = 0; i < 60; i++) { p.shake.reset(); p.updateCamera(1 / 60); }
    const still = camera.position.clone();
    expect(Number.isFinite(still.x)).toBe(true);

    p.shake.add(SHAKE.ref);
    for (let i = 0; i < 3; i++) { p.shake.update(1 / 60); p.updateCamera(1 / 60); }
    const shaken = camera.position.clone();
    const delta = shaken.distanceTo(still);
    expect(delta).toBeGreaterThan(0.005);
    expect(delta).toBeLessThan(SHAKE.meters.third * 1.2);
  });

  it('第一人称与第三人称都会读到同一个偏移（两处相机共用一处实现）', () => {
    const { p, camera } = mkPlayer();
    const moved = (mode) => {
      p.cameraMode = mode;
      p.shake.setProfile(mode);
      for (let i = 0; i < 40; i++) { p.shake.reset(); p.updateCamera(1 / 60); }
      const still = camera.position.clone();
      p.shake.add(0.35);
      p.shake.update(1 / 60);
      p.updateCamera(1 / 60);
      return camera.position.distanceTo(still);
    };
    expect(moved('third')).toBeGreaterThan(0.005);
    expect(moved('first')).toBeGreaterThan(0.005);
  });

  it(' trauma 归零后相机回到无抖动轨道（不留残余偏移）', () => {
    const { p, camera } = mkPlayer();
    for (let i = 0; i < 60; i++) { p.shake.reset(); p.updateCamera(1 / 60); }
    const still = camera.position.clone();
    p.shake.add(0.35);
    for (let i = 0; i < 120; i++) { p.shake.update(1 / 60); p.updateCamera(1 / 60); }
    expect(p.shake.strength).toBe(0);
    for (let i = 0; i < 120; i++) p.updateCamera(1 / 60);
    expect(camera.position.distanceTo(still)).toBeLessThan(1e-6);
  });
});
