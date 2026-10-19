/**
 * W-E1 切片6 门禁：收口"余"里的两句话 ——
 *   ① Boss 不收成长（难度×成长咽喉被五个 `spawn*Boss` 绕过）
 *   ② 魂收入不随成长缩放（击杀掉落硬编码常量只乘难度）
 *
 * 验证平面（本仓门禁纪律）：
 * - 分母守卫：用例数 >= 12，空集不许绿成"干净"。
 * - 直接调 `_scaleBoss(boss, stage)`：隔离缩放逻辑，不依赖夹具里有没有 zones
 *   （夹具世界无 zones → `zoneIdAt` 落 CORRIDOR → stage 0，正好是 0 档恒等那一条）。
 * - 反向控制（变异探针）：把 `_scaleBoss` 临时打成 no-op，预言"任意 stage 也只给基值"，
 *   证明缩放器是 hp 变化的唯一载荷（否则回归静默混过去）。
 * - 魂收入端到端：构造一只带 `growthStage`、不复活的兵、置于死亡、跑 `update`，
 *   截获 `loot.spawnKill` 收到的 `souls`，断言 == `killRewardSouls(kind, stage)`。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { killRewardSouls } from '../src/combat/EnemyManager.js';
import { DungeonBoss } from '../src/combat/DungeonBoss.js';
import { growthAt } from '../src/content/enemyGrowth.js';
import { setDifficulty, resetDifficulty } from '../src/game/Difficulty.js';
import {
  installWindowShim, makeManager, makePlayerRef, makeScene, makeWorld, v,
} from './helpers/enemyHarness.js';

beforeEach(() => installWindowShim());
afterEach(() => resetDifficulty());

/** 基值（与 `Boss.js` 默认一致，门禁自己现读 `boss.maxHp` 不抄第二份） */
const BASE_HP = 800;
const BASE_DMG = 18;

describe('W-E1 切片6：Boss 走难度×成长咽喉', () => {
  it('0 档恒等：夹具世界（无 zones）下出生的世界 Boss 血量与基值逐字节相同', () => {
    const m = makeManager();
    const b = m.spawnBoss({ bossId: 'shadow-warden', x: 0, z: 0, respawn: false });
    // 夹具无 zones → zoneIdAt 落 CORRIDOR → stage 0；标准难度 enemyHp = 1
    expect(b.maxHp).toBe(BASE_HP);
    expect(b.hp).toBe(BASE_HP);
    expect(b.damage).toBe(BASE_DMG);
    expect(b.growthStage).toBe(0);
  });

  it('成长缩放：stage 6 的 Boss 血量 = 基值 × growth.hp(6)，伤害 = 基值 × growth.damage(6)', () => {
    const m = makeManager();
    const b = m.spawnBoss({ bossId: 'shadow-warden', x: 0, z: 0, respawn: false });
    m._scaleBoss(b, 6);
    const g = growthAt(6);
    expect(b.maxHp).toBe(Math.round(BASE_HP * g.hp));
    expect(b.hp).toBe(Math.round(BASE_HP * g.hp));
    expect(b.damage).toBe(Math.round(BASE_DMG * g.damage));
  });

  it('难度缩放：brutal 档（enemyHp 1.3）下 0 档 Boss 血量 = 基值 × 1.3', () => {
    setDifficulty('brutal');
    const m = makeManager();
    const b = m.spawnBoss({ bossId: 'shadow-warden', x: 0, z: 0, respawn: false });
    expect(b.maxHp).toBe(Math.round(BASE_HP * 1.3));
  });

  it('难度只进血量：brutal 档下 Boss 伤害仍只随成长（不乘 difficulty.damageTaken）', () => {
    setDifficulty('brutal');
    const m = makeManager();
    const b = m.spawnBoss({ bossId: 'shadow-warden', x: 0, z: 0, respawn: false });
    m._scaleBoss(b, 6);
    // 敌人出招伤害只随 growth.damage，brutal 的 1.5 是玩家侧的，不该渗到这里
    expect(b.damage).toBe(Math.round(BASE_DMG * growthAt(6).damage));
  });

  it('档位记在 Boss 身上：召的仆从能跟着这一档长（关闭"召唤物不收成长"那半句）', () => {
    const m = makeManager();
    const b = m.spawnBoss({ bossId: 'shadow-warden', x: 0, z: 0, respawn: false });
    m._scaleBoss(b, 4);
    expect(b.growthStage).toBe(4);
  });

  it('每只世界 Boss 声明的 tunable（hp/damage/posture/speed）在构造后就成立，不被父类字面量覆盖', () => {
    // B100：契约不能"在夹具成立、在世界不成立"。病灶是 `Boss` 构造器用**字面量**覆盖
    // `...config`，于是子类声明的每个值都可能是死数据。这条把 hp/damage/posture/speed
    // 逐只钉住（posture 落在 `maxPosture`，瞬时 posture 从 0 起）。
    const m = makeManager();
    //                              hp   dmg  posture speed
    const declared = [
      ['spawnBoss', 'shadow-warden', 800, 18, 120, 4.5],
      ['spawnMagicBoss', 'archmagus', 650, 16, 100, 4],
      ['spawnSpaceBoss', 'singularity-herald', 900, 20, 130, 5],
      ['spawnVoidBoss', 'void-chronarch', 750, 19, 110, 4.8],
      ['spawnChaosBoss', 'chaos-overlord', 820, 21, 115, 5.2],
    ];
    for (const [fn, id, hp, dmg, posture, speed] of declared) {
      const b = m[fn]({ bossId: id, x: 0, z: 0, respawn: false });
      expect(b.maxHp, `${id} 血量`).toBe(hp);
      expect(b.hp, `${id} 当前血量`).toBe(hp);
      expect(b.damage, `${id} 伤害`).toBe(dmg);
      expect(b.maxPosture, `${id} posture（韧性上限）`).toBe(posture);
      expect(b.speed, `${id} 速度`).toBe(speed);
    }
  });

  it('DungeonBoss 声明的 aggroRange/attackRange/speed/posture 与副本血量公式都读得回来', () => {
    // DungeonBoss 是唯一另写 aggroRange/attackRange 的，且血量走 `480 + rooms*25` 公式
    // （先前判"副本血量公式是死代码"正是它）。这里构造真身（不借原型方法）逐项读回。
    const b = new DungeonBoss(makeScene(), makeWorld(), { x: 0, z: 0 });
    expect(b.aggroRange).toBe(28);
    expect(b.attackRange).toBe(3.8);
    expect(b.speed).toBe(5);
    expect(b.maxPosture).toBe(100);
    expect(b.maxHp).toBe(520);                              // 未递 hp → 落在 DungeonBoss 自己那档兜底
    const big = new DungeonBoss(makeScene(), makeWorld(), { x: 0, z: 0, hp: 480 + 8 * 25 });
    expect(big.maxHp).toBe(480 + 8 * 25);                   // 公式照走，不再被基类 800 盖掉
  });

  it('五类 Boss 都过同一缩放器：各自从**自己的**基数起缩放（不是都从 800/18）', () => {
    const m = makeManager();
    const cases = [
      ['spawnMagicBoss', 'archmagus', 650, 16],
      ['spawnSpaceBoss', 'singularity-herald', 900, 20],
      ['spawnVoidBoss', 'void-chronarch', 750, 19],
      ['spawnChaosBoss', 'chaos-overlord', 820, 21],
    ];
    const g = growthAt(6);
    for (const [fn, id, baseHp, baseDmg] of cases) {
      const b = m[fn]({ bossId: id, x: 0, z: 0, respawn: false });
      m._scaleBoss(b, 6);
      expect(b.maxHp, `${fn} 血量`).toBe(Math.round(baseHp * g.hp));
      expect(b.damage, `${fn} 伤害`).toBe(Math.round(baseDmg * g.damage));
    }
  });

  it('反向控制（变异探针）：缩放器失效时，任意 stage 只给基值', () => {
    const m = makeManager();
    const b = m.spawnBoss({ bossId: 'shadow-warden', x: 0, z: 0, respawn: false });
    const probe = m._scaleBoss;
    m._scaleBoss = () => b; // 变异：缩放器失效
    m._scaleBoss(b, 6); // 走失效的缩放器
    expect(b.maxHp).toBe(BASE_HP);
    expect(b.damage).toBe(BASE_DMG);
    m._scaleBoss = probe; // 还原
  });
});

