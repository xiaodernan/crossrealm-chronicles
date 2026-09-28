/**
 * 三个新类型的**专属招** —— W-B7 切片2：相位突袭 / 蓄力炮击 / 嚎叫引援。
 *
 * 切片1 让破碎时线与混沌边境不再是空位面，代价是三类新敌人全是"现有 9 招的组合"：
 * 怨影就是会飘的无人机、掠行兽就是跑得快的士兵、哨炮就是射程远一点的弓手。
 * 这一片给每一类一条**只有它有**的招，而三条各代表一种"引擎里此前没有的招式形状"：
 *
 * - `phase`（相位突袭）：命中段**动自己** —— 越过玩家落在背后再劈。此前所有招都是
 *   "站在原地，判定落点"，位移只发生在命中段之后（`travel: 'lunge'`）。
 * - `charge`（蓄力炮击）：同一条远程链路，靠**读得出来的代价**换权重（前摇 2 倍、圈 1.8 倍）。
 * - `howl`（嚎叫引援）：召唤招的第二份数据 —— 切片1 的召唤是"精英念咒叫士兵"，
 *   这一条是"野兽嚎叫叫同类"，机制相同、语义不同，**只该是一份数据**。
 *
 * 这个文件按三件事钉：归属（谁有谁没有）、判据分家（够得着 / 打得到）、真跑一遍的落地。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { AI, ENEMY_MOVES, ENEMY_MOVE_SETS, SUMMON } from '../src/content/tuning.js';
import {
  hasUsableMove, holdRangeOf, landRange, moveHits, moveRange, moveUsable, seededRng,
} from '../src/combat/EnemyMoves.js';
import {
  installWindowShim, makeManager, makeProjectileStub, makePlayerRef, makeWorld, v,
  until, NEVER_LEAVES, spawn, duel,
} from './helpers/enemyHarness.js';

beforeAll(installWindowShim);

const DT = 1 / 60;

/** 有这一招的类型名单：专属招的"专属"必须是可检验的，不是注释里的一句话 */
const ownersOf = (moveId) =>
  Object.entries(ENEMY_MOVE_SETS).filter(([, ids]) => ids.includes(moveId)).map(([t]) => t);

