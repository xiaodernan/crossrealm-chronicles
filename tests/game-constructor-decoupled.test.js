/**
 * `Game` 装配层的解耦门禁（M7）。
 *
 * ## 修前是什么样子
 *
 * `Game` 的构造函数是一个 271 行的 god-constructor，体内 **112 个 `new`** ——
 * 从 `THREE.Clock` 到 `PopCultureWave4VisualPass` 全堆在一个方法里。
 * 读它等于读整个游戏的装配顺序，改一处子系统要在 271 行里找位置。
 *
 * ## 这一片改成了什么
 *
 * 把构造按子系统分组搬进 5 个私有 builder：`_buildRenderStack` /
 * `_buildWorldAndCombat` / `_buildPlayerCombat` / `_buildUiAndSystems` /
 * `_buildSettingsAndFinalize`。构造函数只剩核心字段（3 个 `new`）+ 5 次调用，
 * 读起来是"先建渲染栈、再建世界与战斗、再建玩家、再建界面、最后落设置与收尾"。
 * **行为逐字不变**：块内代码、顺序、副作用一字未改（`container.` → `this.container.`）。
 *
 * ## 判据
 * ① 构造函数体内 `new` 次数 ≤ 40（改前 112）。
 * ② 5 个 builder 方法都存在，且各自体内确有 `new`（不是空壳搬走了事）。
 * ③ 反面对照：一段塞 60 个 `new` 的假构造函数，同一把尺必须判它超限。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SRC = readFileSync(join(ROOT, 'src/core/Game.js'), 'utf8');

/** 从 `from` 之后第一个 `{` 起，取配对花括号之间的文本 */
function braceBody(src, from) {
  const braceStart = src.indexOf('{', from);
  if (braceStart < 0) return null;
  let depth = 0;
  for (let j = braceStart; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(braceStart, j + 1); }
  }
  return null;
}

/** 取 `constructor(<args>) { ... }` 的体 */
function ctorBody(src) {
  const i = src.indexOf('constructor(');
  return i < 0 ? null : braceBody(src, i);
}

const countNew = (text) => (text.match(/\bnew\s+[A-Za-z_$]/g) || []).length;

const BUILDERS = [
  '_buildRenderStack',
  '_buildWorldAndCombat',
  '_buildPlayerCombat',
  '_buildUiAndSystems',
  '_buildSettingsAndFinalize',
];

describe('Game 装配层解耦（M7）', () => {
  it('构造函数体内的 new 次数 ≤ 40（改前 112）', () => {
    const body = ctorBody(SRC);
    expect(body, '找不到构造函数').toBeTruthy();
    const n = countNew(body);
    expect(n, `构造函数体内仍有 ${n} 个 new（目标 ≤ 40）`).toBeLessThanOrEqual(40);
  });

  it('5 个 builder 都存在，且各自体内确有 new（不是空壳）', () => {
    for (const name of BUILDERS) {
      const i = SRC.indexOf(`  ${name}() {`);
      expect(i, `缺 builder：${name}`).toBeGreaterThanOrEqual(0);
      const body = braceBody(SRC, i);
      expect(countNew(body), `${name} 体内没有 new —— 是不是把东西搬空却没搬进去？`)
        .toBeGreaterThan(0);
    }
    // 构造函数确实调了这 5 个（不是定义了没人用）
    const ctor = ctorBody(SRC);
    for (const name of BUILDERS) {
      expect(ctor.includes(`this.${name}()`), `构造函数没调 ${name}`).toBe(true);
    }
  });

  it('反面对照：塞 60 个 new 的假构造函数必须被判超限', () => {
    const fake = `constructor() { ${Array.from({ length: 60 }, (_, i) => `this.a${i} = new Foo();`).join(' ')} }`;
    expect(countNew(ctorBody(fake))).toBeGreaterThan(40);
  });
});
