import { describe, it, expect, beforeAll } from 'vitest';
import { AI } from '../src/content/tuning.js';
import { SquadController } from '../src/ai/Squad.js';
import {
  installWindowShim, makeWorld, makePlayerRef, v, run, NEVER_LEAVES, spawn,
  encircle, duel, makeManager,
} from './helpers/enemyHarness.js';

beforeAll(installWindowShim);

describe('敌人感知', () => {
  it('看得见才追击：视线被墙挡住时保持原地', () => {
    const world = makeWorld([{ x: 5, z: 0, hx: 1, hz: 6, base: 0, top: 5 }]);
    const m = makeManager({ world });
    const e = spawn(m, { x: 10, z: 0 });
    run(m, 1, 1 / 60, v(0, 0), makePlayerRef());
    expect(e.sense.seen).toBe(false);
    expect(e.sense.alerted).toBe(false);
    expect(e.state).toBe('idle');
    expect(e.distanceTo(v(0, 0))).toBeCloseTo(10, 6);
  });

  it('墙的另一侧视线通畅时照常追击', () => {
    const world = makeWorld([{ x: 5, z: 0, hx: 1, hz: 6, base: 0, top: 5 }]);
    const m = makeManager({ world });
    const e = spawn(m, { x: 10, z: 20 });
    const player = v(0, 20);
    run(m, 0.5, 1 / 60, player, makePlayerRef());
    expect(e.state).toBe('pursue');
    expect(e.distanceTo(player)).toBeLessThan(9.8);
  });

  /**
   * B125 的 B 类：`CollisionWorld.blocked()` 把整条视线压成**一个高度**上的采样。
   * 改前 `Sense` 递的是绝对的 `ai.eyeHeight`（1.5 米），等于假设世界从 y=0 起 ——
   * 敌人站在 10 米台地上时那条线落在地表以下 8 米，正好穿过一块**埋进坡里**的石头，
   * 于是四向全被判成遮挡、玩家贴到 1.7 米也不警觉。症状与"出生在实体里"那一族
   * 一模一样，因却是另一条，所以两条各立一例。
   */
  it('站在高台上的敌人不被埋进坡里的石头判瞎：视线高度跟着站立面走', () => {
    // 石头顶面 3.4 米，脚下的地台 10.4 米：它挡得住"绝对 1.5 米那条线"，挡不住"10.4+1.5 那条"
    const world = makeWorld([{ x: 1, z: 0, r: 1.2, base: -2, top: 3.4 }], 10.4);
    const m = makeManager({ world });
    const e = spawn(m, { x: 0, z: 0 });
    const player = v(1.7, 0);
    run(m, 0.5, 1 / 60, player, makePlayerRef());
    expect(e.sense.seen, '台地上的敌人被脚下八米深的石头判成看不见贴脸的玩家').toBe(true);
    expect(e.sense.alerted).toBe(true);
  });

  it('反向控制：同一块石头、同一层地面，视线当真被挡住（判据改的是高度，不是把遮挡判据拆了）', () => {
    const world = makeWorld([{ x: 1, z: 0, r: 1.2, base: -2, top: 3.4 }], 0);
    const m = makeManager({ world });
    const e = spawn(m, { x: 0, z: 0 });
    run(m, 0.5, 1 / 60, v(1.7, 0), makePlayerRef());
    expect(e.sense.seen, '这块石头本来就该挡住视线，用例才有对照组').toBe(false);
    expect(e.sense.alerted).toBe(false);
  });

  it('受击即仇恨（不需要看得见）；丢失视野后追满记忆时间才放弃', () => {
    const world = makeWorld([{ x: 5, z: 0, hx: 1, hz: 6, base: 0, top: 5 }]);
    const m = makeManager({ world });
    const e = spawn(m, { x: 10, z: 0 });
    e.takeDamage(5, 0);
    expect(e.sense.alerted).toBe(true);
    run(m, AI.memory * 0.5, 1 / 60, v(0, 0), makePlayerRef());
    expect(e.sense.alerted).toBe(true);
    run(m, AI.memory, 1 / 60, v(0, 0), makePlayerRef());
    expect(e.sense.alerted).toBe(false);
    expect(e.state).toBe('idle');
  });

  it('离出生点太远就放弃并归位，回到出生点后清空仇恨', () => {
    const m = makeManager();
    const e = spawn(m, { x: 0, z: 0 });
    e.sense.noteHostile();
    e.position.set(40, 0, 0);                       // 40 > aggroRange × leashScale
    const player = v(100, 0);                       // 玩家在归位路上始终看不见
    run(m, 0.3, 1 / 60, player, makePlayerRef());
    expect(e.state).toBe('return');
    run(m, 20, 1 / 60, player, makePlayerRef());
    expect(e.distanceTo(e.spawnPoint)).toBeLessThan(e.ai.returnArrive + 0.6);
    expect(e.sense.alerted).toBe(false);
    expect(e.state).not.toBe('return');
  });

  it('追击不会穿过实体：挡在路上的树柱把敌人一直推在柱外', () => {
    const world = makeWorld([{ x: 5, z: 0, r: 1, base: 0, top: 5 }]);
    const m = makeManager({ world });
    const e = spawn(m, { x: 10, z: 0, ai: NEVER_LEAVES });
    e.sense.noteHostile();
    const player = v(0, 0);
    for (let i = 0; i < 400; i++) {
      m.update(1 / 60, player, makePlayerRef(), null, null);
      expect(Math.hypot(e.position.x - 5, e.position.z)).toBeGreaterThan(1 + e.separationRadius() - 0.02);
    }
  });
});

