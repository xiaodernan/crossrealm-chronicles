/**
 * 画质预设（W-D3 切片1）：低/中/高三档一键切换。
 *
 * 每一档是一组"出厂即合理"的组合值，玩家不必逐个调滑杆；改完仍可在设置面板微调单格，
 * 所以预设只负责"把这几格一次性推到目标值"，不负责锁死它们。
 */

import { SHADOW_QUALITY_SIZES } from './shadowPolicy.js';
import { MSAA_SAMPLES } from './aaPolicy.js';
import { SSAO_QUALITY_NAMES } from './ssaoSettings.js';

/**
 * 三档预设的冻结表。键名是显示给玩家的档位名，值是那一档要推到的具体数值。
 *
 * 为什么这些值来自名册而不是手抄字面量：
 * - shadowQuality / msaaSamples / ssaoQuality 的名册在各自的 policy 文件里，
 *   加一档或删一档时面板必须自动跟上（否则就是 B47 家族：显示与行为分家）。
 * - pixelRatio / bloomStrength / enemyLodDistance 没有名册，但它们的取值范围
 *   与默认值都在 `SettingsManager.DEFAULTS` 里，这里只写"这一档的目标值"。
 */
export const GRAPHICS_PRESETS = Object.freeze({
  low: Object.freeze({
    shadowQuality: SHADOW_QUALITY_SIZES[0],      // 最低档（通常 1024）
    msaaSamples: MSAA_SAMPLES[0],                // 关（0）
    ssaoQuality: 'off',                          // SSAO 关闭
    pixelRatio: 1.0,                             // 像素比降低，减少渲染负载
    bloomStrength: 0.2,                          // Bloom 减弱，减少光晕计算
    enemyLodDistance: 50,                        // LOD 距离缩短，远处敌人简化
  }),
  medium: Object.freeze({
    shadowQuality: SHADOW_QUALITY_SIZES[1],      // 中档（通常 2048）
    msaaSamples: MSAA_SAMPLES[MSAA_SAMPLES.length > 2 ? 1 : 0], // 中间档或第一档非零
    ssaoQuality: SSAO_QUALITY_NAMES.includes('medium') ? 'medium' : SSAO_QUALITY_NAMES[1] || SSAO_QUALITY_NAMES[0],
    pixelRatio: 1.5,                             // 出厂默认
    bloomStrength: 0.35,                         // 出厂默认
    enemyLodDistance: 85,                        // 出厂默认
  }),
  high: Object.freeze({
    shadowQuality: SHADOW_QUALITY_SIZES[SHADOW_QUALITY_SIZES.length - 1], // 最高档（通常 4096）
    msaaSamples: MSAA_SAMPLES[MSAA_SAMPLES.length - 1],                   // 最高档
    ssaoQuality: SSAO_QUALITY_NAMES[SSAO_QUALITY_NAMES.length - 1],       // 最高档
    pixelRatio: 2.0,                             // 高像素比，画面更锐利
    bloomStrength: 0.5,                          // Bloom 增强
    enemyLodDistance: 120,                       // LOD 距离拉长，远处细节保留
  }),
});

/** 预设名册（按顺序），用于生成下拉选项 */
export const PRESET_NAMES = Object.keys(GRAPHICS_PRESETS);

/** 出厂默认档：medium —— 兼顾画质与性能 */
export const DEFAULT_GRAPHICS_PRESET = 'medium';

/**
 * 校验预设名是否合法，非法则回落出厂档
 * @param {string} value - 用户传入的预设名
 * @returns {string} 合法的预设名
 */
export function normalizeGraphicsPreset(value) {
  if (typeof value !== 'string') return DEFAULT_GRAPHICS_PRESET;
  const key = value.toLowerCase().trim();
  return GRAPHICS_PRESETS[key] ? key : DEFAULT_GRAPHICS_PRESET;
}

/**
 * 读取某一档的具体数值
 * @param {string} presetName - 预设名（low / medium / high）
 * @returns {object} 该档位的配置对象
 */
export function getGraphicsPreset(presetName) {
  const preset = GRAPHICS_PRESETS[presetName];
  if (!preset) {
    const names = PRESET_NAMES.join(', ');
    throw new Error(`getGraphicsPreset: 未知档位「${presetName}」，可用档位：${names}`);
  }
  return { ...preset }; // 返回副本，防止调用方意外修改冻结对象
}
