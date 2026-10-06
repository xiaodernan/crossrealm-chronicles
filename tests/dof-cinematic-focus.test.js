/**
 * W-C4 余量：演出镜头的 DoF 动态启用调用点。
 *
 * 切片6 把 BokehPass 挂进了 composer 链，但 `enabled` 恒为 false —— 景深从没亮过。
 * 本文件钉住两处调用点与一条收敛铁律：
 *   ① 处决演出（`CombatCameraDirector`）：焦点钉在本帧注视点，模糊量随镜头包络呼吸；
 *   ② Boss 过场（`CinematicManager`）：焦点钉在绕轨注视点，首尾各留一个淡入淡出坡；
 *   ③ 收敛唯一出口在每帧 `update`：active 帧开灯，非 active 帧幂等关灯 ——
 *      skip() 与任何直接置 active=false 的退出路径自动还灯，不存在"漏关"的分支。
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CombatCameraDirector } from '../src/cinematic/CombatCameraDirector.js';
import { attachCombatCameraSkip } from '../src/cinematic/CombatCameraDirectorExtensions.js';
import { CinematicManager } from '../src/cinematic/CinematicManager.js';
import { createDofPass, updateDofParams, setDofEnabled } from '../src/engine/DofPass.js';
import { EXECUTION_CAMERA } from '../src/content/tuning.js';
import { installWindowShim } from './helpers/enemyHarness.js';

/** BokehPass 构造链只用 geometry/material/render target，node 侧给最小 DOM 替身即可 */
function installDomShim() {
  class FakeElement {
    constructor() {
      this.children = [];
      this.style = { setProperty() {}, opacity: '', color: '' };
      this.classList = { add() {}, remove() {}, contains: () => false };
      this.textContent = '';
      this.innerHTML = '';
    }
    appendChild(c) { this.children.push(c); return c; }
    setAttribute() {}
  }
  const byId = new Map();
  globalThis.document = {
    createElement: () => new FakeElement(),
    body: new FakeElement(),
    getElementById: (id) => {
      if (!byId.has(id)) byId.set(id, new FakeElement());
      return byId.get(id);
    },
  };
  globalThis.requestAnimationFrame = () => 0;
}

beforeAll(() => {
  installDomShim();
});

/** 每个用例重装 window：CinematicManager 构造期挂 boss-start，不重装会跨用例串线 */
beforeEach(() => {
  installWindowShim();
});

/** 与 DofPass.js 的真身同构的最小替身：API 只碰 enabled 与 uniforms 三键 */
const mkDofPass = () => ({
  enabled: false,
  uniforms: {
    focus: { value: 10 },
    aperture: { value: 0.025 },
    maxblur: { value: 1 },
  },
});

describe('DofPass 封装本体', () => {
  it('createDofPass 默认关灯，三个参数落进真 BokehPass 的 uniforms', () => {
    const pass = createDofPass(new THREE.Scene(), new THREE.PerspectiveCamera(), {
      focus: 7, aperture: 0.03, maxblur: 0.8,
    });
    expect(pass.enabled).toBe(false);
    expect(pass.uniforms['focus'].value).toBe(7);
    expect(pass.uniforms['aperture'].value).toBe(0.03);
    expect(pass.uniforms['maxblur'].value).toBe(0.8);
  });

  it('updateDofParams 只动传了的键，pass 缺席时自熄', () => {
    const pass = createDofPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    updateDofParams(pass, { focus: 3.5 });
    expect(pass.uniforms['focus'].value).toBe(3.5);
    expect(pass.uniforms['aperture'].value).toBe(0.025);   // 没传就保持默认
    expect(() => updateDofParams(null, { focus: 1 })).not.toThrow();
    expect(() => setDofEnabled(null, true)).not.toThrow();
  });

  it('setDofEnabled 开关幂等', () => {
    const pass = createDofPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    setDofEnabled(pass, true);
    expect(pass.enabled).toBe(true);
    setDofEnabled(pass, true);
    expect(pass.enabled).toBe(true);
    setDofEnabled(pass, false);
    expect(pass.enabled).toBe(false);
  });
});

