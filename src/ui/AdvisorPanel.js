/**
 * 星轨顾问面板（W-Y2 切片1）—— 把 W-Y1 的 `ai-service` 真正交到玩家手上。
 *
 * ## 这一片守的四条
 *
 * ① **模型回的话是不可信文本**。所有气泡都用 `createElement` + `textContent` 写，
 *    全文件没有一处把回答拼进 `innerHTML`。上游被提示注入、网关被换、返回里带
 *    `<script>` 都只会被当成一段字显示出来。
 * ② **取消是真的取消**。等待期间「停止」按钮 `AbortController.abort()`，
 *    这一路是**异步队列**：提交 → `pollAfterMs` 一拍一拍轮询（计时由 `AbortSignal` 管），
 *    面板本身没有 `setTimeout` / 自建 rAF — 动效全在 CSS。停止时顺带发一个不管的
 *    `POST /api/ai/jobs/{id}/cancel`，真撤回排队中的任务（LLM 已跑起来的撤不回，服务端诚实回 already-running）。
 *    全片没有 `setTimeout` / 自建 rAF —— 动效全在 CSS，计时只由 `AbortSignal.timeout` 管。
 * ③ **失败要分得清**。没开在线服务 / 网关 503 熔断 / 上游超时 / 断网 / 非 JSON /
 *    被取消，是六种不同的玩家动作；`#jsonRequest` 给 `reason`，这里按显式映射表展开，
 *    绝不 `t(\`advisor_error_${reason}\`)` 拼键（拼出来的键静态门禁扫不到）。
 * ④ **关掉面板不等于取消提问**。模型那一问已经付过上游调用，玩家手滑关窗不该白等；
 *    回答回来照样进 `_messages`，下次打开就在那儿。
 *
 * ## 与模态层的关系
 *
 * `OVERLAY_LAYERS` 里登记 `advisor`：开着时吃返回键、挡别的 UI 热键、停玩法
 * （否则玩家在输入框里敲 `j` 会把日志抽屉翻出来，一根输入两个消费者）。
 * **刻意不认领 `nav` 焦点宿主**：这里有文本输入框，↑↓←→ 属于光标移动；
 * `Game.hotkeyBlocked()` 在顾问开着时把导航码一并挡下，Router 便既不
 * `preventDefault` 也不派发。焦点本身由 `FocusNav.focusElement()` 在开/关时
 * 交给输入框 / FAB，不在本文件里另起一套焦点账。Escape 归级联，不挂 keydown。
 */

import { t, applyTranslations } from '../engine/i18n.js';
import { attachDraggable } from './DraggablePanel.js';
import { focusElement, focusFirstItem } from './FocusNav.js';
import { ADVISOR_REASONS, ADVISOR_LIMITS, normalizeAdvisorQuestion } from '../content/advisor.js';
import { presenceTracker } from '../online/presenceTracker.js';
import { notifyTracker } from '../online/notifyTracker.js';

/** 状态 → 文案键。显式表：`t(\`advisor_status_${s}\`)` 是运行时拼键，静态门禁看不见 */
const STATUS_KEYS = Object.freeze({
  checking: 'advisor_status_checking',
  ready: 'advisor_status_ready',
  offline: 'advisor_status_offline',
  degraded: 'advisor_status_degraded',
});

/**
 * 失败原因 → 文案键。键名一律取自 `ADVISOR_REASONS`，不手抄字符串 ——
 * 曾经两边写成 `bad_json` / `bad-json`，非 JSON 的 503 静默落进"连不上网关"那一句。
 * `ADVISOR_ERROR_REASONS` 全覆盖由 `tests/advisor.test.js` 钉住（新增原因忘了给文案会红）。
 */
