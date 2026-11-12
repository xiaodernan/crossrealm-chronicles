/**
 * W-Z8 切片2：设置页「星轨诊断」——按下才读 /api/ops/advisor，一句话答「顾问侧活着吗、队列深不深」
 *
 * 三件事必须钉住：
 * 1) OnlineServices.fetchOpsAdvisor 默认关闭（不启用时返回 null，fetchImpl 根本不被调用）；
 * 2) 启用 + fetchImpl 成功时原样返回 JSON；非 2xx / 异常 / 超时 → null（吞错）；
 * 3) 设置面板 index.html / SettingsPanel.js 挂了 #set-online-diag 与 #set-online-diag-result，
 *    结果行只走 textContent（绝不 innerHTML），zh/en 双表三键齐全。
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OnlineServices } from '../src/online/OnlineServices.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';

const ROOT = process.cwd();
const PANEL = readFileSync(join(ROOT, 'src/ui/SettingsPanel.js'), 'utf8');
const INDEX = readFileSync(join(ROOT, 'index.html'), 'utf8');

describe('fetchOpsAdvisor 不启用 → null', () => {
  it('enabled=false → fetchImpl 零调用', async () => {
    const fetchImpl = vi.fn();
    const o = new OnlineServices({ baseUrl: 'http://localhost:1', enabled: false, fetchImpl });
    expect(await o.fetchOpsAdvisor()).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('fetchOpsAdvisor 启用路径', () => {
  it('200 原样返回 { health, jobs }', async () => {
    const payload = {
      health: { available: true, configured: true, model: 'gpt-6-sol', circuit: 'CLOSED', cache: { hits: 41 }, upstreamCalls: 128 },
      jobs: { available: true, capacity: 64, depth: 0, inFlight: 0, enqueued: 90, rejected: 1, dedupHits: 3, done: 87, deadLettered: 1 },
    };
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    const o = new OnlineServices({ baseUrl: 'http://localhost:1', enabled: true, fetchImpl });
    expect(await o.fetchOpsAdvisor()).toEqual(payload);
    expect(fetchImpl.mock.calls[0][0]).toBe('http://localhost:1/api/ops/advisor');
  });

  it('非 2xx → null', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    const o = new OnlineServices({ baseUrl: 'http://localhost:1', enabled: true, fetchImpl });
    expect(await o.fetchOpsAdvisor()).toBeNull();
  });

  it('fetch 抛错 → 吞错返 null，不向上传', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const o = new OnlineServices({ baseUrl: 'http://localhost:1', enabled: true, fetchImpl });
    await expect(o.fetchOpsAdvisor()).resolves.toBeNull();
  });
});

describe('面板接线存在（源码结构断言）', () => {
  it('index.html 里有 set-online-diag 与 set-online-diag-result，挂 data-i18n', () => {
    expect(INDEX).toContain('id="set-online-diag"');
    expect(INDEX).toContain('id="set-online-diag-result"');
    expect(INDEX).toContain('data-i18n="settings_online_diag_btn"');
  });
  it('SettingsPanel 里有对应监听器、调用 fetchOpsAdvisor / fetchDeadLetterSummary、写 textContent 结果', () => {
    expect(PANEL).toContain("getElementById('set-online-diag')");
    expect(PANEL).toContain('onlineServices.fetchOpsAdvisor()');
    expect(PANEL).toContain('onlineServices.fetchDeadLetterSummary');
    expect(PANEL).toContain("t('settings_online_diag_ok'");
    expect(PANEL).toContain("t('settings_online_diag_unavailable'");
    expect(PANEL).toContain("t('settings_online_diag_dlq_fmt'");
    expect(PANEL).not.toContain("diag-result').innerHTML");
  });
});

describe('fetchDeadLetterSummary 启用路径（W-Z8 切片3）', () => {
  it('200 原样返回 { available, count, items, reasons }', async () => {
    const payload = {
      available: true,
      count: 2,
      limit: 20,
      items: [
        { id: 'j1', reason: 'not-configured', attempts: 1 },
        { id: 'j2', reason: 'not-configured', attempts: 2 },
      ],
      reasons: { 'not-configured': 2 },
    };
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    const o = new OnlineServices({ baseUrl: 'http://localhost:1', enabled: true, fetchImpl });
    expect(await o.fetchDeadLetterSummary()).toEqual(payload);
    expect(fetchImpl.mock.calls[0][0]).toBe('http://localhost:1/api/ops/dead-letter');
  });

  it('非 2xx / 抛错 → null（吞掉，不向上传）', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    const o = new OnlineServices({ baseUrl: 'http://localhost:1', enabled: true, fetchImpl });
    expect(await o.fetchDeadLetterSummary()).toBeNull();
    const boom = new OnlineServices({ baseUrl: 'http://localhost:1', enabled: true, fetchImpl: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) });
    expect(await boom.fetchDeadLetterSummary()).toBeNull();
  });

  it('未启用 → null，fetchImpl 零调用', async () => {
    const fetchImpl = vi.fn();
    const o = new OnlineServices({ baseUrl: 'http://localhost:1', enabled: false, fetchImpl });
    expect(await o.fetchDeadLetterSummary()).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('zh/en 双表三键', () => {
  const keys = ['settings_online_diag_btn', 'settings_online_diag_ok', 'settings_online_diag_unavailable', 'settings_online_diag_dlq_fmt'];
  it('zh', () => { const set = new Set(ZH_KEYS); for (const k of keys) expect(set).toContain(k); });
  it('en', () => { const set = new Set(EN_KEYS); for (const k of keys) expect(set).toContain(k); });
});
