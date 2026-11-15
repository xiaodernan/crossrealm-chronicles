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
};

if (typeof window !== 'undefined') {
  window.__crossrealmTelemetry = localTelemetry;
}
