#!/usr/bin/env node
/**
 * stress-load：在线伙伴服务压测器（W-Z79 · 2026-11）
 *
 * ## 它做什么
 * 面向已运行的 `gateway` / `game-service` 实例（默认 `http://localhost:8080`），按场景发洪峰请求，
 * 输出机器可读的读数（rps / 延迟 p50/p95/p99/max / 5xx 计数 / 非预期 4xx 计数），并给出确定性的退出码。
 * 无第三方依赖（原生 fetch + 原生 worker）。
 *
 * ## 场景
 * | 场景 | 端点 | 目的 |
 * |---|---|---|
 * | `readBurst` | `GET /api/leaderboard?limit=10` / `GET /api/trials/leaderboard` / `GET /api/telemetry/events/count`（轮询，round-robin） | 读路径热压——稳定性与延迟分布 |
 * | `writeBurst` | `POST /api/leaderboard`（每请求一个新幂等键）+ `POST /api/trials/runs` | 写路径热压（含幂等台账写路径，后端可为 `redis` / `memory`） |
 * | `idempotentReplay` | 同一个 `X-Idempotency-Key` 重复打 500 次 | 台账/缓存正确性——任何一条 5xx 即红 |
 * | `telemetryFlood` | `POST /api/telemetry/events` | 遥测入口洪峰（有界内存淘汰路径） |
 * | `mixed` | read 70% / write 30% | 拟真负载 |
 *
 * ## 指标与判据
 * - 记录每请求延迟（墙钟 ms），最后取排序后的百分位；
 * - `fail` = 任何非预期状态码（全部场景 2xx 为绿；预期 4xx 仅出现在 429/413 阶）/ 网络错误 / 超时视为失败；
 * - 退出码：`--fail-on-5xx`（默认开）任一 5xx ⇒ 1；`--max-fail-rate <0-1>=0.02`（默认 2%）失败率超限 ⇒ 1；否则 0。
 *
 * ## 用法
 *   node scripts/stress-load.mjs --target http://localhost:8081 --scenario readBurst --concurrency 120 --duration 25
 *   node scripts/stress-load.mjs --scenario writeBurst --concurrency 40 --duration 15
 *   node scripts/stress-load.mjs --scenario idempotentReplay --requests 500
 *   node scripts/stress-load.mjs --json
 *
 * 注：这是**开发压测**，不是 benchmark 营销数字；target 必须是本机或受信任的隔离实例。
 */
const DEFAULTS = {
  target: 'http://localhost:8081',
  scenario: 'mixed',
  concurrency: 80,
  durationSec: 20,
  requests: null,          // 非空时固定总次数（忽略 duration）
  timeoutMs: 3000,
  failRate: 0.02,
  failOn5xx: true,
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
  console.log('usage: node scripts/stress-load.mjs [--target URL] [--scenario readBurst|writeBurst|idempotentReplay|telemetryFlood|mixed] [--concurrency N] [--duration SEC] [--requests N] [--timeout MS] [--max-fail-rate RATE] [--json]');
  process.exit(0);
}

const target = opt('target', DEFAULTS.target).replace(/\/+$/, '');
const scenario = opt('scenario', DEFAULTS.scenario);
const concurrency = Number(opt('concurrency', DEFAULTS.concurrency));
const durationSec = Number(opt('duration', DEFAULTS.durationSec));
const requests = opt('requests', null) === null ? null : Number(opt('requests', null));
const timeoutMs = Number(opt('timeout', DEFAULTS.timeoutMs));
const failRate = Number(opt('max-fail-rate', DEFAULTS.failRate));
const failOn5xx = !args.includes('--no-fail-on-5xx');
const asJson = args.includes('--json');

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const payload = (kind) => {
  if (kind === 'leaderboard') {
    return { runner: `stress-${Math.floor(Math.random() * 100000)}`, bossId: ['beast', 'dragon', 'singularity-herald'][(Math.random() * 3) | 0], clearTimeMs: 200000 + ((Math.random() * 400000) | 0), chapter: 5 };
  }
  if (kind === 'trials') {
    return { runner: `stress-${Math.floor(Math.random() * 100000)}`, seasonId: 'cycle-2026w45', score: (Math.random() * 10000) | 0, layersCleared: 1 + ((Math.random() * 5) | 0), secondsLeft: (Math.random() * 60) | 0 };
  }
  if (kind === 'telemetry') {
    return { type: 'stress-probe', detail: JSON.stringify({ at: Date.now() }) };
  }
  return {};
};