describe('处决演出：DoF 随镜头包络呼吸', () => {
  const mkPlayerStub = () => ({
    scene: new THREE.Group(),
    mesh: { getObjectByName: () => null },
    characterModel: null,
    applyDash() {},
    getRightXZ: () => new THREE.Vector3(1, 0, 0),
    position: new THREE.Vector3(0, 0, 0),
    yaw: 0,
    combat: { lockTarget: null },
    getCombatForwardXZ: () => new THREE.Vector3(0, 0, 1),
    timeSlow: 1,
    cameraMode: 'third',
  });

  const mkGame = (dofPass) => {
    const player = mkPlayerStub();
    const game = {
      player,
      dofPass,
      cinematicActive: false,
      cinematics: null,
      restScene: null,
      combatInputLock: { lock() {}, release() {} },
      audio: { heavyHit() {}, executionSting() {} },
      executionFx: { burst() {} },
    };
    const d = new CombatCameraDirector(game);
    attachCombatCameraSkip(d, game);
    game.combatCamera = d;
    return { d, game };
  };

  it('play 后第一帧亮灯：焦点是有限正数，模糊量已随包络起步', () => {
    const { d } = mkGame(mkDofPass());
    d.play('execution', { position: { x: 0, y: 0, z: 4 }, stature: 2.2, base: 0 });
    d.update(1 / 60);
    const dof = d.game.dofPass;
    expect(dof.enabled).toBe(true);
    expect(dof.uniforms['focus'].value).toBeGreaterThan(1);
    expect(Number.isFinite(dof.uniforms['focus'].value)).toBe(true);
    expect(dof.uniforms['maxblur'].value).toBeGreaterThan(0);
    expect(dof.uniforms['maxblur'].value).toBeLessThan(EXECUTION_CAMERA.dofMaxblur);
  });

  it('模糊量呼吸到峰值再落回：包络是 0 → 1 → 0，不糊在终点', () => {
    const { d } = mkGame(mkDofPass());
    d.play('execution', { position: { x: 0, y: 0, z: 4 }, stature: 2.2, base: 0 });
    let peak = 0;
    for (let t = 0; t < 0.78; t += 1 / 60) {
      d.update(1 / 60);
      peak = Math.max(peak, d.game.dofPass.uniforms['maxblur'].value);
    }
    expect(peak).toBeGreaterThan(EXECUTION_CAMERA.dofMaxblur * 0.9);
    expect(d.game.dofPass.enabled).toBe(false);   // 播完当场还灯
    // 收尾帧只关灯不清参数：uniforms 停在最后一个 active 帧的落坡值（接近 0 但不必为 0），
    // 关灯期间不渲染、下次开灯第一帧立即重写，无残留问题
    expect(d.game.dofPass.uniforms['maxblur'].value)
      .toBeLessThan(EXECUTION_CAMERA.dofMaxblur * 0.2);
  });

  it('skip() 之后下一帧还灯：收敛出口在 update 的非活跃分支', () => {
    const { d } = mkGame(mkDofPass());
    d.play('execution', { position: { x: 0, y: 0, z: 4 }, stature: 2.2, base: 0 });
    d.update(1 / 60);
    expect(d.game.dofPass.enabled).toBe(true);
    d.skip();
    d.update(1 / 60);
    expect(d.game.dofPass.enabled).toBe(false);
  });

  it('没有 dofPass 的旧 save 全程不炸：两个调用都在判空里自熄', () => {
    const { d } = mkGame(undefined);
    expect(() => {
      d.play('execution', { position: { x: 0, y: 0, z: 4 }, stature: 2.2, base: 0 });
      for (let i = 0; i < 60; i++) d.update(1 / 60);
      d.skip();
      d.update(1 / 60);
    }).not.toThrow();
  });
});

describe('Boss 过场：DoF 首尾淡入淡出', () => {
  const playBoss = (dofPass) => {
    const game = {
      cinematicActive: false,
      dofPass,
      audio: { bossRoar() {} },
      dialog: { open: false, show() {}, hide() {} },
      player: { position: new THREE.Vector3(), rig: { setView() {} } },
    };
    const cine = new CinematicManager(game);
    window.dispatchEvent(new CustomEvent('boss-start', {
      detail: { bossId: 'shadow-warden', position: new THREE.Vector3(0, 0, 10) },
    }));
    return { cine, game };
  };

  it('第一帧亮灯：焦点在绕轨注视点（14 米档），模糊量还在 fade 坡上', () => {
    const { cine } = playBoss(mkDofPass());
    cine.update(1 / 60);
    const dof = cine.game.dofPass;
    expect(dof.enabled).toBe(true);
    expect(dof.uniforms['focus'].value).toBeGreaterThan(10);
    expect(Number.isFinite(dof.uniforms['focus'].value)).toBe(true);
    expect(dof.uniforms['maxblur'].value).toBeGreaterThan(0);
    expect(dof.uniforms['maxblur'].value).toBeLessThan(0.85);   // fade 起坡期没到峰值
  });

  it('中段满糊、收尾落坡、end 后还灯', () => {
    const { cine } = playBoss(mkDofPass());
    const duration = cine.config.duration;
    cine.update(duration / 2);
    const mid = cine.game.dofPass.uniforms['maxblur'].value;
    cine.update(duration);                                     // 推到收尾
    const tail = cine.game.dofPass.uniforms['maxblur'].value;
    expect(mid).toBeCloseTo(0.85, 6);
    expect(tail).toBeLessThan(mid);
    cine.end();
    expect(cine.game.dofPass.enabled).toBe(false);
  });

  it('没有 dofPass 也不炸', () => {
    const { cine } = playBoss(undefined);
    expect(() => {
      cine.update(1 / 60);
      cine.end();
    }).not.toThrow();
  });
});