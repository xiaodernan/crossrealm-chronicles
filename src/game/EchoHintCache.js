/**
 * EchoHintCache —— 回声提示的本地结果缓存（用户「珍惜 token」的直接落点）。
 *
 * ## 为什么值得单独一层
 *
 * 回声提示（`/api/ai/echo-hint`）是**每个回声固定一条**的内容：同一个回声、同一种语言，
 * 重问一次拿到的仍是那一句。但它是玩家手动点的，刷新页面后按钮的 `is-done` 状态丢失，
 * 再点一次就再烧一次 token。缓存到 localStorage 后：刷新即见、零请求。
 *
 * ## 三条纪律（与 BossBestTimes / LocalTelemetry 同源）
 *
 * 1. **坏档自愈**：读/写任何一步抛异常（隐私模式 / 配额满 / 被手改）一律静默降级，
 *    最坏退化成「没有缓存」，绝不阻塞面板；
 * 2. **有上限**：只留最近 MAX_ENTRIES 条，防止 localStorage 被撑爆；
 * 3. **值限长 + 类型白名单**：缓存的是要写进 `textContent` 的文本，非字符串/超长一律不收。
 */
const LS = 'crossrealm_echo_hint_cache_v1';
const MAX_ENTRIES = 60;
const MAX_TEXT = 240;

const keyOf = (echoId, lang) => `${echoId}|${lang === 'en' ? 'en' : 'zh'}`;

export class EchoHintCache {
  constructor(storage = null) {
    this._storage = storage ?? (typeof globalThis !== 'undefined' ? globalThis.localStorage : null);
    this._map = this._load();
  }

  _load() {
    try {
      const raw = JSON.parse(this._storage?.getItem(LS) ?? '{}');
      const map = new Map();
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return map;
      for (const [k, v] of Object.entries(raw)) {
        if (typeof k !== 'string' || typeof v !== 'string') continue;
        // 只认 `id|zh` / `id|en` 形状：手写坏档里的任意键不该占配额又永远查不到。
        if (!/^[^|]+\|(zh|en)$/.test(k)) continue;
        if (!v.trim() || v.length > MAX_TEXT) continue;
        map.set(k, v);
      }
      return map;
    } catch {
      return new Map();
    }
  }

  _save() {
    try {
      const obj = {};
      // 只留最近 MAX_ENTRIES 条（Map 保持插入序，取尾部）
      const entries = [...this._map.entries()].slice(-MAX_ENTRIES);
      for (const [k, v] of entries) obj[k] = v;
      this._storage?.setItem(LS, JSON.stringify(obj));
    } catch {
      /* 写不进去就这次没缓存上，仅此而已 */
    }
  }

  /** 取缓存；没有/非法 → null */
  get(echoId, lang) {
    if (typeof echoId !== 'string' || !echoId) return null;
    return this._map.get(keyOf(echoId, lang)) ?? null;
  }

  /** 写缓存；非字符串/空/超长一律拒收（返回 false） */
  set(echoId, lang, text) {
    if (typeof echoId !== 'string' || !echoId) return false;
    if (typeof text !== 'string') return false;
    const t = text.trim();
    if (!t || t.length > MAX_TEXT) return false;
    const k = keyOf(echoId, lang);
    // 重新插入以刷新「最近使用」次序
    this._map.delete(k);
    this._map.set(k, t);
    if (this._map.size > MAX_ENTRIES) {
      const oldest = this._map.keys().next().value;
      this._map.delete(oldest);
    }
    this._save();
    return true;
  }

  /** 调试/测试用 */
  size() {
    return this._map.size;
  }
}

/** 生产单例（与 bossBestTimes 同一写法） */
export const echoHintCache = new EchoHintCache();
