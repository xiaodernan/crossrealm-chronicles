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
 * ## `state` 那条轴：切片3 量出没人驱动，切片4 查明它不该存在
 *
 * `Enemy` 已经有一套**真的在跑**的战斗状态机（`ai/EnemyFSM` 的 `createEnemyFSM`，
 * `Enemy.update` 每帧 `this.state = this.fsm.current`），`Boss extends Enemy` 因此也有它。
 * `BossStateMachine` 再持一条 `state` 轴 = 同一件事记两份账，而且那份账没人写、永远是 IDLE。
 * 所以切片4 把它连同 `BossState` 枚举一起**删掉**了。下面这几条断言的就是"它确实不在"。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BossStateMachine } from '../src/combat/BossStateMachine.js';

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

describe('`state` 轴已删（W-B8 切片4）：战斗状态归 `Enemy.fsm`', () => {
  it('`BossStateMachine` 不再导出 `BossState`，实例上也没有 `state`', () => {
    const sm = new BossStateMachine({ bossId: 'x', name: 'x', hp: 1, maxHp: 1 });
    expect(sm).not.toHaveProperty('state');
    expect(sm.constructor.name).toBe('BossStateMachine');
    // 构造器也不该再往实例上落这一格（`toHaveProperty` 对 `undefined` 值会误判，所以查键）
    expect(Object.keys(sm)).not.toContain('state');
  });

  it('全仓没有一处读 `sm.state` 做判断（谁再写谁就要连 `Enemy.fsm` 一起谈）', () => {
    const hits = [];
    for (const file of walk(SRC)) {
      const c = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      const m = c.match(/\.sm\.state\b/g);
      if (m) hits.push(file.slice(SRC.length + 1).replace(/\\/g, '/'));
    }
    expect(hits, '有人在读 sm.state 了 —— 先读 `BossStateMachine` 头注再决定要不要把它加回来').toEqual([]);
  });

  it('战斗状态的真源仍在 `Enemy`（`this.state` 由 `fsm.current` 驱动）—— 别删错那一份', () => {
    const enemy = readFileSync(join(SRC, 'combat/Enemy.js'), 'utf8');
    expect(enemy).toMatch(/this\.state = this\.fsm\.current/);
    expect(enemy).toMatch(/createEnemyFSM\(this\)/);
  });

  it('门禁自证：这条不是因为扫不到才通过的（`Enemy` 里确实有 `this.state =`）', () => {
    const enemy = readFileSync(join(SRC, 'combat/Enemy.js'), 'utf8');
    expect((enemy.match(/this\.state\s*=/g) ?? []).length).toBeGreaterThan(0);
  });
});
