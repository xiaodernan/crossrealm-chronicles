/**
 * 星轨语料质检（W-Z5）— dev-time：把回声名册逐条交给真实大模型做「母题 × 标题 × 描述」
 * 一致性 / 史实性 / 语气核查。**工具只产报告，不替人改文案**；人（或下一片工作包）review 之后再动内容层。
 *
 * 输入：src/content/echoes.js + src/content/strings.zh.js（玩家真正看到的中文文案，不是 key）
 * 输出：markdown 报告（默认 stdout；传第二个参数则写入文件——报告不进游戏、不必入库）
 *
 * 用法（key 只经环境变量进，不进任何文件）：
 *   LLM_API_KEY=<key> LLM_BASE_URL=https://wkapi.pro/v1 LLM_MODEL=gpt-6-sol \
 *     node scripts/echo-qa.mjs [batchSize] [out.md]
 *
 * 退出码：2 = 用法错；1 = 密钥缺失 / 网络失败 / 模型返回整批不可解析；0 = 跑完（报告里是否有发现另见输出）。
 * 离线/CI 安全：没 key → exit 1，零外呼。真实外呼只发生在显式带密钥的本机联调里。
 */
import fs from 'fs';
import { ECHOES } from '../src/content/echoes.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';

const BASE = (process.env.LLM_BASE_URL ?? 'https://wkapi.pro/v1').replace(/\/+$/, '');
const KEY = process.env.LLM_API_KEY;
const MODEL = process.env.LLM_MODEL ?? 'gpt-6-sol';
const BATCH = Math.max(1, Number(process.argv[2] ?? 10) || 10);
const outPath = process.argv[3] ?? null;

if (!KEY) {
  console.error('ERROR: LLM_API_KEY not set. This tool requires an explicit key — refusing to guess or fall back.');
  process.exit(1);
}

if (!Array.isArray(ECHOES) || ECHOES.length === 0) {
  console.error('ERROR: ECHOES table empty?');
  process.exit(2);
}

// 回声条目里的 title/desc 是文案键（W-D2 切片16o 起）：玩家看到的是 strings.zh 的值。
const corpus = ECHOES.map((e) => ({
  id: e.id,
  franchise: e.franchise,
  zone: e.zone,
  title: STRINGS_ZH[e.title] ?? e.title,
  desc: STRINGS_ZH[e.desc] ?? e.desc,
}));

const SYSTEM = `你是《跨界纪元》（史诗幻想 + 群像致敬「次元回声」）的文案总编，负责审稿，不负责重写。
判断给定的「母题 × 标题 × 描述」作为一条游戏回声是否站得住。

只评价文案本身：
1) 母题与描述的对应是否错位（写的是 A 母题、描述是 B 母题的东西）；
2) 时代/史实错乱（史诗语境里突然冒出明显的现代语汇 / 不该出现的科学术语口吻）；
3) 史诗语气破功（现代口语、网络梗、过度诙谐、破第四面墙）；
4) 涉及现实政治、宗教、种族争议的用语。

不评判游戏性、不重写文案、不对「创意好不好」表态。

返回且只返回 JSON 数组（不要 markdown 围栏，不要解释），元素：
{"id":"<原样回声 id>","verdict":"ok|warn|bad","issues":["<=30 字的中文问题描述"]}
— verdict=ok 时 issues 为空数组；warn=有可商榷之处；bad=确凿的错位/硬伤。

## 次元回声机制笔记（判读上下文，别判错方向）
- 母题名册（17 个，全部合法；绝不是全部，判官只需认得出"这母题存在"）：
  wizard（魔法学院）/ interstellar（星际航行）/ upside（逆相世界）/ middle-earth（中洲之环）/ border（边境星门）/ family（家族黑帮）/ deepspace（深空航行）/ cyber（赛博深渊）/ samurai（武士残响）/ cosmic（深空孔径）/ starport（星港码头）/ crossover（跨界原创）/ gloom（薄暮母题）/ radiant（辉煌母题）/ voidmaw（虚空裂喉）/ abysssalt（深渊盐）/ homecoming（返乡母题）。
- ECHOES 条目含 zone 字段（fantasy/magic/space/void/abyss/gLooM/radiant 之一）——母题与 zone 可以不同（例：COSMIC 回声落在 void 时表示「破碎时线」语境；SAMURAI 回声落在 fantasy 表示位面交错）。
- 乐章只鉴文案不鉴玩法；"五维_tesseract" 等残留英文 key 片段属于 bad（W-Z5 切片1 已修回双表）。
- **{word} 占位符**：文案里 {roll} / {parry} / {dodge} 这类花括号词是键位占位符——keyText() 在界面渲染时把它们展开成「玩家当前真实的键名」（例如「Space」），绝不是未渲染的漏洞。判官看到这类占位符**不许**判 bad/warn。
- title 牌感：短、硬、允许复用母纲大纲意象（"石碑""深井""深渊"）而不必复述机制；desc 一行年鉴口吻，允许画外音——不求交代触发条件。
`;

