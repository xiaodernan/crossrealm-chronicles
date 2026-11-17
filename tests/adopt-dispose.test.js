/**
 * W-Z348 · 收编子系统一律自带 `dispose()`（防 perf-smoke 再被"真空"子系统堵死）。
 *
 * 契机：`KindleLetterSystem`（W-Z292）从落地那天起没有 `dispose()`，于是 `Game` 构造期
 * `adoptSubsystem` 直接抛错，整局游戏在任何真浏览器里**从第一格永远起不来**——而 vitest
 * 从不构造完整 `Game`，这条线索只被 `npm run perf`（真 boot）抓到。
 *
 * 形态：从 `Game.js` 机器抽取每一处 `_adopt('tag', new Cls(...))`，按 import 路径解开文件，
 * 断言文件里必写一个 `dispose()` 方法。少一条 = 真 boot 当场堵；门禁。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/** 解开 Game.js 里的 `_adopt('tag', new Cls(...))` 与对应的 import 来源 */
function adoptedSystems() {
  const s = read('src/core/Game.js');
  const classToTag = new Map();
  const re = /_adopt\('([^']+)'\s*,\s*new ([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(s))) classToTag.set(m[2], m[1]);
  const imports = new Map();
  const importRe = /import\s*\{([^}]+)\}\s*from\s*'([^']+)'/g;
  let im;
  while ((im = importRe.exec(s))) {
    for (const part of im[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name) imports.set(name, im[2]);
    }
  }
  const rows = [];
  for (const [cls, tag] of classToTag) {
    const spec = imports.get(cls);
    rows.push({ tag, cls, spec });
  }
  return rows;
}

const rows = adoptedSystems();
describe('收编门禁 · 每个 _adopt 的子系统必须有 dispose()（W-Z348 真 boot 红过的教训）', () => {
  it('Game.js 至少收编 40 个子系统（否则这次扫描没在看真东西）', () => {
    expect(rows.length, '收编计数异常——门禁形状失效了').toBeGreaterThanOrEqual(40);
  });

  for (const { tag, cls, spec } of rows) {
    it(`${tag}（${cls}）文件里写着 dispose()`, () => {
      expect(spec, `${tag}: import 语句解析失败`).toBeTruthy();
      const rel = spec.replace(/^\.\.\//, 'src/');
      const file = existsSync(join(ROOT, rel)) ? rel : rel + '.js';
      expect(existsSync(join(ROOT, file)), `${tag}: 找不到源文件 ${file}`).toBe(true);
      const body = read(file);
      const hasDispose = /\bdispose\s*\(/.test(body);
      expect(hasDispose, `${tag}（${cls} · ${file}）缺少 dispose()——真 boot 会当场抛 adoptSubsystem`).toBe(true);
    });
  }
});
