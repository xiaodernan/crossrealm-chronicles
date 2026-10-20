/**
 * 景深统一管理器（W-C4 切片6 余量：动态启用调用点收敛唯一出口）。
 *
 * 之前：`CombatCameraDirector` 与 `CinematicManager` 各自在 `update()` 里直接
 * 调 `setDofEnabled(this.game.dofPass, ...)` + `updateDofParams(...)`，且各自在
 * 清理路径里重复写 `setDofEnabled(..., false)` —— 两处写入、两套清理逻辑，
 * 退出路径一多（skip / 异常 / 面板抢占）极易漏关。
 *
 * 现在：两套导演只管**声明当前需要的 DoF 参数**（`requestDof(params)`），
 * `DofManager` 负责每帧：
 *   - 若有请求 → 开启 pass、应用参数
 *   - 若无请求 → 关闭 pass
 *   - 参数变化仅在有效帧写入 uniform
 *
 * 这样"是否启用 / 用什么参数"只有一份判据，清理由 Manager 的"无请求即关"兜底。
 */

import { setDofEnabled, updateDofParams } from './DofPass.js';

export { setDofEnabled };

/** 当前帧的 DoF 请求（null = 无请求即关）。 */
let _currentRequest = null;

/**
 * 本帧申请的 DoF 参数。
 * @param {{focus: number, aperture?: number, maxblur?: number} | null} params
 *   - `focus`: 焦点距离（米），必填
 *   - `aperture`: 光圈，默认 0.025
 *   - `maxblur`: 最大模糊半径，默认 1.0
 *   传 `null` 表示本帧无需求（Manager 会自动关灯）。
 */
export function requestDof(params) {
  _currentRequest = params;
}

/** 显式取消当前请求（导演结束时调用，立即关灯，不等下一帧）。 */
export function cancelDof() {
  _currentRequest = null;
}

/** 主循环每帧调用：根据有无请求驱动 pass 开关与参数。 */
export function updateDof(dofPass) {
  if (!_currentRequest) {
    if (dofPass?.enabled) setDofEnabled(dofPass, false);
    return;
  }
  const { focus, aperture = 0.025, maxblur = 1.0 } = _currentRequest;
  if (!dofPass?.enabled) setDofEnabled(dofPass, true);
  updateDofParams(dofPass, { focus, aperture, maxblur });
}

/** 供测试/重置：清空当前请求。 */
export function resetDofForTest() {
  _currentRequest = null;
}