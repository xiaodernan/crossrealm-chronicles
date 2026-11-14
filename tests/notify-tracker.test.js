/**
 * W-Z49「炉火报讯台」：NotifyTracker 订阅 / 拉取 / 已读水位语义（无网络）
 *
 * 三件事钉住：
 * 1) 未启用在线服务 → refresh() 立刻返回 false，items 清空、ready=false、订阅者收到一格
 * 2) 拉取成功 → ready=true，items 透传；失败（fetchRecents 回 null）→ ready=false 且 items 保留不动/清空不伪装
 * 3) markSeen() 把水位线推进到当前最大 ts；unreadCount 只数比水位线新的；连刷两次在途合并为一次请求
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { NotifyTracker } from '../src/online/notifyTracker.js';

function makeTracker(overrides = {}) {
  return new NotifyTracker({
    isEnabled: () => true,
    fetchRecents: async () => ({ count: 2, items: [
      { id: 'a', kind: 'achievement', title: '三巨头同频', ts: 1000 },
      { id: 'b', kind: 'world', title: '星门开启', ts: 2000 },
    ] }),
    ...overrides,
  });
}

const lsStore = new Map();
beforeEach(() => {
  lsStore.clear();
  globalThis.localStorage = {
    getItem: (k) => (lsStore.has(k) ? lsStore.get(k) : null),
    setItem: (k, v) => { lsStore.set(k, String(v)); },
    removeItem: (k) => { lsStore.delete(k); },
    clear: () => lsStore.clear(),
  };
});

describe('NotifyTracker（W-Z49）', () => {
  it('未启用在线服务 → refresh() 回 false，订阅者收到空快照', async () => {
    const t = makeTracker({ isEnabled: () => false });
    let got = null;
    t.subscribe((items, ready) => { got = { items, ready }; });
    const ok = await t.refresh();
    expect(ok).toBe(false);
    expect(got.ready).toBe(false);
    expect(got.items).toEqual([]);
  });

  it('拉取成功 → ready=true 且 items 原样进快照', async () => {
    const t = makeTracker();
    const snapshots = [];
    t.subscribe((items, ready) => snapshots.push({ items: [...items], ready }));
    const ok = await t.refresh();
    expect(ok).toBe(true);
    expect(t.ready).toBe(true);
    expect(t.items.map((n) => n.id)).toEqual(['a', 'b']);
    // 第一格是 subscribe 立即触发的空快照，后续是 refresh 的真快照
    expect(snapshots.at(-1).ready).toBe(true);
    expect(snapshots.at(-1).items).toHaveLength(2);
  });

  it('拉取失败（回 null）→ ready=false，不抛异常', async () => {
    const t = makeTracker({ fetchRecents: async () => null });
    const ok = await t.refresh();
    expect(ok).toBe(false);
    expect(t.ready).toBe(false);
  });

  it('连刷合并：在途只发一次上游请求', async () => {
    let calls = 0;
    const t = makeTracker({
      fetchRecents: async () => {
        calls += 1;
        await new Promise((r) => { const s = AbortSignal.timeout(30); s.addEventListener('abort', r, { once: true }); });
        return { count: 0, items: [] };
      },
    });
    await Promise.all([t.refresh(), t.refresh(), t.refresh()]);
    expect(calls).toBe(1);
  });

  it('水位线：markSeen 把未读数压到 0；更新的条目又算未读', async () => {
    const t = makeTracker();
    await t.refresh();
    expect(t.unreadCount()).toBe(2); // 从未读过
    t.markSeen();
    expect(t.unreadCount()).toBe(0);
    // 水位线以下的不再计未读
    const t2 = makeTracker({
      fetchRecents: async () => ({ count: 1, items: [
        { id: 'c', kind: 'season', title: '潮汐涌周', ts: 3000 },
      ] }),
    });
    await t2.refresh();
    // 同一 localStorage：老水位线 2000，新条目 3000 → 未读 1
    expect(t2.unreadCount()).toBe(1);
  });
});
