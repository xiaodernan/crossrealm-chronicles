/**
 * 星轨顾问（W-Y2 切片1）— 契约与失败模式单测。
 *
 * 四件事各钉一遍：
 * 1. `ADVISOR_ERROR_REASONS` 每一种都有 `ERROR_KEYS` 映射（新增原因忘了给文案会红），
 *    且映射值互不重复（两个原因指向同一句提示=玩家无法区分「断网」和「没开在线」）。
 * 2. 内容层收敛：`normalizeAdvisorQuestion`（折行+限长）与 `normalizeAdvisorContext`
 *    （snake_case 键 / 标量值 / 8 条 / 120 字）与服务端 `@Valid` 对齐。
 * 3. `OnlineServices.askAdvisor / fetchAdvisorHealth` 的 ok/reason 映射全枚举——
 *    disabled(零网络)/blank/ok/http/bad-json/network/timeout/cancelled。
 * 4. 顾问链路用到的每一个 `advisor_*` 文案键在 zh/en 两表齐全（芯片的 key 直接发给模型，
 *    缺键=把键名原样发给大模型）。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  ADVISOR_LIMITS,
  ADVISOR_REASONS,
  ADVISOR_ERROR_REASONS,
  ADVISOR_SUGGESTIONS,
  normalizeAdvisorQuestion,
  normalizeAdvisorContext,
} from '../src/content/advisor.js';
import { ERROR_KEYS } from '../src/ui/AdvisorPanel.js';
import { OnlineServices } from '../src/online/OnlineServices.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';

const BASE = 'https://gateway.example.com';

/** 面板会用到的全部 advisor_* 键（index.html + AdvisorPanel + style.css 注释不在内） */
const PANEL_KEYS = [
  'advisor_fab', 'advisor_fab_aria', 'advisor_aria_label', 'advisor_title',
  'advisor_subtitle', 'advisor_close_aria', 'advisor_greeting', 'advisor_thinking',
  'advisor_suggestion_build', 'advisor_suggestion_season', 'advisor_suggestion_trial',
  'advisor_input_aria', 'advisor_input_placeholder', 'advisor_send', 'advisor_stop',
  'advisor_disclaimer',
  'advisor_status_checking', 'advisor_status_ready', 'advisor_status_offline', 'advisor_status_degraded',
  'advisor_error_disabled', 'advisor_error_timeout', 'advisor_error_network',
  'advisor_error_bad_json', 'advisor_error_blank', 'advisor_error_cancelled',
  'advisor_error_unavailable', 'advisor_error_http_fmt', 'advisor_error_busy',
  'advisor_meta_fmt', 'advisor_cached', 'advisor_meta_upstream_fmt', 'advisor_cached_upstream', 'advisor_char_count_fmt',
];

describe('ERROR_KEYS 全覆盖：每一个失败原因都有且唯一一句玩家文案', () => {
  it('ADVISOR_ERROR_REASONS 每个 reason 都有 ERROR_KEYS 映射', () => {
    for (const reason of ADVISOR_ERROR_REASONS) {
      expect(ERROR_KEYS[reason], `reason=${reason} 缺文案`).toBeTruthy();
      expect(typeof ERROR_KEYS[reason]).toBe('string');
      expect(ERROR_KEYS[reason]).toMatch(/^advisor_error_/);
    }
  });

  it('ERROR_KEYS 映射值互不重复', () => {
    const values = Object.values(ERROR_KEYS);
    expect(new Set(values).size).toBe(values.length);
  });

  it('ERROR_KEYS 是冻结的纯对象', () => {
    expect(Object.isFrozen(ERROR_KEYS)).toBe(true);
    expect(ADVISOR_ERROR_REASONS.length).toBeGreaterThanOrEqual(7);
  });
});

describe('文案两表齐全：index.html / 面板用到的每一个键', () => {
  it.each(PANEL_KEYS)('zh 表含 %s', (key) => {
    expect(ZH_KEYS).toContain(key);
  });
  it.each(PANEL_KEYS)('en 表含 %s', (key) => {
    expect(EN_KEYS).toContain(key);
  });
  it('ADVISOR_SUGGESTIONS 芯片的 key 两表齐全（缺键 = 把键名原样发给模型）', () => {
    for (const s of ADVISOR_SUGGESTIONS) {
      expect(ZH_KEYS).toContain(s.key);
      expect(EN_KEYS).toContain(s.key);
    }
  });
});

