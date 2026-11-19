#!/usr/bin/env node
/**
 * 2026-11-18 W-Z336：真上游「并行会话缓存隔离」实测（Codex 排队口径，curl 出口 · Clash 7897）
 *
 * 用户诉求：「是不是有几个并行会话跟你同时打这个 API，导致缓存区分不明显，用乱了？」
 * 本探针直接回答这个问题——真调用真 API，三种场景各计一次：
 *
 *   Round A  same-key 并行突发：8 个独立子进程（8 个真·并发连接）共用同一 prompt_cache_key
 *            （crossrealm-parallel-fireball-v1），user line 各自不同（模拟 Ember Lane 里
 *            冻结前缀 + 不同问题的真实调用）。
 *   Round B  mixed-lane 并行：3×跨 realm-parallel-ember-v2 + 3×跨 realm-parallel-oracle-v1
 *            同时打（共 6 并发）——验证 lane 之间互不污染。
 *   Round C  顺串对照：sequential 2 连包 same-key（与 W-Z308 同一口径的锚）。
 *
 * 请求形状逐字段镜像 LlmClient.requestBody()：stream+include_usage、
 * system ephemeral cache_control、prompt_cache_key、temperature 0.7。
 * 前缀 = server/ai-service/src/main/resources/ai/llm-frozen-prefix.v2.txt（≥4.6K tok）。
 * 密钥不打印、不落盘、仅从 .env 读 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL。
 *
 * 用法：node scripts/cache-parallel-probe.mjs
 * 输出：stdout 表格 + docs/admin/data/llm-parallel-cache-probe.json（被 Admin KPI 卡引用）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { curlFetch } from './_curl-proxy.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PREFIX_PATH = join(ROOT, 'server/ai-service/src/main/resources/ai/llm-frozen-prefix.v2.txt');
const OUT = join(ROOT, 'docs/admin/data/llm-parallel-cache-probe.json');

const env = {};
try {
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* fall through */ }
const KEY = env.LLM_API_KEY || process.env.LLM_API_KEY;
const BASE = (env.LLM_BASE_URL || process.env.LLM_BASE_URL || 'https://api.aizzz.xyz/v1').replace(/\/+$/, '');
const MODEL = env.LLM_MODEL || process.env.LLM_MODEL || 'gpt-6.2-sol';
if (!KEY) { console.error('cache-parallel-probe: 缺少 LLM_API_KEY'); process.exit(1); }
const FROZEN = readFileSync(PREFIX_PATH, 'utf8');

const QUESTIONS = [
  '用一句话回答：终章抉择的两种结局分别会发生什么？',
  '用一句话回答：引力化身·奇点领主的招式偏好是什么？',
  '用一句话回答：锚火终局里玩家能留下什么？',
  '用一句话回答：17 母题成就墙最后一块通常怎么集齐？',
  '用一句话回答：世界时间到了晚上炉边会发生什么？',
  '用一句话回答：开天刃和回护刃分别擅长什么场景？',
  '用一句话回答：破碎时线那一章的规则是什么？',
  '用一句话回答：灰岩关塞为什么不是一扇普通的门？',
];

function buildBody(cacheKey, userLine) {
  return JSON.stringify({
    model: MODEL,
    prompt_cache_key: cacheKey,
    messages: [
      { role: 'system', content: FROZEN, cache_control: { type: 'ephemeral' } },
      { role: 'user', content: userLine },
    ],
    temperature: 0.7,
    max_tokens: 64,
    stream: true,
    stream_options: { include_usage: true },
  });
}

function parseStream(raw) {
  let usage = null;
  let text = '';
  for (const block of String(raw).split('\n\n')) {
    for (const ln of block.split('\n')) {
      if (!ln.startsWith('data:')) continue;
      const data = ln.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const j = JSON.parse(data);
        const d = j.choices?.[0]?.delta?.content;
        if (d) text += d;
        if (j.usage) usage = j.usage;
      } catch { /* partial chunk */ }
    }
  }
  return { usage, text };
}

function oneCall(cacheKey, userLine) {
  const { status, body, error, timeTotal } = curlFetch({
    url: `${BASE}/chat/completions`,
    method: 'POST',
    headers: {
      accept: 'text/event-stream',
      authorization: 'Bearer ' + KEY,
      'content-type': 'application/json',
    },
    body: buildBody(cacheKey, userLine),
    timeoutMs: 60000,
  });
  if (error || status !== 200) {
    return { cacheKey, userLine, status, cached: 0, prompt: 0, ratio: null, error: error ?? `HTTP ${status}`, timeTotal };
  }
  const { usage } = parseStream(body);
  const prompt = usage?.prompt_tokens ?? 0;
  const cached = usage?.prompt_tokens_details?.cached_tokens ?? usage?.cached_tokens ?? 0;
  return { cacheKey, userLine, status, cached, prompt, ratio: prompt > 0 ? +(cached / prompt).toFixed(4) : null, timeTotal };
}

