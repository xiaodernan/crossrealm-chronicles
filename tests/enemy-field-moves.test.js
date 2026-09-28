/**
 * 场地招 / 附赠位移 / 范围连段 —— W-B7 切片3：裂隙 / 盾击 / 旋舞。
 *
 * 切片2 留下的一条教训写在这里：判据全绿、数值全对，玩家却一次也见不到那招
 * （相位突袭最初 90 秒 42 次出手里 0 次出场）。所以这个文件每类都拿真 AI 跑一段、
 * 数出场次数，不只比表里的数字。
 *
 * 三条各是引擎里此前没有的一种招式形状：
 *
 * - `hazard`（裂隙）：命中段**不打此刻的玩家**，而是把"玩家脚下这块地"交给
 *   `GroundHazards`，伤害按段落下，圈的生命周期与施法者**解耦**。`aoe`（崩地）做不到：
 *   那个圈长在敌人自己脚下，它一倒地整招就消失。
 * - `knock`（盾击）：近战那一刀之外多一步"把人推开"，走玩家的**外部冲量账**
 *   （W-A6 切片6 那条纪律：写 `velocity` 会被玩家状态机下一帧整条改写回来）。
 * - `aoe × combo`（旋舞）：第一次把"范围"与"连段"合在同一条招上 —— 三段之间不换人、
 *   不交进攻名额，要躲只能真的跑出那个圈。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENEMY_MOVES, ENEMY_MOVE_SETS } from '../src/content/tuning.js';
import {
  holdRangeOf, moveHits, moveRange, moveUsable, readyStandoffMove, seededRng,
} from '../src/combat/EnemyMoves.js';
import { resolveEnemyState } from '../src/ai/EnemyFSM.js';
import {
  installWindowShim, makeManager, makePlayerRef, v, run, until, NEVER_LEAVES, spawn, duel,
} from './helpers/enemyHarness.js';

beforeAll(installWindowShim);

const DT = 1 / 60;
const ROOT = process.cwd();

/** 专属招的"专属"必须是可检验的：反查有哪几类持有它 */
const ownersOf = (moveId) =>
  Object.entries(ENEMY_MOVE_SETS).filter(([, ids]) => ids.includes(moveId)).map(([t]) => t);

/** 一条只出招一次的用例脚手架：`moves` 锁死单一招式，`speed: 0` 让它不会追上来的那种"移动" */
const soloDuel = (type, moveId, x) => {
  const m = makeManager();
  const player = v(0, 0);
  const ref = makePlayerRef();
  const e = spawn(m, { type, x, z: 0, moves: [moveId], ai: NEVER_LEAVES, hp: 99999, posture: 99999 });
  return { m, player, ref, e };
};

