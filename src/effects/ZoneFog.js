/**
 * 区域雾的运行期载体（W-C4 切片2）：`scene.fog` 是它的唯一输出。
 *
 * ## 为什么不直接写 `scene.fog`
 * 跨区瞬变是画面上最刺眼的一种坏：边界一过，整个世界的远景颜色"啪"一下
 * 换掉 —— 玩家读到的是 bug 而不是大气。区域雾的落点必须是**平滑收敛**：
 * 每帧从当前值向目标值走一小步。
 *
 * ## 算式：单一指数平滑，没有状态机
 * `k = 1 - exp(-rate·dt)`，当前值向目标走 k 比例。选它有两个理由：
 * - **进度由真实时间决定**（掉帧的那一帧要追上更多距离），且 `exp` 形式下
 *   "还剩多远"每秒衰减固定比例 —— rate=1.5 时约 0.5 秒走完 95% 的过渡；
 * - **两种"目标变化"共用同一算式**：跨区是跳变，昼夜明度是每帧微动 ——
 *   微动时平滑自然跟随，跳变时自然收敛。不需要"检测到换区"的状态分支
 *   （那样的分支每帧都会被昼夜微动误触发，过渡永远走不完）。
 *
 * ## 唯一写入者
 * 本类落定后，`scene.fog.color` / `density` 的写权限归这里（M3 同一条纪律：
 * 相机、fog 这类全局状态必须有唯一所有者）。`Game.js` 只在每帧驱动
 * `update(dt, world.zoneId, daylight)`，不再直接写雾。
 */
import { zoneAtmosphereOf, daylightTint, blendAtmosphere } from '../content/zoneAtmosphere.js';

/** 收敛速率（每秒）：1.5 ⇒ 约 0.5 秒走完 95% 过渡 */
const BLEND_RATE = 1.5;

export class ZoneFog {
  /**
   * @param {THREE.FogExp2} fog 场景雾（唯一输出）
   */
  constructor(fog) {
    this.fog = fog;
    /** 当前运行值（纯数字快照，单测与读数都不必碰 three 对象） */
    this._current = { color: fog.color.getHex(), density: fog.density };
    /** 天气对雾密度的加成：`WeatherSystem` 换区时推给它（区域账与天气账分开记） */
    this._weatherBoost = 0;
  }

  /**
   * 天气加成的唯一入口。下一帧 `update` 生效 —— 目标变了，平滑自然跟过去。
   * @param {number} boost 密度加成（ WeatherSystem preset 的 `fogBoost`）
   */
  setWeatherBoost(boost) {
    this._weatherBoost = boost ?? 0;
  }

  /**
   * 每帧驱动。`zoneId` 来自 `world.zoneId`，`daylight` 来自昼夜循环
   * （0.55 深夜 ~ 1.0 正午；缺省按正午算）。
   * @returns {{color: number, density: number}} 本帧落定的运行值（读数用）
   */
  update(dt, zoneId, daylight) {
    const target = zoneAtmosphereOf(zoneId);
    const next = {
      color: daylightTint(target.color, daylight ?? 1),
      density: target.density + this._weatherBoost,
    };
    const k = 1 - Math.exp(-BLEND_RATE * dt);
    // 从当前值向目标走 k 比例 —— 跨区（跳变）时收敛，昼夜（微动）时跟随。
    // blendAtmosphere 返回浮点，积分状态不取整（中途取整会让收敛末段卡死，
    // 见 zoneAtmosphere.blendAtmosphere 的注释）；取整只在落 fog 的边界上。
    this._current = blendAtmosphere(this._current, next, k);
    const snap = { color: Math.round(this._current.color), density: this._current.density };
    this.fog.color.setHex(snap.color);
    this.fog.density = snap.density;
    return snap;
  }
}
