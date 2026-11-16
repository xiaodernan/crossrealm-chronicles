/**
 * 双语表提供者（W-Z93 起，W-Z285 补齐）—— 中英两张表都不在首屏账面上。
 *
 * ## 为什么需要它
 *
 * 首屏体积门禁（`scripts/check-bundle-size.mjs`）只统计 `dist/index.html` 直接引用的资源。
 * 以前 `strings.en.js` 被 `engine/i18n.js` 与四个内容模块静态 import，整张英文表被钉进
 * `chunk-core`；W-Z93 卸下（`chunk-en`）后，index.html 不背英文表；W-Z285 把中文表同样卸下
 * （`chunk-zh`）—— 至此 index.html 不背任何一张语言表。
 *
 * ## 设计
 *
 * - `strings.zh.js` 动态 import —— Vite 把它切成独立的 `chunk-zh`，index.html 不为它预加载
 * - `strings.en.js` 动态 import —— Vite 把它切成独立的 `chunk-en`，同上
 * - 本模块用 **顶层 `await`** 同时接上两张表（`Promise.all` 并行）—— 任何 import 本模块的文件，
 *   其求值都被这条 TLA 排在两张表落地**之后**（ESM 语义保证，不靠人记），
 *   所以 `stringTable('zh'|'en')` 永远不会在表就绪前被调用。
 *
 * ## 为什么不按 `storedLanguage()` 条件加载
 *
 * `i18n.js` 是地基层，不能向上够 `core/SettingsManager`（分层：engine 不读 core）。
 * 对称 TLA（两张表都等齐再放行消费者）比「语言判断 + 双轨就绪」简单一个量级，
 * 且不牺牲任何正确性；中英用户的 boot 各多一个并行请求（zh 与 en 并行，不串行加延迟）。
 *
 * ## 为什么分包而不是双双常驻
 *
 * 首屏门禁按 index.html 直接引用的原始字节计，不按"本机默认语言"豁免。两张表合计
 * ≈ 450 KB；动态化后首屏 −~227 KB（W-Z285 实测 2226011 → 如实测量见 check-bundle-size.mjs 刻度注释）。
 */
/** 顶层 await：两张表并行下载；任何 import 本模块的文件，其求值都被这条 TLA 排在它们之后 */
const [{ STRINGS_ZH }, { STRINGS_EN }] = await Promise.all([
  import('./strings.zh.js'),
  import('./strings.en.js'),
]);

/**
 * 取整表（content 层的「双表」惯用法的新家）。
 * @param {'zh' | 'en' | string} lang
 * @returns {Readonly<Record<string, string>>}
 */
export const stringTable = (lang) => (lang === 'en' ? STRINGS_EN : STRINGS_ZH);

export { STRINGS_EN, STRINGS_ZH };
