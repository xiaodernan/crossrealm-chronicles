#!/usr/bin/env node
/**
 * novel-glossary.mjs —《跨界纪事》设定集生成器（真上游联调）
 *
 * 把创作层的 canon 抽取成文本档案：
 *   人物 / 地点·位面 / 时间线 / 关键物件·母题 / 易混淆译名
 * 每条抽取标注出处章节——档案给人用，不是给模型用。
 *
 * 用法：
 *   node scripts/novel-glossary.mjs [outfile]   （默认 creative/GLOSSARY.md）
 * 读取 .env 的 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL；密钥不打印；
 * stream + include_usage + system cache_control 三件套与 LlmClient 同构。
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
} catch { /* 退回环境变量 */ }
const KEY = env.LLM_API_KEY || process.env.LLM_API_KEY;
const BASE = (env.LLM_BASE_URL || process.env.LLM_BASE_URL || 'https://wkapi.pro/v1').replace(/\/+$/, '');
const MODEL = env.LLM_MODEL || process.env.LLM_MODEL || 'gpt-6-sol';
if (!KEY) { console.error('novel-glossary: 缺少 LLM_API_KEY'); process.exit(1); }
console.error('novel-glossary: base=%s model=%s key=****（不打印）', BASE, MODEL);

const arg = (name, fallback = null) => process.argv.find((a) => a.startsWith('--' + name + '='))?.slice(name.length + 3) ?? fallback;
const only = arg('only', null); // 只抽取文件名包含此子串的章节（如 02-第二章）
const outArg = arg('out', join(ROOT, 'creative', 'GLOSSARY.md'));
const appendMode = arg('append', null) === 'true'; // true = 只写各章节段（不写页眉），供多进程拼接

/* 按章切块（≤ 8000 字）喂给模型；章内分片防注意力漂移 */
const files = readdirSync(NOVEL_DIR).filter((f) => f.endsWith('.md')).sort();
const selected = only ? files.filter((f) => f.includes(only)) : files;
function chunks(name, text, maxChars = 8000) {
  const out = [];
  let cur = [], len = 0;
  for (const line of text.split('\n')) {
    cur.push(line);
    len += line.length + 1;
    if (len >= maxChars) { out.push({ name: `${name}#${out.length + 1}`, text: cur.join('\n') }); cur = []; len = 0; }
  }
  if (cur.length) out.push({ name: `${name}#${out.length + 1}`, text: cur.join('\n') });
  return out;
}
const targets = selected.flatMap((f) => chunks(f.replace(/\.md$/, ''), readFileSync(join(NOVEL_DIR, f), 'utf8')));

const SYSTEM = `你是《跨界纪事》的设定集编辑，正在为该系列建立官方 codex。
规则：
1. 只抽取原文**明确出现**的事实；不推导、不编造、不补全「合理设定」。
2. 每条抽取标注出处章节（如【04-看守】）。
3. 输出分五节：①人物（姓名 + 一句定位）②地点·位面（名称 + 一句定位）③时间线（按原文发生顺序，不超过 20 条）④关键物件·母题（锚火/E/灯路等）⑤易混淆译名·统一写法。
4. 相同条目跨章节出现时合并，出处章节并列。
5. 中文输出，不要前言、不要总结、不要免责声明。`;

async function askOnce(chunk) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(90000),
    headers: { 'content-type': 'application/json', accept: 'text/event-stream', authorization: 'Bearer ' + KEY },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.2,
      max_tokens: 1800,
      messages: [
        { role: 'system', content: SYSTEM, cache_control: { type: 'ephemeral' } },
        { role: 'user', content: `【抽取任务】请按规则从下面这节（${chunk.name}）抽取设定条目：\n\n${chunk.text}` },
      ],
    }),
  });
  if (!res.ok) { console.error(`novel-glossary: ${chunk.name} HTTP ${res.status}`); return { name: chunk.name, error: true }; }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', content = '';
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
          if (delta) content += delta;
        } catch { /* partial */ }
      }
    }
  }
  return { name: chunk.name, content: content.trim() };
}

/** 每块最多重试 2 次（首块失败不拖死整轮；失败的块照样落进档案，标注「抽取失败」） */
async function ask(chunk) {
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await askOnce(chunk);
    } catch (e) {
      lastErr = e;
      process.stderr.write(`novel-glossary: ${chunk.name} 第 ${attempt} 次失败（${e?.cause?.code ?? e?.message ?? e}），${attempt < 3 ? '重试' : '放弃'}\n`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  process.stderr.write(`novel-glossary: ${chunk.name} 放弃（${lastErr?.message ?? lastErr}）\n`);
  return { name: chunk.name, error: true };
}

process.on('uncaughtException', (err) => {
  process.stderr.write(`novel-glossary: FATAL uncaughtException: ${err?.stack ?? err}\n`);
  try { writeFileSync(outArg, render(parts), 'utf8'); } catch { /* nothing to save */ }
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  process.stderr.write(`novel-glossary: FATAL unhandledRejection: ${reason?.stack ?? reason}\n`);
  try { writeFileSync(outArg, render(parts), 'utf8'); } catch { /* nothing to save */ }
  process.exit(1);
});

const parts = [];
try {
  for (let i = 0; i < targets.length; i += 1) {
    process.stderr.write(`novel-glossary: [${i + 1}/${targets.length}] ${targets[i].name}\n`);
    const r = await ask(targets[i]);
    parts.push({ name: r.name, content: r.error ? '（本章抽取失败）' : r.content });
    // 增量落盘：即使后面的块全炸，前面已抽到的内容也不丢
    writeFileSync(outArg, render(parts), 'utf8');
  }
} finally {
  writeFileSync(outArg, render(parts), 'utf8');
}

function render(parts) {
  if (appendMode) {
    let prev = '';
    try { prev = readFileSync(outArg, 'utf8'); } catch { prev = ''; }
    const body = parts.flatMap((p) => [`## ${p.name}`, '', p.content, '']).join('\n');
    return (prev.endsWith('\n') || !prev ? prev : prev + '\n') + body + '\n';
  }
  const header = [
    '# 《跨界纪事》设定集（Codex）—— 真上游机器抽取 · 出处标注',
    '',
    `- 生成方式：\`scripts/novel-glossary.mjs\`（真上游 ${MODEL}）`,
    '- 抽取范围：creative/novel/ 全 10 章（00–09）；每章一节，五个子段（人物 / 地点·位面 / 时间线 / 关键物件·母题 / 易混淆译名）',
    '- **性质**：机器直抽，不是人工终审稿；条目标注出处章节，使用前请对照原文核实；与正文冲突时**以原文为准**',
    '- 【编者注】Ch2 日志中「已共鸣 49 / 49」是中途账，不是终态；109 / 110 两种计数口径在正文中并存，引用时以具体语境为准，不要默认互通',
    '- 目录：00-序言 · 01-交汇枢纽 · 02-破碎时线 · 03-营火记忆 · 04-看守 · 05-寄信人 · 06-回响 · 07-余烬 · 08-番外 · 09-番外二',
    '',
  ];
  return [
    ...header,
    ...parts.flatMap((p) => [`## ${p.name}`, '', p.content, '']),
  ].join('\n');
}
process.stderr.write(`novel-glossary: wrote ${outArg}\n`);
