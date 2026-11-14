#!/usr/bin/env node
/**
 * 2026-11-14 W-Z57b：wkapi.pro 缓存命中实测（真上游，~5 次小调用）
 *
 * 背景（用户连续反馈）：
 *   「为什么缓存命中率低 / 一直显示非流 / 好像流的时候命中率高」
 * 结论已在 W-Z11/W-Z12 修复（stream:true + stream_options.include_usage:true
 * + system message cache_control:ephemeral），这里用**真实调用**实测验证：
 *   ① 非流（stream 缺省）        —— usage 是否可见？
 *   ② 流 + include_usage，无标记 —— cached 是否一直是 0？
 *   ③ 流 + include_usage + cache_control，连发两次 —— 第二次 cached > 0？
 *
 * 用法：node scripts/cache-probe.mjs
 * 读 .env 的 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL；密钥不打印。
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const env = {};
try {
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /*退回环境变量*/ }
const KEY = env.LLM_API_KEY || process.env.LLM_API_KEY;
const BASE = (env.LLM_BASE_URL || process.env.LLM_BASE_URL || 'https://wkapi.pro/v1').replace(/\/+$/, '');
const MODEL = env.LLM_MODEL || process.env.LLM_MODEL || 'gpt-6-sol';
if (!KEY) { console.error('cache-probe: 缺少 LLM_API_KEY'); process.exit(1); }
console.log('cache-probe: base=%s model=%s key=****（不打印）', BASE, MODEL);

/* 足够长的稳定前缀：wkapi 的 prompt-cache 要求 system ≥ 1024 tokens，
   以下是「跨界纪元顾问设定」原文的摘抄与扩写（约 1200 tokens），
   与 LlmClient 的 /ai/system-prompt.txt 同一性质——稳定、不含时间戳。 */
const SYSTEM = [
  '你是「跨界纪元」的资深顾问。你只根据游戏实际存在的系统回答，不虚构不存在的 NPC、道具、任务与数字。',
  '你回答时使用玩家当前语言（中文为主），控制在三段以内：结论 → 理由 → 一条可执行建议。',
  '……（稳定上下文摘录，故意重复以挤过 1024-token 门槛）……',
  '世界观：位面交汇枢纽居中，环以五域：霜风莽原、熔岩脊脉、旧日低语虚空、破碎时线、营火远岸。',
  '核心循环：采集 → 炼制 → 战斗 → 锻造 → 终章抉择：把火留给后来人，或安静地走完。',
  '五 Boss：影界守护者（光暗两系）、大奥术师·萨尔林（烈焰）、引力化身·奇点领主（引力井）、时线执政官（回溯）、混沌裂隙领主（混沌弹幕）。',
  '系统：天气、昼夜、好感度、钓鱼、采矿、集齐 17 母题成就墙、归途残卷、锚火终局、跨媒体宇宙（七章小说 + OST 25 曲）。',
  '在线层（可选）：顾问面板「炉火报讯台」推送 Boss 讨伐、换季、试炼榜易主、首领速通新王等世界事件；离线=零网络。',
  '性能目标：60fps、p99 帧时 < 20ms、首屏体积 ≤ 2.25 MiB；服务端：Spring Cloud 八个微服务 + Redis 台账 + Pub/Sub 扇出 + Feign 镜像。',
  '回答纪律：没有数据就说没有；涉及数值引用当前 build 的默认参数；绝不伪造函数名；绝不承诺未实现的功能。',
  '以上条款视为永久有效，回答时只用其中的信息组织答案，不引入外部品牌，不输出 markdown 表格。',
].join('\n').repeat(2);

const USER = '用一句话回答：终章抉择的两种结局分别会发生什么？';

function body({ stream, cacheControl }) {
  const system = cacheControl
    ? { role: 'system', content: SYSTEM, cache_control: { type: 'ephemeral' } }
    : { role: 'system', content: SYSTEM };
  const b = {
    model: MODEL,
    messages: [system, { role: 'user', content: USER }],
    temperature: 0,
    max_tokens: 64,
  };
  if (stream) { b.stream = true; b.stream_options = { include_usage: true }; }
  return b;
}

async function call(label, opts) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(opts.stream ? { accept: 'text/event-stream' } : {}), authorization: 'Bearer ' + KEY },
    body: JSON.stringify(body(opts)),
  });
  if (!res.ok) { console.log(`${label}: HTTP ${res.status} ${(await res.text()).slice(0, 120)}`); return null; }
  if (!opts.stream) {
    const j = await res.json();
    console.log(`${label}: HTTP 200 usage=${JSON.stringify(j.usage)}`);
    return j.usage ?? null;
  }
  // SSE：逐块解析，抓末尾 usage 块
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', usage = null, text = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, idx); buffer = buffer.slice(idx + 2);
      for (const ln of raw.split('\n')) {
        if (!ln.startsWith('data:')) continue;
        const data = ln.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const j = JSON.parse(data);
          const delta = j.choices?.[0]?.delta?.content;
          if (delta) text += delta;
          if (j.usage) usage = j.usage;
        } catch { /* partial */ }
      }
    }
  }
  console.log(`${label}: HTTP 200 usage=${JSON.stringify(usage)} answer=${text.slice(0, 40).replace(/\n/g, ' ')}`);
  return usage;
}

const u1 = await call('① 非流·无标记          ', { stream: false, cacheControl: false });
const u2 = await call('② 流+include_usage·无标记', { stream: true, cacheControl: false });
const u3 = await call('③ 流+include_usage+标记·第1次', { stream: true, cacheControl: true });
const u4 = await call('③ 流+include_usage+标记·第2次', { stream: true, cacheControl: true });

const cached = (u) => u?.prompt_cache_hit_tokens ?? u?.prompt_tokens_details?.cached_tokens ?? u?.cached_tokens ?? '（usage 未携带缓存字段）';
console.log('\n==== 结论 ====');
console.log('非流（无标记）        cached =', cached(u1));
console.log('流+include_usage（无标记）cached =', cached(u2));
console.log('流+include_usage+标记（第1次・冷） cached =', cached(u3));
console.log('流+include_usage+标记（第2次・暖） cached =', cached(u4));
console.log('LlmClient 实际请求形状 = ③（stream + include_usage + system cache_control:ephemeral）');
