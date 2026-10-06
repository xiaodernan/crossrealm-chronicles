/**
 * i18n 查找模块（W-D2 切片1）。
 *
 * 提供 `t(key)` 函数，根据当前语言返回对应文案。
 * 语言切换通过 `setLanguage('zh' | 'en')` 完成，默认中文。
 */

import { STRINGS_ZH } from '../content/strings.zh.js';
import { STRINGS_EN } from '../content/strings.en.js';

const TABLES = { zh: STRINGS_ZH, en: STRINGS_EN };

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
 * @param {object} [params] - 可选插值参数（暂未实现，预留）
 * @returns {string} 对应语言的文案，键不存在时返回键名本身（便于排查）
 */
export function t(key, params) {
  const table = TABLES[currentLang];
  const value = table[key];
  if (value === undefined) {
    // 开发期：键不存在时返回 `[MISSING: key]` 而非静默失败
    console.warn(`i18n: 未找到键名 "${key}"（语言: ${currentLang}）`);
    return `[MISSING: ${key}]`;
  }
  // TODO: 简单插值支持 `${name}` → params.name
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
