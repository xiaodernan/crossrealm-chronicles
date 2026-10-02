/**
 * 竖向日程 —— 区域内的垂直层级/楼层管理与调度（W-B9 切片3）。
 *
 * 设计动机：
 * - 内部空间引入了 floor 概念，但缺乏"谁在几层、何时能上几层"的调度机制。
 * - 竖向日程把"楼层解锁、垂直移动、跨层任务"显式化：
 *   1. 每个区域维护一组 FloorLevel（楼层定义：高度范围、解锁条件、入口点）
 *   2. VerticalScheduler 跟踪玩家当前楼层、解锁进度、垂直移动冷却
 *   3. 支持"爬楼梯/电梯/传送门"三种垂直移动模式
 *   4. 与内部空间联动：进入 InternalSpace 时自动按 floor 校验
 *   5. 与任务系统联动：支线/主线可要求"到达某楼层"
 */

import { ZONE_IDS } from '../content/ZoneIdentity.js';

/** 楼层定义 */
export class FloorLevel {
  /**
   * @param {object} config
   * @param {number} config.floor - 楼层号（整数，可负：地下室 -1、-2……）
   * @param {string} config.name - 显示名（如"一层大厅"、"地下密室"）
   * @param {number} config.minHeight - 最小绝对高度（世界坐标 Y）
   * @param {number} config.maxHeight - 最大绝对高度
   * @param {string[]} [config.unlockRequirements=[]] - 解锁前置条件（任务 id、道具 id、等级等）
   * @param {{x:number,z:number}[]} [config.entrances=[]] - 入口点（世界坐标，供传送/寻路用）
   * @param {string} [config.zoneId] - 所属区域 id
   * @param {string} [config.internalSpaceId] - 关联的内部空间 id（可选）
   */
  constructor(config) {
    this.floor = config.floor;
    this.name = config.name;
    this.minHeight = config.minHeight;
    this.maxHeight = config.maxHeight;
    this.unlockRequirements = config.unlockRequirements ?? [];
    this.entrances = config.entrances ?? [];
    this.zoneId = config.zoneId;
    this.internalSpaceId = config.internalSpaceId;
    this.unlocked = false;
    this.discovered = false;
  }

  /** 判断某世界高度是否落在本楼层 */
  containsHeight(y) {
    return y >= this.minHeight && y <= this.maxHeight;
  }

  /** 判断是否已解锁（需外部传入检查函数：req => bool） */
  checkUnlocked(hasRequirement) {
    this.unlocked = this.unlockRequirements.every(hasRequirement);
    return this.unlocked;
  }

  /** 标记发现 */
  markDiscovered() {
    this.discovered = true;
  }
}

/** 垂直移动模式 */
export const VerticalMoveMode = {
  STAIRS: 'stairs',       // 楼梯：需物理行走，有冷却
  ELEVATOR: 'elevator',   // 电梯/升降机：瞬间但需激活
  PORTAL: 'portal',       // 传送门：瞬间但需钥匙/条件
};

/** 竖向调度器 */
export class VerticalScheduler {
  /**
   * @param {object} config
   * @param {FloorLevel[]} config.floors - 该区域的所有楼层（按 floor 排序）
   * @param {Function} config.hasRequirement - 检查解锁条件的回调 (reqId) => bool
   * @param {number} [config.stairsCooldown=1.5] - 楼梯移动冷却（秒）
   */
  constructor(config) {
    this.floors = [...config.floors].sort((a, b) => a.floor - b.floor);
    this.hasRequirement = config.hasRequirement;
    this.stairsCooldown = config.stairsCooldown ?? 1.5;
    this.currentFloor = 0;
    this.lastStairsMove = -Infinity;
    this.unlockedFloors = new Set([0]); // 默认解锁 0 层（地面）
    this.discoveredFloors = new Set([0]);
    this.moveHistory = []; // { from, to, mode, time }
  }

  /** 刷新所有楼层的解锁/发现状态 */
  refresh() {
    for (const floor of this.floors) {
      if (floor.checkUnlocked(this.hasRequirement)) {
        this.unlockedFloors.add(floor.floor);
      }
      if (floor.discovered) {
        this.discoveredFloors.add(floor.floor);
      }
    }
  }

  /** 获取楼层对象 */
  getFloor(floorNum) {
    return this.floors.find((f) => f.floor === floorNum) ?? null;
  }

  /** 获取当前楼层对象 */
  getCurrentFloorObj() {
    return this.getFloor(this.currentFloor);
  }

  /** 判断某楼层是否已解锁 */
  isUnlocked(floorNum) {
    return this.unlockedFloors.has(floorNum);
  }

  /** 判断某楼层是否已发现 */
  isDiscovered(floorNum) {
    return this.discoveredFloors.has(floorNum);
  }

