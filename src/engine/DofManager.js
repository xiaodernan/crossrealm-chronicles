/**
 * 景深统一管理器（W-C4 切片6 余量续：预设表数据化 + 平滑插值）。
 *
 * 功能：
 *   - 预设驱动：导演仅需 `requestDof({ preset: 'execution' })`，参数来自 `DOF_PRESETS`
 *   - 平滑插值：自动按 `fadeIn`/`fadeOut` 做淡入淡出（0 → 峰值 → 0）
 *   - 兜底关灯：无请求或取消时自动按 `fadeOut` 平滑关灯
 *   - 手动覆盖：仍可直接传 `focus/aperture/maxblur` 绕过预设（兼容旧调用）
 *   - 零 three 依赖，node 可直接 import。
 *
 * 两条约定：
 *   1. `requestDof()` 每帧重入是常态（导演/过场每帧都会声明一次）。同一 preset 且正在
 *      淡入/保持时只刷新可覆盖参数，**不重置 fade** —— 否则 fadeIn 永远走不完。
 *   2. `enabled` 只由本模块写：有请求开灯、淡出结束关灯。外部硬切会抹掉 fadeOut。
 */

import { setDofEnabled, updateDofParams } from './DofPass.js';
import { DOF_PRESETS } from '../content/tuning.js';

export { setDofEnabled };

/** 手动取消（无 preset 记账）时的淡出时长。 */
const MANUAL_FADE_OUT = 0.2;

/** 内部状态：当前生效的参数与淡变进度。 */
let _state = {
  /** 当前 preset 名（或 null=手动/无） */
  preset: null,
  /** 目标参数（已解析 preset 或手动覆盖） */
  target: { focus: 10, aperture: 0.025, maxblur: 0 },
  /** 当前插值后的参数（每帧写入 uniform） */
  current: { focus: 10, aperture: 0.025, maxblur: 0 },
  /** 本次淡变的起点参数（进入 fade 时快照，避免绝对插值造成硬跳） */
  from: { focus: 10, aperture: 0.025, maxblur: 0 },
  /** 淡入/淡出计时器（秒） */
  timer: 0,
  /** 当前阶段："in"=淡入、"hold"=保持峰值、"out"=淡出、"idle"=空闲 */
  phase: 'idle',
  /** 当前 preset 的配置缓存 */
  cfg: null,
  /** 本次淡变时长（秒），0 = 瞬时 */
  fade: 0,
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

/** 把调用方传的可覆盖参数叠到目标上。 */
function _applyOverrides(params) {
  if (params.focus !== undefined) _state.target.focus = params.focus;
  if (params.aperture !== undefined) _state.target.aperture = params.aperture;
  if (params.maxblur !== undefined) _state.target.maxblur = params.maxblur;
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
    cancelDof();
    return;
  }

  if (params.preset) {
    const resolved = _resolvePreset(params.preset);
    if (!resolved) {
      console.warn(`[DofManager] 未知 preset: ${params.preset}`);
      return;
    }

    // 同一 preset 且在淡入/保持中：每帧重入只刷新可覆盖参数，不重启动画
    if (_state.preset === params.preset && (_state.phase === 'in' || _state.phase === 'hold')) {
      _applyOverrides(params);
      return;
    }

    _state.from = { ..._state.current };
    _state.preset = params.preset;
    _state.cfg = resolved;
    _state.target = { ...resolved.target };
    _applyOverrides(params);

    _state.timer = 0;
    _state.fade = Math.max(0, resolved.fadeIn);
    _state.phase = _state.fade > 0 ? 'in' : 'hold';
    if (_state.phase === 'hold') _state.current = { ..._state.target };
  } else {
    // 手动模式：无淡入淡出，直接跳到目标
    _state.preset = null;
    _state.cfg = { fadeIn: 0, fadeOut: MANUAL_FADE_OUT };
    _state.target = {
      focus: params.focus ?? 10,
      aperture: params.aperture ?? 0.025,
      maxblur: params.maxblur ?? 0,
    };
    _state.phase = 'hold';
    _state.fade = 0;
    _state.current = { ..._state.target };
  }
}

/**
 * 显式取消：从当前模糊量按 fadeOut 淡到 0，再由 updateDof 关灯。
 * @param {number} [fadeOutSeconds] 覆盖淡出时长；缺省用本次 preset 的 fadeOut，
 *   手动模式用 MANUAL_FADE_OUT。
 */
export function cancelDof(fadeOutSeconds) {
  if (_state.phase === 'idle' || _state.phase === 'out') return;

  const dur = fadeOutSeconds ?? _state.cfg?.fadeOut ?? MANUAL_FADE_OUT;
  _state.from = { ..._state.current };
  _state.phase = 'out';
  _state.timer = 0;
  _state.fade = Math.max(0, dur);
  // 淡出目标：焦点/光圈留在原处，模糊量归零（= 灯灭）
  _state.target = {
    focus: _state.current.focus,
    aperture: _state.current.aperture,
    maxblur: 0,
  };
}

/** 主循环每帧调用：驱动淡入/保持/淡出并写 uniform。 */
export function updateDof(dofPass, dt) {
  if (!dofPass) return;

  // 漏传 dt 会让 timer 变成 NaN，永远淡不完：非有限值按 0 处理（本帧不推进）
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0;

  if (_state.phase === 'idle') {
    updateDofParams(dofPass, _state.current);
    if (dofPass.enabled) setDofEnabled(dofPass, false);
    return;
  }

  if (_state.phase === 'out') _advanceOut(step);
  else if (_state.phase === 'in') _advanceIn(step);
  else _state.current = { ..._state.target };

  if (_state.phase === 'idle') {
    // 淡出刚结束：先把归零后的参数写进 uniform，再关灯（否则画面停在最后一帧的模糊量）
    updateDofParams(dofPass, _state.current);
    if (dofPass.enabled) setDofEnabled(dofPass, false);
    return;
  }

  if (!dofPass.enabled) setDofEnabled(dofPass, true);
  updateDofParams(dofPass, _state.current);
}

/** 淡入推进：from → target，smoothstep 缓动。 */
function _advanceIn(step) {
  _state.timer += step;
  const t = _state.fade > 0 ? Math.min(_state.timer / _state.fade, 1) : 1;
  _blendFrom(_smooth(t));
  if (t >= 1) {
    _state.phase = 'hold';
    _state.timer = 0;
    _state.current = { ..._state.target };
  }
}

/** 淡出推进：from → target（maxblur 已归零），到达后转 idle。 */
function _advanceOut(step) {
  _state.timer += step;
  const t = _state.fade > 0 ? Math.min(_state.timer / _state.fade, 1) : 1;
  _blendFrom(_smooth(t));
  if (t >= 1) {
    _state.phase = 'idle';
    _state.timer = 0;
    _state.preset = null;
    _state.cfg = null;
    _state.fade = 0;
    _state.current = { ..._state.target };
  }
}

function _smooth(t) {
  return t * t * (3 - 2 * t);
}

/** 从 from 向 target 按 k 插值当前参数。 */
function _blendFrom(k) {
  _state.current.focus = THREE_MathUtils_lerp(_state.from.focus, _state.target.focus, k);
  _state.current.aperture = THREE_MathUtils_lerp(_state.from.aperture, _state.target.aperture, k);
  _state.current.maxblur = THREE_MathUtils_lerp(_state.from.maxblur, _state.target.maxblur, k);
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
    from: { focus: 10, aperture: 0.025, maxblur: 0 },
    timer: 0,
    phase: 'idle',
    cfg: null,
    fade: 0,
  };
}
