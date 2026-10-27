/**
 * 世界迷雾探索门禁 —— 钉 `game/ExplorationMap.js` 的**网格纯逻辑**。
 *
 * 无专门测试（只有 7 处间接引用）。这层是"写错不抛、只静默算错迷雾/探索度"的一族：
 * - **世界→格 clamp**：越界坐标夹进 [0, GW-1]（不然越界 reveal 会落到负下标 / 被丢弃）。
 * - **revealAt 圆形**：半径内点亮，半径外不动；`isRevealed` 如实反映。
 * - **getExploredPercent**：全未点亮 0%、点亮一片 >0%。
 * - **update 在副本里不点雾**（`dungeons.active` 时直接返回）。
 * - **revealZone 去重**；**fromJSON 的格数守卫**（旧/坏档长度不符时不套用）+ 缺格兜底
 *   `dungeonRevealed = TRIAL_DUNGEON_IDS`。
 *
 * 两枚变异探针走真代码路径（grep 确认落盘、预言命中、原字节还原）。
 */
import { describe, it, expect } from 'vitest';
import { TRIAL_DUNGEON_IDS } from '../src/content/dungeons.js';
import { ExplorationMap, MAP_SPAN_M } from '../src/game/ExplorationMap.js';

const makeGame = (over = {}) => ({
  world: { zoneId: 'hub' },
  dungeons: { active: false },
  restPoints: { points: [] },
  ...over,
});

describe('ExplorationMap 网格与世界→格 clamp', () => {
  it('地图跨度 640 米（MAX-MIN）', () => {
    expect(MAP_SPAN_M).toBe(640);
  });

  it('越界坐标 revealAt 夹进格内：极远负坐标点亮 (0,0)', () => {
    const m = new ExplorationMap(makeGame());
    m.revealAt(-9999, -9999, 0);
    expect(m.isRevealed(-320, -320)).toBe(true); // 夹到 (0,0) 这一格
  });
});

describe('ExplorationMap revealAt 圆形与探索度', () => {
  it('半径内点亮、半径外不动', () => {
    const m = new ExplorationMap(makeGame());
    m.revealAt(0, 0, 22);
    expect(m.isRevealed(0, 0)).toBe(true);
    expect(m.isRevealed(300, 300)).toBe(false); // 远在半径外
  });

  it('全未点亮 0%；点亮一片后 >0%', () => {
    const m = new ExplorationMap(makeGame());
    expect(m.getExploredPercent()).toBe(0);
    m.revealAt(0, 0, 50);
    const pct = m.getExploredPercent();
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThan(100);
  });
});

describe('ExplorationMap update 与区域去重', () => {
  it('副本进行中不点雾；非副本才按玩家位置点', () => {
    const m = new ExplorationMap(makeGame({ dungeons: { active: true } }));
    m.update({ x: 0, z: 0 });
    expect(m.isRevealed(0, 0)).toBe(false); // 副本里跳过

    const m2 = new ExplorationMap(makeGame({ dungeons: { active: false } }));
    m2.update({ x: 0, z: 0 });
    expect(m2.isRevealed(0, 0)).toBe(true);
  });

  it('revealZone 去重：同区只记一次', () => {
    const m = new ExplorationMap(makeGame());
    m.revealZone('hub');
    m.revealZone('hub');
    expect(m.zoneRevealed.size).toBe(1);
  });
});

describe('ExplorationMap 存档守卫与兜底', () => {
  it('fromJSON 格数不符时不套用（坏档不污染迷雾）', () => {
    const m = new ExplorationMap(makeGame());
    m.fromJSON({ revealed: [1, 1, 1] }); // 长度不符
    expect(m.getExploredPercent()).toBe(0);
  });

  it('fromJSON 格数相符时套用（全 1 → 100%）', () => {
    const m = new ExplorationMap(makeGame());
    m.fromJSON({ revealed: new Array(m.revealed.length).fill(1) });
    expect(m.getExploredPercent()).toBe(100);
  });

  it('缺 dungeonRevealed 的旧档兜底到 TRIAL_DUNGEON_IDS（不手抄 id 串）', () => {
    const m = new ExplorationMap(makeGame());
    m.fromJSON({});
    expect(m.dungeonRevealed.size).toBe(TRIAL_DUNGEON_IDS.length);
  });

  it('toJSON/fromJSON 往返保留已点亮格', () => {
    const m = new ExplorationMap(makeGame());
    m.revealAt(0, 0, 30);
    const json = m.toJSON();
    const m2 = new ExplorationMap(makeGame());
    m2.fromJSON(json);
    expect(m2.isRevealed(0, 0)).toBe(true);
    expect(m2.getExploredPercent()).toBe(m.getExploredPercent());
  });
});
