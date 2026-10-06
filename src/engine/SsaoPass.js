/**
 * SSAO Pass（W-C4 切片5）：GTAOPass 的唯一组装与落档出口。
 *
 * ## 为什么有这一层（B98）
 * 初版对着想当然的 API 写了三处失实：`pass.output = 1`（按 `GTAOPass.OUTPUT` 枚举
 * 1 是 **Diffuse** —— 纯场景拷贝，AO 根本不进画面，画面零变化还白付 GBuffer/GTAO/
 * 去噪三趟渲染的钱）、构造第 5 参传 `{radius, bias, intensity, samples}`（GTAOPass
 * 把它交给 `setGBuffer`，只认 depthTexture/normalTexture，其余**静默丢弃**）、更新
 * 写 `uniforms.bias` / `uniforms.intensity`（GTAOShader 里不存在这两个 uniform，
 * `undefined.value =` 切档当场 TypeError）。这一版全部对齐 three 0.172 的真 API：
 *
 * - AO 进画面的开关是 `pass.output = GTAOPass.OUTPUT.Default`（0）：先把场景色拷进
 *   writeBuffer，再把 AO 以 `DstColorFactor` 乘法混合上去 —— AO 调制场景亮度；
 * - 半径与采样数走官方 `pass.updateGtaoMaterial({ radius, samples })`
 *   （radius 落 uniform，samples 落 defines + needsUpdate）；
 * - 强度真身是 `pass.blendIntensity`（blend 材质每帧读它）；
 * - 插链位置 `SSAO_INSERT_INDEX = 1`：RenderPass 之后、bloom **之前** ——
 *   AO 调制的是漫反射亮度，bloom 的光晕应基于 AO 后的亮度（暗角不发光）；
 *   切片3 铁律"OutputPass 之前"由这个位置自然满足。
 */

import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { normalizeSsaoQuality, ssaoPresetOf } from './ssaoSettings.js';

/**
 * SSAO 在链上的插入下标：RenderPass(0) 之后、bloom 之前。
 * 挂/摘都走 `composer.insertPass / removePass`，链尾 OutputPass 永远不动。
 */
export const SSAO_INSERT_INDEX = 1;

/**
 * 组装一个 GTAOPass：AO 真正混合进场景（OUTPUT.Default）、半径/采样/强度按名册档位落上。
 * 参数只走真 API —— bias/intensity 这类 GTAOPass 不认的字段不再出现（B98）。
 * off 档返回 null，调用方（`setSsaoQuality`）以此决定挂还是不挂。
 * `quality` 缺省按出厂档算（`normalizeSsaoQuality(undefined)` → `DEFAULT_SSAO_QUALITY`）。
 */
export function createSsaoPass(scene, camera, width, height, quality) {
  const preset = ssaoPresetOf(normalizeSsaoQuality(quality));
  if (!preset.enabled) return null;
  const pass = new GTAOPass(scene, camera, width, height);
  pass.output = GTAOPass.OUTPUT.Default;
  pass.blendIntensity = preset.intensity;
  pass.updateGtaoMaterial({ radius: preset.radius, samples: preset.samples });
  return pass;
}

/**
 * 对已挂的 pass 换档：半径/采样/强度逐项落上（官方 `updateGtaoMaterial` 处理
 * samples 的 defines 重建），off 档把 pass 整个禁用 —— 摘除走 `setSsaoQuality`，
 * 这里只管"还留着的那条"。
 * @returns 传进去的那个 pass
 */
export function updateSsaoQuality(pass, quality) {
  if (!pass) return pass;
  const preset = ssaoPresetOf(normalizeSsaoQuality(quality));
  pass.updateGtaoMaterial({ radius: preset.radius, samples: preset.samples });
  pass.blendIntensity = preset.intensity;
  pass.enabled = preset.enabled;
  return pass;
}

/**
 * SSAO 的唯一落档出口：挂 / 摘 / 换档三种情况一处收口 —— `Game.js` 开机与
 * `SettingsManager.applyToGame` 都走它，别处不许再碰 `game.ssaoPass`。
 * 同态调用是幂等的：设置面板开合重放设置不会反复拆链、不重复挂。
 *
 * 摘除必须 `dispose()`：GTAOPass 自带 4 张 render target 和多份材质，只 removePass
 * 不释放就是 B76 那一族的"忘了释放"泄漏。挂链取当前窗口尺寸（与 composer 构造同源），
 * 此后的 resize 由 `composer.setSize` 遍历 `pass.setSize` 同步 —— 半分辨率之类
 * "只在一处对、别处错位"的口径不进这条链（B98：半分辨率在第一次 resize 后静默失效）。
 * @returns 传进去的那个 game
 */
export function setSsaoQuality(game, quality) {
  if (!game || !game.composer) return game;
  const q = normalizeSsaoQuality(quality);
  const has = !!game.ssaoPass;
  if (q === 'off') {
    if (has) {
      game.composer.removePass(game.ssaoPass);
      game.ssaoPass.dispose();
      game.ssaoPass = null;
    }
    return game;
  }
  if (has) {
    updateSsaoQuality(game.ssaoPass, q);
    return game;
  }
  game.ssaoPass = createSsaoPass(
    game.scene, game.camera, window.innerWidth, window.innerHeight, q
  );
  if (game.ssaoPass) game.composer.insertPass(game.ssaoPass, SSAO_INSERT_INDEX);
  return game;
}