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
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const CHANNEL_RE = /^[A-Za-z0-9_-]{1,32}$/;
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

/**
 * 「睡一下」—— 到点或被取消都醒（W-Z7 轮询循环用）。
 * 用一次性 AbortSignal 当计时器：`AbortSignal.timeout` 本身就是按时触发的 abort 源，
 * 不引入任何裸计时器（B39 门禁 / 全源件零自建计时器的口径）。
 * 外部 signal 先醒时内层 timeout 到点后自我触发一次，resolve 幂等，无悬空监听。 */
function sleepWithSignal(ms, external) {
  const msSignal = AbortSignal.timeout(ms);
  return new Promise((resolve) => {
    const done = () => resolve();
    msSignal.addEventListener('abort', done, { once: true });
    if (external) external.addEventListener('abort', done, { once: true });
  });
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

  /**
   * 提交异步顾问问题并轮询至终态（W-Z7 切片B，`POST /api/ai/chat/async` + 轮询 `/api/ai/jobs/{jobId}`）。
   *
   * 与 `askAdvisor` 的差异：**不阻塞在一次长请求上**——先拿 jobId（202），`pollAfterMs` 一拍一拍问，
   * 终态 DONE 才带答案回来。面板「停止」按钮触发 `signal` 时：停止轮询 + 发一个不管的
   * 撤回 POST（`cancelAdvisorJob`），真撤回排队中的任务；已经上游在跑的撤不回（服务端诚实回 already-running）。
   *
   * 幂等：每次提问客户端生成一个 `requestId` 随 body 走——重复/重连的同一次提问被服务端按幂等键指回同一任务。
   * 轮询预算 `ADVISOR_LIMITS.backgroundBudgetMs`：超过即返 TIMEOUT，不让玩家对着一个转了三分钟的点等死。
   * 轮询瞬时失败（断网/超时）容忍 3 次，连续第 3 次直接返 NETWORK——绝不在死网上空转到预算耗尽。
   *
   * 返回值与 `askAdvisor` 同一形状（`{ ok, reason, status, data }`）：
   * DONE → `{ ok:true, reason:'ok', status:200, data:{answer, model, cached, latencyMs} }`；
   * DEAD → 映射成 `{ ok:false, reason:'http', status:503, data:{error:'advisor-unavailable', detail} }`，
   *         面板复用「503 + advisor-unavailable」那一格（与熔断姿态一致，不新造文案键）；
   * CANCELLED → `{ ok:false, reason:'cancelled', status:0, data:null }`。
   */
  async askAdvisorBackground(question, context = {}, { signal } = {}) {
    const q = normalizeAdvisorQuestion(question);
    if (!q) return { ok: false, reason: ADVISOR_REASONS.BLANK, status: 0, data: null };
    const requestId = globalThis.crypto?.randomUUID?.()
      ?? `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const submitted = await this.#jsonRequest('/api/ai/chat/async', {
      method: 'POST',
      body: { question: q, context: normalizeAdvisorContext(context), requestId },
      timeoutMs: ADVISOR_LIMITS.requestTimeoutMs,
      signal,
    });
    if (!submitted?.ok) return submitted;
    const jobId = submitted?.data?.jobId;
    if (typeof jobId !== 'string' || !jobId) {
      return { ok: false, reason: ADVISOR_REASONS.BAD_JSON, status: submitted.status, data: submitted?.data ?? null };
    }
    const pollAfter = Math.max(200, Number(submitted?.data?.pollAfterMs) || 500);
    const deadline = Date.now() + ADVISOR_LIMITS.backgroundBudgetMs;
    let consecutiveMiss = 0;
    while (Date.now() < deadline) {
      if (signal?.aborted) {
        void this.cancelAdvisorJob(jobId);
        return { ok: false, reason: ADVISOR_REASONS.CANCELLED, status: 0, data: null };
      }
      // 一拍一拍问；先睡再问，避免到手 jobId 立刻连打一发
      await sleepWithSignal(pollAfter, signal);
      const view = await this.#jsonRequest(`/api/ai/jobs/${encodeURIComponent(jobId)}`, {
        timeoutMs: ADVISOR_LIMITS.healthTimeoutMs * 2,
        signal,
      });
      if (!view?.ok) {
        if (view?.status === 404) {
          return { ok: false, reason: ADVISOR_REASONS.BAD_JSON, status: 404, data: view?.data ?? null };
        }
        consecutiveMiss += 1;
        if (consecutiveMiss >= 3) {
          return { ok: false, reason: ADVISOR_REASONS.NETWORK, status: 0, data: null };
        }
        continue;
      }
      consecutiveMiss = 0;
      const st = view?.data?.status;
      if (st === 'DONE') {
        return {
          ok: true,
          reason: ADVISOR_REASONS.OK,
          status: 200,
          data: {
            answer: view.data.answer,
            model: view.data.model,
            cached: view.data.cached === true,
            latencyMs: view.data.latencyMs,
          },
        };
      }
      if (st === 'DEAD') {
        return {
          ok: false,
          reason: ADVISOR_REASONS.HTTP,
          status: 503,
          data: { error: 'advisor-unavailable', detail: view.data.reason ?? 'unknown' },
        };
      }
      if (st === 'CANCELLED') {
        return { ok: false, reason: ADVISOR_REASONS.CANCELLED, status: 0, data: null };
      }
      // QUEUED / RUNNING：下一拍
    }
    return { ok: false, reason: ADVISOR_REASONS.TIMEOUT, status: 0, data: null };
  }

  /**
   * 撤回排队中的顾问任务（W-Z7 切片B，`POST /api/ai/jobs/{jobId}/cancel`）。
   * 「停止」按钮触发（停止轮询的同时顺手发），结果不在这条路径上消费——失败静默返回 null，
   * 任务的死活与玩家无关（正在上游跑的撤不回，服务端会诚实回 cancelled:false + already-running）。
   */
  async cancelAdvisorJob(jobId) {
    if (!this._enabled) return null;
    if (typeof jobId !== 'string' || !jobId) return null;
    try {
      const res = await this._fetch(`${this._baseUrl}/api/ai/jobs/${encodeURIComponent(jobId)}/cancel`, {
        method: 'POST',
        signal: requestSignal(5_000, null),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  /** 顾问健康快照（`GET /api/ai/health`）：configured / model / circuit / cache / upstreamCalls */
  async fetchAdvisorHealth({ signal } = {}) {
    return this.#jsonRequest('/api/ai/health', {
      timeoutMs: ADVISOR_LIMITS.healthTimeoutMs,
      signal,
    });
  }

  /**
   * Lore Oracle——召唤 canon 的管家问一记典籍（`POST /api/ai/lore/answer`）。
   * 携带的是“当前最相关的典籍段落”，不是完整提取——节省调用次数与耐心。
   * `limit` 可省略（默认 4），回答里会含 `sources` 数组指向原典段落。
   */
  async askOracle(question, { limit, signal } = {}) {
    const body = limit === undefined ? { question } : { question, limit };
    return this.#jsonRequest('/api/ai/lore/answer', {
      method: 'POST',
      body,
      timeoutMs: ADVISOR_LIMITS.requestTimeoutMs,
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
   * 死信只读摘要（`GET /api/ops/dead-letter`，W-Z8 切片3）。
   * 白名单原样带回（`{available, count, items, reasons直方图}`），不做语义校验；
   * 未启用 / 失败 / 超时 / 非 2xx → null。面向「星轨诊断」可读性：
   * 「高频哪一类失败」是排障只需要的那一格，不带玩家输入。
   */
  async fetchDeadLetterSummary() {
    if (!this._enabled) return null;
    try {
      const res = await this._fetch(`${this._baseUrl}/api/ops/dead-letter`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn('[online] 拉取死信摘要失败（已吞掉）', e?.message ?? e);
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
  /**
   * 在场人数（W-Z25）——`GET /api/presence/{channel}/count`，在场服务（presence-service，W-Z-同游）供的数
   *
   * 返回 `{ channel, count }`；未启用 / 失败 / 超时 / 非 2xx → null（吞掉，不向上抛）。
   * channel 与服务端同一白名单（`^[A-Za-z0-9_-]{1,32}$`），不符直接 null（零外呼）。
   * 这一格是给设置页「在场人数」按钮的——读不到就一句兜底提示，不让孩子们因为没在线而烦恼
   */
  /**
   * SSE 快照与实时帧订阅（W-Z26「星图微光」）——`GET /api/presence/{channel}/stream`，
   * 供 `presenceTracker` 开 EventSource 用；未启用 / 非法频道 → null（零外呼）。
   */
  presenceStreamUrl(channel = 'world') {
    if (!this._enabled) return null;
    if (typeof channel !== 'string' || !CHANNEL_RE.test(channel)) return null;
    return `${this._baseUrl}/api/presence/${channel}/stream`;
  }

  /**
   * 心跳（W-Z26「星图微光」）——`POST /api/presence/{channel}/beat`，body `{id,name,hue,x,z}`。
   * 返回 true/false；未启用 / 非法字段 / 非 202 → false（吞错，不打断游戏）。
   * 字段口径与服务端一致：id/channel 白名单、name 去控制字符裁剪 24、hue ∈ [0,359] 整数、x/z ∈ [-1,1] 有限。
   */
  async postPresenceBeat({ id, name, hue, x, z, channel = 'world' } = {}) {
    if (!this._enabled) return false;
    if (typeof channel !== 'string' || !CHANNEL_RE.test(channel)) return false;
    if (typeof id !== 'string' || !ID_RE.test(id)) return false;
    const rawName = typeof name === 'string' ? name : '';
    const cleanName = [...rawName]
      .map((c) => { const code = c.charCodeAt(0); return code < 0x20 || code === 0x7f ? ' ' : c; })
      .join('')
      .trim()
      .slice(0, 24);
    if (!cleanName) return false;
    const safeHue = Number.isFinite(hue) ? Math.floor(((hue % 360) + 360) % 360) : 0;
    const safeX = Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
    const safeZ = Number.isFinite(z) ? Math.max(-1, Math.min(1, z)) : 0;
    try {
      const res = await this._fetch(`${this._baseUrl}/api/presence/${channel}/beat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, name: cleanName, hue: safeHue, x: safeX, z: safeZ }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return res.status === 202;
    } catch (e) {
      console.warn('[online] 在场心跳失败（已吞掉）', e?.message ?? e);
      return false;
    }
  }

  /** 在场频道白名单导出给 tracker（不暴露实例字段，只给纯函数） */
  static isValidPresenceChannel(channel) {
    return typeof channel === 'string' && CHANNEL_RE.test(channel);
  }

  async fetchPresenceCount(channel = 'world') {
    if (!this._enabled) return null;
    if (typeof channel !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(channel)) return null;
    try {
      const res = await this._fetch(`${this._baseUrl}/api/presence/${channel}/count`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const count = data?.count;
      // 严格要 JSON number：字符串/null 不当合法值回，脏数据直接 null
      if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return null;
      return { channel, count: Math.floor(count) };
    } catch (e) {
      console.warn('[online] 拉取在场人数失败（已吞掉）', e?.message ?? e);
      return null;
    }
  }

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

  /**
   * 拉取炉火报讯台最近几条（W-Z49，`GET /api/notify/recent?limit=N`）。
   *
   * 网关熔断 / 报讯台没开 / 断网 → null（面板隐藏那一块，不假装空台账）。
   * 这一层只做形状筛：`items` 必须是数组；条目里只收 { id, kind, title, ts } 四格，
   * 其余字段（包括 body —— 面板不显示的，少一格传播面）一律不留。
   */
  async fetchNotifyRecents(limit = 3) {
    if (!this._enabled) return null;
    const clamped = Math.max(1, Math.min(10, Math.floor(limit) || 3));
    try {
      const res = await this._fetch(`${this._baseUrl}/api/notify/recent?limit=${clamped}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !Array.isArray(data.items)) return null;
      const items = data.items
        .filter((n) => n && typeof n.id === 'string' && typeof n.title === 'string'
          && typeof n.kind === 'string' && Number.isFinite(n.ts))
        .slice(0, clamped)
        .map((n) => ({
          id: n.id.slice(0, 64),
          kind: n.kind.slice(0, 16),
          title: n.title.slice(0, 120),
          ts: Math.floor(n.ts),
        }));
      return { count: items.length, items };
    } catch (e) {
      console.warn('[online] 拉取报讯失败（已吞掉）', e?.message ?? e);
      return null;
    }
  }
}

/** 全局单例（读当前 window 环境决定是否启用） */
export const onlineServices = new OnlineServices();
