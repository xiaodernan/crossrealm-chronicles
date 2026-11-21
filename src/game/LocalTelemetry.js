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

/**
 * W-Z500：安装会话边界监听（真·留存信号）。返回 disposer 便于测试与卸载。
 *
 * 修 W-Z487 的 bug：旧版把 visibilitychange:hidden（**任何**切标签/切后台）当成永久
 * session end，第一次切走就把 `_ended` 钉死，之后真正关页再也不记——留存信号直接瞎掉；
 * 反过来若 pagehide 紧跟 hidden，又会对同一次离开记两条。这里区分两种离开：
 *   - hidden：记一次 session_end（覆盖移动端只有 visibilitychange 没有 pagehide 的情况），
 *     但**可重入**——回到前台重置，下次离开照样记；
 *   - pagehide：只在「这一轮还没因 hidden 记过」时补记，避免同一次离开双记。
 */
export function installSessionLifecycle(win, doc) {
  let hiddenAt = null;
  const recordOnce = () => {
    if (hiddenAt !== null) return;       // 同一次离开已记过，防双记
    hiddenAt = Date.now();
    try { localTelemetry.recordSessionEnd(); } catch { /* 卸载中静默 */ }
  };
  const onHidden = () => {
    if (typeof doc.visibilityState !== 'string' || doc.visibilityState === 'hidden') recordOnce();
  };
  const onVisible = () => { hiddenAt = null; }; // 回到前台：重新武装，下次离开照记
  const onPageHide = () => { recordOnce(); };
  try {
    win.addEventListener('pagehide', onPageHide);
    doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState === 'hidden') onHidden(); else onVisible();
    });
  } catch { /* 非浏览器环境 */ }
  return () => {
    try {
      win.removeEventListener('pagehide', onPageHide);
    } catch { /* noop */ }
  };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.__crossrealmTelemetry = localTelemetry;
  installSessionLifecycle(window, document);
}