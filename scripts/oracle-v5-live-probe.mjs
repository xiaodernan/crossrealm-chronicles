#!/usr/bin/env node
/**
 * oracle-v5-live-probe · W-Z485 —— 史诗深潜双语全量前缀（~8-9万 tok）真上游实测。
 *
 * 与 v4 探针同形：读 oracle-v5-frozen-prefix.txt（逐字），两条同 prefix 请求，
 * system 带 cache_control:ephemeral + prompt_cache_key=crossrealm-oracle-deep-v1（独立 lane，
 * 与 v4/v3 并行会话缓存隔离），上报 prompt_tokens / cached_tokens / cachedRatio / latency。
 * max_tokens 压到 32，省 token；只发 2 条（冷 + 暖），不连环刷。
 *
 * 前提：LLM_PROXY_URL=http://127.0.0.1:7897（Clash Verge 混合端口）。
 * 用法：node scripts/oracle-v5-live-probe.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { proxyIsSet, curlJsonPost } from './_curl-proxy.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
try {
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* fall back to process env */ }
const KEY = env.LLM_API_KEY || process.env.LLM_API_KEY;
const BASE = (env.LLM_BASE_URL || process.env.LLM_BASE_URL || 'https://api.aizzz.xyz/v1').replace(/\/+$/, '');
const MODEL = env.LLM_MODEL || process.env.LLM_MODEL || 'gpt-6.2-sol';
const CACHE_KEY = 'crossrealm-oracle-deep-v1';
if (!KEY) { console.error('oracle-v5-live-probe: 缺少 LLM_API_KEY'); process.exit(1); }
if (!proxyIsSet()) { console.error('oracle-v5-live-probe: 未设置 LLM_PROXY_URL（须 127.0.0.1:7897）'); process.exit(1); }

const prefix = readFileSync(join(ROOT, 'server', 'ai-service', 'src', 'main', 'resources', 'ai', 'oracle-v5-frozen-prefix.txt'), 'utf8');
console.log('oracle-v5-live-probe: prefix=%sKB model=%s cacheKey=%s（不打印密钥）', (Buffer.byteLength(prefix) / 1024).toFixed(1), MODEL, CACHE_KEY);

const ask = async (label, question) => {
  const body = {
    model: MODEL,
    prompt_cache_key: CACHE_KEY,
    messages: [
      { role: 'system', content: prefix, cache_control: { type: 'ephemeral' } },
      { role: 'user', content: '玩家提问（用提问所用语言回答，一句话）：\n' + question },
    ],
    max_tokens: 32,
    temperature: 0,
    stream: true,
    stream_options: { include_usage: true },
  };
  const t0 = Date.now();
  const res = await curlJsonPost(`${BASE}/chat/completions`,
    { 'content-type': 'application/json', accept: 'text/event-stream', authorization: 'Bearer ' + KEY },
    body, 240000);
  const latency = Date.now() - t0;
  if (res.status !== 200) {
    console.log(`${label}: HTTP ${res.status} · ${String(res.body).slice(0, 160)}`);
    return { http: res.status, body: String(res.body).slice(0, 200) };
  }
  let cached = null, prompt = null, completion = null, text = '';
  for (const line of String(res.body).split('\n')) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (data === '[DONE]') continue;
    try {
      const j = JSON.parse(data);
      const delta = j.choices?.[0]?.delta?.content;
      if (delta) text += delta;
      if (j.usage) {
        prompt = j.usage.prompt_tokens ?? prompt;
        completion = j.usage.completion_tokens ?? completion;
        cached = j.usage.prompt_tokens_details?.cached_tokens ?? j.usage.cached_tokens ?? cached;
      }
    } catch { /* partial chunk */ }
  }
  const ratio = cached && prompt ? Math.round(1000 * cached / prompt) / 10 : null;
  console.log(`${label}: HTTP 200 · prompt=${prompt} · cached=${cached} · completion=${completion} · cache=${ratio === null ? 'n/a' : ratio + '%'} · ${latency}ms · answer=${String(text).slice(0, 50).replace(/\n/g, ' ')}`);
  return { prompt, cached, completion, ratio, latencyMs: latency };
};

const q = '《跨界纪事》里的锚火象征什么？用一句话答。';
const first = await ask('① v5 双语全量前缀 · 第 1 次（冷页）', q);
await new Promise((r) => setTimeout(r, 1200));
const second = await ask('② v5 双语全量前缀 · 第 2 次（暖页）', q);

const record = {
  schema: 'crossrealm.oracle-v5-live-probe.v1',
  generatedAt: new Date().toISOString(),
  model: MODEL,
  base: BASE,
  cacheKey: CACHE_KEY,
  prefixBytes: Buffer.byteLength(prefix),
  question: q,
  calls: [first, second],
};
if (process.argv.includes('--json')) { console.log(JSON.stringify(record, null, 2)); process.exit(0); }
mkdirSync(join(ROOT, 'docs', 'admin', 'data'), { recursive: true });
const out = join(ROOT, 'docs', 'admin', 'data', 'oracle-v5-live-probe-2026-11-21.json');
writeFileSync(out, JSON.stringify(record, null, 2), 'utf8');
console.log('oracle-v5-live-probe: wrote ' + out);