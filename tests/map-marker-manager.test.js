/**
 * 全屏地图路点门禁 —— 钉 `game/MapMarkerManager.js`。
 *
 * 纯数据管理（路点列表 + 活动路点）。几条"写错不抛、只静默丢路点/选错"的不变量：
 * - **上限 8 个**：满了再 add 丢掉最旧的（不是拒收、也不是无限长）。
 * - add：坐标四舍五入、默认名走文案键、新加即设为活动。
 * - **removeNearest**：范围内最近的那个（严格 `< range`）；范围外不动、返回 null。
 * - remove 掉活动点 → 活动落到剩下的第一个；cycleActive 环绕、空表返回 null。
 * - toJSON/fromJSON：活动点缺失时兜底到第一个。
 *
 * `map-marker-changed` 由真 window 派发（on→addEventListener、emit→dispatchEvent），
 * 用真 window + 采集监听。两枚变异探针走真代码路径（grep 确认落盘、原字节还原）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { t } from '../src/engine/i18n.js';
import { MapMarkerManager } from '../src/game/MapMarkerManager.js';

let game, manager, changed, capture;

beforeEach(() => {
  changed = 0;
  capture = () => { changed += 1; };
  globalThis.window.addEventListener('map-marker-changed', capture);
  game = { dialog: { toast: () => {} } };
  manager = new MapMarkerManager(game);
});
afterEach(() => {
  globalThis.window.removeEventListener('map-marker-changed', capture);
  manager = null;
});

describe('MapMarkerManager.add', () => {
  it('坐标四舍五入、默认名走文案键、新加即活动、广播变更', () => {
    const mk = manager.add(10.6, 20.4);
    expect(mk.x).toBe(11);
    expect(mk.z).toBe(20);
    expect(mk.label).toBe(t('map_marker_default_name', { n: 1 }));
    expect(manager.getActive()).toBe(mk);
    expect(changed).toBe(1);
  });

  it('上限 8 个：满后再 add 丢掉最旧的', () => {
    for (let i = 0; i < 9; i += 1) manager.add(i, i);
    expect(manager.markers).toHaveLength(8);
  });
});

describe('MapMarkerManager.removeNearest', () => {
  it('范围内最近的那个被移除并返回；范围外不动', () => {
    manager.markers = [
      { id: 'a', x: 0, z: 0, label: 'A' },
      { id: 'b', x: 100, z: 100, label: 'B' },
    ];
    const removed = manager.removeNearest(5, 5, 25); // 到 a ≈ 7 < 25
    expect(removed.id).toBe('a');
    expect(manager.markers.map((m) => m.id)).toEqual(['b']);

    expect(manager.removeNearest(500, 500, 25)).toBeNull(); // 都太远
    expect(manager.markers).toHaveLength(1);
  });
});

describe('MapMarkerManager.remove / cycle / 存档', () => {
  it('移除活动点 → 活动落到剩下的第一个', () => {
    manager.markers = [
      { id: 'a', x: 0, z: 0, label: 'A' },
      { id: 'b', x: 1, z: 1, label: 'B' },
    ];
    manager.activeId = 'a';
    manager.remove('a');
    expect(manager.activeId).toBe('b');
    expect(manager.getActive().id).toBe('b');
  });

  it('cycleActive 环绕；空表返回 null', () => {
    manager.markers = [
      { id: 'a', x: 0, z: 0, label: 'A' },
      { id: 'b', x: 1, z: 1, label: 'B' },
      { id: 'c', x: 2, z: 2, label: 'C' },
    ];
    manager.activeId = 'a';
    expect(manager.cycleActive().id).toBe('b');
    expect(manager.cycleActive().id).toBe('c');
    expect(manager.cycleActive().id).toBe('a'); // 环绕
    manager.markers = [];
    expect(manager.cycleActive()).toBeNull();
  });

  it('fromJSON 活动点缺失时兜底到第一个；null 安全 no-op', () => {
    manager.fromJSON({ markers: [{ id: 'x', x: 0, z: 0, label: 'X' }] });
    expect(manager.activeId).toBe('x');
    manager.fromJSON(null);
    expect(manager.activeId).toBe('x');
  });
});
