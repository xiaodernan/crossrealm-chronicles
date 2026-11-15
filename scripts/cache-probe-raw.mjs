/**
 * cache-probe-raw —— 直打 wkapi.pro/v1，dump 原始 SSE 的 usage 定型 chunk（不解析）。
 * A: 3 次完全相同的请求（相同 system+user）—— 上游若缓存生效，后续两次必然多出 cached 字段。
 * 用法: node scripts/cache-probe-raw.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = readFileSync(join(REPO, '.env'), 'utf8');
const KEY = (env.match(/^LLM_API_KEY\s*=\s*(.+)$/m) ?? [])[1]?.trim();
const BASE = (env.match(/^LLM_BASE_URL\s*=\s*(.+)$/m) ?? [])[1]?.trim() ?? 'https://wkapi.pro/v1';
const MODEL = (env.match(/^LLM_MODEL\s*=\s*(.+)$/m) ?? [])[1]?.trim() ?? 'gpt-6-sol';
if (!KEY) { console.error('no LLM_API_KEY in .env'); process.exit(2); }
const systemPrompt = readFileSync(join(REPO, 'server/ai-service/src/main/resources/ai/system-prompt.txt'), 'utf8').trim();

const body = {
  model: MODEL,
  messages: [
    { role: 'system', content: systemPrompt, cache_control: { type: 'ephemeral' } },
    { role: 'user', content: '锚火象征着什么？用一句话回答。' },
  ],
  max_tokens: 64,
  stream: true,
  stream_options: { include_usage: true },
};

for (let i = 1; i <= 3; i++) {
  const t0 = Date.now();
  const res = await fetch(BASE.replace(/\/+$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + KEY },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  const text = await res.text();
  const usageLines = text.split('\n').filter((l) => l.trim().startsWith('data:') && !l.includes('[DONE]'))
    .map((l) => { try { return JSON.parse(l.trim().slice(5).trim()); } catch { return null; } })
    .filter((j) => j && (j.usage || j.choices?.length === 0));
  console.log(`call#${i}  HTTP ${res.status}  ${ms}ms`);
  for (const u of usageLines) console.log('   usage:', JSON.stringify(u));
  await sleep(1500);
}
