#!/usr/bin/env node
/**
 * admin-llm-analysis · W-Z311 —— 把炉边盘的数据蒸馏后交给真 LLM 产出双语运营建议。
 *
 * 干什么：
 *   读 docs/admin/data/ 下的五份真实文件（synthetic.json / simulation.json /
 *   oracle-cache-probe.json / vow-montecarlo.json / pass-montecarlo.json），
 *   压成约 3 KB 的「digest」，连同冻结的系统提示交给上游（stream + include_usage +
 *   cache_control:ephemeral + prompt_cache_key:crossrealm-admin-analysis-v1），
 *   产出 docs/admin/data/admin-llm-analysis.zh.md 与 .en.md 两份**纯单语**报告。
 *
 * 纪律：
 *   - LLM 只能看到 digest；不许引入外部基准数字（不给引用权，只给消化权）。
 *   - 报告里每条建议必须标注 Priority P0..P3 并引用 digest 里的原始数字。
 *   - 合成数据（synthetic.json）与真实浏览器模拟（simulation.json）与实测探针
 *     （oracle-cache-probe）必须被明确区分对待——digest 里已标注，模型也被要求复述。
 *   - 失败不写半份文件；两语种各自独立成败；密钥只从 .env 读，不打印。
 *
 * 用法：node scripts/admin-llm-analysis.mjs [--dry]（--dry 只打印 digest，不调上游）
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readData = (name) => JSON.parse(readFileSync(join(ROOT, 'docs', 'admin', 'data', name), 'utf8'));

const synthetic = readData('synthetic.json');
const simulation = readData('simulation.json');
const oracle = readData('oracle-cache-probe.json');
const vow = readData('vow-montecarlo.json');
const pass = readData('pass-montecarlo.json');

import { curlFetch } from './_curl-proxy.mjs';

const topSummary = (arr) =>
  (Array.isArray(arr) ? arr : [])
    .slice(0, 6)
    .map((x) => `${x.id} ${x.pct}%`)
    .join(' · ');
const topVow = topSummary(vow.distribution);
const topPass = topSummary(pass.distribution);
const pctOfConst = (n, d) => (d > 0 ? ((n / d) * 100).toFixed(1) + '%' : 'n/a');

const digest = {
  dataHonestLabeling: [
    'kpis/funnel/retention/predictions/features = SYNTHETIC deterministic demo (seed=20261117) — NOT production telemetry',
    'simulation.json = REAL headless Chrome sessions on this repo build (14 sessions, seed=20261117), observations real, not production telemetry either',
    'oracle-cache-probe.json = MEASURED upstream cache probe via local Clash proxy',
    'vow-montecarlo.json / pass-montecarlo.json = MEASURED full-enumeration distributions (27/27), not samples',
    'pages has no backend; production telemetry only exists when /api/telemetry/summary-rollup answers; admin KPIs marked measured on the page are local dev measurements',
  ],
  kpis: {
    dauAvg: synthetic.kpis.dauAvg,
    dauMin: synthetic.kpis.dauMin,
    dauMax: synthetic.kpis.dauMax,
    sessionsAvg: synthetic.kpis.sessionsAvg,
    avgSessionSeconds: synthetic.kpis.avgSessionSeconds,
    newUsersAvg: synthetic.kpis.newUsersAvg,
    bounceRatePct: synthetic.kpis.bounceRate,
    churn3minPct: synthetic.kpis.churn3min,
    bossWinRatePct: synthetic.kpis.bossWinRate,
    canonReadRatePct: synthetic.kpis.canonReadRate,
    codexOpenRatePct: synthetic.kpis.codexOpenRate,
    retention: synthetic.retention,
    totalSessions: synthetic.kpis.totalSessions,
    totalUsers: synthetic.kpis.totalUsers,
  },
  funnel: (synthetic.funnel ?? []).map((f) => `${f.stage} ${f.pct}%`),
  dauForecastNext14d: (synthetic.predictions ?? []).map((p) => `${p.date}:${p.dau}`),
  topFeatures: (synthetic.features ?? [])
    .slice(0, 6)
    .map((f) => `${f.name} ${f.pctOfSessions}% of sessions`),
  simulation: {
    requested: simulation.requestedSessions,
    completed: simulation.completedSessions,
    totalExceptions: simulation.summary?.totalExceptions,
    bounced: simulation.summary?.bounced,
    bootMsAvg: simulation.summary?.bootMsAvg,
    bootMsP95: simulation.summary?.bootMsP95,
    wanderClicksAvg: simulation.summary?.wanderClicksAvg,
    manualSessions: simulation.summary?.manualSessions,
  },
  oracleCacheProbe: {
    canonSecondCall: pctOfConst(6784, 6973),
    refsSecondCall: pctOfConst(7424, 7611),
    cacheKey: oracle.cacheKey,
  },
  vowDistributionTop: topVow,
  passDistributionTop: topPass,
  existingRecommendations: (synthetic.recommendations ?? []).slice(0, 6).map((r) => r.priority + ' ' + r.title),
};

const DIGEST_JSON = JSON.stringify(digest, null, 1);
if (process.argv.includes('--dry')) {
  console.log(DIGEST_JSON);
  process.exit(0);
}

const env = {};
try {
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* fall back to process env */ }
const KEY = env.LLM_API_KEY || process.env.LLM_API_KEY;
const BASE = (env.LLM_BASE_URL || process.env.LLM_BASE_URL || 'https://api.aizzz.xyz/v1').replace(/\/+$/, '');
const MODEL = env.LLM_MODEL || process.env.LLM_MODEL || 'gpt-6.1-terra';
if (!KEY) { console.error('admin-llm-analysis: 缺少 LLM_API_KEY'); process.exit(1); }

