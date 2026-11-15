#!/usr/bin/env node
/**
 * advisor-e2e —— 星轨顾问异步全链路压测（温和并发，非洪水）。
 * 模拟 N 个玩家同时提交顾问问题 + 轮询至终态，统计 submit→done 端到端延迟分布。
 * 与 load-test 的「洪水」互补：这里验证的是**回信体验**（正常交互并发下系统稳定、且延迟可预期）。
 * 用法: node scripts/advisor-e2e.mjs --jobs=50 --concurrency=10 --target=http://localhost:18880
 */
const target = (getArg('--target') ?? process.env.LOAD_TARGET ?? 'http://localhost:18880').replace(/\/+$/, '');
const JOBS = parseIntArg(getArg('--jobs'), 50);
const CONC = parseIntArg(getArg('--concurrency'), 10);
const TIMEOUT_MS = parseIntArg(getArg('--timeout-ms'), 30000);
const QUESTIONS = ['锚火象征着什么？', '如何击败奥术师？', '判官是什么人？', '番外漏灯记讲了什么？'];

function getArg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }
function parseIntArg(v, fb) { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : fb; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];

async function submit(question) {
  const res = await fetch(target + '/api/ai/chat/async', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) return { error: res.status };
  return res.json();
}
async function pollUntilDone(jobId, deadline) {
  while (Date.now() < deadline) {
    const res = await fetch(target + `/api/ai/jobs/${jobId}`);
    if (res.ok) {
      const j = await res.json();
      const status = j?.status;
      if (status === 'done' || status === 'failed' || status === 'rejected' || j?.answer) {
        return j;
      }
    }
    await sleep(300);
  }
  return { status: 'timeout' };
}

const results = [];
const queue = [...Array(JOBS).keys()];
async function worker(id) {
  while (queue.length) {
    const i = queue.shift();
    if (i === undefined) return;
    const q = QUESTIONS[i % QUESTIONS.length];
    const t0 = Date.now();
    const sub = await submit(q);
    if (sub?.error) { results.push({ i, error: `submit-${sub.error}`, ms: Date.now() - t0 }); continue; }
    const done = await pollUntilDone(sub.jobId, t0 + TIMEOUT_MS);
    results.push({ i, ms: Date.now() - t0, status: done?.status, duplicate: sub.duplicate ?? false });
  }
}
await Promise.all(Array.from({ length: CONC }, (_, k) => worker(k)));

const ok = results.filter((r) => !r.error && r.status !== 'timeout');
const errs = results.filter((r) => r.error || r.status === 'timeout');
const lat = ok.map((r) => r.ms).sort((a, b) => a - b);
console.log(`advisor-e2e · target=${target} · jobs=${JOBS} · concurrency=${CONC}`);
console.log(`完成 ${ok.length} · 失败 ${errs.length}`);
if (errs.length) for (const e of errs.slice(0, 6)) console.log('  样本:', JSON.stringify(e));
if (lat.length) {
  const p50 = percentile(lat, 50), p95 = percentile(lat, 95), p99 = percentile(lat, 99);
  const avg = (lat.reduce((a, b) => a + b, 0) / lat.length).toFixed(1);
  console.log(`submit→done  p50=${p50}ms  p95=${p95}ms  p99=${p99}ms  avg=${avg}ms  min=${lat[0]}ms  max=${lat[lat.length - 1]}ms`);
}
process.exit(errs.length === 0 && ok.length >= JOBS * 0.9 ? 0 : 1);
