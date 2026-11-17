#!/usr/bin/env node
/**
 * 2026-11-18 W-Z346：生成 Codex v3 冻结大前缀（v2 + 典籍年表 + 原典词料 + 守夜人谱系）。
 * 目标：把「输入上下文太小」的抱怨用**真材实料**填起来，而不是注水——
 *   · 典籍年表：strings.zh.js hm_body_codex 里 00-168 每卷一行（章名 · 首枚子句）
 *   · 原典词料：lore-digest-frozen.txt verbatim（glossary machine-extract head）
 *   · 守夜人谱系：阿祖 → 姥爷 → 阿父 → 阿石（单行血脉锚点）
 * v2 的字节不动（同桶旧前缀仍命中），追加即扩，缓存页只会增大不会碎。
 * 用法：node scripts/build-llm-prefix-v3.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const V2 = resolve(ROOT, 'server/ai-service/src/main/resources/ai/llm-frozen-prefix.v2.txt');
const DIGEST = resolve(ROOT, 'server/ai-service/src/main/resources/ai/lore-digest-frozen.txt');
const STRINGS_ZH = resolve(ROOT, 'src/content/strings.zh.js');
const OUT = resolve(ROOT, 'server/ai-service/src/main/resources/ai/llm-frozen-prefix.v3.txt');

const v2 = readFileSync(V2, 'utf8').replace(/\s+$/, '');
const digest = readFileSync(DIGEST, 'utf8').replace(/\s+$/, '');
const strings = readFileSync(STRINGS_ZH, 'utf8');

const m = strings.match(/hm_body_codex: `([\s\S]*?)`/);
if (!m) { console.error('缺少 hm_body_codex 段落'); process.exit(1); }
// strings.*.js 把续行写成字面 "\\r\\n"（两个转义字符），而不是真 CRLF——按此拆分
const seg = m[1].split('\\r\\n').join('\n');
const lines = [...seg.matchAll(/^(\d+) · ([^—\n]+)/gm)]
  .map((r) => `${r[1]} · ${r[2].trim().replace(/[。：:;；]$/, '')}`);
if (lines.length < 160) { console.error(`年表条目只有 ${lines.length} —— 太少了`); process.exit(1); }

const timeline = ['【典籍大事年表（v2→v3 追加，每卷一眼）】', ...lines].join('\n');
const bloodline = '【燃火七百年 · 守夜人谱系】\n阿祖点火 → 姥爷续柴 → 阿父守火 → 阿石（第七百零一年 · 第二十七周起守 · 第二十八周第一次翻开那本书 · 第一百六十八卷落笔）';

const v3 = [
  v2,
  '',
  timeline,
  '',
  '【原典词料摘（frozen verbatim）】',
  digest,
  '',
  bloodline,
  '',
].join('\n');

writeFileSync(OUT, v3, 'utf8');
const kb = (v3.length / 1024).toFixed(1);
console.log(`wrote ${OUT} — ${kb} KB · ${lines.length} timeline entries · digest ${digest.length}B`);
