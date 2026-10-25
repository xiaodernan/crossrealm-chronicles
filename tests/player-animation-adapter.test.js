/**
 * 玩家动画适配器门禁 —— 钉 `player/animation/PlayerAnimationAdapter.js`。
 *
 * 把玩家既有动画系统包装成与敌人适配器兼容的统一接口。此前零直接测试。
 * 三条可回归契约：
 * 1. **视觉根名一致**：玩家与敌人适配器必须用同一个 '__anim'（`console.assert` 只在
 *    开发期提示、不进测试；这里用可观测断言 + validateStructure 双钉）。
 * 2. **`_resolveAction` 名册**：combatState → 动作名。含三条非显然别名
 *    （locomotion→walk / riposte→parry / stagger→hit），写错动作名**不抛异常**，
 *    只会静默播错动画 —— 正是"跑测试发现不了"的一族。
 * 3. 未知/空 combatState 回落 'idle'；`validateStructure` 缺 '__anim' 子节点时告警；
 *    `dispose` 置空 model 后 update 安全早退；注册类方法是兼容占位不抛。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { PlayerAnimationAdapter } from '../src/player/animation/PlayerAnimationAdapter.js';
import { PLAYER_VISUAL_ROOT_NAME } from '../src/player/CharacterModel.js';

function makeModel(overrides = {}) {
  return {
    group: { children: [] },
    modelRoot: {},
    mixer: null,
    combatState: 'idle',
    sprinting: false,
    ...overrides,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('PlayerAnimationAdapter 视觉根名一致性', () => {
  it('PLAYER_VISUAL_ROOT_NAME 恒为 __anim（玩家/敌人适配器共用）', () => {
    expect(PLAYER_VISUAL_ROOT_NAME).toBe('__anim');
  });
});

describe('PlayerAnimationAdapter._resolveAction 名册', () => {
  const adapter = new PlayerAnimationAdapter(makeModel());

  it('恒等映射', () => {
    const same = {
      idle: 'idle', walk: 'walk', run: 'run',
      combo1: 'attack1', combo2: 'attack2', combo3: 'attack3',
      heavy: 'heavy', dodge: 'dodge', hit: 'hit', block: 'block',
      parry: 'parry', skill: 'skill', dead: 'death',
    };
    for (const [state, action] of Object.entries(same)) {
      expect(adapter._resolveAction(state)).toBe(action);
    }
  });

  it('别名映射：locomotion→walk / riposte→parry / stagger→hit', () => {
    expect(adapter._resolveAction('locomotion')).toBe('walk');
    expect(adapter._resolveAction('riposte')).toBe('parry');
    expect(adapter._resolveAction('stagger')).toBe('hit');
  });

  it('未知 combatState 回落 idle', () => {
    expect(adapter._resolveAction('nonexistent_state')).toBe('idle');
  });

  it('null / undefined 回落 idle', () => {
    expect(adapter._resolveAction(null)).toBe('idle');
    expect(adapter._resolveAction(undefined)).toBe('idle');
  });
});

describe('PlayerAnimationAdapter.validateStructure', () => {
  it('__anim 子节点在 → 不告警', () => {
    const anim = { name: PLAYER_VISUAL_ROOT_NAME };
    const adapter = new PlayerAnimationAdapter(makeModel({ group: { children: [anim] } }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    adapter.validateStructure();
    expect(warn).not.toHaveBeenCalled();
  });

  it('__anim 子节点缺失 → 告警', () => {
    const adapter = new PlayerAnimationAdapter(makeModel({ group: { children: [{ name: 'other' }] } }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    adapter.validateStructure();
    expect(warn).toHaveBeenCalled();
  });
});

describe('PlayerAnimationAdapter 生命周期与占位', () => {
  it('dispose 置空 model，之后 update 安全早退不抛', () => {
    const adapter = new PlayerAnimationAdapter(makeModel());
    adapter.dispose();
    expect(adapter.model).toBeNull();
    expect(() => adapter.update(0.016)).not.toThrow();
  });

  it('无 mixer 时 syncFromEntity 早退不抛', () => {
    const adapter = new PlayerAnimationAdapter(makeModel({ mixer: null }));
    expect(() => adapter.syncFromEntity()).not.toThrow();
  });

  it('registerStates / registerProceduralClips 是兼容占位，不抛', () => {
    const adapter = new PlayerAnimationAdapter(makeModel());
    expect(() => adapter.registerStates()).not.toThrow();
    expect(() => adapter.registerProceduralClips()).not.toThrow();
  });
});
