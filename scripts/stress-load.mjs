#!/usr/bin/env node
/**
 * stress-load：在线伙伴服务压测器（W-Z79 · 2026-11）
 *
 * ## 它做什么
 * 面向已运行的 `gateway` / `game-service` 实例（`--target` 必填，见下面「用法」），按场景发洪峰请求，
 * 输出机器可读的读数（rps / 延迟 p50/p95/p99/max / 5xx 计数 / 非预期 4xx 计数），并给出确定性的退出码。
 * 无第三方依赖（原生 fetch + 原生 worker）。
 *
 * ## 场景
 * | 场景 | 端点 | 目的 |
 * |---|---|---|
 * | `readBurst` | `GET /api/leaderboard?limit=10` / `GET /api/trials/leaderboard` / `GET /api/telemetry/events/count`（轮询，round-robin） | 读路径热压——稳定性与延迟分布 |
 * | `writeBurst` | `POST /api/leaderboard`（每请求一个新幂等键）+ `POST /api/trials/runs` | 写路径热压（含幂等台账写路径，后端可为 `redis` / `memory`） |
 * | `idempotentReplay` | 同一个 `X-Idempotency-Key` 重复打 500 次 | 台账/缓存正确性——任何一条 5xx 即红；**整轮一次都没重放也即红**（`x-idempotent-replayed` 恒 false ⇒ 这个键压根没进台账，从前这里把值算出来就丢，绿的是状态码不是台账） |
 * | `telemetryFlood` | `POST /api/telemetry/events` | 遥测入口洪峰（有界内存淘汰路径） |
 * | `mixed` | read 70% / write 30% | 拟真负载 |
 *
 * ## 指标与判据
 * - 记录每请求延迟（墙钟 ms），最后取排序后的百分位 —— 每一个分支都把响应体读干净（`arrayBuffer()` / `text()`），
 *   不然量到的是"服务器把首字节交出来的时刻"，而不是"这一趟走完的时刻"；
 * - `fail` = 任何非预期状态码（全部场景 2xx 为绿；预期 4xx 仅出现在 429/413 阶）/ 网络错误 / 超时视为失败；
 * - 退出码：`--fail-on-5xx`（默认开）任一 5xx ⇒ 1；`--max-fail-rate <0-1>=0.02`（默认 2%）失败率超限 ⇒ 1；
 *   `idempotentReplay` 场景整轮零重放 ⇒ 1；**用法不对（缺 `--target` 或 URL 形状错）⇒ 2，且一个请求都不发**；否则 0。
 *
 * ## 预期 4xx（治理器是功能，不是故障）
 * Spring Cloud Gateway 的按源IP限流（`maxRequests`/`windowMs`，默认 60 次 / 10 秒）会把
 * 超额请求一律以 429 打下来。单源冲击时这就是**预期结果**，不是系统脆弱：报告里单独列
 * `limited`（429/413 计数）与 `errRateNoLimited`；传 `--accept-limited` 后，退出码只按
 * 「非 429/413 的真失败」+ 5xx 判定（多源 × 限流压测时用这个）。未传时行为与旧版一致。
 * `limited` 与 `errRateNoLimited` 始终输出，便于人工看板直接截取。
 *
 * ## 用法
 *   node scripts/stress-load.mjs --target http://127.0.0.1:28080 --scenario readBurst --concurrency 120 --duration 25
 *   node scripts/stress-load.mjs --target http://localhost:18880 --scenario writeBurst --concurrency 40 --duration 15
 *   node scripts/stress-load.mjs --target http://localhost:18801 --scenario idempotentReplay --requests 500
 *   node scripts/stress-load.mjs --target http://localhost:28080 --scenario mixed --json
 *
 * **`--target` 没有默认值，且这是刻意的（W-Z513）**：本机与 CI 之外，8080 / 8081 / 8761 / 8888
 * 这些"标准端口"都可能正被**别人的**服务占着——账本里有实录（W-Z335 前后：`careeros-gateway`
 * 占着 `127.0.0.1:8081`，"误打会冲击他人业务"）。本仓自己的端口是 **18xxx（compose 参考栈：
 * 网关 18880、game 18801）** 与 **28xxx（smoke 一次性实例：网关 28080、game 28081）**，
 * `docs/LOAD_TEST.md` 那节端口对照表就是这件事的真源。一个会默认打邻居的压测器不是工具，是事故；
 * 不带参数就退出码 2 把用法打出来，比悄悄发一轮洪峰便宜得多。两条路自己选：
 * - **走网关**（compose 18880 / smoke 28080）：量的是**治理面**——限流、熔断、请求号关联；
 *   单源冲击必然出 429，那不是故障，配合 `--accept-limited` 看真失败。
 * - **直连服务**（compose 18801 / smoke 28081）：量的是**容量**，绕开治理面，所以它的绿不代表
 *   网关那一侧没事——两路各测各的，别拿一条的绿交另一条的账。
 *
 * 注：这是**开发压测**，不是 benchmark 营销数字；target 必须是本机或受信任的隔离实例。
 */
