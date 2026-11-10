/**
 * 在线伙伴服务（W-X2，可选）—— 对接 `server/` 里的 Spring Cloud 伙伴（网关 → 排行榜 / 遥测）。
 *
 * 默认**完全关闭**：不发任何网络请求。开启方式（任意一种）：
 *   - `localStorage['crossrealm_online'] = '1'`
 *   - 网址参数 `?online=1`
 *   - `window.__CROSSREALM_ONLINE__ = true`
 * 网关地址：`localStorage['crossrealm_online_base_url']` 或同源 `window.location.origin`；
 * 本地联调默认 `http://localhost:8080`（见 `server/README.md`）。
 *
 * 设计约束：
 * - 游戏离线可玩、无开关**零网络行为**（默认关闭）；
 * - 所有方法都吞掉自身错误（只留 `console.warn`），网络不好绝不打断本地游戏；
 * - 请求带超时（`AbortSignal.timeout`，不许引入 setTimeout —— 计时门禁 B39），不会 hang 住调用方；
 * - Node 下可注入 `fetchImpl`（单测用）。
 */

const TIMEOUT_MS = 1500;
const LS_FLAG = 'crossrealm_online';
const LS_BASE = 'crossrealm_online_base_url';

export class OnlineServices {
  constructor({ baseUrl, fetchImpl, enabled } = {}) {
    this._baseUrl = (baseUrl ?? OnlineServices.resolveBaseUrl()).replace(/\/+$/, '');
    this._fetch = fetchImpl ?? ((...args) => globalThis.fetch(...args));
    this._enabled = enabled ?? OnlineServices.resolveEnabled();
  }

  static resolveBaseUrl() {
    try {
      const stored = globalThis.localStorage?.getItem(LS_BASE);
      if (stored) return stored;
    } catch {
      /* localStorage 不可用（隐私模式等）—— 继续向下走 */
    }
    if (typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null') {
      return window.location.origin;
    }
    return 'http://localhost:8080';
  }

  static resolveEnabled() {
    try {
      if (globalThis.localStorage?.getItem(LS_FLAG) === '1') return true;
    } catch {
      /* 同上 */
    }
    if (typeof window !== 'undefined') {
      if (window.__CROSSREALM_ONLINE__ === true) return true;
      try {
        const params = new URLSearchParams(window.location?.search ?? '');
        if (params.get('online') === '1') return true;
      } catch {
        /* URLSearchParams 失败：保持关闭 */
      }
    }
    return false;
  }

  /** 当前是否启用（默认 false）—— 见文件头 */
  enabled() {
    return this._enabled;
  }

  /**
   * 运行时翻转启用状态（W-X6 设置页开关专用）。
   * 只翻运行时单例；持久化由调用方负责（面板直接写 localStorage）。
   * 不经过 SettingsStore——在线服务不是"画面偏好"，而是一项独立授权。
   */
  setEnabled(flag) {
    this._enabled = !!flag;
  }

  async #post(path, body) {
    if (!this._enabled) return false;
    try {
      const res = await this._fetch(this._baseUrl + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        console.warn('[online] POST', path, '→ HTTP', res.status);
        return false;
      }
      return true;
    } catch (e) {
      console.warn('[online] POST', path, '失败（已吞掉，不影响本地游戏）', e?.message ?? e);
      return false;
    }
  }

  /** 上报一条玩家遥测事件（type 由调用方约定，detail 自由文本如 bossId） */
  postTelemetry(type, detail = '') {
    return this.#post('/api/telemetry/events', { type, detail });
  }

  /** 提交一条通关记录到排行榜（默认关闭，玩家主动开启后由调用方决定何时调用） */
  submitRun(record) {
    return this.#post('/api/leaderboard', record);
  }

  /**
   * 探活：GET /api/version。
   * 成功返回 `{ service, version, javaVersion, note }`；离线 / 未启用 / 超时 / 非 2xx → null。
   * 不打遥测、不写模块外任何东西 — 只是问一句"在线服务还活着吗"。
   */
  async ping() {
    if (!this._enabled) return null;
    try {
      const res = await this._fetch(`${this._baseUrl}/api/version`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn('[online] ping 失败（已吞掉）', e?.message ?? e);
      return null;
    }
  }

  /** 拉取排行榜；失败返回 null */
  async fetchLeaderboard(limit = 10) {
    if (!this._enabled) return null;
    try {
      const res = await this._fetch(`${this._baseUrl}/api/leaderboard?limit=${limit}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn('[online] 拉取排行榜失败（已吞掉）', e?.message ?? e);
      return null;
    }
  }

  /**
   * 拉取当前赛季（W-F2，`GET /api/seasons/active`）。
   *
   * 返回原始 JSON（`{ id, name, tagline, modifierIds, soulsBonusPct, dayInCycle, daysRemaining }`），
   * 失败/未启用/超时 → null。**不做语义校验**：id 认不认识由 `SeasonSystem` 判 ——
   * 这一层的职责只是"把服务端说的话原样带回来"，校验放在知道名册的那一层。
   */
  async fetchActiveSeason() {
    if (!this._enabled) return null;
    try {
      const res = await this._fetch(`${this._baseUrl}/api/seasons/active`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn('[online] 拉取赛季失败（已吞掉）', e?.message ?? e);
      return null;
    }
  }
}

/** 全局单例（读当前 window 环境决定是否启用） */
export const onlineServices = new OnlineServices();
