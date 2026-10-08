/**
 * Boss 场地脚本表（W-A6 切片3）：把散在四个子类里的"什么时候铺场"收进一张表。
 *
 * 这一档要钉住的是**边界**而不是数值：
 * 1. 表要在加载期自证 —— 招式名拼错、闸门名拼错、`opportunity` 少写 `range`、
 *    `entry` 的三种坏形状（非布尔 / 一阶段 / 同阶段两枚），都要在 import 那一刻抛错，
 *    而不是等到某场 Boss 战里"它怎么不铺场了"。
 * 2. `EnemyManager` 真正生成的每一个 bossId 都必须在表里点了名，漏一个就静默落 `default`。
 * 3. 三种闸门各自的行为要说得出：`melee` 抢一次挥击、`timed` 按秒期望、`opportunity` 看冷却与距离。
 * 4. `combat/` 里不许再长出手写的场地起手 —— 那正是本切片删掉的东西（静态门禁守着）。
 *
 * 数值本身（圈多大、掉多少血）由 `tests/ground-hazard.test.js` 与 `tests/barrage.test.js` 管。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ARENA_MOVES, BOSS_ARENA_SCRIPTS, arenaScriptFor, assertArenaScript,
} from '../src/content/arenaScripts.js';
import { GROUND_HAZARD } from '../src/content/tuning.js';
import { Boss } from '../src/combat/Boss.js';
import { MagicBoss } from '../src/combat/MagicBoss.js';
import { SpaceBoss } from '../src/combat/SpaceBoss.js';
import { VoidBoss } from '../src/combat/VoidBoss.js';
import { ChaosBoss } from '../src/combat/ChaosBoss.js';
import {
  installWindowShim, makeScene, makeWorld, makePlayerRef, makeManager, v, until,
} from './helpers/enemyHarness.js';

const { bossSlam } = GROUND_HAZARD;
const realRandom = Math.random;

/** 把 `Math.random` 钉成一个常数：闸门里的概率分支从此只有"必然"与"必然不"两种 */
const fixed = (r) => { Math.random = () => r; };

beforeAll(() => {
  installWindowShim();
});

afterAll(() => {
  Math.random = realRandom;
});

