import { describe, it, expect } from 'vitest';
import { TimeController } from '../src/engine/Time.js';
import { StateMachine } from '../src/engine/StateMachine.js';

describe('TimeController', () => {
  it('钳制超大步长（切标签页回来不炸）', () => {
    const t = new TimeController();
    expect(t.tick(5.5, 0)).toBeLessThanOrEqual(0.05);
  });

  it('hitstop 期间缩放时间，到期自动恢复', () => {
    const t = new TimeController();
    t.hitstop(0.1, 0.1, 0);
    const dt = t.tick(0.016, 0.02);
    expect(dt).toBeCloseTo(0.0016, 4);
    expect(t.timeScale).toBeCloseTo(0.1, 5);
    expect(t.tick(0.016, 0.5)).toBeCloseTo(0.016, 5);
  });

  it('hitstop 不会把已更长的停顿缩短', () => {
    const t = new TimeController();
    t.hitstop(0.2, 0.05, 0);
    t.hitstop(0.05, 0.5, 0);
    expect(t.tick(0.016, 0.06)).toBeGreaterThan(0);
    expect(t.timeScale).toBeLessThanOrEqual(0.05);
  });

  it('固定步长累加器有上限（防死亡螺旋）', () => {
    const t = new TimeController({ maxDelta: 1 });
    t.tick(1, 0);
    expect(t.fixedSteps()).toBe(8);
  });
});

describe('StateMachine', () => {
  const build = () => {
    const log = [];
    const owner = { hp: 10, stamina: 5 };
    const sm = new StateMachine(owner, {
      idle: {
        enter: () => log.push('idle+'),
        exit: () => log.push('idle-'),
        update: (o, s, dt) => log.push(`idle:${dt}`),
      },
      attack: {
        canEnter: (o) => o.stamina > 1,
        enter: (o, s, payload) => log.push(`attack>${payload ?? ''}`),
      },
    }, 'idle');
    return { log, owner, sm };
  };

  it('进入初始状态并按时序 update', () => {
    const { log, sm } = build();
    sm.update(0.016);
    expect(log).toEqual(['idle+', 'idle:0.016']);
    expect(sm.time).toBeCloseTo(0.016, 5);
  });

  it('canEnter 为假时拒绝转换', () => {
    const { owner, sm, log } = build();
    owner.stamina = 0;
    expect(sm.change('attack')).toBe(false);
    expect(sm.current).toBe('idle');
    expect(log).toEqual(['idle+']);
  });

  it('转换时先 exit 旧状态再 enter 新状态，并带 payload', () => {
    const { sm, log } = build();
    expect(sm.change('attack', 'heavy')).toBe(true);
    expect(log).toEqual(['idle+', 'idle-', 'attack>heavy']);
    expect(sm.current).toBe('attack');
  });

  it('重复进入同名状态被忽略（不重置计时）', () => {
    const { sm, log } = build();
    sm.update(0.01);
    expect(sm.change('idle')).toBe(false);
    expect(sm.time).toBeCloseTo(0.01, 5);
    expect(log.length).toBe(2);
  });
});
