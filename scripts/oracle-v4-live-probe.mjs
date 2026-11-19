#!/usr/bin/env node
/**
 * oracle-v4-live-probe · W-Z2424（2026-11-19 补录）—— 把「全书背进 prompt」的 v4 冻结前缀
 * （26-28K tokens · GLOSSARY 全量 verbatim）**直接**送上游，实测真实 prompt-cache 行为。
 *
 * 背景：README 多处引用「~47K tokens prompt · cached≈44K · 93%」—— 那组数字产自
 * 生产 gateway 上游（live），但仓库里**从来没有一眼可见的单文件探针**把 v4 整副前缀
 * 自己送到上游去。本脚本补上这一刀：
 *
 *   1) 读 oracle-v4-frozen-prefix.txt（逐字，与线上 LlmClient 一致）
 *   2) 发两条同 prefix 请求（system cache_control:ephemeral + prompt_cache_key=crossrealm-canon-v1）
 *   3) 报告 prompt_tokens / cached_tokens / cachedRatio / latency
 *   4) 把产物写进 docs/admin/data/oracle-v4-live-probe-2026-11-19.json
 *
 * 解读：命中差异只来自上游 cache page 当前内容——warm≈冷都会命中（前缀此前跑过）。
 * 不设 pass/fail 阈值：数字如实上报，稳定就报稳定。
 *
 * 前提：LLM_PROXY_URL=http://127.0.0.1:7897（Clash Verge 混合端口），否则上游 Cloudflare 全量 403。
 * 用法：node scripts/oracle-v4-live-probe.mjs
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
if (!KEY) { console.error('oracle-v4-live-probe: 缺少 LLM_API_KEY'); process.exit(1); }
if (!proxyIsSet()) { console.error('oracle-v4-live-probe: 未设置 LLM_PROXY_URL（须 127.0.0.1:7897 Clash 混合端口）'); process.exit(1); }

const prefix = readFileSync(join(ROOT, 'server', 'ai-service', 'src', 'main', 'resources', 'ai', 'oracle-v4-frozen-prefix.txt'), 'utf8');
console.log('oracle-v4-live-probe: prefix=%sKB model=%s base=%s cacheKey=crossrealm-canon-v1（不打印密钥）', (Buffer.byteLength(prefix) / 1024).toFixed(1), MODEL, BASE);

const ask = async (label, question) => {
  const body = {
    model: MODEL,
    prompt_cache_key: 'crossrealm-canon-v1',
    messages: [
      { role: 'system', content: prefix, cache_control: { type: 'ephemeral' } },
      { role: 'user', content: '玩家提问（用提问所用语言回答）：\n' + question },
    ],
    max_tokens: 48,
    temperature: 0,
    stream: true,
    stream_options: { include_usage: true },
  };
  const url = `${BASE}/chat/completions`;
  const t0 = Date.now();
  const res = await curlJsonPost(url, { 'content-type': 'application/json', accept: 'text/event-stream', authorization: 'Bearer ' + KEY }, body, 180000);
  const latency = Date.now() - t0;
  if (res.status !== 200) {
    console.log(`${label}: HTTP ${res.status} · ${String(res.body).slice(0, 120)}`);
    return { http: res.status };
  }
  let cached = null, prompt = null, text = '';
  for (const line of String(res.body).split('\n')) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (data === '[DONE]') continue;
    try {
      const j = JSON.parse(data);
      const delta = j.choices?.[0]?.delta?.content;
      if (delta) text += delta;
      if (j.usage) { prompt = j.usage.prompt_tokens ?? null; cached = j.usage.prompt_tokens_details?.cached_tokens ?? null; }
    } catch { /* partial chunk */ }
  }
  const ratio = cached && prompt ? Math.round(1000 * cached / prompt) / 10 : null;
  console.log(`${label}: HTTP 200 · prompt=${prompt} · cached=${cached} · cache=${ratio === null ? 'n/a' : ratio + '%'} · ${latency}ms · answer=${String(text).slice(0, 40).replace(/\n/g, ' ')}`);
  return { prompt, cached, ratio, latencyMs: latency };
};

const q = '《跨界纪事》里的炉火最初是在什么情况下被点燃的？用一句话答。';
const first = await ask('① 全量 v4 前缀 · 第 1 次', q);
const second = await ask('① 全量 v4 前缀 · 第 2 次', q);

const record = {
  schema: 'crossrealm.oracle-v4-live-probe.v1',
  generatedAt: new Date().toISOString(),
  model: MODEL,
  base: BASE,
  cacheKey: 'crossrealm-canon-v1',
  prefixBytes: Buffer.byteLength(prefix),
  question: q,
  calls: [first, second],
};
if (process.argv.includes('--json')) { console.log(JSON.stringify(record, null, 2)); process.exit(0); }
mkdirSync(join(ROOT, 'docs', 'admin', 'data'), { recursive: true });
const out = join(ROOT, 'docs', 'admin', 'data', 'oracle-v4-live-probe-2026-11-19.json');
writeFileSync(out, JSON.stringify(record, null, 2), 'utf8');
console.log('oracle-v4-live-probe: wrote ' + out);
