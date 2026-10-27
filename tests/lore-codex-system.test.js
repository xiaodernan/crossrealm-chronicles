/**
 * 位面秘典解锁门禁 —— 钉 `game/LoreCodexSystem.js`。
 *
 * 通过真实 EventBus 驱动，用真 `LORE_CODEX`（12 条、12 个互异 unlock 键）。几条"写错不抛、
 * 只静默错解锁/漏落旗标"的不变量：
 * - **按 key 解锁**：`entry.unlock === key` 的条目解锁（真表里一键一条）；**幂等**（已解锁不重复 toast/广播）。
 * - **满 12 条才落 `void-chronicle-read` 旗标，且只落一次**（`_编年史已读` 守卫）——
 *   没到 100% 不许落（r-archivist 的锁因读的就是这一格）。
 * - `getStats().percent`：0→0%、全解锁→100%（total 为 0 时兜底 0，不除零）。
 * - `getEntries(zone)` 按区过滤；toJSON/fromJSON 存读 unlocked。
 *
 * 两枚变异探针走真代码路径（grep 确认落盘、预言命中、原字节还原）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { emit } from '../src/engine/EventBus.js';
import { LORE_CODEX } from '../src/game/LoreCodexRegistry.js';
import { LoreCodexSystem } from '../src/game/LoreCodexSystem.js';

const KEYS = LORE_CODEX.map((e) => e.unlock);

let game, sys, codexEvents, capture;

beforeEach(() => {
  codexEvents = [];
  capture = (e) => { codexEvents.push(e.detail); };
  globalThis.window.addEventListener('codex-unlocked', capture);
  game = { dialog: { toast: vi.fn() }, stats: { onStoryFlag: vi.fn() } };
  sys = new LoreCodexSystem(game);
});
afterEach(() => {
  sys?.dispose();
  globalThis.window.removeEventListener('codex-unlocked', capture);
  sys = null;
});

describe('LoreCodexSystem 按 key 解锁', () => {
  it('execution / finisher 键分别解锁对应条目', () => {
    sys.tryUnlock('execution');
    expect(sys.unlocked.has('codex-execution')).toBe(true);
    sys.tryUnlock('finisher');
    expect(sys.unlocked.has('codex-finisher')).toBe(true);
  });

  it('幂等：同 key 再解一次不重复 toast/广播', () => {
    sys.tryUnlock('execution');
    const toastCount = game.dialog.toast.mock.calls.length;
    const eventCount = codexEvents.length;
    sys.tryUnlock('execution');
    expect(game.dialog.toast.mock.calls.length).toBe(toastCount);
    expect(codexEvents.length).toBe(eventCount);
  });

  it('事件 → 解锁：combo-finisher / journal-entry / boss-defeated', () => {
    emit('combo-finisher');
    expect(sys.unlocked.has('codex-finisher')).toBe(true);
    emit('journal-entry', { id: 'rest-hub-souls' });
    expect(sys.unlocked.has('codex-anchor')).toBe(true);
    emit('boss-defeated', { bossId: 'archmagus' });
    expect(sys.unlocked.has('codex-mage')).toBe(true);
  });
});

describe('LoreCodexSystem 满编落旗标', () => {
  it('满 12 条才落 void-chronicle-read，且只落一次', () => {
    for (const k of KEYS.slice(0, 11)) sys.tryUnlock(k);
    expect(game.stats.onStoryFlag).not.toHaveBeenCalled(); // 还没 100%
    sys.tryUnlock(KEYS[11]); // 第 12 条
    expect(game.stats.onStoryFlag).toHaveBeenCalledWith('void-chronicle-read');
    expect(game.stats.onStoryFlag).toHaveBeenCalledTimes(1);
    sys.tryUnlock(KEYS[11]); // 再触发一次不重复
    expect(game.stats.onStoryFlag).toHaveBeenCalledTimes(1);
  });
});

describe('LoreCodexSystem 统计与存档', () => {
  it('getStats：0→0%、解锁一条→8%、全解锁→100%', () => {
    expect(sys.getStats()).toEqual({ unlocked: 0, total: 12, percent: 0 });
    sys.tryUnlock('execution');
    expect(sys.getStats().percent).toBe(8); // round(1/12*100)
    for (const k of KEYS) sys.tryUnlock(k);
    expect(sys.getStats()).toEqual({ unlocked: 12, total: 12, percent: 100 });
  });

  it('getEntries 按区过滤', () => {
    expect(sys.getEntries('combat')).toHaveLength(2); // execution + finisher
    expect(sys.getEntries('all')).toHaveLength(12);
  });

  it('toJSON/fromJSON 存读 unlocked；null 安全 no-op', () => {
    sys.tryUnlock('execution');
    const json = sys.toJSON();
    expect(json.unlocked).toContain('codex-execution');
    sys.unlocked = new Set();
    sys.fromJSON(json);
    expect(sys.unlocked.has('codex-execution')).toBe(true);
    sys.fromJSON(null);
    expect(sys.unlocked.size).toBe(1);
  });
});
