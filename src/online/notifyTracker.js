/**
 * 炉火报讯台（W-Z49）—— 页面级共享的"最近报讯"快照。
 *
 * ## 设计
 * 没有 SSE、没有自建计时器：面板**打开时** `refresh()` 一次（拉最近 3 条），
 * 玩家手动🔄（顶部按钮）时再拉一次——拉取走 `OnlineServices.fetchNotifyRecents`，
 * 超时/失败/未启用 → `ready=false`，UI 自然隐藏（不假装"空台账"）。
 *
 * 面板以外的东西（如地图、战斗）不碰这一片：报讯是"抬头看一眼"的信息，
 * 不该变成又一条 update 热路径上的工作项。
 */
import { onlineServices } from './OnlineServices.js';

const LS_SEEN = 'crossrealm_notify_seen_ts';
export const NOTIFY_LIMIT = 3;

export class NotifyTracker {
  /**
   * @param {{ isEnabled?: () => boolean, fetchRecents?: (limit: number) => Promise<{ count: number, items: Array } | null> }} opts
   */
  constructor(opts = {}) {
    this._isEnabled = opts.isEnabled ?? (() => onlineServices.enabled());
    this._fetchRecents = opts.fetchRecents
      ?? ((limit) => onlineServices.fetchNotifyRecents(limit));
    /** @type {Array<{ id: string, kind: string, title: string, ts: number }>} */
    this.items = [];
    this.ready = false;
    this._listeners = new Set();
    this._inflight = null;
  }

  /** 本地已读水位线：打开面板即把当前最新 ts 记为已读；0 = 从未读 */
  static lastSeenTs() {
    try {
      const raw = globalThis.localStorage?.getItem(LS_SEEN);
      const n = raw == null ? 0 : Number(raw);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch {
      return 0;
    }
  }

  static markAllSeen(ts) {
    if (!Number.isFinite(ts) || ts <= 0) return;
    try {
      globalThis.localStorage?.setItem?.(LS_SEEN, String(Math.floor(ts)));
    } catch {
      /* localStorage 不可用：已读线丢失，下次还会全部显示——可接受 */
    }
  }

  /** 未读条数（基于水位线）：手动统计，不依赖后端"未读"概念（后端没有这个概念） */
  unreadCount() {
    const seen = NotifyTracker.lastSeenTs();
    if (seen <= 0) return this.items.length;
    return this.items.filter((n) => n.ts > seen).length;
  }

  /** 幂等拉一轮；未启用 → false（UI 隐藏）；在途去重（面板连点开关不会打两次上游） */
  async refresh() {
    if (this._inflight) return this._inflight;
    this._inflight = this._refreshOnce();
    try {
      return await this._inflight;
    } finally {
      this._inflight = null;
    }
  }

  async _refreshOnce() {
    if (typeof this._isEnabled === 'function' && !this._isEnabled()) {
      this.items = [];
      this.ready = false;
      this._emit();
      return false;
    }
    const data = await this._fetchRecents(NOTIFY_LIMIT);
    if (!data || !Array.isArray(data.items)) {
      this.ready = false;
      this._emit();
      return false;
    }
    this.items = data.items;
    this.ready = true;
    this._emit();
    return true;
  }

  /** 面板渲染完成后调用：把当前最新一条标记为已读（不存在的话就不动水位线） */
  markSeen() {
    const latest = this.items.reduce((m, n) => Math.max(m, n.ts), 0);
    NotifyTracker.markAllSeen(latest);
  }

  subscribe(fn) {
    this._listeners.add(fn);
    try { fn(this.items, this.ready); } catch { /* 订阅者画错不拖垮 */ }
    return () => this._listeners.delete(fn);
  }

  _emit() {
    const snapshot = [...this._listeners];
    for (const fn of snapshot) {
      try { fn(this.items, this.ready); } catch { /* 订阅者已丢，不自膨胀 */ }
    }
  }
}

/** 游戏内默认单例 */
export const notifyTracker = new NotifyTracker();