describe('脚本表自证', () => {
  it('现表通过校验，且每条招式都指向真实存在的数值档', () => {
    expect(() => assertArenaScript()).not.toThrow();
    for (const name of Object.values(ARENA_MOVES)) {
      expect(GROUND_HAZARD[name], `GROUND_HAZARD.${name} 不存在`).toBeTruthy();
    }
  });

  it('招式名拼错 → 抛错（不能静默不铺场）', () => {
    expect(() => assertArenaScript({ x: [{ move: 'slammm', phase: 2, trigger: 'melee', chance: 0.3 }] }))
      .toThrow(/ARENA_MOVES/);
  });

  it('闸门名拼错 → 抛错', () => {
    expect(() => assertArenaScript({ x: [{ move: 'slam', phase: 2, trigger: 'every-frame', chance: 0.3 }] }))
      .toThrow(/闸门/);
  });

  it('opportunity 少写 range 或 cooldown → 抛错', () => {
    const base = { move: 'barrage', phase: 2, trigger: 'opportunity', cooldown: 7, range: 24 };
    expect(() => assertArenaScript({ x: [{ ...base, range: undefined }] })).toThrow(/range/);
    expect(() => assertArenaScript({ x: [{ ...base, cooldown: 0 }] })).toThrow(/cooldown/);
  });

  it('phase 不是 1~3 的整数 → 抛错（写 2.5 会让人调了半天却没生效）', () => {
    const base = { move: 'slam', trigger: 'melee', chance: 0.3 };
    expect(() => assertArenaScript({ x: [{ ...base, phase: 2.5 }] })).toThrow(/phase/);
    expect(() => assertArenaScript({ x: [{ ...base, phase: 4 }] })).toThrow(/phase/);
    expect(() => assertArenaScript({ x: [{ ...base, phase: 1 }] })).not.toThrow();
  });

  it('entry 不是布尔 → 抛错（`entry: "yes"` 会被真值判断静默启用）', () => {
    const base = { move: 'slam', phase: 2, trigger: 'melee', chance: 0.3 };
    expect(() => assertArenaScript({ x: [{ ...base, entry: 'yes' }] })).toThrow(/entry/);
    // 收下的一侧：false 与不写都合法（不写 = 不标）
    expect(() => assertArenaScript({ x: [{ ...base, entry: false }] })).not.toThrow();
    expect(() => assertArenaScript({ x: [{ ...base }] })).not.toThrow();
  });

  it('entry 标在一阶段 → 抛错（没有"转进一阶段"这一帧，永远点不着火）', () => {
    const e = { move: 'slam', phase: 1, trigger: 'melee', chance: 0.3, entry: true };
    expect(() => assertArenaScript({ x: [e] })).toThrow(/entry/);
  });

  it('同一阶段两枚 entry → 抛错；不同阶段各一枚 → 收下', () => {
    const p2 = { move: 'slam', phase: 2, trigger: 'melee', chance: 0.3, entry: true };
    const p3 = { move: 'barrage', phase: 3, trigger: 'opportunity', cooldown: 7, range: 24, entry: true };
    expect(() => assertArenaScript({ x: [p2, p3] })).not.toThrow();
    expect(() => assertArenaScript({ x: [p2, { ...p3, phase: 2 }] })).toThrow(/entry/);
  });

  it('入场标记集钉死：九枚 entry 的落点（动它必须来这里改，不许悄悄漂）', () => {
    const marks = Object.entries(BOSS_ARENA_SCRIPTS).flatMap(([id, script]) =>
      script.flatMap((e, i) => (e.entry === true ? [`${id}[${i}]:${e.move}@p${e.phase}`] : [])));
    expect(marks).toEqual([
      'default[0]:slam@p2',
      'shadow-warden[0]:slam@p2',
      'archmagus[1]:barrage@p2',
      'singularity-herald[0]:slam@p2',
      'singularity-herald[1]:barrage@p3',
      'void-chronarch[0]:slam@p2',
      'void-chronarch[1]:freeze@p3',
      'chaos-overlord[0]:slam@p2',
      'chaos-overlord[2]:barrage@p3',
    ]);
    // 井刻意不列入场：标了它，转阶段那一帧会无条件破掉引力化身的距离博弈
    expect(marks.some((m) => m.includes(':well@'))).toBe(false);
  });

  it('未登记的 bossId 走 default，而不是什么都不干', () => {
    expect(arenaScriptFor('dungeon-crypt-of-nowhere')).toBe(BOSS_ARENA_SCRIPTS.default);
    expect(arenaScriptFor('shadow-warden')).not.toBe(BOSS_ARENA_SCRIPTS.default);
  });

  it('EnemyManager 生成的每个 bossId 都被表点了名', () => {
    const src = readFileSync(join(process.cwd(), 'src/combat/EnemyManager.js'), 'utf8');
    const ids = [...src.matchAll(/bossId:\s*'([\w-]+)'/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(5);   // 五位世界 Boss，一条都不能漏
    for (const id of ids) {
      expect(BOSS_ARENA_SCRIPTS[id], `${id} 不在场地脚本表里，会静默落到 default`).toBeTruthy();
    }
  });

  it('子类不写 config.bossId 也拿得到自己那份脚本（id 必须在 super 之前定下）', () => {
    // `Boss` 构造期就要按 id 查脚本：子类若在 `super()` 之后才补默认 id，查到的就是别人的表
    const scene = () => makeScene();
    const world = () => makeWorld();
    const at = { x: 0, z: 0 };
    expect(new Boss(scene(), world(), at).arenaScript).toBe(BOSS_ARENA_SCRIPTS['shadow-warden']);
    expect(new MagicBoss(scene(), world(), at).arenaScript).toBe(BOSS_ARENA_SCRIPTS.archmagus);
    expect(new SpaceBoss(scene(), world(), at).arenaScript).toBe(BOSS_ARENA_SCRIPTS['singularity-herald']);
    expect(new VoidBoss(scene(), world(), at).arenaScript).toBe(BOSS_ARENA_SCRIPTS['void-chronarch']);
    expect(new ChaosBoss(scene(), world(), at).arenaScript).toBe(BOSS_ARENA_SCRIPTS['chaos-overlord']);
    expect(new Boss(scene(), world(), { ...at, bossId: 'no-such-boss' }).arenaScript)
      .toBe(BOSS_ARENA_SCRIPTS.default);
  });
});

describe('三种闸门', () => {
  /** 生成一只 Boss 并把玩家摆到 `dist` 米处；`speed = 0` 让它别自己贴上来 */
  const stage = (spawn, bossId, dist, phase = 2) => {
    const m = makeManager();
    const boss = m[spawn]({ bossId, x: 0, z: 0, respawn: false });
    boss.speed = 0;
    boss.phase = phase;
    const ref = makePlayerRef();
    ref.velocity = { x: 0, z: 0 };   // 引力化身的拉扯要写它
    return { m, boss, player: v(dist, 0), ref };
  };

  const run = (s, seconds) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      s.m.update(1 / 60, s.player, s.ref, null, null);
    }
  };

  it('melee：抢到一次挥击的位置就不出刀，改为脚下铺圈', () => {
    fixed(0.1);                       // < chance 0.35
    const s = stage('spawnBoss', 'shadow-warden', 1.5);
    expect(until(s.m, 3, 1 / 60, s.player, s.ref, () => s.boss.state === 'slam')).toBe(true);
    expect(s.m.hazards.count()).toBe(1);
    expect(s.m.hazards._items[0].radius).toBe(bossSlam.radius);
    expect(s.ref.hits).toEqual([]);   // 这一拍没有挥砍伤害，只有那张还没落下的圈
  });

  it('melee：概率没轮到就照常挥刀，场地招不是每拍都插队', () => {
    fixed(0.9);                       // > chance 0.35
    const s = stage('spawnBoss', 'shadow-warden', 1.5);
    expect(until(s.m, 3, 1 / 60, s.player, s.ref, () => s.boss.state === 'windup')).toBe(true);
    expect(s.m.hazards.count()).toBe(0);
  });

  it('melee：脚本写的阶段没到，就一直只是普通挥砍', () => {
    fixed(0.1);
    const s = stage('spawnBoss', 'shadow-warden', 1.5, 1);
    run(s, 3);
    expect(s.m.hazards.count()).toBe(0);
  });

  it('timed：不看距离、按秒期望自己起手（引力化身不贴脸也能铺场）', () => {
    fixed(0);                         // 必然小于 rate * dt
    const s = stage('spawnSpaceBoss', 'singularity-herald', 14);
    run(s, 0.2);
    expect(s.boss.state).toBe('slam');
    expect(s.m.hazards.count()).toBe(1);
  });

  it('timed：没到脚本写的阶段就不起手', () => {
    fixed(0);
    const s = stage('spawnSpaceBoss', 'singularity-herald', 14, 1);
    run(s, 3);
    expect(s.m.hazards.count()).toBe(0);
  });

  it('opportunity：range 是硬门槛，隔半场不白铺', () => {
    fixed(0.99);                      // 关掉一切概率分支，只留确定性闸门
    const cast = BOSS_ARENA_SCRIPTS['chaos-overlord'].find((e) => e.move === 'barrage');
    const far = stage('spawnChaosBoss', 'chaos-overlord', cast.range + 20, 3);
    run(far, 2);
    expect(far.m.hazards.count()).toBe(0);

    const near = stage('spawnChaosBoss', 'chaos-overlord', 12, 3);
    run(near, 0.2);
    expect(near.m.hazards.count()).toBe(GROUND_HAZARD.barrage.count);
  });

  it('opportunity：阶段没到就不铺（混沌领主的弹幕写在第三阶段）', () => {
    fixed(0.99);
    const s = stage('spawnChaosBoss', 'chaos-overlord', 12, 2);
    run(s, 2);
    expect(s.m.hazards.count()).toBe(0);
  });

  it('tint：同一个圈几何、各自的配色（引力和混沌不许都掉进奥术紫里）', () => {
    fixed(0.99);
    const arch = stage('spawnMagicBoss', 'archmagus', 10);
    run(arch, 0.2);
    const chaos = stage('spawnChaosBoss', 'chaos-overlord', 12, 3);
    run(chaos, 0.2);

    expect(arch.m.hazards._items[0].disc.material.color.getHex()).toBe(GROUND_HAZARD.barrage.color);
    const tint = BOSS_ARENA_SCRIPTS['chaos-overlord'].find((e) => e.move === 'barrage').tint;
    expect(tint).toBeTruthy();
    expect(chaos.m.hazards._items[0].disc.material.color.getHex()).toBe(tint);
  });

  it('大奥术师改由脚本表驱动后，铺场时机与切片2 一致', () => {
    fixed(0.99);
    const s = stage('spawnMagicBoss', 'archmagus', 10);
    run(s, 0.2);
    expect(s.m.hazards.count()).toBe(GROUND_HAZARD.barrage.count);
    // 同一片场地不会因为它换了驱动方式就连铺两波
    run(s, 3);
    expect(s.m.hazards.count()).toBeLessThan(GROUND_HAZARD.barrage.count * 2);
  });
});

