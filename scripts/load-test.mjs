#!/usr/bin/env node
/**
 * load-test.mjs —— Spring Cloud 全链路压力测试（W-Z112）
 *
 * ## 在测什么（以及不在测什么）
 *
 * 这里测的是**网关 → 各下游服务 → （可选）LLM stub** 这一整条链路在成百上千并发"玩家"下的
 * 形态好坏：
 *   - 吞吐（rps）/ 延迟分布（p50/p95/p99/max）/ 错误率；
 *   - 网关 reactive 层是否撑得住（Netty + Spring Cloud Gateway）、下游服务是否会被自己打死。
 *
 * 不测的是真 LLM 上游（那笔账在 wkapi.pro 头上，不能用来压测）——AI 链路用
 * `scripts/local-stub-llm.mjs`（20ms 固定工作负载、固定 usage、带 cached_tokens）顶替，
 * 验的是我们自己那条 `gateway → ai-service → SSE 解析` 管线扛不扛得住并发。
 *
 * ## 用法
 *
 *   node scripts/load-test.mjs --scenario=version      # 单端点
 *   node scripts/load-test.mjs --scenario=all          # 全部场景轮转（gateway 混合负载）
 *   node scripts/load-test.mjs --users=300 --duration-ms=15000 --target=http://localhost:8080
 *   node scripts/load-test.mjs --scenario=ai --users=200   # 需要 ai-service 指向 stub
 *
 * ## 门槛（改门槛请走 ADR，别在脚本里悄悄挪）
 *
 *   轻读写端点（version/leaderboard/seasons/presence/notify）：errorRate < 1%，p99 < 800ms
 *   写端点（telemetry POST）                                  ：errorRate < 1%，p99 < 1500ms
 *   AI 端点（stub 全链路）                                     ：errorRate < 2%，p99 < 3000ms
 *   失败 = 退出码 1，CI 无服务时根本不跑（和 verify 的 compose 语义同形）。
 */
import { setTimeout as sleep } from 'node:timers/promises';

const target = (getArg('--target') ?? process.env.LOAD_TARGET ?? 'http://localhost:8080').replace(/\/+$/, '');
const scenarioArg = getArg('--scenario') ?? 'all';
const USERS = parseIntArg(getArg('--users'), 200);
const DURATION_MS = parseIntArg(getArg('--duration-ms'), 15000);
const JSON_OUT = process.argv.includes('--json');
const TIMEOUT_MS = parseIntArg(getArg('--timeout-ms'), 10000);
/** 轮转 X-Forwarded-For：把 N 个虚拟玩家摊到 N 个不同源 IP，模拟真实分布式玩家（而不是同一 localhost 撞同一条 IP 限流）。
 *  gateway 有意信任 XFF（代理部署），此模式测的是**限流器之外**的整条链路。
 *  不带这个 flag：所有请求来自同一个 IP —— 那会测出"限流器扛住了"（这也是一件事）。 */
const SPOOF_IPS = getArg('--spoof-ips') === 'true';

const post = (path, body) => ({ method: 'POST', path, body });

const SCENARIOS = {
  version: { method: 'GET', path: '/api/version' },
  leaderboard: { method: 'GET', path: '/api/leaderboard?limit=5' },
  seasons: { method: 'GET', path: '/api/seasons/active' },
  seasonsStats: { method: 'GET', path: '/api/seasons/stats' },
  presence: { method: 'GET', path: '/api/presence/world/count' },
  notify: { method: 'GET', path: '/api/notify/recent?limit=5' },
  telemetry: post('/api/telemetry/events', { type: 'loadtest', detail: 'concurrent probe', ts: Date.now() }),
  ai: post('/api/ai/chat/async', { question: '锚火象征着什么？用一句话回答。' }),
};

const MIXED_POOL = ['version', 'version', 'version', 'leaderboard', 'leaderboard', 'seasons', 'seasonsStats', 'presence', 'presence', 'notify', 'telemetry'];

// --- 工具 ------------------------------------------------------------------

function getArg(name) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  const p = process.argv.find((a) => a.startsWith(name + '='));
  return p ? p.slice(name.length + 1) : undefined;
}
function parseIntArg(v, fallback) { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback; }

const LAT = { version: [], leaderboard: [], seasons: [], seasonsStats: [], presence: [], notify: [], telemetry: [], ai: [] };
const COUNT = { ok: 0, err: 0 };
const ERR_SAMPLES = [];

/** 每个虚拟玩家一枚固定假 IP（真实分布式玩家的样子）——200 玩家 = 200 个不同源，
 *  每 IP 平均 ~2 rps，刚好压在限流器（6 rps/10s 窗）之下、又真实测到整条链路。 */
