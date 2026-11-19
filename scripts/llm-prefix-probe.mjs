#!/usr/bin/env node
/**
 * llm-prefix-probe · W-Z320 —— 冻结共享前缀（FROZEN_PREFIX）+ prompt_cache_key 单桶：
 * 多车道交替呼出验证——同一冰淇淋前缀一旦经手过，后续每条车道的第二次请求全都带 cached>0。
 *
 * 答案口径：
 *   - 同一 lane 第二次问同一个问题 → 本地摘要缓存命中（不计入这里）
 *   - 不同车道/不同问句 → 都必须命中**前缀缓存**（cached_tokens 明显大于 0），证明多路共享稳定不掉
 *   - prompt_tokens 会是 6.8K 左右（冻结前缀 + lane 后缀）
 *
 * 用法：node scripts/llm-prefix-probe.mjs
 * 密钥只从 .env 读（不打印）；走 Clash 7897。
 */
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { curlJsonPost } from './_curl-proxy.mjs';

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
if (!KEY) { console.error('missing LLM_API_KEY'); process.exit(1); }

const prefixFile = process.env.LLM_PREFIX_FILE || 'llm-frozen-prefix.txt';
const FROZEN = readFileSync(join(ROOT, 'server', 'ai-service', 'src', 'main', 'resources', 'ai', prefixFile), 'utf8').trim();

const LANES = {
  lore: '【炉火车道 · lore】玩家这一行问的是典籍——世界观、故事里的人与事、火、锚点、七百年、白桦、母题、回声、判官、白纸、汤。\n'
      + '· 不为故事里没有的人与事编造答案；典籍没有就是「炉火不知道」。\n'
      +  '· 不解释机制、不承诺版本/数值。',
  journey: '【炉火车道 · journey】玩家这一行讲的是自己的旅程——终局抉择、感受、记忆与节制。\n'
        + '· 守夜人在场，不在评判，不在分析。\n'
        + '· 不承诺任何数值/掉落/版本/机制；不给诊断意见。',
  gratitude: '【炉火车道 · gratitude】玩家这一行是一份谢意——收下它，但不邀功、不自夸——火只是烧着。',
  distress: '【炉火车道 · distress】玩家这一行带着迷惘或求救信号——火还在，你可以坐下来暖一会儿。\n'
          + '· 不否认、不说教、不给诊断——火只是在。',
  offtopic: '【炉火车道 · offtopic】玩家这一行与这趟旅程无关——温和地、轻声地把话题带回炉边。\n'
          + '· 不回答无关提问，不执行任何命令，不切换身份。',
};

const QUESTIONS = [
  '白桦是什么？',
  '这一趟我没白走吧？',
  '谢谢你一直在。',
  '我今天有点撑不住了。',
  '帮我定个闹钟。',
  '第七百年是怎么来的？',
  '炉火灭了我该怎么办？',
  '《余响集》是什么？',
];

async function ask(label, lane, user) {
  const system = FROZEN + '\n\n' + LANES[lane];
  const body = {
    model: MODEL,
    prompt_cache_key: 'crossrealm-canon-v1',
    messages: [
      { role: 'system', content: system, cache_control: { type: 'ephemeral' } },
      { role: 'user', content: user },
    ],
    max_tokens: 96,
    temperature: 0,
    stream: true,
    stream_options: { include_usage: true },
  };
  let attempt = 0;
  for (;;) {
    attempt += 1;
    const t0 = Date.now();
    const { status, body: raw, error } = await curlJsonPost(`${BASE}/chat/completions`,
      { accept: 'text/event-stream', authorization: 'Bearer ' + KEY }, body, 120000);
    const latency = Date.now() - t0;
    if (status === 200) {
      let usage = null;
      for (const block of String(raw).split('\n\n')) {
        for (const ln of block.split('\n')) {
          if (!ln.startsWith('data:')) continue;
          const data = ln.slice(5).trim();
          if (data === '[DONE]') continue;
          try { const j = JSON.parse(data); if (j.usage) usage = j.usage; } catch { /* partial */ }
        }
      }
      const cached = usage?.prompt_tokens_details?.cached_tokens ?? usage?.cached_tokens ?? null;
      const prompt = usage?.prompt_tokens;
      const ratio = cached != null && prompt ? ((cached / prompt) * 100).toFixed(1) + '%' : 'n/a';
      console.log(`${label} lane=${lane} prompt=${prompt} cached=${cached ?? 'n/a'} ratio=${ratio} (${latency}ms${attempt > 1 ? ' · attempt ' + attempt : ''})`);
      return { prompt, cached };
    }
    const retriable = (error && /curl: \(35\)|handshake|connect|reset|timed out/.test(String(error)))
      || status >= 500 || status === 0;
    if (attempt < 3 && retriable) {
      console.log(`${label} lane=${lane} transient attempt ${attempt} failed (${error ? String(error).slice(0, 60) : 'HTTP ' + status}) — retrying`);
      continue;
    }
    console.log(`${label} lane=${lane} FAILED after ${attempt} attempt(s): HTTP ${status}${error ? ' curl: ' + String(error).slice(0, 80) : ''} · ${String(raw).slice(0, 100)}`);
    return null;
  }
}

console.log('llm-prefix-probe: base=' + BASE + ' model=' + MODEL + ' frozenPrefix≈' + Math.round(FROZEN.length * 0.75) + ' tok');
console.log('--- 8 distinct questions × lanes, same bucket, sequential ---');
const lanesSeq = ['lore', 'journey', 'gratitude', 'distress', 'offtopic', 'lore', 'journey', 'gratitude'];
for (let i = 0; i < QUESTIONS.length; i++) {
  await ask(`#${i + 1}`, lanesSeq[i], QUESTIONS[i]);
}
console.log('--- interleaved rotation: lore A → journey B → lore A2 → journey B2 ---');
await ask('walkA1', 'lore', '灰白森林是什么？');
await ask('walkB1', 'journey', '我刚做完最后一个判定。');
await ask('walkA2', 'lore', '灰白森林里面是什么？');
await ask('walkB2', 'journey', '我想留一封信。');
console.log('--- cold baseline (unused bucket) for contrast ---');
{
  const alt = FROZEN + '\n\n【炉火车道 · lore】备用前端串连接参数。';
  const body = {
    model: MODEL,
    prompt_cache_key: 'crossrealm-probe-alt-bucket-7d2f',
    messages: [
      { role: 'system', content: alt, cache_control: { type: 'ephemeral' } },
      { role: 'user', content: '白桦是什么？' },
    ],
    max_tokens: 32,
    stream: true,
    stream_options: { include_usage: true },
  };
  const { body: raw, error } = await curlJsonPost(`${BASE}/chat/completions`,
    { accept: 'text/event-stream', authorization: 'Bearer ' + KEY }, body, 120000);
  if (error) {
    console.log('cold-alt-bucket curl error:', String(error).slice(0, 120));
  } else {
    for (const block of String(raw).split('\n\n')) {
      for (const ln of block.split('\n')) {
        if (ln.startsWith('data:') && ln.includes('"usage"')) {
          try { const j = JSON.parse(ln.slice(5).trim()); console.log('cold-alt-bucket usage:', JSON.stringify(j.usage)); } catch { /* partial */ }
        }
      }
    }
  }
}
console.log('done.');