async function hit(kind) {
  const start = performance.now();
  let status = 0; let netErr = null; let body = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (kind === 'read-leaderboard') {
      const res = await fetch(`${target}/api/leaderboard?limit=10`, { signal: controller.signal });
      status = res.status; await res.arrayBuffer();
    } else if (kind === 'read-trials') {
      const res = await fetch(`${target}/api/trials/leaderboard?limit=10`, { signal: controller.signal });
      status = res.status; await res.arrayBuffer();
    } else if (kind === 'read-events-count') {
      const res = await fetch(`${target}/api/telemetry/events/count`, { signal: controller.signal });
      status = res.status; await res.arrayBuffer();
    } else if (kind === 'write-leaderboard') {
      const res = await fetch(`${target}/api/leaderboard`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Idempotency-Key': `stress-${uuid()}` },
        body: JSON.stringify(payload('leaderboard')),
        signal: controller.signal,
      });
      status = res.status; body = await res.text();
    } else if (kind === 'write-trials') {
      const res = await fetch(`${target}/api/trials/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Idempotency-Key': `stress-${uuid()}` },
        body: JSON.stringify(payload('trials')),
        signal: controller.signal,
      });
      status = res.status; body = await res.text();
    } else if (kind === 'idempotent-replay') {
      const res = await fetch(`${target}/api/leaderboard`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Idempotency-Key': 'stress-replay-guard' },
        body: JSON.stringify({ runner: 'stress-idempotent', bossId: 'beast', clearTimeMs: 250000, chapter: 5 }),
        signal: controller.signal,
      });
      status = res.status;
      body = { replayed: res.headers.get('x-idempotent-replayed') === 'true' };
    } else if (kind === 'write-telemetry') {
      const res = await fetch(`${target}/api/telemetry/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload('telemetry')),
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
  const latency = performance.now() - start;
  return { kind, status, latency, ok: netErr === null, netErr, expectReplay: kind === 'idempotent-replay' };
}

function planOp(i) {
  if (scenario === 'readBurst') return ['read-leaderboard', 'read-trials', 'read-events-count'][i % 3];
  if (scenario === 'writeBurst') return ['write-leaderboard', 'write-trials'][i % 2];
  if (scenario === 'idempotentReplay') return 'idempotent-replay';
  if (scenario === 'telemetryFlood') return 'write-telemetry';
  if (scenario === 'mixed') {
    const r = (i * 2654435761) % 100;         // 稳定散列，避免每进程同序列
    return r < 55 ? 'read-leaderboard' : r < 70 ? 'read-trials' : r < 80 ? 'write-leaderboard' : r < 90 ? 'write-trials' : 'write-telemetry';
  }
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
    const kind = planOp(i);
    results.push(await hit(kind));
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
// 用真实墙钟算 rps（末请求会越过 endAt）
const wallSec = Math.max(0.001, (Date.now() - t0) / 1000);
const actualRps = results.length ? results.length / wallSec : 0;

const report = {
  scenario, target, concurrency, durationSec, issued: results.length,
  ok: count2xx, client: count4xx, server: fivexx, errRate,
  latencyMs: { p50: Math.round(pct(0.5)), p95: Math.round(pct(0.95)), p99: Math.round(pct(0.99)), max: Math.round(pct(1)), avg: Math.round(avg) },
  rpsApprox: Number(actualRps.toFixed(1)),
  okRate: Number((count2xx / Math.max(1, results.length)).toFixed(4)),
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`stress-load ${scenario} → ${target}`);
  console.log(`issued=${report.issued} ok=${report.ok} 4xx=${report.client} 5xx=${report.server} errRate=${(report.errRate * 100).toFixed(2)}%`);
  console.log(`latency p50=${report.latencyMs.p50}ms p95=${report.latencyMs.p95}ms p99=${report.latencyMs.p99}ms max=${report.latencyMs.max}ms avg=${report.latencyMs.avg}ms`);
  console.log(`rps(approx)=${report.rpsApprox}`);
}
const shouldFail = errRate > failRate || (failOn5xx && fivexx > 0);
process.exit(shouldFail ? 1 : 0);
