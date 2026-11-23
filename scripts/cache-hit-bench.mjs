/**
 * cache-hit-bench.mjs —— 用 LlmClient 的 Advisor 请求形状测上游 prompt-cache。
 *
 * 默认经 Clash（scripts/_curl-proxy.mjs）；请求 /v1、gpt-6.2-sol、
 * crossrealm-advisor-v1、320 输出 token、stream + include_usage。
 * 整体命中率包含首发冷启；warmRatio 去掉首发，才回答"稳定热命中"。
 * 失败或 usage 缺失退出 1；可用 --min-warm-hit=90 增加热命中门槛。
 *
 * 用法：
 *   node scripts/cache-hit-bench.mjs --calls=8 --min-warm-hit=90
 *   node scripts/cache-hit-bench.mjs --calls=8 --repeat=true --json
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { curlFetch, proxyInfo } from './_curl-proxy.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');

export const DEFAULTS = Object.freeze({
  baseUrl: 'https://api.aizzz.xyz/v1',
  model: 'gpt-6.2-sol',
  lane: 'crossrealm-advisor-v1',
  maxTokens: 320,
  calls: 8,
  gapMs: 1200,
  timeoutMs: 120000,
});

const QUESTIONS = Object.freeze([
  '什么是母题?请简短回答。',
  'Anchor Fire 代表什么意象?',
  '星轨顾问的工作流程是什么?',
  '给我讲一个关于守夜人的小故事。',
  '三轮以内回答完的高阶挑战机制是什么?',
  '深颚咸响是什么意思?',
  '终局点燃那盏灯看的是什么?',
  '星锚谷在虚空深渊中的位置?',
]);

export function normalizeBaseUrl(raw) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('LLM base URL must be HTTP(S)');
  url.search = '';
  url.hash = '';
  const pathname = url.pathname.replace(/\/+$/, '');
  url.pathname = pathname.endsWith('/v1') ? pathname : `${pathname}/v1`;
  return url.toString().replace(/\/+$/, '');
}

export function buildRequestBody({ model, lane, system, user, maxTokens }) {
  return {
    model,
    prompt_cache_key: lane,
    messages: [
      { role: 'system', content: system, cache_control: { type: 'ephemeral' } },
      { role: 'user', content: user },
    ],
    max_tokens: maxTokens,
    temperature: 0.7,
    stream: true,
    stream_options: { include_usage: true },
  };
}

export function parseSse(raw) {
  let answer = '';
  let usage = null;
  let model = null;
  for (const block of String(raw).replace(/\r\n/g, '\n').split('\n\n')) {
    for (const line of block.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let event;
      try { event = JSON.parse(payload); } catch { continue; }
      const delta = event?.choices?.[0]?.delta?.content;
      if (typeof delta === 'string') answer += delta;
      if (event?.usage) usage = event.usage;
      if (typeof event?.model === 'string') model = event.model;
    }
  }
  return { answer, usage, model };
}

function tokenCount(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function cachedTokens(usage) {
  return tokenCount(usage?.prompt_tokens_details?.cached_tokens ?? usage?.cached_tokens);
}

function ratioText(cached, prompt) {
  return prompt > 0 ? `${((cached / prompt) * 100).toFixed(1)}%` : 'n/a';
}

function integer(value, label, minimum) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < minimum) throw new Error(`${label} must be an integer >= ${minimum}`);
  return n;
}

function positiveInteger(value, label) {
  return integer(value, label, 1);
}

function redact(text, apiKey) {
  return apiKey ? String(text ?? '').split(apiKey).join('****') : String(text ?? '');
}

export async function runCacheBench({
  apiKey,
  baseUrl = DEFAULTS.baseUrl,
  model = DEFAULTS.model,
  lane = DEFAULTS.lane,
  maxTokens = DEFAULTS.maxTokens,
  calls = DEFAULTS.calls,
  gapMs = DEFAULTS.gapMs,
  timeoutMs = DEFAULTS.timeoutMs,
  systemPrompt,
  questions = QUESTIONS,
  repeat = false,
  transport = curlFetch,
  sleepFn = sleep,
}) {
  if (!apiKey) throw new Error('LLM_API_KEY is required');
  if (!systemPrompt) throw new Error('systemPrompt is required');
  if (!/^[a-z0-9-]+$/.test(lane)) throw new Error('lane must contain only lowercase letters, digits and hyphens');
  const normalized = {
    baseUrl: normalizeBaseUrl(baseUrl),
    model,
    lane,
    maxTokens: positiveInteger(maxTokens, 'maxTokens'),
    calls: positiveInteger(calls, 'calls'),
    timeoutMs: positiveInteger(timeoutMs, 'timeoutMs'),
  };
  gapMs = integer(gapMs, 'gapMs', 0);

  const rows = [];
  for (let i = 0; i < normalized.calls; i++) {
    const question = repeat ? questions[0] : questions[i % questions.length];
    const started = Date.now();
    let response;
    try {
      response = await transport({
        url: `${normalized.baseUrl}/chat/completions`,
        method: 'POST',
        headers: {
          accept: 'text/event-stream',
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(buildRequestBody({
          model: normalized.model,
          lane: normalized.lane,
          system: systemPrompt,
          user: `玩家提问：${question}`,
          maxTokens: normalized.maxTokens,
        })),
        timeoutMs: normalized.timeoutMs,
      });
    } catch (error) {
      rows.push({ i: i + 1, ok: false, ms: Date.now() - started, status: 0,
        prompt: null, cached: null, answerChars: 0, error: redact(error?.message ?? error, apiKey) });
      continue;
    }

    if (response?.status !== 200) {
      rows.push({ i: i + 1, ok: false, ms: Date.now() - started, status: response?.status ?? 0,
        prompt: null, cached: null, answerChars: 0, error: redact(response?.error ?? 'non-200 response', apiKey) });
      continue;
    }
    const parsed = parseSse(response.body);
    const prompt = tokenCount(parsed.usage?.prompt_tokens);
    const cached = cachedTokens(parsed.usage);
    rows.push({ i: i + 1, ok: true, ms: Date.now() - started, status: 200,
      model: parsed.model ?? normalized.model, prompt, cached, answerChars: parsed.answer.length });
    if (i < normalized.calls - 1) await sleepFn(gapMs);
  }

  const measured = rows.filter((row) => row.ok && row.prompt !== null && row.cached !== null && row.cached <= row.prompt);
  const warm = measured.filter((row) => row.i > 1);
  const sum = (list, key) => list.reduce((total, row) => total + row[key], 0);
  const promptTotal = sum(measured, 'prompt');
  const cachedTotal = sum(measured, 'cached');
  const warmPrompt = sum(warm, 'prompt');
  const warmCached = sum(warm, 'cached');
  return {
    calls: normalized.calls,
    baseUrl: normalized.baseUrl,
    model: normalized.model,
    cacheKey: normalized.lane,
    maxTokens: normalized.maxTokens,
    proxy: proxyInfo(),
    failures: rows.filter((row) => !row.ok).length,
    measuredCalls: measured.length,
    usageMissing: rows.filter((row) => row.ok && !measured.includes(row)).length,
    promptTotal,
    cachedTotal,
    ratio: ratioText(cachedTotal, promptTotal),
    warmPromptTotal: warmPrompt,
    warmCachedTotal: warmCached,
    warmRatio: ratioText(warmCached, warmPrompt),
    rows,
  };
}

export function reportPasses(report, minWarmHit = null) {
  if (report.failures || report.usageMissing || report.measuredCalls !== report.calls) return false;
  if (minWarmHit === null) return true;
  const threshold = Number(minWarmHit);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) throw new Error('minWarmHit must be between 0 and 100');
  if (report.warmPromptTotal === 0) return false;
  return report.warmCachedTotal / report.warmPromptTotal * 100 >= threshold;
}

export function formatReport(report) {
  const lines = [
    `cache-hit-bench · upstream=${report.baseUrl} proxy=${report.proxy} model=${report.model}`,
    `lane=${report.cacheKey} maxTokens=${report.maxTokens} calls=${report.calls}`,
    '─────────────────────────────────────────────────────',
  ];
  for (const row of report.rows) {
    lines.push(`#${String(row.i).padStart(2, '0')} ${row.ok ? 'OK ' : 'ERR'} ${String(row.ms).padStart(4)}ms `
      + `prompt=${row.prompt ?? '-'} cached=${row.cached ?? '-'} answerChars=${row.answerChars}`
      + (row.error ? ` error=${row.error}` : ''));
  }
  lines.push('─────────────────────────────────────────────────────');
  lines.push(`prompt=${report.promptTotal} cached=${report.cachedTotal} cachedRatio=${report.ratio}`);
  lines.push(`warmPrompt=${report.warmPromptTotal} warmCached=${report.warmCachedTotal} warmRatio=${report.warmRatio}`);
  lines.push(`failures=${report.failures} usageMissing=${report.usageMissing}`);
  return lines.join('\n');
}

function readEnv() {
  try {
    const out = {};
    for (const line of readFileSync(join(REPO, '.env'), 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (match) out[match[1]] = match[2].replace(/^["']|["']$/g, '').trim();
    }
    return out;
  } catch {
    return {};
  }
}

export function getArg(name, argv = process.argv.slice(2)) {
  const inline = argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  return value && !value.startsWith('--') ? value : undefined;
}

export function hasFlag(name, argv = process.argv.slice(2)) {
  return argv.includes(name) || getArg(name, argv) === 'true';
}

function integerArg(name, fallback) {
  const value = getArg(name);
  return value === undefined ? fallback : positiveInteger(value, name);
}

async function main() {
  const env = readEnv();
  const minWarmHit = getArg('--min-warm-hit');
  try {
    const report = await runCacheBench({
      apiKey: process.env.LLM_API_KEY || env.LLM_API_KEY,
      baseUrl: getArg('--base') || process.env.LLM_BASE_URL || env.LLM_BASE_URL || DEFAULTS.baseUrl,
      model: getArg('--model') || process.env.LLM_MODEL || env.LLM_MODEL || DEFAULTS.model,
      lane: getArg('--lane') || DEFAULTS.lane,
      maxTokens: integerArg('--max-tokens', DEFAULTS.maxTokens),
      calls: integerArg('--calls', DEFAULTS.calls),
      gapMs: getArg('--gap-ms') === undefined ? DEFAULTS.gapMs : integer(getArg('--gap-ms'), '--gap-ms', 0),
      timeoutMs: integerArg('--timeout-ms', DEFAULTS.timeoutMs),
      systemPrompt: readFileSync(join(REPO, 'server/ai-service/src/main/resources/ai/system-prompt.txt'), 'utf8').trim(),
      repeat: hasFlag('--repeat'),
    });
    console.log(hasFlag('--json') ? JSON.stringify(report, null, 2) : formatReport(report));
    process.exitCode = reportPasses(report, minWarmHit) ? 0 : 1;
  } catch (error) {
    console.error(`cache-hit-bench: ${error?.message ?? error}`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main();
}