describe('围攻名额与分离', () => {
  it('同时出手数不超过名额，且四只都会轮到（不是一拥而上，也不是只有两只干活）', () => {
    const { m, player, ref, list } = encircle(4);
    const attacks = new Map(list.map((e) => [e, 0]));
    const guards = new Map(list.map((e) => [e, 0]));
    const prevState = new Map(list.map((e) => [e, '']));
    let maxCommitted = 0;
    for (let i = 0; i < 600; i++) {
      m.update(1 / 60, player, ref, null, null);
      for (const e of list) {
        // 防御招也进入 strike 段（举盾那 1.5 秒）并占住名额，但它按设计不打人：分账记
        if (e.state === 'strike' && prevState.get(e) !== 'strike') {
          const bucket = e.activeMove?.guard ? guards : attacks;
          bucket.set(e, bucket.get(e) + 1);
        }
        prevState.set(e, e.state);
      }
      maxCommitted = Math.max(maxCommitted, list.filter((e) => ['windup', 'strike'].includes(e.state)).length);
      expect(m.squad.busy).toBeLessThanOrEqual(AI.attackSlots);
    }
    expect(maxCommitted).toBe(AI.attackSlots);
    // 每只都得出过手：防御也是干活（占名额、逼玩家绕后），只是不掉血
    for (const e of list) expect(attacks.get(e) + guards.get(e)).toBeGreaterThan(0);
    expect(ref.hits.length).toBe(list.reduce((n, e) => n + attacks.get(e), 0));
    // 围攻里确实举起过盾：否则「格挡」只是招式表上一个从不被选中的数字
    expect(list.reduce((n, e) => n + guards.get(e), 0)).toBeGreaterThan(0);
  });

  it('持有者死亡或被打断立刻交还名额，不会把整群锁死', () => {
    const { m, player, ref, list } = encircle(3);
    run(m, 0.3, 1 / 60, player, ref);
    const holders = list.filter((e) => m.squad.holds(e));
    expect(holders.length).toBe(AI.attackSlots);
    holders[0].die();
    expect(m.squad.busy).toBe(AI.attackSlots - 1);
    holders[1].forceStagger(2);
    expect(m.squad.busy).toBe(AI.attackSlots - 2);
  });

  it('硬直的敌人交出名额且不进攻，恢复后重新排队', () => {
    const { m, player, ref, list } = encircle(1);
    const e = list[0];
    run(m, 0.3, 1 / 60, player, ref);
    expect(e.state).toBe('windup');
    e.forceStagger(1.5);
    expect(e.state).toBe('stagger');
    expect(m.squad.busy).toBe(0);
    run(m, 0.5, 1 / 60, player, ref);
    expect(e.state).toBe('stagger');               // 硬直期间不再进入进攻态
    run(m, 1.2, 1 / 60, player, ref);
    expect(['windup', 'strike', 'recover', 'orbit']).toContain(e.state);
  });

  it('名额是租约：持有者失联会被超时回收，续期则不会被踢', () => {
    const squad = new SquadController(1, 1.0);
    const a = { name: 'a' };
    const b = { name: 'b' };
    expect(squad.claim(a)).toBe(true);
    expect(squad.claim(b)).toBe(false);
    expect(squad.tick(0.6)).toBe(0);
    expect(squad.claim(a)).toBe(true);             // 活跃持有者每帧续期
    expect(squad.tick(1.1)).toBe(1);
    expect(squad.busy).toBe(0);
    expect(squad.claim(b)).toBe(true);
  });

  it('重叠出生的两只敌人互相推开，且不会一起朝同一方向漂移', () => {
    const m = makeManager();
    const a = spawn(m, { x: 100, z: 100 });
    const b = spawn(m, { x: 100, z: 100 });
    run(m, 1, 1 / 60, v(0, 0), makePlayerRef());
    expect(a.distanceTo(b.position)).toBeGreaterThan(0.5);
    expect(Math.sign(a.position.x - 100)).toBe(-Math.sign(b.position.x - 100)); // 反向散开，不是同进同退
  });

  it('敌人不钻进玩家身体：贴脸距离停在两具身体之外', () => {
    const { m, player, ref, list } = encircle(1);
    run(m, 3, 1 / 60, player, ref);
    const minGap = list[0].separationRadius() + AI.playerRadius;
    expect(list[0].distanceTo(player)).toBeGreaterThan(minGap * 0.98);
  });

  it('外圈等待的敌人不塌进玩家怀里：围攻多了也不会叠成一坨', () => {
    // 6 只抢 2 个名额，剩下的整程待在 orbit 态——径向符号写反时它们会一路撞进玩家（实测 0.002 m），
    // 彼此也叠在同一点上（0.005 m）。单只敌人的用例走进攻态，抓不到这个符号错误。
    const { m, player, ref, list } = encircle(6);
    let orbitFrames = 0;
    let minToPlayer = Infinity;
    let minPair = Infinity;
    for (let i = 0; i < 600; i++) {
      run(m, 1 / 60, 1 / 60, player, ref);
      for (const e of list) {
        if (e.state === 'orbit') orbitFrames++;
        minToPlayer = Math.min(minToPlayer, e.distanceTo(player));
      }
      for (let a = 0; a < list.length; a++) {
        for (let b = a + 1; b < list.length; b++) {
          minPair = Math.min(minPair, list[a].distanceTo(list[b].position));
        }
      }
    }
    expect(orbitFrames).toBeGreaterThan(0);
    // 下限取两具身体相切：允许蹭行，不允许同点重叠
    expect(minToPlayer).toBeGreaterThan(AI.playerRadius + list[0].separationRadius());
    expect(minPair).toBeGreaterThan(list[0].separationRadius());
  });
});

