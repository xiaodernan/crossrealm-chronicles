/**
 * B83: InternalSpace + VerticalSchedule 零测试覆盖见证。
 *
 * 症状：
 * - `src/world/InternalSpace.js` (400 行) 与 `src/world/VerticalSchedule.js` (291 行) 在生产中被 WorldManager 消费，但测试覆盖率 = 0。
 * - 契约只活在代码里：字段改名、坐标变换逻辑错误、楼层解锁判定失效都会静默炸掉，没有任何门禁能拦住。
 *
 * 交付：
 * - ① InternalSpace 注册层：验证 4 个模板正确实例化、zoneId/id/radius/floor 等关键字段落值。
 * - ② 坐标变换层：localToWorld / worldToLocal / containsWorldPoint / getInternalHeightAt 行为断言（含下限）。
 * - ③ 碰撞体层：addCylinderCollider / addBoxCollider / getColliders 返回带世界坐标元数据的对象。
 * - ④ VerticalScheduler 创建层：gloom/radiant 两区各生成调度器，楼层数 ≥ 3 / ≥ 3。
 * - ⑤ 解锁/移动层：楼梯冷却、电梯入口检查、传送门条件、历史轨迹记录。
 * - ⑥ 存档层：toJSON/fromJSON 往返不丢状态。
 * - ⑦ 管理器层：register / buildZone / querySpaceAt / updateCurrent 全链路跑通。
 * - ⑧ 接线层（B83 判据的本义）：真世界 WorldManager.build() 之后点名「哪座模板注册了、
 *   哪个区的调度器在跑」—— 模块级用例只证明契约写对了，接线断言才证明 WorldManager
 *   真的喂了它们四座模板、两台调度器（buildZone 跑过 / 解锁回调活着）。
 *
 * 门禁：
 * - 全量套件保持全绿，lint 0 error，build 成功。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InternalSpace, InternalSpaceManager, InternalSpaceTemplates } from '../src/world/InternalSpace.js';
import { WorldManager } from '../src/world/WorldManager.js';
import {
  FloorLevel,
  VerticalMoveMode,
  VerticalSchedulePresets,
  createVerticalScheduler,
} from '../src/world/VerticalSchedule.js';

describe('B83: InternalSpace 模板注册', () => {
  const zoneCenter = { x: 0, y: 0, z: 0 };

  it('gloomAncientShrine 实例化后关键字段非空', () => {
    const space = InternalSpaceTemplates.gloomAncientShrine(zoneCenter);
    expect(space.id).toBe('gloom-ancient-shrine');
    expect(space.zoneId).toBe('gloom');
    expect(space.floor).toBe(-1);
    expect(space.radius).toBe(12);
    expect(space.baseHeight).toBe(-3);
    expect(space.floorHeight).toBe(5);
    expect(space.fogColor).toBe(0x1a1a2a);
    expect(space.fogDensity).toBe(0.015);
    // sampleHeightInternal 必须是个函数
    expect(typeof space.sampleHeightInternal).toBe('function');
    // 中心凹陷采样：原点应 < 0
    const h = space.sampleHeightInternal(0, 0);
    expect(h).toBeLessThan(0);
  });

  it('gloomTreeHollow 实例化后关键字段非空', () => {
    const space = InternalSpaceTemplates.gloomTreeHollow(zoneCenter);
    expect(space.id).toBe('gloom-tree-hollow');
    expect(space.zoneId).toBe('gloom');
    expect(space.floor).toBe(1);
    expect(space.radius).toBe(8);
    expect(space.baseHeight).toBe(8);
    expect(space.floorHeight).toBe(3.5);
  });

  it('radiantGrandHall 实例化后关键字段非空', () => {
    const space = InternalSpaceTemplates.radiantGrandHall(zoneCenter);
    expect(space.id).toBe('radiant-grand-hall');
    expect(space.zoneId).toBe('radiant');
    expect(space.floor).toBe(0);
    expect(space.radius).toBe(25);
    expect(space.baseHeight).toBe(1);
    expect(space.floorHeight).toBe(8);
    // 中央微隆起：原点应 > 0
    const h = space.sampleHeightInternal(0, 0);
    expect(h).toBeGreaterThan(0);
  });

  it('radiantStarwatchTower 实例化后关键字段非空', () => {
    const space = InternalSpaceTemplates.radiantStarwatchTower(zoneCenter);
    expect(space.id).toBe('radiant-starwatch-tower');
    expect(space.zoneId).toBe('radiant');
    expect(space.floor).toBe(2);
    expect(space.radius).toBe(10);
    expect(space.baseHeight).toBe(12);
    expect(space.floorHeight).toBe(6);
  });

  it('四个模板的 id 互不重复', () => {
    const ids = [
      InternalSpaceTemplates.gloomAncientShrine(zoneCenter).id,
      InternalSpaceTemplates.gloomTreeHollow(zoneCenter).id,
      InternalSpaceTemplates.radiantGrandHall(zoneCenter).id,
      InternalSpaceTemplates.radiantStarwatchTower(zoneCenter).id,
    ];
    const unique = new Set(ids);
    expect(unique.size).toBe(4);
  });
});

describe('B83: InternalSpace 坐标变换', () => {
  const zoneCenter = { x: 100, y: 5, z: -50 };
  const space = new InternalSpace({
    id: 'test-space',
    zoneId: 'test-zone',
    localCenter: { x: 10, z: 20 },
    radius: 15,
    baseHeight: 3,
    floor: 1,
    floorHeight: 4,
    sampleHeightInternal: (lx, lz) => lx * 0.1 + lz * 0.05,
  });

  it('getWorldCenter 返回正确的世界坐标', () => {
    const wc = space.getWorldCenter(zoneCenter);
    expect(wc.x).toBe(110); // 100 + 10
    expect(wc.z).toBe(-30); // -50 + 20
  });

  it('getWorldBaseHeight 计算包含 floor 偏移', () => {
    const base = space.getWorldBaseHeight(zoneCenter);
    expect(base).toBe(12); // 5 + 3 + 1*4
  });

  it('containsWorldPoint 在半径内返回 true', () => {
    const wc = space.getWorldCenter(zoneCenter);
    const inside = space.containsWorldPoint(wc.x, wc.z, zoneCenter);
    expect(inside).toBe(true);
  });

  it('containsWorldPoint 在半径外返回 false', () => {
    const wc = space.getWorldCenter(zoneCenter);
    const outside = space.containsWorldPoint(wc.x + 20, wc.z + 20, zoneCenter);
    expect(outside).toBe(false);
  });

  it('localToWorld / worldToLocal 往返一致', () => {
    const lx = 5, lz = -3;
    const world = space.localToWorld(lx, lz, zoneCenter);
    const back = space.worldToLocal(world.x, world.z, zoneCenter);
    expect(back.x).toBeCloseTo(lx, 5);
    expect(back.z).toBeCloseTo(lz, 5);
  });

  it('getInternalHeightAt 返回绝对高度', () => {
    // 本地采样：lx=5, lz=-3 → 5*0.1 + (-3)*0.05 = 0.35
    // 世界基高：12
    // 预期：12.35
    const wc = space.getWorldCenter(zoneCenter);
    const worldX = wc.x + 5;
    const worldZ = wc.z - 3;
    const h = space.getInternalHeightAt(worldX, worldZ, zoneCenter);
    expect(h).toBeCloseTo(12.35, 5);
  });
});

describe('B83: InternalSpace 碰撞体', () => {
  const space = new InternalSpace({
    id: 'collider-test',
    zoneId: 'test',
    localCenter: { x: 5, z: 10 },
    radius: 10,
    baseHeight: 2,
  });

  it('addCylinderCollider 登记圆柱碰撞体', () => {
    space.addCylinderCollider(3, 7, 2, 5, { base: 1, kind: 'solid' });
    expect(space.colliders.length).toBe(1);
    const c = space.colliders[0];
    expect(c.shape).toBe('cyl');
    expect(c.lx).toBe(3);
    expect(c.lz).toBe(7);
    expect(c.r).toBe(2);
    expect(c.base).toBe(3); // 2 + 1
    expect(c.top).toBe(7); // 2 + 5
    expect(c.kind).toBe('solid');
  });

  it('addBoxCollider 登记盒状碰撞体', () => {
    space.addBoxCollider(1, -2, 3, 4, 6, { base: 0, rot: Math.PI / 4, kind: 'passable' });
    expect(space.colliders.length).toBe(2);
    const c = space.colliders[1];
    expect(c.shape).toBe('box');
    expect(c.lx).toBe(1);
    expect(c.lz).toBe(-2);
    expect(c.hx).toBe(3);
    expect(c.hz).toBe(4);
    expect(c.base).toBe(2); // 2 + 0
    expect(c.top).toBe(8); // 2 + 6
    expect(c.rot).toBe(Math.PI / 4);
    expect(c.kind).toBe('passable');
  });

  it('getColliders 返回带世界坐标元数据的副本', () => {
    const metas = space.getColliders();
    expect(metas.length).toBe(2);
    for (const m of metas) {
      expect(m._spaceId).toBe('collider-test');
      expect(m._zoneId).toBe('test');
      expect(m._localCenter).toEqual({ x: 5, z: 10 });
      expect(m._baseHeight).toBe(2);
      expect(m._floor).toBe(0);
      expect(m._floorHeight).toBe(4);
    }
  });
});

describe('B83: InternalSpace POI 登记', () => {
  const space = new InternalSpace({
    id: 'poi-test',
    zoneId: 'test',
    localCenter: { x: 0, z: 0 },
    radius: 10,
    baseHeight: 0,
    sampleHeightInternal: () => 0,
  });

  it('addPOI 拒绝缺少 id 的 POI', () => {
    expect(() => {
      space.addPOI({ x: 0, y: 0, z: 0 }, '无名 POI', () => {});
    }).toThrow(/缺少 id/);
  });

  it('addPOI 拒绝不符合 kebab-case 的 id', () => {
    expect(() => {
      space.addPOI({ x: 0, y: 0, z: 0 }, '坏 ID', () => {}, { id: 'Bad_ID' });
    }).toThrow(/不符合 kebab-case/);
  });

  it('addPOI 拒绝重复 id', () => {
    space.addPOI({ x: 1, y: 0, z: 2 }, '第一个', () => {}, { id: 'first-poi' });
    expect(() => {
      space.addPOI({ x: 3, y: 0, z: 4 }, '第二个', () => {}, { id: 'first-poi' });
    }).toThrow(/id first-poi 重复/);
  });

  it('addPOI 成功后 pois 数组长度 +1', () => {
    const before = space.pois.length;
    space.addPOI({ x: 5, y: 1, z: 6 }, '测试点', () => {}, { id: 'test-point', type: 'quest' });
    expect(space.pois.length).toBe(before + 1);
    const poi = space.pois[space.pois.length - 1];
    expect(poi.id).toBe('test-point');
    expect(poi.label).toBe('测试点');
    expect(poi.type).toBe('quest');
    expect(poi.spaceId).toBe('poi-test');
  });

  it('createPOIMarker 返回 THREE.Group', () => {
    const marker = space.createPOIMarker(0, 0, 0, 0xff0000);
    expect(marker.constructor.name).toBe('Group');
    expect(marker.children.length).toBeGreaterThanOrEqual(2); // beam + ring
  });
});

describe('B83: InternalSpaceManager 注册与查询', () => {
  const manager = new InternalSpaceManager();
  const zoneCenter = { x: 0, y: 0, z: 0 };

  it('register 把空间按 zoneId 分组', () => {
    const s1 = new InternalSpace({
      id: 's1',
      zoneId: 'zone-a',
      localCenter: { x: 0, z: 0 },
      radius: 10,
    });
    const s2 = new InternalSpace({
      id: 's2',
      zoneId: 'zone-a',
      localCenter: { x: 5, z: 5 },
      radius: 8,
    });
    const s3 = new InternalSpace({
      id: 's3',
      zoneId: 'zone-b',
      localCenter: { x: -10, z: -10 },
      radius: 12,
    });

    manager.register(s1);
    manager.register(s2);
    manager.register(s3);

    expect(manager.spacesByZone.get('zone-a').length).toBe(2);
    expect(manager.spacesByZone.get('zone-b').length).toBe(1);
  });

  it('querySpaceAt 返回玩家所在的空间', () => {
    const s1 = manager.spacesByZone.get('zone-a')[0];
    const found = manager.querySpaceAt(0, 0, 'zone-a', zoneCenter);
    expect(found).toBe(s1);
  });

  it('querySpaceAt 在半径外返回 null', () => {
    const found = manager.querySpaceAt(100, 100, 'zone-a', zoneCenter);
    expect(found).toBe(null);
  });

  it('updateCurrent 更新 currentSpace', () => {
    manager.updateCurrent(0, 0, 'zone-a', zoneCenter);
    expect(manager.currentSpace).not.toBeNull();
    expect(manager.currentSpace.id).toBe('s1');
  });

  it('getCurrentInternalHeight 不在任何空间时返回 null', () => {
    manager.updateCurrent(999, 999, 'zone-a', zoneCenter);
    const h = manager.getCurrentInternalHeight(999, 999);
    expect(h).toBe(null);
  });

  it('buildZone 调用每个空间的 build 方法', () => {
    const builtSpy = vi.spyOn(manager.spacesByZone.get('zone-a')[0], 'build');
    manager.buildZone('zone-a', zoneCenter);
    expect(builtSpy).toHaveBeenCalled();
  });

  it('update 遍历所有空间执行动画更新', () => {
    const allSpaces = [...manager.spacesByZone.values()].flat();
    const updateSpies = allSpaces.map((s) => vi.spyOn(s, 'update'));
    manager.update(0.016);
    for (const spy of updateSpies) {
      expect(spy).toHaveBeenCalledWith(0.016);
    }
  });
});

describe('B83: VerticalSchedule 预置楼层', () => {
  it('gloom 预置至少 3 层', () => {
    const floors = VerticalSchedulePresets.gloom;
    expect(floors.length).toBeGreaterThanOrEqual(3);
    expect(floors.every((f) => f instanceof FloorLevel)).toBe(true);
  });

  it('radiant 预置至少 3 层', () => {
    const floors = VerticalSchedulePresets.radiant;
    expect(floors.length).toBeGreaterThanOrEqual(3);
    expect(floors.every((f) => f instanceof FloorLevel)).toBe(true);
  });

  it('gloom 楼层号包含 -1, 0, 1, 2', () => {
    const nums = VerticalSchedulePresets.gloom.map((f) => f.floor);
    expect(nums).toContain(-1);
    expect(nums).toContain(0);
    expect(nums).toContain(1);
    expect(nums).toContain(2);
  });

  it('radiant 楼层号包含 0, 1, 2', () => {
    const nums = VerticalSchedulePresets.radiant.map((f) => f.floor);
    expect(nums).toContain(0);
    expect(nums).toContain(1);
    expect(nums).toContain(2);
  });

  it('每层都有合法的 minHeight/maxHeight', () => {
    const allFloors = [
      ...VerticalSchedulePresets.gloom,
      ...VerticalSchedulePresets.radiant,
    ];
    for (const f of allFloors) {
      expect(f.minHeight).toBeLessThanOrEqual(f.maxHeight);
      expect(typeof f.name).toBe('string');
      expect(f.name.length).toBeGreaterThan(0);
    }
  });

  it('每层 zoneId 与所属区域一致', () => {
    for (const f of VerticalSchedulePresets.gloom) {
      expect(f.zoneId).toBe('gloom');
    }
    for (const f of VerticalSchedulePresets.radiant) {
      expect(f.zoneId).toBe('radiant');
    }
  });
});

describe('B83: VerticalScheduler 创建与解锁', () => {
  const hasRequirement = (req) => req === 'side-zone-gloom';

  it('createVerticalScheduler 为 gloom 生成调度器', () => {
    const scheduler = createVerticalScheduler('gloom', hasRequirement);
    expect(scheduler).not.toBeNull();
    expect(scheduler.floors.length).toBeGreaterThanOrEqual(3);
  });

  it('createVerticalScheduler 为 radiant 生成调度器', () => {
    const scheduler = createVerticalScheduler('radiant', hasRequirement);
    expect(scheduler).not.toBeNull();
    expect(scheduler.floors.length).toBeGreaterThanOrEqual(3);
  });

  it('createVerticalScheduler 对未知区域返回 null', () => {
    const scheduler = createVerticalScheduler('unknown', hasRequirement);
    expect(scheduler).toBe(null);
  });

  it('refresh 根据 hasRequirement 解锁对应楼层', () => {
    const scheduler = createVerticalScheduler('gloom', hasRequirement);
    scheduler.refresh();
    // floor -1: 无要求 → 解锁
    expect(scheduler.isUnlocked(-1)).toBe(true);
    // floor 0: 无要求 → 解锁
    expect(scheduler.isUnlocked(0)).toBe(true);
    // floor 1: 需要 'side-zone-gloom' → 解锁
    expect(scheduler.isUnlocked(1)).toBe(true);
    // floor 2: 需要 'side-zone-gloom-wisp' → 未解锁
    expect(scheduler.isUnlocked(2)).toBe(false);
  });

  it('默认解锁 floor 0', () => {
    const scheduler = createVerticalScheduler('gloom', () => false);
    expect(scheduler.isUnlocked(0)).toBe(true);
  });
});

describe('B83: VerticalScheduler 垂直移动', () => {
  const now = Date.now() / 1000;

  it('tryMove 楼梯模式首次成功', () => {
    const scheduler = createVerticalScheduler('gloom', () => true);
    scheduler.refresh();
    const result = scheduler.tryMove(1, VerticalMoveMode.STAIRS, now);
    expect(result.success).toBe(true);
    expect(scheduler.currentFloor).toBe(1);
  });

  it('tryMove 楼梯模式冷却中失败', () => {
    const scheduler = createVerticalScheduler('gloom', () => true);
    scheduler.refresh();
    scheduler.tryMove(1, VerticalMoveMode.STAIRS, now);
    const result = scheduler.tryMove(2, VerticalMoveMode.STAIRS, now + 0.5);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('楼梯冷却中');
  });

  it('tryMove 冷却结束后再次成功', () => {
    const scheduler = createVerticalScheduler('gloom', () => true);
    scheduler.refresh();
    scheduler.tryMove(1, VerticalMoveMode.STAIRS, now);
    const result = scheduler.tryMove(2, VerticalMoveMode.STAIRS, now + 2);
    expect(result.success).toBe(true);
    expect(scheduler.currentFloor).toBe(2);
  });

  it('tryMove 电梯模式无入口失败', () => {
    const sched = createVerticalScheduler('gloom', () => true);
    sched.refresh();
    // 手动清空某层的 entrances
    const targetFloor = sched.getFloor(1);
    targetFloor.entrances = [];
    const result = sched.tryMove(1, VerticalMoveMode.ELEVATOR, now + 10);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('无电梯入口');
  });

  it('tryMove 传送门模式无条件限制', () => {
    const sched = createVerticalScheduler('gloom', () => true);
    sched.refresh();
    const result = sched.tryMove(-1, VerticalMoveMode.PORTAL, now + 20);
    expect(result.success).toBe(true);
  });

  it('tryMove 目标楼层不存在失败', () => {
    const scheduler = createVerticalScheduler('gloom', () => true);
    scheduler.refresh();
    const result = scheduler.tryMove(999, VerticalMoveMode.STAIRS, now + 30);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('目标楼层不存在');
  });

  it('tryMove 未解锁楼层失败', () => {
    const sched = createVerticalScheduler('gloom', () => false); // 全不解锁（除了 0）
    sched.refresh();
    const result = sched.tryMove(1, VerticalMoveMode.STAIRS, now + 40);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('楼层未解锁');
  });

  it('tryMove 未知模式失败', () => {
    const scheduler = createVerticalScheduler('gloom', () => true);
    scheduler.refresh();
    const result = scheduler.tryMove(0, 'unknown-mode', now + 50);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('未知移动模式');
  });

  it('moveHistory 记录每次成功移动', () => {
    const sched = createVerticalScheduler('gloom', () => true);
    sched.refresh();
    const t0 = 1000;
    sched.tryMove(1, VerticalMoveMode.STAIRS, t0);
    sched.tryMove(2, VerticalMoveMode.STAIRS, t0 + 2);
    expect(sched.moveHistory.length).toBe(2);
    expect(sched.moveHistory[0]).toEqual({
      from: 0,
      to: 1,
      mode: VerticalMoveMode.STAIRS,
      time: t0,
    });
    expect(sched.moveHistory[1]).toEqual({
      from: 1,
      to: 2,
      mode: VerticalMoveMode.STAIRS,
      time: t0 + 2,
    });
  });

  it('getReachableFloors 返回相邻已解锁楼层', () => {
    const sched = createVerticalScheduler('gloom', () => true);
    sched.refresh();
    sched.tryMove(1, VerticalMoveMode.STAIRS, now + 60);
    const reachable = sched.getReachableFloors();
    expect(reachable).toContain(0);
    expect(reachable).toContain(2);
    expect(reachable.length).toBe(2);
  });

  it('getHistory 默认返回最近 20 条', () => {
    const scheduler = createVerticalScheduler('gloom', () => true);
    scheduler.refresh();
    const history = scheduler.getHistory();
    expect(history.length).toBeLessThanOrEqual(20);
  });
});

describe('B83: VerticalScheduler 存档往返', () => {
  it('toJSON 序列化当前状态', () => {
    const sched = createVerticalScheduler('gloom', () => true);
    sched.refresh();
    sched.tryMove(1, VerticalMoveMode.STAIRS, 100);
    sched.tryMove(2, VerticalMoveMode.STAIRS, 102);
    const data = sched.toJSON();
    expect(data.currentFloor).toBe(2);
    expect(Array.isArray(data.unlockedFloors)).toBe(true);
    expect(Array.isArray(data.discoveredFloors)).toBe(true);
    expect(typeof data.lastStairsMove).toBe('number');
    expect(data.moveHistory.length).toBe(2);
  });

  it('fromJSON 恢复状态后 refresh 重新计算解锁', () => {
    const sched1 = createVerticalScheduler('gloom', () => true);
    sched1.refresh();
    sched1.tryMove(2, VerticalMoveMode.STAIRS, 200);
    const data = sched1.toJSON();

    const sched2 = createVerticalScheduler('gloom', () => false); // 新实例，全不解锁
    sched2.fromJSON(data);
    expect(sched2.currentFloor).toBe(2);
    expect(sched2.unlockedFloors.has(2)).toBe(true);
    expect(sched2.discoveredFloors.has(2)).toBe(true);
    expect(sched2.lastStairsMove).toBe(200);
    expect(sched2.moveHistory.length).toBe(1);

    sched2.refresh(); // 用新的 hasRequirement 重新计算
    // floor 0 始终解锁
    expect(sched2.isUnlocked(0)).toBe(true);
  });

  it('fromJSON 对空数据安全', () => {
    const sched = createVerticalScheduler('gloom', () => true);
    sched.fromJSON(null);
    expect(sched.currentFloor).toBe(0);
  });
});

describe('B83: FloorLevel 行为', () => {
  it('containsHeight 判断高度范围', () => {
    const floor = new FloorLevel({
      floor: 1,
      name: '测试层',
      minHeight: 10,
      maxHeight: 20,
    });
    expect(floor.containsHeight(10)).toBe(true);
    expect(floor.containsHeight(15)).toBe(true);
    expect(floor.containsHeight(20)).toBe(true);
    expect(floor.containsHeight(9)).toBe(false);
    expect(floor.containsHeight(21)).toBe(false);
  });

  it('checkUnlocked 所有条件满足时解锁', () => {
    const floor = new FloorLevel({
      floor: 2,
      name: '高层',
      minHeight: 20,
      maxHeight: 30,
      unlockRequirements: ['req-a', 'req-b'],
    });
    const hasReq = (r) => r === 'req-a' || r === 'req-b';
    expect(floor.checkUnlocked(hasReq)).toBe(true);
    expect(floor.unlocked).toBe(true);
  });

  it('checkUnlocked 任一条件不满足时不解锁', () => {
    const floor = new FloorLevel({
      floor: 3,
      name: '更高层',
      minHeight: 30,
      maxHeight: 40,
      unlockRequirements: ['req-a', 'req-c'],
    });
    const hasReq = (r) => r === 'req-a' || r === 'req-b'; // 缺 req-c
    expect(floor.checkUnlocked(hasReq)).toBe(false);
    expect(floor.unlocked).toBe(false);
  });

  it('markDiscovered 标记发现状态', () => {
    const floor = new FloorLevel({
      floor: 0,
      name: '地面',
      minHeight: 0,
      maxHeight: 5,
    });
    expect(floor.discovered).toBe(false);
    floor.markDiscovered();
    expect(floor.discovered).toBe(true);
  });
});

describe('B83: WorldManager 接线（真世界点名）', () => {
  const makeScene = () => ({ add() {}, remove() {} });
  const makeDialog = () => ({ show() {}, toast() {} });
  let world;

  beforeEach(() => {
    // poi-identity 同款桩：node 里没有 window，WorldManager.build() 的 textures-ready 事件要有人接
    globalThis.window = { addEventListener() {}, dispatchEvent() { return true; } };
    globalThis.CustomEvent = class { constructor(type) { this.type = type; } };
    world = new WorldManager(makeScene(), makeDialog());
    world.build();
  });

  afterEach(() => {
    delete globalThis.window;
    delete globalThis.CustomEvent;
  });

  it('四座内部空间按区注册点名（gloom 2 / radiant 2），且 buildZone 真的跑过', () => {
    const byZone = world.internalSpaceManager.spacesByZone;
    const gloomIds = (byZone.get('gloom') ?? []).map((s) => s.id);
    const radiantIds = (byZone.get('radiant') ?? []).map((s) => s.id);
    expect(gloomIds).toEqual(expect.arrayContaining(['gloom-ancient-shrine', 'gloom-tree-hollow']));
    expect(radiantIds).toEqual(expect.arrayContaining(['radiant-grand-hall', 'radiant-starwatch-tower']));
    // 样本下限：不是"至少有一座"，是两区各自恰好这四座
    expect(gloomIds).toHaveLength(2);
    expect(radiantIds).toHaveLength(2);
    // buildZone 没跑过的话 _built 还是 false —— "走进建筑没有室内"就是这么静默发生的
    for (const space of [...byZone.get('gloom'), ...byZone.get('radiant')]) {
      expect(space._built, `${space.id} 没被 buildZone 建过`).toBe(true);
    }
  });

  it('gloom/radiant 两区的竖向调度器在跑（楼层带样本下限），preset 缺席的区不建', () => {
    const gloom = world.verticalSchedulers.get('gloom');
    const radiant = world.verticalSchedulers.get('radiant');
    expect(gloom, 'gloom 调度器缺失').toBeTruthy();
    expect(radiant, 'radiant 调度器缺失').toBeTruthy();
    // 预置表：gloom 4 层（-1/0/1/2）、radiant 3 层（0/1/2）—— 只设下限，加层不破门禁
    expect(gloom.floors.length).toBeGreaterThanOrEqual(4);
    expect(radiant.floors.length).toBeGreaterThanOrEqual(3);
    expect(gloom.currentFloor).toBe(0);
    expect(gloom.isUnlocked(0)).toBe(true);
    // fantasy 区存在但没有竖向预置 —— createVerticalScheduler 返回 null，WorldManager 不塞空壳
    expect(world.verticalSchedulers.has('fantasy')).toBe(false);
  });

  it('解锁回调活着：调度器的 hasRequirement 接在 WorldManager._checkVerticalRequirement 上', () => {
    const radiant = world.verticalSchedulers.get('radiant');
    // hasRequirement 若没接上（undefined），refresh() 当场 TypeError —— 这正是"楼层永远读 0"的前置
    expect(() => radiant.refresh()).not.toThrow();
    // 支线 side-zone-radiant 未完成，1 层不许被解锁
    radiant.refresh();
    expect(radiant.isUnlocked(1)).toBe(false);
  });
});