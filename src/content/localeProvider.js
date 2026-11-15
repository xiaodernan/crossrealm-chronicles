/**
 * 双语表提供者（W-Z93 切片）—— 首屏不背整张英文表。
 *
 * ## 为什么需要它
 *
 * 首屏体积门禁（`scripts/check-bundle-size.mjs`）只统计 `dist/index.html` 直接引用的资源。
 * 以前 `strings.en.js` 被 `engine/i18n.js` 与四个内容模块（franchises / gear /
 * semanticColors / skillTrees）静态 import —— 整张 250 KB 的英文表被迫进入 `chunk-core`，
 * 被 `<link rel="modulepreload">` 钉在首屏账面上，与中文表重复「一场冒险两种文字」只用其一。
 *
 * ## 设计
 *
 * - `strings.zh.js` 常驻 `chunk-core`（默认语言；无 JS 外语用户零成本）
 * - `strings.en.js` 只被本模块**动态 import** —— Vite 把它切成独立的 `chunk-en`，
 *   index.html 不会为它预加载，首屏账面不计它
 * - 本模块用 **顶层 `await`** 接上 en 表 —— 任何 import 本模块的文件，
 *   其求值都被这条 TLA 排在 en 落地**之后**（ESM 语义保证，不靠人记），
 *   所以 `stringTable('en')` 永远不会在表就绪前被调用。
 * - 万一某个早期路径拿到未就绪的 en（例如不经过本模块的直接 `import './strings.en.js'`），
 *   也只可能读到 undefined；本模块自己是 TLA 门，直接·import 本模块的人都得过门。
 *
 * ## 为什么不按 `storedLanguage()` 条件加载
 *
 * `i18n.js` 是地基层，不能向上够 `core/SettingsManager`（分层：engine 不读 core）。
 * 对称 TLA（两张表都等齐再放行消费者）比「语言判断 + 双轨就绪」简单一个量级，
 * 且不牺牲任何正确性；en 表只多一个并行请求，不在首屏账面上。
 */
import { STRINGS_ZH } from './strings.zh.js';

/** en 表在模块求值期就绪（TLA）；单请求并行下载，消费者求值被自动排在它之后 */
const { STRINGS_EN } = await import('./strings.en.js');

/**
 * 取整表（content 层的「双表」惯用法的新家）。
 * @param {'zh' | 'en' | string} lang
 * @returns {Readonly<Record<string, string>>}
 */
export const stringTable = (lang) => (lang === 'en' ? STRINGS_EN : STRINGS_ZH);

export { STRINGS_EN, STRINGS_ZH };