const DEFAULTS = {
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
const USAGE = 'usage: node scripts/stress-load.mjs --target URL [--scenario readBurst|writeBurst|idempotentReplay|telemetryFlood|mixed] [--concurrency N] [--duration SEC] [--requests N] [--timeout MS] [--max-fail-rate RATE] [--accept-limited] [--json]';
if (args.includes('--help') || args.includes('-h')) {
  console.log(USAGE);
  console.log('  --target 必填：8080/8081 这些标准端口在本机可能属于别的项目，不带参数就退出码 2');
  console.log('  退出码：0 绿 / 1 读数不合格 / 2 用法不对（没打任何一个请求）');
  process.exit(0);
}

const rawTarget = opt('target', null);
if (rawTarget === null) {
  console.error('stress-load：缺 --target。不给默认值是刻意的——'
    + '8080/8081/8761/8888 这些"标准端口"可能正被别人的服务占着，'
    + '一个默认打邻居的压测器不是工具，是事故（账本实录：careeros-gateway 占 127.0.0.1:8081）。');
  console.error(USAGE);
  process.exit(2);
}
if (!/^https?:\/\/\S+$/.test(rawTarget)) {
  // 形状不对的 target（漏了 scheme 的 `localhost:8080` 最常见）会在每一个请求上抛一次，
  // 交回来一条"失败率 100%"的红 —— 看着像被测服务塌了，其实是命令行写错了。
  console.error(`stress-load：--target 要一个完整 URL（带 http:// 或 https://），收到的是 "${rawTarget}"。`);
  console.error(USAGE);
  process.exit(2);
}
const target = rawTarget.replace(/\/+$/, '');
const scenario = opt('scenario', DEFAULTS.scenario);
const concurrency = Number(opt('concurrency', DEFAULTS.concurrency));
const durationSec = Number(opt('duration', DEFAULTS.durationSec));
const requests = opt('requests', null) === null ? null : Number(opt('requests', null));
const timeoutMs = Number(opt('timeout', DEFAULTS.timeoutMs));
const failRate = Number(opt('max-fail-rate', DEFAULTS.failRate));
const failOn5xx = !args.includes('--no-fail-on-5xx');
const asJson = args.includes('--json');
const acceptLimited = args.includes('--accept-limited');

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
  let status = 0; let netErr = null; let replayed = null;
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
      status = res.status;
      await res.text();
    } else if (kind === 'write-trials') {
      const res = await fetch(`${target}/api/trials/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Idempotency-Key': `stress-${uuid()}` },
        body: JSON.stringify(payload('trials')),
        signal: controller.signal,
      });
      status = res.status;
      await res.text();
    } else if (kind === 'idempotent-replay') {
      const res = await fetch(`${target}/api/leaderboard`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Idempotency-Key': 'stress-replay-guard' },
        body: JSON.stringify({ runner: 'stress-idempotent', bossId: 'beast', clearTimeMs: 250000, chapter: 5 }),
        signal: controller.signal,
      });
      status = res.status;
      await res.arrayBuffer();
      // 台账有没有真的接住这一笔，只有响应_header_ 说得出（状态码 201 与 200 在两条路上都可以是 2xx）。
      // 从前这里把值算出来就丢掉，于是 `idempotentReplay` 只量得到"没崩"，量不到"重放"。
      replayed = res.headers.get('x-idempotent-replayed') === 'true';
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
  return { kind, status, latency, ok: netErr === null, netErr, replayed, expectReplay: kind === 'idempotent-replay' };
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
const limited = results.filter((r) => r.status === 429 || r.status === 413).length;
// 台账重放（W-Z513）：这一格从前只判"没崩"，而"同一个幂等键有没有被台账接住"这件事
// 算出来就丢在 `hit()` 里 —— 于是 `idempotentReplay` 交回的绿，量的其实只是状态码。
// 判"整轮一次都没重放"而不是"必须全都重放"：幂等台账有 TTL，中途某笔重新落账是正常行为，
// 把它判红就是在骗自己。真正的病是**一条都没重放过**——那说明这个键压根没进台账。
const replayTargets = results.filter((r) => r.expectReplay);
const replayedCount = replayTargets.filter((r) => r.replayed === true).length;
const replayNever = scenario === 'idempotentReplay' && replayTargets.length > 1 && replayedCount === 0;
const realFailures = acceptLimited
  ? results.filter((r) => !r.ok || (r.status >= 400 && r.status !== 429 && r.status !== 413)).length
  : failCount;
const errRate = results.length ? failCount / results.length : 0;
const errRateNoLimited = results.length ? realFailures / results.length : 0;
const sorted = [...results].map((r) => r.latency).sort((a, b) => a - b);
const pct = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0);
const avg = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
// 用真实墙钟算 rps（末请求会越过 endAt）
const wallSec = Math.max(0.001, (Date.now() - t0) / 1000);
const actualRps = results.length ? results.length / wallSec : 0;

const report = {
  scenario, target, concurrency, durationSec, issued: results.length,
  ok: count2xx, client: count4xx, server: fivexx, limited, errRate,
  replayed: replayedCount, replayTargets: replayTargets.length, replayNever,
  errRateNoLimited: Number(errRateNoLimited.toFixed(4)),
  latencyMs: { p50: Math.round(pct(0.5)), p95: Math.round(pct(0.95)), p99: Math.round(pct(0.99)), max: Math.round(pct(1)), avg: Math.round(avg) },
  rpsApprox: Number(actualRps.toFixed(1)),
  okRate: Number((count2xx / Math.max(1, results.length)).toFixed(4)),
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`stress-load ${scenario} → ${target}${acceptLimited ? ' [accept-limited]' : ''}`);
  console.log(`issued=${report.issued} ok=${report.ok} 4xx=${report.client} (limited=${report.limited}) 5xx=${report.server} errRate=${(report.errRate * 100).toFixed(2)}% errRateNoLimited=${(report.errRateNoLimited * 100).toFixed(2)}%`);
  if (report.replayTargets > 0) {
    console.log(`replay=${report.replayed}/${report.replayTargets}${report.replayNever ? ' ← 台账一次都没重放：这个幂等键压根没进账' : ''}`);
  }
  console.log(`latency p50=${report.latencyMs.p50}ms p95=${report.latencyMs.p95}ms p99=${report.latencyMs.p99}ms max=${report.latencyMs.max}ms avg=${report.latencyMs.avg}ms`);
  console.log(`rps(approx)=${report.rpsApprox}`);
}
const judgeRate = acceptLimited ? errRateNoLimited : errRate;
const shouldFail = judgeRate > failRate || (failOn5xx && fivexx > 0) || replayNever;
// Windows libuv 会因「未来得及关闭的 fetch 句柄」在 process.exit 硬退出路径上触发
// STATUS_STACK_BUFFER_OVERRUN（0xC0000409 / UV_HANDLE_CLOSING）——用 exitCode + 自然回落代替硬退出。
process.exitCode = shouldFail ? 1 : 0;