export const ERROR_KEYS = Object.freeze({
  [ADVISOR_REASONS.DISABLED]: 'advisor_error_disabled',
  [ADVISOR_REASONS.TIMEOUT]: 'advisor_error_timeout',
  [ADVISOR_REASONS.NETWORK]: 'advisor_error_network',
  [ADVISOR_REASONS.BAD_JSON]: 'advisor_error_bad_json',
  [ADVISOR_REASONS.BLANK]: 'advisor_error_blank',
  [ADVISOR_REASONS.CANCELLED]: 'advisor_error_cancelled',
  [ADVISOR_REASONS.HTTP]: 'advisor_error_http_fmt',
  [ADVISOR_REASONS.BUSY]: 'advisor_error_busy',
});

const STATUS_CLASSES = ['is-checking', 'is-ready', 'is-offline', 'is-degraded'];

export class AdvisorPanel {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.pending = false;
    this._disposed = false;
    this._controller = null;
    this._healthChecked = false;
    this._status = 'checking';
    this._lastMeta = null;
    this._cacheStats = { hits: 0, total: 0 };
    this._upstreamStats = { hits: 0, total: 0 };
    this._messages = [];


    const doc = typeof document !== 'undefined' ? document : null;
    this.presenceEl = doc?.getElementById('advisor-presence') ?? null;
    this.presenceText = doc?.getElementById('advisor-presence-text') ?? null;
    this._presenceUnsub = null;
    this.notifyEl = doc?.getElementById('advisor-notify') ?? null;
    this.notifyList = doc?.getElementById('advisor-notify-list') ?? null;
    this.notifyDot = doc?.getElementById('advisor-notify-dot') ?? null;
    this.fabDot = doc?.getElementById('fab-notify-dot') ?? null;
    this._notifyUnsub = null;
    this._notifyState = null;

    this.el = doc?.getElementById('advisor-panel') ?? null;
    this.fab = doc?.getElementById('advisor-fab') ?? null;
    if (!this.el) return;

    const q = (sel) => this.el.querySelector(sel);
    this.transcript = q('#advisor-transcript');
    this.greeting = q('#advisor-greeting');
    this.typing = q('#advisor-typing');
    this.form = q('#advisor-form');
    this.input = q('#advisor-input');
    this.count = q('#advisor-count');
    this.send = q('#advisor-send');
    this.stop = q('#advisor-stop');
    this.closeBtn = q('#advisor-close');
    this.loreToggle = q('#advisor-lore-toggle');
    this._loreMode = false;
    this.statusEl = q('#advisor-status');
    this.statusText = q('#advisor-status-text');
    this.metaEl = q('#advisor-meta');
    this.chips = this.el.querySelectorAll('[data-advisor-prompt]');

    // maxlength 从内容层那一份上限来，不在 HTML 里再抄一个 400
    this.input?.setAttribute?.('maxlength', String(ADVISOR_LIMITS.questionMax));

