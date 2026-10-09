/**
 * 场边界（W-B10 切片5e，B101）：副本 Boss 拿到的"场"必须是**真墙内表面**围出来的那个方子
 *
 * ## 修的是什么
 * 改前 `DungeonManager._spawnRoomEnemies` 一个边界字段都没递给 `DungeonBoss`，于是 Boss 用的是
 * `Boss.js` 里那个没有出处的名义 22，而 34 米那间的真墙内表面在 `±(34/2 − 0.6/2) = ±16.7` ——
 * 差 5.3 米。`arenaCenter` 当时"碰巧对"只是因为 Boss 生在房心，那句话既没人写也没人测。
 * 可达的症状是砸地：那记的圆心就是 Boss 自己的脚、不走钳制，改前实测把 Boss 摆到贴墙能站到
 * 距场心 15.6 米，4.5 米的圈因此**越墙 3.40 米**，而墙那侧是邻居房走得到的地板（B79）
 * ⇒ 一记玩家看不见、却真打得到人的伤害。
 *
 * ## 用例分四层
 * ① 接线层：走真 `DungeonManager` 路径进七座副本，每座在场心出生的 Boss 都要拿到 `field`，
 *    且它的四条边 = `layout.colliders` 里那四面 Boss 场墙的**内表面**
 *    （读数从碰撞体取，不再抄一遍 `room.w/2 − wallT/2` 的式子；中心与 `arenaCenter` 同源）。
 * ② 钳制层：有 `field` 时逐轴按矩形夹，两条轴各自独立（只用一条轴的钳制在这里就露馅）；
 *    `margin` 大于半轴时收回场心，不许反向夹；没有 `field` 时逐字保持旧的名义圆。
 * ③ 砸地层：整枚放不下 ⇒ 不起手（不铺圈、不进 slam 态、`slamHazard` 留空），并且真的
 *    **退回普通挥砍**（走 `update` 的 melee 分支见证）；恰好贴边（`|d| + r === 半轴`）仍要放 ——
 *    边界是 `<=`。
 * ④ 对照层：`field` 为 null 的世界 Boss 在任何落点都起手、`fieldFits` 恒真 ——
 *    少了这一层，③ 只证明"我把砸地删掉了"。这一层还量角上那一枚：内切圆的写法会在这里红。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three';
import { GROUND_HAZARD } from '../src/content/tuning.js';
import {
  installWindowShim, makeManager, makeScene, makePlayerRef, v,
} from './helpers/enemyHarness.js';
import { DungeonManager } from '../src/world/DungeonManager.js';
import { DUNGEON_DEFS } from '../src/content/dungeons.js';

const { bossSlam } = GROUND_HAZARD;
const R = bossSlam.radius;
const realRandom = Math.random;

/**
 * ②③④ 用的合成场。
 * - `SQUARE` 半轴 12 与 `R` 让 `EDGE = 12 − R` 正好是"恰好贴边"那一格；
 * - `RECT` 故意是**偏心长方形**（x 走 12、z 走 8，场心在 (100, −50)）：
 *   圆钳制与"只夹一条轴"的写法都给不出这里要的那几个数。
 */
const SQUARE = { x: 0, z: 0, hw: 12, hd: 12 };
const EDGE = SQUARE.hw - R;
const OVER = EDGE + 0.01;
const RECT = { x: 100, z: -50, hw: 12, hd: 8 };

beforeAll(() => {
  installWindowShim();
});

afterAll(() => {
  Math.random = realRandom;
});

/** 用例里的玩家替身：`DungeonManager` 只用到 `position` 与 `teleport`（与真 Player 同形） */
const makeWalker = () => ({
  position: new THREE.Vector3(),
  teleport(x, y, z) { this.position.set(x, y, z); },
});

/** 生成一只 Boss：给了 `field` 就是"有墙的场"，给 null 就是世界 Boss 那条名义圆 */
const stage = (field, x = 0, z = 0) => {
  const m = makeManager();
  const boss = m.spawnBoss({
    bossId: 'shadow-warden', x, z, respawn: false, speed: 0,
    ...(field ? { field } : {}),
  });
  return { m, boss, player: v(0, 0), ref: makePlayerRef() };
};

// ─── ① 接线层：真副本路径交出的边界就是那四面墙的内表面 ────────────────

