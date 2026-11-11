/**
 * 个人最速通关记账（W-G5 切片1）——纯本地、零依赖、坏档自愈。
 *
 * ## 为什么不复用存档
 *
 * 存档（SaveSystem）是**契约**：改一格就要迁版本。而"某 Boss 我的最速"是
 * **账本**——丢了没有后果，只是又从零开始量。放进存档会把一份随时会写的热数据
 * 压进存档的 schema 里，而为了这一格数据迁一次档，代价远大于收益。
 * 所以单开一格 `crossrealm_boss_best_v1`：JSON、扁平、只有 bossId → clearTimeMs。
 *
 * ## 三条纪律
 *
 * 1. **坏档自愈**：任何一步读/写抛异常（隐私模式、磁盘满、JSON 被手改）——
 *    一律静默降级为"空账本"或"只读不报错"，绝不影响游戏；
 * 2. **非有限数/非正数一律不收**：`NaN`/`Infinity`/`≤ 0` 写进账本等于传染给下一个页面；
 * 3. **单调收紧**：只接受比记录更快的成绩（`<`），同分不覆盖——"先做到的那一版"永远是更早的那一刻。
 */

const STORAGE_KEY = 'crossrealm_boss_best_v1';

/** 把无序的对象还原成 Map，顺手过滤掉不像话的条目 */
function sanitize(raw) {
  const map = new Map();
  if (!raw || typeof raw !== 'object') return map;
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k !== 'string' || !k) continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) continue;
    map.set(k, Math.round(n));
  }
  return map;
}

export class BossBestTimes {
  /**
   * @param {Storage|null} storage 注入点（测试给假 Storage；生产走全局 localStorage）
   */
  constructor(storage = null) {
    this._storage = storage ?? (typeof globalThis !== 'undefined' ? globalThis.localStorage : null);
    this._map = this._load();
  }

  _load() {
    try {
      const raw = this._storage?.getItem(STORAGE_KEY);
      if (!raw) return new Map();
      return sanitize(JSON.parse(raw));
    } catch {
      return new Map();   // 坏档 → 从零开始，不报错
    }
  }

  _save() {
    try {
      this._storage?.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(this._map)));
    } catch {
      /* 写不进去（隐私模式/磁盘满）——账本这次没记上，仅此而已 */
    }
  }

  /**
   * 记一笔。
   * @returns {{ improved: boolean, bestMs: number|null }}
   *   improved=true 表示这次打破（或首次写入）了个人最速；bestMs 是账本现值（首次失败回 null）
   */
  consider(bossId, clearTimeMs) {
    if (typeof bossId !== 'string' || !bossId) return { improved: false, bestMs: null };
    const n = Number(clearTimeMs);
    if (!Number.isFinite(n) || n <= 0) return { improved: false, bestMs: null };
    const ms = Math.round(n);
    const prev = this._map.get(bossId);
    if (prev !== undefined && ms >= prev) {
      return { improved: false, bestMs: prev };
    }
    this._map.set(bossId, ms);
    this._save();
    return { improved: true, bestMs: ms };
  }

  /** 某个 Boss 的个人最速；没有返回 null */
  best(bossId) {
    return this._map.get(bossId) ?? null;
  }

  /** 全部记录（按用时升序——最快的排最前，与传说碑同一口径），最多 limit 条 */
  top(limit = 10) {
    const cap = Math.max(1, Math.min(limit, 50));
    return [...this._map.entries()]
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
      .slice(0, cap)
      .map(([bossId, bestMs]) => ({ bossId, bestMs }));
  }

  /** 账本大小（调试/测试用） */
  size() {
    return this._map.size;
  }
}

/** 全局单例（生产由 Game.js 直接消费） */
export const bossBestTimes = new BossBestTimes();
