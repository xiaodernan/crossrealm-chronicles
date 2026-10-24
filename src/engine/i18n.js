/**
 * i18n 查找模块（W-D2 切片1）。
 *
 * 提供 `t(key)` 函数，根据当前语言返回对应文案。
 * 语言切换通过 `setLanguage('zh' | 'en')` 完成，默认中文。
 *
 * 运行时口径（W-D2 切片56）：两张表在 import 期一次解析（源码合计约 354KB，对
 * three.js 体量的工程可忽略），**不按语言懒加载** —— 全仓 1314 个 `t()` 调用点都是
 * 同步取值，懒加载要把每个调用点改异步，收益（省一半表的解析）远小于成本。缺键
 * 告警按键去重（`t()` 在每帧路径上，逐帧刷屏会埋掉真正的报错）。
 */

import { STRINGS_ZH } from '../content/strings.zh.js';
import { STRINGS_EN } from '../content/strings.en.js';

/** 语言 -> 文案表。两张表各自在 content 层已 Object.freeze，这里连映射一起冻上：
 *  运行时没有任何正当理由换表（换语言走 setLanguage，不改这张映射）（W-D2 切片56）。 */
const TABLES = Object.freeze({ zh: STRINGS_ZH, en: STRINGS_EN });

/**
 * 已经告过警的缺失键（W-D2 切片56）。
 *
 * `t()` 在每帧路径上（HUD 文本刷新、地图 canvas 的 fillText），一个拼错的键若每帧
 * warn，一局下来几千条一模一样的话会把控制台冲垮 —— 真正想看的报错反而被埋掉。
 * 同一个键整局只喊一次：**返回值不变**（每次仍返回 `[MISSING: key]`），变的只是噪音。
 */
const warnedMissingKeys = new Set();

/**
 * 语言名册（切片2）：面板的下拉选项从这里现推，加一门语言只改这一处。
 * `htmlLang`（切片59）：切到该语言时写进 `document.documentElement.lang` 的 BCP47 标签
 * —— 读屏软件按它选发音引擎，浏览器翻译与字体选择也看它（index.html 里的静态初值
 * 只是首屏默认，运行时以这里为准）。
 */
export const LANGUAGES = Object.freeze([
  { code: 'zh', label: '中文', htmlLang: 'zh-CN' },
  { code: 'en', label: 'English', htmlLang: 'en' },
]);

/** 当前语言：'zh' | 'en'，默认中文 */
let currentLang = 'zh';

/**
 * 设置当前语言。顺带把 `document.documentElement.lang` 切到该语言的 BCP47 标签
 * （切片59：读屏软件按它选发音；无 DOM 环境静默跳过）。
 * @param {'zh' | 'en'} lang - 语言代码
 */
export function setLanguage(lang) {
  if (!TABLES[lang]) {
    throw new Error(`i18n: 未知语言 "${lang}"，可用语言：${Object.keys(TABLES).join(', ')}`);
  }
  currentLang = lang;
  // 文档语言声明跟着切（切片59）：读屏软件按 <html lang> 选发音引擎。
  // 无 DOM 的环境（纯逻辑测试 / 早期启动）静默跳过 —— 与 applyTranslations 同一口径。
  const entry = LANGUAGES.find((l) => l.code === lang);
  if (entry?.htmlLang && typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = entry.htmlLang;
  }
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
    // 开发期：键不存在时返回 `[MISSING: key]` 而非静默失败；同一个键只 warn 一次
    // （切片56：t() 在每帧路径上，逐帧刷屏会埋掉真正的报错）
    if (!warnedMissingKeys.has(key)) {
      warnedMissingKeys.add(key);
      console.warn(`i18n: 未找到键名 "${key}"（语言: ${currentLang}）`);
    }
    return `[MISSING: ${key}]`;
  }
  return params ? interpolate(value, params) : value;
}

/**
 * 简单字符串插值：`"Hello ${name}"` + `{name: 'World'}` → `"Hello World"`
 *
 * 计数名词单元（W-D2 切片58）：`${count|time|times}` 按 `params.count` 选形态 ——
 * 等于 1 渲染 `1 time`，否则渲染 `3 times`。英文表用它纠 "1 times" 这类语法错；
 * **中文表不使用**（中文靠量词、不靠词形变化），`i18n-conventions` 门禁钉着中文表零标记。
 * 约定：替代段必须是纯词（不含 `${` / `}` / `|`），参数名与普通占位符同名同义 ——
 * 于是「这个模板消费哪些参数」的答案与普通占位符完全一致，占位符比对门禁认得它。
 * @param {string} template - 模板字符串
 * @param {object} params - 插值参数
 * @returns {string}
 */
function interpolate(template, params) {
  const withPlurals = template.replace(/\$\{(\w+)\|([^|}]*)\|([^|}]*)\}/g, (_, key, one, other) => {
    const value = params[key];
    return `${value ?? ''} ${Number(value) === 1 ? one : other}`;
  });
  return withPlurals.replace(/\$\{(\w+)\}/g, (_, key) => params[key] ?? '');
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
 * `data-i18n-aria`（W-D2 切片32）：同一份契约套在 `aria-label` 上 —— 读屏软件念的
 * 就是它，它同样是玩家的界面文案。`aria-label` 既不是 textContent（`data-i18n`
 * 换不到它）、也不是 `{动作}` 占位（`keyText` 不碰属性），所以单开一个属性名，
 * 换语言时与 `data-i18n` 同一次走查里换掉。
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
  // 切片56：两个属性合并成一次走查（原来是 `[data-i18n]` 与 `[data-i18n-aria]` 各
  // querySelectorAll 一遍）。换语言是一次性的整树重写，两遍变一遍省一半遍历；
  // 同时挂两个属性的元素（文本 + 读屏标签）在同一轮里各换各的，与拆分走查等价。
  for (const el of root.querySelectorAll('[data-i18n], [data-i18n-aria]')) {
    const textKey = el.getAttribute('data-i18n');
    if (textKey !== null) {
      const value = table[textKey];
      if (value !== undefined) {
        el.textContent = value;
        count += 1;
      }
    }
    const ariaKey = el.getAttribute('data-i18n-aria');
    if (ariaKey !== null) {
      const value = table[ariaKey];
      if (value !== undefined) {
        el.setAttribute('aria-label', value);
        count += 1;
      }
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
