/**
 * 第一 / 第三人称的 pitch 语义必须一致，且切换视角不许把画面翻面（W-C6 切片8）。
 *
 * ## 修前是什么样子
 *
 * 同一个 `pitch` 值在两人称里指向**相反**的视线方向：
 * - 第三人称 `_updateThirdPersonCamera`：机位 y = `pivot.y + sin(pitch) * dist`
 *   ⇒ pitch > 0 吊臂升高，画面是**俯视角色**。
 * - 第一人称 `_updateFirstPersonCamera`：注视向量 y = `Math.sin(pitch)`
 *   ⇒ pitch > 0 却变成**抬头**。
 *
 * 后果是**按 V 切换视角时视线被整个翻个面**：第三人称把镜头推到高位俯视角色，
 * 切到第一人称同一个 pitch 值却变成仰望天空（探针 `.tmp-scan/probe-camera-pitch.mjs`）
 * —— 玩家的说法是「视角的转换也有问题，操作起来对玩家很不友好」。
 *
 * ## 修法与约定
 *
 * 把 `pitch` 统一成 **> 0 = 视线朝下**（第一人称 look 向量的 y 取反，第三人称一个
 * 字符不动），同时第一人称的鼠标 dy 取反补回手感。于是：
 * - 第一人称鼠标下推 → 视线朝下压（FPS 该有的手感）；
 * - 第三人称鼠标下推 → 吊臂下沉 → 仰视角色（TPS 的标准手感）；
 * - 两边手感各自符合常识，而**同一个 pitch 值描述同一件事**，切视角不再翻面。
 * 存储语义不变（存档字段不迁移；已存的第一人称镜头角会在读取时镜像一次，
 * 一次性的小观感，动一下鼠标即复原）。
 *
 * ## 判据
 * ① 第一人称：鼠标下推 → 视线 y 变小（朝下压）；上推 → 变大（抬头）。
 * ② 第三人称：鼠标下推 → 吊臂下沉（机位相对支点变低）；上推 → 吊臂升高。
 * ③ 切视角不翻面：第三人称俯视角色（视线 y < 0）时切到第一人称，视线 y 仍为负。
 * ④ 反面对照：源码里第一人称 look 向量与鼠标 dy 的两处取反必须都在 ——
 *    少任一处，手感或连续性就退回改前。
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

const mkPlayer = (mode) => {
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV.third, 1.6, 0.1, 100);
  const game = {
    paused: false, cinematicActive: false, autoPlayMode: false,
    dialog: { toast() {} }, combatCamera: null, restScene: null,
  };
  const p = new PlayerController({ add() {}, remove() {} }, camera, mkWorld(), game);
  p.teleport(0, 0, 0);
  p.yaw = 0; p.targetYaw = 0;
  p.pitch = 0; p.targetPitch = 0;
  p.cameraMode = mode;
  p.rig.setBaseFov(mode === 'first' ? CAMERA_FOV.first : CAMERA_FOV.third);
  return { p, camera };
};

const STEP = 1 / 60;
const settle = (p, seconds = 0.6) => {
  for (let t = 0; t < seconds; t += STEP) p.updateCamera(STEP);
};

/** 相机当前视线的 y 分量（> 0 看天 / < 0 看地） */
const viewY = (camera) => {
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  return fwd.y;
};

/** 第三人称机位相对支点（玩家位置 + pivotHeight）的高低 */
function cameraHeightOverPivot(p) {
  settle(p);
  return p.rig.camera.position.y - (p.position.y + p.pivotHeight);
}

/** 推 n 次鼠标（dy：正 = 往下推），每推一次收敛一帧 */
function push(p, dy, n) {
  for (let i = 0; i < n; i++) { p.addCameraInput(0, dy); settle(p, STEP); }
}

describe('第一 / 第三人称的 pitch 语义一致且切换不翻面', () => {
  it('第一人称：鼠标下推视线朝下压，上推抬头', () => {
    const { p, camera } = mkPlayer('first');
    settle(p);
    const 起 = viewY(camera);
    push(p, 60, 20);
    const 下压 = viewY(camera);
    push(p, -60, 40);
    const 抬头 = viewY(camera);
    expect(下压, `鼠标下推后视线 y ${下压.toFixed(4)} 没朝下压（第一人称手感反转了？）`)
      .toBeLessThan(起 - 0.2);
    expect(抬头, `鼠标上推后视线 y ${抬头.toFixed(4)} 没抬头`).toBeGreaterThan(下压 + 0.2);
  });

  it('第三人称：鼠标下推吊臂下沉，上推吊臂升高', () => {
    const { p } = mkPlayer('third');
    const 起 = cameraHeightOverPivot(p);
    push(p, 60, 20);
    const 下沉 = cameraHeightOverPivot(p);
    push(p, -60, 40);
    const 升高 = cameraHeightOverPivot(p);
    // 下推只推到 pitch≈-0.12 的俯角下限，机位被指数阻尼收敛在支点水平面下方
    // 一点点（5.2 米长臂 × 小角度 = 绝对位移小）。所以这一侧判"方向 + 穿过水平面"，
    // 上推一侧推到 pitch≈0.62 上限、位移大得多，那边判"幅度足"。两侧合起来才证明
    // 鼠标方向与吊臂方向对上了，而不是某一次偶然的数值巧合。
    expect(下沉, `鼠标下推后吊臂没下沉（${起.toFixed(3)} → ${下沉.toFixed(3)}）`)
      .toBeLessThan(起);
    expect(下沉, `鼠标下推后吊臂没有落到支点水平面之下（${下沉.toFixed(3)}）`)
      .toBeLessThan(0);
    expect(升高, `鼠标上推后吊臂没升高（${下沉.toFixed(3)} → ${升高.toFixed(3)}）`)
      .toBeGreaterThan(下沉 + 0.5);
  });

  it('切视角不翻面：第三人称俯视角色时切到第一人称仍在俯视', () => {
    const { p, camera } = mkPlayer('third');
    push(p, -60, 25);          // 推高吊臂 → 俯视角色（视线朝下）
    settle(p);
    const before = viewY(camera);
    expect(before, '第三人称推到位后应仍在俯视（视线朝下）').toBeLessThan(-0.1);
    p.toggleCameraMode();      // → 第一人称，同一个 pitch 值
    settle(p);
    const after = viewY(camera);
    expect(after, `切换后视线被翻面了（俯视 ${before.toFixed(3)} → 仰望 ${after.toFixed(3)}）`)
      .toBeLessThan(0);
  });
});