  /** 尝试垂直移动 */
  /**
   * @param {number} targetFloor - 目标楼层
   * @param {VerticalMoveMode} mode - 移动模式
   * @param {number} now - 当前时间（秒）
   * @returns {{success: boolean, reason?: string, entrance?: {x:number,z:number}}}
   */
  tryMove(targetFloor, mode, now) {
    const target = this.getFloor(targetFloor);
    if (!target) return { success: false, reason: '目标楼层不存在' };
    if (!this.isUnlocked(targetFloor)) return { success: false, reason: '楼层未解锁' };

    switch (mode) {
      case VerticalMoveMode.STAIRS: {
        if (now - this.lastStairsMove < this.stairsCooldown) {
          return { success: false, reason: '楼梯冷却中' };
        }
        this.lastStairsMove = now;
        break;
      }
      case VerticalMoveMode.ELEVATOR: {
        // 电梯需检查是否有电梯入口
        if (target.entrances.length === 0) {
          return { success: false, reason: '无电梯入口' };
        }
        break;
      }
      case VerticalMoveMode.PORTAL: {
        // 传送门需检查条件（已在 isUnlocked 中检查）
        break;
      }
      default:
        return { success: false, reason: '未知移动模式' };
    }

    const from = this.currentFloor;
    this.currentFloor = targetFloor;
    this.unlockedFloors.add(targetFloor);
    this.discoveredFloors.add(targetFloor);
    target.markDiscovered();

    this.moveHistory.push({ from, to: targetFloor, mode, time: now });

    return {
      success: true,
      entrance: target.entrances[0] ?? null,
    };
  }

  /** 获取可到达的相邻楼层（楼梯模式） */
  getReachableFloors() {
    const current = this.getCurrentFloorObj();
    if (!current) return [];
    const idx = this.floors.indexOf(current);
    const result = [];
    if (idx > 0) result.push(this.floors[idx - 1].floor);
    if (idx < this.floors.length - 1) result.push(this.floors[idx + 1].floor);
    return result.filter((f) => this.isUnlocked(f));
  }

  /** 获取移动历史 */
  getHistory(limit = 20) {
    return this.moveHistory.slice(-limit);
  }

  /** 存档数据 */
  toJSON() {
    return {
      currentFloor: this.currentFloor,
      unlockedFloors: [...this.unlockedFloors],
      discoveredFloors: [...this.discoveredFloors],
      lastStairsMove: this.lastStairsMove,
      moveHistory: this.moveHistory.slice(-50),
    };
  }

  /** 读档恢复 */
  fromJSON(data) {
    if (!data) return;
    this.currentFloor = data.currentFloor ?? 0;
    this.unlockedFloors = new Set(data.unlockedFloors ?? [0]);
    this.discoveredFloors = new Set(data.discoveredFloors ?? [0]);
    this.lastStairsMove = data.lastStairsMove ?? -Infinity;
    this.moveHistory = data.moveHistory ?? [];
    this.refresh();
  }
}

/** 区域竖向配置预置 */
export const VerticalSchedulePresets = {
  /** 幽暗林地：树洞住所（地面 -1，树洞 1，古树顶 2） */
  gloom: [
    new FloorLevel({
      floor: -1,
      name: '地下根系洞窟',
      minHeight: -5,
      maxHeight: 0,
      unlockRequirements: [],
      entrances: [{ x: 160, z: 70 }],
      zoneId: ZONE_IDS.GLOOM,
      internalSpaceId: 'gloom-ancient-shrine',
    }),
    new FloorLevel({
      floor: 0,
      name: '林地地面',
      minHeight: 0,
      maxHeight: 8,
      unlockRequirements: [],
      entrances: [{ x: 180, z: 100 }],
      zoneId: ZONE_IDS.GLOOM,
    }),
    new FloorLevel({
      floor: 1,
      name: '树洞居所',
      minHeight: 8,
      maxHeight: 12,
      unlockRequirements: ['side-zone-gloom'], // 完成"雾林三歇"解锁
      entrances: [{ x: 140, z: 150 }],
      zoneId: ZONE_IDS.GLOOM,
      internalSpaceId: 'gloom-tree-hollow',
    }),
    new FloorLevel({
      floor: 2,
      name: '古树之巅',
      minHeight: 12,
      maxHeight: 20,
      unlockRequirements: ['side-zone-gloom-wisp'], // 完成"雾林双萤"解锁
      entrances: [{ x: 200, z: 180 }],
      zoneId: ZONE_IDS.GLOOM,
    }),
  ],

  /** 辉煌圣域：大殿（地面 0，二层观礼台 1，塔顶 2） */
  radiant: [
    new FloorLevel({
      floor: 0,
      name: '晨曦大厅',
      minHeight: 1,
      maxHeight: 9,
      unlockRequirements: [],
      entrances: [{ x: -180, z: -160 }],
      zoneId: ZONE_IDS.RADIANT,
      internalSpaceId: 'radiant-grand-hall',
    }),
    new FloorLevel({
      floor: 1,
      name: '观礼阳台',
      minHeight: 9,
      maxHeight: 17,
      unlockRequirements: ['side-zone-radiant'], // 完成"圣域三歇"解锁
      entrances: [{ x: -180, z: -140 }],
      zoneId: ZONE_IDS.RADIANT,
    }),
    new FloorLevel({
      floor: 2,
      name: '星港瞭望塔顶',
      minHeight: 18,
      maxHeight: 30,
      unlockRequirements: ['side-zone-radiant-wisp'], // 完成"圣域双萤"解锁
      entrances: [{ x: -240, z: -120 }],
      zoneId: ZONE_IDS.RADIANT,
      internalSpaceId: 'radiant-starwatch-tower',
    }),
  ],
};

/** 创建区域的垂直调度器 */
export function createVerticalScheduler(zoneId, hasRequirement) {
  const preset = VerticalSchedulePresets[zoneId];
  if (!preset) return null;
  return new VerticalScheduler({
    floors: preset,
    hasRequirement,
  });
}