/**
 * SSAO 配置冻结表（W-C4 切片5，B98 修正口径）。
 *
 * ## 档位与参数的出处
 * 四档名册：off / low / medium / high。参数字段只留 **GTAOPass 真 API 认的三样**：
 * - `radius`：遮蔽半径（世界空间米），落 `gtaoMaterial.uniforms.radius`；
 * - `samples`：采样数，落 `gtaoMaterial.defines.SAMPLES`（three 官方
 *   `GTAOPass.updateGtaoMaterial()` 统一处理，samples 变更会连 needsUpdate 一起落）；
 * - `intensity`：AO 强度，落 pass 的 `blendIntensity` —— GTAOPass 没有 "intensity"
 *   uniform，blend 材质把 AO 乘到场景色上的系数就叫 `blendIntensity`。
 *
 * （B98：初版名册里的 `bias` 不是 GTAOPass 的概念 —— 防自遮挡伪影是
 * `thickness` / `distanceFallOff` 的职责，调参留给美术切片；当初写的
 * `uniforms.bias` / `uniforms.intensity` 在 GTAOPass / GTAOShader 里都不存在。）
 *
 * ## 出厂 off（B94 的账）
 * GTAO 开着时每帧多一趟**全场景**法线/深度渲染（`_renderGBuffer`，MeshNormalMaterial
 * overrideMaterial 重画整个场景），draw call 近翻倍 —— B94 的整帧验收线 <400 是按
 * 出厂配置记的账（合批修完静置 226），出厂 medium 必超线。"归高档"（§8 原文口径）
 * = 玩家按机器能力自愿开；画质预设的 medium / high 档会主动推它开，那是玩家的选择。
 */

export const SSAO_QUALITY_PRESETS = Object.freeze({
  off: Object.freeze({ enabled: false, radius: 0, intensity: 0, samples: 0 }),
  low: Object.freeze({ enabled: true, radius: 0.5, intensity: 1.0, samples: 8 }),
  medium: Object.freeze({ enabled: true, radius: 1.0, intensity: 1.5, samples: 16 }),
  high: Object.freeze({ enabled: true, radius: 2.0, intensity: 2.0, samples: 32 }),
});

/**
 * 出厂档 off（B98）：GTAO 每帧多一趟全场景法线渲染，draw call 近翻倍 ——
 * B94 的验收线 <400 按出厂配置记的账，出厂就超线的档不配叫出厂。
 * 玩家想要接触阴影，画质预设点"中"或面板单开这一格。
 */
export const DEFAULT_SSAO_QUALITY = 'off';

/** 合法档位名册（设置面板下拉选项与画质预设都从这里现推，HTML 不抄第二份） */
export const SSAO_QUALITY_NAMES = Object.freeze(Object.keys(SSAO_QUALITY_PRESETS));

/**
 * 存储侧的清洗：认得出返回档位名，认不出回落出厂档 —— 存储是玩家可写的，
 * 一行手改的 localStorage 不该把开机炸了（`normalizeShadowQuality` 同一先例）。
 */
export function normalizeSsaoQuality(value) {
  if (typeof value === 'number') value = String(value);
  if (typeof value !== 'string') return DEFAULT_SSAO_QUALITY;
  const key = value.toLowerCase().trim();
  return SSAO_QUALITY_PRESETS[key] ? key : DEFAULT_SSAO_QUALITY;
}

/**
 * 取一档参数：认不出当场抛（说得出有哪些档），与 `shadowClassOf` 同口径。
 * 只给内部用 —— 玩家可写的存储走 `normalizeSsaoQuality` 回落，
 * 两条路的分界是"调用方能不能对脏值负责"。
 */
export function ssaoPresetOf(quality) {
  const preset = SSAO_QUALITY_PRESETS[quality];
  if (!preset) {
    throw new Error(`ssaoPresetOf: 未知档位「${quality}」，可用档位：${SSAO_QUALITY_NAMES.join(' / ')}`);
  }
  return preset;
}