/**
 * 首屏体积门禁（W-D5 切片1）
 *
 * ## 口径
 * **只算 `dist/index.html` 直接引用的资源**（module script + modulepreload + stylesheet）。
 * 运行时按需加载的（`dist/textures/**`、`dist/models/*.glb`）**不进首屏预算** ——
 * 混进来这条线就失去意义（它们合计约 11 MB，`Soldier.glb` 一个就 2.16 MB）。
 *
 * ## 用例分五层
 * 1. **解析**：三种引用形态都认得出；去重；不认 icon / preconnect / 外部 URL。
 * 2. **求和**：真造文件算得对（含 modulepreload）。
 * 3. **判定**：超预算、缺文件、缺 module、缺 stylesheet 各红各的。
 * 4. **反面证据**：只认一种形态的坏尺子会漏掉另外两种 —— 尺子自己要被量过。
 * 5. **真 dist**（存在时才算）：当前首屏在预算内，并把读数钉下来。
 *
 * **缺文件按失败算**是这一片最重要的口径：静默跳过等于"删掉一个文件 = 首屏变小了"，
 * 那是最容易骗过体积门禁的一种做法。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseIndexReferences, computeFirstScreenBytes, checkFirstScreen,
  hrefToPath, FIRST_SCREEN_BUDGET, fmt,
} from '../scripts/check-bundle-size.mjs';

/** 造一个假 dist */
function makeDist(files, html) {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-'));
  for (const [rel, size] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, Buffer.alloc(size, 0x61));
  }
  if (html !== null) writeFileSync(join(dir, 'index.html'), html, 'utf8');
  return dir;
}

const HTML_OK = `<!DOCTYPE html><html><head>
<script type="module" crossorigin src="/assets/index.js"></script>
<link rel="modulepreload" crossorigin href="/assets/vendor.js">
<link rel="modulepreload" crossorigin href="/assets/chunk-core.js">
<link rel="stylesheet" crossorigin href="/assets/index.css">
<link rel="icon" href="/favicon.ico">
<link rel="preconnect" href="https://example.com">
</head><body></body></html>`;

const dirs = [];
beforeAll(() => {});
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

