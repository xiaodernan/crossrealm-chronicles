/**
 * W-C4 余量续：处决演出 DoF 预设 execution 含平滑淡入淡出
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CombatCameraDirector } from '../src/cinematic/CombatCameraDirector.js';
import { DOF_PRESETS } from '../src/content/tuning.js';
import { updateDof, resetDofForTest } from '../src/engine/DofManager.js';
import { installWindowShim } from './helpers/enemyHarness.js';

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

function mkDofPass() {
  return {
    enabled: false,
    uniforms: {
      focus: { value: 10 },
      aperture: { value: 0.025 },
      maxblur: { value: 1 },
    },
  };
}

function mkPlayerStub() {
  return {
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
  };
}

async function mkGame(dofPass) {
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
  const { attachCombatCameraSkip } = await import('../src/cinematic/CombatCameraDirectorExtensions.js');
  attachCombatCameraSkip(d, game);
  game.combatCamera = d;
  return { d, game };
}

function tickAll(d, game, dt) {
  d.update(dt);
  updateDof(game.dofPass, dt);
}

beforeAll(() => { installDomShim(); });
beforeEach(() => { 
  installWindowShim();
  resetDofForTest();
});

describe('处决演出：DoF 预设 execution 含平滑淡入淡出', () => {
  it('play(execution) 后第一帧：fadeIn 阶段已亮灯、focus 有限、maxblur > 0', async () => {
    const { d, game } = await mkGame(mkDofPass());
    d.play('execution', { position: { x: 0, y: 0, z: 4 }, stature: 2.2, base: 0 });
    tickAll(d, game, 1 / 60);
    const dof = game.dofPass;
    expect(dof.enabled).toBe(true);
    expect(dof.uniforms['focus'].value).toBeGreaterThan(1);
    expect(Number.isFinite(dof.uniforms['focus'].value)).toBe(true);
    expect(dof.uniforms['maxblur'].value).toBeGreaterThan(0);
    expect(dof.uniforms['maxblur'].value).toBeLessThan(DOF_PRESETS.execution.maxblur);
  });

  it('模糊量随 fadeIn 呼吸到峰值再随 fadeOut 降回，播完自动关灯', async () => {
    const { d, game } = await mkGame(mkDofPass());
    d.play('execution', { position: { x: 0, y: 0, z: 4 }, stature: 2.2, base: 0 });
    let peak = 0;
    const duration = DOF_PRESETS.execution.fadeIn + 0.78 + DOF_PRESETS.execution.fadeOut;
    for (let t = 0; t < duration; t += 1 / 60) {
      tickAll(d, game, 1 / 60);
      peak = Math.max(peak, game.dofPass.uniforms['maxblur'].value);
    }
    expect(peak).toBeGreaterThan(DOF_PRESETS.execution.maxblur * 0.9);
    // fadeOut 需要额外时间，再推进 fadeOut 时长的 2 倍确保完全淡出
    // 此时不再调用 d.update()，仅驱动 updateDof 以完成淡出
    for (let t = 0; t < DOF_PRESETS.execution.fadeOut * 2; t += 1 / 60) {
      updateDof(game.dofPass, 1 / 60);
    }
    expect(game.dofPass.enabled).toBe(false);
    expect(game.dofPass.uniforms['maxblur'].value)
      .toBeLessThan(DOF_PRESETS.execution.maxblur * 0.1);
  });

  it('skip() 立即进入 fadeOut，fadeOut 结束后关灯', async () => {
    const { d, game } = await mkGame(mkDofPass());
    d.play('execution', { position: { x: 0, y: 0, z: 4 }, stature: 2.2, base: 0 });
    tickAll(d, game, 1 / 60);
    expect(game.dofPass.enabled).toBe(true);
    d.skip();
    // end() 内已调用 setDofEnabled(false) 立即关灯，后续无需再驱动 updateDof
    expect(game.dofPass.enabled).toBe(false);
  });

  it('没有 dofPass 的旧 save 全程不炸', async () => {
    const { d } = await mkGame(undefined);
    await expect(async () => {
      d.play('execution', { position: { x: 0, y: 0, z: 4 }, stature: 2.2, base: 0 });
      for (let i = 0; i < 60; i++) tickAll(d, d.game, 1 / 60);
      d.skip();
      tickAll(d, d.game, 1 / 60);
    }).not.toThrow();
  });
});