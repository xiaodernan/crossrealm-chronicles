/**
 * 界面文字缩放（W-D6 切片69）：small / medium / large 三档。
 * 只改根元素上的 CSS 变量 --ui-text-scale，所有 rem 文本等比缩放。
 * 存的是档位而不是像素值；脏值在 normalizeUiTextScale 里回落出厂，不抛。
 */

export const UI_TEXT_SCALE_SMALL = 'small';
export const UI_TEXT_SCALE_MEDIUM = 'medium';
export const UI_TEXT_SCALE_LARGE = 'large';

export const DEFAULT_UI_TEXT_SCALE = UI_TEXT_SCALE_MEDIUM;

/**
 * 档位到根字号倍率的映射：medium = 1（与没这一格相同），small = 0.875（14px），large = 1.25（20px）。
 */
export const UI_TEXT_SCALE_MULTIPLIER = {
  [UI_TEXT_SCALE_SMALL]: 0.875,
  [UI_TEXT_SCALE_MEDIUM]: 1,
  [UI_TEXT_SCALE_LARGE]: 1.25,
};

export const UI_TEXT_SCALE_IDS = Object.freeze(Object.keys(UI_TEXT_SCALE_MULTIPLIER));

// 兼容别名：名册用于 i18n 动态键扫描
export const UI_TEXT_SCALES = UI_TEXT_SCALE_MULTIPLIER;

export const uiTextScaleOptions = [
  { value: UI_TEXT_SCALE_SMALL, label: '小' },
  { value: UI_TEXT_SCALE_MEDIUM, label: '中' },
  { value: UI_TEXT_SCALE_LARGE, label: '大' },
];

/**
 * 归一化：脏值回落出厂，不抛。
 */
export function normalizeUiTextScale(scale) {
  return scale in UI_TEXT_SCALE_MULTIPLIER ? scale : DEFAULT_UI_TEXT_SCALE;
}

/**
 * 把文字档写到根元素的 CSS 变量上；无 DOM 环境静默跳过。
 * 返回清洗后的倍率。
 */
export function applyUiTextScale(scale) {
  const normalized = normalizeUiTextScale(scale);
  const multiplier = UI_TEXT_SCALE_MULTIPLIER[normalized];
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.style.setProperty('--ui-text-scale', String(multiplier));
  }
  return multiplier;
}
