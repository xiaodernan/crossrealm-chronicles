/**
 * Boss 阶段参数表（W-B8 切片5）。
 *
 * ## 这一片修的是什么
 *
 * 五只 Boss 的招式数值原先**散在各自的 `update` 里按 `this.phase` 现算**：
 *
 *     if (this.phase >= 2 && this.shootCooldown <= 0 && this.distanceTo(playerPos) < 25) {
 *       this.projectiles?.spawn(…, 12 + this.phase * 4, 10 + this.phase * 2, 0xcc44ff);
 *       this.shootCooldown = this.phase >= 3 ? 1.2 : 2.0;
 *     }
 *
 * 于是"这只 Boss 在二阶段是什么样"**没有一处能读到** —— 它只存在于三段分散的算术里
 * （一个 `>= 2` 的门、两个 `phase * N` 的缩放、一个三目）。想比较两只 Boss 的阶段强度、
 * 想调一档数值，都得先去读四份 `update`；改坏一处的症状是"那只 Boss 某一档偏软/偏硬"，
 * **不报错**。
 *
 * ## 本文件最要紧的一组断言：数值一个都没动
 *
 * 把算术换成查表，唯一说得过去的证据是**三档的值与原公式逐格相等**。
 * 所以下面 `数值与原公式逐格相等` 那一组把旧公式**写在用例里**（`12 + p * 4` 之类），
 * 再拿表去比 —— 不是抄一遍表的数，那样只能证明"表没变"，证明不了"行为没变"。
 * 表以后要调数值时，那一组会红，届时**有意识地**改它，而不是让数值悄悄漂移。
 *
 * ## 钩子终于用上了
 *
 * `registerPhaseBehavior` / `getCurrentBehavior` 是切片1 就设计好、却一直没人用的钩子
 * （切片4 如实记过"保留但今天还没人用"）。这一片把它接上：`Boss` 构造时把三档注册成
 * 阶段行为表，各子类的 `update` 读 `this.tuning()`。**"没人用的钩子"与"死代码"的分别，
 * 在这一片兑现了** —— 它确实等到了自己的位置。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BOSS_PHASE_TUNING, DEFAULT_PHASE_TUNING, phaseTuningFor,
} from '../src/content/bossPhases.js';
import { BOSS_IDS } from '../src/content/bossRoster.js';
import { CONTENT_TABLES, checkContent, checkBossPhaseTuning } from '../src/content/registry.js';
import { BossStateMachine } from '../src/combat/BossStateMachine.js';

const SRC = join(process.cwd(), 'src');
const BOSS_FILES = ['Boss.js', 'MagicBoss.js', 'SpaceBoss.js', 'VoidBoss.js', 'ChaosBoss.js'];
const read = (f) => readFileSync(join(SRC, 'combat', f), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('数值与原公式逐格相等（这一片唯一说得过去的"行为没变"证据）', () => {
  it('收招间隔：基类原式 `phase >= 3 ? 0.9 : phase >= 2 ? 1.2 : 1.6`', () => {
    const 原式 = (p) => (p >= 3 ? 0.9 : p >= 2 ? 1.2 : 1.6);
    for (const id of BOSS_IDS) {
      for (const p of [1, 2, 3]) {
        expect(BOSS_PHASE_TUNING[id][p].attackCooldown, `${id} 第 ${p} 阶段`).toBe(原式(p));
      }
    }
  });

  it('奥术师：原式 `12 + p * 4`（伤害）与 `10 + p * 2`（速度）、`p >= 3 ? 1.2 : 2.0`（冷却）', () => {
    const t = BOSS_PHASE_TUNING.archmagus;
    for (const p of [1, 2, 3]) {
      expect(t[p].volleyDamage, `伤害 第 ${p} 阶段`).toBe(12 + p * 4);
      expect(t[p].volleySpeed, `速度 第 ${p} 阶段`).toBe(10 + p * 2);
      expect(t[p].volleyCooldown, `冷却 第 ${p} 阶段`).toBe(p >= 3 ? 1.2 : 2.0);
      expect(t[p].canVolley, `放不放 第 ${p} 阶段`).toBe(p >= 2);
    }
  });

  it('引力化身：转盘原式 `1 + p * 0.5`；拉人 `p >= 2` 且冷却 3.5 / 冲量 6；弹幕 `p >= 3` 且冷却 0.8', () => {
    const t = BOSS_PHASE_TUNING['singularity-herald'];
    for (const p of [1, 2, 3]) {
      expect(t[p].diskSpin, `转盘 第 ${p} 阶段`).toBe(1 + p * 0.5);
      expect(t[p].canPull, `拉人 第 ${p} 阶段`).toBe(p >= 2);
      expect(t[p].pullCooldown).toBe(3.5);
      expect(t[p].pullImpulse).toBe(6);
      expect(t[p].canVolley, `弹幕 第 ${p} 阶段`).toBe(p >= 3);
      expect(t[p].volleyCooldown).toBe(0.8);
    }
  });

  it('时线执政官：停时 `p >= 2`，冷却 4 / 时长 1.8 / 距离 22', () => {
    const t = BOSS_PHASE_TUNING['void-chronarch'];
    for (const p of [1, 2, 3]) {
      expect(t[p].canTimeStop, `停时 第 ${p} 阶段`).toBe(p >= 2);
      expect(t[p].timeStopCooldown).toBe(4);
      expect(t[p].timeStopDuration).toBe(1.8);
      expect(t[p].timeStopRange).toBe(22);
    }
  });

  it('混沌领主：脉冲 `p >= 2`，间隔 2.5 / 伤害 12 / 半径 9', () => {
    const t = BOSS_PHASE_TUNING['chaos-overlord'];
    for (const p of [1, 2, 3]) {
      expect(t[p].canPulse, `脉冲 第 ${p} 阶段`).toBe(p >= 2);
      expect(t[p].pulseInterval).toBe(2.5);
      expect(t[p].pulseDamage).toBe(12);
      expect(t[p].pulseRange).toBe(9);
    }
  });

  it('五只世界 Boss 一只不少、一只不多', () => {
    expect(Object.keys(BOSS_PHASE_TUNING).sort()).toEqual([...BOSS_IDS].sort());
  });
});

describe('`phaseTuningFor`：永远给得出一张表', () => {
  it('登记的 id 给登记的那一档', () => {
    expect(phaseTuningFor('archmagus', 2)).toBe(BOSS_PHASE_TUNING.archmagus[2]);
    expect(phaseTuningFor('archmagus', 3).volleyDamage).toBe(24);
  });

  it('未登记的 id（副本 Boss / 野生 Boss）走缺省档，而不是 `undefined`', () => {
    expect(phaseTuningFor('dungeon-ruin-crypt', 2)).toBe(DEFAULT_PHASE_TUNING[2]);
    expect(phaseTuningFor('野生-没登记', 3)).toBe(DEFAULT_PHASE_TUNING[3]);
    // 关键：**任何** id 任何阶段都读得到 `attackCooldown`
    for (const id of ['dungeon-x', null, undefined, '']) {
      for (const p of [1, 2, 3]) {
        expect(typeof phaseTuningFor(id, p).attackCooldown, `${id} 第 ${p} 阶段`).toBe('number');
      }
    }
  });

  it('阶段越界（0 / 4 / NaN）不炸，落回一阶段那张', () => {
    expect(phaseTuningFor('archmagus', 0)).toBe(DEFAULT_PHASE_TUNING[1]);
    expect(phaseTuningFor('archmagus', 4)).toBe(DEFAULT_PHASE_TUNING[1]);
    expect(phaseTuningFor('archmagus', NaN)).toBe(DEFAULT_PHASE_TUNING[1]);
  });
});

describe('注册表的整表规则：好表过、坏表红', () => {
  const entry = CONTENT_TABLES.find((t) => t.kind === 'bossPhaseTuning');
  const checkWith = (mutate) => checkBossPhaseTuning(mutate(structuredClone(BOSS_PHASE_TUNING)));

  it('出厂表零错误（`registry.js` 加载期已经断言过一次）', () => {
    expect(entry).toBeTruthy();
    expect(checkContent()).toEqual([]);
  });

  it('少一只 Boss：红（它会悄悄走兜底，与"设计过"看不出区别）', () => {
    expect(checkWith((t) => { delete t.archmagus; return t; }).join('\n')).toMatch(/archmagus/);
  });

  it('多一只 Boss：红（打错 id 的话它其实在用兜底）', () => {
    expect(checkWith((t) => { t['archmagus-typo'] = t.archmagus; return t; }).join('\n')).toMatch(/archmagus-typo/);
  });

  it('缺一档：红', () => {
    expect(checkWith((t) => { delete t.archmagus[3]; return t; }).join('\n')).toMatch(/缺这一档/);
  });

  it('收招间隔改反（阶段越高越慢）：红', () => {
    const errs = checkWith((t) => { t.archmagus[3].attackCooldown = 5; return t; });
    expect(errs.join('\n')).toMatch(/阶段越高越慢/);
  });

  it('`canXxx` 写成非布尔：红', () => {
    expect(checkWith((t) => { t.archmagus[2].canVolley = 1; return t; }).join('\n')).toMatch(/开关要是布尔/);
  });

  it('收招间隔写成 0 或负数：红（等于没有收招）', () => {
    expect(checkWith((t) => { t.archmagus[1].attackCooldown = 0; return t; }).join('\n')).toMatch(/要是正数/);
  });
});

describe('接线：各 Boss 读表，不再按 `this.phase` 现算', () => {
  it('五份 `update` 里都没有 `this.phase >=` / `this.phase *` 了', () => {
    const offenders = [];
    for (const f of BOSS_FILES) {
      const code = stripComments(read(f));
      // 点名放行一处：`this.phase < e.phase` 比的是**场地脚本自己的 `phase` 字段**
      // （`content/arenaScripts.js` 里每条招式都带 `phase`），那是另一张表、本来就数据驱动，
      // 不属于本片的目标。所以先把它摘掉再判，而不是把正则放宽到"看不见它"。
      const 摘掉场地脚本那两处 = code.replace(/this\.phase\s*<\s*e\.phase/g, '');
      const m = 摘掉场地脚本那两处.match(/this\.phase\s*(>=|<|\*)/g);
      if (m) offenders.push(`${f}: ${m.join(' ')}`);
    }
    expect(offenders, `这些地方还在按 phase 现算：${offenders.join('; ')}`).toEqual([]);
  });

  it('场地脚本那一处的确被放行了（且只放行这一种形状）', () => {
    const code = stripComments(read('Boss.js'));
    expect(code, '`e.phase` 那种比较应当还在 —— 它没被本片动过').toMatch(/this\.phase < e\.phase/);
    // 放行是**按形状**的：`this.phase < 9` 这种硬编数字仍然要被咬住
    const 假 = stripComments('if (this.phase < 9) return;');
    expect(假.replace(/this\.phase\s*<\s*e\.phase/g, '').match(/this\.phase\s*(>=|<|\*)/g)).toEqual(['this.phase <']);
  });

  it('`Boss.js` 把三档注册成了阶段行为表，并给了 `tuning()` 取值口', () => {
    const code = stripComments(read('Boss.js'));
    expect(code).toMatch(/registerPhaseBehavior\(phase, phaseTuningFor\(this\.bossId, phase\)\)/);
    // 按**给定阶段**取（`behaviorFor(this.phase)`），不是 `getCurrentBehavior()`：
    // 后者按状态机自己的 `phase` 取，而场地脚本读的是 `this.phase` —— 两个读者读两个字段，
    // 正常路径下相等、有人直接改 `this.phase` 时分叉。这一片的做法是"所有读者读同一个字段"。
    expect(code).toMatch(/tuning\(\)\s*\{[\s\S]*?behaviorFor\(this\.phase\)/);
    expect(code).not.toMatch(/tuning\(\)\s*\{[\s\S]*?getCurrentBehavior\(\)/);
  });

  it('状态机给了 `behaviorFor(phase)`（按给定阶段取），且它确实按参数取而不是忽略参数', () => {
    const sm = new BossStateMachine({ bossId: 'x', name: 'x', hp: 1, maxHp: 1 });
    sm.registerPhaseBehavior(2, { tag: 'two' });
    sm.registerPhaseBehavior(3, { tag: 'three' });
    expect(sm.behaviorFor(2)).toEqual({ tag: 'two' });
    expect(sm.behaviorFor(3)).toEqual({ tag: 'three' });
    expect(sm.behaviorFor(1)).toBeUndefined();
    // 与"当前阶段"解耦：状态机还在 1，但按 3 取得到 3 那张
    expect(sm.phase).toBe(1);
    expect(sm.getCurrentBehavior()).toBeUndefined();
  });

  it('四个子类都从 `this.tuning()` 取数', () => {
    for (const f of ['MagicBoss.js', 'SpaceBoss.js', 'VoidBoss.js', 'ChaosBoss.js']) {
      expect(stripComments(read(f)), `${f} 没读阶段表`).toMatch(/this\.tuning\(\)/);
    }
  });

  it('门禁自证：正则确实能咬住旧写法（否则上面那条是白过的）', () => {
    expect(stripComments('if (this.phase >= 2) {}').match(/this\.phase\s*(>=|<|\*)/g)).toEqual(['this.phase >=']);
    expect(stripComments('x = 12 + this.phase * 4;').match(/this\.phase\s*(>=|<|\*)/g)).toEqual(['this.phase *']);
    // 注释里提到旧写法不算（本片在 `MagicBoss` 留了一句说明）
    expect(stripComments('// 不再现算 12 + this.phase * 4 那种算术').match(/this\.phase\s*(>=|<|\*)/g)).toBe(null);
  });
});
