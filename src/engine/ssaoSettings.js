/**
 * SSAO 配置冻结表（W-C4 切片5）。
 *
 * 设计原则：
 * - 三档名册：关 / 低 / 中 / 高
 * - 关键参数：radius（遮蔽半径，米）、bias（偏差，避免自遮挡伪影）、intensity（强度）
 * - 采样数 samples 控制质量与性能的权衡
 * - 所有参数在出厂时设为"中"档，玩家可在设置面板调整
 */

export const SSAO_QUALITY_PRESETS = {
  off: {
    enabled: false,
    radius: 0,
    bias: 0,
    intensity: 0,
    samples: 0,
  },
  low: {
    enabled: true,
    radius: 0.5,
    bias: 0.01,
    intensity: 1.0,
    samples: 8,
  },
  medium: {
    enabled: true,
    radius: 1.0,
    bias: 0.02,
    intensity: 1.5,
    samples: 16,
  },
  high: {
    enabled: true,
    radius: 2.0,
    bias: 0.03,
    intensity: 2.0,
    samples: 32,
  },
};

/** 默认档位（与 SettingsManager DEFAULTS 对齐） */
export const DEFAULT_SSAO_QUALITY = 'medium';

/** 合法档位名册（用于设置面板下拉选项生成与输入校验） */
export const SSAO_QUALITY_NAMES = Object.keys(SSAO_QUALITY_PRESETS);

/**
 * 归一化 SSAO 档位字符串
 * @param {string|number} value - 用户输入
 * @returns {string} 归一化后的档位名（off/low/medium/high），非法值回落出厂
 */
export function normalizeSsaoQuality(value) {
  if (typeof value === 'number') value = String(value);
  if (typeof value !== 'string') return DEFAULT_SSAO_QUALITY;
  const key = value.toLowerCase().trim();
  return SSAO_QUALITY_PRESETS[key] ? key : DEFAULT_SSAO_QUALITY;
}

/**
 * 获取指定档位的配置对象
 * @param {string} quality - 档位名
 * @returns {object} 配置对象
 * @throws {Error} 认不出档位时抛错（内部口径，与 shadowClassOf 同款）
 */
export function ssaoPresetOf(quality) {
  const preset = SSAO_QUALITY_PRESETS[quality];
  if (!preset) {
    const names = SSAO_QUALITY_NAMES.join(', ');
    throw new Error(`ssaoPresetOf: 未知档位「${quality}」，可用档位：${names}`);
  }
  return preset;
}