async function askBatch(items) {
  const user = `以下是 ${items.length} 条回声（母题 id / 区域 / 标题 / 描述）：\n` +
    items.map((e, i) => `${i + 1}. id=${e.id} | 母题=${e.franchise} | 区域=${e.zone} | 「${e.title}」\n   ${e.desc}`).join('\n');
  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: user },
    ],
    max_tokens: 1536,
    temperature: 0.2,
    stream: true,
    stream_options: { include_usage: true },
  };
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  const sse = await res.text();
  let content = '', usage = null;
  for (const rawLine of sse.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (data === '[DONE]') continue;
    try {
      const j = JSON.parse(data);
      content += j.choices?.[0]?.delta?.content ?? '';
      if (j.usage) usage = j.usage;
    } catch { /* 单行坏 JSON 跳过 */ }
  }
  const details = usage?.prompt_tokens_details ?? usage?.input_token_details ?? {};
  const cached = details.cached_tokens ?? usage?.cached_tokens ?? null;
  usageTotals.prompt += usage?.prompt_tokens ?? 0;
  usageTotals.completion += usage?.completion_tokens ?? 0;
  usageTotals.cached += cached ?? 0;
  usageTotals.callsWithUsage += usage ? 1 : 0;
  process.stderr.write(`  usage: prompt=${usage?.prompt_tokens ?? '?'} completion=${usage?.completion_tokens ?? '?'} cached=${cached ?? '?'}\n`);
  const lo = content.indexOf('[');
  const hi = content.lastIndexOf(']');
  if (lo < 0 || hi < 0) throw new Error(`batch ${items[0]?.id}..: 模型未返回 JSON 数组：${content.slice(0, 200)}`);
  return JSON.parse(content.slice(lo, hi + 1));
}

const usageTotals = { prompt: 0, completion: 0, cached: 0, callsWithUsage: 0 };
const results = [];
let calls = 0;
let upstreamAttempts = 0;
for (let i = 0; i < corpus.length; i += BATCH) {
  const batch = corpus.slice(i, i + BATCH);
  process.stderr.write(`echo-qa: batch ${Math.floor(i / BATCH) + 1} (${batch[0].id} .. ${batch[batch.length - 1].id})…\n`);
  let parsed = null;
  for (let attempt = 1; attempt <= 2 && !parsed; attempt++) {
    try {
      upstreamAttempts += 1;
      parsed = await askBatch(batch);
      calls += 1;
    } catch (e) {
      if (attempt === 1) {
        process.stderr.write('  batch failed (will retry once): ' + (e?.message ?? e) + '\n');
        continue;
      }
      // 半批降级救援：把 batch 切成两半各跑两轮。上游瞬时空返回多数发生在大 batch，
      // 拆半后 prompt 减半，通常能拿回判词；两半任一还败则仅标那半批 error。
      const halfSize = batch.length >> 1;
      const merged = [];
      let halvesOk = true;
      for (const half of [batch.slice(0, halfSize), batch.slice(halfSize)]) {
        let halfParsed = null;
        for (let hAttempt = 1; hAttempt <= 2 && !halfParsed; hAttempt++) {
          try {
            upstreamAttempts += 1;
            halfParsed = await askBatch(half);
            calls += 1;
          } catch (he) {
            process.stderr.write('  half retry failed: ' + (he?.message ?? he) + '\n');
          }
        }
        if (halfParsed) {
          merged.push(...halfParsed);
        } else {
          halvesOk = false;
          merged.push(...half.map((b) => ({ id: b.id, verdict: 'error', issues: [String(e?.message ?? e).slice(0, 60)] })));
        }
      }
      if (halvesOk) {
        process.stderr.write('  rescue succeeded: split ' + batch.length + ' items in half, both parsed\n');
      } else {
        console.error('batch failed twice and rescue failed:', e?.message ?? e);
      }
      parsed = merged;
    }
  }
  const byId = new Map((parsed ?? []).map((r) => [r.id, r]));
  for (const item of batch) {
    const hit = byId.get(item.id);
    results.push({ ...item, verdict: hit?.verdict ?? 'error', issues: Array.isArray(hit?.issues) ? hit.issues : [] });
  }
}

const counts = { ok: 0, warn: 0, bad: 0, error: 0 };
for (const r of results) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;

const lines = [];
lines.push('# 星轨语料质检（W-Z5）— 次元回声名册');
lines.push('');
lines.push(`- 扫描：${results.length} 条 / ${calls} 次上游调用（batch=${BATCH}）/ 模型：${MODEL}`);
lines.push(`- 结论：ok ${counts.ok}　warn ${counts.warn}　**bad ${counts.bad}**　error ${counts.error}`);
lines.push('');
const section = (title, rows) => {
  lines.push(`## ${title}（${rows.length}）`);
  lines.push('');
  if (!rows.length) { lines.push('（无）'); lines.push(''); return; }
  for (const r of rows) {
    lines.push(`### ${r.id} — ${r.verdict}`);
    lines.push(`- 母题/区域：${r.franchise} / ${r.zone}`);
    lines.push(`- 「${r.title}」`);
    lines.push(`- ${r.desc}`);
    for (const issue of r.issues) lines.push(`- ⚠ ${issue}`);
    lines.push('');
  }
};
section('bad（确凿错位/硬伤，人工复核后改内容层）', results.filter((r) => r.verdict === 'bad'));
section('warn（可商榷，人工决断）', results.filter((r) => r.verdict === 'warn'));
section('error（本批未能解析，需人工重判）', results.filter((r) => r.verdict === 'error'));
section('ok（抽查即可）', results.filter((r) => r.verdict === 'ok'));

lines.push('');
lines.push(`- 上游用量合计：prompt=${usageTotals.prompt} completion=${usageTotals.completion} cached=${usageTotals.cached} cachedRatio=${usageTotals.prompt > 0 ? (usageTotals.cached * 100 / usageTotals.prompt).toFixed(1) + '%' : 'n/a'} （${usageTotals.callsWithUsage}/${upstreamAttempts} 次上报用量）`);

const md = lines.join('\n') + '\n';
if (outPath) {
  fs.writeFileSync(outPath, md, 'utf8');
  console.log('wrote', outPath);
} else {
  console.log(md);
}
