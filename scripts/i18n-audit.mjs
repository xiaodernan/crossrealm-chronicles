#!/usr/bin/env node
/**
 * i18n-audit.mjs — 机控审计：中文模式下不能出现成段英文、英文模式下不能出现中文残留。
 *
 * 机控手法：
 *   - 读 src/content/strings.en.js，扫描所有单引号字符串，找出含 CJK 字符的字符串（排除合法的跨词汇，比如 hotkeys）；
 *   - 读 src/content/strings.zh.js，找出明显是英文成段的行（连续 A-Za-z 长度 > 5 的拼音/拼写构成的长串且整体看起来不像描述性词汇）。
 *
 * 按行动/标签白名单局部豁免（Hotkeys、CSS 属性名、cod rigs、正则、HTML-entity）。
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const enPath = join(ROOT, 'src', 'content', 'strings.en.js');
const zhPath = join(ROOT, 'src', 'content', 'strings.zh.js');

const CJK = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;

// English char run (roughly matches words >= 5 letters); anything longer than 5 English chars
const ASCII_WORDS = /\b[A-Za-z]{5,}\b/g;

// Known legitimate English fragments inside Chinese strings — technical identifiers that we do
// use in-world (NPC names, location IDs left in code, placeholders like {journal}).
const ALLOWLIST_SUBSTR = [
  '{', '}', 'http', '.js', '.json', '.png', 'console', 'window',
  'FortunePath', 'StateGraph', 'state-graph', 'crossrealm_',
  '%', '\u2019', // apostrophe is fine
];

function auditFile(path, side) {
  const raw = readFileSync(path, 'utf8');
  // drop source comment lines so they can't swallow quote boundaries and confuse the scanner
  const src = raw.split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const findings = [];
  for (const match of src.matchAll(/'[^']{2,400}'/g)) {
    const before = src.slice(0, match.index);
    const lastNl = before.lastIndexOf('\n');
    const s = match[0].slice(1, -1);
    if (side === 'en') {
      if (CJK.test(s)) findings.push({ line: lineOf(src, match.index), text: s.slice(0, 180) });
    } else {
      if (ASCII_WORDS.test(s)) {
        const hasAlpha = /[A-Za-z]{3,}/.test(s);
        if (!hasAlpha) continue;
        const tooPlenty = (s.match(/[A-Za-z]{5,}/g) || []).length >= 3;
        // Allow Chinese-quote-delimited English quotations (in-world tablet text)
        const quotedEn = /「[A-Za-z]/.test(s);
        if (tooPlenty && ALLOWLIST_SUBSTR.every((w) => !s.includes(w)) && !quotedEn) {
          findings.push({ line: lineOf(src, match.index), text: s.slice(0, 180) });
        }
      }
    }
  }
  return findings;
}

function lineOf(src, idx) {
  let n = 0;
  for (let i = 0; i < idx; i += 1) if (src[i] === '\n') n += 1;
  return n + 1;
}

const en = auditFile(enPath, 'en');
const zh = auditFile(zhPath, 'zh');

console.log(`i18n-audit: en side CJK hits = ${en.length}`);
if (en.length) for (const f of en.slice(0, 20)) console.log(`  L${f.line} ${f.text}`);
console.log(`i18n-audit: zh side ASCII-phrase hits = ${zh.length}`);
if (zh.length) for (const f of zh.slice(0, 30)) console.log(`  L${f.line} ${f.text}`);
process.exit((en.length + zh.length > 0) ? 1 : 0);
