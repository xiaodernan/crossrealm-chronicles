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
 * 两枚变异探针走真代码路径（grep 确认落盘、预言命中、原字节还原）。
 */
import { describe, it, expect } from 'vitest';
import { SquadController } from '../src/ai/Squad.js';

const enemy = (isBoss = false) => ({ isBoss });

describe('SquadController 守卫与 Boss 例外', () => {
  it('claim(null/undefined) → false（守卫）', () => {
    const s = new SquadController(2, 1.0);
    expect(s.claim(null)).toBe(false);
    expect(s.claim(undefined)).toBe(false);
  });

  it('Boss 不占名额：满额时仍能 claim、不计入 busy、无租约', () => {
    const s = new SquadController(1, 1.0);
    expect(s.claim(enemy())).toBe(true);      // 占满 1 个
    const boss = enemy(true);
    expect(s.claim(boss)).toBe(true);         // Boss 仍能抢
    expect(s.busy).toBe(1);                   // Boss 不计入
    expect(s.holds(boss)).toBe(false);        // Boss 无租约
  });

  it('release(boss) 是空操作（不抛、不动名额）', () => {
    const s = new SquadController(2, 1.0);
    const boss = enemy(true);
    s.claim(boss);
    expect(() => s.release(boss)).not.toThrow();
    expect(s.busy).toBe(0);
  });
});

describe('SquadController 名额流转', () => {
  it('满额后普通敌人 claim 失败；release 后空位可被抢', () => {
    const s = new SquadController(1, 1.0);
    const a = enemy();
    const b = enemy();
    expect(s.claim(a)).toBe(true);
    expect(s.claim(b)).toBe(false);   // 满
    expect(s.busy).toBe(1);
    s.release(a);
    expect(s.holds(a)).toBe(false);
    expect(s.busy).toBe(0);
    expect(s.claim(b)).toBe(true);    // 空位可抢
  });

  it('重复 claim 同一敌人是续期，不重复占位', () => {
    const s = new SquadController(2, 1.0);
    const a = enemy();
    expect(s.claim(a)).toBe(true);
    expect(s.claim(a)).toBe(true);
    expect(s.busy).toBe(1);           // 仍 1 个
  });

  it('tick 边界：剩 0 也回收（left<=0），剩正数不回收', () => {
    const s = new SquadController(1, 1.0);
    const a = enemy();
    s.claim(a);                       // ttl=1.0
    expect(s.tick(0.25)).toBe(0);     // left=0.75 > 0
    expect(s.holds(a)).toBe(true);
    expect(s.tick(0.75)).toBe(1);     // left=0 → 回收
    expect(s.holds(a)).toBe(false);
  });

  it('clear 清空所有租约', () => {
    const s = new SquadController(3, 1.0);
    s.claim(enemy());
    s.claim(enemy());
    expect(s.busy).toBe(2);
    s.clear();
    expect(s.busy).toBe(0);
  });
});
