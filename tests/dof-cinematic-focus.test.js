/**
 * W-C4 余量续：Boss 过场 DoF 预设 cinematicIntro -> cinematicMid -> cinematicOutro
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CinematicManager } from '../src/cinematic/CinematicManager.js';
import { DOF_PRESETS } from '../src/content/tuning.js';
import { updateDof, resetDofForTest, requestDof, cancelDof } from '../src/engine/DofManager.js';
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

function playBoss(dofPass) {
  const game = {
    cinematicActive: false,
    dofPass,
    audio: { bossRoar() {} },
    dialog: { open: false, show() {}, hide() {} },
    player: { 
      position: new THREE.Vector3(), 
      rig: { setView() {} } 
    },
  };
  const cine = new CinematicManager(game);
  window.dispatchEvent(new CustomEvent('boss-start', {
    detail: { bossId: 'shadow-warden', position: new THREE.Vector3(0, 0, 10) },
  }));
  return { cine, game };
}

beforeAll(() => { installDomShim(); });
beforeEach(() => { 
  installWindowShim();
  resetDofForTest();
});

describe('Boss 过场：预设 cinematicIntro -> cinematicMid -> cinematicOutro', () => {
  it('phase=title 时请求 cinematicIntro：首帧亮灯、focus 在 14 米档、maxblur 在 fadeIn 坡上', async () => {
    const { cine, game } = playBoss(mkDofPass());
    cine.update(1 / 60);
    updateDof(game.dofPass, 1 / 60);
    const dof = game.dofPass;
    expect(dof.enabled).toBe(true);
    expect(dof.uniforms['focus'].value).toBeGreaterThan(10);
    expect(Number.isFinite(dof.uniforms['focus'].value)).toBe(true);
    expect(dof.uniforms['maxblur'].value).toBeGreaterThan(0);
    expect(dof.uniforms['maxblur'].value).toBeLessThan(DOF_PRESETS.cinematicIntro.maxblur);
  });

  it('phase 切换到 dialog 后请求 cinematicMid：模糊量升到峰值平台', async () => {
    const { cine, game } = playBoss(mkDofPass());
    const duration = cine.config.duration;
    // 推进到 phase 切换点：切相位与请求预设在同一帧内完成
    cine.update(duration / 2);
    updateDof(game.dofPass, duration / 2);
    expect(cine.phase).toBe('dialog');
    const mid = game.dofPass.uniforms['maxblur'].value;
    // cinematicIntro maxblur = 0.25, cinematicMid maxblur = 0.85
    // 切换到 dialog 时已进入 cinematicMid 预设，模糊量应显著超过 cinematicIntro 的峰值
    expect(mid).toBeGreaterThan(DOF_PRESETS.cinematicIntro.maxblur);
    // 继续推进，中段应贴住 cinematicMid 峰值（同 preset hold，重入不重置 fade）
    cine.update(0.5);
    updateDof(game.dofPass, 0.5);
    expect(game.dofPass.uniforms['maxblur'].value).toBeCloseTo(DOF_PRESETS.cinematicMid.maxblur, 1);
  });

  it('结束时请求 cinematicOutro：按长 fadeOut 平滑淡出后关灯', async () => {
    const { cine, game } = playBoss(mkDofPass());
    const duration = cine.config.duration;
    for (let t = 0; t < duration - 0.2; t += 1 / 60) {
      cine.update(1 / 60);
      updateDof(game.dofPass, 1 / 60);
    }
    expect(cine.active).toBe(true);
    cine.end();
    // 取消不是硬切：还在亮灯，模糊量从当前值开始退
    expect(game.dofPass.enabled).toBe(true);
    expect(game.dofPass.uniforms['maxblur'].value).toBeGreaterThan(0);
    for (let t = 0; t <= DOF_PRESETS.cinematicOutro.fadeOut; t += 1 / 60) {
      updateDof(game.dofPass, 1 / 60);
    }
    expect(game.dofPass.enabled).toBe(false);
    expect(game.dofPass.uniforms['maxblur'].value).toBe(0);
  });

  it('没有 dofPass 也不炸', async () => {
    const { cine, game } = playBoss(undefined);
    await expect(async () => {
      cine.update(1 / 60);
      updateDof(game.dofPass, 1 / 60);
      cine.end();
      updateDof(game.dofPass, 1 / 60);
    }).not.toThrow();
  });
});

describe('DofManager 预设表与状态机', () => {
  beforeEach(() => { resetDofForTest(); });

  it('requestDof({ preset }) 按 fadeIn 淡入、hold 保持、fadeOut 淡出', () => {
    const pass = mkDofPass();
    const cfg = DOF_PRESETS.execution;
    requestDof({ preset: 'execution', focus: 5 });
    // fadeIn 阶段
    updateDof(pass, cfg.fadeIn / 2);
    expect(pass.enabled).toBe(true);
    expect(pass.uniforms['maxblur'].value).toBeGreaterThan(0);
    expect(pass.uniforms['maxblur'].value).toBeLessThan(cfg.maxblur);
    // 完成淡入
    updateDof(pass, cfg.fadeIn);
    expect(pass.uniforms['maxblur'].value).toBeCloseTo(DOF_PRESETS.execution.maxblur, 1);
    // 显式取消进入淡出
    cancelDof();
    updateDof(pass, DOF_PRESETS.execution.fadeOut / 2);
    expect(pass.uniforms['maxblur'].value).toBeLessThan(cfg.maxblur);
    // 完成淡出
    updateDof(pass, DOF_PRESETS.execution.fadeOut);
    expect(pass.enabled).toBe(false);
  });

  it('cancelDof() 立即进入 fadeOut', () => {
    const pass = mkDofPass();
    requestDof({ preset: 'execution', focus: 5 });
    updateDof(pass, 0.1);
    expect(pass.enabled).toBe(true);
    cancelDof();
    // 逐帧推进淡出
    for (let i = 0; i < Math.ceil(DOF_PRESETS.execution.fadeOut * 60) + 10; i++) {
      updateDof(pass, 1 / 60);
    }
    expect(pass.enabled).toBe(false);
  });

  it('手动模式（无 preset）直接写目标、无插值', () => {
    const pass = mkDofPass();
    requestDof({ focus: 7, maxblur: 0.5, aperture: 0.03 });
    updateDof(pass, 1 / 60);
    expect(pass.uniforms['focus'].value).toBe(7);
    expect(pass.uniforms['maxblur'].value).toBe(0.5);
    expect(pass.uniforms['aperture'].value).toBe(0.03);
  });
});