describe('手抄闸门不得回归（静态门禁）', () => {
  const code = (rel) => readFileSync(join(process.cwd(), 'src', rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('除 Boss.js 外，combat/ 里不许再有人自己起手场地招', () => {
    const offenders = [];
    for (const name of readdirSync(join(process.cwd(), 'src/combat'))) {
      if (!name.endsWith('.js') || name === 'Boss.js') continue;
      const src = code(`combat/${name}`);
      if (/startSlamTelegraph\s*\(|startBarrage\s*\(/.test(src)) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });

  it('阶段门槛与起手概率只住在脚本表里，不住在代码里', () => {
    for (const name of readdirSync(join(process.cwd(), 'src/combat'))) {
      if (!name.endsWith('.js')) continue;
      const src = code(`combat/${name}`);
      expect(src, `${name} 又把阶段门槛写回了代码`).not.toMatch(/phase\s*>=\s*\d+\s*&&\s*Math\.random/);
      expect(src).not.toMatch(/Math\.random\(\)\s*<\s*0\.35/);
    }
  });

  it('Boss.js 查表而不是各写各的：闸门字段一律从 entry 上读', () => {
    const src = code('combat/Boss.js');
    for (const field of ['e.phase', 'e.chance', 'e.rate', 'e.cooldown', 'e.range', 'e.entry']) {
      expect(src, `Boss.js 里找不到 ${field}，闸门可能又写死了`).toMatch(new RegExp(field.replace('.', '\\.')));
    }
    expect(src).toMatch(/arenaScriptFor\(this\.bossId\)/);
  });
});