describe('接线：副本 Boss 的场来自布局，不是又一个常数', () => {
  it('七座副本逐一进场：field 的四条边与场墙碰撞体的内表面重合，中心与 arenaCenter 同源', () => {
    const dm = new DungeonManager(makeScene(), { getGroundHeight: () => 0 },
      { show() {}, toast() {} }, makeManager(), null);
    const player = makeWalker();
    let checked = 0;

    for (const def of DUNGEON_DEFS) {
      const dungeon = dm.dungeons.get(def.id);
      dm.enter(dungeon, player);
      const arena = dungeon.layout.rooms.find((r) => r.isBossArena);
      const id = `${def.id}/${arena?.id ?? '无场'}`;

      player.teleport(def.origin.x + arena.x, 0, def.origin.z + arena.z);
      const standing = dm.updatePlayerRoom(player.position);
      // 站在场心的玩家要算成"场自己"这一间 —— 否则守钥者根本不会出生，下面全部白测
      expect(standing?.id, `${id}：场心的玩家被算成了 ${standing?.id}，守钥者不会出生`).toBe(arena.id);

      const boss = dungeon.boss;
      expect(boss, `${id}：走进 Boss 场却没有生成守钥者`).toBeTruthy();
      const f = boss.field;
      expect(f, `${id}：副本 Boss 没有 field —— 它还会退回那个没有出处的名义 22`).toBeTruthy();
      // 中心：出生点就是场心，而 arenaCenter 与 field 必须说同一件事（改前那一句只是巧合）
      expect(f.x, `${id}：field 的中心不在守钥者的出生点上`).toBe(boss.position.x);
      expect(f.z, `${id}：field 的中心不在守钥者的出生点上`).toBe(boss.position.z);
      expect(boss.arenaCenter.x, `${id}：arenaCenter 与 field 中心分家`).toBeCloseTo(f.x, 10);
      expect(boss.arenaCenter.z, `${id}：arenaCenter 与 field 中心分家`).toBeCloseTo(f.z, 10);

      /* 四条边：从布局真有的碰撞体里读**内表面**。
       * 只认"贴在场边界那条线上、且沿这一轴是一薄片"的碰撞体 —— 场里的石柱与石碑也往
       * `layout.colliders` 里推东西，不认厚薄就会拿去跟一根柱子的边比。 */
      const c = dungeon.layout.colliders;
      const 薄 = dungeon.layout.wallT / 2;
      const 墙段 = (axis, want) => c.filter((k) =>
        Math.abs(k[axis] - want) < 1e-6 && Math.abs(k[axis === 'x' ? 'hw' : 'hd'] - 薄) < 1e-6);
      const 面 = {
        东: 墙段('x', arena.x + arena.w / 2).map((k) => k.x - k.hw),
        西: 墙段('x', arena.x - arena.w / 2).map((k) => k.x + k.hw),
        北: 墙段('z', arena.z - arena.d / 2).map((k) => k.z + k.hd),
        南: 墙段('z', arena.z + arena.d / 2).map((k) => k.z - k.hd),
      };
      for (const [name, faces] of Object.entries(面)) {
        expect(faces.length, `${id}：布局里找不到场${name}侧的墙段，无法比对内表面`).toBeGreaterThan(0);
      }
      const local = { x: f.x - def.origin.x, z: f.z - def.origin.z };
      expect(local.x + f.hw, `${id}：场东侧越过了东墙内表面`).toBeCloseTo(Math.min(...面.东), 10);
      expect(local.x - f.hw, `${id}：场西侧越过了西墙内表面`).toBeCloseTo(Math.max(...面.西), 10);
      expect(local.z + f.hd, `${id}：场南侧越过了南墙内表面`).toBeCloseTo(Math.min(...面.南), 10);
      expect(local.z - f.hd, `${id}：场北侧越过了北墙内表面`).toBeCloseTo(Math.max(...面.北), 10);
      // 半轴必须是正的：负数意味着半墙比半场还厚，那样钳制会反过来
      expect(f.hw, `${id}：hw 不是正数（room.w/2 − wallT/2 算出了什么？）`).toBeGreaterThan(0);
      expect(f.hd, `${id}：hd 不是正数（room.d/2 − wallT/2 算出了什么？）`).toBeGreaterThan(0);
      // B101 的症状形状：名义 22 比真场半宽大，旧钳制因此能把圈夹到墙外去
      expect(boss.arenaRadius, `${id}：名义 arenaRadius 不再大于真场半宽 —— 这一片的前提变了，请复核`)
        .toBeGreaterThan(Math.max(f.hw, f.hd));

      checked += 1;
      dm.abandonRun();
    }
    // 分母来自 DUNGEON_DEFS 自己：少跑一座就是"循环没跑完"，不是"都跑过了"
    expect(checked, '跑过的副本座数不等于 DUNGEON_DEFS 的条目数').toBe(DUNGEON_DEFS.length);
  });
});

// ─── ② 钳制层：有墙按矩形逐轴夹，没墙仍是那条圆拴绳 ────────────────────

