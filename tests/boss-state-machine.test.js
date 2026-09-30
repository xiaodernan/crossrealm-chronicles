/**
 * Boss 状态机门禁（W-B8 切片2 —— 补切片1 欠下的那条契约）。
 *
 * ## 为什么要有这一片
 *
 * 切片1（`f7d3e4b`）把 `BossStateMachine` 写了出来、也真的接进了 `Boss.js`，
 * 但**一条用例都没有**：全仓 2021 例里没有一例断言过状态转移或阶段切换。
 * 9-30 复核时还发现计划里 W-B8 那两行被退回 ⬜（代码在、文档说没开始），
 * 于是这一片既补门禁、也把"这段代码的实际成色"量清楚。
 *
 * ## 这一片要钉住的三件事
 *
 * 1. **枚举是契约**：`BossState` / `BossPhase` / `PhaseTransitionCondition` 的值被
 *    `toJSON` 写进存档、被事件带出去、被 UI 读。**改一个字符串就是旧档读不出来**，
 *    所以逐格断言而不是"存在就行"。
 * 2. **切换只走一处出口**：`transitionTo` 负责改阶段、调钩子、派事件、重置 phase 台账。
 *    拆成两处写就会留下"改了阶段没派事件"或"派了事件没改阶段"的空间。
 * 3. **`boss-phase` 全仓只有一处派发**：状态机现在是唯一派发口（`Boss.js` 那两处已删）。
 *    多一处派发，每个监听者就会对同一次切换响应两次 —— 而横幅、音效、台词三层都会重复。
 *    这条用静态扫描钉住（运行时断言拦不住"另一个文件里也派一次"）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  BossStateMachine, BossState, BossPhase, PhaseTransitionCondition,
} from '../src/combat/BossStateMachine.js';
import { DungeonBoss } from '../src/combat/DungeonBoss.js';

const SRC = join(process.cwd(), 'src');

/** 只给状态机真正读到的字段；`onPhaseEnter/Leave` 记下来用于断言"钩子被调了" */
function fakeBoss(hp = 100, maxHp = 100) {
  return {
    bossId: 'test-boss',
    name: '测试 Boss',
    hp,
    maxHp,
    calls: { enter: [], leave: [] },
    onPhaseEnter(phase) { this.calls.enter.push(phase); },
    onPhaseLeave(phase) { this.calls.leave.push(phase); },
  };
}

let events = [];