describe('normalizeAdvisorQuestion：折行、去首尾、限长', () => {
  it('折叠换行/制表/连续空白为单空格', () => {
    expect(normalizeAdvisorQuestion('  篝火\n\n要灭了\t了呢  ')).toBe('篝火 要灭了 了呢');
  });
  it('限长到 ADVISOR_LIMITS.questionMax', () => {
    const long = '长'.repeat(ADVISOR_LIMITS.questionMax + 50);
    expect(normalizeAdvisorQuestion(long)).toHaveLength(ADVISOR_LIMITS.questionMax);
  });
  it('非字符串与纯空白 → 空串', () => {
    expect(normalizeAdvisorQuestion(null)).toBe('');
    expect(normalizeAdvisorQuestion(12345)).toBe('');
    expect(normalizeAdvisorQuestion('   \n \t ')).toBe('');
  });
});

describe('normalizeAdvisorContext：只收 snake_case 标量，最多 8 条，值限 120 字', () => {
  it('数字/布尔/字符串标量保留为字符串', () => {
    const out = normalizeAdvisorContext({ season: 'ember', day_in_cycle: 7, souls_on: true });
    expect(out).toEqual({ season: 'ember', day_in_cycle: '7', souls_on: 'true' });
  });
  it('键名不合规丢弃（大小写/连字符/前导数字/全大写）', () => {
    const out = normalizeAdvisorContext({
      Foo: 'x', 'a-b': 'x', '1st': 'x', UPPER: 'x', fine_key: 'ok',
    });
    expect(out).toEqual({ fine_key: 'ok' });
  });
  it('对象/数组/函数值丢弃（上下文是拼进提示词的数据，不是循环引用的出口）', () => {
    const out = normalizeAdvisorContext({
      obj: { nested: 1 }, arr: [1, 2], fn: () => 1, ok: 'yes',
    });
    expect(out).toEqual({ ok: 'yes' });
  });
  it('最多取 ADVISOR_LIMITS.contextMaxEntries 条', () => {
    const raw = Object.fromEntries(
      Array.from({ length: ADVISOR_LIMITS.contextMaxEntries + 4 }, (_, i) => [`key_${i}`, `${i}`]),
    );
    expect(Object.keys(normalizeAdvisorContext(raw))).toHaveLength(ADVISOR_LIMITS.contextMaxEntries);
  });
  it('值限长 contextValueMax 且控制字符折成空格', () => {
    const out = normalizeAdvisorContext({ k: 'a\nb\t'.padEnd(400, 'x') });
    expect(out.k.length).toBeLessThanOrEqual(ADVISOR_LIMITS.contextValueMax);
    expect(out.k).not.toMatch(/[\r\n\t]/);
  });
  it('非对象输入 → 空对象', () => {
    expect(normalizeAdvisorContext(null)).toEqual({});
    expect(normalizeAdvisorContext('string')).toEqual({});
    expect(normalizeAdvisorContext([1, 2])).toEqual({});
  });
});

