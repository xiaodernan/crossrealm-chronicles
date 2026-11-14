#!/usr/bin/env node
/**
 * build-lore-corpus — 把 canon 语料汇编成一个扁平文本，交给 ai-service 做 RAG 检索（W-RAG）。
 *
 * 源：creative/novel/*.md + creative/novel/en/*.md + creative/GLOSSARY.md + creative/GLOSSARY-en.md
 * 出：server/ai-service/src/main/resources/lore/corpus.txt
 *   格式：每段一个块，块首是 `# source: <相对路径>`，空行分隔。路径名固定按字典序——
 *   相同语料 ⇒ 相同输出 ⇒ 同一 git 提交可复现（这个文件是 build 产物、也入库，别手改）。
 *
 * 用法：
 *   node scripts/build-lore-corpus.mjs          # 写入资源文件并报告字节数
 *   node scripts/build-lore-corpus.mjs --check  # 只校验 corpus.txt 是否最新（CI门禁）
 */
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = 'server/ai-service/src/main/resources/lore/corpus.txt';

const SOURCES = [
  ...collect('creative/novel', (f) => f.endsWith('.md')).map((f) => pathSortKey('zh', f)),
  ...collect('creative/novel/en', (f) => f.endsWith('.md')).map((f) => pathSortKey('en', f)),
  ...collect('creative', (f) => f === 'GLOSSARY.md' || f === 'GLOSSARY-en.md').map((f) => pathSortKey('codex', f)),
].sort((a, b) => a.key.localeCompare(b.key, 'en'));

function pathSortKey(group, file) {
  return { key: `${group}:${file}`, file, group };
}

function collect(root, filter) {
  const out = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && filter(full)) out.push(relative(ROOT, full).split(sep).join('/'));
    }
  })(join(ROOT, root));
  return out;
}

const buf = [];
for (const item of SOURCES) {
  const text = readFileSync(join(ROOT, item.file), 'utf8').trim();
  if (!text) continue;
  buf.push(`# source: ${item.file}`);
  buf.push(text);
  buf.push('');
}
const out = buf.join('\n').replace(/\r\n/g, '\n');
const args = process.argv.slice(2);
const checkMode = args.includes('--check');
if (checkMode) {
  const existing = existsFile(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (existing !== out) {
    console.error(`build-lore-corpus: ${OUT} 与源不一致——运行 node scripts/build-lore-corpus.mjs 重新生成`);
    process.exit(1);
  }
  console.log('build-lore-corpus: corpus.txt up to date');
  process.exit(0);
}
writeFileSync(OUT, out, 'utf8');
console.log(`build-lore-corpus: wrote ${OUT} (${out.length} bytes, ${SOURCES.length} sources)`);

function existsFile(path) {
  try { return statSync(path).isFile(); } catch { return false; }
}
