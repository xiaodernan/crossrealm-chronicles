#!/usr/bin/env node
/**
 * oracle-log-archive · W-Z251
 *
 * 真实联调一次 Oracle live 测试（3 例：refs 路由 / canon + 出处 / 无义拒答）——
 * 把**真实上游输出原文**按时间归档到 `docs/oracle-live-log/YYYY-MM-DD-HHmm.md`，
 * 供审计与演示取用（真实数据，不是演示）。
 *
 * 本脚本**只产生少量 token**（3 次调用，各 ≤160 tokens 输出）。
 * 绝不假装成功：任一用例红 → 归档头注里明写 FAILURE（夜间门禁照样可以红）。
 *
 * 用法：node scripts/oracle-log-archive.mjs
 * 退出码：live 测试全绿 → 0；否则 → 1（日志照常写入，便于排障）。
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = join(ROOT, 'docs', 'oracle-live-log');
const now = new Date();
const stamp = now.toISOString().slice(0, 16).replace('T', '-').replace(':', '');
const file = join(LOG_DIR, `${stamp}.md`);

const r = spawnSync('node', [join(ROOT, 'scripts', '_live-env.mjs'), '-Dtest=LoreOracleLiveIntegrationTest'], {
  cwd: ROOT,
  encoding: 'utf8',
  timeout: 900000,
  maxBuffer: 64 * 1024 * 1024,
});
const output = `${r.stdout || ''}\n${r.stderr || ''}`.trim();
const ok = r.status === 0 && !/Tests run:.*Failures: [1-9]|Errors: [1-9]/.test(output);
const ran = /Tests run:/.test(output);
const skipped = /Skipped: 3/.test(output);

mkdirSync(LOG_DIR, { recursive: true });
const liveLines = output.split(/\r?\n/).filter((l) => /W-Z238|W-Z243|Tests run:|BUILD/.test(l));
const md = [
  `# Oracle live 归档 · ${now.toISOString()}`,
  '',
  `> 命令：\`node scripts/_live-env.mjs -Dtest=LoreOracleLiveIntegrationTest\``,
  `> 上游：https://api.aizzz.xyz/v1 · model=gpt-6.1-terra · Clash 混合端口 127.0.0.1:7897`,
  `> 结果：${ran ? (skipped ? '整体跳过（需要 LLM_API_KEY 环境）' : (ok ? '✅ 3/3 全绿' : '❌ 有失败用例，见下')) : '⚠️ 未能运行 / 未识别结果'}`,
  '',
  '```text',
  ...liveLines,
  '```',
  '',
  '完整输出：',
  '',
  '```text',
  output.split(/\r?\n/).slice(-120).join('\n'),
  '```',
  '',
  '（本文件由 scripts/oracle-log-archive.mjs 生成；日志是真实上游输出，勿手改。）',
].join('\n');
writeFileSync(file, md, 'utf8');

// 写一份 README 索引（按时间倒序）
try {
  const entries = readdirSync(LOG_DIR).filter((f) => f.endsWith('.md') && f !== 'README.md').sort().reverse();
  const readme = [
    '# Oracle live 归档索引',
    '',
    '| 运行时间 | 文件 |',
    '|---|---|',
    ...entries.slice(0, 50).map((f) => `| ${f.replace(/\.md$/, '').replace('T', ' ')} | [${f}](${f}) |`),
    '',
    '（自动生成；保留最近 50 次 live 运行原文。）',
  ].join('\n');
  writeFileSync(join(LOG_DIR, 'README.md'), readme, 'utf8');
} catch (e) {
  console.warn('oracle-log-archive: README 索引写入失败（不影响本次归档）:', String(e));
}

console.log(`oracle-log-archive: wrote ${file} · outcome=${ok ? 'green' : (ran ? 'red' : 'unknown')}`);
process.exit(ok ? 0 : 1);
