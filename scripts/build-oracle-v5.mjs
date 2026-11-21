#!/usr/bin/env node
/**
 * 2026-11-21 W-Z485：Oracle v5「史诗深潜 / Epic Deep-Dive」双语全量冻结前缀。
 *
 * 动机（用户反复强调）：Codex 一次能打进 5 万～9 万上下文，而我方日常 / Oracle 只有 v4 的
 * 约 4.8 万 tok（单中文 GLOSSARY）。v5 把中英两份 GLOSSARY **逐字**并入同一页冻结前缀，
 * 目标 ~8.5–9 万 tok，真正进入 Codex 同档；前缀字节稳定 + 独立 cache lane，命中不掉。
 *
 * 设计边界（不破坏历史）：
 *   - v4 文件、v3 文件、GLOSSARY 原文件一律不动；v5 是新文件、新 lane、新端点参数。
 *   - 只用 verbatim 逐字拷贝（不摘要、不改写），保证字节稳定 = prompt-cache 可命中。
 *   - 输出语言仍由玩家问句决定（system 里写死这条），双语参考不会造成回答夹杂。
 *
 * 用法：node scripts/build-oracle-v5.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const A = resolve(ROOT, 'server/ai-service/src/main/resources/ai');
const SYSTEM = resolve(A, 'lore-system-prompt.txt');
const ZH = resolve(ROOT, 'creative/GLOSSARY.md');
const EN = resolve(ROOT, 'creative/GLOSSARY-en.md');
const OUT = resolve(A, 'oracle-v5-frozen-prefix.txt');

const norm = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '');
const system = norm(SYSTEM);
const zh = norm(ZH);
const en = norm(EN);

const v5 = [
  system,
  '',
  '【典籍总录 · 卷一 · 中文正典】（creative/GLOSSARY.md verbatim 全量 · 阅读参考，不计算版本）',
  zh,
  '',
  '【Canon Total · Volume II · English Canon】(creative/GLOSSARY-en.md verbatim, full · reading reference, do not reason about versions)',
  en,
  '',
  '【双语口径 / bilingual discipline】以上两份为同一典籍的中英正本。玩家的问句用什么语言，回答就用什么语言，保持单一语种、不得夹杂；两份正典内容一致，任一语种均可据以作答。',
  '',
].join('\n');

writeFileSync(OUT, v5, 'utf8');
console.log(`wrote ${OUT} — ${(Buffer.byteLength(v5) / 1024).toFixed(1)} KB · zh ${(Buffer.byteLength(zh) / 1024).toFixed(1)} KB + en ${(Buffer.byteLength(en) / 1024).toFixed(1)} KB · ~${Math.round(Buffer.byteLength(v5) / 1.6)} tok estimate`);