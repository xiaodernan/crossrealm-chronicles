import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AI } from '../src/content/tuning.js';
import { SquadController } from '../src/ai/Squad.js';
import { 抖动度, 走位地板帧 } from './helpers/enemyJitter.js';
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
    // 切片9 的新契约：坑来自**名单**（`note` 报名 → 轮转补座），不再是"账本还没满"这一格容量读数。
    // 于是这两格都必须先报名再问 —— 直接 `claim` 一只没报名的，读的就不止 claim 自身了（#45）。
    const squad = new SquadController(1, 1.0);
    const a = { name: 'a' };
    const b = { name: 'b' };
    squad.note(a, true);
    squad.note(b, true);
    expect(squad.roomFor(a), '一格坑按名次给第一个报名的').toBe(true);
    expect(squad.roomFor(b), '坑被占着：B 只能排队，不许跟着一起冲进来').toBe(false);
    expect(squad.claim(a)).toBe(true);
    expect(squad.claim(b), '没轮到的不许出手：走位与出手读同一张表').toBe(false);
    expect(squad.tick(0.6)).toBe(0);
    expect(squad.claim(a)).toBe(true);             // 已有租约的不再每帧续期（#45），只返回 true
    expect(squad.tick(1.1)).toBe(1);
    expect(squad.busy).toBe(0);
    expect(squad.roomFor(b), '租约超时让位：排队的下一位补上').toBe(true);
    expect(squad.roomFor(a), '失联的那只排回队尾，不再认得自己的坑').toBe(false);
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

  /**
   * #33：抢不到坑的那只该待在哪一侧。
   *
   * 两个设定点原先压在一条线上（等待环 `orbitKeep × holdRange` 与追击的停脚边界 `holdRange`
   * 之间没有一方认账的间隙），而分离推力会把等待中的那只**推出**这条线：顶着坑的那只处于
   * 前摇/命中段，`Enemy._advance` 按 `rooted` 不推它 ⇒ 它不动，另一只的向内权限却只有
   * 厘米每秒的量级（实测第 234 帧 `沿径推` −2.518 对流 `沿径wish` 0.916，`.tmp-20261031-s25/s11-trace2.log`
   * f226–f241）。单阈值因此成了一场接力振荡：`pursue` 与 `orbit` 每帧互换，画面是原地抽搐。
   *
   * 这一节钉三件事：① 死区是**迟滞**而不是当帧读数（写成后者时 `dist > 门 + (dist<=门 ? band : 0)`
   * 恒等于 `dist > 门`，那条死区从头就没参与 —— `s11-latch.log` 量到的就是它）；
   * ② 三档设定点不许重合；③ 死区压的是"同一条回路来回"，不砍出手（同种子两臂，聚合读数）。
   *
   * 两臂必须钉 `aiSeed`：`Enemy.js` 默认按构造顺序发号，同一个进程里后跑的场景拿到的是
   * 另一串随机流，于是"单变量对照"比的其实是种子（这条把本片的 辛 臂作废过一回，见 #46）。
   */
  const DT = 1 / 60;
  const 场景表 = { 三只两坑: [3, 9], 六只推进: [6, 9], 六只贴脸: [6, 2] };

  /** 把敌人钉在某个距离上跑一帧：被顶着坑的同伴推过停脚边界是几何结果，这里直接把那个几何摆出来 */
  function 钉一帧(m, e, player, ref, 距离) {
    e.position.set(距离, 0, 0);
    e.attackCooldown = 999;                  // 这一格只留走位判定：出手不参与
    m.update(DT, player, ref, null, null);
    return e.state;
  }

  function 死区读数(band) {
    const { m, player, ref, e } = duel({
      x: 9, z: 0, aiSeed: 5, ai: { ...NEVER_LEAVES, pursueBand: band },
    });
    const 门 = e.holdRange;
    const 接近 = 钉一帧(m, e, player, ref, 门 + 0.3);        // 从未贴过脸：B69 的"该贴脸就贴脸"
    钉一帧(m, e, player, ref, 门 - 0.3);                     // 贴进去：记账置真
    钉一帧(m, e, player, ref, 门 - 0.3);
    const 顶出 = 钉一帧(m, e, player, ref, 门 + 0.3);        // 关键一帧：被顶出 0.3 米
    const 顶出记账 = e.heldIn;
    const 越带 = 钉一帧(m, e, player, ref, 门 + AI.pursueBand + 0.1);
    return { 门, 接近, 顶出, 顶出记账, 越带, 越带记账: e.heldIn };
  }

  /** 同一场景、同一批钉死种子，两臂只差 band —— 返回聚合读数 */
  function 围攻读数(名, band, 组) {
    const [n, 半径] = 场景表[名];
    const m = makeManager();
    const player = v(0, 0);
    const ref = makePlayerRef();
    const list = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      list.push(spawn(m, {
        x: Math.sin(a) * 半径, z: Math.cos(a) * 半径,
        ai: { ...NEVER_LEAVES, pursueBand: band },
        aiSeed: 1 + 组 * 100 + i,
      }));
    }
    const 序列 = list.map(() => []);
    const 起手 = list.map(() => 0);
    const 上次 = list.map(() => null);
    // 坑的翻页次数（#45）：读数只该随事件翻，一轮围攻是"一进一出"两页
    const 坑翻 = list.map(() => 0);
    const 上坑 = list.map(() => null);
    for (let i = 0; i < Math.round(14 / DT); i++) {
      m.update(DT, player, ref, null, null);
      list.forEach((e, k) => {
        序列[k].push(e.state);
        if (e.state === 'windup' && 上次[k] !== 'windup') 起手[k] += 1;
        上次[k] = e.state;
        const 坑 = e.squad.roomFor(e);
        if (上坑[k] !== null && 坑 !== 上坑[k]) 坑翻[k] += 1;
        上坑[k] = 坑;
      });
    }
    const 尺 = 序列.map(抖动度);
    const 有链 = 尺.filter((x) => x.同窗连换 > 0);
    return {
      连换: 尺.reduce((s, x) => s + x.同窗连换, 0),
      起手: 起手.reduce((a, b) => a + b, 0),
      每只起手: 起手,
      每只坑翻: 坑翻,
      中间最短: 有链.length ? Math.min(...有链.map((x) => x.中间最短 || Infinity)) : Infinity,
    };
  }

  /**
   * 九组（三场景 × 三种子）一次跑完，几条腿共用同一批读数。
   *
   * 每组 840 帧，重跑一遍等于把这一节的时间翻倍；更要紧的是**同一批读数**才能互相对得上账 ——
   * 两条腿各跑各的，随机流一旦被别的用例插队，两条腿看到的就不是同一个世界。
   */
  const 读数Cache = new Map();
  function 九组读数(band) {
    const key = String(band);
    if (!读数Cache.has(key)) {
      const 出 = [];
      for (const 名 of Object.keys(场景表)) {
        for (let 组 = 0; 组 < 3; 组++) 出.push({ 名, 组, ...围攻读数(名, band, 组) });
      }
      读数Cache.set(key, 出);
    }
    return 读数Cache.get(key);
  }

  it('死区是迟滞：贴过脸之后被顶出半米不重冲，从未贴过脸的照旧全速扑（含 band=0 反向对照）', () => {
    expect(AI.pursueBand, '锚点不在：`AI.pursueBand` 没配就等于死区恒为 0，下面两条对照都在空转')
      .toBeGreaterThan(0);
    const 有 = 死区读数(AI.pursueBand);
    const 无 = 死区读数(0);
    expect(有.接近, '从远处第一次扑上来的那一只被死区拦住了：B69 那一族"该贴脸"必须一字不动')
      .toBe('pursue');
    expect(有.顶出, `贴过脸又被顶出 ${(有.门 + 0.3 - 有.门).toFixed(2)} 米就重新全速冲 —— 死区没生效（记账 ${有.顶出记账}）`)
      .toBe('orbit');
    expect(有.越带, '越过带宽还不许重冲：那是把死区写成了 leash').toBe('pursue');
    // 反向对照（#36）：坏-变体必须既撞上锚点、又真的改出别的读数
    expect(无.顶出, 'band 写回 0 还读数相同 ⇒ 这一格根本没有读者')
      .toBe('pursue');
    expect(无.接近).toBe('pursue');
    expect(无.越带).toBe('pursue');
  });

  it('三档设定点互不重合：贴环 < 停脚线 < 越过线 < 外圈（写重了就是一条自相矛盾的回路）', () => {
    const { e } = duel({ x: 1.8, z: 0, ai: NEVER_LEAVES });
    const 贴 = e.holdRange * AI.orbitHug;
    const 停 = e.holdRange;
    const 越 = e.holdRange + e.ai.pursueBand;
    const 外 = e.holdRange * AI.orbitKeep;
    expect(AI.orbitHug, '贴着等的那一档必须落在停脚线**内侧**：写成 ≥1 就与追击抢同一条线').toBeLessThan(1);
    expect(AI.orbitKeep, '外圈必须落在停脚线**外侧**').toBeGreaterThan(1);
    expect(贴, `贴环 ${贴.toFixed(3)} 不小于停脚线 ${停.toFixed(3)}：#33 的互顶回来了`).toBeLessThan(停);
    expect(越, `越过线 ${越.toFixed(3)} 不高于外圈 ${外.toFixed(3)}：等待环与死区合并成一段`).toBeLessThan(外);
  });

  it('钉住 aiSeed 才叫单变量：同种子同场景在同进程里跑两遍读数逐字相同（#46）', () => {
    expect(围攻读数('三只两坑', 0.6, 0)).toEqual(围攻读数('三只两坑', 0.6, 0));
  });

  it('死区压住的是"同一条回路来回"，不是出手：三场景 × 三组同种子两臂', () => {
    let 连换有 = 0; let 连换无 = 0; let 起手有 = 0; let 起手无 = 0;
    const 明细 = [];
    const 组数 = 3;
    for (const 名 of Object.keys(场景表)) {
      for (let 组 = 0; 组 < 组数; 组++) {
        const 有 = 围攻读数(名, 0.6, 组);
        const 无 = 围攻读数(名, 0, 组);
        连换有 += 有.连换; 连换无 += 无.连换; 起手有 += 有.起手; 起手无 += 无.起手;
        明细.push(`${名}#${组} 连换 ${有.连换}/${无.连换} 起手 ${有.起手}/${无.起手}`);
      }
    }
    const 账 = 明细.join(' | ');
    expect(连换有, `死区没压住同窗连换：${账}`).toBeLessThan(连换无);
    // 读数交账（2026-11-05 重跑，切片9 把名额改成轮转之后；`.tmp-20261031-s25/wb7-9-ab2-band06.log`
    // 与 `wb7-9-ab2-band0.log`）：这一格钉的是"改了调校就要重新看一眼"，有意重调时跟着改这里并说明是哪一档变了。
    // 逐组（连换 有/无 · 起手 有/无）：三只两坑 4/15·13/13，6/6·11/11，6/18·10/10；
    // 六只推进 4/4·19/19，6/6·18/18，8/8·17/17；六只贴脸 9/9·18/18，8/8·13/13，9/9·16/16。
    // **只有三只两坑两臂不同**：六只的两组逐字节相同 —— 轮转把死区原来管的那部分人潮拥挤接过去了，
    // 于是死区现在只在"坑比人少得不多"的场景里还有活干。起手两臂完全相同：改的是走位不是火力。
    expect([连换有, 连换无, 起手有, 起手无], `聚合读数漂了：${账}`)
      .toEqual([60, 83, 135, 135]);
    // 出手不许被砍。容差取"每组至多一次"：一次起手是一个离散事件，18 组实测两臂最多差 1
    expect(起手有, `死区把该出手的也拦住了：${账}`).toBeGreaterThanOrEqual(起手无 - Object.keys(场景表).length * 组数);
    expect(起手无, `死区反过来把出手抬高了（${起手有} → ${起手无}）？两臂必须同量级`).toBeGreaterThanOrEqual(起手有 - Object.keys(场景表).length * 组数);
  });

  /**
   * #45 的正腿（替换掉原来那条欠账腿）。
   *
   * 判据从 `最短` 换成 `中间最短` **不是放宽**：一条走位链的首尾两档是被 windup/idle 切开的，
   * 画面是"跨一步就挥出去"，那是到了；只有左右两边都还是走位态的**中间档**才是走到一半又翻回来。
   * 这条换法的证据不靠回退 `src/`（#40 的纪律）：拿 `.tmp-20261031-s25/wb7-9-metric-ab.log` 里
   * **已记录的 形态 串**重新打分档 —— 改前 45 只有 29 只的中间档短于地板（最短 1 帧），
   * 改后 0 只（最短 14 帧）。同一个尺子，同一个世界，两个答案。
   */
  it('轮转之后没有打不进淡化的中间档：九组每档 ≥ 一次步态淡化（含 band=0 反向对照）', () => {
    const 地板 = 走位地板帧(DT);
    expect(地板, '一步淡化不足一帧：尺子自己失效，这条腿在空转').toBeGreaterThan(1);
    for (const 读 of 九组读数(AI.pursueBand)) {
      expect(读.中间最短,
        `${读.名}#${读.组} 有一段 ${读.中间最短} 帧的中间档 < 地板 ${地板} 帧：名额又变回每帧可翻的读数了（#45）`)
        .toBeGreaterThanOrEqual(地板);
    }
    // 反向对照（#36）：band 写回 0，三只两坑立刻回到原地对流 —— 说明这把尺子真的在量这件事
    const 无 = 九组读数(0).map((x) => x.中间最短);
    expect(Math.min(...无),
      `band=0 的九组中间档也全部 ≥ 地板 ${地板} ⇒ 这一格根本没有读者（同批读数实测最短 ${Math.min(...无)}）`)
      .toBeLessThan(地板);
  });

  /**
   * 名额读数的**翻页代数**：一轮围攻是"一进一出"，所以每只每起手至多两页，
   * 加上窗口边界截断留给每只至多一页（起手那一刻的坑态没被记到）。
   *
   * 这条把 #45 的成因钉死在源码形状上：改前 `roomFor` 读的是 `leases.size < slots`，一枚**任何
   * 同伴 claim 都会改**的容量读数 ⇒ 六只推进#0 实测每只坑翻合计 156 页，上限 23×2+6 = 52
   * （`.tmp-20261031-s25/wb7-9-census-before.log`）。改后同一组 36 页 vs 上限 19×2+6 = 44。
   */
  it('坑只随事件翻页：每组 每只坑翻合计 ≤ 起手×2 + 只数（旧容量读数在这一格必红）', () => {
    for (const 读 of 九组读数(AI.pursueBand)) {
      const [n] = 场景表[读.名];
      const 上限 = 读.起手 * 2 + n;
      const 实 = 读.每只坑翻.reduce((a, b) => a + b, 0);
      expect(实, `${读.名}#${读.组} 坑翻 ${实} 页 > 上限 ${上限} 页（起手 ${读.起手} × 2 + 只数 ${n}，` +
        `逐只 ${读.每只坑翻.join(',')}）：名额被写成邻居能改的容量读数 = #45 的成因`)
        .toBeLessThanOrEqual(上限);
    }
  });

  /** 轮转的公平性：读数不能只说明"不抖了"，还得说明没人被排到永远补不上坑的位置 */
  it('排队不看运气：六只的每组每只都出过手，最多与最少只差 2 次', () => {
    for (const 读 of 九组读数(AI.pursueBand)) {
      if (场景表[读.名][0] < 6) continue;
      for (const 次 of 读.每只起手) {
        expect(次, `${读.名}#${读.组} 有一只全程 0 次起手（逐只 ${读.每只起手.join(',')}）：轮转把它排在补不上坑的位置`)
          .toBeGreaterThan(0);
      }
      const 差 = Math.max(...读.每只起手) - Math.min(...读.每只起手);
      expect(差, `${读.名}#${读.组} 每只起手 ${读.每只起手.join(',')} 极差 ${差}：轮转退化成"排队看运气"（实测极差 ≤ 2）`)
        .toBeLessThanOrEqual(2);
    }
  });

  it('名单是轮转唯一认的依据：报名幂等、退报当场交座、坐着不打超时让位', () => {
    const squad = new SquadController(2, 1.0);
    const a = { name: 'a' }; const b = { name: 'b' }; const c = { name: 'c' };
    squad.note(a, true); squad.note(b, true); squad.note(c, true);
    expect(squad.line.length, '三只报名就在名单里三只').toBe(3);
    expect(squad.seated, '坑只有两个：第三只能排队，不许一起挤进来').toBe(2);
    squad.note(a, true); squad.note(a, true);
    expect([squad.line.length, squad.line[0]], '重复报名重排了名次 = 回到"每帧抢"')
      .toEqual([3, a]);
    squad.note(b, false);
    expect(squad.roomFor(c), '脱战的那只当场交座：老实现要等租约超时才撒手，中间那几秒整群少一个进攻位')
      .toBe(true);
    expect(squad.line.indexOf(b), '退报彻底退出名单：留在里面会让它白占一个轮次').toBe(-1);
    // 坐着却出手不了（够不着、被溜出锥面、冷却没完）超过一个回收时长：让给排队的下一位
    const 单坑 = new SquadController(1, 1.0);
    const x = { name: 'x' }; const y = { name: 'y' };
    单坑.note(x, true); 单坑.note(y, true);
    expect(单坑.tick(1.1), '让位不是租约回收：这两件事在判据里不是一格，别混成一个数').toBe(0);
    expect([单坑.roomFor(x), 单坑.roomFor(y)], '坐着不打超时让位，下一位当场补上').toEqual([false, true]);
  });

  it('roomFor 是只读的名额读数：不续期、没报名的不认、Boss 不占坑', () => {
    const squad = new SquadController(2, 1.0);
    const a = { name: 'a' };
    const b = { name: 'b' };
    const boss = { name: 'boss', isBoss: true };
    squad.note(a, true);
    squad.note(b, true);
    expect(squad.roomFor(boss), 'Boss 不该被自己的随从挡住').toBe(true);
    expect(squad.claim(boss)).toBe(true);
    expect(squad.busy, 'Boss 拿到的是资格，不是账本上的一格').toBe(0);
    for (let i = 0; i < 5; i++) expect(squad.roomFor(a)).toBe(true);
    expect(squad.busy, 'roomFor 读得再多也不能把租约读成活期：走位判定每帧都要问它').toBe(0);
    expect(squad.roomFor({ name: 'c' }), '没报名的敌人没有座：问一个陌生人不能答"有空位你来"').toBe(false);
    expect(squad.roomFor(null), '没有敌人就没有名额可问，别把空对象当成持有者').toBe(false);
    expect(squad.tick(1.1), '两只都只读不 claim：没有租约可回收').toBe(0);
  });

  it('接线：停脚线只有一份、等待设定点走 holdRadius、名额判据不抄第二份', () => {
    const SRC = join(process.cwd(), 'src');
    const fsm = readFileSync(join(SRC, 'ai', 'EnemyFSM.js'), 'utf8');
    const squad = readFileSync(join(SRC, 'ai', 'Squad.js'), 'utf8');
    const enemy = readFileSync(join(SRC, 'combat', 'Enemy.js'), 'utf8');
    const mgr = readFileSync(join(SRC, 'combat', 'EnemyManager.js'), 'utf8');
    expect(fsm, '追击的判据不再同时带死区与名额读数：#33 的两半都退化了').toMatch(
      /\['pursue',[\s\S]*?pursueCutoff\(e\)[\s\S]*?slotOpenFor\(e\)\]/);
    expect(fsm, 'orbit 的设定点必须走 holdRadius：两处各写一遍就是这两条线重合的成因')
      .toMatch(/const keep = holdRadius\(owner, len\);/);
    expect(fsm, '死区记账写成"当帧重算"就是惰性死区（本片踩过一次，见 §9 的 W-B7 切片8 与 #46）')
      .not.toMatch(/heldIn = enemy\.sense\.dist <= enemy\.holdRange\s*[;,]/);
    const claim体 = squad.match(/claim\(enemy\) \{[\s\S]*?\n {2}\}/)?.[0] ?? '';
    expect(claim体, '找不到 `claim` 的函数体：判据搬家了，这条腿要跟着搬').not.toBe('');
    expect(claim体, '`claim` 必须走 `roomFor`：坑满没满与谁是 Boss 只许判一次')
      .toContain('this.roomFor(enemy)');
    expect(claim体, '`claim` 里自己又数了一遍账 ⇒ 两处判据分叉').not.toMatch(/leases\.size\s*</);
    const room体 = squad.match(/roomFor\(enemy\) \{[\s\S]*?\n {2}\}/)?.[0] ?? '';
    expect(room体, '找不到 `roomFor` 的函数体：走位判据的读者还在，源主搬家了').not.toBe('');
    expect(room体, '名额读数回到"账本还没满"这一格容量 ⇒ #45 的振荡原样回来（邻居每 claim 一次它就翻页）')
      .not.toMatch(/leases\.size\s*</);
    expect(enemy, '每帧不进名单，轮转就没有依据可读（#45 的坑只随名单翻页）')
      .toMatch(/this\.squad\?\.note\(this,/);
    expect(enemy, '死亡必须**退出名单**，只 release 会让尸体占着一个轮次')
      .toMatch(/die\(\) \{[\s\S]*?this\.squad\?\.(drop)\(this\)/);
    expect(mgr, '移除同样要退出名单：同上').toMatch(/despawn\(enemy\) \{[\s\S]*?this\.squad\.drop\(enemy\)/);
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
