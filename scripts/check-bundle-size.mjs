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

/**
 * ## 两条线，不是一个数（W-D5 切片4）
 *
 * 切片1 只钉了一个 `2 MiB`。它当时是对着 **1441767 字节 = 1.37 MiB** 的实测写的 ——
 * 也就是说那条"预算"里躺着 **0.63 MiB 的隐性余量**。余量的坏处不是"太宽松"，
 * 是**它不发出任何信号**：从 1.37 长到 2.00 的这一路（W-D5 之后几十个切片，每片几 KB
 * 到几十 KB），门禁一次都没红过，直到 2026-11-10 的 W-F2 切片把它顶成
 * **2098856 字节**，才在"超 0.00 MiB"这一行里第一次说话。
 *
 * 顶到线才报警，等于把"审阅"排在"已经超了"之后。所以这里拆成两条：
 *
 * - `FIRST_SCREEN_READING` —— **上次审阅时的真读数**。它是刻度，不是预算：
 *   2026-11-10 实测 2098856 字节（`chunk-core` 880446 + `vendor-three` 682986 +
 *   `chunk-world` 192782 + `chunk-ui` 148673 + `chunk-combat` 84654 + 入口 63595 +
 *   样式 45720）。**抬它必须改这一行**，改的那次提交里要写清为什么（ADR W-D5 切片4）。
 * - `FIRST_SCREEN_GROWTH_RATIO` —— 环比容差。单次改动允许比刻度长 3%（约 61 KB），
 *   超了当场红。61 KB 是"一次切片合理增重"的上限：本仓近 200 个切片的实测中位数在
 *   10 KB 以内，最大的一片（`chunk-world` 首次落地）也只有 60 KB 出头。
 * - `FIRST_SCREEN_BUDGET` —— §2.3 的**绝对上限，2.25 MiB**。由 2.00 上调这一次
 *   （ADR W-D5 切片4），理由写在 ADR 里：既有的内容增长全部是真实功能，没有死代码可删
 *   （2801 个文案键**零死键**，实测过），而首屏里 40% 的正文量是两张语言表 ——
 *   按语言分包是唯一的结构性杠杆，但它被 `franchises` / `gear` / `semanticColors` /
 *   `skillTrees` 四个内容模块在 import 期静态读英文表挡住了，那是独立一片的活。
 *   上限往上抬了 0.25 MiB，**环比容差反而把警戒线从 0.63 MiB 收紧到 61 KB**。
 */
export const FIRST_SCREEN_READING = 2163508;

/** 环比容差：单次改动允许比上次审阅长 3%（见上方注释） */
export const FIRST_SCREEN_GROWTH_RATIO = 1.03;

/** 首屏绝对上限：2.25 MiB（§2.3 验收线，W-D5 切片4 由 2.00 上调，见 ADR） */
export const FIRST_SCREEN_BUDGET = 2.25 * 1024 * 1024;

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

/**
 * 判定。返回一组"问题"，空数组 = 通过。
 *
 * 两层判定（W-D5 切片4）：**环比**（对上次审阅的刻度）先报，**绝对上限**后报。
 * 两条都留着而不是只用一条 —— 环比防"悄悄长"，上限防"一节一节抬刻度把它抬没了"。
 *
 * @param {{total:number, entries:Array, missing:string[]}} res
 * @param {{ceiling?:number, reading?:number, ratio?:number}} [opts]
 */
export function checkFirstScreen({ total, entries, missing }, opts = {}) {
  const {
    ceiling = FIRST_SCREEN_BUDGET,
    reading = FIRST_SCREEN_READING,
    ratio = FIRST_SCREEN_GROWTH_RATIO,
  } = opts;
  const problems = [];
  if (missing.length) {
    problems.push(`index.html 引了但文件不在：${missing.join(', ')}（缺文件按失败算，不许静默跳过）`);
  }
  if (!entries.some((e) => e.kind === 'module')) problems.push('没有认出任何 module script —— 引用数下限没过（清空 index.html 会假绿）');
  if (!entries.some((e) => e.kind === 'stylesheet')) problems.push('没有认出任何 stylesheet —— 引用数下限没过');

  const ratchet = Math.floor(reading * ratio);
  if (total > ratchet) {
    problems.push(
      `首屏 ${fmt(total)} 比上次审阅（${fmt(reading)}）长超 ${((ratio - 1) * 100).toFixed(0)}%`
      + ` 的环比容差（上限 ${fmt(ratchet)}，涨了 ${fmt(total - reading)}）`
      + ' —— 要么瘦下来，要么改 FIRST_SCREEN_READING 并在 ADR 里写清为什么',
    );
  }
  if (total > ceiling) {
    problems.push(`首屏 ${fmt(total)} 超绝对上限 ${fmt(ceiling)}（超 ${fmt(total - ceiling)}）`);
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
  const ratchet = Math.floor(FIRST_SCREEN_READING * FIRST_SCREEN_GROWTH_RATIO);
  console.log(`  ${String(res.total).padStart(9)}  合计 ${fmt(res.total)}`);
  console.log(`  环比：刻度 ${fmt(FIRST_SCREEN_READING)} × ${FIRST_SCREEN_GROWTH_RATIO}`
    + ` = ${fmt(ratchet)}（余量 ${fmt(Math.max(0, ratchet - res.total))}）`);
  console.log(`  上限：${fmt(FIRST_SCREEN_BUDGET)}（余量 ${fmt(Math.max(0, FIRST_SCREEN_BUDGET - res.total))}）`);
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
