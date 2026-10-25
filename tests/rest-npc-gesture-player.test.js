/**
 * 营火 NPC 手势播放门禁 —— 钉 `world/RestNpcGesturePlayer.js`。
 *
 * Mixamo Clip 手势播放层，被营火 NPC 对话/问候/休息选择驱动，此前零直接测试。
 * 三条可回归契约：
 * 1. **`_pickClip` 选取启发**：无 def → null；无匹配 → null；精确名优先；否则
 *    大小写不敏感子串兜底，但**仅当 clipName 长度 > 3**（短名如 'sit' 不做子串匹配，
 *    否则 'sit' 会误中 'Sitting_xxx' 以外的任意含 sit 的键）。
 * 2. **`playGesture`**：无动作或无 mixer → false；一次性手势 timer=duration、
 *    循环手势 timer=9999；按 loop 置 clampWhenFinished；记录 currentGesture。
 * 3. **`update` 计时状态机**：无手势/循环手势（timer>9000）不推进；一次性手势
 *    timer 归零 → 触发 onDone（仅一次）+ returnToIdle。
 *
 * 用可链式 mock action + 最小 model stub 驱动，不引入真 THREE mixer。
 * 两枚变异探针走真代码路径，grep 确认落盘、预言命中、原字节还原。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RestNpcGesturePlayer } from '../src/world/RestNpcGesturePlayer.js';

function makeAction(name) {
  return {
    name,
    clampWhenFinished: false,
    reset() { return this; },
    setLoop() { return this; },
    fadeIn() { return this; },
    fadeOut() { return this; },
    play() { this.playing = true; return this; },
  };
}

function makeModel(overrides = {}) {
  return {
    mixer: {},
    actions: {},
    currentAction: null,
    _pickAnim: null,
    config: {},
    ...overrides,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('RestNpcGesturePlayer._pickClip 选取启发', () => {
  it('未知手势（无 def）→ null', () => {
    const p = new RestNpcGesturePlayer(makeModel({ actions: { wave: makeAction('wave') } }));
    expect(p._pickClip('nope')).toBeNull();
  });

  it('有 def 但无匹配动作 → null', () => {
    const p = new RestNpcGesturePlayer(makeModel({ actions: {} }));
    expect(p._pickClip('wave')).toBeNull();
  });

  it('精确名优先', () => {
    const w = makeAction('wave');
    const p = new RestNpcGesturePlayer(makeModel({ actions: { wave: w, Waving: makeAction('Waving') } }));
    expect(p._pickClip('wave')).toBe(w);
  });

  it('大小写不敏感子串兜底', () => {
    const a = makeAction('Character_Wave_Gesture');
    const p = new RestNpcGesturePlayer(makeModel({ actions: { Character_Wave_Gesture: a } }));
    expect(p._pickClip('wave')).toBe(a);
  });

  it('短名（<=3）不做子串匹配（length>3 守卫）', () => {
    // 'sit' 长度 3，即便 'sit_idle_pose' 含 'sit' 也不命中；其余 sit clipName 均不匹配
    const a = makeAction('sit_idle_pose');
    const p = new RestNpcGesturePlayer(makeModel({ actions: { sit_idle_pose: a } }));
    expect(p._pickClip('sit')).toBeNull();
  });
});

describe('RestNpcGesturePlayer.playGesture', () => {
  it('无匹配动作 → false', () => {
    const p = new RestNpcGesturePlayer(makeModel({ actions: {} }));
    expect(p.playGesture('wave')).toBe(false);
  });

  it('无 mixer → false', () => {
    const p = new RestNpcGesturePlayer(makeModel({ actions: { wave: makeAction('wave') }, mixer: null }));
    expect(p.playGesture('wave')).toBe(false);
  });

  it('一次性手势：timer=duration，clampWhenFinished=true，记录 currentGesture', () => {
    const p = new RestNpcGesturePlayer(makeModel({ actions: { wave: makeAction('wave') } }));
    expect(p.playGesture('wave', () => {})).toBe(true);
    expect(p.currentGesture).toBe('wave');
    expect(p.gestureTimer).toBe(1.8); // wave.duration
    expect(p.model.currentAction.clampWhenFinished).toBe(true); // loop=false
  });

  it('循环手势：timer=9999，clampWhenFinished=false', () => {
    const p = new RestNpcGesturePlayer(makeModel({ actions: { sit: makeAction('sit') } }));
    expect(p.playGesture('sit', () => {})).toBe(true);
    expect(p.currentGesture).toBe('sit');
    expect(p.gestureTimer).toBe(9999); // loop=true → 9999（不用 manifest 的 999）
    expect(p.model.currentAction.clampWhenFinished).toBe(false);
  });
});

describe('RestNpcGesturePlayer.update 计时状态机', () => {
  it('无当前手势 → 不推进不触发', () => {
    const p = new RestNpcGesturePlayer(makeModel());
    const onDone = vi.fn();
    p._onDone = onDone;
    p.update(1);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('一次性手势未到时 → 不触发 onDone', () => {
    const p = new RestNpcGesturePlayer(makeModel({ actions: { wave: makeAction('wave') } }));
    const onDone = vi.fn();
    p.playGesture('wave', onDone);
    p.update(1.0); // < 1.8
    expect(onDone).not.toHaveBeenCalled();
    expect(p.currentGesture).toBe('wave');
  });

  it('一次性手势到时 → 触发 onDone 一次并 returnToIdle', () => {
    const p = new RestNpcGesturePlayer(makeModel({ actions: { wave: makeAction('wave') } }));
    const onDone = vi.fn();
    p.playGesture('wave', onDone);
    p.update(2.0); // > 1.8
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(p.currentGesture).toBeNull(); // returnToIdle 清空
    // onDone 不重复触发
    p.update(2.0);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('循环手势永不自动到时（timer>9000 守卫，巨大 dt 也不触发）', () => {
    const p = new RestNpcGesturePlayer(makeModel({ actions: { sit: makeAction('sit') } }));
    const onDone = vi.fn();
    p.playGesture('sit', onDone);
    p.update(20000); // 远超 9999
    expect(onDone).not.toHaveBeenCalled();
    expect(p.currentGesture).toBe('sit');
  });
});
