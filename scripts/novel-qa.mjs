#!/usr/bin/env node
/**
 * W-Z57：《跨界纪事》正文一致性走查 —— 真上游 gpt-6-sol 质检脚本
 *
 * 为什么要有它：小说七章+序言+番外是几万字的原生文本，
 * 人眼能抓到的矛盾：人物名字错写、时间顺序、结局抉择与前文的引用。
 * 这道脚本把 9 个 .md 文件按「章内分片 + 跨章抽查」喂给上游模型，
 * 让它只报「可判定的矛盾」，不报口味偏好、不报修辞建议。
 *
 * 用法：
 *   LLM_API_KEY=sk-xxx node scripts/novel-qa.mjs <分片> [outfile]
 *   分片: all | 00-序言 | 05-寄信 | 07-余烬 | 08-番外
 *   无参数时默认 all 全量（8 片上游调用，约 60KB 输入）。
 * 读取 .env 中的 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL；不打印 key。
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const NOVEL_DIR = join(ROOT, 'creative', 'novel');

const env = {};
try {
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* .env 不存在时退回环境变量 */ }
const KEY = env.LLM_API_KEY || process.env.LLM_API_KEY || '';
const BASE = (env.LLM_BASE_URL || process.env.LLM_BASE_URL || 'https://wkapi.pro/v1').replace(/\/+$/, '');
const MODEL = env.LLM_MODEL || process.env.LLM_MODEL || 'gpt-6-sol';

if (!KEY) {
  console.error('novel-qa: 缺少 LLM_API_KEY（.env 或环境变量）');
  process.exit(1);
}
if (process.env.LLM_DEBUG === '1') console.log('novel-qa: base=%s model=%s (**密钥不打印**)', BASE, MODEL);

const sliceArg = process.argv[2] ?? 'all';
const outPath = process.argv[3] ?? null;

/** 按文件名收集章文件（排除番外之外的统一口径） */
const allFiles = readdirSync(NOVEL_DIR)
  .filter((f) => f.endsWith('.md'))
  .sort();

/** 对每一章按「半章分片」切块——单章太长时模型注意力会漂 */
function chunkChapter(name, text, maxChars = 9000) {
  const lines = text.split('\n');
  const chunks = [];
  let cur = [];
  let len = 0;
  for (const line of lines) {
    cur.push(line);
    len += line.length + 1;
    if (len >= maxChars) {
      chunks.push({ name: `${name}#part-${chunks.length + 1}`, text: cur.join('\n') });
      cur = [];
      len = 0;
    }
  }
  if (cur.length) chunks.push({ name: `${name}#part-${chunks.length + 1}`, text: cur.join('\n') });
  return chunks;
}

const targets = sliceArg === 'all'
  ? allFiles.flatMap((f) => chunkChapter(f.replace(/\.md$/, ''), readFileSync(join(NOVEL_DIR, f), 'utf8')))
  : allFiles.filter((f) => f.includes(sliceArg)).flatMap((f) =>
      chunkChapter(f.replace(/\.md$/, ''), readFileSync(join(NOVEL_DIR, f), 'utf8')));

if (targets.length === 0) {
  console.error(`novel-qa: 分片 "${sliceArg}" 没有匹配到任何章节文件（可用 all / 05-寄信 / 07-余烬 / 08-番外 等）`);
  process.exit(1);
}

const SYSTEM = `你是一位严苛但诚实的小说校对主编，正在审读《跨界纪事》系列的原生稿。
规则：
1. 只报「可判定的矛盾」——人物名字前后不一致、时间顺序矛盾、结局抉择与前文引用对不上、
   关键名词拼写不统一（如「锚火」vs「锚点火」、「看守」vs「看守人」、「林渡」vs「林渡士」）。
2. 不报口味偏好、不报文笔、不报节奏问题、不建议改写。
3. 每条矛盾必须给出：章节坐标、引用原文（不超过 40 字）、判定理由。
4. 若本章没有矛盾，明确写「本章无矛盾」，不要凑数。
5. 中文输出，不要英文，不要前言套话。`;

function streamURL() { return `${BASE}/chat/completions`; }

async function askChunk(chunk) {
  const res = await fetch(streamURL(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'text/event-stream',
      authorization: 'Bearer ' + KEY,
    },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.1,
      max_tokens: 800,
      messages: [
        { role: 'system', content: SYSTEM, cache_control: { type: 'ephemeral' } },
        { role: 'user', content: `【审读任务】\n检查下面这章（${chunk.name}）中存在的矛盾，按规则只报可判定矛盾：\n\n${chunk.text}` },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '<unreadable>');
    return { name: chunk.name, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
  }
  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let usage = null;
  while (reader) {
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
          if (delta) content += delta;
          if (j.usage) usage = j.usage;
        } catch { /* partial json */ }
      }
    }
  }
  return { name: chunk.name, content: content.trim(), usage };
}

const results = [];
for (let i = 0; i < targets.length; i += 1) {
  process.stderr.write(`novel-qa: [${i + 1}/${targets.length}] ${targets[i].name}\n`);
  const r = await askChunk(targets[i]);
  if (r.error) {
    process.stderr.write(`novel-qa: ${r.name} → ${r.error}\n`);
    results.push({ name: r.name, error: r.error });
    continue;
  }
  const used = r.usage;
  const cachedTokens = used?.prompt_cache_hit_tokens ?? used?.prompt_tokens_details?.cached_tokens ?? (used ? 0 : '?');
  process.stderr.write(`novel-qa: ${r.name} 完成 — prompt=${used?.prompt_tokens ?? '?'} cached=${cachedTokens} completion=${used?.completion_tokens ?? '?'}\n`);
  results.push({ name: r.name, content: r.content, usage: r.usage ?? null });
}

const out = [
  '# 《跨界纪事》正文一致性走查（W-Z57 · 真上游 gpt-6-sol）',
  '',
  `- 审读片数：${results.length} / ${targets.length}`,
  `- 模型：${MODEL}`,
  '',
  ...results.flatMap((r) => [
    `## ${r.name}`,
    '',
    r.error ? `（调用失败：${r.error}）` : (r.content || '（空）'),
    '',
  ]),
].join('\n');

if (outPath) {
  writeFileSync(outPath, out, 'utf8');
  process.stderr.write(`novel-qa: wrote ${outPath}\n`);
} else {
  console.log(out);
}
