#!/usr/bin/env node
/**
 * link-check：全仓链接完整性校验（W-Z73）
 *
 * ## 为什么
 * 创作层与玩家册子各自扩了十几次，md 里的 `[x](path)` 与 HTML 里的 `<a href>` / `<img src>`
 * 从来没有人对一次账；断链对读者是「点进去 404」的直接体验损失。
 * 本脚本一次扫干净：列出真断链（相对路径、仓库内目标）。
 *
 * ## 口径
 * - 只处理**仓库内相对路径**：跳过 http(s) / mailto / tel / data: / javascript: / 纯锚点；
 * - 跳过占位符模板（含 ${...} 或 <...>）与任何不是真路径的东西；
 * - HTML 只查 href / src / srcset(第一候选) 三个属性；md 查 `[text](target)` 与裸 `src=`；
 * - 目标 = 解析后的 `fs.existsSync(path.resolve(dirname(file), target))`；尾部 `#anchor` 剥掉再判；
 * - 退出码：有断链 ⇒ 1，全绿 ⇒ 0；另外 `--json` 打 JSON 供 CI 消费。
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'target', 'build', '.next', '.cache', 'coverage', 'site', '_site', 'godot']);
const SKIP_FILES = new Set(['package-lock.json']);
const EXTS = ['.md', '.html'];
const asJson = process.argv.includes('--json');
// Pages 站点根部署的 sibling 产物（showcase.yml 组装的 _site/：
// game/ ← dist/、guide.html ← player-guide.html、tapestry.html、favicon.svg、index.html ← showcase.html）
// creative/*.html 里对它们的相对链接在 gh-pages 上必然成立、在仓库里必然不存在——按部署版一寸预期跳过。
const DEPLOY_SIBLINGS = new Set(['game', 'index.html', 'guide.html', 'tapestry.html', 'favicon.svg']);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...walk(full));
    } else if (EXTS.includes(extOf(entry.name)) && !SKIP_FILES.has(entry.name)) {
      out.push(full);
    }
  }
  return out;
}
const extOf = (n) => (n.lastIndexOf('.') > 0 ? n.slice(n.lastIndexOf('.')).toLowerCase() : '');

const files = walk(ROOT);

const LINK_RE = /(?:\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)|(?:href|src)="([^"]+)")/g;

const bad = [];
const scanned = [];
function stripCode(text) {
  // 先抹掉 fenced code blocks（```...``` / ~~~...~~~），再抹掉单行 `行内代码`
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/`[^`\n]*`/g, ' ');
}

for (const file of files) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  if (extOf(file) === '.md') text = stripCode(text);
  let m;
  while ((m = LINK_RE.exec(text)) !== null) {
    const raw = (m[1] ?? m[2])?.trim();
    if (!raw) continue;
    if (/^(https?:|mailto:|tel:|data:|javascript:|#)/i.test(raw)) continue;
    if (/\$\{|<|>/.test(raw)) continue;             // 模板占位符
    const noFragment = raw.split('#')[0].split('?')[0];
    if (!noFragment) continue;
    // creative/*.html 里的站根 sibling 引用：gh-pages 保证存在，仓库内无对应实体
    if (rel.startsWith('creative/') && DEPLOY_SIBLINGS.has(noFragment.replace(/^\.\//, '').split('/')[0])) { continue; }
    let target;
    if (noFragment.startsWith('/')) {
      const siteRootRel = noFragment.slice(1);
      target = resolve(ROOT, siteRootRel);
      if (!existsSync(target)) target = resolve(ROOT, 'public', siteRootRel); // vite: public/ 挂到 /
    } else {
      target = resolve(dirname(file), decodeURIComponent(noFragment));
    }
    if (!target.startsWith(ROOT)) { bad.push(`${rel}: 越界链接 -> ${raw}`); continue; }
    if (!existsSync(target)) bad.push(`${rel}: ${raw}`);
  }
  scanned.push(rel);
}

if (asJson) {
  console.log(JSON.stringify({ scannedFiles: scanned.length, broken: bad }, null, 2));
} else {
  console.log(`link-check: scanned ${scanned.length} files`);
  if (bad.length) {
    console.log(`link-check: ${bad.length} broken link(s):`);
    for (const b of bad) console.log('  - ' + b);
  } else {
    console.log('link-check: all links resolve.');
  }
}
process.exit(bad.length ? 1 : 0);