describe('钳制：矩形逐轴（偏心长方形，与旧圆和单轴写法都可分辨）', () => {
  it('两条轴各自夹：只夹 x 的写法在"z 越界"那一格会露馅', () => {
    const boss = stage(RECT).boss;
    // 两轴都越界：走满两条半轴，而不是沿 45° 收进某个圆
    expect(boss.clampIntoArena(200, 200)).toEqual({ x: 112, z: -42 });
    // 只有 x 越界：z 在场内就该原样留着
    expect(boss.clampIntoArena(200, -50)).toEqual({ x: 112, z: -50 });
    // 只有 z 越界：反过来同样（少了这一条，"逐轴"只证了一半）
    expect(boss.clampIntoArena(100, 200)).toEqual({ x: 100, z: -42 });
    // 场内的点一动不动：钳制不许把圈往场心拽
    expect(boss.clampIntoArena(105, -52)).toEqual({ x: 105, z: -52 });
  });

  it('角上那一点是矩形与内切圆的分水岭：同一落点两种写法给出不同的数', () => {
    const boss = stage(RECT).boss;
    const at = boss.clampIntoArena(200, 200);
    // 夹完仍在矩形里（两条轴都不许越出去），却已经在内切圆之外 ——
    // 少了前两条就是"钳制本身不封顶"，少了后一条就是"四个角白让出去"。
    expect(Math.abs(at.x - RECT.x), '夹完 x 越过了矩形的半轴').toBeLessThanOrEqual(RECT.hw);
    expect(Math.abs(at.z - RECT.z), '夹完 z 越过了矩形的半轴').toBeLessThanOrEqual(RECT.hd);
    expect(Math.hypot(at.x - RECT.x, at.z - RECT.z), '角上那一点该落在内切圆之外（矩形的意义就在这儿）')
      .toBeGreaterThan(Math.min(RECT.hw, RECT.hd));
    // 对照：没有 field 的圆钳制在同一落点上收得更短
    const circleAt = stage(null).boss.clampIntoArena(200, 200);
    expect(Math.hypot(circleAt.x, circleAt.z)).toBeCloseTo(22, 10);
  });

  it('margin（危险区半径）从两条半轴各自扣；扣成负数时收回场心而不是反向夹', () => {
    const boss = stage(RECT).boss;
    expect(boss.clampIntoArena(200, 200, 4)).toEqual({ x: 108, z: -46 });
    // hd 8 − 9 < 0 ⇒ 那一轴收回场心；hw 12 − 9 = 3 仍在
    expect(boss.clampIntoArena(200, 200, 9)).toEqual({ x: 103, z: -50 });
    // 两条半轴都被扣穿（margin 13 > 12 > 8）：各归各收回场心。
    // 少了 `Math.max(0, …)` 那一道，负半轴会把区间两端翻转、把点夹到**场外那一边**：
    // x 那一格的守卫只在上面这行露不出来（12 − 9 还是正的），只能靠这一行。
    expect(boss.clampIntoArena(200, 200, 13)).toEqual({ x: 100, z: -50 });
  });

  it('对照：没有 field 时逐字保持名义圆的旧行为', () => {
    const boss = stage(null).boss;
    expect(boss.field).toBeNull();
    expect(boss.arenaRadius, '世界 Boss 仍该是那条 22 的拴绳').toBe(22);
    expect(boss.clampIntoArena(0, 30)).toEqual({ x: 0, z: 22 });
    expect(boss.clampIntoArena(0, 30, R)).toEqual({ x: 0, z: 22 - R });
    expect(boss.clampIntoArena(5, 5)).toEqual({ x: 5, z: 5 });
    const at = boss.clampIntoArena(30, 30);
    const k = 22 / Math.hypot(30, 30);
    expect(at.x).toBeCloseTo(30 * k, 10);
    expect(at.x, '圆的钳制必须两轴等量收缩').toBeCloseTo(at.z, 10);
  });
});

// ─── ③ 砸地层：贴墙放不下就不起手，并退回普通挥砍 ──────────────────────

