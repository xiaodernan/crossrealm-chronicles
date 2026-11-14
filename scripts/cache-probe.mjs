/**
 * cache-probe.mjs —— LLM 缓存命中率深度诊断
 *
 * 目标：定位什么设置能让上游 cacheRatio 从 <20% 跃升到 97%+，
 * 并对 sysprompt=[cache_control: ephemeral?] 两臂做对照，给「判官收敛」和「实战 advising」建统计依据。
 *
 * 用法：LLM_API_KEY=sk-xxx node scripts/cache-probe.mjs
 * 密钥不打印、不落地。
 */
import { readFileSync } from 'node:fs';

const env = readFileSafe('.env');
const API_KEY = process.env.LLM_API_KEY || env.LLM_API_KEY;
const BASE_URL = process.env.LLM_BASE_URL || env.LLM_BASE_URL || 'https://wkapi.pro/v1';
const MODEL = process.env.LLM_MODEL || env.LLM_MODEL || 'gpt-6-sol';
if (!API_KEY) { console.error('LLM_API_KEY required'); process.exit(2); }

const SYSTEM = readFileSync('server/ai-service/src/main/resources/ai/system-prompt.txt', 'utf8').trim();
console.log(`system-prompt: ${SYSTEM.length} chars, ~${Math.round(SYSTEM.length / 4)} tokens est., base=${BASE_URL} model=${MODEL}\n`);

const U = ['什么是母题?', 'Anchor Fire 是什么？', '星轨顾问的工作流程?', '三轮打法高阶挑战的规则?'];

async function call(messages, label) {
  const body = { model: MODEL, messages, stream: true, stream_options: { include_usage: true }, max_tokens: 60, temperature: 0.7 };
  const res = await fetch(BASE_URL.replace(/\/+$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + API_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const t = await res.text().catch(() => ''); console.log(label, 'HTTP', res.status, t.slice(0, 200)); return; }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '', promptTokens = null, cachedTokens = null, completionTokens = null, answer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    while (buf.includes('\n\n')) {
      const nl = buf.indexOf('\n\n');
      const block = buf.slice(0, nl);
      buf = buf.slice(nl + 2);
      for (const line of block.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const j = JSON.parse(payload);
          if (j.usage) { promptTokens = j.usage.prompt_tokens; completionTokens = j.usage.completion_tokens; cachedTokens = j.usage.prompt_tokens_details?.cached_tokens ?? null; }
          if (j?.choices?.[0]?.delta?.content) answer += j.choices[0].delta.content;
        } catch {}
      }
    }
  }
  const ratio = (cachedTokens != null && promptTokens) ? ((cachedTokens * 100 / promptTokens).toFixed(1) + '%') : 'n/a';
  console.log(label.padEnd(40), 'prompt=' + promptTokens, 'cached=' + (cachedTokens ?? '-'), 'ratio=' + ratio);
}

function readFileSafe(p) { try { const txt = readFileSync(p, 'utf8'); const out = {}; for (const line of txt.split(/\r?\n/)) { const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/); if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim(); } return out; } catch { return {}; } }

const noCache = (s, u) => [{ role: 'system', content: s }, { role: 'user', content: u }];
const withCache = (s, u) => [{ role: 'system', content: s, cache_control: { type: 'ephemeral' } }, { role: 'user', content: u }];

for (let i = 0; i < U.length; i++) {
  await call(noCache(SYSTEM, U[i]), `no-cache #${i + 1}`);
  await call(withCache(SYSTEM, U[i]), `ephemeral-cache #${i + 1}`);
}
process.exit(0);
