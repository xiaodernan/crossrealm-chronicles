/**
 * 阶段推进的**接线**门禁（W-B8 切片3）。
 *
 * 与 `boss-state-machine.test.js` 分工：那边验状态机**自身的机制**（枚举、切换、条件、存档），
 * 这边验**六只 Boss 与它的接线** —— "阶段推进只有一条路"这条 invariant 只在接线层才验得到。
 *
 * ## 这一片实测到的事实
 *
 * - 五只世界 Boss（`Boss` / `MagicBoss` / `SpaceBoss` / `VoidBoss` / `ChaosBoss`）
 *   **都继承 `Boss.checkPhase`**，因此都走状态机 —— 没有一个子类自己改 `this.phase`。
 * - 唯一覆盖 `checkPhase` 的是 `DungeonBoss`，它在切片2 已改成委托给状态机。
 * - `Boss.js` 原先手写的 `const ratio = this.hp / this.maxHp` 是**老路的残留**
 *   （阶段推进交给状态机之后它就没用了），本片删掉。
 * - 门槛原先写的是字符串 `'hp_threshold'` 与数字 `2` / `3`，即给那两张枚举**各抄一份真源** ——
 *   抄错了不报错，只是那只 Boss 永远不进二阶段。本片改用枚举。
 *
 * ## 一条如实记录的现状
 *
 * `BossStateMachine` 有 `state` 与 `phase` 两条轴，但**`state` 那条今天没人驱动**：
 * 全仓没有一处写 `sm.state = …`，`Boss` 自己另有一套 `this.state`。
 * 两条轴各记一份状态 = 迟早一处改了另一处没改；在把它们并起来之前，
 * **不要**拿 `sm.state` 做判断 —— 它永远是 IDLE。这条用断言钉住，
 * 等真有人去驱动它时这里会红，那时再连 `Boss.this.state` 一起谈。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BossStateMachine, BossState } from '../src/combat/BossStateMachine.js';

const SRC = join(process.cwd(), 'src');
const BOSS_FILES = ['Boss.js', 'MagicBoss.js', 'SpaceBoss.js', 'VoidBoss.js', 'ChaosBoss.js', 'DungeonBoss.js'];

const read = (name) => readFileSync(join(SRC, 'combat', name), 'utf8');
/** 剥掉注释后再判 —— 注释里提到 `this.phase` 不算真在改它 */
const code = (name) => read(name).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return name.endsWith('.js') ? [full] : [];
  });
}

describe('阶段推进只有一条路：子类不许自己改 `this.phase`', () => {
  it('扫描集自证：六个文件都读得到（读不到就会一路绿灯）', () => {
    for (const f of BOSS_FILES) expect(read(f).length).toBeGreaterThan(0);
  });

  it('没有任何子类直接给 `this.phase` 赋值（阶段是状态机的账）', () => {
    const offenders = [];
    for (const f of BOSS_FILES) {
      // `Boss.js` 那句是"从状态机同步回来"，是本片刻意保留的唯一一处
      if (f === 'Boss.js') continue;
      const m = code(f).match(/this\.phase\s*=(?!=)/g);
      if (m) offenders.push(f + ':' + m.length + ' 处');
    }
    expect(offenders, '这些子类自己改了 phase：' + offenders.join(', ')).toEqual([]);
  });

  it('`Boss.js` 里那一处赋值必须是"从状态机同步回来"，不是自己算', () => {
    expect(code('Boss.js')).toMatch(/this\.phase\s*=\s*this\.sm\.phase/);
    expect(code('Boss.js')).not.toMatch(/const ratio\s*=\s*this\.hp/);   // 手写判定已删
  });

  it('门槛用枚举而不是字面量（抄一份字符串真源，抄错不报错）', () => {
    const src = code('Boss.js');
    expect(src).toMatch(/registerTransitionCondition\(BossPhase\.PHASE_2/);
    expect(src).toMatch(/registerTransitionCondition\(BossPhase\.PHASE_3/);
    expect(src).toMatch(/PhaseTransitionCondition\.HP_THRESHOLD/);
    expect(src).not.toMatch(/type:\s*'hp_threshold'/);
  });

  it('覆盖 `checkPhase` 的子类必须把推进交给状态机（今天只有基类与副本 Boss）', () => {
    const overriders = BOSS_FILES.filter((f) => /^\s{2}checkPhase\(/m.test(code(f)));
    expect(overriders).toEqual(['Boss.js', 'DungeonBoss.js']);
    for (const f of overriders) {
      expect(code(f), f + ' 的 checkPhase 必须调状态机')
        .toMatch(/this\.sm\.(transitionTo|checkTransition|checkPhaseTransitions)/);
    }
  });
});

describe('一条如实记录的现状：`state` 轴今天没人驱动', () => {
  it('`Boss.js` 不再 import `BossState`（它那条轴是 `this.state`，与本类无关）', () => {
    const src = readFileSync(join(SRC, 'combat/Boss.js'), 'utf8');
    expect(src).not.toMatch(/import \{[^}]*\bBossState\b[^}]*\}/);
  });

  it('全仓没有一处给 `sm.state` 赋值 —— 所以别拿它做判断（它永远是 IDLE）', () => {
    const hits = [];
    for (const file of walk(SRC)) {
      const c = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      const m = c.match(/\.sm\.state\s*=(?!=)/g);
      if (m) hits.push(file.slice(SRC.length + 1).replace(/\\/g, '/'));
    }
    expect(hits, '有人在驱动 sm.state 了 —— 那要把 Boss.this.state 一起并进来，见 BossStateMachine 头注').toEqual([]);
  });

  it('门禁自证：这条不是因为扫不到才通过的（状态机自己确实声明了这一轴）', () => {
    const sm = new BossStateMachine({ bossId: 'x', name: 'x', hp: 1, maxHp: 1 });
    expect(sm.state).toBe(BossState.IDLE);      // 构造时落的那个值
    expect(BossState.DEAD).toBe('dead');         // 枚举里确实有这一格
  });
});