describe('砸地：整枚圈放不下 ⇒ 不起手，不铺一枚边缘在墙外的假预告', () => {
  it('恰好贴边仍能起手；越出一丝就不起手、不铺圈、不进 slam 态', () => {
    const fits = stage(SQUARE, EDGE, 0);
    expect(fits.boss.startSlamTelegraph(), '恰好贴边（|d| + r === 半轴）该放得下').toBe(true);
    expect(fits.m.hazards.count()).toBe(1);
    const item = fits.m.hazards._items[0];
    expect(item.x, '砸地的圆心就是 Boss 自己的脚（这一招不许被挪走）').toBe(fits.boss.position.x);
    expect(item.radius).toBe(R);
    expect(fits.boss.fieldFits(item.x, item.z, item.radius), '铺下去的那一枚必须整枚在场内').toBe(true);
    expect(fits.boss.state).toBe('slam');

    const over = stage(SQUARE, OVER, 0);
    expect(over.boss.startSlamTelegraph(), '越墙的一记必须拒起手').toBe(false);
    expect(over.m.hazards.count(), '拒起手就不许在危险区系统里留下一圈').toBe(0);
    expect(over.boss.slamHazard).toBeNull();
    expect(over.boss.state, '没放成就不许把 Boss 钉在 slam 态').not.toBe('slam');
  });

  it('fieldFits 两条轴都要判：一条轴合格、另一条越界的两枚都不算放得下', () => {
    const s = stage({ x: 0, z: 0, hw: 12, hd: 8 });
    const boss = s.boss;
    // x 合格而 z 越界：7.5 + 4.5 = 12 ≤ 12 却 7.5 + 4.5 = 12 > 8
    expect(boss.fieldFits(7.5, 3.5, R), '两轴都贴边：这一枚放得下').toBe(true);
    expect(boss.fieldFits(7.5, 7.5, R), 'z 越界的一枚不算放得下').toBe(false);
    // z 合格而 x 越界：8 + 4.5 = 12.5 > 12，而 3 + 4.5 = 7.5 ≤ 8
    expect(boss.fieldFits(8, 3, R), 'x 越界的一枚也不算放得下').toBe(false);
    expect(boss.fieldFits(0, 0, R)).toBe(true);
    // 站得下才铺：Boss 在场心，长方形场的短边（hd 8）仍容得下 4.5 的圈
    expect(boss.startSlamTelegraph()).toBe(true);
    expect(s.m.hazards.count()).toBe(1);
    // 把 Boss 挪到 z 越界的那一格：同一只 Boss、同一枚圈，这一起手要被拒
    boss.slamHazard = null;                       // 上一记已许诺出去，先结清 —— 否则拒的是那道闸，不是场边界
    boss.position.z = 7.5;
    expect(boss.startSlamTelegraph(), 'z 越界的那一格不许铺圈（只有 x 在判就是这样露馅的）').toBe(false);
    expect(s.m.hazards.count(), '拒掉的这一记不许留下第二圈').toBe(1);
  });

  it('走真 melee 分支：贴墙那一拍退回挥砍前摇（windup），场心那一拍换成砸地圈', () => {
    Math.random = () => 0;                       // shadow-warden 的砸地 chance 0.35 必定命中
    const wall = stage(SQUARE, OVER, 0);
    wall.boss.phase = 2;                          // 砸地那条脚本在第二档
    wall.player.set(wall.boss.position.x, 0, wall.boss.position.z);
    wall.boss.attackCooldown = 0;
    wall.m.update(1 / 60, wall.player, wall.ref, null, null);
    expect(wall.boss.state, '贴墙那一拍该退回挥砍前摇').toBe('windup');
    expect(wall.m.hazards.count(), '退回挥砍那一拍不许已经在脚下铺圈').toBe(0);

    const core = stage(SQUARE, 0, 0);
    core.boss.phase = 2;
    core.player.set(core.boss.position.x, 0, core.boss.position.z);
    core.boss.attackCooldown = 0;
    core.m.update(1 / 60, core.player, core.ref, null, null);
    expect(core.boss.state, '场心那一拍仍该换成砸地').toBe('slam');
    expect(core.m.hazards.count()).toBe(1);
  });
});

// ─── ④ 对照层：没有墙就没有"越墙"这回事 ────────────────────────────────

describe('对照：场形状与"没有墙"的两种极端', () => {
  it('field 为 null 的世界 Boss 在任何落点都起手，fieldFits 恒真（改前它是全场唯一行为）', () => {
    for (const [x, z] of [[0, 0], [15.6, 0], [0, -15.6], [15.6, 15.6]]) {
      const s = stage(null, x, z);
      expect(s.boss.fieldFits(x, z, R), `(${x}, ${z})：没有墙就不该有放不下`).toBe(true);
      expect(s.boss.startSlamTelegraph(), `(${x}, ${z})：世界 Boss 的砸地被砍掉了`).toBe(true);
      expect(s.m.hazards.count()).toBe(1);
      expect(s.boss.state).toBe('slam');
    }
  });

  it('能起手的落点集合是方场而不是一枚内切圆：角上 (EDGE, EDGE) 仍放得下', () => {
    // 方形场 hw = hd = 12、圈半径 4.5：EDGE = 7.5。角上那一枚两轴各贴边，
    // 而它的圆心距场心 10.6 米 —— 若按"内切圆"判（半轴减半径 = 7.5 为半径）就会被拒。
    const corner = stage(SQUARE, EDGE, EDGE);
    expect(corner.boss.startSlamTelegraph(), '角上的余量是矩形给出来的，不该被内切圆拿走').toBe(true);
    expect(corner.m.hazards.count()).toBe(1);
    const past = stage(SQUARE, EDGE + 0.5, 0);
    expect(past.boss.startSlamTelegraph()).toBe(false);
  });
});
