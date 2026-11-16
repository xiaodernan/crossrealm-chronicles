#!/usr/bin/env node
/**
 * build-freeze-glossary · 生成 Oracle 系统提示的「冻结袖珍词典」（W-Z247）。
 *
 * 背景：上游 prompt cache 有 ~1024-token 页门槛；lore-system-prompt.txt ≈ 500 tokens，
 * 单独的 system 前缀不够热——实测 canon lane 两次同问 cached_tokens=null（W-Z247 实测，见 MASTER_PLAN）。
 * refs lane（excerpt 参与冻结）则命中 96.9%。于是把 GLOSSARY 的开头**原样**摘出 ~2500 字节塞进 system，
 * 使 system 冻结前缀跨过页门槛；同卷逐次重编时内容一字不差 → 生产、测试、探针三方语义一致。
 * 本 digest 是 GLOSSARY 的**前文逐字拷贝**，不是模型总结（防漂移）；索引不足时宁断勿乱。
 *
 * 用法：node scripts/build-freeze-glossary.mjs [--check]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'creative/GLOSSARY.md';
const OUT = 'server/ai-service/src/main/resources/ai/lore-digest-frozen.txt';
const MAX_BYTES = 2500;

const raw = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
const cut = (() => {
  const slice = Buffer.from(raw.slice(0, MAX_BYTES), 'utf8');
  if (slice.length <= MAX_BYTES) return raw;
  // walk back to nearest newline at or below the byte cap
  const head = slice.toString('utf8', 0, MAX_BYTES);
  const nl = head.lastIndexOf('\n');
  return nl > 0 ? head.slice(0, nl) : head;
})();

const digest = [
  'Canon glossary digest (frozen, verbatim from creative/GLOSSARY.md head; for prompt-cache stability only).',
  '',
  cut.trim(),
  '',
  'End of frozen digest.',
].join('\n');

const args = process.argv.slice(2);
if (args.includes('--check')) {
  const existing = readFileSync(OUT, 'utf8');
  if (existing !== digest) { console.error('build-freeze-glossary: digest 与源不一致——重跑 node scripts/build-freeze-glossary.mjs'); process.exit(1); }
  console.log('build-freeze-glossary: digest up to date');
  process.exit(0);
}
writeFileSync(OUT, digest, 'utf8');
console.log(`build-freeze-glossary: wrote ${OUT} (${Buffer.byteLength(digest, 'utf8')} bytes, token-dense CJK)`);
