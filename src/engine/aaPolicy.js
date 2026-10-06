/**
 * 抗锯齿策略：全屏 MSAA 只有这一个文件说了算（W-C4 切片1）
 *
 * ## 实锤：`antialias: true` 从上线起就是死参数
 * `Game.js` 构造 renderer 时传了 `antialias: true`，但 canvas 的 MSAA 帧缓冲只对
 * **直接画到 canvas 的几何边**有效。而这个游戏的每一帧都走 `EffectComposer`
 * （RenderPass → bloom → …）：场景先被渲染进 composer 自己的 render target，
 * 最后由一个全屏三角拷贝上屏 —— 全屏三角没有几何边，canvas 的 AA 无事可做。
 *
 * three 0.172 的 `EffectComposer` 在不传 renderTarget 时自建
 * `WebGLRenderTarget(w, h, { type: HalfFloatType })` —— **没有 `samples` 字段，
 * 即 samples=0**（`EffectComposer.js:26`）。所以：抗锯齿自切换 composer 链那天起
 * 就是 0，画面上所有的锯齿都来自这一行缺席的字段。
 *
 * ## 修法
 * MSAA 的真身在 composer 的 render target 上（WebGL2 多重采样，three r138+ 的
 * `WebGLRenderTarget.samples`：samples>0 时每帧自动 resolve，下游 pass 拿到的
 * texture 就是抗过的）。这份策略沿 `shadowPolicy.js` 的同一口径：
 *
 * - 名册冻结在这里，设置面板的下拉从它现推（HTML 里不抄第二份，抄了就会漏）；
 * - `msaaSamplesOf` 认不出当场抛（说得出有哪些档），只给内部用 —— 玩家可写的
 *   localStorage 走 `normalizeMsaaSamples` 回落，分界是"调用方能不能对脏值负责"；
 * - `applyMsaaSamples` 是唯一落档出口：`Game.js` 与 `SettingsManager.applyToGame`
 *   都走它，别处不许再写 `renderTarget.samples =`。
 */

/**
 * MSAA 采样数名册。0 = 关（核显兜底）、2 = 中、4 = 出厂。
 * WebGL2 的保证上限是 4（`gl.getParameter(gl.MAX_SAMPLES)` 在最差的实现上也 ≥4），
 * 名册不收录 8/16 —— 采样数翻倍只在斜边密集处有可见差异，开销却按全帧算。
 */
export const MSAA_SAMPLES = Object.freeze([0, 2, 4]);

/**
 * 出厂档 4：锯齿是每一帧都看得见的画面缺陷，默认开满；
 * 机器带不动的玩家降档 —— 与阴影精度档"出厂即迁移前同值"的思路相反，
 * 这里没有"迁移前同值"可守（迁移前是 0，一个不该守的值）。
 */
export const DEFAULT_MSAA_SAMPLES = 4;

/**
 * 取一档采样数：认不出就抛（说得出有哪些档），与 `shadowQualityOf` 同口径。
 */
export function msaaSamplesOf(n) {
  if (!MSAA_SAMPLES.includes(n)) {
    throw new Error(
      `msaaSamplesOf: 未知的 MSAA 采样数 ${n}，可用的是 ${MSAA_SAMPLES.join(' / ')}`
    );
  }
  return n;
}

/**
 * 存储侧的清洗：认得出返回数值，认不出回落出厂档（`normalizeShadowQuality`
 * 的同一先例 —— 一行手改的 localStorage 不该能把开机炸了）。
 */
export function normalizeMsaaSamples(n) {
  return MSAA_SAMPLES.includes(n) ? n : DEFAULT_MSAA_SAMPLES;
}

/**
 * 把一档 MSAA 落上 composer 的两张交换 target（1 和 2 都要 —— pass 链每帧在
 * 两者之间换手，只落一张等于只在半数帧里抗锯齿）。
 *
 * 改 `samples` 必须伴随 `dispose()`：WebGLTextures 按 target 的 samples 决定
 * 建 multisample framebuffer 还是普通 framebuffer，这个分配是**懒**的但也是
 * **缓存**的 —— 已建过的 target 只改 `samples` 字段不会触发重建，下一帧用的
 * 还是旧帧缓冲。`dispose()` 清掉 GPU 侧记录，下次渲染按新档重分配（JS 侧的
 * 对象与 texture name 都还在，不丢链路）。同档调用是幂等的：不 dispose，
 * 设置面板开合重放设置不会把活着的帧缓冲反复拆掉。
 * @returns 传进去的那个 composer
 */
export function applyMsaaSamples(composer, samples) {
  if (!composer) return composer;
  const n = msaaSamplesOf(samples);
  const rt1 = composer.renderTarget1;
  const rt2 = composer.renderTarget2;
  if (!rt1 || !rt2) return composer;
  if (rt1.samples === n && rt2.samples === n) return composer;
  rt1.samples = n;
  rt2.samples = n;
  rt1.dispose();
  rt2.dispose();
  return composer;
}
