/**
 * W-Z138 — 炉火之镜：读完整 20 卷的一次性镜像。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CanonJournalTab } from '../src/ui/CanonJournalTab.js';

const store = () => {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
    clear: () => data.clear(),
  };
};

const fakeGame = (count) => {
  const order = Array.from({ length: 20 }, (_, i) => String(i).padStart(2, '0'));
  return {
    stats: { souls: 0, addSouls(n) { this.souls += n; } },
    order,
    reader: { read: order.slice(0, count), bookmarks: [], serif: true, fontStep: 0, lastRead: order[0] },
  };
};

const boot = (count) => {
  const g = fakeGame(count);
  const tab = new CanonJournalTab(g);
  tab.order = g.order;
  tab.reader = g.reader;
  return { tab, game: g };
};

describe('炉火之镜 (Reader Mirror) · 一次性解锁', () => {
  beforeEach(() => { globalThis.localStorage = store(); });
  afterEach(() => { try { globalThis.localStorage = undefined; } catch { /* noop */ } });

  it('没读完 → 不触发镜像', () => {
    const { tab } = boot(19);
    expect(tab._checkMirror()).toBe(false);
  });

  it('读完 → 触发镜像 + 200 souls + LS unlocked=true', () => {
    const { tab, game } = boot(20);
    expect(tab._checkMirror()).toBe(true);
    expect(game.stats.souls).toBe(200);
    const raw = JSON.parse(globalThis.localStorage.getItem('crossrealm_reader_mirror_v1'));
    expect(raw.unlocked).toBe(true);
  });

  it('第二次触发 → 只返回 true、不再赠魂', () => {
    const { tab, game } = boot(20);
    expect(tab._checkMirror()).toBe(true);
    expect(game.stats.souls).toBe(200);
    expect(tab._checkMirror()).toBe(true);
    expect(game.stats.souls).toBe(200); // 不加第二次
  });

  it('LS 已经被写 unlocked:true，reader.read 重排仍返回 true — 不赠魂', () => {
    globalThis.localStorage.setItem('crossrealm_reader_mirror_v1', JSON.stringify({ unlocked: true, at: Date.now() }));
    const { tab, game } = boot(20);
    expect(tab._checkMirror()).toBe(true);
    expect(game.stats.souls).toBe(0);
  });
});
