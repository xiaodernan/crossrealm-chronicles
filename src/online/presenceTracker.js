/**
 * 在场微光 —— 页面级共享的 SSE 订阅与人数快照（W-Z26「星图微光」）。
 *
 * ## 设计
 * Game 启动时 `presenceTracker.start()` 一次；UI（AdvisorPanel 的在场徽章）各自 `subscribe()`。
 * SSE 走原生 `EventSource`（自动重连）；B39 不自建 rAF / 计时器——全片只有 AbortSignal 管超时。
 * 未启用在线服务 / `typeof EventSource !== 'function'`（Node / CSP）→ 永不建联，UI 自然隐藏。
 *
 * ## 数据
 * 快照事件 `present`（SSE 事件名）逐个报出当前频道新鲜游侠（id+hue+x+z）；
 * `snapshot-end` 表示初始名单齐了。计数 = Map 尺寸（同一 id 幂等覆盖）。
 * 服务器断连后 EventSource 自动重连，新连接先快照重放——这一点由服务端保证。
 */
import { onlineServices } from './OnlineServices.js';

const LS_ID = 'crossrealm_presence_id';
export const NORMALIZED_WORLD_EXTENT = 900; // 心跳坐标的归一化口径（与 PresenceBeat 同一常数）
export const PRESENCE_CHANNEL = 'world';

/** 本浏览器实例的持久游侠档案（id 白名单约束后存 localStorage；随机 UUID 防撞） */
export function resolvePresenceId() {
  try {
    const stored = globalThis.localStorage?.getItem(LS_ID);
    if (stored && /^[A-Za-z0-9_-]{1,40}$/.test(stored)) return stored;
    const raw = globalThis.crypto?.randomUUID?.() ?? `wanderer-${Date.now().toString(36)}`;
    const id = raw.replace(/[^A-Za-z0-9_-]/g, 'w').slice(0, 32);
    if (id) globalThis.localStorage?.setItem?.(LS_ID, id);
    return id || 'wanderer-default';
  } catch {
    return 'wanderer-default';
  }
}

export class PresenceTracker {
  /**
   * @param {{ isEnabled?: () => boolean, streamUrl?: (ch: string) => (string|null), channel?: string, createSource?: (url: string) => EventSource }} opts
   */
  constructor(opts = {}) {
    this._isEnabled = opts.isEnabled ?? (() => onlineServices.enabled());
    this._streamUrl = opts.streamUrl ?? ((ch) => onlineServices.presenceStreamUrl(ch));
    this._channel = opts.channel ?? PRESENCE_CHANNEL;
    this._createSource = opts.createSource ?? ((url) => new EventSource(url));
    /** @type {Map<string, { id: string, hue: number, x: number, z: number }>} */
    this._wanderers = new Map();
    this.ready = false;
    this._source = null;
    /** @type {Set<(count: number, ready: boolean) => void>} */
    this._listeners = new Set();
  }

  /** 幂等启动；返回是否建联成功（未启用 / 无 EventSource → false） */
  start() {
    if (this._source) return true;
    if (typeof this._isEnabled === 'function' && !this._isEnabled()) return false;
    const url = this._streamUrl(this._channel);
    if (!url) return false;
    if (typeof this._createSource !== 'function') return false;
    try {
      const source = this._createSource(url);
      source.addEventListener('present', (ev) => this._onPresent(ev));
      source.addEventListener('snapshot-end', () => {
        this.ready = true;
        this._emit();
      });
      source.addEventListener('error', () => {
        // EventSource 自己会重连——这里只做诚实标注：掉线期间徽章不该假装"人满"
        this.ready = false;
        this._emit();
      });
      this._source = source;
      return true;
    } catch (e) {
      console.warn('[presence] SSE 建联失败（已忽略，面板将不显示徽章）', e?.message ?? e);
      return false;
    }
  }

  stop() {
    try { this._source?.close?.(); } catch { /* 关闭失败也要走完 */ }
    this._source = null;
    this._wanderers.clear();
    this.ready = false;
    this._emit();
  }

  /** 公共读数：当前名单（地图渲染用）；拷贝而非内部引用 */
  wanderers() { return [...this._wanderers.values()]; }
  count() {
    return this._wanderers.size;
  }

  /** 挂/撤徽章订阅者；回调立即以当前状态触发一次 */
  subscribe(fn) {
    this._listeners.add(fn);
    try { fn(this.count(), this.ready); } catch { /* 订阅者画错不拖垮 */ }
    return () => this._listeners.delete(fn);
  }

  _onPresent(ev) {
    try {
      const w = JSON.parse(ev?.data ?? 'null');
      if (!w || typeof w.id !== 'string' || !w.id) return;
      this._wanderers.set(w.id, {
        id: w.id,
        name: typeof w.name === 'string' ? w.name.slice(0, 24) : '',
        hue: Number.isFinite(w.hue) ? Math.floor(w.hue) % 360 : 0,
        x: Number.isFinite(w.x) ? Math.max(-1, Math.min(1, w.x)) : 0,
        z: Number.isFinite(w.z) ? Math.max(-1, Math.min(1, w.z)) : 0,
      });
      this._emit();
    } catch (e) {
      console.warn('[presence] present 帧解析失败（丢弃该帧）', e?.message ?? e);
    }
  }

  _emit() {
    const snapshot = [...this._listeners];
    for (const fn of snapshot) {
      try { fn(this.count(), this.ready); } catch { /* 订阅者已丢，不自膨成灾 */ }
    }
  }
}

/** 游戏内默认单例：未在线时全程沉默 */
export const presenceTracker = new PresenceTracker();
