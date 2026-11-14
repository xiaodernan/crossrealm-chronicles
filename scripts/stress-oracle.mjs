#!/usr/bin/env node
/**
 * stress-oracle — Lore Oracle（ai-service · /api/ai/lore/*）压测器（W-Z86）
 *
 * 与 scripts/stress-load.mjs 同构（无第三方依赖）：
 *   readBurst    GET  /api/ai/lore/health        —— 只读热压（基线）
 *   answerBurst  POST /api/ai/lore/answer        —— 昂贵路径热压（真实链路：BM25+缓存+熔断+（stub）上游）
 *   mixed        health 1 × answer 3
 *
 * 目标通常为 throwaway ai-service 实例（见 server/scripts/stress-oracle-verify.ps1）：
 *   - 经 local-stub-llm.mjs stub 上游 → 真实全链路（BM25 检索 + DigestCache + Breaker + 队列），
 *     零真实 token 消耗，上游延迟真值 20 ms；
 *   - **注意**：Oracle 池自带 digest cache —— 同一问句第二次起走缓存轨，指标是「warm 缓存吞吐」；
 *     这是生产态真实画像（玩家重复问同一件事本就命中），报告里同时打印唯一提问数作为对照。
 *
 * 用法：
 *   node scripts/stress-oracle.mjs --target http://127.0.0.1:28883 --scenario answerBurst --concurrency 40 --duration 20
 *   node scripts/stress-oracle.mjs --scenario mixed --json
 *
 * 退出码：任一 5xx ⇒ 1；失败率 > --max-fail-rate（默认 2%）⇒ 1；否则 0。
 */
const DEFAULTS = {
  target: 'http://127.0.0.1:28883',
  scenario: 'answerBurst',
  concurrency: 40,
  durationSec: 20,
  requests: null,
  timeoutMs: 8000,
  failRate: 0.02,
  asJson: false,
};

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const inline = args.find((a) => a.startsWith(`--${name}=`));
  const i = args.indexOf(`--${name}`);
  const value = inline ? inline.split('=').slice(1).join('=') : (i === -1 ? undefined : args[i + 1]);
  return value === undefined ? fallback : value;
};
if (args.includes('--help') || args.includes('-h')) {
  console.log('usage: node scripts/stress-oracle.mjs [--target URL] [--scenario readBurst|answerBurst|mixed] [--concurrency N] [--duration SEC] [--requests N] [--timeout MS] [--json]');
  process.exit(0);
}

const target = opt('target', DEFAULTS.target).replace(/\/+$/, '');
const scenario = opt('scenario', DEFAULTS.scenario);
const concurrency = Number(opt('concurrency', DEFAULTS.concurrency));
const durationSec = Number(opt('duration', DEFAULTS.durationSec));
const requests = opt('requests', null) === null ? null : Number(opt('requests', null));
const timeoutMs = Number(opt('timeout', DEFAULTS.timeoutMs));
const failRate = Number(opt('max-fail-rate', DEFAULTS.failRate));
const asJson = args.includes('--json');

const QUESTIONS = [
  '锚火为什么没熄火？',
  '林渡是谁？',
  '第七章讲了什么？',
  '短片《看守的日子》讲的是什么？',
  '番外五《火之前》讲的是什么？',
  'Why doesn\'t the fire go out?',
];

async function hit(kind, i) {
  const start = performance.now();
  let status = 0; let netErr = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (kind === 'health') {
      const res = await fetch(`${target}/api/ai/lore/health`, { signal: controller.signal });
      status = res.status; await res.arrayBuffer();
    } else if (kind === 'answer') {
      const question = QUESTIONS[i % QUESTIONS.length];
      const res = await fetch(`${target}/api/ai/lore/answer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': `stress-${i}` },
        body: JSON.stringify({ question, limit: 4 }),
        signal: controller.signal,
      });
      status = res.status; await res.arrayBuffer();
    } else {
      throw new Error('unknown kind ' + kind);
    }
  } catch (err) {
    netErr = err?.name === 'AbortError' ? 'timeout' : (err?.message ?? 'network-error');
  } finally {
    clearTimeout(timer);
  }
  return { kind, status, latency: performance.now() - start, ok: netErr === null, netErr };
}

function planOp(i) {
  if (scenario === 'readBurst') return 'health';
  if (scenario === 'answerBurst') return 'answer';
  if (scenario === 'mixed') return i % 4 === 3 ? 'health' : 'answer';
  throw new Error(`unknown scenario: ${scenario}`);
}

const t0 = Date.now();
const endAt = t0 + durationSec * 1000;
const results = [];
let issued = 0;
async function worker() {
  for (;;) {
    if (requests !== null ? issued >= requests : Date.now() >= endAt) return;
    const i = issued++;
    results.push(await hit(planOp(i), i));
  }
}
const workers = [];
for (let c = 0; c < concurrency; c += 1) workers.push(worker());
await Promise.all(workers);

const failures = results.filter((r) => !r.ok || r.status >= 400);
const failCount = failures.length;
const fivexx = results.filter((r) => r.status >= 500 && r.status < 600).length;
const count2xx = results.filter((r) => r.status >= 200 && r.status < 300).length;
const count4xx = results.filter((r) => r.status >= 400 && r.status < 500).length;
const errRate = results.length ? failCount / results.length : 0;
const sorted = [...results].map((r) => r.latency).sort((a, b) => a - b);
const pct = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0);
const avg = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
const wallSec = Math.max(0.001, (Date.now() - t0) / 1000);
const actualRps = results.length ? results.length / wallSec : 0;

const report = {
  scenario, target, concurrency, durationSec, issued: results.length,
  ok: count2xx, client: count4xx, server: fivexx, errRate,
  latencyMs: { p50: Math.round(pct(0.5)), p95: Math.round(pct(0.95)), p99: Math.round(pct(0.99)), max: Math.round(pct(1)), avg: Math.round(avg) },
  rpsApprox: Number(actualRps.toFixed(1)),
  uniqueQuestions: Math.min(QUESTIONS.length, Math.ceil(results.length / concurrency)),
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`stress-oracle ${scenario} → ${target}`);
  console.log(`issued=${report.issued} ok=${report.ok} 4xx=${report.client} 5xx=${report.server} errRate=${(report.errRate * 100).toFixed(2)}%`);
  console.log(`latency p50=${report.latencyMs.p50}ms p95=${report.latencyMs.p95}ms p99=${report.latencyMs.p99}ms max=${report.latencyMs.max}ms avg=${report.latencyMs.avg}ms`);
  console.log(`rps(approx)=${report.rpsApprox}`);
}
process.exit((errRate > failRate || fivexx > 0) ? 1 : 0);