const WORKER = process.argv.includes('--worker');
if (WORKER) {
  const key = process.argv[process.argv.indexOf('--worker') + 1];
  const q = process.argv[process.argv.indexOf('--worker') + 2] ?? QUESTIONS[0];
  const r = oneCall(key, q);
  process.stdout.write(JSON.stringify(r));
  process.exit(0);
}

function spawnWorkers(specs) {
  return new Promise((resolveAll) => {
    let done = 0;
    const results = new Array(specs.length);
    specs.forEach((spec, idx) => {
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--worker', spec.key, spec.q], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      child.on('exit', () => {
        try { results[idx] = JSON.parse(out); } catch { results[idx] = { cacheKey: spec.key, status: 0, error: 'unparseable worker output: ' + out.slice(0, 120) }; }
        done += 1;
        if (done === specs.length) resolveAll(results);
      });
    });
  });
}

const keyFire = 'crossrealm-parallel-fireball-v1';
const keyEmber = 'crossrealm-parallel-ember-v2';
const keyOracle = 'crossrealm-parallel-oracle-v1';

console.log('cache-parallel-probe: base=%s model=%s prefixBytes=%d', BASE, MODEL, FROZEN.length);

// Round A — sequential warm pair (same-key, same user line twice)
const seqA = [oneCall(keyFire, QUESTIONS[0]), oneCall(keyFire, QUESTIONS[0])];

// Round B — same-key burst of 8, distinct user lines
const burst = await spawnWorkers(QUESTIONS.slice(0, 8).map((q) => ({ key: keyFire, q })));

// Round C — mixed lanes: 3×ember + 3×oracle concurrently
const mixed = await spawnWorkers([
  { key: keyEmber, q: QUESTIONS[0] }, { key: keyOracle, q: QUESTIONS[1] },
  { key: keyEmber, q: QUESTIONS[2] }, { key: keyOracle, q: QUESTIONS[3] },
  { key: keyEmber, q: QUESTIONS[4] }, { key: keyOracle, q: QUESTIONS[5] },
]);

const sum = (arr, f) => arr.reduce((a, r) => a + f(r), 0);
const ratio = (arr) => {
  const c = sum(arr, (r) => r.cached || 0), p = sum(arr, (r) => r.prompt || 0);
  return p > 0 ? +(c / p).toFixed(4) : null;
};
const row = (r) => `HTTP ${r.status} · prompt=${r.prompt ?? '-'} cached=${r.cached ?? '-'} ratio=${r.ratio === null ? 'n/a' : (r.ratio * 100).toFixed(1) + '%'} · ${r.timeTotal ?? '-'}s · ${r.userLine?.slice(0, 20)}`;

console.log('\n=== Round A · sequential same-key pair ===');
for (const r of seqA) console.log(' ', row(r));
console.log('  aggregate ratio =', ratio(seqA));

console.log('\n=== Round B · same-key burst ×8 (all parallel) ===');
for (const r of burst) console.log(' ', row(r));
console.log('  aggregate ratio =', ratio(burst));

console.log('\n=== Round C · mixed lanes 3×ember + 3×oracle (parallel) ===');
for (const r of mixed) console.log(' ', row(r));
console.log('  ember aggregate =', ratio(mixed.filter((r) => r.cacheKey === keyEmber)));
console.log('  oracle aggregate =', ratio(mixed.filter((r) => r.cacheKey === keyOracle)));

const payload = {
  generated: new Date().toISOString(),
  script: 'scripts/cache-parallel-probe.mjs',
  model: MODEL,
  base: BASE.replace(/sk-[A-Za-z0-9-]+/g, 'sk-****'),
  prefixBytes: FROZEN.length,
  rounds: {
    sequentialSameKeyPair: { ratio: ratio(seqA), calls: seqA },
    sameKeyBurst8: { ratio: ratio(burst), calls: burst },
    mixedLanes: {
      ember: { ratio: ratio(mixed.filter((r) => r.cacheKey === keyEmber)), calls: mixed.filter((r) => r.cacheKey === keyEmber) },
      oracle: { ratio: ratio(mixed.filter((r) => r.cacheKey === keyOracle)), calls: mixed.filter((r) => r.cacheKey === keyOracle) },
    },
  },
};
writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log('\nwrote', OUT);
