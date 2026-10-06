/**
 * 区域雾参数 —— 每个区域一格 `{ color, density }`（W-C4 切片2）。
 *
 * ## 收口的是什么
 * 改前雾参数的真源分裂在**三处、三个时机、互相覆盖**：
 * 1. `world/zones/*.js` 的 config：7 区各一份 `fogColor`/`fogDensity`，
 *    由 `WorldManager.applyZoneAtmosphere` 在进区时写入（密度还乘了个没有
 *    注释的 0.85）；
 * 2. `WorldManager` 硬编码：hub 0x7a92aa/0.0042、corridor 0x7a8ea6/0.004；
 * 3. `WeatherSystem.setZone`：监听 `zone-changed`（**同步**派发，在 1 之后跑）
 *    把密度整个重写为 `base(SPACE 0.0028 / ABYSS 0.0045 / 其余 0.0038) + 天气加成`
 *    —— 也就是说 1 里的密度（连同那个 0.85）**从没生效过**，是被覆盖的死值。
 *
 * 改前玩家实际看到的画面因此是：**色 = WorldManager 的表，密度 = WeatherSystem
 * 的 base+boost**。本表按这个口径迁移（与 shadowPolicy 切片1 同一纪律：
 * 先按实测值收口、零视觉变更；调值是以后的事，两件事分开才能归因）。
 *
 * ## 分工
 * - **本表**：区域基础大气（色 + 基础密度）；
 * - **天气加成**：`WeatherSystem` 持有（它认识天气 preset），经
 *   `ZoneFog.setWeatherBoost()` 供给 —— 密度 = 本表值 + 天气加成，
 *   两笔账分开记，不再互相覆盖；
 * - **运行期落 fog**：只归 `effects/ZoneFog.js`（指数平滑收敛 + 昼夜明度）。
 *
 * ## 与 ZoneIdentity 的分工
 * `ZoneIdentity.js` 头注写明"本模块只放身份与文案，不放玩法数值" ——
 * 雾参数归本表。键 = `ZONE_IDS` 的每个成员，覆盖率由门禁钉住：新区注册进
 * 身份表而忘配雾，是装配错误，当场红。
 *
 * ## 纯数字模块
 * color 是 `number`（hex）、density 是 `number` —— 不 import three。数值本身
 * 没有任何一处需要 three；落 fog 的那一步在 `effects/ZoneFog.js`。
 */
import { ZONE_IDS } from './ZoneIdentity.js';

/** 枢纽行（也是 Game.js 构造 scene.fog 的初值 —— 开局即在目标上，无开局过渡） */
export const HUB_ATMOSPHERE = Object.freeze({ color: 0x7a92aa, density: 0.0038 });

/**
 * 区域基础大气表。密度是**区域基础值**（改前 WeatherSystem base），天气加成
 * 不折进来 —— 那笔账在 `WeatherSystem` 的 preset 里，经 ZoneFog 合成。
 */
export const ZONE_ATMOSPHERE = Object.freeze({
  [ZONE_IDS.HUB]: HUB_ATMOSPHERE,
  [ZONE_IDS.FANTASY]: Object.freeze({ color: 0x4a5a48, density: 0.0038 }),
  [ZONE_IDS.MAGIC]: Object.freeze({ color: 0x2a2040, density: 0.0038 }),
  [ZONE_IDS.SPACE]: Object.freeze({ color: 0x0a1020, density: 0.0028 }),
  [ZONE_IDS.VOID]: Object.freeze({ color: 0x1a1820, density: 0.0038 }),
  [ZONE_IDS.ABYSS]: Object.freeze({ color: 0x1a0a18, density: 0.0045 }),
  [ZONE_IDS.GLOOM]: Object.freeze({ color: 0x2a2a3a, density: 0.0038 }),
  [ZONE_IDS.RADIANT]: Object.freeze({ color: 0xffd700, density: 0.0038 }),
  [ZONE_IDS.CORRIDOR]: Object.freeze({ color: 0x7a8ea6, density: 0.0038 }),
  [ZONE_IDS.UNKNOWN]: Object.freeze({ color: 0x7a8ea6, density: 0.0038 }),
});

/**
 * 取一区的雾参数：认不出当场抛（说得出有哪些区）—— 与 `shadowQualityOf` /
 * `msaaSamplesOf` 同口径。调用方是 `ZoneFog`，它拿到的 zoneId 来自
 * `world.zoneId`（`zoneIdOf` 的产出只会是 ZONE_IDS 成员或 UNKNOWN），
 * 在这里抛说明有人绕过了身份模块往里塞了野 id。
 */
export function zoneAtmosphereOf(zoneId) {
  const hit = ZONE_ATMOSPHERE[zoneId];
  if (!hit) {
    throw new Error(
      `zoneAtmosphereOf: 未知的区域 id "${zoneId}"，登记的是 ${Object.keys(ZONE_ATMOSPHERE).join(' / ')}`
    );
  }
  return hit;
}

/**
 * 昼夜明度：正午（daylight=1）雾色就是表上的颜色；夜里按日光比例压暗。
 *
 * `daylight` 的算式在 `Game.updateDayNight`：0.55（深夜）~ 1.0（正午）。
 * 明度系数 = 0.35 + 0.65 × daylight —— 正午恰为 1.0（零变更）。
 * 不做这一步的症状：夜里的金色雾（radiant 0xffd700）会把远处物体"染亮"，
 * 因为 `scene.fog.color` 是"物体颜色向它靠拢"的目标色，夜里它比天光还亮就穿帮。
 * @returns {number} 调制后的 hex 颜色
 */
export function daylightTint(color, daylight) {
  const k = 0.35 + 0.65 * daylight;
  const r = Math.round(((color >> 16) & 0xff) * k);
  const g = Math.round(((color >> 8) & 0xff) * k);
  const b = Math.round((color & 0xff) * k);
  return (r << 16) | (g << 8) | b;
}

/**
 * 两格大气参数的插值（`ZoneFog` 每帧的指数平滑走它）。t=0 全 a、t=1 全 b；
 * 颜色按通道线性、密度线性（过渡段只在边界附近几百毫秒，线性插的"手感"
 * 误差不可见，可单测性优先）。**不修改入参** —— 两格都可能是冻结行。
 *
 * **返回浮点、不取整** —— 这是刻意为之：本函数被 `ZoneFog` 当作反馈积分器
 * （每帧把输出喂回下一帧的输入），中途取整会让"残差 < 每帧步长"的收敛末段
 * 在原地卡死（80 刻度的跨区过渡实测停在 ~20 刻度处不动）。取整只发生在
 * `ZoneFog` 落 fog / 返回快照的边界上，积分状态保持浮点。
 * @returns {{color: number, density: number}} color 是 hex 形态的浮点数
 */
export function blendAtmosphere(a, b, t) {
  const clamp = Math.min(1, Math.max(0, t));
  const lerp = (x, y) => x + (y - x) * clamp;
  const lerpHex = (x, y) =>
    lerp((x >> 16) & 0xff, (y >> 16) & 0xff) * 0x10000 +
    lerp((x >> 8) & 0xff, (y >> 8) & 0xff) * 0x100 +
    lerp(x & 0xff, y & 0xff);
  return {
    color: lerpHex(a.color, b.color),
    density: lerp(a.density, b.density),
  };
}
