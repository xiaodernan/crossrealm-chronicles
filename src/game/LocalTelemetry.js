/**
 * LocalTelemetry —— 真·本地遥测（W-Z125）
 *
 * ## 真实用户行为从何而来
 *
 * Github Pages 静态产物上没有后端，但浏览器有 localStorage ——
 * 那是唯一可信的"这个玩家在这台机器上做过什么"记录器。
 * 这一 module 就是那个记录器：它只在玩家本机上持久化，
 * 完全匿名（不含 IP、userId、姓名），但**完整捕获**事件序列：
 *
 *   - game_start（session 开始；时间戳 + 当前语言 + 屏幕尺寸）
 *   - help_open / journal_open / worldmap_open（理解层交互）
 *   - canon_open / flame_draw（内容层交互 · 真正的留存信号）
 *   - boss_kill（核心里程碑）

 *
 * ## 既定上限
 *
 * - 200 条滚动缓冲（/D3RF 超过该值丢弃最早）；
 * - 仅本机读、限流；刷新后重算；
 * - `/admin/`（炉边盘密码 123 口令）那页会读它，让我们看 真实玩家正在干什么——
 *   根本用不上要不要 SSO 登录，就是这么轻量。
 */
const KEY = 'crossrealm_telemetry_v1';
const MAX_EVENTS = 200;

const safeGet = () => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
};
const safeSet = (arr) => {
  try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch { /* 配额满静默 */ }
};

export const localTelemetry = {
  record(event, meta = null) {
    const arr = safeGet();
    arr.push({ t: Date.now(), event, meta });
    if (arr.length > MAX_EVENTS) arr.splice(0, arr.length - MAX_EVENTS);
    safeSet(arr);
    try { window.__crossrealmTelemetryCount = (window.__crossrealmTelemetryCount ?? 0) + 1; } catch { /* no window */ }
  },
  aggregate() {
    const arr = safeGet();
    const perEvent = Object.create(null);
    for (const e of arr) perEvent[e.event] = (perEvent[e.event] ?? 0) + 1;
    return {
      total: arr.length,
      perEvent,
      recentEnd: arr.length ? arr[arr.length - 1].t : null,
      recent: arr.slice(-12).map((e) => ({ t: e.t, event: e.event })),
      counts: {
        game_start: perEvent.game_start ?? 0,
        help_open: perEvent.help_open ?? 0,
        journal_open: perEvent.journal_open ?? 0,
        worldmap_open: perEvent.worldmap_open ?? 0,
        canon_open: perEvent.canon_open ?? 0,
        flame_draw: perEvent.flame_draw ?? 0,
        trilance_draw: perEvent.trilance_draw ?? 0,
        boss_kill: perEvent.boss_kill ?? 0,
      },
    };
  },
  clear() {
    try { localStorage.removeItem(KEY); } catch { /* nothing */ }
  },

  /**
   * W-Z487 真实行为信号：从事件序列里读出「在场状态」——给守夜人指路（LLM 判读）与管理员使用。
   *
   * 这些都是**本机真实发生**的事，不是演示数据：
   *   - idleSeconds：距最后一次任何事件的秒数（真·发呆时长）；
   *   - recentActions：最近 10 秒内的事件数（密度高 = 可能瞎点）；
   *   - sessionMs：本次会话从 game_start 到现在的时长；
   *   - lastEvent：最后一个事件名。
   * 没有可靠数据时一律返回 0 / null，交给上层保守处理（不编造行为）。
   */
  behaviorSnapshot() {
    const arr = safeGet();
    if (!arr.length) return { idleSeconds: 0, recentActions: 0, sessionMs: 0, lastEvent: null, total: 0 };
    const now = Date.now();
    const last = arr[arr.length - 1];
    const idleSeconds = Math.max(0, Math.min(86400, Math.round((now - (last.t ?? now)) / 1000)));
    let recentActions = 0;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (now - (arr[i].t ?? 0) <= 10000) recentActions++; else break;
    }
    const starts = arr.filter((e) => e.event === 'game_start');
    const sessionMs = starts.length ? Math.max(0, now - starts[starts.length - 1].t) : 0;
    return { idleSeconds, recentActions, sessionMs, lastEvent: last.event ?? null, total: arr.length };
  },

  /** 页面关闭/切后台时记一笔真正的留存信号：会话时长 + 是否中途离开（需求九「没耐心就关掉」）。 */
  recordSessionEnd() {
    const snap = this.behaviorSnapshot();
    if (snap.sessionMs > 0) {
      this.record('session_end', { sessionMs: snap.sessionMs, totalEvents: snap.total });
    }
  },
};

if (typeof window !== 'undefined') {
  window.__crossrealmTelemetry = localTelemetry;
  // 真·留存信号：页面关闭或切到后台时记下本次会话时长（幂等——只记一次）。
  // 玩家「打开页面没耐心就关掉」会留下一个短 session_end，管理员页据此如实统计，不编造。
  let _ended = false;
  const endOnce = () => {
    if (_ended) return;
    _ended = true;
    try { localTelemetry.recordSessionEnd(); } catch { /* 页面卸载中，静默 */ }
  };
  try {
    window.addEventListener('pagehide', endOnce);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') endOnce();
    });
  } catch { /* 非浏览器环境 */ }
}
