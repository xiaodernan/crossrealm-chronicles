/**
 * 永久静态门禁：UPPER_SNAKE 表名在 src/ 里只许被字面量定义一次。
 *
 * 看守的是 KILL_SOULS 那一族（`0adf103` 抓到 `KILL_SOULS` 在 enemies.js 与 EnemyManager.js
 * 各抄一份）。判据很简单：**一个表名只该有一个定义**。改一处而另一份不跟着变，是这类病
 * 的共同机理；name 唯一了，"改一处另一处不变"就没有落点。
 *
 * 只数字面量定义（`const NAME = {` / `= Object.freeze({` ），import 进来用不算法；
 * UPPER_SNAKE（≥3 字符）风格的表名才在管辖范围 —— camelCase 局部量、单字符不算法。
 * 撞名即红（红名单会把文件列出来），要么合成一份、要么改名消歧，别让同一个名字指两张表。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function srcFiles(dir = 'src') {
  const out = [];
  for (const ent of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${ent.name}`;
    if (ent.isDirectory()) out.push(...srcFiles(rel));
    else if (ent.name.endsWith('.js')) out.push(rel);
  }
  return out;
}

const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('UPPER_SNAKE 表名在全仓 src 里唯一（不许有两份定义）', () => {
  it('没有任何 UPPER_SNAKE 表被两个字面量定义', () => {
    const defRe = /(?:export\s+)?const\s+([A-Z][A-Z0-9_]{2,})\s*=\s*(?:Object\.freeze\s*\()?\s*\{/g;
    const where = new Map();
    for (const rel of srcFiles()) {
      const code = stripComments(readFileSync(join(ROOT, rel), 'utf8'));
      for (const m of code.matchAll(defRe)) {
        if (!where.has(m[1])) where.set(m[1], new Set());
        where.get(m[1]).add(rel);
      }
    }
    const dupes = [...where.entries()]
      .filter(([, files]) => files.size > 1)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, files]) => `${name}: ${[...files].sort().join(', ')}`);
    expect(dupes, `有表名被定义成两份（合成一份或改名消歧）：\n${dupes.join('\n')}`).toEqual([]);
  });
});
