/**
 * W-Z292 · 烬灯回信 · 烬火答 —— 终章之后炉火的记录者写回那一行。
 *
 * 四条必须钉死的线：
 * ① 终章未抉择 → 信纸 locked，线上零请求；
 * ② 在线服务关 → disabled，线上零请求；
 * ③ 在线服务开 + 炉火回一行 → 落盘 + 遥测；
 * ④ 在线服务开 + 垃圾回 → 零落盘 + 遥测记 false；LS 往返/40 封上限/控制字符净化。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { OnlineServices } from '../src/online/OnlineServices.js';
import { KindleLetterSystem, sanitizePlayerLine } from '../src/game/KindleLetterSystem.js';

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

const mkGame = (fetchImpl, { enabled = true, stats = mkStats() } = {}) => {
  const online = new OnlineServices({ baseUrl: BASE, fetchImpl, enabled });
  return {
    onlineServices: online,
    quests: { chapter: 5, stats },
    stats: { bossDefeated: {} },
    popCulture: { unlocked: new Set(['echo-homecoming-last-light']) },
    storyJournal: { addSilent: vi.fn() },
    dialog: { toast: vi.fn() },
    hud: undefined,
  };
};

describe('烬灯回信 · 资格门与在线门', () => {
  beforeEach(() => { globalThis.localStorage = LS_MOCK; LS_MOCK._map.clear(); });
  afterEach(() => { delete globalThis.localStorage; });

  it('终章未抉择 → eligible=false，零请求', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 200 }));
    const game = mkGame(fetch, { enabled: true, stats: { ...mkStats(), decisions: new Set() } });
    const system = new KindleLetterSystem(game);
    expect(system.isEligible()).toBe(false);
    expect(system.snapshot().eligible).toBe(false);
    const r = await system.ask('你好火');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('locked'); // 终章未抉择：系统层也先把门关上
    expect(fetch).not.toHaveBeenCalled();
  });

  it('在线服务未启用 → ask 回 disabled，零请求', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 200 }));
    const game = mkGame(fetch, { enabled: false });
    const system = new KindleLetterSystem(game);
    const r = await system.ask('你好火');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('disabled');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('enabled + 炉火回一行 → ok，落盘一封，遥测 true', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ available: true, reply: '这趟没白走——下一锅米要留给后来人。' })));
    const game = mkGame(fetch, { enabled: true });
    const system = new KindleLetterSystem(game);
    const r = await system.ask('我想问问火，我的这一趟值不值得');
    expect(r.ok).toBe(true);
    expect(r.turn.reply).toContain('下一锅米');
    expect(system.snapshot().turns).toHaveLength(1);
    expect(game.storyJournal.addSilent).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetch.mock.calls[0][1]?.body ?? '{}');
    expect(body.choice).toBe('keep');
    expect(body.lang).toBe('zh');
    expect(body.line).toContain('值不值得');
  });

  it('enabled + 垃圾响应 → unavailable，落盘零封', async () => {
    const fetch = vi.fn(async () => new Response('not-json', { status: 200 }));
    const game = mkGame(fetch, { enabled: true });
    const system = new KindleLetterSystem(game);
    const r = await system.ask('你好火');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('unavailable');
    expect(system.snapshot().turns).toHaveLength(0);
  });

  it('enabled + 熔断 503 → unavailable', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'advisor-unavailable', reason: 'circuit-open' }), { status: 503 }));
    const game = mkGame(fetch, { enabled: true });
    const system = new KindleLetterSystem(game);
    const r = await system.ask('你好火');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('unavailable');
  });

  it('空输入 → empty，零请求', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 200 }));
    const game = mkGame(fetch, { enabled: true });
    const system = new KindleLetterSystem(game);
    const r = await system.ask('   ');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('empty');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sanitizePlayerLine 净化控制字符并截断 120 字', () => {
    const noisy = '\u0000你好\u001b炉\r\n火' + '好'.repeat(500);
    expect(sanitizePlayerLine(noisy).length).toBeLessThanOrEqual(120);
    expect([...sanitizePlayerLine(noisy)].some((ch) => ch.codePointAt(0) < 32)).toBe(false);
  });

  it('LS 往返 + 40 封上限（reactivate 后内容还在；超出后最早的退掉）', async () => {
    const replies = Array.from({ length: 45 }, (_, i) => ({ available: true, reply: `回信 ${i + 1}` }));
    let call = 0;
    const fetch = vi.fn(async () => new Response(JSON.stringify(replies[call++ % replies.length])));
    const game = mkGame(fetch, { enabled: true });
    let system = new KindleLetterSystem(game);
    for (let i = 0; i < 45; i += 1) {
      await system.ask(`第 ${i + 1} 封`);
    }
    expect(system.snapshot().turns).toHaveLength(40);
    expect(system.snapshot().turns[0].line).toBe('第 6 封');
    expect(system.snapshot().turns[39].line).toBe('第 45 封');
    // 新实例：从 LS 复活
    system = new KindleLetterSystem(game);
    expect(system.snapshot().turns).toHaveLength(40);
    expect(system.snapshot().turns[39].reply).toBe('回信 45');
  });
});
