/**
 * SSAO Pass 封装（W-C4 切片5）。
 *
 * 使用 Three.js 的 GTAOPass（Ground Truth Ambient Occlusion），提供更高质量的屏幕空间环境光遮蔽。
 * 遵循 W-C4 切片3 的铁律：SSAO pass 必须插在 OutputPass 之前（线性空间运行）。
 */

import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ssaoPresetOf } from './ssaoSettings.js';

/**
 * 创建并配置 GTAOPass 实例
 * @param {THREE.Scene} scene - 场景对象
 * @param {THREE.Camera} camera - 相机对象
 * @param {number} width - 渲染宽度
 * @param {number} height - 渲染高度
 * @param {string} quality - 画质档位（off/low/medium/high）
 * @returns {GTAOPass|null} 配置的 pass 实例，若档位为 off 则返回 null
 */
export function createSsaoPass(scene, camera, width, height, quality = 'medium') {
  const preset = ssaoPresetOf(quality);
  if (!preset.enabled) return null;

  const pass = new GTAOPass(scene, camera, width, height, {
    radius: preset.radius,
    bias: preset.bias,
    intensity: preset.intensity,
    samples: preset.samples,
  });

  // GTAOPass 默认输出模式：0=AO only, 1=Scene+AO blend
  pass.output = 1;

  return pass;
}

/**
 * 更新 SSAO pass 的参数（玩家切换档位时调用）
 * @param {GTAOPass} pass - SSAO pass 实例
 * @param {string} quality - 新档位
 */
export function updateSsaoQuality(pass, quality) {
  if (!pass) return;
  const preset = ssaoPresetOf(quality);

  // GTAOPass 的参数通过 uniforms 更新
  if (pass.gtaoMaterial) {
    pass.gtaoMaterial.uniforms.radius.value = preset.radius;
    pass.gtaoMaterial.uniforms.bias.value = preset.bias;
    pass.gtaoMaterial.uniforms.intensity.value = preset.intensity;
  }

  // 采样数需要重建内部缓冲区，这里简化处理只更新已有 uniform
  pass.enabled = preset.enabled;
}
