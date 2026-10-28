/**
 * 区域坐标单一真源门禁（修 B150）。
 *
 * 症状：`ExplorationMap.revealZone()` 曾私有一张六格的表（hub / fantasy / magic /
 * space / void / abyss），漏了 `ZONE_ORDER` 里的 gloom 与 radiant —— 走进那两座区时
 * 迷雾整片静默跳过，另五座一次揭开。没有异常、没有红腿，因为"没配"与"配了但不该亮"
 * 在代码里长得一模一样。
 *
 * 本门钉三件事：
 * 1. **表本身**：`ZONE_CENTERS` 的键集逐格等于 `ZONE_ORDER`，坐标有限、`y === 0`。
 * 2. **装配侧读它**：`WorldManager.build()` 不再手抄 `{ x, z }`，真建出来的七座实例
 *    中心逐格等于表（走生产路径，不手搓实例）。
 * 3. **迷雾侧认得每一座**：`revealZone(id)` 对每一座区都点亮它自己的中心；中心改了
 *    跟着改（证明读的是真源而不是另一张表）；认不出的 id 不炸也不亮。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ZONE_IDS, ZONE_ORDER, ZONE_CENTERS, HUB_ZONE,
} from '../src/content/ZoneIdentity.js';
import { ExplorationMap, MAP_SPAN_M } from '../src/game/ExplorationMap.js';
import { WorldManager } from '../src/world/WorldManager.js';
import { installWindowShim } from './helpers/enemyHarness.js';

const 全部区 = [ZONE_IDS.HUB, ...ZONE_ORDER];

/** 只给"区实例"这一格的世界桩：迷雾只需要 id / center / radius */
const 假世界 = (zones) => ({
  zoneId: ZONE_IDS.HUB,
  dungeons: { active: false },
  restPoints: { points: [] },
  world: { zoneId: ZONE_IDS.HUB, zones },
});

const 读源 = (rel) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('ZONE_CENTERS 是七座区的唯一一份坐标', () => {
  it('键集逐格等于 ZONE_ORDER（加一座区忘配坐标 = 红，不是静默漏开雾）', () => {
    expect(Object.keys(ZONE_CENTERS).slice().sort()).toEqual([...ZONE_ORDER].sort());
  });

  it('每条坐标有限、落在世界跨度内、y 恒为 0（室内高度公式读它，B120）', () => {
    const 半 = MAP_SPAN_M / 2;
    for (const id of ZONE_ORDER) {
      const c = ZONE_CENTERS[id];
      for (const axis of ['x', 'z']) {
        expect(Number.isFinite(c[axis]), `${id}.${axis}`).toBe(true);
        expect(Math.abs(c[axis]), `${id}.${axis} 超出地图跨度`).toBeLessThanOrEqual(半);
      }
      expect(c.y, `${id}.y 必须是 0`).toBe(0);
    }
  });

  it('世界装配侧不再手抄坐标：七个构造点都从表里取', () => {
    const 源 = 读源('src/world/WorldManager.js');
    // 反向控制：旧形状（字面量）必须被这条正则咬住 —— 否则"扫不到"可能只是尺子坏了
    const 旧形状 = /new \w+Zone\(this\.scene, \{ x: -?\d+, z: -?\d+ \}/;
    expect(旧形状.test('    const a = new FantasyZone(this.scene, { x: -200, z: 0 }, this.dialog);')).toBe(true);
    expect(旧形状.test(源), 'WorldManager 里又出现了手抄的区域坐标').toBe(false);
    const 用表 = 源.match(/ZONE_CENTERS\[ZONE_IDS\.\w+\]/g) ?? [];
    expect(用表.length, '七个构造点没有全部改读 ZONE_CENTERS').toBeGreaterThanOrEqual(ZONE_ORDER.length);
  });
});

describe('真世界的七座实例中心与表逐格相等', () => {
  afterEach(() => { delete globalThis.window; });

  it('走 WorldManager.build() 生产路径，不手搓实例', () => {
    installWindowShim();
    const world = new WorldManager({ add() {}, remove() {} }, { show() {}, toast() {} });
    world.build();
    expect(world.zones).toHaveLength(ZONE_ORDER.length);
    for (const id of ZONE_ORDER) {
      const 实例 = world.zones.find((z) => z.id === id);
      expect(实例, `build() 出来的世界里没有 ${id} 实例`).toBeTruthy();
      expect({ x: 实例.center.x, y: 实例.center.y, z: 实例.center.z }, `${id} 的中心漂了`).toEqual({
        x: ZONE_CENTERS[id].x, y: 0, z: ZONE_CENTERS[id].z,
      });
    }
  });
});

describe('revealZone 认得每一座区（含旧表漏掉的两座）', () => {
  it('逐座：点亮的正是它自己的中心', () => {
    for (const id of 全部区) {
      const m = new ExplorationMap(假世界([]));
      m.revealZone(id);
      const 中心 = id === ZONE_IDS.HUB ? HUB_ZONE.center : ZONE_CENTERS[id];
      expect(m.isRevealed(中心.x, 中心.z), `走进 ${id} 却没有点亮它的中心`).toBe(true);
      expect([...m.zoneRevealed], `${id} 没进已揭开的区名册`).toContain(id);
    }
  });

  it('回归：gloom / radiant 这两座旧表漏掉的区必须亮（当年整片静默跳过）', () => {
    for (const id of [ZONE_IDS.GLOOM, ZONE_IDS.RADIANT]) {
      const m = new ExplorationMap(假世界([]));
      m.revealZone(id);
      // 只点亮中心太弱：半径至少盖到 20 米外，证明不是"恰好中心那一格"
      expect(m.isRevealed(ZONE_CENTERS[id].x + 20, ZONE_CENTERS[id].z), `${id} 只亮了一格`).toBe(true);
    }
  });

  it('中心跟着世界实例走：把实例挪走，旧坐标不许再亮（没有第二份表）', () => {
    const 挪过 = [{ id: ZONE_IDS.FANTASY, center: { x: 123, z: -77 }, radius: 165 }];
    const m = new ExplorationMap(假世界(挪过));
    m.revealZone(ZONE_IDS.FANTASY);
    expect(m.isRevealed(123, -77)).toBe(true);
    expect(m.isRevealed(ZONE_CENTERS[ZONE_IDS.FANTASY].x, ZONE_CENTERS[ZONE_IDS.FANTASY].z),
      '实例已经挪走，旧坐标还亮着 —— 说明还有第二份坐标在答话').toBe(false);
  });

  it('认不出的 id：记名册但不亮、不抛（走廊 / 未知区域是正常路过）', () => {
    const m = new ExplorationMap(假世界([]));
    expect(() => m.revealZone('corridor')).not.toThrow();
    expect([...m.zoneRevealed]).toContain('corridor');
    expect(m.getExploredPercent()).toBe(0);
  });

  it('枢纽没有实例也能亮：读 HUB_ZONE', () => {
    const m = new ExplorationMap(假世界([]));
    m.revealZone(ZONE_IDS.HUB);
    expect(m.isRevealed(HUB_ZONE.center.x, HUB_ZONE.center.z)).toBe(true);
  });
});