describe('OnlineServices.askAdvisor / fetchAdvisorHealth：ok/reason 映射全枚举', () => {
  it('未启用：disabled，且 fetch 零调用（离线零网络）', async () => {
    const fetch = vi.fn();
    const svc = new OnlineServices({ baseUrl: BASE, fetchImpl: fetch, enabled: false });
    const r = await svc.askAdvisor('在线吗', {});
    expect(r).toEqual({ ok: false, reason: ADVISOR_REASONS.DISABLED, status: 0, data: null });
    const h = await svc.fetchAdvisorHealth();
    expect(h.reason).toBe(ADVISOR_REASONS.DISABLED);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('空问题：blank，且 fetch 零调用', async () => {
    const fetch = vi.fn();
    const svc = new OnlineServices({ baseUrl: BASE, fetchImpl: fetch, enabled: true });
    const r = await svc.askAdvisor('   \n ', {});
    expect(r.reason).toBe(ADVISOR_REASONS.BLANK);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('成功：ok + 原样带回 data，问题在发出前收敛，init 是 AbortSignal', async () => {
    const payload = { answer: '星河在那之前已经有人走过', model: 'gpt-6-sol', cached: false, latencyMs: 3400 };
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => payload });
    const svc = new OnlineServices({ baseUrl: BASE, fetchImpl: fetch, enabled: true });
    const r = await svc.askAdvisor('  篝火要灭了，\n下一步呢  ', { season: 'ember', evil: { nested: 1 } });
    expect(r.ok).toBe(true);
    expect(r.reason).toBe(ADVISOR_REASONS.OK);
    expect(r.data).toEqual(payload);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${BASE}/api/ai/chat`);
    expect(init.method).toBe('POST');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const sent = JSON.parse(init.body);
    expect(sent.question).toBe('篝火要灭了， 下一步呢');
    expect(sent.context).toEqual({ season: 'ember' }); // 对象值被白名单化丢弃
  });

  it('HTTP 503 + JSON 体（网关熔断 advisor-unavailable）：reason=http，data 完整带回', async () => {
    const body = { error: 'advisor-unavailable', service: 'ai-service', reason: 'gateway-circuit-open' };
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => body });
    const svc = new OnlineServices({ baseUrl: BASE, fetchImpl: fetch, enabled: true });
    const r = await svc.askAdvisor('还活着吗', {});
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(ADVISOR_REASONS.HTTP);
    expect(r.status).toBe(503);
    expect(r.data).toEqual(body);
  });

  it('HTTP 429（W-Y4 队列背压）：reason=busy，不和 5xx 混成「连不上网关」', async () => {
    const body = { error: 'advisor-queue-full', retryAfterMs: 500 };
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => body });
    const svc = new OnlineServices({ baseUrl: BASE, fetchImpl: fetch, enabled: true });
    const r = await svc.askAdvisor('还活着吗', {});
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(ADVISOR_REASONS.BUSY);
    expect(r.status).toBe(429);
    expect(r.data).toEqual(body);
  });

  it('HTTP 500 + 非 JSON 体（网关的纯文本错误页）：reason=http，data=null', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error('bad'); } });
    const svc = new OnlineServices({ baseUrl: BASE, fetchImpl: fetch, enabled: true });
    const r = await svc.askAdvisor('还活着吗', {});
    expect(r.reason).toBe(ADVISOR_REASONS.HTTP);
    expect(r.status).toBe(500);
    expect(r.data).toBeNull();
  });

  it('2xx 但响应体不是 JSON：reason=bad-json', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error('bad'); } });
    const svc = new OnlineServices({ baseUrl: BASE, fetchImpl: fetch, enabled: true });
    const r = await svc.askAdvisor('还活着吗', {});
    expect(r.reason).toBe(ADVISOR_REASONS.BAD_JSON);
    expect(r.status).toBe(200);
  });

  it('网络异常：reason=network（吞掉不上抛）', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const svc = new OnlineServices({ baseUrl: BASE, fetchImpl: fetch, enabled: true });
    const r = await svc.askAdvisor('还活着吗', {});
    expect(r.reason).toBe(ADVISOR_REASONS.NETWORK);
    expect(r.status).toBe(0);
  });

  it('上游超时（TimeoutError）：reason=timeout', async () => {
    const err = new Error('timed out');
    err.name = 'TimeoutError';
    const fetch = vi.fn().mockRejectedValue(err);
    const svc = new OnlineServices({ baseUrl: BASE, fetchImpl: fetch, enabled: true });
    const r = await svc.askAdvisor('还活着吗', {});
    expect(r.reason).toBe(ADVISOR_REASONS.TIMEOUT);
  });

  it('外部 AbortController 触发的取消：reason=cancelled', async () => {
    const controller = new AbortController();
    const err = new Error('aborted');
    err.name = 'AbortError';
    const fetch = vi.fn().mockImplementation(() => {
      controller.abort(); // 模拟上层在 fetch Promise reject 之前 abort
      return Promise.reject(err);
    });
    const svc = new OnlineServices({ baseUrl: BASE, fetchImpl: fetch, enabled: true });
    const r = await svc.askAdvisor('还活着吗', {}, { signal: controller.signal });
    expect(r.reason).toBe(ADVISOR_REASONS.CANCELLED);
  });

  it('fetchAdvisorHealth 走 GET /api/ai/health 且带 AbortSignal', async () => {
    const payload = { configured: true, model: 'gpt-6-sol', circuit: 'CLOSED' };
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => payload });
    const svc = new OnlineServices({ baseUrl: BASE, fetchImpl: fetch, enabled: true });
    const r = await svc.fetchAdvisorHealth();
    expect(r.ok).toBe(true);
    expect(r.data).toEqual(payload);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${BASE}/api/ai/health`);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
