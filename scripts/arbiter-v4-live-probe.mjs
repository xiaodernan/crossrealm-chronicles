#!/usr/bin/env node
/**
 * arbiter-v4-live-probe · W-Z456 —— 「终局大场吃 4-5 万 token」真上游实测
 *
 * 把 arbiter（烬灯回信）与 kindle-letter（烬火答）的**实际系统提示组合**
 * （oracle-v4-frozen-prefix.txt 全量 + ARBITER_CONTRACT）逐字送上游
 * （Clash 混合端口 127.0.0.1:7897），cold + warm 两次，
 * 报 prompt_tokens / cached_tokens / cachedRatio / latency，产物落盘。
 *
 * 不打印、不回显密钥。失败不写半份产物。
 * 用法：node scripts/arbiter-v4-live-probe.mjs
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
if (!KEY) { console.error('arbiter-v4-live-probe: 缺少 LLM_API_KEY'); process.exit(1); }
if (!proxyIsSet()) { console.error('arbiter-v4-live-probe: 未设置 LLM_PROXY_URL（须 127.0.0.1:7897 Clash 混合端口）'); process.exit(1); }

const v4prefix = readFileSync(join(ROOT, 'server/ai-service/src/main/resources/ai/oracle-v4-frozen-prefix.txt'), 'utf8').replace(/\s+$/, '');
const arbiterController = readFileSync(join(ROOT, 'server/ai-service/src/main/java/com/crossrealm/chronicles/ai/ArbiterController.java'), 'utf8');

// 从 Java 源里原样还原 ARBITER_CONTRACT（把连续的字符串字面量拼接起来）
const section = arbiterController.match(/ARBITER_CONTRACT =([\s\S]*?);/);
if (!section) { console.error('arbiter-v4-live-probe: ARBITER_CONTRACT 未在 ArbiterController.java 中找到'); process.exit(1); }
const literals = [...section[1].matchAll(/"(?:[^"\\]|\\.)*"/g)];
const contract = literals
  .map(([lit]) => lit.slice(1, -1)
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\\\/g, '\\'))
  .join('');

const ARBITER_SYSTEM = v4prefix + '\n' + contract;
console.log(`arbiter-v4-live-probe: v4prefix=${(Buffer.byteLength(v4prefix)/1024).toFixed(1)}KB contract=${(Buffer.byteLength(contract)/1024).toFixed(1)}KB arbiterSystem≈${(Buffer.byteLength(ARBITER_SYSTEM)/1024).toFixed(1)}KB model=${MODEL}`);

const ask = async (label, user) => {
  const body = {
    model: MODEL,
    prompt_cache_key: 'crossrealm-canon-v1',
    messages: [
      { role: 'system', content: ARBITER_SYSTEM, cache_control: { type: 'ephemeral' } },
      { role: 'user', content: user },
    ],
    max_tokens: 120,
    temperature: 0,
    stream: true,
    stream_options: { include_usage: true },
  };
  const url = `${BASE}/chat/completions`;
  const { status, body: text } = await curlJsonPost(url, { 'content-type': 'application/json', accept: 'text/event-stream', authorization: 'Bearer ' + KEY }, body, 240000);
  let prompt = null, cached = null, completion = null;
  for (const line of String(text).split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith('data:')) continue;
    const payload = t.slice(5).trim();
    if (payload === '[DONE]') break;
    try {
      const obj = JSON.parse(payload);
      if (obj.usage) {
        prompt = obj.usage.prompt_tokens ?? null;
        cached = obj.usage.prompt_tokens_details?.cached_tokens ?? null;
        completion = obj.usage.completion_tokens ?? null;
      }
    } catch { /* 忽略非 JSON chunk */ }
  }
  const ratio = (prompt && cached != null && prompt > 0) ? (cached / prompt * 100).toFixed(1) + '%' : 'n/a';
  console.log(`${label}: HTTP ${status} · prompt=${prompt} cached=${cached} cachedRatio=${ratio} completion=${completion}`);
  return { label, status, prompt, cached, cachedRatio: ratio, completion };
};

const t0 = Date.now();
const cold = await ask('cold', '终局抉择(choice)：keep\n旅途账本(stats, 紧凑 JSON 片段)：{"echoes":110,"kills":1,"chapter":5}\n收信人(player)：（一名无名旅人）\n语言(language)：zh\n\n请写归途短信（只输出 JSON）。');
const warm = await ask('warm#2', '终局抉择(choice)：quiet\n旅途账本(stats, 紧凑 JSON 片段)：{"echoes":96,"kills":3,"chapter":7}\n收信人(player)：（一名无名旅人）\n语言(language)：zh\n\n请写归途短信（只输出 JSON）。');
const summary = { probe: 'arbiter-v4-live-probe', date: '2026-11-19', model: MODEL, upstream: BASE, cacheKey: 'crossrealm-canon-v1', lane: 'arbiter （烬灯回信）', elapsedMs: Date.now() - t0, cold, warm };
const outFile = join(ROOT, 'docs/admin/data/arbiter-v4-live-probe-2026-11-19.json');
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(summary, null, 2) + '\n');
console.log(`wrote ${outFile}`);