describe('首屏体积门禁（W-D5 切片1）', () => {
  describe('① 解析 index.html 的引用', () => {
    it('三种形态都认得出', () => {
      const refs = parseIndexReferences(HTML_OK);
      const kinds = refs.map((r) => r.kind).sort();
      expect(kinds).toEqual(['module', 'modulepreload', 'modulepreload', 'stylesheet']);
    });

    it('不认 icon / preconnect 这些非首屏资源', () => {
      const hrefs = parseIndexReferences(HTML_OK).map((r) => r.href);
      expect(hrefs).not.toContain('/favicon.ico');
      expect(hrefs).not.toContain('https://example.com');
    });

    it('属性顺序颠倒也认得出（src 在 type 之前）', () => {
      const html = '<script crossorigin src="/a.js" type="module"></script>';
      expect(parseIndexReferences(html).map((r) => r.href)).toEqual(['/a.js']);
    });

    it('同一文件被引两次只算一次', () => {
      const html = `<link rel="modulepreload" href="/a.js"><link rel="modulepreload" href="/a.js">`;
      expect(parseIndexReferences(html).length).toBe(1);
    });

    it('普通 script（非 module）不算首屏 —— 但真入口是 module，所以这不影响真实产物', () => {
      const html = '<script src="/legacy.js"></script>';
      expect(parseIndexReferences(html)).toEqual([]);
    });
  });

  describe('② 求和', () => {
    it('真造文件，合计 = 各文件之和（含 modulepreload）', () => {
      const dir = makeDist({
        'assets/index.js': 1000,
        'assets/vendor.js': 2000,
        'assets/chunk-core.js': 3000,
        'assets/index.css': 500,
        'favicon.ico': 99999, // 不在 index.html 的引用里，不该被算
        'textures/big.jpg': 5000000, // 运行时加载，不该被算
      }, HTML_OK);
      dirs.push(dir);
      const res = computeFirstScreenBytes(dir);
      expect(res.total).toBe(1000 + 2000 + 3000 + 500);
      expect(res.missing).toEqual([]);
      expect(res.entries.length).toBe(4);
    });

    it('外部 URL 与 data: 不计入，也不报缺文件', () => {
      const html = `<script type="module" src="https://cdn.example.com/x.js"></script>
        <link rel="stylesheet" href="data:text/css,a{}">
        <script type="module" src="/assets/real.js"></script>`;
      const dir = makeDist({ 'assets/real.js': 42 }, html);
      dirs.push(dir);
      const res = computeFirstScreenBytes(dir);
      expect(res.total).toBe(42);
      expect(res.external.length).toBe(2);
      expect(res.missing).toEqual([]);
    });

    it('hrefToPath 把站内绝对路径落到磁盘，外部返回 null', () => {
      expect(hrefToPath('D:/x', '/assets/a.js')).toMatch(/assets[\\/]a\.js$/);
      expect(hrefToPath('D:/x', 'https://a.com/b.js')).toBe(null);
      expect(hrefToPath('D:/x', 'data:text/css,a{}')).toBe(null);
      expect(hrefToPath('D:/x', '/assets/a.js?v=1')).toMatch(/assets[\\/]a\.js$/);
    });
  });

  describe('③ 判定', () => {
    it('预算内、引用齐全 → 无问题', () => {
      // HTML_OK 引了 4 个本地文件，这里必须**都造出来** —— 少造一个就会以"缺文件"红，
      // 那条红是夹具不完整，不是门禁在做事（第一版就是这么红的）。
      const dir = makeDist({
        'assets/index.js': 1000, 'assets/vendor.js': 2000,
        'assets/chunk-core.js': 3000, 'assets/index.css': 100,
      }, HTML_OK);
      dirs.push(dir);
      expect(checkFirstScreen(computeFirstScreenBytes(dir))).toEqual([]);
    });

    it('超预算 → 红，且说得出超了多少', () => {
      const dir = makeDist({
        'assets/index.js': FIRST_SCREEN_BUDGET, 'assets/index.css': 100,
      }, HTML_OK);
      dirs.push(dir);
      const problems = checkFirstScreen(computeFirstScreenBytes(dir));
      expect(problems.some((p) => /超预算/.test(p))).toBe(true);
    });

    it('**缺文件 → 红**（不许静默跳过：删掉一个文件不能等于首屏变小）', () => {
      const html = `<script type="module" src="/assets/index.js"></script>
        <link rel="stylesheet" href="/assets/index.css">
        <link rel="modulepreload" href="/assets/gone.js">`;
      const dir = makeDist({ 'assets/index.js': 1000, 'assets/index.css': 100 }, html);
      dirs.push(dir);
      const res = computeFirstScreenBytes(dir);
      expect(res.missing).toEqual(['/assets/gone.js']);
      expect(res.total).toBe(1100); // 缺的那个没被算进来 —— 所以必须靠 missing 判红
      const problems = checkFirstScreen(res);
      expect(problems.some((p) => /文件不在/.test(p))).toBe(true);
    });

    it('认不出 module script → 红（引用数下限）', () => {
      const dir = makeDist({ 'assets/index.css': 100 }, '<link rel="stylesheet" href="/assets/index.css">');
      dirs.push(dir);
      const problems = checkFirstScreen(computeFirstScreenBytes(dir));
      expect(problems.some((p) => /module script/.test(p))).toBe(true);
    });

    it('认不出 stylesheet → 红', () => {
      const dir = makeDist({ 'assets/index.js': 100 }, '<script type="module" src="/assets/index.js"></script>');
      dirs.push(dir);
      const problems = checkFirstScreen(computeFirstScreenBytes(dir));
      expect(problems.some((p) => /stylesheet/.test(p))).toBe(true);
    });
  });

  describe('④ 反面证据：尺子自己要被量过', () => {
    it('只认 modulepreload 的坏尺子会漏掉 module 与 stylesheet', () => {
      const 坏尺子 = (html) => [...html.matchAll(/<link\b[^>]*rel=["']modulepreload["'][^>]*href=["']([^"']+)["']/g)].map((m) => m[1]);
      const refs = 坏尺子(HTML_OK);
      expect(refs.length).toBe(2);                       // 只拿到两条
      expect(refs).not.toContain('/assets/index.js');    // 漏掉入口
      expect(refs).not.toContain('/assets/index.css');   // 漏掉样式
      expect(parseIndexReferences(HTML_OK).length).toBe(4); // 真尺子拿全
    });

    it('`fmt` 把字节说成人话', () => {
      expect(fmt(2 * 1024 * 1024)).toBe('2.00 MiB');
      expect(fmt(0)).toBe('0.00 MiB');
    });
  });

  describe('⑤ 真 dist（存在时才算）', () => {
    const distDir = resolve(process.cwd(), 'dist');
    const has = existsSync(join(distDir, 'index.html'));

    it.skipIf(!has)('当前首屏在 2 MiB 预算内', () => {
      const res = computeFirstScreenBytes(distDir);
      // 把读数打出来，回填 ADR 时直接用
      console.log(`首屏读数：${res.total} 字节 = ${fmt(res.total)} / 预算 ${fmt(FIRST_SCREEN_BUDGET)}`);
      for (const e of [...res.entries].sort((a, b) => b.bytes - a.bytes)) {
        console.log(`  ${String(e.bytes).padStart(9)}  ${e.kind.padEnd(14)} ${e.href}`);
      }
      expect(res.missing).toEqual([]);
      expect(checkFirstScreen(res)).toEqual([]);
      expect(res.total).toBeLessThanOrEqual(FIRST_SCREEN_BUDGET);
    });

    it.skipIf(!has)('运行时按需加载的资源不在首屏账上（口径钉子）', () => {
      const res = computeFirstScreenBytes(distDir);
      const hrefs = res.entries.map((e) => e.href).join(' ');
      expect(hrefs).not.toMatch(/textures\//);
      expect(hrefs).not.toMatch(/\.glb/);
    });
  });
});
