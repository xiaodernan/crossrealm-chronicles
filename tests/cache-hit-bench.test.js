import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULTS, buildRequestBody, getArg, hasFlag, normalizeBaseUrl, parseSse, reportPasses, runCacheBench,
} from '../scripts/cache-hit-bench.mjs';

const ROOT = process.cwd();
const SYSTEM = '冻结的系统提示'.repeat(80);

function sse({ prompt = 1000, cached = 0, model = 'gpt-6.2-sol' } = {}) {
  const usage = { prompt_tokens: prompt };
  if (cached !== null) usage.prompt_tokens_details = { cached_tokens: cached };
  return [
    `data: ${JSON.stringify({ model, choices: [{ delta: { content: '锚火' } }] })}`,
    '',
    `data: ${JSON.stringify({ model, usage })}`,
    '',
    'data: [DONE]',
    '',
    '',
  ].join('\n');
}

function config(overrides = {}) {
  return {
    apiKey: 'unit-test-key',
    systemPrompt: SYSTEM,
    calls: 2,
    gapMs: 0,
    sleepFn: async () => {},
    ...overrides,
  };
}

describe('cache-hit-bench：与 AiService 当前请求形状对齐', () => {
  it('默认模型、地址、车道和预算直接读 Java 真源对账', () => {
    const client = readFileSync(join(ROOT, 'server/ai-service/src/main/java/com/crossrealm/chronicles/ai/LlmClient.java'), 'utf8');
    const props = readFileSync(join(ROOT, 'server/ai-service/src/main/java/com/crossrealm/chronicles/ai/AiProperties.java'), 'utf8');
    expect(DEFAULTS.model).toBe(/private String model = "([^"]+)"/.exec(props)?.[1]);
    expect(DEFAULTS.baseUrl).toBe(/private String baseUrl = "([^"]+)"/.exec(props)?.[1]);
    expect(DEFAULTS.maxTokens).toBe(Number(/private int maxTokens = (\d+)/.exec(props)?.[1]));
    expect(DEFAULTS.lane).toBe(/public static final String ADVISOR = "([^"]+)"/.exec(client)?.[1]);
  });

  it('缺参不会误读下一个选项或 Node 路径，两种书写形式都能读到', () => {
    expect(getArg('--base', ['--calls=1'])).toBeUndefined();
    expect(getArg('--base', ['--calls', '1'])).toBeUndefined();
    expect(getArg('--base', ['--base', 'https://example.com'])).toBe('https://example.com');
    expect(getArg('--base', ['--base=https://example.com'])).toBe('https://example.com');
    expect(hasFlag('--json', ['--json'])).toBe(true);
    expect(hasFlag('--repeat', ['--repeat=true'])).toBe(true);
    expect(hasFlag('--json', ['--json=false'])).toBe(false);
  });

  it('地址无论是否带 /v1，都只请求 /v1/chat/completions', async () => {
    expect(normalizeBaseUrl('https://example.com')).toBe('https://example.com/v1');
    expect(normalizeBaseUrl('https://example.com/v1/')).toBe('https://example.com/v1');
    const requests = [];
    await runCacheBench(config({
      baseUrl: 'https://example.com',
      calls: 1,
      transport: async (request) => { requests.push(request); return { status: 200, body: sse() }; },
    }));
    expect(requests[0].url).toBe('https://example.com/v1/chat/completions');
  });

  it('真实请求体带车道键、ephemeral 前缀、流式 usage 与 320 输出预算', async () => {
    let sent;
    await runCacheBench(config({
      calls: 1,
      transport: async (request) => {
        sent = { body: JSON.parse(request.body), authorization: request.headers.authorization };
        return { status: 200, body: sse() };
      },
    }));
    expect(sent.authorization).toBe('Bearer unit-test-key');
    expect(sent.body).toEqual(buildRequestBody({
      model: DEFAULTS.model,
      lane: DEFAULTS.lane,
      system: SYSTEM,
      user: `玩家提问：${'什么是母题?请简短回答。'}`,
      maxTokens: DEFAULTS.maxTokens,
    }));
  });

  it('SSE 的 CRLF、拆块与最后 usage 都能读出，缺少 cached_tokens 不冒充零', () => {
    expect(parseSse(sse({ prompt: 1000, cached: 900 }).replace(/\n/g, '\r\n'))).toMatchObject({
      answer: '锚火', model: DEFAULTS.model, usage: { prompt_tokens: 1000 },
    });
    const missing = parseSse(sse({ cached: null }));
    expect(missing.usage.prompt_tokens).toBe(1000);
    expect(missing.usage.prompt_tokens_details).toBeUndefined();
  });
});

describe('cache-hit-bench：读数与退出码不会说假绿', () => {
  it('整体命中包含冷启，warm 命中去掉首发且能执行 90% 门槛', async () => {
    let call = 0;
    const report = await runCacheBench(config({
      transport: async () => ({ status: 200, body: sse({ prompt: 1000, cached: call++ === 0 ? 0 : 900 }) }),
    }));
    expect(report).toMatchObject({ failures: 0, usageMissing: 0, measuredCalls: 2,
      promptTotal: 2000, cachedTotal: 900, ratio: '45.0%', warmRatio: '90.0%' });
    expect(reportPasses(report, 90)).toBe(true);
    expect(reportPasses(report, 91)).toBe(false);
    expect(JSON.stringify(report)).not.toContain('unit-test-key');
  });

  it('HTTP 失败与 usage 缺失都让报告失败，缺失字段不把命中率算成 0%', async () => {
    const httpFailure = await runCacheBench(config({
      calls: 1,
      transport: async () => ({ status: 503, error: 'unavailable' }),
    }));
    expect(httpFailure.failures).toBe(1);
    expect(reportPasses(httpFailure)).toBe(false);

    const missingUsage = await runCacheBench(config({
      calls: 1,
      transport: async () => ({ status: 200, body: sse({ cached: null }) }),
    }));
    expect(missingUsage.usageMissing).toBe(1);
    expect(missingUsage.ratio).toBe('n/a');
    expect(reportPasses(missingUsage)).toBe(false);
  });

  it('非法车道与非法预算在第一次外呼前失败', async () => {
    let calls = 0;
    const transport = async () => { calls++; return { status: 200, body: sse() }; };
    await expect(runCacheBench(config({ lane: '<img>', transport }))).rejects.toThrow('lane');
    await expect(runCacheBench(config({ maxTokens: 0, transport }))).rejects.toThrow('maxTokens');
    expect(calls).toBe(0);
  });
});