async function hit(name, ip) {
  const spec = SCENARIOS[name];
  const t0 = process.hrtime.bigint();
  let res;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const headers = spec.body ? { 'content-type': 'application/json' } : {};
      if (SPOOF_IPS && ip) headers['x-forwarded-for'] = ip;
      res = await fetch(target + spec.path, {
        method: spec.method,
        headers,
        body: spec.body ? JSON.stringify(spec.body) : undefined,
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    const dt = Number(process.hrtime.bigint() - t0) / 1e6;
    COUNT.err += 1;
    if (ERR_SAMPLES.length < 5) ERR_SAMPLES.push(`${name}: ${String(e?.cause?.message ?? e?.message ?? e)}`);
    LAT[name].push(dt);
    return;
  }
  const dt = Number(process.hrtime.bigint() - t0) / 1e6;
  LAT[name].push(dt);
  if (res.ok) COUNT.ok += 1;
  else {
    COUNT.err += 1;
    if (ERR_SAMPLES.length < 5) ERR_SAMPLES.push(`${name}: HTTP ${res.status}`);
    // 读 body 让连接干净回收（keep-alive 池复用）
    try { await res.text(); } catch { /* ignore */ }
  }
}

function pct(sortedArr, p) {
  if (sortedArr.length === 0) return 0;
  const idx = Math.min(sortedArr.length - 1, Math.ceil((p / 100) * sortedArr.length) - 1);
  return sortedArr[idx];
}
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const fmt = (n) => (Math.round(n * 100) / 100).toFixed(2);
const fmtMs = (n) => `${fmt(n)}ms`;

// --- 主循环 -----------------------------------------------------------------

const activeScenarios = scenarioArg === 'all' ? MIXED_POOL : [scenarioArg];
for (const s of activeScenarios) {
  if (!SCENARIOS[s]) {
    console.error(`未知 scenario: ${s}（可选：${Object.keys(SCENARIOS).join(', ')}, all）`);
    process.exit(2);
  }
}

console.log(`load-test · target=${target} · scenarios=${scenarioArg} · users=${USERS} · duration=${DURATION_MS}ms`);
console.log('（混合场景按 MIXED_POOL 轮转；不打真 LLM，AI 链路走本地 stub）');

const deadline = Date.now() + DURATION_MS;
let rr = 0;
const pick = () => activeScenarios[rr++ % activeScenarios.length];

const workers = Array.from({ length: USERS }, async (_, w) => {
  const ip = SPOOF_IPS ? `10.${(w >> 16) & 255}.${(w >> 8) & 255}.${(w & 255) || 1}` : undefined;
  while (Date.now() < deadline) {
    await hit(pick(), ip);
  }
});
await Promise.all(workers);

// --- 汇总 -------------------------------------------------------------------

const results = {};
let allErr = 0, allCnt = 0, hardFail = false;
for (const name of Object.keys(SCENARIOS)) {
  const lat = LAT[name].slice().sort((a, b) => a - b);
  if (lat.length === 0) continue;
  const cnt = lat.length;
  const isWrite = name === 'telemetry';
  const isAi = name === 'ai';
  const errRate = COUNT.err / Math.max(1, COUNT.ok + COUNT.err);
  results[name] = {
    requests: cnt,
    rps: fmt((cnt / (DURATION_MS / 1000))),
    p50: fmtMs(pct(lat, 50)),
    p95: fmtMs(pct(lat, 95)),
    p99: fmtMs(pct(lat, 99)),
    max: fmtMs(lat[lat.length - 1]),
    avg: fmtMs(avg(lat)),
  };
}
// 错误统计分口径：stderr 只给总数（不再拆每个场景），门槛按场景类型判断
const total = COUNT.ok + COUNT.err;
const errRate = total ? (COUNT.err / total) * 100 : 0;
const gates = {
  errors: errRate < 1.0,
  p99fast: true,
};
for (const name of Object.keys(results)) {
  const p99 = parseFloat(results[name].p99);
  const isAi = name === 'ai';
  const ok = !isAi || p99 < 3000;
  gates.p99fast = gates.p99fast && (isAi ? ok : p99 < (name === 'telemetry' ? 1500 : 800));
}

if (JSON_OUT) {
  console.log(JSON.stringify({ target, scenario: scenarioArg, users: USERS, durationMs: DURATION_MS, totals: { ok: COUNT.ok, err: COUNT.err, errRate: fmt(errRate) + '%' }, results, gates }, null, 2));
} else {
  console.log('──────────────────────────────────────────────────────────────');
  for (const [name, r] of Object.entries(results)) {
    console.log(`${name.padEnd(14)} n=${String(r.requests).padStart(5)}  ${String(r.rps).padStart(8)} rps  p50=${r.p50}  p95=${r.p95}  p99=${r.p99}  max=${r.max}  avg=${r.avg}`);
  }
  console.log('──────────────────────────────────────────────────────────────');
  console.log(`合计 ${total} 次请求 · 成功 ${COUNT.ok} · 失败 ${COUNT.err} · 错误率 ${fmt(errRate)}%`);
  if (ERR_SAMPLES.length) for (const s of ERR_SAMPLES) console.log('  错误样本:', s);
  console.log(`门槛：错误率 < 1% ${gates.errors ? '✓' : '✗'} · p99 分级达标 ${gates.p99fast ? '✓' : '✗'}`);
}
process.exit(gates.errors && gates.p99fast ? 0 : 1);
