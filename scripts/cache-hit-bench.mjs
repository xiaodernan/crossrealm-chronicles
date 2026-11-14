/**
 * cache-hit-bench.mjs —— 对 wkapi.pro 的真上游跑一轮 Prompt-cache 命中率基准
 *
 * 读数口径：
 *   1. N 组 system-prompt（冻结于本仓库的 ai-service/system-prompt.txt）+ 不同 user，
 *      首发冷，后续同前缀——测量 warm-hit 比例
 *   2. 对每次 /v1/chat/completions 记录 prompt_tokens / cached_tokens（来自流式响应里的
 *      usage 块；首次 stream=true 要求 include_usage:true）
 *   3. 输出 plain JSON + 人类可读的 summary（同前缀命中率 %%、总 token 利用率对照）
 *
 * 用法：
 *   LLM_API_KEY=sk-xxx node scripts/cache-hit-bench.mjs --calls=12 --base=https://wkapi.pro/v1 --model=gpt-6-sol
 *   LLM_API_KEY=sk-xxx node scripts/cache-hit-bench.mjs --calls=12 --json > bench.json
 *
 * 跑前先读 .env（LLM_API_KEY / LLM_BASE_URL / LLM_MODEL 是二合一的，和 verify-prometheus-ai 同一份口径）。
 * 密钥不印、不写任何文件、不出进程。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const env = readFileSafe(join(REPO, '.env'));

const API_KEY = process.env.LLM_API_KEY || env.LLM_API_KEY;
const BASE_URL = process.env.LLM_BASE_URL || env.LLM_BASE_URL || 'https://wkapi.pro/v1';
const MODEL = process.env.LLM_MODEL || env.LLM_MODEL || 'gpt-6-sol';
const CALLS = parsePositiveInt(getArg('--calls')) ?? 8;
const JSON_OUT = getArg('--json') !== undefined;
const GAP_MS = parsePositiveInt(getArg('--gap-ms')) ?? 1200;

if (!API_KEY) { console.error('LLM_API_KEY is required (env or .env).'); process.exit(2); }

const systemPrompt = readFileSync(join(REPO, 'server/ai-service/src/main/resources/ai/system-prompt.txt'), 'utf8').trim();

const userPrompts = [
  '什么是母题?请简短回答。',
  'Anchor Fire 代表什么意象?',
  '星轨顾问的工作流程是什么?',
  '给我讲一个关于守夜人的小故事。',
  '三轮以内回答完的高阶挑战机制是什么?',
  '深颚咸响是什么意思?',
  '终局点燃那盏灯看的是什么?',
  '星锚谷在虚空深渊中的位置?',
];

async function chat(system, user) {
  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: system, cache_control: { type: 'ephemeral' } },
      { role: 'user', content: user },
    ],
    max_tokens: 160,
    temperature: 0.7,
    stream: true,
    stream_options: { include_usage: true },
  };
  const res = await fetch(BASE_URL.replace(/\/+$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const text = await safeText(res);
    return { ok: false, status: res.status, body: text?.slice(0, 400) ?? '' };
  }
  // 消费 SSE 流直到末尾 usage 块（OpenAI include_usage 把它放在结束 chunk 里）
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let outcome = { cachedTokens: null, promptTokens: null, completionTokens: null, model: MODEL, answer: '' };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // 按 SSE 块提取 data: 行；很长也不会塞进 buf（分块）
    let nl;
    while ((nl = buf.indexOf('\n\n')) !== -1 || (nl = buf.indexOf('\r\n\r\n')) !== -1) {
      const block = buf.slice(0, nl).trim();
      buf = buf.slice(nl + (buf.startsWith('\r\n') ? 4 : 2));
      if (!block || !block.startsWith('data:')) continue;
      const payload = block.slice(5).trim();
      if (payload === '[DONE]') continue;
      let j; try { j = JSON.parse(payload); } catch { continue; }
      const choice = j?.choices?.[0];
      if (choice?.delta?.content) outcome.answer += choice.delta.content;
      // OpenAI 在最后的 usage chunk 中带 model+usage，同时也兼容旧式位置
      if (j?.usage) {
        outcome.promptTokens = j.usage.prompt_tokens ?? j.usage.promptTokens;
        outcome.completionTokens = j.usage.completion_tokens ?? j.usage.completionTokens;
        outcome.cachedTokens = j.usage.prompt_tokens_details?.cached_tokens ?? j.usage.cached_tokens ?? null;
        if (j.model) outcome.model = j.model;
      }
    }
  }
  return { ok: true, ...outcome };
}

function formatRatio(a, b) { return b > 0 ? ((a / b) * 100).toFixed(1) + '%' : 'n/a'; }
function parsePositiveInt(v) { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined; }
function getArg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }
function readFileSafe(p) { try { const txt = readFileSync(p, 'utf8'); const out = {}; for (const line of txt.split(/\r?\n/)) { const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/); if (!m) continue; out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim(); } return out; } catch { return {}; } }
async function safeText(res) { try { return await res.text(); } catch { return null; } }

// ---------- 跑 ----------
const rows = [];
for (let i = 0; i < CALLS; i++) {
  const user = userPrompts[i % userPrompts.length];
  const t0 = Date.now();
  const r = await chat(systemPrompt, user);
  const dt = Date.now() - t0;
  rows.push({ i: i + 1, ok: !!r.ok, ms: dt, prompt: r.promptTokens ?? null, cached: r.cachedTokens ?? null, answerChars: r.answer?.length ?? 0, answer: r.answer?.slice(0, 60) ?? '', status: r.status ?? null });
  if (i < CALLS - 1) await sleep(GAP_MS);
}
const sumPrompt = rows.reduce((acc, r) => acc + (r.prompt ?? 0), 0);
const sumCached = rows.reduce((acc, r) => acc + (r.cached ?? 0), 0);
const ratio = formatRatio(sumCached, sumPrompt);

if (JSON_OUT) {
  console.log(JSON.stringify({ calls: CALLS, model: MODEL, baseUrl: BASE_URL, promptTotal: sumPrompt, cachedTotal: sumCached, ratio, rows }, null, 2));
} else {
  console.log('cache-hit-bench  ·  上游=' + BASE_URL + '  model=' + MODEL + '  calls=' + CALLS);
  console.log('─────────────────────────────────────────────────────');
  for (const r of rows) {
    console.log(`#${String(r.i).padStart(2, '0')}  ${r.ok ? 'OK ' : 'ERR'}  ${String(r.ms).padStart(4, ' ')}ms  prompt=${r.prompt ?? '-'}  cached=${r.cached ?? '-'}  answer="${(r.answer ?? '').replace(/\s+/g, ' ').slice(0, 46)}"`);
  }
  console.log('─────────────────────────────────────────────────────');
  console.log(`prompt=${sumPrompt}  cached=${sumCached}  cachedRatio=${ratio}  (non-cached ${sumPrompt - sumCached})`);
}
process.exit(0);