describe('W-B7 切片2：三条专属招各归一类', () => {
  it('相位突袭只属于时线怨影', () => {
    expect(ownersOf('phase')).toEqual(['wraith']);
  });

  it('蓄力炮击只属于边境哨炮', () => {
    expect(ownersOf('charge')).toEqual(['sentinel']);
  });

  it('嚎叫引援只属于混沌掠行兽', () => {
    expect(ownersOf('howl')).toEqual(['stalker']);
  });

  it('三条都真的在全局招式表里，且四张表都还认这三类（切片1 的门禁照旧生效）', () => {
    for (const id of ['phase', 'charge', 'howl']) {
      expect(ENEMY_MOVES[id], id).toBeTruthy();
      expect(typeof ENEMY_MOVES[id].telegraph?.color, id).toBe('number');
    }
    for (const t of ['wraith', 'stalker', 'sentinel']) {
      expect(ENEMY_MOVE_SETS[t].length, t).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('相位突袭：动的是自己，判的是近战', () => {
  it('`blink` 与 `reach` 是两个数：够得着 11 米，落地之后那一刀仍只有 1.2 米', () => {
    const { e } = duel({ type: 'wraith', x: 5, z: 0 });
    const m = ENEMY_MOVES.phase;
    expect(m.blink).toBeGreaterThan(m.reach * 5);
    expect(moveRange(e, m)).toBe(m.blink);
    expect(landRange(e, m)).toBe(e.attackRange + m.reach);
  });

  it('隔着八米不许判命中 —— 一个数同时当"够得着"与"打得到"用就会这样（分家的理由）', () => {
    const { e } = duel({ type: 'wraith', x: 5, z: 0 });
    expect(moveHits(e, ENEMY_MOVES.phase, 8, 1)).toBe(false);
    expect(moveHits(e, ENEMY_MOVES.phase, e.attackRange + 1.0, 1)).toBe(true);
  });

  it('可用性：11 米内能起手、12 米不许起手；贴脸也允许（这一招的伤害段本来就是近战那一档）', () => {
    const { e } = duel({ type: 'wraith', x: 5, z: 0 });
    expect(moveUsable(e, ENEMY_MOVES.phase, 8, 1)).toBe(true);
    expect(moveUsable(e, ENEMY_MOVES.phase, 12, 1)).toBe(false);
    expect(moveUsable(e, ENEMY_MOVES.phase, 1.2, 1)).toBe(true);
  });

  it('空地上一闪就赶到身后：落点在玩家另一侧 `reach` 米，落地即面朝玩家', () => {
    const world = makeWorld();
    const e = spawn(makeManager({ world }), { type: 'wraith', x: 5, z: 0, moves: ['phase'] });
    expect(e.blinkBehind(v(0, 0), world.collision, ENEMY_MOVES.phase)).toBe(true);
    expect(e.position.x).toBeCloseTo(-ENEMY_MOVES.phase.reach, 4);   // 从 +5 越到 -1.2
    expect(e.facingDotTo(v(0, 0))).toBeCloseTo(1, 4);
  });

  it('相位是位移不是穿模：闪的路上有墙就停在墙这一侧', () => {
    const world = makeWorld([{ x: 0, z: -3, hx: 6, hz: 0.4 }]);
    const e = spawn(makeManager({ world }), { type: 'wraith', x: 0, z: -8, moves: ['phase'] });
    expect(e.blinkBehind(v(0, 0), world.collision, ENEMY_MOVES.phase)).toBe(true);
    expect(e.position.z).toBeLessThan(-3);                            // 没穿过去
  });

  it('真跑一遍：8 米外起手，命中段真的落到玩家背后并把这一刀砍实', () => {
    const m = makeManager();
    const player = v(0, 0);
    const ref = makePlayerRef();
    const e = spawn(m, { type: 'wraith', x: 8, z: 0, moves: ['phase'], ai: NEVER_LEAVES, hp: 9999, posture: 9999 });
    expect(until(m, 6, DT, player, ref, () => e.state === 'windup' && e.activeMove?.name === '相位突袭')).toBe(true);
    expect(until(m, 3, DT, player, ref, () => ref.hits.length > 0)).toBe(true);
    expect(e.position.x).toBeLessThan(0);                             // 翻到了玩家另一侧
    expect(ref.hits).toEqual([Math.round(e.damage * ENEMY_MOVES.phase.damage)]);
  });

  it('闪下坡一样算命中：贴地基准要跟着位置当场走，不能等这一帧末尾（B67）', () => {
    // 起手点在 12 米高的台上、落点在平地 —— 这是"动自己"的招独有的竖直落差，
    // 全靠 `hurtBaseY()` 现算。它读的是 `mesh.position.y`，少一次同步就会拿台顶的高度去比玩家。
    const world = makeWorld();
    world.getGroundHeight = (x) => (x > 4 ? 12 : 0);
    const m = makeManager({ world });
    const player = v(0, 0);
    const ref = makePlayerRef();
    const e = spawn(m, { type: 'wraith', x: 8, z: 0, moves: ['phase'], ai: NEVER_LEAVES, hp: 9999, posture: 9999 });
    expect(until(m, 6, DT, player, ref, () => e.state === 'windup' && e.activeMove?.name === '相位突袭')).toBe(true);
    expect(e.hurtBaseY()).toBeGreaterThan(10);                        // 起手时确实站在台上
    expect(until(m, 3, DT, player, ref, () => ref.hits.length > 0)).toBe(true);
    expect(e.hurtBaseY()).toBeCloseTo(e.hover, 4);                    // 落地那一帧就已经贴到平地
    expect(e.position.x).toBeLessThan(0);
  });
});

describe('蓄力炮击：同一根链路，靠读得出来的代价换权重', () => {
  it('比虚能弹更贵、更重、更远、更快 —— 每一项都是玩家一眼能读出的差别', () => {
    const c = ENEMY_MOVES.charge;
    const s = ENEMY_MOVES.shot;
    expect(c.windup).toBeGreaterThan(s.windup * 1.5);
    expect(c.damage).toBeGreaterThan(s.damage * 2);
    expect(c.cooldown).toBeGreaterThan(s.cooldown * 3);
    expect(c.range).toBeGreaterThan(s.range);
    expect(c.ranged.speed).toBeGreaterThan(s.ranged.speed);
  });

  it('"更显眼"要落在玩家真看得见的那两个数上：前摇分级 + 圈半径现算', () => {
    /* 表里曾经有一个 `telegraph.ring`（这一招写 1.6、虚能弹写 0.9），但那是个**没人读的数字** ——
     * 圈画多大由 `Enemy.teleRadius()` 从 `moveRange` / `aoe` 现算，两条远程招的圈一样大。
     * 这条用例改盯真正画出去的东西：前摇跨过 `telegraphMarkWindup` 多少（头顶警示亮多久）
     * 与 `teleRadius()` 的取值来源。 */
    const c = ENEMY_MOVES.charge;
    const s = ENEMY_MOVES.shot;
    expect(c.windup).toBeGreaterThan(AI.telegraphMarkWindup);
    expect(s.windup).toBeGreaterThan(AI.telegraphMarkWindup);
    expect(c.windup - AI.telegraphMarkWindup).toBeGreaterThan(s.windup - AI.telegraphMarkWindup);
    const { e } = duel({ type: 'sentinel', x: 8, z: 0 });
    e.activeMove = c;
    expect(e.teleRadius()).toBe(e.attackRange);        // 远程只给自己一圈起手提示
    e.activeMove = ENEMY_MOVES.slam;
    expect(e.teleRadius()).toBe(ENEMY_MOVES.slam.aoe); // 范围招画的才是真实危险半径
  });

  it('命中段交出的是一枚弹体（不当场扣血），伤害与速度按本招自己的数走', () => {
    const projectiles = makeProjectileStub();
    const m = makeManager({ projectiles });
    const ref = makePlayerRef();
    const e = spawn(m, { type: 'sentinel', x: 8, z: 0, moves: ['charge'], ai: NEVER_LEAVES });
    e.sense.update(DT, v(0, 0), null);
    e.mesh.rotation.y = -Math.PI / 2;                                  // 正对玩家
    e.beginMove();
    expect(e.activeMove.name).toBe('蓄力炮击');
    e.landStrike({ target: v(0, 0), playerRef: ref, projectiles });
    expect(projectiles.fired).toHaveLength(1);
    expect(projectiles.fired[0]).toMatchObject({
      damage: Math.round(e.damage * ENEMY_MOVES.charge.damage),
      speed: ENEMY_MOVES.charge.ranged.speed,
      color: ENEMY_MOVES.charge.ranged.color,
    });
    expect(ref.hits).toHaveLength(0);
  });

  it('射程与贴脸闸：17 米判空、16 米判中，4.5 米以内不许起手', () => {
    const { e } = duel({ type: 'sentinel', x: 8, z: 0 });
    expect(moveHits(e, ENEMY_MOVES.charge, 16, -1)).toBe(true);        // 全向招：不看朝向
    expect(moveHits(e, ENEMY_MOVES.charge, 17, -1)).toBe(false);
    expect(moveUsable(e, ENEMY_MOVES.charge, 3, 1)).toBe(false);
    expect(moveUsable(e, ENEMY_MOVES.charge, 9, 1)).toBe(true);
  });
});

describe('嚎叫引援：召唤的第二份数据', () => {
  it('不伤人、没有打击带、冷却取全场最长 —— 它是"叫援"不是"咬人"', () => {
    const h = ENEMY_MOVES.howl;
    expect(h.damage).toBe(0);
    expect(h.band).toBeUndefined();
    expect(h.summon).toEqual({ type: 'stalker', count: 2 });
    const 最长 = Math.max(...Object.values(ENEMY_MOVES).map((m) => m.cooldown));
    expect(h.cooldown).toBe(最长);
  });

  it('名额不足时这一招从可选池里消失（不许抢到坑再空唱一段）', () => {
    const e = spawn(makeManager(), { type: 'stalker', x: 2, z: 0, moves: ['howl'] });
    e.summonQuota = 1;
    expect(moveUsable(e, ENEMY_MOVES.howl, 2, 1)).toBe(true);
    e.summonQuota = 0;
    expect(moveUsable(e, ENEMY_MOVES.howl, 2, 1)).toBe(false);
    expect(hasUsableMove(e, 2, 1)).toBe(false);
  });

  it('真跑一遍：命中段呼来两只同类，归它自己管、也是消耗品那一套数值', () => {
    const { m, player, ref, e } = duel({
      type: 'stalker', x: 2.4, z: 0, moves: ['howl'], hp: 99999, posture: 99999,
      ai: { ...NEVER_LEAVES, parryRatio: 9 },
    });
    expect(until(m, 14, DT, player, ref, () => m._summons.size > 0)).toBe(true);
    const 召唤物 = [...m._summons].filter((s) => s.summoner === e);
    expect(召唤物).toHaveLength(2);
    for (const s of 召唤物) {
      expect(s.isSummon).toBe(true);
      expect(s.type).toBe('stalker');            // 叫来的是同类，不是切片1 的士兵
      expect(s.hp).toBe(SUMMON.hp);
    }
  });
});

/**
 * 「专属招真的会被选中吗」—— 上面那些用例钉的是"选得中怎么算对"，这一节钉的是"选不选得中"。
 *
 * 为什么要单起一节：三条专属招最初都写对了判据，但相位突袭在真 AI 里 **90 秒 42 次出手里
 * 一次都没出过** —— 它的 `minDist`（3 米）与怨影的甜点位（`holdRangeOf` 选出的 3.0 米）正好
 * 同值，而追击是"跨过就收脚"，每帧 0.1 米的余量把实战距离压到 2.9 米，于是它永远在窗口外。
 * 判据全绿、招式全对、玩家一次也见不到 —— 这一族只有"拿真 AI 跑一段、数出场次数"看得见。
 *
 * 随机数在这里换成固定种子：生产里按身份播种（每次运行一致、同一群不整齐），用例要的是
 * **可复现的读数**，所以把它钉死；跑的仍是同一条 `pickMove` 路径。
 */
describe('专属招在自己的甜点位上可用，而且在真 AI 里真的出场', () => {
  /** [类型, 招式 id, 招式名, 五轮里至少出场几次] —— 阈值取实测值的一半左右，留出抖动的余地 */
  const 专属 = [
    ['wraith', 'phase', '相位突袭', 4],
    ['stalker', 'howl', '嚎叫引援', 2],
    ['sentinel', 'charge', '蓄力炮击', 4],
  ];

  it('三类敌人的甜点位都容得下自己的专属招，且不是"擦着边"（留 5% 余量）', () => {
    for (const [type, , name] of 专属) {
      const { m, player, ref, e } = duel({ type, x: 6, z: 0, ai: NEVER_LEAVES });
      // 先跑一帧：召唤名额由管理器每帧盖在敌人身上，`嚎叫引援` 的可选性读它
      m.update(DT, player, ref, null, null);
      const 招 = e.moves.find((x) => x.name === name);
      expect(招, `${type} 的招式表里有 ${name}`).toBeTruthy();
      const 甜点位 = holdRangeOf(e);
      expect(moveUsable(e, 招, 甜点位, 2), `${type} 站在甜点位 ${甜点位} 米却用不出 ${name}`).toBe(true);
      expect(
        moveUsable(e, 招, 甜点位 * 0.95, 2),
        `${type} 的甜点位只擦着 ${name} 的边：收脚余量一压就出窗口（相位突袭那次就是这条）`,
      ).toBe(true);
    }
  });

  it('五个选招序列各跑 30 秒：专属招轮轮都真的出场过（种子固定，读数可复现）', () => {
    for (const [type, , name, 阈值] of 专属) {
      const 每轮 = [];
      let 累计 = 0;
      for (const 种子 of [1, 2, 3, 4, 5]) {
        const { m, player, ref, e } = duel({
          type, x: 6, z: 0, hp: 99999, posture: 99999, ai: NEVER_LEAVES,
        });
        // 生产方式是按身份播种（`aiSeed * 7919 + 13`）；这里钉死种子，换的是可复现性，不是路径
        e.moveRng = seededRng(种子 * 7919 + 13);
        let 次数 = 0;
        let 上一招 = null;
        for (let i = 0; i < Math.round(30 / DT); i += 1) {
          m.update(DT, player, ref, null, null);
          const n = e.activeMove?.name ?? null;
          if (n && n !== 上一招 && n === name) 次数 += 1;
          上一招 = n;
        }
        每轮.push(次数);
        累计 += 次数;
      }
      const 出场轮数 = 每轮.filter((n) => n > 0).length;
      const 读数 = `${type} 五个序列里「${name}」逐轮出场 ${JSON.stringify(每轮)}`;
      expect(累计, `${读数} —— 五轮 150 秒一共只有 ${累计} 次`).toBeGreaterThanOrEqual(阈值);
      // 单独的"不是靠某一个序列碰巧"：五轮里至少四轮都出过（实测 5/5、4/5、5/5）
      expect(出场轮数, `${读数} —— 只有 ${出场轮数} 轮出场`).toBeGreaterThanOrEqual(4);
    }
  });
});
