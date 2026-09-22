import * as THREE from 'three';
import { SHAKE as SHAKE_CFG } from '../content/tuning.js';

/**
 * 震屏 —— 全局唯一的相机抖动来源。
 *
 * 三件事收在一处，其他系统只调用 `add()`：
 * 1. **累积**：多次请求叠进同一个 trauma，封顶 1.0，不再"后一下把前一下覆盖掉"；
 * 2. **衰减**：按秒（`decay`）而不是按帧 —— 旧实现每帧 `×0.78`，144 Hz 几乎不抖、30 Hz 抖过头；
 * 3. **形状**：偏移由相位积分出的多正弦和给出，同一个时间轴可复现，不再是每帧三个 `Math.random()`。
 *
 * 位移只在 `update()` 里写进 `this.offset` 一次；相机侧通过 `applyTo()` 取用，
 * 视角差异（第一/第三人称幅度与注视点权重）由 `setProfile()` 一次性声明，
 * 免得每个相机写入点各自决定"这次抖多少"。
 *
 * 数值来自 `content/tuning.js` 的 `SHAKE`。
 */
export class Shake {
  constructor(cfg = SHAKE_CFG) {
    this.cfg = cfg;
    this.profile = 'third';
    this.trauma = 0;
    this.phase = 0;
    this.offset = new THREE.Vector3();
    /** 自动演示与截图路径不需要抖动，由主循环每帧声明 */
    this.muted = false;
  }

  /** 相机视角切换时声明一次：决定峰值位移与注视点跟随权重 */
  setProfile(profile) {
    this.profile = profile === 'first' ? 'first' : 'third';
  }

  /** 请求一次震动：`intensity` 沿用各系统原有的小数值（轻击 0.03 ~ 蓄力法术 0.35） */
  add(intensity) {
    if (this.muted || !(intensity > 0)) return this;
    this.trauma = Math.min(1, this.trauma + intensity / this.cfg.ref);
    return this;
  }

  update(dt) {
    if (this.trauma <= 0) {
      if (this.offset.lengthSq() > 0) this.offset.set(0, 0, 0);
      return this;
    }
    this.trauma = Math.max(0, this.trauma - this.cfg.decay * dt);
    this.phase += dt * this.cfg.freq;
    const p = this.phase * Math.PI * 2;
    const a = this.cfg.meters[this.profile] * this.trauma;
    // 每轴两个正弦、频率互为非整数倍：看起来是随机的，但完全由时间决定
    this.offset.set(
      (Math.sin(p) * 0.58 + Math.sin(p * 2.31 + 1.9) * 0.42) * a,
      (Math.sin(p * 1.73 + 0.7) * 0.62 + Math.sin(p * 3.17 + 2.4) * 0.38) * a * this.cfg.vertical,
      (Math.sin(p * 1.19 + 3.3) * 0.6 + Math.sin(p * 2.77 + 0.4) * 0.4) * a * this.cfg.depth
    );
    if (this.trauma === 0) this.offset.set(0, 0, 0);
    return this;
  }

  /** 把当前偏移加到相机：位置吃满，注视点只吃一部分（全跟着就成平移了） */
  applyTo(pos, look) {
    if (this.trauma <= 0 || this.offset.lengthSq() === 0) return this;
    pos.add(this.offset);
    look.addScaledVector(this.offset, this.cfg.lookWeight[this.profile]);
    return this;
  }

  /** 观察者接口：HUD 与测试读强度，不翻内部字段 */
  get strength() {
    return this.trauma;
  }

  /** 换区/重生/重开：残留的抖动不该跨过场景边界 */
  reset() {
    this.trauma = 0;
    this.phase = 0;
    this.offset.set(0, 0, 0);
    return this;
  }
}

/**
 * 共享实例 —— 震屏是"一台相机"的全局状态，不该有第二个所有者。
 * 请求方走 `addShake()` 这个模块接口，比 `window.dispatchEvent(new CustomEvent(...))`
 * 少一次事件对象分配，也不再有"监听器是否存在"的隐式耦合（B29）。
 */
export const shake = new Shake();

export function addShake(intensity) {
  shake.add(intensity);
}
