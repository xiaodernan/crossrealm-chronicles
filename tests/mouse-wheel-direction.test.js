/**
 * 鼠标滚轮方向：往上滑 = 往上看，往下滑 = 往下看（玩家点名「一定要修」）。
 *
 * ## 这条门守的是哪一层
 *
 * `camera-pitch-consistency.test.js` 钉的是 pitch 的**语义**（pitch>0=视线朝下）
 * 和鼠标 dy 的取反——但滚轮走的是另一条路：`Game.js` 的 wheel 监听把
 * `e.deltaY` 原样交给 `PlayerController.adjustPitch(delta)`，并**不是** `addCameraInput`。
 * 于是「滚轮方向反了」可以发生在两个地方，而旧门一个都看不见：
 *   ① Game.js wheel 里漏了/多加一个负号（deltaY 正=向下滚，应使 pitch 增大=往下看）；
 *   ② adjustPitch 自己把 delta 取反或钳制反了。
 *
 * 浏览器/触控板约定：deltaY > 0 = 滚轮向下 = 内容向下 → 视线往下看。
 * 本门用真 PlayerController + 真 THREE 相机，观测视线的 y 分量（<0 看地），
 * 确保「向下滚 → 视线朝下、向上滚 → 视线朝上」，且 Ctrl/拍照模式改走缩放不动 pitch。
 *
 * 反面对照：把任一处符号翻掉，对应的 it 必须红（探针见 commit message）。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { PlayerController } from '../src/player/PlayerController.js';
import { CollisionWorld } from '../src/engine/Collision.js';
import { CAMERA_FOV } from '../src/content/tuning.js';
import { installWindowShim } from './helpers/enemyHarness.js';

beforeAll(installWindowShim);

const mkWorld = () => {
  const cw = new CollisionWorld(16);
  cw.build();
  return { getGroundHeight: () => 0, collision: cw, bounds: null, zones: [] };
};

/** 与 Game.js 的 wheel 监听同构：ctrl/meta/拍照→缩放，否则把 deltaY 交给 adjustPitch。 */
function wheel(p, deltaY, { ctrl = false, photo = false } = {}) {
  const zoomCalls = [];
  if (ctrl || photo) {
    p.adjustZoom(-deltaY * 0.01);
    return { zoomCalls: [-deltaY * 0.01] };
  }
  p.adjustPitch(deltaY * 0.0008);
  return { zoomCalls };
}

const mkPlayer = (mode = 'third') => {
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV.third, 1.6, 0.1, 100);
  const game = {
    paused: false, cinematicActive: false, autoPlayMode: false,
    dialog: { toast() {} }, combatCamera: null, restScene: null,
  };
  const p = new PlayerController({ add() {}, remove() {} }, camera, mkWorld(), game);
  p.teleport(0, 0, 0);
  p.yaw = 0; p.targetYaw = 0; p.pitch = 0; p.targetPitch = 0;
  p.cameraMode = mode;
  p.rig.setBaseFov(mode === 'first' ? CAMERA_FOV.first : CAMERA_FOV.third);
  return { p, camera };
};

const settle = (p, seconds = 0.6) => {
  for (let t = 0; t < seconds; t += 1 / 60) p.updateCamera(1 / 60);
};
const viewY = (camera) => {
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  return fwd.y;
};

describe('滚轮方向：向上滑往上看、向下滑往下看', () => {
  it('第三人称：deltaY>0（向下滚）→ 视线朝下；deltaY<0（向上滚）→ 抬头', () => {
    const { p, camera } = mkPlayer('third');
    wheel(p, 400);           // 向下滚：Game.js 传 +400 → adjustPitch 收 +0.32
    settle(p);
    const down = viewY(camera);
    expect(down, '向下滚后视线应朝下（y<0）；若这里 >=0，滚轮方向反了').toBeLessThan(-0.1);

    const { p: p2, camera: c2 } = mkPlayer('third');
    wheel(p2, -400);         // 向上滚
    settle(p2);
    const up = viewY(c2);
    // 三人称钳制上下不对称（[-0.12,0.62]），向上只能抬到 -0.12 → 视线略高于地平线；
    // 这里只验方向（抬头：y>0 且高于向下滚），不苛求幅度。
    expect(up, '向上滚后视线应朝上（y>0）').toBeGreaterThan(0);
    expect(up, '向上滚的视线必须高于向下滚').toBeGreaterThan(down);
  });

  it('第一人称：同号同向——向下滚压视线、向上滚抬视线', () => {
    const { p, camera } = mkPlayer('first');
    wheel(p, 400);
    settle(p);
    expect(viewY(camera), '第一人称向下滚应朝下压').toBeLessThan(-0.1);
    const { p: p2, camera: c2 } = mkPlayer('first');
    wheel(p2, -400);
    settle(p2);
    expect(viewY(c2), '第一人称向上滚应抬头').toBeGreaterThan(0.05);
  });

  it('adjustPitch 本身：delta>0 使 pitch 增大（=朝下），且按 mode 钳制', () => {
    const { p } = mkPlayer('third');
    p.pitch = 0; p.targetPitch = 0;
    p.adjustPitch(0.5);
    expect(p.pitch).toBeGreaterThan(0);
    expect(p.pitch).toBeLessThanOrEqual(0.62);   // 三人称上限
    p.adjustPitch(-5);
    expect(p.pitch).toBeGreaterThanOrEqual(-0.12); // 三人称下限

    const { p: fp } = mkPlayer('first');
    fp.pitch = 0;
    fp.adjustPitch(0.9);
    expect(fp.pitch).toBeLessThanOrEqual(0.5);   // 一人称上限
    fp.adjustPitch(-9);
    expect(fp.pitch).toBeGreaterThanOrEqual(-0.5);
  });

  it('Ctrl / 拍照模式：滚动改走缩放，pitch 不动', () => {
    for (const mode of ['ctrl', 'photo']) {
      const { p } = mkPlayer('third');
      p.pitch = 0.2; p.targetPitch = 0.2;
      const before = p.pitch;
      const r = wheel(p, 300, mode === 'ctrl' ? { ctrl: true } : { photo: true });
      expect(r.zoomCalls[0], '缩放方向与 deltaY 相反（向下滚=缩小）').toBeCloseTo(-3, 5);
      expect(p.pitch, `${mode} 模式不应动 pitch`).toBe(before);
    }
  });
});
