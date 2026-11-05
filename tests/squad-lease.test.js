/**
 * 围攻名额租约门禁 —— 钉 `ai/Squad.js` 的 `SquadController`（B 系"围攻名额"）。
 *
 * `tests/enemy-ai.test.js` 已覆盖主流程（claim 占满 / tick 到期回收 / 续期），
 * 但几处**不变量**没人钉：
 * - **Boss 不占名额**：`claim(boss)` 永远成功、不计入 `busy`、`holds` 为 false；
 *   `release(boss)` 是空操作。写丢这条 → Boss 被小怪的围攻上限挡住（"主角被自己随从卡住"）。
 * - `release` 真的释放空位；`holds`/`busy` 如实反映；`clear` 清空。
 * - `claim(null)` 守卫；重复 claim 是续期不重复占位；tick 的 `left <= 0` 边界（剩 0 也回收）。
 *
 * 切片9 起的契约：**资格来自名单，不来自容量**。`claim` 只给坐在坑上的那只盖章，
 * 所以每一格都得先 `note(..., true)` 报名 —— 直接 claim 一只陌生人现在读的是"没轮到"，
 * 不再是"账本还没满"。这两件事以前是同一格，#45 的振荡就来自它被邻居每帧改。
 *
 * 两枚变异探针走真代码路径（grep 确认落盘、预言命中、原字节还原）。
 */
import { describe, it, expect } from 'vitest';
import { SquadController } from '../src/ai/Squad.js';

const enemy = (isBoss = false) => ({ isBoss });
/** 报名并等到它有座：新契约下这是 claim 的前置，不是可选的铺垫 */
const 上场 = (s, e) => { s.note(e, true); return e; };

describe('SquadController 守卫与 Boss 例外', () => {
  it('claim(null/undefined) → false（守卫）', () => {
    const s = new SquadController(2, 1.0);
    expect(s.claim(null)).toBe(false);
    expect(s.claim(undefined)).toBe(false);
  });

  it('Boss 不占名额：满额时仍能 claim、不计入 busy、无租约', () => {
    const s = new SquadController(1, 1.0);
    expect(s.claim(上场(s, enemy()))).toBe(true);   // 小怪占满 1 个坑
    const boss = enemy(true);
    expect(s.roomFor(boss), '满额也挡不住 Boss：围攻上限是给小怪讲理用的').toBe(true);
    expect(s.claim(boss)).toBe(true);               // Boss 仍能出手
    expect(s.busy).toBe(1);                         // Boss 不计入
    expect(s.holds(boss)).toBe(false);              // Boss 无租约
    expect(s.seated, 'Boss 不许把自己排进轮转里').toBe(1);
  });

  it('release(boss) 是空操作（不抛、不动名额）', () => {
    const s = new SquadController(2, 1.0);
    const boss = enemy(true);
    const a = 上场(s, enemy());
    s.claim(boss);
    expect(() => s.release(boss)).not.toThrow();
    expect(s.busy).toBe(0);
    s.drop(boss);
    expect([s.roomFor(a), s.line.length], 'Boss 死亡/移除不该动小怪的名单与坑')
      .toEqual([true, 1]);
  });
});

describe('SquadController 名额流转', () => {
  it('满额后普通敌人 claim 失败；release 后空位让给排队的下一位', () => {
    const s = new SquadController(1, 1.0);
    const a = 上场(s, enemy());
    const b = 上场(s, enemy());
    expect(s.roomFor(b), '坑被 a 坐着：b 只能排队').toBe(false);
    expect(s.claim(a)).toBe(true);
    expect(s.claim(b)).toBe(false);   // 没座 = 没资格
    expect(s.busy).toBe(1);
    s.release(a);
    expect(s.holds(a)).toBe(false);
    expect(s.busy).toBe(0);
    expect(s.roomFor(b), '让位当场补坑，不等下一次 tick').toBe(true);
    expect(s.claim(b)).toBe(true);    // 轮转把它送到了座上
  });

  it('重复 claim 同一敌人是续期，不重复占位', () => {
    const s = new SquadController(2, 1.0);
    const a = 上场(s, enemy());
    expect(s.claim(a)).toBe(true);
    expect(s.claim(a)).toBe(true);
    expect(s.busy).toBe(1);           // 仍 1 个
    expect(s.seated).toBe(1);         // 续期不许多开一个座
  });

  it('tick 边界：剩 0 也回收（left<=0），剩正数不回收', () => {
    const s = new SquadController(1, 1.0);
    const a = 上场(s, enemy());
    s.claim(a);                       // ttl=1.0
    expect(s.tick(0.25)).toBe(0);     // left=0.75 > 0
    expect(s.holds(a)).toBe(true);
    expect(s.tick(0.75)).toBe(1);     // left=0 → 回收
    expect(s.holds(a)).toBe(false);
  });

  it('clear 清空名单、坑与租约', () => {
    const s = new SquadController(3, 1.0);
    s.claim(上场(s, enemy()));
    s.claim(上场(s, enemy()));
    expect(s.busy).toBe(2);
    s.clear();
    expect(s.busy).toBe(0);
    expect(s.seated).toBe(0);
    expect(s.line.length).toBe(0);
  });
});
