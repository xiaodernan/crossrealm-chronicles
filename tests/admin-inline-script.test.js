import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * W-Z489 管理页内联脚本语法门禁。
 *
 * 病因：docs/admin/index.html 的 I18N 对象里曾有一条字符串中间多写了一个 `',`，
 * 整段 <script> 就此 SyntaxError —— 页面只剩静态 HTML，口令门 / 语言切换 / 遥测渲染
 * 全部失效，而构建与 vitest 都不看 HTML 里的 <script>，所以一路漏到用户面前。
 * 这把尺把管理页所有内联脚本抽出来做一次语法解析，坏了当场红。
 */
describe('管理页内联脚本可解析（W-Z489）', () => {
  const html = readFileSync(join(process.cwd(), 'docs/admin/index.html'), 'utf8');

  it('每个内联 <script> 块都能被 JS 解析器解析（无语法错误）', () => {
    const blocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
    expect(blocks.length, '没扫到任何内联脚本：门禁会在空集上恒真').toBeGreaterThan(0);
    const bad = [];
    blocks.forEach((code, i) => {
      const body = code.trim();
      if (!body) return;
      // type=module 的 import 语法 new Function 不认，但管理页这段是普通脚本；
      // 只做语法解析（不执行），避免触碰 DOM。
      try {
        new Function(body);
      } catch (e) {
        bad.push(`块#${i}: ${e.message}`);
      }
    });
    expect(bad).toEqual([]);
  });

  it('meas_tr36 没有游离的引号（那条真实病史的精确回归）', () => {
    expect(html).not.toMatch(/世界\/count\s*→\s*200\s*',/);
  });
});