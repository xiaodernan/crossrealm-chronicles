/**
 * 越肩换边（W-A5 切片4）—— 纯算式语义 + 接线存在性
 * —— 把"什么时候换手、换多快"收进 `src/player/shoulderSide.js` 一条函数里，
 *    这里钉它的两个保护（迟滞、按秒逼近）和接线（不改它这套行为，就永远只是舒服决定）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { nextShoulderSide, dampShoulderSide, SHOULDER_SIDE_HYSTERESIS, SHOULDER_SIDE_LAMBDA } from '../src/player/shoulderSide.js';

const ROOT = process.cwd();
const PlayerController = readFileSync(join(ROOT, 'src/player/PlayerController.js'), 'utf8');

describe('nextShoulderSide（迟滞）', () => {
  it('侧向超过迟滞 ⇒ 新边 = -sign(lateral)（目标在右 ⇒ 左肩）', () => {
    expect(nextShoulderSide(1, 2.0)).toBe(-1);
    expect(nextShoulderSide(-1, -2.0)).toBe(1);
    expect(nextShoulderSide(1, -2.0)).toBe(1);
    expect(nextShoulderSide(-1, 2.0)).toBe(-1);
  });
  it('侧向在迟滞内 ⇒ 保持原边（贴身横移不翻边）', () => {
    expect(nextShoulderSide(1, SHOULDER_SIDE_HYSTERESIS)).toBe(1);
    expect(nextShoulderSide(-1, -SHOULDER_SIDE_HYSTERESIS)).toBe(-1);
    expect(nextShoulderSide(-1, 0.2)).toBe(-1);
    expect(nextShoulderSide(1, -0.2)).toBe(1);
  });
  it('非有限数 ⇒ 保持原边（不幻觉一个侧向）', () => {
    expect(nextShoulderSide(1, NaN)).toBe(1);
    expect(nextShoulderSide(-1, Infinity)).toBe(-1);
  });
  it('恰好边界：> 迟滞才翻，== 迟滞不翻', () => {
    expect(nextShoulderSide(1, SHOULDER_SIDE_HYSTERESIS + 1e-9)).toBe(-1);
    expect(nextShoulderSide(1, SHOULDER_SIDE_HYSTERESIS)).toBe(1);
  });
});

describe('dampShoulderSide（按秒逼近）', () => {
  it('dt=0 ⇒ 完全不动；dt 很大 ⇒ 一步落到目标', () => {
    expect(dampShoulderSide(1, -1, 0)).toBe(1);
    expect(dampShoulderSide(1, -1, 10)).toBe(-1);
  });
  it('单调逼近且从不越过目标', () => {
    let cur = 1;
    for (let i = 0; i < 40; i++) cur = dampShoulderSide(cur, -1, 1 / 60);
    expect(cur).toBeLessThan(1);
    expect(cur).toBeGreaterThanOrEqual(-1);
  });
  it('current 非有限（首次落点 / undefined）⇒ 直接落到 target', () => {
    expect(dampShoulderSide(undefined, -1, 1 / 60)).toBe(-1);
    expect(dampShoulderSide(NaN, 1, 0.5)).toBe(1);
  });
  it('k 被 clamp 到 [0, min(1, dt*λ)]：dt 负数按 0 处理（不倒着走）', () => {
    expect(dampShoulderSide(0, 1, -5)).toBe(0);
  });
  it('SHOULDER_SIDE_LAMBDA 大于 0 且迟滞大于 0（参数自证）', () => {
    expect(SHOULDER_SIDE_LAMBDA).toBeGreaterThan(0);
    expect(SHOULDER_SIDE_HYSTERESIS).toBeGreaterThan(0);
  });
});

describe('PlayerController 接线（真机之前先钉存在性）', () => {
  it('import 纯算式模块', () => {
    expect(PlayerController).toContain('from \'./shoulderSide.js\'');
    expect(PlayerController).toContain('nextShoulderSide');
    expect(PlayerController).toContain('dampShoulderSide');
  });
  it('构造函数初始化 _shoulderSide', () => {
    expect(PlayerController).toContain('this._shoulderSide = 1');
  });
  it('锁定态才走换边分支；非锁定保持 1', () => {
    expect(PlayerController).toContain('if (lockTarget) {');
    expect(PlayerController).toContain('const right = this.getRightXZ(this._camTmpRight);');
    expect(PlayerController).toContain('Number.isFinite(tp.x)');
  });
  it('shoulder = offset × shoulderSide（换边系数真正参与了机位偏移）', () => {
    expect(PlayerController).toContain('this.shoulderOffset : this.shoulderOffset * 0.5) * shoulderSide;');
    expect(PlayerController).toContain('addScaledVector(this.getRightXZ(this._camTmpRight), shoulder);');
  });
  it('松锁归正：else 分支把 _shoulderSide 复位为 1', () => {
    expect(PlayerController).toContain('this._shoulderSide = 1;');
    expect(PlayerController).toContain('this._shoulderSmooth = undefined;');
  });
});