const SYSTEM = {
  zh: [
    '你是「跨界纪元」的运营分析师。你只允许使用用户消息里 digest JSON 中的数字与事实。',
    '绝对禁止：编造任何 benchmark、引用行业均值、引入 digest 之外的指标名、假装有生产遥测。',
    '必须在回答里复述哪些数字是 SYNTHETIC（合成演示数据）哪些是 MEASURED（实测）。',
    '输出严格的 markdown，结构如下：',
    '# 现状判读',
    '4-6 条 bullet，每条引用 digest 的具体数字。',
    '# 趋势',
    '对 14 天 DAU 预测做一段判读（引用预测序列两端值与斜率），指出 90 天内 churn 风险点。',
    '# 优化清单（按 P0→P3）',
    '每条：[P0|P1|P2|P3] **标题** — 证据（引用 digest 数字）| 预期影响 | 工作量 S/M/L。',
    '至少 6 条、至多 9 条；与 digest.existingRecommendations 不重复措辞，只能 refine 或补充。',
    '# 先验证再执行',
    '至少 2 条「这份数据不能直接下结论的事」，说明需要什么样本/口径才能定。',
    '用中文写。结尾附一行：`本报告由 LLM 生成，digest 冻结于生成时刻；数字以 docs/admin/data/ 原始文件为准。`',
  ].join('\n'),
  en: [
    'You are the ops analyst for Crossrealm Chronicles. You may ONLY use numbers and facts present in the digest JSON in the user message.',
    'Absolute prohibition: inventing any benchmark, citing industry averages, introducing metrics not in the digest, or pretending production telemetry exists.',
    'You must restate which numbers are SYNTHETIC (demo data) and which are MEASURED (actual probes).',
    'Output strict markdown with this structure:',
    '# Situation read',
    '4-6 bullets, each citing concrete digest numbers.',
    '# Trend',
    'One paragraph reading the 14-day DAU forecast (cite both ends of the sequence and the slope) and flag churn risk within 90 days.',
    '# Optimization backlog (P0→P3)',
    'Each item: [P0|P1|P2|P3] **Title** — evidence (cite digest numbers) | expected impact | effort S/M/L.',
    'At least 6 and at most 9 items; do not reword digest.existingRecommendations — refine or add.',
    '# Verify before executing',
    'At least 2 things this data cannot conclude; say what sample/scope would be needed.',
    'Write in English. End with the line: `This report was LLM-generated from a frozen digest; the raw files under docs/admin/data/ are the source of truth.`',
  ].join('\n'),
};

const buildBody = (lang) => ({
  model: MODEL,
  prompt_cache_key: 'crossrealm-admin-analysis-v1',
  messages: [
    { role: 'system', content: SYSTEM[lang], cache_control: { type: 'ephemeral' } },
    { role: 'user', content: `digest JSON (frozen at generation time):\n\n${DIGEST_JSON}` },
  ],
  temperature: 0,
  max_tokens: 2200,
  stream: true,
  stream_options: { include_usage: true },
});

const call = async (lang) => {
  const { status, body: raw, error, timeTotal } = curlFetch({
    url: `${BASE}/chat/completions`,
    method: 'POST',
    headers: {
      accept: 'text/event-stream',
      authorization: 'Bearer ' + KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify(buildBody(lang)),
    timeoutMs: 180000,
  });
  if (error || status !== 200) {
    console.error(`${lang}: ${error ? 'curl error ' + error.slice(0, 120) : 'HTTP ' + status} · ${String(raw).slice(0, 200)}`);
    return null;
  }
  let text = '', usage = null;
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
  const cached = usage?.prompt_tokens_details?.cached_tokens;
  console.log(`${lang}: HTTP 200 · ${timeTotal}s · chars=${text.length} · prompt=${usage?.prompt_tokens} · cached=${cached ?? 'n/a'}`);
  return { text, usage };
};

const now = new Date().toISOString();
const header = (lang) => [
  `<!-- admin-llm-analysis · ${lang} · generated=${now} · model=${MODEL} · script=scripts/admin-llm-analysis.mjs -->`,
  `<!-- 上游源: docs/admin/data/synthetic.json (SYNTHETIC) + simulation.json (headless-Chrome real sessions) + oracle-cache-probe.json + vow/pass-montecarlo.json (MEASURED). -->`,
  `<!-- REMINDER: 本文件由 LLM 生成；数字标注与解读以原始 JSON 与炉边盘页内注记为准。 -->`,
  '',
].join('\n');

const results = {};
for (const lang of ['zh', 'en']) {
  const r = await call(lang);
  if (r && r.text.trim().length > 200) results[lang] = r;
}
const ok = Object.keys(results).length;
console.log(`admin-llm-analysis: ${ok}/2 languages produced`);
for (const [lang, r] of Object.entries(results)) {
  const out = join(ROOT, 'docs', 'admin', 'data', `admin-llm-analysis.${lang}.md`);
  writeFileSync(out, header(lang) + r.text.trim() + '\n', 'utf8');
  console.log('wrote ' + out);
}
if (ok === 0) process.exit(1);
