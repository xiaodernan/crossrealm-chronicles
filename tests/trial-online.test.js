/**
 * 位面试炼榜的客户端出口（W-F3 切片6）。
 *
 * 这一层量的是**两条榜没有串线**：
 * ① 试炼成绩走 `/api/trials/runs`，Boss 通关走 `/api/leaderboard` —— 两条路各走各的；
 * ② 未启用时**一次请求都不发**（默认关闭是硬承诺，不是"发一个空请求");
 * ③ 非 2xx / 抛异常都吞成 `false` / `null`，绝不让网络问题打断本地游戏；
 * ④ `Game` 的 `trial-finished` 交的是分数与赛季，**不再是冒充 bossId 的 `trial-layer-N`**。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OnlineServices } from '../src/online/OnlineServices.js';

const 源 = (rel) => readFileSync(join(process.cwd(), 'src', ...rel.split('/')), 'utf8');

/** 记下每次请求的 fetch 假件 */
function 记请求(res = { ok: true, status: 201, json: async () => ({ accepted: true }) }) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return res;
  };
  return { calls, fetchImpl };
}

describe('试炼榜 · 提交', () => {
  it('未启用时一次请求都不发（默认关闭是硬承诺）', async () => {
    const { calls, fetchImpl } = 记请求();
    const net = new OnlineServices({ baseUrl: 'http://x', fetchImpl, enabled: false });
    const ok = await net.submitTrialRun({ runner: 'a', seasonId: 'ember', score: 1, layersCleared: 0, secondsLeft: 0 });
    expect(ok).toBe(false);
    expect(calls.length).toBe(0);
  });

  it('启用后 POST 到 /api/trials/runs，body 原样带上', async () => {
    const { calls, fetchImpl } = 记请求();
    const net = new OnlineServices({ baseUrl: 'http://x', fetchImpl, enabled: true });
    const run = { runner: 'adventurer', seasonId: 'tide', score: 512, layersCleared: 5, secondsLeft: 12 };
    expect(await net.submitTrialRun(run)).toBe(true);
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe('http://x/api/trials/runs');
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(calls[0].init.body)).toEqual(run);
  });

  it('非 2xx → false，不抛', async () => {
    const { fetchImpl } = 记请求({ ok: false, status: 400, json: async () => ({}) });
    const net = new OnlineServices({ baseUrl: 'http://x', fetchImpl, enabled: true });
    expect(await net.submitTrialRun({})).toBe(false);
  });

  it('fetch 抛异常 → false，不抛（网络不好不能打断本地游戏）', async () => {
    const net = new OnlineServices({
      baseUrl: 'http://x',
      fetchImpl: async () => { throw new Error('offline'); },
      enabled: true,
    });
    expect(await net.submitTrialRun({})).toBe(false);
  });
});

describe('试炼榜 · 拉取', () => {
  it('未启用时返回 null 且不发请求', async () => {
    const { calls, fetchImpl } = 记请求();
    const net = new OnlineServices({ baseUrl: 'http://x', fetchImpl, enabled: false });
    expect(await net.fetchTrialLeaderboard('ember')).toBe(null);
    expect(calls.length).toBe(0);
  });

  it('带赛季与条数两个查询参数', async () => {
    const { calls, fetchImpl } = 记请求({ ok: true, status: 200, json: async () => ({ items: [], count: 0 }) });
    const net = new OnlineServices({ baseUrl: 'http://x', fetchImpl, enabled: true });
    const board = await net.fetchTrialLeaderboard('gloom', 5);
    expect(board).toEqual({ items: [], count: 0 });
    expect(calls[0].url).toBe('http://x/api/trials/leaderboard?season=gloom&limit=5');
  });

  it('省略赛季 = 跨季总榜（不带 season 参数）', async () => {
    const { calls, fetchImpl } = 记请求({ ok: true, status: 200, json: async () => ({ items: [] }) });
    const net = new OnlineServices({ baseUrl: 'http://x', fetchImpl, enabled: true });
    await net.fetchTrialLeaderboard();
    expect(calls[0].url).toBe('http://x/api/trials/leaderboard?limit=10');
  });

  it('非 2xx / 抛异常 → null', async () => {
    const bad = new OnlineServices({
      baseUrl: 'http://x',
      fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }),
      enabled: true,
    });
    expect(await bad.fetchTrialLeaderboard()).toBe(null);
    const boom = new OnlineServices({
      baseUrl: 'http://x',
      fetchImpl: async () => { throw new Error('boom'); },
      enabled: true,
    });
    expect(await boom.fetchTrialLeaderboard()).toBe(null);
  });
});

describe('试炼榜 · 与 Boss 榜没有串线', () => {
  it('两个提交入口打的是两条不同的路', async () => {
    const { calls, fetchImpl } = 记请求();
    const net = new OnlineServices({ baseUrl: 'http://x', fetchImpl, enabled: true });
    await net.submitRun({ runner: 'a', bossId: 'shadow-warden', clearTimeMs: 1, chapter: 1 });
    await net.submitTrialRun({ runner: 'a', seasonId: 'ember', score: 1, layersCleared: 0, secondsLeft: 0 });
    expect(calls.map((c) => c.url)).toEqual([
      'http://x/api/leaderboard',
      'http://x/api/trials/runs',
    ]);
  });

  it('Game 的 trial-finished 交的是分数与赛季，不再是冒充 bossId 的 trial-layer-N', () => {
    const s = 源('core/Game.js');
    expect(s).toMatch(/onlineServices\.submitTrialRun\(\{/);
    expect(s).toMatch(/seasonId: seasonId \|\| 'unknown'/);
    expect(s).toMatch(/score: e\.detail\?\.score \?\? 0/);
    // 反面证据：那条假 bossId 必须彻底消失（它会让服务端多出五个不存在的 Boss）
    expect(s).not.toMatch(/trial-layer-\$\{/);
    const 试炼段 = s.slice(s.indexOf("gameOn('trial-finished'"), s.indexOf("gameOn('game-audio-mode'"));
    expect(试炼段, '试炼结束还在往 Boss 榜里塞').not.toMatch(/submitRun\(/);
  });
});
