/**
 * W-Z7 切片B（前端半边）：OnlineServices.askAdvisorBackground ——
 * 提交 POST /api/ai/chat/async → 202 {jobId, pollAfterMs} → 轮询 /api/ai/jobs/{id} 至终态。
 *
 * 钉住的契约：
 * 1) 未启用 → reason=disabled，fetchImpl 零调用；
 * 2) 快乐路径：submit 带客户端生成的 requestId（幂等键）+ pollAfterMs 一拍一拍问；DONE 带 answer 回来；
 * 3) DEAD（任何原因）→ 映射成 http/503/advisor-unavailable（面板复用"503"那一格，不新造文案键）；
 * 4) submit 429 → busy；
 * 5) signal 已 abort：停止轮询 + 发起 cancel POST（火而不管）→ reason=cancelled；
 * 6) 轮询连续失败 3 次 → NETWORK（不在死网上空转到预算耗尽）；404 → 就近 bad-json。
 */
import { describe, expect, it, vi } from 'vitest';
import { OnlineServices } from '../src/online/OnlineServices.js';

const BASE = 'https://gateway.example.com';
const okJson = (payload, status = 200) => ({ ok: true, status, json: async () => payload });
const failRes = (status = 500) => ({ ok: false, status, json: async () => ({}) });

describe('askAdvisorBackground：未启用 → disabled', () => {
  it('enabled=false → fetchImpl 零调用', async () => {
    const fetchImpl = vi.fn();
    const svc = new OnlineServices({ baseUrl: BASE, enabled: false, fetchImpl });
    expect(await svc.askAdvisorBackground('往哪走？', {})).toEqual({
      ok: false, reason: 'disabled', status: 0, data: null,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('blank 问题不发请求', async () => {
    const fetchImpl = vi.fn();
    const svc = new OnlineServices({ baseUrl: BASE, enabled: true, fetchImpl });
    const res = await svc.askAdvisorBackground('   \n  ', {});
    expect(res.reason).toBe('blank');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('askAdvisorBackground：快乐路径 → DONE', () => {
  it('submit 带幂等键；轮询到 DONE 带 answer 回来', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(okJson({ jobId: 'job-123', status: 'queued', duplicate: false, pollAfterMs: 1 }, 202))
      .mockResolvedValue(okJson({ jobId: 'job-123', status: 'DONE', answer: '星图说：往北', model: 'gpt-6-sol', cached: true, latencyMs: 42 }));
    const svc = new OnlineServices({ baseUrl: BASE, enabled: true, fetchImpl });
    const res = await svc.askAdvisorBackground('往哪走？', { season: 'ember' });
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ answer: '星图说：往北', model: 'gpt-6-sol', cached: true, latencyMs: 42 });

    const [submitUrl, submitInit] = fetchImpl.mock.calls[0];
    expect(submitUrl).toBe(`${BASE}/api/ai/chat/async`);
    expect(submitInit.method).toBe('POST');
    const body = JSON.parse(submitInit.body);
    expect(body.question).toBe('往哪走？');
    expect(body.context).toEqual({ season: 'ember' });
    expect(typeof body.requestId).toBe('string');
    expect(body.requestId.length).toBeGreaterThan(8);

    const pollUrl = fetchImpl.mock.calls[1][0];
    expect(pollUrl).toBe(`${BASE}/api/ai/jobs/job-123`);
  });

  it('DEAD 映射成 503 + advisor-unavailable（不新造文案键）', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(okJson({ jobId: 'job-dead', status: 'queued', pollAfterMs: 1 }, 202))
      .mockResolvedValue(okJson({ jobId: 'job-dead', status: 'DEAD', reason: 'not-configured' }));
    const svc = new OnlineServices({ baseUrl: BASE, enabled: true, fetchImpl });
    const res = await svc.askAdvisorBackground('往哪走？', {});
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('http');
    expect(res.status).toBe(503);
    expect(res.data?.error).toBe('advisor-unavailable');
  });

  it('submit 429 → busy（队列背压不是「连不上网关」）', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ error: 'advisor-queue-full', retryAfterMs: 2500 }) });
    const svc = new OnlineServices({ baseUrl: BASE, enabled: true, fetchImpl });
    const res = await svc.askAdvisorBackground('往哪走？', {});
    expect(res.reason).toBe('busy');
    expect(res.status).toBe(429);
  });
});

describe('askAdvisorBackground：取消真取消', () => {
  it('signal 已 abort：停止轮询并发 cancel POST，reason=cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(okJson({ jobId: 'job-cancel', status: 'queued', pollAfterMs: 1 }, 202))
      .mockResolvedValue(okJson({ jobId: 'job-cancel', status: 'CANCELLED', cancelled: true }));
    const svc = new OnlineServices({ baseUrl: BASE, enabled: true, fetchImpl });
    const res = await svc.askAdvisorBackground('往哪走？', {}, { signal: controller.signal });
    expect(res.reason).toBe('cancelled');
    const calls = fetchImpl.mock.calls.map(([u]) => u);
    expect(calls).toContain(`${BASE}/api/ai/jobs/job-cancel/cancel`);
    const cancelInit = fetchImpl.mock.calls.find(([u]) => u.endsWith('/cancel'))[1];
    expect(cancelInit.method).toBe('POST');
  });
});

describe('askAdvisorBackground：轮询失败的三次容忍', () => {
  it('连续 3 次轮询失败 → NETWORK', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(okJson({ jobId: 'job-net', status: 'queued', pollAfterMs: 1 }, 202))
      .mockResolvedValue(failRes(500));
    const svc = new OnlineServices({ baseUrl: BASE, enabled: true, fetchImpl });
    const res = await svc.askAdvisorBackground('往哪走？', {});
    expect(res.reason).toBe('network');
    // submit + 3 次轮询 = 4 次调用，不该更多（第 4 次会触发预算之外的空转）
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('轮询 404 → bad-json（任务没了，不死循环）', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(okJson({ jobId: 'job-404', status: 'queued', pollAfterMs: 1 }, 202))
      .mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'job-not-found' }) });
    const svc = new OnlineServices({ baseUrl: BASE, enabled: true, fetchImpl });
    const res = await svc.askAdvisorBackground('往哪走？', {});
    expect(res.reason).toBe('bad-json');
    expect(res.status).toBe(404);
  });
});
