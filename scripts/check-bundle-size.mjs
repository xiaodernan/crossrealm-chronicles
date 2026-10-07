/**
 * 首屏体积门禁（W-D5 切片1）
 *
 * ## 口径：什么算"首屏"
 * **只算 `dist/index.html` 直接引用的资源** —— 一个 `<script type="module">`、
 * 若干 `<link rel="modulepreload">`、一个 `<link rel="stylesheet">`。
 * 这三样是浏览器打开页面就要下的东西。
 *
 * **不算**运行时按需加载的（`dist/textures/**`、`dist/assets/models/*.glb`、
 * 以及任何没被 index.html 引用的 chunk）：那些不该进首屏预算，
 * 混进来会让"首屏 2 MB"这条线失去意义（当前它们合计约 11 MB，
 * 其中 `Soldier.glb` 一个就 2.16 MB）。
 *
 * ## 为什么缺文件要报错而不是跳过
 * 静默跳过等于"删掉一个文件 = 首屏变小了"，那是最容易骗过体积门禁的一种做法。
 * 所以引用在、文件不在 ⇒ 直接判失败并点名。
 *
 * ## 为什么带引用数下限
 * `index.html` 被清空、或正则写错时，求和的条目数会掉到 0 —— 0 字节当然"达标"。
 * 所以要求至少一个 module script 与一个 stylesheet 都能认出来。
 */
import { readFileSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 首屏预算：2 MiB（§2.3 验收线） */
export const FIRST_SCREEN_BUDGET = 2 * 1024 * 1024;

/**
 * 从 index.html 里认出首屏引用。
 * 认三种形态：module script 的 src、modulepreload 的 href、stylesheet 的 href。
 * 其余 `<link>`（icon / preconnect 之类）与 `data:` URL 不算。
 */
export function parseIndexReferences(html) {
  const refs = [];
  for (const m of html.matchAll(/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["']/g)) {
    refs.push({ kind: 'module', href: m[1] });
  }
  for (const m of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*\btype=["']module["']/g)) {
    refs.push({ kind: 'module', href: m[1] });
  }
  for (const m of html.matchAll(/<link\b[^>]*\brel=["']modulepreload["'][^>]*\bhref=["']([^"']+)["']/g)) {
    refs.push({ kind: 'modulepreload', href: m[1] });
  }
  for (const m of html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["']/g)) {
    refs.push({ kind: 'stylesheet', href: m[1] });
  }
  // 去重（同一文件被引两次只算一次）
  const seen = new Set();
  return refs.filter((r) => {
    const k = `${r.kind}|${r.href}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** 把 `/assets/x.js` 这样的站内绝对路径落到磁盘上 */
export function hrefToPath(distDir, href) {
  if (/^https?:\/\//.test(href) || href.startsWith('data:')) return null; // 外部/内联不算本地文件
  const clean = href.split('?')[0].split('#')[0];
  const rel = clean.replace(/^\/+/, '');
  return resolve(distDir, rel);
}

/**
 * 求首屏字节数。
 * @returns {{ total:number, entries:Array<{kind:string,href:string,bytes:number}>, missing:string[], external:string[] }}
 */
export function computeFirstScreenBytes(distDir, html = null) {
  const indexHtml = html ?? readFileSync(join(distDir, 'index.html'), 'utf8');
  const refs = parseIndexReferences(indexHtml);
  const entries = [];
  const missing = [];
  const external = [];
  for (const r of refs) {
    const p = hrefToPath(distDir, r.href);
    if (!p) { external.push(r.href); continue; }
    try {
      entries.push({ kind: r.kind, href: r.href, bytes: statSync(p).size });
    } catch {
      missing.push(r.href);
    }
  }
  return { total: entries.reduce((a, e) => a + e.bytes, 0), entries, missing, external };
}

/** 判定。返回一组"问题"，空数组 = 通过 */
export function checkFirstScreen({ total, entries, missing }, budget = FIRST_SCREEN_BUDGET) {
  const problems = [];
  if (missing.length) {
    problems.push(`index.html 引了但文件不在：${missing.join(', ')}（缺文件按失败算，不许静默跳过）`);
  }
  if (!entries.some((e) => e.kind === 'module')) problems.push('没有认出任何 module script —— 引用数下限没过（清空 index.html 会假绿）');
  if (!entries.some((e) => e.kind === 'stylesheet')) problems.push('没有认出任何 stylesheet —— 引用数下限没过');
  if (total > budget) {
    problems.push(`首屏 ${fmt(total)} 超预算 ${fmt(budget)}（超 ${fmt(total - budget)}）`);
  }
  return problems;
}

export const fmt = (n) => `${(n / 1024 / 1024).toFixed(2)} MiB`;

/** CLI：`npm run size` */
function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const distDir = resolve(here, '..', 'dist');
  let res;
  try {
    res = computeFirstScreenBytes(distDir);
  } catch (e) {
    console.error(`读不到 ${join(distDir, 'index.html')} —— 先跑 npm run build`);
    console.error(String(e.message ?? e));
    process.exit(2);
  }
  console.log('首屏引用明细（index.html 直接引用的才算）：');
  for (const e of [...res.entries].sort((a, b) => b.bytes - a.bytes)) {
    console.log(`  ${String(e.bytes).padStart(9)}  ${e.kind.padEnd(14)} ${e.href}`);
  }
  console.log(`  ${'-'.repeat(9)}`);
  console.log(`  ${String(res.total).padStart(9)}  合计 ${fmt(res.total)} / 预算 ${fmt(FIRST_SCREEN_BUDGET)}`);
  if (res.external.length) console.log(`  （外部/内联，不计入：${res.external.join(', ')}）`);

  const problems = checkFirstScreen(res);
  if (problems.length) {
    console.error('\n首屏体积门禁未过：');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log('\n首屏体积门禁通过 ✓');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
