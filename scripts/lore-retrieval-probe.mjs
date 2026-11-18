#!/usr/bin/env node
/**
 * lore-retrieval-probe — Oracle 检索层离线实测（W-Z415 起）
 *
 * 背景：ai-service 的 RAG 检索器（Bm25Index）在本机离线也能独立复核：
 *  - 分词器与 Java 实现一字不差（Han 单码点一个 token；ASCII 串小写一个 token；其余字符剔除）；
 *  - BM25 k1=1.5 b=0.75，idf 公式 log(1 + (N - df + 0.5) / (df + 0.5))；
 *  - 文档列表 = corpus.txt 里全部 # source: 块（475 源，确定性顺序）。
 *
 * 干什么：
 *   1）把 `server/ai-service/src/main/resources/lore/corpus.txt`（构建产物、入库）切成 docs；
 *   2）建 BM25 索引；
 *   3）对一组**人设真实**的问题查 top-4，记录命中路径/分数/摘要；
 *   4）输出 docs/admin/data/lore-retrieval-probe.json（MEASURED，非合成）。
 *
 * 用法：node scripts/lore-retrieval-probe.mjs [--check | --json]
 *   --check 只校验 corpus.txt 是否新到不可信（corpus 过期则非零退出，生产用）
 *   --json  原始 JSON 打印到 stdout（piping）
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS = join(ROOT, 'server', 'ai-service', 'src', 'main', 'resources', 'lore', 'corpus.txt');
const OUT = join(ROOT, 'docs', 'admin', 'data', 'lore-retrieval-probe.json');

function isLetterOrDigitCp(cp) { return /^[\p{L}\p{N}]$/u.test(String.fromCodePoint(cp)); }
function isHanCp(cp) {
  return (cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0x3400 && cp <= 0x4DBF) || (cp >= 0x20000 && cp <= 0x2A6DF)
    || /^\p{Lo}$/u.test(String.fromCodePoint(cp)); // OTHER_LETTER
}
export function tokenize(src) {
  if (!src) return [];
  const lower = src.toLowerCase();
  const out = [];
  let ascii = '';
  const flush = () => { if (ascii) { out.push(ascii); ascii = ''; } };
  for (const ch of lower) {
    const cp = ch.codePointAt(0);
    if (cp < 0x80 && isLetterOrDigitCp(cp)) { ascii += ch; continue; }
    flush();
    if (isLetterOrDigitCp(cp) || isHanCp(cp)) out.push(ch);
  }
  flush();
  return out;
}

function buildDocs(corpusText) {
  const lines = corpusText.split('\n');
  const docs = [];
  let cur = null;
  for (const line of lines) {
    if (line.startsWith('# source: ')) {
      if (cur) docs.push(cur);
      cur = { source: line.slice('# source: '.length).trim(), text: '' };
    } else if (cur) {
      cur.text += (cur.text ? '\n' : '') + line;
    }
  }
  if (cur) docs.push(cur);
  return docs;
}

function indexDocs(docs) {
  const K1 = 1.5, B = 0.75;
  const tokenized = docs.map((d) => tokenize(d.text));
  const df = new Map();
  for (const toks of tokenized) {
    for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const N = tokenized.length;
  const avg = tokenized.reduce((s, t) => s + t.length, 0) / N;
  const postings = new Map();
  for (let i = 0; i < N; i++) {
    const counts = new Map();
    for (const t of tokenized[i]) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const [t, tf] of counts) {
      if (!postings.has(t)) postings.set(t, []);
      postings.get(t).push([i, tf]);
    }
  }
  const search = (query, limit) => {
    const qTokens = tokenize(query);
    if (!qTokens.length) return [];
    const qTf = new Map();
    for (const t of qTokens) qTf.set(t, (qTf.get(t) ?? 0) + 1);
    const scores = new Map();
    for (const t of qTf.keys()) {
      const dfi = df.get(t);
      if (!dfi) continue;
      const idf = Math.log(1 + (N - dfi + 0.5) / (dfi + 0.5));
      if (idf <= 0) continue;
      for (const [i, tf] of postings.get(t) ?? []) {
        const docLen = tokenized[i].length;
        const norm = tf * (K1 + 1) / (tf + K1 * (1 - B + B * docLen / avg));
        scores.set(i, (scores.get(i) ?? 0) + idf * norm);
      }
    }
    const idx = [...scores.keys()];
    idx.sort((a, b) => scores.get(b) - scores.get(a) || a - b);
    const cutoff = Math.min(limit, idx.length);
    const out = [];
    for (let k = 0; k < cutoff; k++) {
      const i = idx[k];
      out.push({ source: docs[i].source, score: Number(scores.get(i).toFixed(4)), preview: docs[i].text.replace(/\s+/g, ' ').slice(0, 110) });
    }
    return out;
  };
  return { N, avg, search };
}

const corpusText = readFileSync(CORPUS, 'utf8');
const docs = buildDocs(corpusText);
const { N, avg, search } = indexDocs(docs);

const QUERY_SET = [
  { q: '灶火燃着，阿石坐在灶前', expectAny: ['creative/novel/217-灯灭了.md'] },
  { q: '比拇指大两倍 夏火', expectAny: ['creative/novel/218-夏火.md'] },
  { q: '白桦的叶子全是绿的', expectAny: ['creative/novel/219-白桦吻.md'] },
  { q: '天刚亮，天还灰，谷雨', expectAny: ['creative/novel/220-谷雨.md'] },
  { q: '他拿起一颗麦粒', expectAny: ['creative/novel/221-麦粒.md'] },
  { q: '籽粒还在叶鞘里', expectAny: ['creative/novel/222-抽穗.md'] },
  { q: '锚火为什么没熄火', expectAny: ['creative/novel/'] },
  { q: '林渡', expectAny: ['creative/novel/', 'creative/tapestry-lore/'] },
  { q: '一百零九 回声', expectAny: ['creative/GLOSSARY.md', 'creative/GLOSSARY-en.md', 'creative/novel/'] },
];

const results = [];
let hits4 = 0;
let hits6 = 0;
for (const { q, expectAny } of QUERY_SET) {
  const top6 = search(q, 6);
  const top = top6.slice(0, 4);
  const pass4 = top.some((h) => expectAny.some((e) => h.source.startsWith(e)));
  const pass6 = top6.some((h) => expectAny.some((e) => h.source.startsWith(e)));
  if (pass4) hits4 += 1;
  if (pass6) hits6 += 1;
  results.push({ query: q, top4: top, top6, expected: expectAny, pass: pass4, passAt6: pass6 });
}

const artifact = {
  tool: 'scripts/lore-retrieval-probe.mjs',
  corpus: 'server/ai-service/src/main/resources/lore/corpus.txt',
  sources: docs.length,
  avgDocTokens: Number(avg.toFixed(1)),
  tokenizer: 'Han codepoints / ASCII runs (mirror of Bm25Tokenizer.java)',
  bm25: { k1: 1.5, b: 0.75 },
  limit: 4,
  enrichCapNote: 'Oracle 复合问题的 ENRICH 封顶 limit+2=6；rank6 行给出含 ENRICH 第五、六块视角下的对应命中率',
  queries: results.length,
  hits: hits4,
  hitsAt6: hits6,
  recallAt4: Number(((hits4 / results.length) * 100).toFixed(1)) + '%',
  recallAt6: Number(((hits6 / results.length) * 100).toFixed(1)) + '%',
  results,
  generatedAt: new Date().toISOString(),
};

if (process.argv.includes('--check')) {
  console.log('corpus docs=' + docs.length + ' avgTokens=' + avg.toFixed(1));
  process.exit(0);
}
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(artifact, null, 2));
  process.exit(0);
}
writeFileSync(OUT, JSON.stringify(artifact, null, 2) + '\n', 'utf8');
console.log(`lore-retrieval-probe: sources=${docs.length} avgDocTokens=${avg.toFixed(1)} recall@4=${artifact.recallAt4} (${hits4}/${results.length}) · recall@6=${artifact.recallAt6} (${hits6}/${results.length})`);
console.log(`wrote ${OUT}`);
for (const r of results) {
  const top = r.top4.map((h) => h.source.split('/').pop()).join(' | ');
  console.log(`  ${r.pass ? 'PASS' : 'MISS'}  “${r.query}” → ${top}`);
}