describe('W-E1 切片6：魂收入随成长缩放', () => {
  it('击杀基数纯函数：stage 0 恒等（boss 500 / normal 25）', () => {
    expect(killRewardSouls('boss', 0)).toBe(500);
    expect(killRewardSouls('normal', 0)).toBe(25);
  });

  it('击杀基数随成长放大：boss 在 stage 6 = 500 × growth.souls(6)', () => {
    expect(killRewardSouls('boss', 6)).toBe(Math.round(500 * growthAt(6).souls));
    expect(killRewardSouls('normal', 3)).toBe(Math.round(25 * growthAt(3).souls));
    expect(killRewardSouls('elite', 4)).toBe(Math.round(120 * growthAt(4).souls));
  });

  it('难度与成长分处两层：killRewardSouls 不读难度（brutal 下 boss 基数仍 500）', () => {
    setDifficulty('brutal');
    expect(killRewardSouls('boss', 0)).toBe(500);
    expect(killRewardSouls('boss', 6)).toBe(Math.round(500 * growthAt(6).souls));
  });

  it('端到端：带 growthStage 的兵死亡，loot 收到的 souls == killRewardSouls(kind, stage)', () => {
    const m = makeManager();
    const e = m.spawnAt('soldier', 0, 0, { growthStage: 3, respawn: false });
    const loot = {
      got: null,
      spawnKill(pos, souls, kind) { this.got = { pos, souls, kind }; },
    };
    // 杀死并标记未掉过魂，触发 update 里的掉落分支（不复活，确保走到掉落）
    e.alive = false;
    e._lootDropped = false;
    m.update(1 / 60, v(0, 0), makePlayerRef(), loot, null);
    expect(loot.got).not.toBeNull();
    expect(loot.got.kind).toBe('normal');
    // 成长这一轴：stage 3 的 normal 掉落 = 25 × growth.souls(3)
    expect(loot.got.souls).toBe(killRewardSouls('normal', 3));
    expect(loot.got.souls).toBe(Math.round(25 * growthAt(3).souls));
  });

  it('端到端反向控制：growthStage 0 时退回 0 档基数（不变式不被绕过）', () => {
    const m = makeManager();
    const e = m.spawnAt('soldier', 0, 0, { growthStage: 0, respawn: false });
    const loot = {
      got: null,
      spawnKill(pos, souls, kind) { this.got = { souls, kind }; },
    };
    e.alive = false;
    e._lootDropped = false;
    m.update(1 / 60, v(0, 0), makePlayerRef(), loot, null);
    expect(loot.got).not.toBeNull();
    expect(loot.got.souls).toBe(killRewardSouls('normal', 0));
  });
});
