/**
 * 景深 Pass 封装（W-C4 切片6）。
 *
 * 使用 Three.js 的 BokehPass，提供电影级景深效果，用于处决镜头和对话场景的对焦。
 * 遵循 W-C4 切片3 的铁律：DoF pass 必须插在 OutputPass 之前（线性空间运行）。
 */

import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';

/**
 * 创建并配置 BokehPass 实例
 * @param {THREE.Scene} scene - 场景对象
 * @param {THREE.Camera} camera - 相机对象
 * @param {object} options - 配置选项
 * @param {number} [options.focus=10] - 焦点距离（米），默认 10 米
 * @param {number} [options.aperture=0.025] - 光圈大小，控制模糊强度，默认 0.025
 * @param {number} [options.maxblur=1.0] - 最大模糊半径，默认 1.0
 * @returns {BokehPass} 配置的 pass 实例，默认 disabled（需手动启用）
 */
export function createDofPass(scene, camera, options = {}) {
  const {
    focus = 10,
    aperture = 0.025,
    maxblur = 1.0,
  } = options;

  const pass = new BokehPass(scene, camera, {
    focus,
    aperture,
    maxblur,
  });

  // 默认禁用，只在特定镜头（处决/对话）时由外部启用
  pass.enabled = false;

  return pass;
}

/**
 * 更新景深参数（运行时动态调整焦点）
 * @param {BokehPass} pass - DoF pass 实例
 * @param {object} params - 新参数
 * @param {number} [params.focus] - 新焦点距离
 * @param {number} [params.aperture] - 新光圈大小
 * @param {number} [params.maxblur] - 新最大模糊半径
 */
export function updateDofParams(pass, params) {
  if (!pass || !pass.uniforms) return;

  const { focus, aperture, maxblur } = params;

  if (focus !== undefined) {
    pass.uniforms['focus'].value = focus;
  }
  if (aperture !== undefined) {
    pass.uniforms['aperture'].value = aperture;
  }
  if (maxblur !== undefined) {
    pass.uniforms['maxblur'].value = maxblur;
  }
}

/**
 * 启用/禁用景深效果
 * @param {BokehPass} pass - DoF pass 实例
 * @param {boolean} enabled - 是否启用
 */
export function setDofEnabled(pass, enabled) {
  if (pass) {
    pass.enabled = enabled;
  }
}