    this._bind();
    this.refreshLabels();
  }

  _bind() {
    this._onFab = () => this.toggle();
    this._onClose = () => this.hide();
    this._onStop = () => this.cancel();
    this._onSubmit = (e) => {
      e?.preventDefault?.();
      this._ask(normalizeAdvisorQuestion(this.input?.value ?? ''));
    };
    this._onInput = () => this._renderCount();
    this._onLoreToggle = () => {
      this._loreMode = !this._loreMode;
      this.loreToggle?.setAttribute?.('aria-pressed', this._loreMode ? 'true' : 'false');
      this.loreToggle?.classList.toggle('is-on', this._loreMode);
      // 切回对话态时，状态条回到之前维护的源（在线伙伴/离线/降级）
      if (!this._loreMode) this._healthChecked = false;
    };

    this.fab?.addEventListener?.('click', this._onFab);
    this.closeBtn?.addEventListener?.('click', this._onClose);
    this.stop?.addEventListener?.('click', this._onStop);
    this.loreToggle?.addEventListener?.('click', this._onLoreToggle);
    this.form?.addEventListener?.('submit', this._onSubmit);
    this.input?.addEventListener?.('input', this._onInput);

    this._chipHandlers = [];
    for (const chip of this.chips) {
      const key = chip.getAttribute?.('data-advisor-prompt');
      // 芯片上那句话就是发出去的问题：不另存一份 `question`，玩家读到的与日志里的一致
      const handler = () => this._ask(t(key));
      this._chipHandlers.push([chip, handler]);
      chip.addEventListener?.('click', handler);
    }

    // 与常驻指引同一条可拖动路径（位置写 localStorage，换语言时 title 由它自己重算）
    attachDraggable(this.el, { storageKey: 'advisor', handle: '.advisor-head' });
    // 在场微光：在线开着才进订阅，count=0/未就绪时徽章不占位
    this._presenceUnsub = presenceTracker.subscribe((count, ready) => this._renderPresence(count, ready));
    // 炉火报讯台：订阅当前快照；面板打开时 refresh() 才拉一次（不空跑）
    this._notifyUnsub = notifyTracker.subscribe((items, ready) => {
      this._notifyState = [items, ready];
      this._renderNotify();
      this._renderFabDot();
    });

  }

  toggle() {
    return this.open ? this.hide() : this.show();
  }

  show() {
    if (!this.el || this.open || this._disposed) return false;
    this.open = true;
    this.el.classList.remove('hidden');
    this.fab?.setAttribute?.('aria-expanded', 'true');
    this.game?.overlayStack?.open?.('advisor');
    // 开面板时落在输入框（preferred 落点）——否则玩家第一眼要先 Tab 到输入框才能打字。
    // 落焦交给 FocusNav 那一个出口：全仓只有许可文件碰原生焦点 API（门禁钉住）。
    focusFirstItem(this.el, undefined, { preferred: '#advisor-input' });
    this._renderCount();
    void this._checkHealth();
    // 报讯台：打开面板时拉一次最近三条（拉完即把水位线推到最新——红点随即熄灭）
    void notifyTracker.refresh().then((ok) => { if (ok) notifyTracker.markSeen(); this._renderFabDot(); });
    return true;
  }

  hide() {
    if (!this.el || !this.open) return false;
    this.open = false;
    this.el.classList.add('hidden');
    this.fab?.setAttribute?.('aria-expanded', 'false');
    this.game?.overlayStack?.close?.('advisor');
    focusElement(this.fab);
    return true;
  }

  /** 停止按钮：真 abort，不假装。回答若已在路上，回来的是 reason='cancelled' */
  cancel() {
    if (!this.pending || !this._controller) return false;
    this._controller.abort();
    return true;
  }

  /** 换语言：静态格由 `applyTranslations` 走查，下面这些是 JS 现算的 */
  refreshLabels() {
    if (!this.el) return;
    applyTranslations(this.el);
    this.input?.setAttribute?.('placeholder', t('advisor_input_placeholder'));
    this._renderStatus();
    this._renderCount();
    this._renderMeta();
    this._renderNotify();
    // 错误气泡是按 key 现展开的，得跟着换语言；模型回答与玩家原句保持原样（那是内容，不是界面文字）
    for (const msg of this._messages) {
      if (msg.key) msg.el.textContent = msg.key === 'advisor_error_http_fmt'
        ? t(msg.key, msg.params)
        : t(msg.key);
    }
  }

  _setStatus(status) {
    this._status = STATUS_KEYS[status] ? status : 'offline';
    this._renderStatus();
  }

  _renderStatus() {
    if (!this.statusEl) return;
    for (const cls of STATUS_CLASSES) this.statusEl.classList.remove(cls);
    this.statusEl.classList.add(`is-${this._status}`);
    if (this.statusText) this.statusText.textContent = t(STATUS_KEYS[this._status]);
  }

  _renderCount() {
    if (!this.count || !this.input) return;
    const n = String(this.input.value ?? '').length;
    const max = ADVISOR_LIMITS.questionMax;
    this.count.textContent = t('advisor_char_count_fmt', { n, max });
    this.count.classList.toggle('is-near', n >= max * 0.9);
    if (this.send) this.send.disabled = this.pending || n === 0;
  }

  _renderMeta() {
    if (!this.metaEl) return;
    this.metaEl.textContent = this._lastMeta ?? '';
  }

  /**
   * 上下文只放**标量**、且由 `normalizeAdvisorContext` 白名单化。
   * 不把 game / player / THREE 资源塞进请求体 —— 上下文是会被拼进提示词的数据。
   */
  _context() {
    const season = this.game?.seasons?.getState?.();
    const trial = this.game?.trial?.getState?.();
    return {
      season: season?.id ?? '',
      season_day: season?.dayInCycle ?? '',
      trial_state: trial?.state ?? '',
      trial_layer: trial?.state === 'running' ? trial?.layer : '',
      chapter: this.game?.quests?.chapter ?? '',
    };
  }

  /** 开面板时探一次健康；不每开一次都打网关，也不在离线时反复重试 */
  async _checkHealth() {
    if (this._healthChecked || this._disposed) return;
    this._healthChecked = true;
    this._setStatus('checking');
    const res = await this.game?.onlineServices?.fetchAdvisorHealth?.();
    if (this._disposed) return;
    if (!res?.ok || res.data?.configured === false) {
      this._setStatus('offline');
      return;
    }
    const circuit = String(res.data?.circuit ?? '');
    this._setStatus(circuit === 'OPEN' || circuit === 'HALF_OPEN' ? 'degraded' : 'ready');
  }

  _ask(question) {
    if (this._disposed || this.pending) return false;
    const q = normalizeAdvisorQuestion(question);
    if (!q) {
      this._appendMessage('error', t(ERROR_KEYS[ADVISOR_REASONS.BLANK]), { key: ERROR_KEYS[ADVISOR_REASONS.BLANK] });
      return false;
    }
    if (this.input) this.input.value = '';
    this.greeting?.classList.add('hidden');
    this._appendMessage('user', q);
    void this._run(q);
    return true;
  }

  async _run(question) {
    this._controller = new AbortController();
    this._setPending(true);
    let res;
    try {
      if (this._loreMode) {
        // W-Z82 Lore Oracle：问典籍时绕过普通提示词，让服务端 BM25 选出最相关的原典段落
        // 与带标号的 system prompt 跑 LLM，回答只用提取语料、并把出处以 inline bracket 形式写入。
        res = await this.game?.onlineServices?.askOracle?.(question, {
          signal: this._controller.signal,
        });
      } else {
        res = await this.game?.onlineServices?.askAdvisorBackground?.(question, this._context(), {
          signal: this._controller.signal,
        });
      }
    } catch (e) {
      // 客户端这一层已经吞错；真漏出来也不能把面板留在「正在观星」的永久态
      console.warn('[advisor] 请求出口抛了（已兜住）', e?.message ?? e);
      res = { ok: false, reason: 'network', status: 0, data: null };
    }
    this._controller = null;
    if (this._disposed) return;
    this._setPending(false);
    this._handleResult(res);
  }

  _setPending(flag) {
    this.pending = !!flag;
    this.typing?.classList.toggle('hidden', !this.pending);
    this.send?.classList.toggle('hidden', this.pending);
    this.stop?.classList.toggle('hidden', !this.pending);
    for (const chip of this.chips) chip.disabled = this.pending;
    this._renderCount();
  }

  _handleResult(res) {
    const data = res?.data ?? {};
    if (res?.ok && typeof data.answer === 'string' && data.answer.trim()) {
      const model = typeof data.model === 'string' ? data.model : '—';
      const ms = Number.isFinite(data.latencyMs) ? Math.max(0, Math.round(data.latencyMs)) : 0;
      const upstreamCached = data.upstreamCached === true;
      this._cacheStats.total += 1;
      if (data.cached === true) this._cacheStats.hits += 1;
      // 本地摘要缓存命中 = 根本没打上游，这一问不进上游统计（也不该声称命中上游缓存）。
      if (data.cached !== true) {
        this._upstreamStats.total += 1;
        if (upstreamCached) this._upstreamStats.hits += 1;
      }
      let meta = t('advisor_meta_fmt', { model, ms }) + ' · ' + t('advisor_meta_cached_fmt', this._cacheStats);
      // 上游 prompt-cache 命中 = 这一问复用了上游稳定的前缀，token 利用率更高（见 W-Z 缓存修复）。
      // 只在真打过上游之后才显示，离线/纯本地缓存命中时不凑数。
      if (this._upstreamStats.total > 0) {
        meta += ' · ' + t('advisor_meta_upstream_fmt', this._upstreamStats);
      }
      this._lastMeta = meta;
      this._renderMeta();
      this._appendMessage('advisor', data.answer, { cached: data.cached === true, upstreamCached });
      if (this._status === 'offline') this._setStatus('ready');
      return;
    }

    const reason = res?.reason ?? ADVISOR_REASONS.NETWORK;
    // data 可能是 null（网关返回纯文本错误页时 json() 抛过）；写 data.error 会在
    // 一次普通的 500 上把整个失败分支炸掉，玩家连"出了什么事"都看不到。
    if (reason === ADVISOR_REASONS.HTTP && (res.status === 503 || data?.error === 'advisor-unavailable')) {
      this._appendMessage('error', t('advisor_error_unavailable'), { key: 'advisor_error_unavailable' });
      this._setStatus('degraded');
    } else if (reason === ADVISOR_REASONS.HTTP) {
      this._appendMessage('error', t(ERROR_KEYS[ADVISOR_REASONS.HTTP], { status: res.status }), {
        key: ERROR_KEYS[ADVISOR_REASONS.HTTP], params: { status: res.status },
      });
      this._setStatus('degraded');
    } else if (reason === ADVISOR_REASONS.BUSY) {
      // 队列满是「服务活着但这一刻接不下」——降级而不是离线，别把健康探针的结论推翻。
      this._appendMessage('error', t(ERROR_KEYS[ADVISOR_REASONS.BUSY]), {
        key: ERROR_KEYS[ADVISOR_REASONS.BUSY],
      });
      this._setStatus('degraded');
    } else {
      const key = ERROR_KEYS[reason] ?? ERROR_KEYS.network;
      this._appendMessage('error', t(key), { key });
      if (reason !== ADVISOR_REASONS.CANCELLED) this._setStatus('offline');
    }
    this._renderMeta();
  }

  /** 唯一的写气泡出口：模型文本只经 `textContent`，并给 DOM 长度封顶 */
  _appendMessage(role, text, extra = {}) {
    if (!this.transcript || typeof document === 'undefined') return null;
    const box = document.createElement('div');
    box.className = `advisor-msg is-${role}`;
    box.setAttribute('data-advisor-role', role);
    box.textContent = text;

    if (role === 'advisor') {
      const meta = document.createElement('span');
      meta.className = 'advisor-msg-meta';
      let added = false;
      // 命中上游 prompt-cache：气泡加一道金色微光（CSS 动画），与 token 高效复用呼应。
      if (extra.upstreamCached) box.classList.add('is-upstream-hit');
      // 上游 prompt-cache 命中（token 高效复用）优先用金色角标，与本地摘要缓存的青色角标区分开。
      if (extra.upstreamCached) {
        const up = document.createElement('span');
        up.className = 'is-upstream-cached';
        up.textContent = t('advisor_cached_upstream');
        meta.appendChild(up);
        added = true;
      }
      if (extra.cached) {
        const badge = document.createElement('span');
        badge.className = 'is-cached';
        badge.textContent = t('advisor_cached');
        meta.appendChild(badge);
        added = true;
      }
      if (added) box.appendChild(meta);
    }

    this.transcript.appendChild(box);
    this._messages.push({ el: box, key: extra.key ?? null, params: extra.params ?? null });
    while (this._messages.length > ADVISOR_LIMITS.historyMaxMessages) {
      const old = this._messages.shift();
      if (typeof old.el.remove === 'function') old.el.remove();
      else old.el.detach?.();
    }
    this.transcript.scrollTop = this.transcript.scrollHeight;
    return box;
  }

  /** 在场微光徽章：ready 或 count>0 才现身；文本走 textContent + settings_online_presence_fmt（复用同一份文案键） */
  _renderPresence(count, ready) {
    if (!this.presenceEl || !this.presenceText) return;
    if (!ready && (!count || count <= 0)) {
      this.presenceEl.classList.add('hidden');
      return;
    }
    this.presenceText.textContent = t('settings_online_presence_fmt', { count });
    this.presenceEl.classList.remove('hidden');
  }

  /** 被 kind 白名单罩住的文案键：kind 来自后端，非法值直接回退到 system（绝不把变量塞进反引号当键） */
  static notifyKindKey(kind) {
    const keys = {
      achievement: 'advisor_notify_kind_achievement',
      season: 'advisor_notify_kind_season',
      world: 'advisor_notify_kind_world',
      system: 'advisor_notify_kind_system',
    };
    return keys[kind] ?? keys.system;
  }

  /** 炉火报讯台：ready 且至少一条才现身；条目全程 textContent 写（后端是不可信文本） */
  _renderNotify() {
    if (!this.notifyEl || !this.notifyList) return;
    const [items, ready] = this._notifyState ?? [[], false];
    if (!ready || !Array.isArray(items) || items.length === 0) {
      this.notifyEl.classList.add('hidden');
      if (this.notifyDot) this.notifyDot.classList.add('hidden');
      return;
    }
    // 重建列表：createElement + textContent，没有一处 innerHTML
    while (this.notifyList.firstChild) this.notifyList.removeChild(this.notifyList.firstChild);
    for (const item of items) {
      const li = document.createElement('li');
      li.className = 'advisor-notify-item';
      const chip = document.createElement('span');
      chip.className = `advisor-notify-kind is-${typeof item.kind === 'string' && /^[a-z]+$/.test(item.kind) ? item.kind : 'system'}`;
      chip.textContent = t(AdvisorPanel.notifyKindKey(item.kind));
      const text = document.createElement('span');
      text.className = 'advisor-notify-item-text';
      text.textContent = typeof item.title === 'string' ? item.title : '';
      li.appendChild(chip);
      li.appendChild(text);
      this.notifyList.appendChild(li);
    }
    if (this.notifyDot) {
      this.notifyDot.classList.toggle('hidden', notifyTracker.unreadCount() <= 0);
    }
    this.notifyEl.classList.remove('hidden');
  }

  /** FAB 上的金点：ready 且有未读才亮（aria-hidden，不打断读屏）；打开面板后即熄灭 */
  _renderFabDot() {
    if (!this.fabDot) return;
    const [items, ready] = this._notifyState ?? [[], false];
    const show = !!ready && items.length > 0 && notifyTracker.unreadCount() > 0;
    this.fabDot.classList.toggle('hidden', !show);
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._controller?.abort();
    this._controller = null;
    const off = (el, type, fn) => {
      if (typeof el?.removeEventListener === 'function') el.removeEventListener(type, fn);
    };
    off(this.fab, 'click', this._onFab);
    off(this.closeBtn, 'click', this._onClose);
    off(this.stop, 'click', this._onStop);
    off(this.form, 'submit', this._onSubmit);
    off(this.input, 'input', this._onInput);
    for (const [chip, handler] of this._chipHandlers ?? []) off(chip, 'click', handler);
    this._presenceUnsub?.();
    this._presenceUnsub = null;
    this._notifyUnsub?.();
    this._notifyUnsub = null;
    if (this.open) this.game?.overlayStack?.close?.('advisor');
    this.open = false;
    this._messages = [];
    this.el?.classList.add('hidden');
    this.game = null;
  }
}
