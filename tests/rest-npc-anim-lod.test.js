/**
 * 营火 NPC 动画距离降频（W-E3 切片65）
 *
 * 森林站 240 帧的分系统计时：8 名 NPC 的 `model.update()` 合计 0.679ms/帧，而其中 7 名
 * 在 160~407 米外 —— GLB 混合器仍在 60Hz 跑。`npcAnimStep` 把"这一步跑不跑"抽成纯函数：
 * 近处（< 40m）/ 对话中全速；远处 5Hz，并把这 0.2s 原样递给混合器（动画时间不漏）。
 *
 * 用例分两层：① 判据（近 / 远 / 对话 / 非有限距离 / 累计与清零）；② 接线（update 循环里
 * `model.update` 只走闸门，且旧的每帧裸调已不存在）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  npcAnimStep, NPC_ANIM_NEAR_M, NPC_ANIM_FAR_STEP_S,
} from '../src/world/RestNpcManager.js';

describe('营火 NPC 动画距离降频（W-E3 切片65）', () => {
  it('近处全速：每帧都跑，dt 原样递进去', () => {
    for (const distance of [0, 1, NPC_ANIM_NEAR_M - 0.01]) {
      const 步 = npcAnimStep({ distance, acc: 0.11, dt: 1 / 60 });
      expect(步.跑).toBe(true);
      expect(步.步).toBeCloseTo(1 / 60, 12);
      expect(步.acc).toBe(0);
    }
  });

  it('远处不足一步不跑，累计到 0.2 秒才跑且把整段 dt 交出去', () => {
    let acc = 0;
    const 各步 = [];
    for (let i = 0; i < 4; i++) {
      const 步 = npcAnimStep({ distance: 400, acc, dt: 0.05 });
      各步.push(步.跑);
      acc = 步.acc;
      if (步.跑) expect(步.步).toBeCloseTo(0.2, 12);
    }
    expect(各步).toEqual([false, false, false, true]);
    expect(acc).toBe(0);
  });

  it('对话中 / 正在说话：无论多远都全速（嘴型与手势不能卡）', () => {
    const 对话 = npcAnimStep({ distance: 400, dialogue: true, acc: 0.15, dt: 0.016 });
    expect(对话.跑).toBe(true);
    expect(对话.步).toBeCloseTo(0.016, 12);
    const 说话 = npcAnimStep({ distance: 400, speaking: true, acc: 0.15, dt: 0.016 });
    expect(说话.跑).toBe(true);
  });

  it('非有限距离按近处处理：量不到就保守地继续跑，不冻结', () => {
    const 步 = npcAnimStep({ distance: Number.NaN, acc: 0, dt: 1 / 60 });
    expect(步.跑).toBe(true);
    expect(步.步).toBeCloseTo(1 / 60, 12);
  });

  it('一整秒 60 帧：远处每名 NPC 只跑 5 次（5Hz），近处跑 60 次', () => {
    const 计 = (distance) => {
      let acc = 0; let n = 0;
      for (let i = 0; i < 60; i++) {
        const 步 = npcAnimStep({ distance, acc, dt: 1 / 60 });
        acc = 步.acc;
        if (步.跑) n++;
      }
      return n;
    };
    expect(计(400)).toBe(5);
    expect(计(5)).toBe(60);
    expect(NPC_ANIM_FAR_STEP_S).toBeCloseTo(0.2, 12);
  });

  it('接线：update 循环里 model.update 只走闸门，裸调不再存在', () => {
    const 源 = readFileSync('src/world/RestNpcManager.js', 'utf8');
    expect(源).toContain('if (步.跑) n.model?.update(步.步);');
    expect(源.split('n.model?.update(dt)').length - 1).toBe(0);
    expect(源.split('npcAnimStep(').length - 1).toBeGreaterThanOrEqual(2); // 定义 + 调用
  });
});
