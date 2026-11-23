import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * W-Z505 密钥防泄漏门禁：用户的 GitHub PAT (ghp_) 与 LLM API key (sk-) 绝不能进版本库。
 * 两者只应存在于 gitignored 的 .env。这里扫描**当前工作树里会被 git 跟踪的文件**，
 * 出现完整 token 字面量就当场红——防止某次手滑把密钥粘进代码/文档/测试夹具。
 */
describe('密钥不进版本库（W-Z505）', () => {
  const ROOT = process.cwd();
  const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean);

  it('没有任何被跟踪文件含完整 ghp_ PAT 或 sk- API key', () => {
    const fs = require('node:fs');
    const patRe = /ghp_[A-Za-z0-9]{30,}/;
    const keyRe = /sk-[A-Za-z0-9]{30,}/;
    const offenders = [];
    for (const rel of tracked) {
      const abs = join(ROOT, rel);
      try {
        if (!fs.statSync(abs).isFile()) continue;
        // 只扫文本类，跳过二进制/图片/字体
        if (!/\.(js|ts|jsx|tsx|json|md|html|yml|yaml|java|txt|css|sh|mjs|cjs|env\.example)$/i.test(rel) && !rel.startsWith('.github/')) continue;
        const s = fs.readFileSync(abs, 'utf8');
        if (patRe.test(s) || keyRe.test(s)) offenders.push(rel);
      } catch { /* 读不到跳过 */ }
    }
    expect(offenders, '完整密钥字面量进了版本库').toEqual([]);
  });

  it('.env 确实被 git 忽略（密钥唯一容身处）', () => {
    const ignored = execFileSync('git', ['check-ignore', '.env', 'server/.env'], { cwd: ROOT, encoding: 'utf8' });
    expect(ignored).toMatch(/\.env/);
    expect(ignored).toMatch(/server\/\.env/);
  });
});