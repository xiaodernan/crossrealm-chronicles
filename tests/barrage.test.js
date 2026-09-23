/**
 * 落点圈阵列（W-A6 切片2，B5 第二档：大奥术师的弹幕）。
 *
 * 这一档要证明的不是"能打出伤害"，而是**这一招买的是玩家有没有在动**：
 * 1. **布局是纯几何**：没有随机数，同一份输入永远铺出同一张图 —— 手感出问题查数值表，
 *    而不是查一次能跑、下次跑不出来的用例。
 * 2. **由内向外错时落地**：圆心离玩家越远落得越晚，站住必吃内圈，起步就来得及脱出。
 * 3. **铺完即与施法者无关，但主人倒地时全撤**：与切片1 同一条纪律，阵列也一样。
 * 4. **不许铺到场外**：夹回竞技场内是"预警必须诚实"的另一半 —— 墙外的圈既走不进去也躲不开。
 * 5. **走自己的冷却**：与砸地的收招冷却互不抢，否则两招会互相顶掉。
 *
 * 时间一律喂 `dt`，与主循环同构；不碰渲染器。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { barrageLayout } from '../src/combat/BarragePattern.js';
import { MagicBoss } from '../src/combat/MagicBoss.js';
import { GROUND_HAZARD } from '../src/content/tuning.js';
import { BOSS_ARENA_SCRIPTS } from '../src/content/arenaScripts.js';
import {
  installWindowShim, makeWorld, makeScene, makePlayerRef, makeManager, v, until,
} from './helpers/enemyHarness.js';

const { barrage } = GROUND_HAZARD;
/** 弹幕"什么时候放"住在脚本表里（切片3）；本文件测的是铺出来的东西 */
const cast = BOSS_ARENA_SCRIPTS.archmagus.find((e) => e.move === 'barrage');
const realRandom = Math.random;

/** 整片阵列收场所需的时间：最后一枚的前摇 + 余像 */
const SETTLE = barrage.telegraph + barrage.stagger * (barrage.count - 1) + GROUND_HAZARD.linger + 0.5;

const radiusOf = (p) => Math.hypot(p.x, p.z);

beforeAll(() => {
  installWindowShim();
  // Boss 的出手选择里有 Math.random：用例要的是确定的那一条路径
  Math.random = () => 0.99;
});

afterAll(() => {
  Math.random = realRandom;
});

/**
 * 铺好一场弹幕的对局。
 *
 * `speed = 0`：Boss 的近战追击会往 `ref.hits` 里塞自己的伤害，那样"吃到几枚圈"
 * 就再也不是一个可读的数了。玩家距离取 10 米 —— 在 `range` 之内、`attackRange` 之外。
 */
function stage(over = {}) {
  const m = makeManager();
  const boss = m.spawnMagicBoss({ bossId: 'archmagus', x: 0, z: 0, respawn: false, ...over.config });
  boss.phase = over.phase ?? 2;
  boss.speed = 0;
  return { m, boss, player: over.player ?? v(10, 0), ref: makePlayerRef() };
}

const tick = (m, seconds, player, ref) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) m.update(1 / 60, player, ref, null, null);
};

const barrageHits = (ref) => ref.hits.filter((h) => h === barrage.damage);

describe('落点圈布局（纯几何）', () => {
  it('铺出 count 枚，离心半径按面积均匀分布', () => {
    const pts = barrageLayout(0, 0, barrage);
    expect(pts).toHaveLength(barrage.count);
    pts.forEach((p, i) => {
      expect(radiusOf(p)).toBeCloseTo(barrage.spread * Math.sqrt((i + 0.5) / barrage.count), 6);
    });
  });

  it('落地顺序由内向外：越靠外的前摇越长，每枚晚 stagger 秒', () => {
    const pts = barrageLayout(0, 0, barrage);
    pts.forEach((p, i) => {
      expect(p.telegraph).toBeCloseTo(barrage.telegraph + i * barrage.stagger, 6);
    });
    for (let i = 1; i < pts.length; i++) {
      expect(radiusOf(pts[i])).toBeGreaterThan(radiusOf(pts[i - 1]));
      expect(pts[i].telegraph).toBeGreaterThan(pts[i - 1].telegraph);
    }
  });

  it('没有随机数：同一份输入两次布局逐点相同', () => {
    expect(barrageLayout(3, -2, barrage)).toEqual(barrageLayout(3, -2, barrage));
  });

  it('任意两枚圆心相距不小于半径：谁也不把谁整个吞掉', () => {
    const pts = barrageLayout(0, 0, barrage);
    let min = Infinity;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        min = Math.min(min, Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z));
      }
    }
    expect(min).toBeGreaterThanOrEqual(barrage.radius);
  });

  it('count 为 0 时铺出空场，不报错', () => {
    expect(barrageLayout(0, 0, { ...barrage, count: 0 })).toEqual([]);
  });

  it('布局模块不引入随机数（整表必须可断言）', () => {
    const src = readFileSync(join(process.cwd(), 'src/combat/BarragePattern.js'), 'utf8');
    expect(src).not.toMatch(/Math\.random/);
  });
});

