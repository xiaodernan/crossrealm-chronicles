/**
 * CG 画廊门禁 —— 钉 `game/CgGallerySystem.js` 的解锁/筛选/收藏/统计。
 *
 * 通过真实 EventBus 驱动。几条"写错不抛、只静默重复解锁/筛错"的不变量：
 * - **unlock 幂等**：已解锁再 unlock 返回 false、不重复 toast/广播；新解锁返回 true。
 * - caption：目录里有的条目取 `t(entry.caption)`（文案键展开），目录外的 id 原样回落。
 * - **getEntries 默认只返回已解锁**、按 sort 升序；`onlyUnlocked=false` 返回全表。
 * - `getLockedPreview` 只返回未解锁；recordView 计数、toggleFavorite 翻转；getStats 汇总。
 *
 * 两枚变异探针走真代码路径（grep 确认落盘、预言命中、原字节还原）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { emit } from '../src/engine/EventBus.js';
import { t } from '../src/engine/i18n.js';
import { CG_GALLERY_CATALOG } from '../src/game/CgGalleryRegistry.js';
import { CgGallerySystem } from '../src/game/CgGallerySystem.js';

const KNOWN = CG_GALLERY_CATALOG[0]; // { id:'hub:start', zone:'hub', sort:10, caption:'cg_caption_hub_start' }

let game, sys, events, capture;

beforeEach(() => {
  events = [];
  capture = (e) => { events.push(e.detail); };
  globalThis.window.addEventListener('cg-unlocked', capture);
  game = { dialog: { toast: vi.fn() } };
  sys = new CgGallerySystem(game);
});
afterEach(() => {
  sys?.dispose();
  globalThis.window.removeEventListener('cg-unlocked', capture);
  sys = null;
});

describe('CgGallerySystem.unlock', () => {
  it('幂等：新解锁 true、重复 false，且只广播/toast 一次', () => {
    expect(sys.unlock(KNOWN.id)).toBe(true);
    expect(sys.unlock(KNOWN.id)).toBe(false);
    expect(events).toHaveLength(1);
    expect(game.dialog.toast).toHaveBeenCalledTimes(1);
  });

  it('目录内 caption 取文案键展开；目录外回落 id', () => {
    sys.unlock(KNOWN.id);
    expect(events.at(-1).caption).toBe(t(KNOWN.caption));
    sys.unlock('no-such-cg:xyz');
    expect(events.at(-1).caption).toBe('no-such-cg:xyz');
  });
});

describe('CgGallerySystem 筛选', () => {
  it('getEntries 默认只返回已解锁、按 sort 升序', () => {
    const a = CG_GALLERY_CATALOG.find((c) => c.sort >= 100); // 较靠后
    sys.unlock(KNOWN.id); // sort 10
    sys.unlock(a.id);
    const ids = sys.getEntries().map((e) => e.id);
    expect(ids).toContain(KNOWN.id);
    expect(ids).toContain(a.id);
    expect(ids).toHaveLength(2);
    expect(sys.getEntries()[0].sort).toBeLessThanOrEqual(sys.getEntries()[1].sort);
  });

  it('onlyUnlocked=false 返回全表；getLockedPreview 只返回未解锁', () => {
    expect(sys.getEntries('all', false)).toHaveLength(CG_GALLERY_CATALOG.length);
    sys.unlock(KNOWN.id);
    const locked = sys.getLockedPreview();
    expect(locked).toHaveLength(CG_GALLERY_CATALOG.length - 1);
    expect(locked.some((e) => e.id === KNOWN.id)).toBe(false);
  });
});

describe('CgGallerySystem 收藏 / 统计 / 事件 / 存档', () => {
  it('recordView 计数、toggleFavorite 翻转、getStats 汇总', () => {
    sys.recordView(KNOWN.id);
    sys.recordView(KNOWN.id);
    expect(sys.viewCounts[KNOWN.id]).toBe(2);
    sys.toggleFavorite(KNOWN.id);
    expect(sys.favorites.has(KNOWN.id)).toBe(true);
    sys.toggleFavorite(KNOWN.id);
    expect(sys.favorites.has(KNOWN.id)).toBe(false);
    sys.unlock(KNOWN.id);
    expect(sys.getStats()).toMatchObject({ unlocked: 1, total: CG_GALLERY_CATALOG.length });
  });

  it('事件 → 解锁：combo-finisher 解锁 bonus:finisher', () => {
    emit('combo-finisher');
    expect(sys.isUnlocked('bonus:finisher')).toBe(true);
  });

  it('toJSON/fromJSON 存读 unlocked/favorites/viewCounts；null no-op', () => {
    sys.unlock(KNOWN.id);
    sys.recordView(KNOWN.id);
    sys.toggleFavorite(KNOWN.id);
    const json = JSON.parse(JSON.stringify(sys.toJSON()));
    sys.unlocked = new Set();
    sys.favorites = new Set();
    sys.viewCounts = {};
    sys.fromJSON(json);
    expect(sys.isUnlocked(KNOWN.id)).toBe(true);
    expect(sys.favorites.has(KNOWN.id)).toBe(true);
    expect(sys.viewCounts[KNOWN.id]).toBe(1);
    sys.fromJSON(null);
    expect(sys.isUnlocked(KNOWN.id)).toBe(true);
  });
});
