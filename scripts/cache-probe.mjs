#!/usr/bin/env node
/**
 * 2026-11-17 W-Z308：缓存命中实测（真上游，经 Clash 7897 隧道，curl 出口）
 *
 * 背景：
 *   scripts/cache-probe.mjs 原先走自写的 `_clash-proxy.mjs`（CONNECT + TLS 裸写）。
 *   2026-11-17 复测时该隧道稳定失败（上游先于响应头 `end`，报「Clash 隧道：响应没有头部」），
 *   而同一进程、同一代理、同一 URL 用 curl 实测 HTTP 200 且 usage 完整 —— 失败在自写栈本身。
 *   本脚本改用 scripts/_curl-proxy.mjs（curl 出口），与上游交互恢复实测能力。
 *
 * 用法：node scripts/cache-probe.mjs
 * 读 .env 的 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL；密钥不打印、不写盘。
 *  LLM_PROXY_URL 未设置时默认走 http://127.0.0.1:7897；设为 direct 则直连（不推荐，本机会被拦）。
 */
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { proxyIsSet, curlFetch } from './_curl-proxy.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
try {
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* 退回环境变量 */ }
const KEY = env.LLM_API_KEY || process.env.LLM_API_KEY;
const BASE = (env.LLM_BASE_URL || process.env.LLM_BASE_URL || 'https://api.aizzz.xyz/v1').replace(/\/+$/, '');
const MODEL = env.LLM_MODEL || process.env.LLM_MODEL || 'gpt-6.1-terra';
if (!KEY) { console.error('cache-probe: 缺少 LLM_API_KEY'); process.exit(1); }
if (!proxyIsSet()) console.log('cache-probe: LLM_PROXY_URL=direct —— 本机直连大概率 403（仅自测用）');
console.log('cache-probe: base=%s model=%s key=****（不打印）', BASE, MODEL);

/* 足够长的稳定前缀：>1024 tokens 门槛——与 LlmClient 的 /ai/system-prompt.txt 同一性质 */
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
    prompt_cache_key: 'crossrealm-canon-v1',
    messages: [system, { role: 'user', content: USER }],
    temperature: 0,
    max_tokens: 64,
  };
  if (stream) { b.stream = true; b.stream_options = { include_usage: true }; }
  return b;
}

function call(label, opts) {
  const { status, body: raw, error, timeTotal } = curlFetch({
    url: `${BASE}/chat/completions`,
    method: 'POST',
    headers: {
      accept: opts.stream ? 'text/event-stream' : 'application/json',
      authorization: 'Bearer ' + KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body(opts)),
    timeoutMs: 120000,
  });
  if (error || status !== 200) {
    console.log(`${label}: ${error ? 'curl error ' + String(error).slice(0, 120) : 'HTTP ' + status} · ${String(raw).slice(0, 120)}`);
    return null;
  }
  let usage = null, text = '';
  if (!opts.stream) {
    try { const j = JSON.parse(raw); usage = j.usage ?? null; text = j.choices?.[0]?.message?.content ?? ''; } catch { /* 非 JSON */ }
    console.log(`${label}: HTTP 200 · ${timeTotal}s · usage=${JSON.stringify(usage)} answer=${String(text).slice(0, 40).replace(/\n/g, ' ')}`);
    return usage;
  }
  for (const block of String(raw).split('\n\n')) {
    for (const ln of block.split('\n')) {
      if (!ln.startsWith('data:')) continue;
      const data = ln.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const j = JSON.parse(data);
        const delta = j.choices?.[0]?.delta?.content;
        if (delta) text += delta;
        if (j.usage) usage = j.usage;
      } catch { /* partial chunk */ }
    }
  }
  console.log(`${label}: HTTP 200 · ${timeTotal}s · usage=${JSON.stringify(usage)} answer=${text.slice(0, 40).replace(/\n/g, ' ')}`);
  return usage;
}

const u1 = call('① non-stream, no marker (control)', { stream: false, cacheControl: false });
const u2 = call('② stream+include_usage, no marker (control)', { stream: true, cacheControl: false });
const u3 = call('③ cold (first prompt_cache_key call)', { stream: true, cacheControl: true });
const u4 = call('③ warm #2', { stream: true, cacheControl: true });
const u5 = call('③ warm #3', { stream: true, cacheControl: true });
const u6 = call('③ warm #4', { stream: true, cacheControl: true });
const u7 = call('③ warm #5', { stream: true, cacheControl: true });
const u8 = call('③ warm #6', { stream: true, cacheControl: true });

const cached = (u) => u?.prompt_cache_hit_tokens ?? u?.prompt_tokens_details?.cached_tokens ?? u?.cached_tokens ?? 'no cache field in usage';
const pct = (u) => {
  const c = cached(u);
  const p = u?.prompt_tokens;
  if (typeof c === 'number' && Number.isFinite(p) && p > 0) return (c / p * 100).toFixed(1) + '% (' + c + '/' + p + ')';
  return String(c);
};
console.log('');
console.log('==== result (③ same prompt_cache_key: crossrealm-canon-v1, identical shape to LlmClient) ====');
console.log('① non-stream  cached =', cached(u1));
console.log('② stream warm cached =', cached(u2));
for (const [label, u] of [['cold', u3], ['warm#2', u4], ['warm#3', u5], ['warm#4', u6], ['warm#5', u7], ['warm#6', u8]]) {
  console.log('③ ' + label + ' cached =', pct(u));
}
console.log('LlmClient real request shape = stream + include_usage + system cache_control:ephemeral (frozen prefix) + prompt_cache_key:crossrealm-canon-v1');
