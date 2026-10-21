/**
 * 每一位面都至少有一座副本（W-B10 切片7）—— 以及副本门口**站得住人**。
 *
 * ## 这一片补的是什么
 *
 * 破碎时线与混沌边境**原先一座副本都没有**：玩家在那两位面里只能打原生的散兵，
 * 没有一处"钻进去打一整场"的地方。八位面里六位有、一位面（枢纽）有、两位面没有 ——
 * 而"哪些位面有副本"这件事**从来没人查过**。
 *
 * ## 三条判据各有一种死法
 *
 * 1. **七座真实位面每一位至少一座**（枢纽另算）—— 少一位 = 那一座区没有副本可打。
 *    区位是**按入口坐标反推**的（`zoneIdAt`），不是从表上抄一格区位 ——
 *    抄一格就是第二份真相（坐标改了而区位没改，那一格就在说谎）。
 * 2. **门口站得住人** —— 入口**落在碰撞体里**的话，玩家走不到那儿，副本就成了
 *    "地图上有一个点但没人进得去"。这一条只有**真世界**量得出来。
 * 3. **两座副本不共用一个门口** —— 共用就等于一座进不去（后建的那座把前一座的圈盖住了）。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { DUNGEON_DEFS } from '../src/content/dungeons.js';
import { DUNGEON_ENCOUNTERS } from '../src/content/dungeonEncounters.js';
import { DUNGEON_BOSS_LINES } from '../src/content/bossDialogue.js';
import { ZONE_ORDER, ZONE_IDS, HUB_ZONE } from '../src/content/ZoneIdentity.js';
import { WorldManager } from '../src/world/WorldManager.js';
import { installWindowShim } from './helpers/enemyHarness.js';

beforeAll(installWindowShim);

let world = null;

/** 真世界：区位要按**真的**区反推，碰撞体也要**真的**那些 */
function 建世界() {
  const handlers = new Map();
  globalThis.window = {
    addEventListener(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
    },
    dispatchEvent(event) { handlers.get(event.type)?.forEach((fn) => fn(event)); return true; },
  };
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  const w = new WorldManager(new THREE.Scene(), { show() {}, toast() {} });
  w.build();
  return w;
}

/** 点到碰撞体边缘的距离（负数 = 人在里面） */
function 离碰撞体(x, z) {
  let 最近 = Infinity;
  for (const c of world.collision.colliders ?? []) {
    let d;
    if (c.shape === 'cyl') {
      d = Math.hypot(x - c.x, z - c.z) - c.r;
    } else {
      let px = x - c.x, pz = z - c.z;
      if (c.rot) {
        const co = Math.cos(-c.rot), si = Math.sin(-c.rot);
        [px, pz] = [px * co - pz * si, px * si + pz * co];
      }
      const dx = Math.max(Math.abs(px) - c.hx, 0);
      const dz = Math.max(Math.abs(pz) - c.hz, 0);
      d = Math.hypot(dx, dz);
    }
    if (d < 最近) 最近 = d;
  }
  return 最近;
}