describe('W-B7 切片3：三条专属招各归一类', () => {
  it('裂隙只属于虚空爬兽', () => {
    expect(ownersOf('rift')).toEqual(['crawler']);
  });

  it('盾击只属于深渊骑士', () => {
    expect(ownersOf('bash')).toEqual(['knight']);
  });

  it('旋舞只属于刃舞者', () => {
    expect(ownersOf('whirl')).toEqual(['dancer']);
  });

  it('三条都进了全局招式表，三类都还满足切片1 的名册下限（≥3 招）', () => {
    for (const id of ['rift', 'bash', 'whirl']) {
      expect(ENEMY_MOVES[id], id).toBeTruthy();
      expect(typeof ENEMY_MOVES[id].telegraph?.color, `${id}.telegraph.color`).toBe('number');
    }
    for (const t of ['crawler', 'knight', 'dancer']) {
      expect(ENEMY_MOVE_SETS[t].length, t).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('裂隙：伤害不在这一帧，在那块地上', () => {
  it('够得着是"圈能丢多远"（7 米），预警圈却只画起手提示 —— 圈不许吹成七米', () => {
    /* 按 `moveRange` 画的话，玩家后退七米会以为躲开了，而那块地还是在原处开：
     * 圈要说的是"离开哪儿"，不是"离我多远"。伤害会离开身体的招一律走同一条例外
     * （远程的 `shot` / `charge` 就是这么处理的）。 */
    const { e } = duel({ type: 'crawler', x: 5, z: 0 });
    const rift = ENEMY_MOVES.rift;
    expect(moveRange(e, rift)).toBe(rift.range);
    expect(rift.range).toBeGreaterThan(e.attackRange);        // 抛掷距离确实比刀长
    e.activeMove = rift;
    expect(e.teleRadius()).toBe(e.attackRange);               // 与远程同一档：起手提示，不是承诺
    expect(e.teleRadius()).toBeLessThan(rift.range);          // 不是把"丢得到"画成"危险到"
  });

  it('只留裂隙时，这一招的起手点在自己的刀长之外（6 米 ≠ 2.17 米）', () => {
    /* 这一条是变异见证臂6 补上来的洞：把 `moveRange` 的 hazard 分支关掉之后，起手点从
     * 6.00 米塌成 2.17 米 —— 圈还在、伤害还在按段结、出场次数还够，全部判据照旧绿，
     * 唯独"它从多远开这一招"这件事变了。甜点位那一格抓不到它，因为甜点位本身就是从同一个
     * `moveRange` 推出来的（函数塌了，点位跟着塌，两边永远自洽）。所以这里钉的是**独立的事实**：
     * 起手距离必须明显大于它自己的刀长（`attackRange` 是配置，不由被检函数推导）。
     * 实测 6.00 米 / 变异 2.17 米，门槛取中间偏保守的 4 米。
     *
     * 说清楚这一格量的是什么、不量什么：它用的是只留裂隙那张招式表，所以量的是
     * "`range` 这一格真的参与决定够得着"。**不是**"游戏里爬兽会从 6 米丢圈" ——
     * 真名册三招齐全，`holdRange` 被两招近战（3.3 米）顶着，浏览器与同一张全表的隔离跑
     * 都读到起手在 3.2~3.3 米：那 7 米够得着在实战里一次也没用上。这条差别的处置在
     * 计划 §1.4（B69）与切片4。 */
    const { m, player, ref, e } = soloDuel('crawler', 'rift', 6);
    expect(until(m, 12, DT, player, ref, () => e.state === 'windup' && e.activeMove?.name === '裂隙')).toBe(true);
    expect(e.distanceTo(player), '起手时它已经走进刀长了 —— 那就不叫"丢圈"，叫"搁脚底下"')
      .toBeGreaterThan(e.attackRange + 2);
  });

  it('命中段那一帧一次血也不掉，交出的圈开在玩家脚下而不是敌人脚下', () => {
    const { m, player, ref, e } = soloDuel('crawler', 'rift', 5);
    expect(until(m, 8, DT, player, ref, () => m.hazards.count() > 0)).toBe(true);
    expect(ref.hits, '裂隙的命中段不该当场扣血：伤害在那块地上按段结').toHaveLength(0);
    const it = m.hazards._items[0];
    expect(it.x).toBeCloseTo(player.x, 6);                    // 圆心 = 玩家此刻站的那块地
    expect(it.z).toBeCloseTo(player.z, 6);
    expect(Math.hypot(it.x - e.position.x, it.z - e.position.z), '圈不该长在施法者脚下')
      .toBeGreaterThan(e.attackRange);
    expect(it.owner).toBe(e);
    expect(it.radius).toBe(ENEMY_MOVES.rift.hazard.radius);
  });

  it('圈自己还要走一段预警才落地：前摇之外另给 1.1 秒走出去', () => {
    const { m, player, ref } = soloDuel('crawler', 'rift', 5);
    expect(until(m, 8, DT, player, ref, () => m.hazards.count() > 0)).toBe(true);
    const it = m.hazards._items[0];
    // 圈刚交出去时还没落地；跑完它自己的 telegraph 之前一次都不该结
    run(m, ENEMY_MOVES.rift.hazard.telegraph * 0.6, DT, player, ref);
    expect(it.done, '圈不许在预警没走完时就落地').toBe(false);
    expect(ref.hits).toHaveLength(0);
    expect(until(m, 3, DT, player, ref, () => ref.hits.length > 0)).toBe(true);
  });

  it('按段掉的这一笔**不经过打击带**：这正是裂隙没有 `band` 的理由', () => {
    const { m, player, ref, e } = soloDuel('crawler', 'rift', 5);
    expect(until(m, 8, DT, player, ref, () => ref.hits.length > 0)).toBe(true);
    run(m, 3, DT, player, ref);
    expect(ref.hits.length).toBeGreaterThan(1);
    // 每一笔都是 `takeDamage(damage)`，一个 part 都不递 —— 表里若还配 `band`，
    // 那个数字就是没人读的格子（`enemy-moves.test.js` 的豁免条款就靠这一条撑着）
    expect(ref.parts.every((p) => p === null), JSON.stringify(ref.parts)).toBe(true);
    expect(ref.hits.every((n) => n === Math.round(e.damage * ENEMY_MOVES.rift.hazard.damage)),
      '每段掉的血 = 本体伤害 × hazard.damage').toBe(true);
    // 掉得动（>0），却与招式自己的 `damage` 乘数无关 —— 那一格是 0，因为"当场那一击"根本不存在。
    // `enemy-moves.test.js` 把 hazard 招的 `damage` 钉成 0，靠的就是这一对读数
    expect(ref.hits[0]).toBeGreaterThan(0);
    expect(ENEMY_MOVES.rift.damage).toBe(0);
  });

  it('走出去就停：圈要的是脚离开那块地，不是那一帧闪一下', () => {
    // 对照组：站着不动会连着掉
    const stand = soloDuel('crawler', 'rift', 5);
    run(stand.m, 6, DT, stand.player, stand.ref);
    expect(stand.ref.hits.length).toBeGreaterThan(1);

    // 预警期内离开：一次都不该掉（那 1.1 秒就是留给脚的）
    const esc = soloDuel('crawler', 'rift', 5);
    let 离开过 = false;
    for (let i = 0; i < Math.round(6 / DT); i += 1) {
      esc.m.update(DT, esc.player, esc.ref, null, null);
      const it = esc.m.hazards._items[0];
      if (!离开过 && it && !it.done) {
        esc.player.set(20, 0, 0);
        it.owner.attackCooldown = 999;                        // 只留这一个圈，别把第二次施法混进来
        离开过 = true;
      }
    }
    expect(离开过, '用例没等到圈铺出来，等于什么都没测').toBe(true);
    expect(esc.ref.hits, '圈还在预警就离开了，落地那拍不该算数').toHaveLength(0);

    // 域已经开了才离开：落地那一拍仍算数（人当时确实在里面），但之后一段都不再掉
    const mid = soloDuel('crawler', 'rift', 5);
    let 撒手时 = null;
    let 之后 = 0;
    for (let i = 0; i < Math.round(12 / DT); i += 1) {
      mid.m.update(DT, mid.player, mid.ref, null, null);
      const it = mid.m.hazards._items[0];
      if (撒手时 === null && it?.active) {
        撒手时 = mid.ref.hits.length;
        mid.player.set(20, 0, 0);
        it.owner.attackCooldown = 999;
        continue;
      }
      if (撒手时 !== null) 之后 = mid.ref.hits.length;
    }
    expect(撒手时, '没等到域开始，"走出去就不再挨段"这条没被检验').toBeGreaterThan(0);
    expect(之后, '域开着的时候走出去，之后不该再掉血').toBe(撒手时);
  });

  it('施法者当场倒下，圈照样落下并按段结：生命周期解耦是设计，不是没人接线', () => {
    /* `Boss.die()` 会 `cancelFor(this)` 把它**还没落下**的 slam 圈撤掉（那个圈长在它自己脚下，
     * 主人死了还从坟里砸人一下最难解释）。裂隙走的是另一条：圈已经在玩家脚下那块地上，
     * "打死它"不该等于"这块地愈合了" —— 唯一的解法是那 1.1 秒走出去。 */
    const { m, player, ref, e } = soloDuel('crawler', 'rift', 5);
    expect(until(m, 8, DT, player, ref, () => m.hazards.count() > 0 && !m.hazards._items[0].done)).toBe(true);
    e.die();
    expect(until(m, 3, DT, player, ref, () => ref.hits.length > 0)).toBe(true);
    expect(e.alive).toBe(false);
    expect(m.hazards.count(), '圈不该跟着主人一起消失').toBeGreaterThanOrEqual(1);
  });

  it('表里每一条带 hazard 的招都真能铺到地上（`GroundHazards` 的 fail-closed 校验不许当场抛）', () => {
    const 带场地的 = Object.entries(ENEMY_MOVES).filter(([, mv]) => mv.hazard);
    expect(带场地的.length, '一张场地招都没有，这条用例就在空转').toBeGreaterThanOrEqual(1);
    for (const [id, mv] of 带场地的) {
      const { m, ref, e } = soloDuel('crawler', id, 3);
      let 抛了什么 = null;
      try {
        e.activeMove = { ...mv };
        e.landStrike({ target: v(0, 0), playerRef: ref, hazards: m.hazards, collision: m.world.collision });
      } catch (err) { 抛了什么 = err.message; }
      expect(抛了什么, `${id} 的 hazard 规格被 GroundHazards 当场拒绝`).toBeNull();
      expect(m.hazards.count(), `${id} 铺不出圈`).toBe(1);
    }
  });

  it('推开玩家这件事只走外部冲量账：敌人侧不许直接给谁的速度赋值', () => {
    const 源码 = readFileSync(join(ROOT, 'src', 'combat', 'Enemy.js'), 'utf8');
    expect(/ref\.applyKnockback\(/.test(源码),
      '敌人侧的推开必须经 `applyKnockback` 出门：直接写进 `velocity` 的那一笔，下一帧就被玩家状态机整条改写回来').toBe(true);
    expect(/\.velocity\s*=[^=]/.test(源码),
      'Enemy.js 里出现了给 `.velocity` 赋值的写法 —— 位移一律走 `setWish` 与冲量账这两本账').toBe(false);
  });
});

describe('盾击：砍到了才推，推开记在玩家的外力账上', () => {
  it('这一刀之外多一步位移：掉一次血、记一笔冲量，方向是"离敌人而去"', () => {
    const { m, player, ref, e } = soloDuel('knight', 'bash', 1.8);
    expect(until(m, 6, DT, player, ref, () => ref.hits.length > 0)).toBe(true);
    expect(ref.hits).toEqual([Math.round(e.damage * ENEMY_MOVES.bash.damage)]);
    expect(ref.tugs).toHaveLength(1);
    const tug = ref.tugs[0];
    expect(tug.speed).toBe(ENEMY_MOVES.bash.knock);
    expect(Math.hypot(tug.dx, tug.dz)).toBeCloseTo(1, 6);     // 记的是单位方向 × 初速
    const ax = player.x - e.position.x;                       // 敌人指向玩家
    const az = player.z - e.position.z;
    expect(tug.dx * ax + tug.dz * az, '推开方向要把玩家推离敌人，不是拽进来')
      .toBeGreaterThan(0);
  });

  it('无敌帧那一下不打人，也不附赠位移 —— 闪避成功了不该反被推飞', () => {
    const { m, player, ref } = soloDuel('knight', 'bash', 1.8);
    ref.invulnerable = true;
    run(m, 6, DT, player, ref);
    expect(ref.hits).toHaveLength(0);
    expect(ref.tugs, '无敌帧挡的是这一整手，不只是那行数字').toHaveLength(0);
  });

  it('跳起来躲过低段：血不掉，位移也不记（band 与 knock 共用同一道闸）', () => {
    const { m, player, ref } = soloDuel('knight', 'bash', 1.8);
    ref.y = 2.0;                                              // 玩家受击盒的离地基准（跳起来）
    run(m, 6, DT, player, ref);
    expect(ref.hits, '低段招该被跳掉：这一刀的打击带覆盖不到 2 米高处').toHaveLength(0);
    expect(ref.tugs, '打空的一刀不该附赠位移，否则跳跃被惩罚').toHaveLength(0);
  });

  it('打击带是低段：站着必中、跳起来全空 —— 与高段重劈在这一格分家', () => {
    const { e } = duel({ type: 'knight', x: 1.8, z: 0 });
    const bash = ENEMY_MOVES.bash;
    expect(bash.band[0]).toBeLessThan(1);                     // 低到能被跳掉
    expect(moveHits(e, bash, 1.8, 1)).toBe(true);
    expect(moveHits(e, bash, e.attackRange + bash.reach, 1)).toBe(true);
    expect(moveHits(e, bash, e.attackRange + bash.reach + 0.2, 1)).toBe(false);
  });
});

describe('旋舞：范围与连段第一次合在同一条招上', () => {
  it('三段各掉一次血，后续两段的前摇是压缩后的 `comboWindup`', () => {
    const { m, player, ref, e } = soloDuel('dancer', 'whirl', 1.5);
    const 前摇 = [];
    let 上一态 = null;
    for (let i = 0; i < Math.round(4 / DT); i += 1) {
      m.update(DT, player, ref, null, null);
      if (e.state !== 上一态) {
        if (e.state === 'windup') 前摇.push(e.windupNow);
        上一态 = e.state;
      }
      if (前摇.length >= 3) break;
    }
    const w = ENEMY_MOVES.whirl;
    expect(前摇, '旋舞该走满三段，且段间前摇取自表里那一格').toEqual([w.windup, w.comboWindup, w.comboWindup]);
    // 采到第三个前摇时那一段还没落地：接着跑到三段结完为止（上限 4 秒，跑不满就是没走完）
    until(m, 4, DT, player, ref, () => ref.hits.length >= w.combo);
    expect(ref.hits.length).toBe(w.combo);
    const 每段 = Math.round(e.damage * w.damage);
    expect(ref.hits.every((n) => n === 每段), `每段都该是 ${每段}，实际 ${JSON.stringify(ref.hits)}`).toBe(true);
    expect(ref.parts.every((p) => p && p.id), '范围招的伤害仍要过打击带（与裂隙正好相反）').toBe(true);
  });

  it('段的边界就是圈的边界：2.5 米三段全中、3.5 米连起手都不会（静止对照，排除"追上来才打中"）', () => {
    const near = soloDuel('dancer', 'whirl', 2.5);
    near.e.speed = 0;
    run(near.m, 4, DT, near.player, near.ref);
    expect(near.ref.hits.length).toBe(ENEMY_MOVES.whirl.combo);

    const far = soloDuel('dancer', 'whirl', 3.5);
    far.e.speed = 0;
    run(far.m, 4, DT, far.player, far.ref);
    expect(far.e.state, '圈外的敌人起手了：预警在说谎').not.toBe('windup');
    expect(far.ref.hits).toHaveLength(0);
    expect(moveHits(far.e, ENEMY_MOVES.whirl, 3.5, 1)).toBe(false);
  });

  it('段与段之间重新判距离：第一段之后跨出圈外，剩下两段落空', () => {
    const { m, player, ref, e } = soloDuel('dancer', 'whirl', 1.5);
    e.speed = 0;                                              // 钉在原地：只许"玩家自己跨出去"改变距离
    expect(until(m, 4, DT, player, ref, () => ref.hits.length > 0)).toBe(true);
    player.set(0, 0, 10);                                     // 跨出圈外（圈半径见下）
    expect(e.distanceTo(player)).toBeGreaterThan(ENEMY_MOVES.whirl.aoe);
    run(m, 3, DT, player, ref);
    expect(ref.hits.length, '连段不该在起手那一帧就把后面两段也判中').toBe(1);
  });

  it('连段全程占着同一个进攻名额：段与段之间不交还，别人插不进来', () => {
    const { m, player, ref, e } = soloDuel('dancer', 'whirl', 1.5);
    // 只在"已经抢到名额"到"进收招"这一段取样：之前名额本来就是空的，之后是它自己让位
    const 读数 = [];
    let 抢到了 = false;
    let 中途撒手 = false;
    for (let i = 0; i < Math.round(4 / DT); i += 1) {
      m.update(DT, player, ref, null, null);
      if (!抢到了 && m.squad.holds(e)) 抢到了 = true;
      if (!抢到了) continue;
      if (e.state === 'recover') break;                      // 走完让位是应该的，不算撒手
      if (!m.squad.holds(e)) 中途撒手 = true;
      读数.push(m.squad.busy);
    }
    expect(抢到了, '旋舞始终没抢到进攻名额，这条用例在空转').toBe(true);
    expect(读数.length, '只采到一帧，等于没测到"段与段之间"').toBeGreaterThan(30);
    expect(中途撒手, '连段中途撒手：下一段就会被别占坑的敌人插进来').toBe(false);
    expect([...new Set(读数)], '从起手到收招，围攻名额数应恒为 1（不换人、不交还）').toEqual([1]);
    expect(ref.hits.length).toBe(ENEMY_MOVES.whirl.combo);   // 三段真的走完了
  });

  it('三段之间不给"退一步再退回来"的空档：一整套走完比单段崩地的后撤短', () => {
    const w = ENEMY_MOVES.whirl;
    const 整套 = w.windup + w.comboWindup * (w.combo - 1) + w.strike * w.combo;
    expect(整套).toBeLessThan(w.cooldown);                    // 打完这轮真的有余力冷却
    expect(w.comboWindup).toBeLessThan(w.windup);             // 后续段更快，空档才小
  });
});

/**
 * 「专属招真的会被选中吗」—— 上面钉的是"选得中怎么算对"，这一节钉的是"选不选得中"。
 *
 * 阈值取实测值的一半左右（裂隙 11 / 盾击 10 / 旋舞 12 次，五轮种子各 30 秒），
 * 留出抖动的余地；"五轮里至少四轮出场"防的是靠某一个序列碰巧。
 */
describe('三类专属招在自己的甜点位上可用，而且在真 AI 里真的出场', () => {
  const 专属 = [
    ['crawler', 'rift', '裂隙', 5],
    ['knight', 'bash', '盾击', 5],
    ['dancer', 'whirl', '旋舞', 6],
  ];

  it('三类敌人的甜点位都容得下自己的专属招，且不是"擦着边"（留 5% 余量）', () => {
    for (const [type, , name] of 专属) {
      const { m, player, ref, e } = duel({ type, x: 6, z: 0, ai: NEVER_LEAVES });
      m.update(DT, player, ref, null, null);                  // 召唤名额等每帧才盖上
      const 招 = e.moves.find((x) => x.name === name);
      expect(招, `${type} 的招式表里有 ${name}`).toBeTruthy();
      const 甜点位 = holdRangeOf(e);
      expect(moveUsable(e, 招, 甜点位, 2), `${type} 站在甜点位 ${甜点位} 米却用不出 ${name}`).toBe(true);
      expect(moveUsable(e, 招, 甜点位 * 0.95, 2),
        `${type} 的甜点位只擦着 ${name} 的边：收脚余量一压就出窗口`).toBe(true);
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
      expect(出场轮数, `${读数} —— 只有 ${出场轮数} 轮出场`).toBeGreaterThanOrEqual(4);
    }
  });
});
/** 数一次"这一招起手了"：连续帧只算一次（`activeMove` 在整段里都不变） */
const 出招序列 = (m, seconds, player, ref, e) => {
  const 序 = [];
  let 上一招 = null;
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    m.update(DT, player, ref, null, null);
    const n = e.activeMove?.name ?? null;
    if (n && n !== 上一招) 序.push({ 招: n, 距离: e.distanceTo(player), 时刻: i * DT });
    上一招 = n;
  }
  return 序;
};

/**
 * B69：站位诉求（`standoff`）—— "身体是近战、手里却有一招远距形状"的敌人不必先贴脸。
 *
 * 成因不是招本身弱，是**站位规则**：`holdRangeOf` 取"同时可出的招最多"的那个边界，两招近战
 * （3.30 米）把裂隙的 7 米顶掉，于是它永远先走到脸上才丢圈（实测起手 3.25 米 / 20 秒里三次
 * 都在脸上）。这一节钉两头：
 *
 * - **声明那头**（带子真有人拿、真落在够得着的范围里、带子里真的用得出）：防的是"写了没人读"
 *   —— 这是 B68 一族在招式表上的版本，与技能树 `effect` 白名单同型；
 * - **行为那头**（开场从带子里丢一次、然后照旧进来打近战）：只钉声明的话，把
 *   `readyStandoffMove` 从状态机里整条摘掉照样全绿 —— 那条路才是这一片真正修的东西。
 *
 * 还有一条**反过来的洞**是本片量出来才补上的：只看距离时，丢完圈的那 8.5 秒冷却里敌人会站在
 * 等待环上（`orbitKeep` 1.5 × 3.30 = 4.95 米，恰好落在诉求带内）干等，**近战那半条命整条消失**
 * （30 秒 × 5 种子：裂隙 20 次、近战 0 次）。所以"想用"里必须带上"现在真的能出手"。
 */
describe('B69：站位诉求（`standoff`）不让近战敌人的远招被自己的身位顶掉', () => {
  const 带诉求 = Object.entries(ENEMY_MOVES).filter(([, m]) => Array.isArray(m.standoff));

  it('声明是活的：真有人拿、带子落在自己够得着的范围里、在带子里三段距离都用得出', () => {
    expect(带诉求.length, '一条 `standoff` 都没有 —— 这一节在空转').toBeGreaterThan(0);
    for (const [id, move] of 带诉求) {
      const 持有者 = ownersOf(id);
      expect(持有者.length, `${id} 写在表里却没有任何敌人拿它：那是一条谁也读不到的声明`).toBeGreaterThan(0);
      const [lo, hi] = move.standoff;
      expect(hi, `${id}.standoff ${JSON.stringify(move.standoff)} 不是一个 [近, 远] 带子`).toBeGreaterThan(lo);
      expect(lo).toBeGreaterThanOrEqual(0);
      for (const t of 持有者) {
        const { m, player, ref, e } = duel({ type: t, x: 6, z: 0, ai: NEVER_LEAVES });
        m.update(DT, player, ref, null, null);              // 召唤名额等每帧才盖上
        expect(moveRange(e, move), `${t} 拿 ${id} 时够不着 ${hi} 米：带子的远界写在射程之外`)
          .toBeGreaterThanOrEqual(hi);
        for (const d of [lo, (lo + hi) / 2, hi]) {
          expect(moveUsable(e, move, d, 2), `${t} 站在 ${d} 米（正是自己的诉求带里）却用不出 ${id}`).toBe(true);
          expect(readyStandoffMove(e, d), `${t} 站在 ${d} 米时，"想用 ${id}"这件事没有被认出来`).toBe(true);
        }
        e.attackCooldown = 5;
        expect(readyStandoffMove(e, (lo + hi) / 2), '冷却里的敌人不该"想用"任何东西：它得先往前压').toBe(false);
      }
    }
  });

  it('爬兽从六米外先丢圈：第一次起手落在诉求带里，不是先走到 3.3 米', () => {
    const [lo, hi] = ENEMY_MOVES.rift.standoff;
    for (const 起点 of [6, 10]) {
      const m = makeManager();
      const player = v(0, 0);
      const ref = makePlayerRef();
      const e = spawn(m, { type: 'crawler', x: 起点, z: 0, ai: NEVER_LEAVES, hp: 99999, posture: 99999 });
      const 序 = 出招序列(m, 12, player, ref, e);
      const 首次 = 序[0];
      expect(首次?.招, `从 ${起点} 米起的第一招是 ${首次?.招}，不是裂隙（读到的序列 ${JSON.stringify(序)}）`).toBe('裂隙');
      expect(首次.距离, `从 ${起点} 米起，裂隙的起手点 ${首次.距离.toFixed(2)} 米落在诉求带 ${JSON.stringify(ENEMY_MOVES.rift.standoff)} 之外`)
        .toBeGreaterThanOrEqual(lo);
      expect(首次.距离, `起手点 ${首次.距离.toFixed(2)} 米超出了自己够得着的 ${hi} 米`).toBeLessThanOrEqual(hi);
    }
  });

  it('丢完照旧进来打近战：诉求带不是"站在圈外放风"的借口', () => {
    const m = makeManager();
    const player = v(0, 0);
    const ref = makePlayerRef();
    const e = spawn(m, { type: 'crawler', x: 6, z: 0, ai: NEVER_LEAVES, hp: 99999, posture: 99999 });
    const 序 = 出招序列(m, 30, player, ref, e);
    const [lo, hi] = ENEMY_MOVES.rift.standoff;
    const 带内裂隙 = 序.filter((x) => x.招 === '裂隙' && x.距离 >= lo && x.距离 <= hi);
    const 近战 = 序.filter((x) => x.招 !== '裂隙');
    expect(带内裂隙.length, `30 秒里没有一次"从诉求带里丢圈"：${JSON.stringify(序.map((x) => x.招 + '@' + x.距离.toFixed(2)))}`)
      .toBeGreaterThanOrEqual(1);
    expect(近战.length, `30 秒里一次近战都没出 —— 诉求带把近战那半条命挤掉了：${JSON.stringify(近战)}`)
      .toBeGreaterThanOrEqual(1);
    expect(Math.max(...近战.map((x) => x.距离)), '近战招不该在诉求带里出：那距离上它够不着')
      .toBeLessThan(lo);
  });

  it('诉求带之外照旧先贴脸：甜点位与带子之间那一小段仍然是 pursue', () => {
    const { e } = duel({ type: 'crawler', x: 5, z: 0, ai: NEVER_LEAVES });
    e.sense.alerted = true;
    expect(e.holdRange, '爬兽的甜点位（近战那两招定的）').toBeCloseTo(3.3, 5);
    e.attackCooldown = 0;
    e.sense.dist = 5;
    expect(resolveEnemyState(e, { canStrike: true }), '在诉求带里、手上有牌 → 当场起手').toBe('windup');
    expect(resolveEnemyState(e, { canStrike: false }), '在诉求带里但抢不到名额 → 等待环，不该一路贴到脸上').toBe('orbit');
    e.sense.dist = 3.4;
    expect(resolveEnemyState(e, { canStrike: false }), '带子之外（甜点位与 4.5 米之间）照旧先贴脸').toBe('pursue');
    e.sense.dist = 5;
    e.attackCooldown = 3;
    expect(resolveEnemyState(e, { canStrike: false }), '冷却里站在圈外干等 = 近战那半条命消失').toBe('pursue');
  });

  it('没有这一格的敌人一个都没被带动：十五类甜点位逐值钉住（本片改前改后同一个数）', () => {
    /* 这张表钉的是"本片没有连带改动别人的身位"，不是"这些数永远对"：
     * 有意重调某一招的 reach/range 时跟着改这里，并在提交信息里说明是重调。
     * 值 = 2026-09-29 在 `duel({ type })` 的默认 attackRange 下量出来的（见本片 §9 那条 ADR）。 */
    const 基线 = {
      soldier: 2.9, elite: 2.9, golem: 2.9, dummy: 2.2, boss: 2.9, default: 2.9,
      wraith: 3, stalker: 2.9, crawler: 3.3, knight: 2.9, dancer: 2.8, juggernaut: 2.9,
      drone: 5.5, sentinel: 13, hexer: 13,
    };
    for (const [t, 期望] of Object.entries(基线)) {
      const { m, player, ref, e } = duel({ type: t, x: 6, z: 0, ai: NEVER_LEAVES });
      m.update(DT, player, ref, null, null);
      expect(+holdRangeOf(e).toFixed(3), `${t} 的甜点位从 ${期望} 米动了`).toBe(期望);
    }
  });
});
