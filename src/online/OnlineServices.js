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

import {
  ADVISOR_LIMITS, ADVISOR_REASONS, normalizeAdvisorQuestion, normalizeAdvisorContext,
} from '../content/advisor.js';

const TIMEOUT_MS = 1500;
const LS_FLAG = 'crossrealm_online';
const LS_BASE = 'crossrealm_online_base_url';

/**
 * 超时 + 外部取消合成一个信号（W-Y2 切片1）。
 *
 * `AbortSignal.any` 在较老的浏览器里没有；缺了就退化成「只有超时、没有取消」，
 * 而不是让整个请求抛 TypeError。取消是锦上添花，超时是底线。
 */
function requestSignal(timeoutMs, external) {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!external) return timeout;
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([timeout, external]);
  return timeout;
}

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
   * 提交一条位面试炼成绩（W-F3 切片6，`POST /api/trials/runs`）。
   *
   * 与 `submitRun` 是**两条路**：Boss 榜按用时排，试炼榜按分数排 —— "更好"的方向相反，
   * 合并在同一张表里就只能靠排序字段猜。早先试炼借 `submitRun` 把 `trial-layer-N`
   * 冒充 `bossId` 塞进 Boss 榜，那让服务端多出五个不存在的 Boss，而两张榜仍然分不开。
   */
  submitTrialRun(run) {
    return this.#post('/api/trials/runs', run);
  }

  /**
   * 拉取位面试炼榜（W-F3 切片6，`GET /api/trials/leaderboard`）。
   *
   * `seasonId` 省略 = 跨季总榜。返回 `{ items, count, season, maxLimit }`；
   * 未启用 / 失败 / 超时 → null（这一层不做语义校验，与 `fetchActiveSeason` 同一条边界）。
   */
  async fetchTrialLeaderboard(seasonId = '', limit = 10) {
    if (!this._enabled) return null;
    const qs = new URLSearchParams();
    if (seasonId) qs.set('season', seasonId);
    qs.set('limit', String(limit));
    try {
      const res = await this._fetch(`${this._baseUrl}/api/trials/leaderboard?${qs}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn('[online] 拉取试炼榜失败（已吞掉）', e?.message ?? e);
      return null;
    }
  }

  /**
   * 顾问链路的统一请求口（W-Y2 切片1）。
   *
   * 与 `#post` 的差别是**它不把失败压成一个 false**：面板要分清「在线服务没开」、
   * 「网关 503 熔断中」、「上游超时」和「模型答了」，四种的玩家可读动作完全不同。
   * 返回 `{ ok, reason, status, data }`；`reason` 只取这份枚举，UI 的文案表照它展开。
   * 依旧吞掉所有异常 —— 网络不好绝不打断本地游戏，只是把状态说清楚。
   */
  async #jsonRequest(path, { method = 'GET', body, timeoutMs = TIMEOUT_MS, signal } = {}) {
    if (!this._enabled) return { ok: false, reason: ADVISOR_REASONS.DISABLED, status: 0, data: null };
    try {
      const init = {
        method,
        signal: requestSignal(timeoutMs, signal),
      };
      if (body !== undefined) {
        init.headers = { 'content-type': 'application/json' };
        init.body = JSON.stringify(body);
      }
      const res = await this._fetch(this._baseUrl + path, init);
      let data = null;
      try {
        data = await res.json();
      } catch {
        /* 非 JSON（网关的纯文本 503 等）：留给下面的 status 分支说清楚 */
      }
      // 429 是服务端**主动**说的「队列/限流满了，等一下」；把它和 5xx 混成一句
      // 「连不上网关」会让玩家去检查一个好端端的网关（W-Y4 背压的客户端这一半）。
      if (!res.ok) return {
        ok: false,
        reason: res.status === 429 ? ADVISOR_REASONS.BUSY : ADVISOR_REASONS.HTTP,
        status: res.status,
        data,
      };
      if (!data || typeof data !== 'object') {
        return { ok: false, reason: ADVISOR_REASONS.BAD_JSON, status: res.status, data: null };
      }
      return { ok: true, reason: ADVISOR_REASONS.OK, status: res.status, data };
    } catch (e) {
      if (signal?.aborted) return { ok: false, reason: ADVISOR_REASONS.CANCELLED, status: 0, data: null };
      const name = e?.name ?? '';
      const reason = name === 'TimeoutError' || name === 'AbortError'
        ? ADVISOR_REASONS.TIMEOUT : ADVISOR_REASONS.NETWORK;
      console.warn('[online] 顾问请求失败（已吞掉）', path, reason, e?.message ?? e);
      return { ok: false, reason, status: 0, data: null };
    }
  }

  /**
   * 向星轨顾问问一句（W-Y2 切片1，`POST /api/ai/chat`）。
   *
   * 问题与上下文在这里按内容层的上限收敛一次：**发出去的那一份**与面板显示的
   * 字符计数是同一个字符串，否则玩家看到 380/400，服务端却按 412 字拒了。
   * `signal` 是面板「停止」按钮的 AbortController，取消是真取消（fetch 会断）。
   */
  async askAdvisor(question, context = {}, { signal } = {}) {
    const q = normalizeAdvisorQuestion(question);
    if (!q) return { ok: false, reason: ADVISOR_REASONS.BLANK, status: 0, data: null };
    return this.#jsonRequest('/api/ai/chat', {
      method: 'POST',
      body: { question: q, context: normalizeAdvisorContext(context) },
      timeoutMs: ADVISOR_LIMITS.requestTimeoutMs,
      signal,
    });
  }

  /** 顾问健康快照（`GET /api/ai/health`）：configured / model / circuit / cache / upstreamCalls */
  async fetchAdvisorHealth({ signal } = {}) {
    return this.#jsonRequest('/api/ai/health', {
      timeoutMs: ADVISOR_LIMITS.healthTimeoutMs,
      signal,
    });
  }

  /**
   * 回声灯的一句暗示（W-X22 收编版，`POST /api/ai/echo-hint`）。
   * 与顾问共用同一条网关路径、同一份熔断与缓存，只是人格提示不同。
   */
  async fetchEchoHint({ franchise, title, desc = '' }, { signal } = {}) {
    return this.#jsonRequest('/api/ai/echo-hint', {
      method: 'POST',
      body: { franchise, title, desc },
      timeoutMs: ADVISOR_LIMITS.requestTimeoutMs,
      signal,
    });
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
   * 拉取窗口频次摘要（W-X15，`GET /api/telemetry/summary`）。
   *
   * 返回原始 JSON（`{ windowSize, distinctTypes, topN, byType:[{type,count}...] }`）。
   * 未启用 / 失败 / 超时 → null。**不做语义校验** — 与 fetchActiveSeason 同一条边界：
   * 这一层只负责"把服务端说的话原样带回来"，够不够格画出来由渲染层决定。
   */
  async fetchTelemetrySummary(topN = 5) {
    if (!this._enabled) return null;
    const qs = new URLSearchParams();
    qs.set('topN', String(topN));
    try {
      const res = await this._fetch(`${this._baseUrl}/api/telemetry/summary?${qs}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn('[online] 拉取遥测摘要失败（已吞掉）', e?.message ?? e);
      return null;
    }
  }

  /**
   * 拉取运维派生（W-Z8，`GET /api/ops/advisor`）。
   *
   * 返回原始 JSON（`{ health: {...}, jobs: {...} }`，字段见 game-service 的 OpsController）。
   * 未启用 / 失败 / 超时 / 非 2xx → null。**不做语义校验** — 与 fetchTelemetrySummary 同一条边界。
   * 这一路是**运维视图不是玩家路径**：渲染层（设置页「星轨诊断」）只允许读这一格来画一句话，
   * 不得回写任何东西，也不得把内容拼进 innerHTML。
   */
  async fetchOpsAdvisor() {
    if (!this._enabled) return null;
    try {
      const res = await this._fetch(`${this._baseUrl}/api/ops/advisor`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn('[online] 拉取顾问派生失败（已吞掉）', e?.message ?? e);
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
