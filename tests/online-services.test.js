/**
 * 在线伙伴服务（W-X2）—— `src/online/OnlineServices.js` 单测。
 * 默认关闭；注入 fetch 桩后验证：不发请求 / 发请求并走 http / 失败吞掉不抛。
 */
import { describe, expect, it, vi } from 'vitest';
import { OnlineServices } from '../src/online/OnlineServices.js';

const BASE = 'https://gateway.example.com';

describe('默认关闭：不发任何网络请求', () => {
  it('enabled() 为 false，且 fetch 零调用', async () => {
    const fetch = vi.fn();
    const svc = new OnlineServices({ baseUrl: BASE, fetchImpl: fetch, enabled: false });
    expect(svc.enabled()).toBe(false);
    expect(await svc.postTelemetry('boss_defeated', 'void-chronarch')).toBe(false);
    expect(await svc.submitRun({ runner: 'x', bossId: 'void-chronarch', clearTimeMs: 1000, chapter: 5 })).toBe(false);
    expect(await svc.fetchLeaderboard(5)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('开启后：按契约走 HTTP', () => {
  it('postTelemetry POST 到 /api/telemetry/events，JSON 体正确', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ accepted: true }) });
    const svc = new OnlineServices({ baseUrl: BASE + '/', fetchImpl: fetch, enabled: true });
    expect(svc.enabled()).toBe(true);
    expect(await svc.postTelemetry('boss_defeated', 'void-chronarch')).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${BASE}/api/telemetry/events`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ type: 'boss_defeated', detail: 'void-chronarch' });
  });

  it('fetchLeaderboard 带 limit 查询，解析返回对象', async () => {
    const payload = { items: [{ runner: '甲' }], count: 1, maxLimit: 10 };
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => payload });
    const svc = new OnlineServices({ baseUrl: BASE, fetchImpl: fetch, enabled: true });
    expect(await svc.fetchLeaderboard(3)).toEqual(payload);
    expect(fetch.mock.calls[0][0]).toBe(`${BASE}/api/leaderboard?limit=3`);
  });
});

describe('失败路径：吞掉错误，绝不向上抛', () => {
  it('HTTP 500 → postTelemetry 返回 false 且不抛', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const svc = new OnlineServices({ baseUrl: BASE, fetchImpl: fetch, enabled: true });
    await expect(svc.postTelemetry('boss_defeated', 'x')).resolves.toBe(false);
  });

  it('网络异常 → fetchLeaderboard 返回 null 且不抛', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const svc = new OnlineServices({ baseUrl: BASE, fetchImpl: fetch, enabled: true });
    await expect(svc.fetchLeaderboard(10)).resolves.toBeNull();
  });

  it('submitRun 非 2xx → false', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    const svc = new OnlineServices({ baseUrl: BASE, fetchImpl: fetch, enabled: true });
    expect(await svc.submitRun({ runner: 'x', bossId: 'y', clearTimeMs: 1, chapter: 5 })).toBe(false);
  });
});