describe('敌人招式时序', () => {
  // 这一组用例测的是"时序"，所以把招式钉成 sweep（前摇 0.75 秒），
  // 免得加权选招把某一帧的差别变成断言的噪声；选招本身另有用例。
  it('前摇结束那一帧才落地：预警期间玩家不掉血', () => {
    const { m, player, ref } = duel({ moves: ['sweep'], ai: NEVER_LEAVES });
    run(m, 0.6, 1 / 60, player, ref);
    expect(ref.hits).toHaveLength(0);
    run(m, 0.3, 1 / 60, player, ref);
    expect(ref.hits).toEqual([10]);
  });

  it('前摇是承诺态：玩家躲开也不中途改判，但超出容差就打空', () => {
    const { m, ref, e } = duel({ moves: ['sweep'], ai: NEVER_LEAVES });
    run(m, 0.5, 1 / 60, v(0, 0), ref);
    expect(e.state).toBe('windup');
    const far = v(9, 0);
    run(m, 0.4, 1 / 60, far, ref);
    expect(ref.hits).toHaveLength(0);              // 躲出去了
    expect(['strike', 'recover']).toContain(e.state); // 但这一刀仍然挥完
    run(m, 0.7, 1 / 60, far, ref);
    expect(e.state).toBe('pursue');                // 收招后重新追
    expect(ref.hits).toHaveLength(0);              // 这一刀始终没落下来
  });

  it('玩家的无敌帧走接口不走字段：无敌时吃到招式也不掉血', () => {
    const { m, player, ref } = duel({ moves: ['sweep'], ai: NEVER_LEAVES });
    ref.invulnerable = true;
    run(m, 1.2, 1 / 60, player, ref);
    expect(ref.hits).toHaveLength(0);
    ref.invulnerable = false;                      // 同一位置解除无敌后确实吃得下一刀，说明前一断言不是空转
    run(m, 2.6, 1 / 60, player, ref);              // 覆盖一次完整冷却（0.35+0.45+1.5 秒）
    expect(ref.hits.length).toBeGreaterThan(0);
  });

  it('弹反窗口按前摇时长折算，不写死秒数', () => {
    // 内联招式覆盖：只改前摇，其余字段落在默认招式上
    const { m, player, ref, e } = duel({ moves: [{ windup: 0.4 }], ai: NEVER_LEAVES });
    run(m, 0.15, 1 / 60, player, ref);
    expect(e.state).toBe('windup');
    expect(e.isParriable()).toBe(false);           // 前半段还在预警，不可弹
    run(m, 0.15, 1 / 60, player, ref);
    expect(e.isParriable()).toBe(true);            // 后半段可弹：窗口按前摇时长折算
  });

  it('144/60/30 帧下同一套招式循环打出相同次数：计时全部走 dt', () => {
    const hitsAt = (dt) => {
      const { m, player, ref } = duel({ moves: ['sweep'], ai: NEVER_LEAVES });
      run(m, 9, dt, player, ref);
      return ref.hits.length;
    };
    const at144 = hitsAt(1 / 144);
    expect(at144).toBeGreaterThan(2);
    expect(hitsAt(1 / 60)).toBe(at144);
    expect(hitsAt(1 / 30)).toBe(at144);
  });
});
