/**
 * i18n 查找模块（W-D2 切片1）。
 *
 * 提供 `t(key)` 函数，根据当前语言返回对应文案。
 * 语言切换通过 `setLanguage('zh' | 'en')` 完成，默认中文。
 */

import { STRINGS_ZH } from '../content/strings.zh.js';
import { STRINGS_EN } from '../content/strings.en.js';

const TABLES = { zh: STRINGS_ZH, en: STRINGS_EN };

/** 语言名册（切片2）：面板的下拉选项从这里现推，加一门语言只改这一处 */
export const LANGUAGES = Object.freeze([
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' },
]);

/** 当前语言：'zh' | 'en'，默认中文 */
let currentLang = 'zh';

/**
 * 设置当前语言
 * @param {'zh' | 'en'} lang - 语言代码
 */
export function setLanguage(lang) {
  if (!TABLES[lang]) {
    throw new Error(`i18n: 未知语言 "${lang}"，可用语言：${Object.keys(TABLES).join(', ')}`);
  }
  currentLang = lang;
}

/**
 * 获取当前语言
 * @returns {'zh' | 'en'}
 */
export function getLanguage() {
  return currentLang;
}

/**
 * 根据键名获取文案
 * @param {string} key - 文案键名（如 'settings_title'）
 * @param {object} [params] - 可选插值参数：模板里的 `${name}` 按名替换（见 `interpolate`）
 * @returns {string} 对应语言的文案，键不存在时返回 `[MISSING: key]` 便于排查
 */
export function t(key, params) {
  const table = TABLES[currentLang];
  const value = table[key];
  if (value === undefined) {
    // 开发期：键不存在时返回 `[MISSING: key]` 而非静默失败
    console.warn(`i18n: 未找到键名 "${key}"（语言: ${currentLang}）`);
    return `[MISSING: ${key}]`;
  }
  return params ? interpolate(value, params) : value;
}

/**
 * 简单字符串插值：`"Hello ${name}"` + `{name: 'World'}` → `"Hello World"`
 * @param {string} template - 模板字符串
 * @param {object} params - 插值参数
 * @returns {string}
 */
function interpolate(template, params) {
  return template.replace(/\$\{(\w+)\}/g, (_, key) => params[key] ?? '');
}

/**
 * 批量导出所有键名（用于静态门禁测试）
 * @returns {string[]}
 */
export function getAllKeys() {
  return Object.keys(TABLES.zh);
}

/**
 * 把整棵 DOM 里带 `data-i18n` 属性的元素文本换成当前语言的文案（切片2）。
 *
 * 契约：元素上的 `data-i18n` 值就是键名，文本内容被 `textContent` 整体替换。
 * 找不到键的元素保持原文不动（`t()` 的 [MISSING:] 只在 JS 调用路径出现，
 * DOM 走查路径不把开发期的报错字样写进玩家界面）。
 *
 * 无 DOM 的环境（纯逻辑测试 / 早期启动）下走查是 no-op：默认起点在 `document`
 * 缺席时取 null，返回 0 —— `typeof` 探一次而不是让 `applyToGame` 记住哪些环境有 DOM。
 * @param {ParentNode | null} [root] - 走查起点，缺省等于 `document`（若存在）
 * @returns {number} 被替换的元素数（供测试断言）
 */
export function applyTranslations(root = typeof document !== 'undefined' ? document : null) {
  if (!root?.querySelectorAll) return 0;
  const table = TABLES[currentLang];
  let count = 0;
  for (const el of root.querySelectorAll('[data-i18n]')) {
    const key = el.getAttribute('data-i18n');
    const value = table[key];
    if (value !== undefined) {
      el.textContent = value;
      count += 1;
    }
  }
  return count;
}

/**
 * 校验两张语言表的键名是否完全一致（加载期自检）
 * @throws {Error} 如果键名不一致
 */
export function assertI18nParity() {
  const zhKeys = new Set(Object.keys(STRINGS_ZH));
  const enKeys = new Set(Object.keys(STRINGS_EN));

  const missingInEn = [...zhKeys].filter(k => !enKeys.has(k));
  const extraInEn = [...enKeys].filter(k => !zhKeys.has(k));

  if (missingInEn.length > 0 || extraInEn.length > 0) {
    const issues = [];
    if (missingInEn.length > 0) issues.push(`英文表缺少: ${missingInEn.join(', ')}`);
    if (extraInEn.length > 0) issues.push(`英文表多余: ${extraInEn.join(', ')}`);
    throw new Error(`i18n 键名不一致：\n${issues.join('\n')}`);
  }
}

// 加载期自检
assertI18nParity();
