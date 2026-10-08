/**
 * 构建期内容校验（W-B1 的余项：**"构建期插件（`vite build` 里复用同一份校验）"**）。
 *
 * ## 为什么要有这一片
 *
 * 内容表现在已经全部收进 `src/content/`，`checkContent()` 也会一次报出全部错 —— 但它
 * **只有 `npm test` 一个消费者**。于是"内容表写坏了"这件事的可见范围取决于谁跑了什么：
 * 一个只跑 `npm run build` 的人（改完样式想看一眼产物、CI 只跑构建的那一步、将来任何
 * 直接 `vite build` 的打包流程）拿到的是一份**看起来成功**的产物，坏表要到玩家走进那一格
 * 才现形。这与 §2.1 第 6 条"不许静默失败"是同一件事：错误要么有文案、要么有断言 ——
 * 而构建期是这条链上最后一个还空着的关口。
 *
 * ## 四条设计决定（每条都有一次踩坑）
 *
 * 1. **校验本体不在这里重写**。插件只负责"把 `src/content/registry.js` 载进来、调它的
 *    `checkContent()`、把返回的字符串列表变成一次构建失败"。判据只有一份，与 `npm test`
 *    问的是同一个函数 —— 各抄一份的下场是两边报的错不一样，而玩家看到的是
 *    "测试说没事、构建说有事"。
 * 2. **挂 `configResolved` 而不是 `buildStart`**。两条钩子在 `vite build` 下都能用，
 *    差别在 `vite dev`：Vite 会 `await` 每个插件的 `configResolved`，而 dev 下的
 *    `buildStart` 不是每条路径都被等到 —— 挂在后者上，内容写坏时开发服务器可能照常起来、
 *    只在控制台留一条未处理拒绝。**守门人要能拦住两种入口**，所以选前者。
 * 3. **用 `pathToFileURL(root + rel)` 拼绝对 URL，而不是相对说明符**。第一版写的是
 *    `import('../src/content/registry.js')`：在源码树里它对着 `scripts/` 解析，看着更简单，
 *    但 Vite 会把配置文件**打进一个躺在仓库根部的临时包**
 *    （`vite.config.js.timestamp-*.mjs`），于是 `../src/…` 变成 `D:/src/…` ——
 *    `npm run build` 当场 `ERR_MODULE_NOT_FOUND`。root 由 `configResolved(config)` 的
 *    `config.root` 给出，是唯一可靠的锚。
 * 4. **`pathToFileURL` 而不是手拼 `file://` 字符串**。本仓库路径含非 ASCII（`3a大作`），
 *    它必须被百分号编码（实测 `file:///D:/3a%E5%A4%A7%E4%BD%9C/src/content/registry.js`）；
 *    纯 Node 的 ESM 装载器会解码，手拼的字符串则会在别处炸。
 *
 * ## 限度（写清楚）
 *
 * - 只覆盖 `vite build` / `vite dev` 两条入口。绕过 vite 自己拿 rollup 组一套配置不会被拦下
 *   —— 那时"最后一个关口"就是 `npm test`。
 * - 它**不**做"运行期内容自检"：`assertContent()` 仍在启动路径上，两者是同一份判据的两个
 *   时刻，不是两套规则。
 * - 用例里**跑不到**真装载器那一步：vitest 的模块运行器会把动态 import 收进自己的解析器，
 *   而那个解析器吃不消百分号编码的 id（实测 `Failed to load url … Does the file exist?`），
 *   沙箱里又起不了子进程（`spawnSync … EBUSY`）。所以真装载器由 `registryUrl()` 的路径
 *   互证 + 一次纯 Node 实跑 + 一次真 `vite build` 的读数背书（见 §9 本条 ADR），
 *   **不在用例里假装覆盖过**。
 */
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';

/** 插件名（门禁按名字认它，改名要一起改 `tests/vite-content-check.test.js`） */
export const CONTENT_CHECK_PLUGIN = 'crossrealm:content-check';

/** 校验入口相对**项目根**的位置 —— 只有这一份，插件与用例问同一个常量 */
export const CONTENT_REGISTRY_REL = 'src/content/registry.js';

/** 项目根 + 相对路径 → 注册表模块的 `file://` URL（编码交给 `pathToFileURL`） */
export function registryUrl(root = process.cwd(), rel = CONTENT_REGISTRY_REL) {
  return pathToFileURL(join(resolve(root), rel));
}

/** 把错误列表变成一段人能读的报文（构建失败时原样打出来） */
export function contentErrorText(errors) {
  return `内容表校验未通过（${errors.length} 处）：\n  - ${errors.join('\n  - ')}`;
}

/**
 * 跑真校验：载入注册表模块，调它的 `checkContent()`。
 * 返回值是字符串数组（空数组 = 全部通过），**不抛** —— 抛不抛由调用方决定。
 * `load` 是给用例注入假模块的槽位（默认走真注册表）。
 */
export async function runContentCheck(root = process.cwd(), load) {
  const mod = load ? await load() : await import(/* @vite-ignore */ registryUrl(root).href);
  if (typeof mod?.checkContent !== 'function') {
    throw new TypeError(
      `${CONTENT_REGISTRY_REL} 没有导出 checkContent —— 插件拿不到判据，`
      + '这时"构建通过"是一句没有依据的话（要么改这个常量，要么把注册表恢复成导出它的样子）'
    );
  }
  return mod.checkContent();
}

/**
 * Vite 插件。`options.check` 是给用例注入假判据的槽位（默认走真注册表）——
 * 有它，用例才能在不改真内容表的前提下驱动"坏表 → 构建失败"这一条路径。
 */
export function contentCheckPlugin(options = {}) {
  const check = options.check ?? ((root) => runContentCheck(root));
  return {
    name: CONTENT_CHECK_PLUGIN,
    // 见文件头第 2 条：dev 与 build 都会 await 这一条，`buildStart` 不保证。
    // root 从**解析后的配置**里取（第 3 条踩坑的落点），不读 cwd。
    async configResolved(config) {
      const errors = await check(config?.root ?? process.cwd());
      if (errors.length) throw new Error(contentErrorText(errors));
    },
  };
}