describe('大奥术师弹幕接线', () => {
  it('二阶段近身才铺场，一次正好 count 枚', () => {
    const { m, player, ref } = stage();
    m.update(1 / 60, player, ref, null, null);
    expect(m.hazards.count()).toBe(barrage.count);
  });

  it('一阶段不铺场', () => {
    const { m, player, ref } = stage({ phase: 1 });
    tick(m, 0.5, player, ref);
    expect(m.hazards.count()).toBe(0);
  });

  it('离得太远不白演：超出脚本给的 range 时不铺场', () => {
    const { m, player, ref } = stage({ player: v(cast.range + 20, 0) });
    tick(m, 0.5, player, ref);
    expect(m.hazards.count()).toBe(0);
  });

  it('冷却没走完不铺第二波', () => {
    const { m, player, ref } = stage();
    tick(m, SETTLE, player, ref);
    expect(m.hazards.count()).toBe(0);              // 第一波已全部收场
    tick(m, cast.cooldown - SETTLE - 0.4, player, ref);
    expect(m.hazards.count()).toBe(0);              // 冷却还没到期
    tick(m, 0.6, player, ref);
    expect(m.hazards.count()).toBe(barrage.count);  // 到期后重新铺场
  });

  it('站住不动必吃内圈，起手外跑一枚都不吃', () => {
    const still = stage();
    tick(still.m, SETTLE + 1, still.player, still.ref);
    // 内圈那几枚的圆心本就在判定半径内：站住的代价按表结算，不是"随机挨一下"
    expect(barrageHits(still.ref).length).toBeGreaterThanOrEqual(2);

    // 外跑方向 = 最外那枚的离心方向；每帧按 dt 积分，与主循环同构
    const outer = barrageLayout(10, 0, barrage)[barrage.count - 1];
    const dir = v(outer.x - 10, outer.z);
    const len = Math.hypot(dir.x, dir.z) || 1;
    const run = stage();
    const step = 8 / 60;                            // 8 米/秒，低于玩家基础移速
    for (let i = 0; i < Math.round((SETTLE + 1) * 60); i++) {
      run.player.x += (dir.x / len) * step;
      run.player.z += (dir.z / len) * step;
      run.m.update(1 / 60, run.player, run.ref, null, null);
    }
    expect(barrageHits(run.ref)).toEqual([]);
  });

  it('落点全部夹回竞技场内（各自留出一枚半径的边距）', () => {
    const { m, boss, player, ref } = stage({ config: { arenaRadius: 8 } });
    player.x = 7.2;                                 // 贴边站位：不设限就会有一半圈画到墙外
    m.update(1 / 60, player, ref, null, null);
    expect(m.hazards.count()).toBe(barrage.count);
    const limit = boss.arenaRadius - barrage.radius;
    let clamped = 0;
    for (const it of m.hazards._items) {
      const d = Math.hypot(it.x - boss.arenaCenter.x, it.z - boss.arenaCenter.z);
      expect(d).toBeLessThanOrEqual(limit + 1e-6);
      if (d > limit - 0.01) clamped += 1;
    }
    expect(clamped).toBeGreaterThan(0);             // 这一局必须真的夹到，否则用例是空跑
  });

  it('在前摇里被打死：整片撤掉，事后一枚都不落', () => {
    const { m, boss, player, ref } = stage();
    tick(m, 0.4, player, ref);
    expect(m.hazards.count()).toBe(barrage.count);
    boss.die();
    expect(m.hazards.count()).toBe(0);
    tick(m, SETTLE + 1, player, ref);
    expect(barrageHits(ref)).toEqual([]);
  });

  it('圈认的是落点不是主人：施法者随后离场，许诺过的圈照样落地', () => {
    const { m, boss, player, ref } = stage();
    m.update(1 / 60, player, ref, null, null);
    boss.hazards = null;                            // 之后不再铺新场，本场的圈归危险区系统
    boss.position.set(-999, 0, -999);
    tick(m, barrage.telegraph + 0.3, player, ref);
    expect(barrageHits(ref).length).toBeGreaterThanOrEqual(1);
  });

  it('砸地与弹幕同期在场：两招互不顶掉', () => {
    const { m, boss, player, ref } = stage();
    m.update(1 / 60, player, ref, null, null);
    expect(boss.startSlamTelegraph()).toBe(true);   // 砸地那一枚在 Boss 脚下，够不着玩家
    expect(boss.state).toBe('slam');
    expect(m.hazards.count()).toBe(barrage.count + 1);
    // 砸地按自己的前摇收招，不被在场的大片紫圈卡住
    expect(until(m, 2, 1 / 60, player, ref, () => boss.state === 'idle')).toBe(true);
    expect(boss.attackCooldown).toBeGreaterThan(0);
    // 弹幕也不看 Boss 的脸色：它由危险区系统自己的钟推进
    expect(until(m, SETTLE, 1 / 60, player, ref, () => barrageHits(ref).length > 0)).toBe(true);
    expect(m.hazards.count()).toBeLessThan(barrage.count * 2);   // 冷却没到期，不铺第二波
  });

  it('没有危险区系统时不铺场也不报错', () => {
    const lone = new MagicBoss(makeScene(), makeWorld(), { x: 0, z: 0 });
    lone.phase = 3;
    expect(lone.hazards).toBe(null);
    expect(() => lone.update(1 / 60, v(10, 0), makePlayerRef())).not.toThrow();
    expect(lone.startBarrage(v(10, 0), cast)).toBe(false);
  });
});
