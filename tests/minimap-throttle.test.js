/**
 * 小地图重绘节流（W-E3 切片64）
 *
 * 改前 `HUD.update()` 每帧末尾无条件 `drawMinimap()`；分系统真机计时读到它约 1.15ms/帧
 * （HUD 整格 1.30ms 的 88%），而站着不动时地图内容一帧都没变。这一片加三道闸：
 * 最短间隔 66ms（15Hz）、内容签名（位置 0.25m / 朝向 11.25° 量化）、1 秒保活。
 *
 * 用例分四层：
 * ① 量化：0.25 米内的抖动不换签名，跨过一格才换；朝向按 11.25° 分桶；
 * ② 字段集：副本房间 / 任务路点 / 当前标记 / 自动演示都进签名（漏一个就是"该画不画"）；
 * ③ 判据：签名没变 + 未到最短间隔 ⇒ 不画；变了 + 过间隔 ⇒ 画；静止到 1 秒 ⇒ 保活重画；
 * ④ 接线：`update()` 只调 `maybeDrawMinimap()`，`this.drawMinimap()` 在 HUD 里只有一处
 *    （强制刷新仍可直接调它）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  HUD, minimapSignature, minimapRedrawDecision,
  MINIMAP_MIN_INTERVAL_MS, MINIMAP_KEEPALIVE_MS,
} from '../src/ui/HUD.js';

function fakeGame(over = {}) {
  return {
    player: { position: { x: 0, z: 0 }, yaw: 0 },
    quests: { getQuestWaypoint: () => null },
    dungeons: { active: null, currentRoomId: null },
    mapMarkers: { activeId: null },
    autoPlayMode: false,
    world: { zoneId: 'hub' },
    ...over,
  };
}

describe('小地图重绘节流（W-E3 切片64）', () => {
  it('位置量化 0.25 米：脚下微抖不换签名，跨过一格才换', () => {
    const g = fakeGame();
    const 原 = minimapSignature(g);
    g.player.position.x = 0.1;
    g.player.position.z = -0.05;
    expect(minimapSignature(g)).toBe(原);
    g.player.position.x = 0.2;
    expect(minimapSignature(g)).not.toBe(原);
  });

  it('朝向按 11.25° 分桶：站桩转身 22.5° 必须重画（那根针在动）', () => {
    const g = fakeGame();
    const 原 = minimapSignature(g);
    g.player.yaw = 0.05;
    expect(minimapSignature(g)).toBe(原);
    g.player.yaw = Math.PI / 4;
    expect(minimapSignature(g)).not.toBe(原);
  });

  it('动态字段全在签名里：副本房间 / 任务路点 / 当前标记 / 自动演示', () => {
    const g = fakeGame();
    const 原 = minimapSignature(g);
    g.dungeons = { active: { layout: {} }, currentRoomId: 'r_1_1' };
    const 副本 = minimapSignature(g);
    expect(副本).not.toBe(原);
    g.quests = { getQuestWaypoint: () => ({ x: 30, z: -40 }) };
    const 路点 = minimapSignature(g);
    expect(路点).not.toBe(副本);
    g.mapMarkers = { activeId: 'mk-2' };
    const 标记 = minimapSignature(g);
    expect(标记).not.toBe(路点);
    g.autoPlayMode = true;
    expect(minimapSignature(g)).not.toBe(标记);
  });

  it('判据：内容没变就等，内容变了且过最短间隔才画，静止满 1 秒保活', () => {
    const 底 = { 上次: 1000, 上次签名: 'a', 签名: 'a' };
    expect(minimapRedrawDecision({ ...底, 现在: 1000 + MINIMAP_MIN_INTERVAL_MS - 1 })).toBe(false);
    expect(minimapRedrawDecision({ ...底, 现在: 1000 + MINIMAP_MIN_INTERVAL_MS })).toBe(false);
    expect(minimapRedrawDecision({ ...底, 签名: 'b', 现在: 1000 + MINIMAP_MIN_INTERVAL_MS - 1 })).toBe(false);
    expect(minimapRedrawDecision({ ...底, 签名: 'b', 现在: 1000 + MINIMAP_MIN_INTERVAL_MS })).toBe(true);
    expect(minimapRedrawDecision({ ...底, 现在: 1000 + MINIMAP_KEEPALIVE_MS - 1 })).toBe(false);
    expect(minimapRedrawDecision({ ...底, 现在: 1000 + MINIMAP_KEEPALIVE_MS })).toBe(true);
  });

  it('HUD 行为：连推 3 帧静置只画 1 次，移动后按间隔补画，静止 1 秒保活', () => {
    const g = fakeGame();
    const hud = Object.create(HUD.prototype);
    hud.game = g;
    hud.minimapVisible = true;
    hud.minimapCanvas = {};
    hud._minimapAt = -Infinity;
    hud._minimapSig = null;
    let 画 = 0;
    hud.drawMinimap = () => { 画++; };
    const t0 = 5000;
    expect(hud.maybeDrawMinimap(t0)).toBe(true);
    expect(hud.maybeDrawMinimap(t0 + 10)).toBe(false);
    expect(hud.maybeDrawMinimap(t0 + 20)).toBe(false);
    expect(画).toBe(1);
    g.player.position.x = 2;
    expect(hud.maybeDrawMinimap(t0 + 30)).toBe(false); // 间隔未到
    expect(hud.maybeDrawMinimap(t0 + MINIMAP_MIN_INTERVAL_MS + 1)).toBe(true);
    expect(画).toBe(2);
    expect(hud.maybeDrawMinimap(t0 + 500)).toBe(false);
    expect(hud.maybeDrawMinimap(t0 + MINIMAP_MIN_INTERVAL_MS + 1 + MINIMAP_KEEPALIVE_MS)).toBe(true);
    expect(画).toBe(3);
  });

  it('关掉小地图时一次都不画（可见性是第一道闸）', () => {
    const hud = Object.create(HUD.prototype);
    hud.game = fakeGame();
    hud.minimapVisible = false;
    hud.minimapCanvas = {};
    hud._minimapAt = -Infinity;
    hud._minimapSig = null;
    let 画 = 0;
    hud.drawMinimap = () => { 画++; };
    expect(hud.maybeDrawMinimap(9000)).toBe(false);
    expect(画).toBe(0);
  });

  it('接线：update() 调的是节流入口，HUD 里 `this.drawMinimap()` 只有一处', () => {
    const 源 = readFileSync('src/ui/HUD.js', 'utf8');
    const 更新 = 源.indexOf('  update(_dt) {');
    const 结尾 = 源.indexOf('  maybeDrawMinimap(', 更新);
    expect(更新).toBeGreaterThan(-1);
    expect(结尾).toBeGreaterThan(更新);
    const 更新体 = 源.slice(更新, 结尾);
    expect(更新体).toContain('this.maybeDrawMinimap()');
    expect(更新体).not.toContain('this.drawMinimap()');
    expect(源.split('this.drawMinimap()').length - 1).toBe(1);
  });
});
