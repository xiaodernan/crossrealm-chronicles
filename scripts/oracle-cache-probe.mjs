#!/usr/bin/env node
/**
 * oracle-cache-probe · W-Z244 之后的实证：Oracle 双轨（canon/refs）在真实上游上的 prompt-cache 表现。
 *
 * 口径（与生产 LlmClient 完全一致）：
 *   stream:true + stream_options.include_usage:true + system cache_control:ephemeral(frozen) + prompt_cache_key:crossrealm-canon-v1
 *
 * 探针形状（计费很小，≈4 次短调用）：
 *   canon lane —— 「锚火是什么？」+ canon 原文摘录（至多约 2500 字，两遍同问，第二遍看 cached_tokens）
 *   refs lane  —— 「祭灶在现实里怎么做？」+ refs 摘录，两遍同问
 *
 * 解读：两条 lane 的第二次调用 cached_tokens > 0 → 生产 prompt-cache 链路对 Oracle 提问成立；
 *        0/null → 缓存形状有问题（本脚本不会自动"修"，只如实报告——修在 LlmClient，由 --fix 什么也不做）。
 *
 * 用法：node scripts/oracle-cache-probe.mjs
 * 注意：必须经 Clash Verge（LLM_PROXY_URL=http://127.0.0.1:7897），否则上游 Cloudflare 全量 403。
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { proxyJsonPost, proxyIsSet } from './_clash-proxy.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const env = {};
try {
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* 退回进程 env */ }
const KEY = env.LLM_API_KEY || process.env.LLM_API_KEY;
const BASE = (env.LLM_BASE_URL || process.env.LLM_BASE_URL || 'https://api.aizzz.xyz/v1').replace(/\/+$/, '');
const MODEL = env.LLM_MODEL || process.env.LLM_MODEL || 'gpt-6.1-terra';
if (!KEY) { console.error('oracle-cache-probe: 缺少 LLM_API_KEY（.env 或进程 env 均未找到）'); process.exit(1); }
if (!proxyIsSet()) { console.error('oracle-cache-probe: 未设置 LLM_PROXY_URL（须 127.0.0.1:7897 Clash 混合端口，否则上游 403）'); process.exit(1); }

const LORE_SYS = (readFileSync(join(ROOT, 'server', 'ai-service', 'src', 'main', 'resources', 'ai', 'lore-system-prompt.txt'), 'utf8').trim()
  + '\n\n'
  + readFileSync(join(ROOT, 'server', 'ai-service', 'src', 'main', 'resources', 'ai', 'lore-digest-frozen.txt'), 'utf8').trim()).trim();

const excerpt = (rel, maxChars) => {
  const t = readFileSync(join(ROOT, rel), 'utf8').trim();
  return t.length > maxChars ? t.slice(0, maxChars) : t;
};
const CANON_EXCERPT = excerpt('creative/novel/104-秋分.md', 2500);
const REFS_EXCERPT = excerpt('creative/refs/crossrealm-realworld-notes.md', 2500);

const ask = async (label, question, bodyExcerpt) => {
  const user = 'Player question (use the language the player asked in):\n' + question
    + '\n\nMost relevant excerpt (quote it verbatim if it answers the question):\n\n' + bodyExcerpt;
  const body = {
    model: MODEL,
    prompt_cache_key: 'crossrealm-canon-v1',
    messages: [
      { role: 'system', content: LORE_SYS, cache_control: { type: 'ephemeral' } },
      { role: 'user', content: user },
    ],
    max_tokens: 160,
    temperature: 0,
    stream: true,
    stream_options: { include_usage: true },
  };
  const url = `${BASE}/chat/completions`;
  const t0 = Date.now();
  const res = await proxyJsonPost(url, { 'content-type': 'application/json', accept: 'text/event-stream', authorization: 'Bearer ' + KEY }, body, 120000);
  const latency = Date.now() - t0;
  if (res.status !== 200) {
    console.log(`${label}: HTTP ${res.status} · ${String(res.body).slice(0, 80)}`);
    return null;
  }
  let cached = null; let prompt = null;
  for (const line of String(res.body).split('\n')) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (data === '[DONE]') continue;
    try {
      const j = JSON.parse(data);
      if (j.usage) {
        prompt = j.usage.prompt_tokens ?? null;
        cached = j.usage.prompt_tokens_details?.cached_tokens ?? null;
      }
    } catch { /* partial chunk */ }
  }
  console.log(`${label}: HTTP 200 · prompt_tokens=${prompt} · cached_tokens=${cached} · cache=${cached && prompt ? Math.round(1000 * cached / prompt) / 10 + '%' : 'n/a'} · ${latency}ms`);
  return { prompt, cached };
};

console.log('oracle-cache-probe: base=' + BASE + ' model=' + MODEL + ' cacheKey=crossrealm-canon-v1');
const qCanon = '锚火是什么？';
const qRefs = '祭灶习俗在现实里怎么做？';
await ask('canon #1', qCanon, CANON_EXCERPT);
await ask('canon #2', qCanon, CANON_EXCERPT);
await ask('refs  #1', qRefs, REFS_EXCERPT);
await ask('refs  #2', qRefs, REFS_EXCERPT);