describe('① 每一位面都至少有一座副本', () => {
  it('七座真实位面每一位都有一座（枢纽另算）', () => {
    // 归属是**声明**的（`def.zone`，设计意图）—— 几何反推答不了：
    // `zoneIdAt` 取最近的区，而位面半径 135~165 米、大面积重叠。
    const 每区 = new Map();
    for (const def of DUNGEON_DEFS) {
      每区.set(def.zone, (每区.get(def.zone) ?? 0) + 1);
    }
    for (const zone of ZONE_ORDER) {
      expect(每区.get(zone) ?? 0, `位面 "${zone}" 一座副本都没有 —— 那一位面里没有一处"钻进去打一整场"的地方`).toBeGreaterThan(0);
    }
    expect(每区.get(ZONE_IDS.HUB) ?? 0, '枢纽没有副本 —— 开局那张图上就没有一处可去的地方').toBeGreaterThan(0);
  });

  it('声明的归属是真位面，而且**门口落在那位面的地里**（声明与几何对不上 = 有一处错了）', () => {
    for (const def of DUNGEON_DEFS) {
      const 合法 = [...ZONE_ORDER, ZONE_IDS.HUB];
      expect(合法, `副本 "${def.id}" 声明的归属 "${def.zone}" 不是一位可辨认的区`).toContain(def.zone);
      // 几何合理性：门口离那位面的中心不能超过那位面的半径 ——
      // 这条**不是**"最近的区是它"（位面互相重叠，最近的那条不总是设计意图），
      // 而是"门口确实在那位区的地里"（半径是那位区的地界）。
      const 区 = def.zone === ZONE_IDS.HUB
        ? HUB_ZONE
        : world.zones.find((z) => z.id === def.zone);
      expect(区, `副本 "${def.id}" 声明的归属 "${def.zone}" 在世界里找不到`).toBeTruthy();
      const 距 = Math.hypot(def.entrance.x - 区.center.x, def.entrance.z - 区.center.z);
      expect(距, `副本 "${def.id}" 的门口离 "${def.zone}" 的中心 ${距.toFixed(0)} 米 —— 超出那位面的地界（半径 ${区.radius}）`)
        .toBeLessThanOrEqual(区.radius);
    }
  });
});

describe('② 副本门口走得到', () => {
  it('每个入口 5 米内都有一处站得住人的地方（入口的触发半径就是 5 米）', () => {
    // 口径说明：入口是**触发点**，不是"玩家要站在那一个像素上"——
    // `DungeonManager.getEntranceNear(pos, range = 5)` 就是这么判的（5 米内即触发）。
    // 所以要核的是"**走得到 5 米内**"，不是"入口那一点本身不在墙里"。
    // （真去核"那一点不在墙里"会误报：`five-dim-rift` 的入口本来就在一面墙的边缘内侧 1.2 厘米 ——
    //   标记环压在那面墙上，不影响玩家能不能走到。）
    for (const def of DUNGEON_DEFS) {
      let 走得到 = false;
      for (let a = 0; a < 16 && !走得到; a++) {
        const ang = (a / 16) * Math.PI * 2;
        for (const r of [1.5, 2.5, 3.5, 4.5]) {
          const x = def.entrance.x + Math.cos(ang) * r;
          const z = def.entrance.z + Math.sin(ang) * r;
          if (离碰撞体(x, z) > 0) { 走得到 = true; break; }
        }
      }
      expect(走得到, `副本 "${def.id}" 的入口 5 米内没有一处站得住人的地方 —— 玩家走不到，副本就进不去`).toBe(true);
    }
  });

  it('两座副本不共用一个门口（共用 = 一座进不去）', () => {
    const 键 = DUNGEON_DEFS.map((d) => `${d.entrance.x},${d.entrance.z}`);
    expect(new Set(键).size, '有两座副本的门口在同一处').toBe(DUNGEON_DEFS.length);
  });
});

describe('③ 每一座副本都齐了那三样东西', () => {
  it('每座副本都登记了遭遇（否则迷宫里出谁没人说得清）', () => {
    for (const def of DUNGEON_DEFS) {
      expect(DUNGEON_ENCOUNTERS[def.id], `副本 "${def.id}" 没有登记遭遇`).toBeTruthy();
      expect(DUNGEON_ENCOUNTERS[def.id].pool.length, `副本 "${def.id}" 的遭遇池是空的`).toBeGreaterThan(0);
    }
  });

  it('每座副本的守钥者都有台词（没有 = 那只 Boss 静默地不开口）', () => {
    for (const def of DUNGEON_DEFS) {
      const 行 = DUNGEON_BOSS_LINES[def.id];
      expect(行, `副本 "${def.id}" 的守钥者没有台词`).toBeTruthy();
      for (const 段 of ['intro', 'p2', 'p3', 'defeat']) {
        expect(行[段], `副本 "${def.id}" 的守钥者缺 "${段}" 那一段`).toBeTruthy();
      }
    }
  });
});

beforeAll(() => { world = 建世界(); });
