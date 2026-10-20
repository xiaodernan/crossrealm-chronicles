/**
 * 景深统一管理器（W-C4 切片6 余量续：预设表数据化 + 平滑插值）。
 *
 * 功能：
 *   - 预设驱动：导演仅需 `requestDof({ preset: 'execution' })`，参数来自 `DOF_PRESETS`
 *   - 平滑插值：自动按 `fadeIn`/`fadeOut` 做淡入淡出（0 → 峰值 → 0）
 *   - 兜底关灯：无请求或取消时自动按 `fadeOut` 平滑关灯
 *   - 手动覆盖：仍可直接传 `focus/aperture/maxblur` 绕过预设（兼容旧调用）
 *   - 零 three 依赖，node 可直接 import。
 */

import { setDofEnabled, updateDofParams } from './DofPass.js';
import { DOF_PRESETS } from '../content/tuning.js';

export { setDofEnabled };

/** 内部状态：当前生效的参数与淡变进度。 */
let _state = {
  /** 当前 preset 名（或 null=手动/无） */
  preset: null,
  /** 目标参数（已解析 preset 或手动覆盖） */
  target: { focus: 10, aperture: 0.025, maxblur: 0 },
  /** 当前插值后的参数（每帧写入 uniform） */
  current: { focus: 10, aperture: 0.025, maxblur: 0 },
  /** 淡入/淡出计时器（秒） */
  timer: 0,
  /** 当前阶段："in"=淡入、"hold"=保持峰值、"out"=淡出、"idle"=空闲 */
  phase: 'idle',
  /** 当前 preset 的配置缓存 */
  cfg: null,
};

/** 解析 preset 为目标参数与阶段配置。 */
function _resolvePreset(presetName) {
  const cfg = DOF_PRESETS[presetName];
  if (!cfg) return null;
  return {
    target: {
      focus: cfg.focus ?? 10,
      aperture: cfg.aperture ?? 0.025,
      maxblur: cfg.maxblur ?? 0,
    },
    fadeIn: cfg.fadeIn ?? 0,
    fadeOut: cfg.fadeOut ?? 0,
  };
}

/**
 * 本帧申请 DoF。
 * @param {{
 *   preset?: string,        // 预设名（来自 DOF_PRESETS）
 *   focus?: number,         // 手动焦点距离（米），preset 模式下可选
 *   aperture?: number,      // 手动光圈
 *   maxblur?: number,       // 手动最大模糊
 * } | null} params
 *   - 传 `null` = 取消请求（进入淡出阶段，不等下一帧）
 *   - 传 `{ preset: 'execution' }` = 使用预设
 *   - 传 `{ focus, aperture, maxblur }` = 手动模式（兼容旧调用）
 */
export function requestDof(params) {
  if (!params) {
    // 取消：进入淡出阶段
    if (_state.phase !== 'idle') {
      _state.phase = 'out';
      _state.timer = 0;
    }
    return;
  }

  if (params.preset) {
    const resolved = _resolvePreset(params.preset);
    if (!resolved) {
      console.warn(`[DofManager] 未知 preset: ${params.preset}`);
      return;
    }
    _state.preset = params.preset;
    _state.cfg = resolved;
    _state.target = { ...resolved.target };
    // 手动参数可覆盖 preset
    if (params.focus !== undefined) _state.target.focus = params.focus;
    if (params.aperture !== undefined) _state.target.aperture = params.aperture;
    if (params.maxblur !== undefined) _state.target.maxblur = params.maxblur;

    // 重置淡入
    _state.timer = 0;
    _state.phase = resolved.fadeIn > 0 ? 'in' : 'hold';
  } else {
    // 手动模式：无淡入淡出，直接跳到目标
    _state.preset = null;
    _state.cfg = null;
    _state.target = {
      focus: params.focus ?? 10,
      aperture: params.aperture ?? 0.025,
      maxblur: params.maxblur ?? 0,
    };
    _state.phase = 'hold';
    _state.current = { ..._state.target };
  }
}

/** 显式取消（进入淡出，不等下一帧）。 */
export function cancelDof() {
  if (_state.phase !== 'idle') {
    _state.phase = 'out';
    _state.timer = 0;
    // 淡出目标归零（模糊量归零），避免插值目标仍为峰值导致无法淡出
    _state.target = { ..._state.target, maxblur: 0 };
  }
}

/** 主循环每帧调用：驱动淡入/保持/淡出并写 uniform。 */
export function updateDof(dofPass, dt) {
  if (!dofPass) return;

  const isManual = _state.preset === null;

  if (_state.phase === 'idle') {
    if (dofPass.enabled) setDofEnabled(dofPass, false);
    return;
  }

  // 手动模式：无插值，直接写目标
  if (isManual) {
    if (!dofPass.enabled) setDofEnabled(dofPass, true);
    _state.current = { ..._state.target };
    updateDofParams(dofPass, _state.current);
    return;
  }

  const { fadeIn, fadeOut } = _state.cfg;
  _state.timer += dt;

  // 淡入阶段
  if (_state.phase === 'in') {
    const t = Math.min(_state.timer / fadeIn, 1);
    const eased = 1 - (1 - t) * (1 - t); // easeOutQuad
    _lerpCurrent(eased);
    if (t >= 1) {
      _state.phase = 'hold';
      _state.timer = 0;
    }
  }
  // 保持峰值
  else if (_state.phase === 'hold') {
    _lerpCurrent(1);
    // preset 模式下 hold 无限期，直到 cancelDof() 或新请求
  }
  // 淡出阶段
  else if (_state.phase === 'out') {
    const t = Math.min(_state.timer / fadeOut, 1);
    const eased = 1 - t * t; // easeInQuad
    _lerpCurrent(eased);
    if (t >= 1) {
      _state.phase = 'idle';
      _state.timer = 0;
      _state.preset = null;
      _state.cfg = null;
    }
  }

  // 写 uniform：idle 时关灯，其余开灯
  if (_state.phase === 'idle') {
    if (dofPass.enabled) setDofEnabled(dofPass, false);
  } else {
    if (!dofPass.enabled) setDofEnabled(dofPass, true);
  }
  updateDofParams(dofPass, _state.current);
}

/** 线性插值当前参数向目标。 */
function _lerpCurrent(k) {
  _state.current.focus = THREE_MathUtils_lerp(_state.current.focus, _state.target.focus, k);
  _state.current.aperture = THREE_MathUtils_lerp(_state.current.aperture, _state.target.aperture, k);
  _state.current.maxblur = THREE_MathUtils_lerp(_state.current.maxblur, _state.target.maxblur, k);
}

/** 轻量 lerp（避免引入 three 整包）。 */
function THREE_MathUtils_lerp(a, b, t) {
  return a + (b - a) * t;
}

/** 供测试/重置。 */
export function resetDofForTest() {
  _state = {
    preset: null,
    target: { focus: 10, aperture: 0.025, maxblur: 0 },
    current: { focus: 10, aperture: 0.025, maxblur: 0 },
    timer: 0,
    phase: 'idle',
    cfg: null,
  };
}