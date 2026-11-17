/**
 * W-Z316 · 烬灯回信 · 返炉 —— 客户端侧的端点路由：
 *
 * ① Ember Reply 有则先用 ember（旧后端没有该端点的回落 kindle-letter）；
 * ② ember 非 ok（404/503/超时）→ 回落 kindle-letter，回信不中断；
 * ③ ember ok → 不再打 kindle-letter（零冗余请求）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { OnlineServices } from '../src/online/OnlineServices.js';
import { KindleLetterSystem } from '../src/game/KindleLetterSystem.js';

const BASE = 'http://127.0.0.1:1/';
const LS_MOCK = (() => {
  const store = new Map();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    _map: store,
  };
})();

const mkStats = () => ({
  hits: 0,
  kills: { boss: 5 },
  discoveries: new Set(),
  dungeonsCleared: new Set(['x']),
  decisions: new Set(['choice_final_keep']),
  level: 18,
});

const mkGame = (fetchImpl, { enabled = true } = {}) => {
  const online = new OnlineServices({ baseUrl: BASE, fetchImpl, enabled });
  return {
    onlineServices: online,
    quests: { chapter: 5, stats: mkStats() },
    stats: { bossDefeated: {} },
    popCulture: { unlocked: new Set() },
    storyJournal: { addSilent: vi.fn() },
    dialog: { toast: vi.fn() },
  };
};

const okReply = (reply) => new Response(JSON.stringify({ available: true, reply }), { status: 200 });

describe('烬灯回信 · 返炉：ember-reply 优先，kindle-letter 回落', () => {
  beforeEach(() => { globalThis.localStorage = LS_MOCK; LS_MOCK._map.clear(); });
  afterEach(() => { delete globalThis.localStorage; });

  it('ember ok → 用 ember，kindle-letter 不发', async () => {
    const urls = [];
    const fetch = vi.fn(async (url) => { urls.push(String(url)); return okReply('炉火回信·ember'); });
    const game = mkGame(fetch, { enabled: true });
    const system = new KindleLetterSystem(game);
    const r = await system.ask('我想问问火');
    expect(r.ok).toBe(true);
    expect(urls.some((u) => u.includes('/api/ai/ember-reply'))).toBe(true);
    expect(urls.some((u) => u.includes('/api/ai/kindle-letter'))).toBe(false);
  });

  it('ember 404 → 打 kindle-letter 兜底', async () => {
    const urls = [];
    const fetch = vi.fn(async (url) => {
      urls.push(String(url));
      if (String(url).includes('/api/ai/ember-reply')) {
        return new Response(JSON.stringify({ error: 'not-found' }), { status: 404 });
      }
      return okReply('炉火回信·kindle');
    });
    const game = mkGame(fetch, { enabled: true });
    const system = new KindleLetterSystem(game);
    const r = await system.ask('我想问问火');
    expect(r.ok).toBe(true);
    expect(r.turn.reply).toBe('炉火回信·kindle');
    expect(urls.some((u) => u.includes('/api/ai/ember-reply'))).toBe(true);
    expect(urls.some((u) => u.includes('/api/ai/kindle-letter'))).toBe(true);
  });

  it('ember 503 → 打 kindle-letter 兜底', async () => {
    const urls = [];
    const fetch = vi.fn(async (url) => {
      urls.push(String(url));
      if (String(url).includes('/api/ai/ember-reply')) {
        return new Response(JSON.stringify({ error: 'advisor-unavailable', reason: 'circuit-open' }), { status: 503 });
      }
      return okReply('炉火回信·kindle');
    });
    const game = mkGame(fetch, { enabled: true });
    const system = new KindleLetterSystem(game);
    const r = await system.ask('我想问问火');
    expect(r.ok).toBe(true);
    expect(r.turn.reply).toBe('炉火回信·kindle');
  });

  it('ember 与 kindle 都坏 → unavailable，零落盘', async () => {
    const urls = [];
    const fetch = vi.fn(async (url) => { urls.push(String(url)); return new Response('broken', { status: 503 }); });
    const game = mkGame(fetch, { enabled: true });
    const system = new KindleLetterSystem(game);
    const r = await system.ask('你好');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('unavailable');
    expect(system.snapshot().turns).toHaveLength(0);
    expect(urls.some((u) => u.includes('/api/ai/ember-reply'))).toBe(true);
    expect(urls.some((u) => u.includes('/api/ai/kindle-letter'))).toBe(true);
  });
});