beforeEach(() => {
  events = [];
  globalThis.window = {
    dispatchEvent: (e) => { events.push({ type: e.type, detail: e.detail }); return true; },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
});

afterEach(() => {
  globalThis.window = undefined;
});

describe('枚举：值就是契约（写进存档、带进事件、被 UI 读）', () => {
  it('三张枚举逐格对得上', () => {
    expect(BossState).toEqual({
      IDLE: 'idle', WINDUP: 'windup', STRIKE: 'strike',
      STAGGER: 'stagger', SLAM: 'slam', DEAD: 'dead',
    });
    expect(BossPhase).toEqual({ PHASE_1: 1, PHASE_2: 2, PHASE_3: 3 });
    expect(PhaseTransitionCondition).toEqual({
      HP_THRESHOLD: 'hp_threshold', TIME_ELAPSED: 'time_elapsed', CUSTOM: 'custom',
    });
  });

  it('初值：IDLE + 一阶段，且 prevPhase 同源', () => {
    const sm = new BossStateMachine(fakeBoss());
    expect(sm.state).toBe(BossState.IDLE);
    expect(sm.phase).toBe(BossPhase.PHASE_1);
    expect(sm.prevPhase).toBe(BossPhase.PHASE_1);
  });
});

describe('`transitionTo`：切阶段的唯一出口', () => {
  it('正常切换：改阶段、记 prevPhase、调离开/进入钩子、派一次事件', () => {
    const boss = fakeBoss();
    const sm = new BossStateMachine(boss);
    expect(sm.transitionTo(BossPhase.PHASE_2)).toBe(true);
    expect(sm.phase).toBe(2);
    expect(sm.prevPhase).toBe(1);
    expect(boss.calls.leave).toEqual([1]);
    expect(boss.calls.enter).toEqual([2]);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('boss-phase');
    expect(events[0].detail).toMatchObject({ phase: 2, name: '测试 Boss', bossId: 'test-boss' });
  });

  it('切到同一阶段 / 越界阶段都不动（返回 false 且不留痕迹）', () => {
    const boss = fakeBoss();
    const sm = new BossStateMachine(boss);
    expect(sm.transitionTo(BossPhase.PHASE_1)).toBe(false);   // 已经在 1
    expect(sm.transitionTo(0)).toBe(false);
    expect(sm.transitionTo(4)).toBe(false);
    expect(sm.phase).toBe(1);
    expect(boss.calls.enter).toEqual([]);
    expect(events).toHaveLength(0);
  });

  it('每进一个新阶段，phase 台账清空（旧阶段的临时数据不许带到新阶段）', () => {
    const sm = new BossStateMachine(fakeBoss());
    sm.phaseData = { leftover: 1 };
    sm.transitionTo(BossPhase.PHASE_2);
    expect(sm.phaseData).toEqual({});
  });

  it('连切两次：事件两次、phase 依次推进', () => {
    const sm = new BossStateMachine(fakeBoss());
    sm.transitionTo(2);
    sm.transitionTo(3);
    expect(sm.phase).toBe(3);
    expect(events.map((e) => e.detail.phase)).toEqual([2, 3]);
  });
});

describe('阶段行为表：跟着当前阶段走', () => {
  it('注册哪一阶段就只在那一阶段取得到', () => {
    const sm = new BossStateMachine(fakeBoss());
    const b2 = { onEnter: () => {} };
    const b3 = { onEnter: () => {} };
    sm.registerPhaseBehavior(2, b2);
    sm.registerPhaseBehavior(3, b3);
    expect(sm.getCurrentBehavior()).toBeUndefined();    // 还在 1，没注册
    sm.transitionTo(2);
    expect(sm.getCurrentBehavior()).toBe(b2);
    sm.transitionTo(3);
    expect(sm.getCurrentBehavior()).toBe(b3);
  });

  it('钩子里注册的 onEnter / onLeave 会被调到', () => {
    const boss = fakeBoss();
    const sm = new BossStateMachine(boss);
    const seen = [];
    sm.registerPhaseBehavior(2, { onEnter: () => seen.push('enter-2'), onLeave: () => seen.push('leave-2') });
    sm.transitionTo(2);
    expect(seen).toEqual(['enter-2']);
    sm.transitionTo(3);
    expect(seen).toEqual(['enter-2', 'leave-2']);
  });
});

describe('切换条件：三种类型各自生效', () => {
  it('HP_THRESHOLD：按 hp/maxHp 的比例判定，含边界', () => {
    const boss = fakeBoss(50, 100);
    const sm = new BossStateMachine(boss);
    sm.registerTransitionCondition(2, { type: PhaseTransitionCondition.HP_THRESHOLD, threshold: 0.5 });
    expect(sm.checkTransition(2), '刚好 50% 应当算达成').toBe(true);
    boss.hp = 51;
    expect(sm.checkTransition(2)).toBe(false);
  });

  it('TIME_ELAPSED：按 phaseStartTime 起算的秒数，未到不算', () => {
    const sm = new BossStateMachine(fakeBoss());
    sm.registerTransitionCondition(2, { type: PhaseTransitionCondition.TIME_ELAPSED, seconds: 10 });
    // 起算点往回拨 11 秒 → 已过 10 秒。不写死 0：`performance.now()` 是"进程启动至今"，
    // 刚跑起来才一两秒，写 0 会让它变成"还没到"，用例就假绿了。
    sm.phaseStartTime = performance.now() - 11_000;
    expect(sm.checkTransition(2), '过了 10 秒应当达成').toBe(true);
    sm.phaseStartTime = performance.now();
    expect(sm.checkTransition(2), '刚进阶段不算达成').toBe(false);
  });

  it('CUSTOM：把 boss 交给自定义函数', () => {
    const sm = new BossStateMachine(fakeBoss());
    let flag = false;
    sm.registerTransitionCondition(2, { type: PhaseTransitionCondition.CUSTOM, fn: (b) => b.hp === 100 && flag });
    expect(sm.checkTransition(2)).toBe(false);
    flag = true;
    expect(sm.checkTransition(2)).toBe(true);
  });

  it('没注册条件的阶段一律不切（不靠缺省阈值偷偷推进）', () => {
    const sm = new BossStateMachine(fakeBoss(1, 100));
    expect(sm.checkTransition(2)).toBe(false);
    expect(sm.checkPhaseTransitions()).toBe(false);
    expect(sm.phase).toBe(1);
  });

  it('`checkPhaseTransitions` 逐级推进：注册了条件就 1 → 2', () => {
    const boss = fakeBoss(40, 100);
    const sm = new BossStateMachine(boss);
    sm.registerTransitionCondition(2, { type: PhaseTransitionCondition.HP_THRESHOLD, threshold: 0.5 });
    expect(sm.checkPhaseTransitions()).toBe(true);
    expect(sm.phase).toBe(2);
  });
});

describe('存档：`toJSON` / `fromJSON` 往返', () => {
  it('切过阶段再存再读，阶段与 prevPhase 都对得上', () => {
    const sm = new BossStateMachine(fakeBoss());
    // 逐级推进：直接 transitionTo(3) 的 prevPhase 是 1，那样验不出"上一阶段"这一格
    sm.transitionTo(2);
    sm.transitionTo(3);
    sm.state = BossState.STAGGER;
    sm.phaseData = { k: 1 };
    const saved = JSON.parse(JSON.stringify(sm.toJSON()));

    const fresh = new BossStateMachine(fakeBoss());
    fresh.fromJSON(saved);
    expect(fresh.phase).toBe(3);
    expect(fresh.prevPhase).toBe(2);
    expect(fresh.state).toBe(BossState.STAGGER);
    expect(fresh.phaseData).toEqual({ k: 1 });
  });

  it('空数据 / 缺字段不炸，落回缺省', () => {
    const sm = new BossStateMachine(fakeBoss());
    sm.fromJSON(null);
    expect(sm.phase).toBe(1);
    sm.fromJSON({});
    expect(sm.phase).toBe(1);
    expect(sm.state).toBe(BossState.IDLE);
  });
});

describe('`boss-phase` 全仓只有一处派发（多一处 = 每次切换响应两次）', () => {
  function walk(dir) {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return walk(full);
      return name.endsWith('.js') ? [full] : [];
    });
  }

  it('`src/` 里派发 `boss-phase` 的地方恰好一处，且就是状态机', () => {
    const hits = [];
    for (const file of walk(SRC)) {
      const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      // 只数命中次数，不必取匹配对象本身
      for (const _m of code.matchAll(/new CustomEvent\(\s*'boss-phase'/g)) {
        hits.push(file.slice(SRC.length + 1).replace(/\\/g, '/'));
      }
    }
    expect(hits, `派发点：${hits.join(', ')}`).toEqual(['combat/BossStateMachine.js']);
  });

  it('`Boss.js` 真的 new 了状态机（接线见证）', () => {
    const src = readFileSync(join(SRC, 'combat/Boss.js'), 'utf8');
    expect(src).toMatch(/new BossStateMachine\(/);
  });
});

describe('门禁自证', () => {
  it('把"切到同一阶段就返回"去掉，上面那条"不动"的用例必须变红', () => {
    // 模拟没有那道守卫的写法
    const sm = new BossStateMachine(fakeBoss());
    const noGuard = () => { sm.phase = 1; return true; };   // 无守卫版会返回 true
    expect(noGuard()).toBe(true);
    expect(sm.transitionTo(BossPhase.PHASE_1)).toBe(false); // 有守卫版返回 false
  });

  it('事件桩真的接到了（没接到的话上面所有事件断言都是白过）', () => {
    const sm = new BossStateMachine(fakeBoss());
    sm.transitionTo(2);
    expect(events.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ *
 * 副本 Boss：同一次二阶段只许派一次（这一片查出来的真缺陷）
 * ------------------------------------------------------------------ */

describe('`DungeonBoss`：二阶段走状态机，不许自己再派一次', () => {
  /** 借原型方法用：避免构造整套 THREE 场景（`checkPhase` 只碰这几个字段） */
  const runCheckPhase = (boss) => DungeonBoss.prototype.checkPhase.call(boss);

  const dungeonBoss = (hp, maxHp = 100) => {
    const sm = new BossStateMachine(fakeBoss(hp, maxHp));
    sm.registerTransitionCondition(BossPhase.PHASE_2, {
      type: PhaseTransitionCondition.HP_THRESHOLD,
      threshold: 0.45,
    });
    return {
      sm,
      phaseTriggered: { p2: false },
      speed: 5,
      damage: 20,
      toasts: [],
      dialogToast(t) { this.toasts.push(t); },
    };
  };

  it('血量压到 45% 以下：进二阶段、改属性、弹提示，且 `boss-phase` 只派一次', () => {
    const b = dungeonBoss(44);
    runCheckPhase(b);
    expect(b.sm.phase).toBe(2);
    expect(b.speed).toBe(6.5);
    expect(b.damage).toBe(26);
    expect(b.toasts).toHaveLength(1);
    expect(events.filter((e) => e.type === 'boss-phase')).toHaveLength(1);
    expect(events[0].detail.phase).toBe(2);
  });

  it('血量还没到（60%）：什么都不做，也不派事件', () => {
    const b = dungeonBoss(60);
    runCheckPhase(b);
    expect(b.sm.phase).toBe(1);
    expect(b.toasts).toEqual([]);
    expect(events).toHaveLength(0);
  });

  it('已经在二阶段了就不再推进（副本 Boss 是双阶段的，没有三阶段）', () => {
    const b = dungeonBoss(20);
    b.sm.transitionTo(2);
    events.length = 0;
    runCheckPhase(b);
    expect(b.sm.phase).toBe(2);
    expect(events).toHaveLength(0);
  });

  it('接线：构造器把 45% 注册进状态机，且文件里不再自己 `new CustomEvent`', () => {
    const src = readFileSync(join(SRC, 'combat/DungeonBoss.js'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).toMatch(/registerTransitionCondition\(BossPhase\.PHASE_2/);
    expect(code).toMatch(/threshold:\s*0\.45/);
    expect(code).not.toMatch(/new CustomEvent\(\s*'boss-phase'/);
  });
});
