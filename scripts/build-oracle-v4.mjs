#!/usr/bin/env node
/**
 * 2026-11-18 W-Z349：Oracle v4 冻结前缀（炉主实装「把全书背进 prompt」）
 *
 * 现行 Oracle 前缀 = lore-system-prompt.txt（≈2K tok）+ lore-digest-frozen.txt（≈2.5K tok）≈ 2K 级——
 * 离真正的「读一遍全书再开口」差着一个数量级。v4 直接把 creative/GLOSSARY.md **verbatim 全量**
 * 拷进前缀：约 90K tok 的典籍正典铺成一页 cache page。
 *
 * 为什么不给 Ember 用：Ember 每秒多 10s 的首包延迟会杀死 NPC 对话节奏；Oracle 是玩家按 H 主动问
 * 「告诉我这片位面的知识」——单一回合、等得起、价值最高。v3 不动、Ember 不动、digest 不删。
 *
 * 用法：node scripts/build-oracle-v4.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SYSTEM = resolve(ROOT, 'server/ai-service/src/main/resources/ai/lore-system-prompt.txt');
const GLOSSARY = resolve(ROOT, 'creative/GLOSSARY.md');
const OUT = resolve(ROOT, 'server/ai-service/src/main/resources/ai/oracle-v4-frozen-prefix.txt');

const system = readFileSync(SYSTEM, 'utf8').replace(/\s+$/, '');
const gloss = readFileSync(GLOSSARY, 'utf8').replace(/\r\n/g, '\n');
const v4 = [
  system,
  '',
  '【典籍总录 · 一】（creative/GLOSSARY.md verbatim 全量录入 · 阅读用，不计算「这是什么版本」）',
  gloss,
  '',
].join('\n');
writeFileSync(OUT, v4, 'utf8');
console.log(`wrote ${OUT} — ${(Buffer.byteLength(v4) / 1024).toFixed(1)} KB · glossary ${(Buffer.byteLength(gloss) / 1024).toFixed(1)} KB · ${gloss.split('\n').length} lines`);
