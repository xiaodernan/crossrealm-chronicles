/**
 * 快速旅行与营火身份 —— B36 的最后一处「两份真源」。
 *
 * 修之前：`travel(name)` 按中文显示名查目的地，面板的"在此"标记也是 `d.name === fromName`。
 * 后果不是报错，而是三种静默错乱：
 * - 两座营火同名 → 一起变灰，点哪座都跳去第一座；
 * - 改一行文案 → 目的地查不到，按 T 没反应；
 * - `addRestPoint` 的 id 悄悄回落成显示名，等于把 id 契约又交回文案手上。
 *
 * 这些用例刻意**不**依赖任何中文名字做正向匹配：凡按名字能通过的用例都不算证据。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { RestPointManager } from '../src/world/RestPointManager.js';
import { FastTravelSystem } from '../src/game/FastTravelSystem.js';
import { FastTravelPanel } from '../src/ui/FastTravelPanel.js';
import { ZONE_IDS, ZONE_NAMES } from '../src/world/ZoneIdentity.js';

const makeWorld = (height = 0) => ({ getGroundHeight: () => height });

const makeGame = (height = 3) => {
  const world = makeWorld(height);
  const restPoints = new RestPointManager({ add() {}, remove() {} }, world);
  const player = {
    position: new THREE.Vector3(999, 0, 999),
    teleported: [],
    teleport(x, y, z) { this.teleported.push({ x, y, z }); this.position.set(x, y, z); },
    combat: {
      healed: 0,
      restHeal() { this.healed++; },
    },
  };
  const toasts = [];
  return {
    world,
    restPoints,
    player,
    toasts,
    dialog: { toast: (s) => toasts.push(s) },
    fastTravelPanel: null,
  };
};

describe('营火 id 契约', () => {
  it('缺少 id 直接在构建期抛错，不再悄悄拿显示名当 id', () => {
    const game = makeGame();
    expect(() => game.restPoints.addRestPoint(0, 0, '无名营火')).toThrow(/缺少 id/);
    expect(game.restPoints.points).toHaveLength(0);
  });

  it('id 重复抛错（同 id 会让旅行跳错地方）', () => {
    const game = makeGame();
    game.restPoints.addRestPoint(0, 0, '一号', 'a');
    expect(() => game.restPoints.addRestPoint(10, 0, '二号', 'a')).toThrow(/重复/);
    expect(game.restPoints.points).toHaveLength(1);
  });

  it('同名不同 id 的两座营火各自独立', () => {
    const game = makeGame();
    game.restPoints.addRestPoint(0, 0, '同名营火', 'first');
    expect(() => game.restPoints.addRestPoint(50, 0, '同名营火', 'second')).not.toThrow();
    expect(game.restPoints.ids()).toEqual(['first', 'second']);
  });

  it('默认营火与所在位面共用 id，名字取 ZONE_NAMES', () => {
    const game = makeGame();
    game.restPoints.buildDefaults();
    const ids = game.restPoints.ids();
    for (const z of [ZONE_IDS.HUB, ...Object.values(ZONE_IDS).filter((i) => i !== ZONE_IDS.HUB && i !== ZONE_IDS.CORRIDOR && i !== ZONE_IDS.UNKNOWN)]) {
      expect(ids).toContain(z);
    }
    expect(game.restPoints.nameOf(ZONE_IDS.MAGIC)).toBe(`${ZONE_NAMES[ZONE_IDS.MAGIC]}营火`);
  });

  it('nameOf 查不到返回 null，不用 id 冒充名字', () => {
    const game = makeGame();
    game.restPoints.buildDefaults();
    expect(game.restPoints.nameOf('no-such-fire')).toBeNull();
  });
});

describe('快速旅行按 id 认领目的地', () => {
  let game, ft;
  beforeEach(() => {
    game = makeGame(3);
    game.restPoints.addRestPoint(0, 55, '世界之锚休息点', ZONE_IDS.HUB);
    game.restPoints.addRestPoint(-200, 0, '第一座同名营火', ZONE_IDS.FANTASY);
    game.restPoints.addRestPoint(200, 80, '第一座同名营火', ZONE_IDS.SPACE);
    ft = new FastTravelSystem(game);
  });

  it('目的地各带唯一 id', () => {
    const dests = ft.getDestinations();
    expect(dests.map((d) => d.id)).toEqual([ZONE_IDS.HUB, ZONE_IDS.FANTASY, ZONE_IDS.SPACE]);
    expect(new Set(dests.map((d) => d.id)).size).toBe(dests.length);
  });

  it('travel(id) 落到该营火坐标、贴地并回满血', () => {
    expect(ft.travel(ZONE_IDS.SPACE)).toBe(true);
    expect(game.player.teleported).toHaveLength(1);
    const t = game.player.teleported[0];
    expect([t.x, t.z]).toEqual([200, 80]);
    expect(t.y).toBeCloseTo(3.1);
    expect(game.player.combat.healed).toBe(1);
  });

  it('两座同名营火：travel 精确跳到 id 指的那座', () => {
    ft.travel(ZONE_IDS.FANTASY);
    expect([game.player.position.x, game.player.position.z]).toEqual([-200, 0]);
    ft.travel(ZONE_IDS.SPACE);
    expect([game.player.position.x, game.player.position.z]).toEqual([200, 80]);
  });

  it('显示名全换成乱码不影响旅行结果（逻辑只认 id）', () => {
    for (const p of game.restPoints.points) p.name = '〓▓▒';
    const before = ft.travel(ZONE_IDS.FANTASY);
    expect(before).toBe(true);
    expect([game.player.position.x, game.player.position.z]).toEqual([-200, 0]);
    expect(game.toasts.at(-1)).toBe('快速旅行：〓▓▒');
  });

  it('未知 id 返回 false，不挪动玩家', () => {
    expect(ft.travel('nowhere')).toBe(false);
    expect(game.player.teleported).toHaveLength(0);
    expect(game.player.combat.healed).toBe(0);
  });

  it('destinationsForPanel 用 id 标"在此"，同名另一座不被误标', () => {
    const list = ft.destinationsForPanel(ZONE_IDS.FANTASY);
    expect(list.filter((d) => d.here).map((d) => d.id)).toEqual([ZONE_IDS.FANTASY]);
    const twin = list.find((d) => d.name === '第一座同名营火' && d.id === ZONE_IDS.SPACE);
    expect(twin.here).toBe(false);
  });

  it('未指定所在营火时没有任何"在此"', () => {
    expect(ft.destinationsForPanel().some((d) => d.here)).toBe(false);
  });

  it('未解锁时按 T 不开面板', () => {
    game.player.position.set(-200, 0, 0);
    let shown = null;
    game.fastTravelPanel = { show: (id) => { shown = id; } };
    expect(ft.tryOpen({ KeyT: true })).toBe(false);
    expect(shown).toBeNull();
  });

  it('tryOpen 把脚下的营火 id 交给面板', () => {
    game.player.position.set(-200, 0, 0);
    let shown = null;
    game.fastTravelPanel = { show: (id) => { shown = id; } };
    ft.unlock();
    expect(ft.tryOpen({ KeyT: true })).toBe(true);
    expect(shown).toBe(ZONE_IDS.FANTASY);
  });

  it('不在营火旁按 T：提示且不开面板', () => {
    let shown = null;
    game.fastTravelPanel = { show: (id) => { shown = id; } };
    ft.unlock();
    expect(ft.tryOpen({ KeyT: true })).toBe(false);
    expect(shown).toBeNull();
    expect(game.toasts.at(-1)).toBe('靠近营火才能快速旅行');
  });
});

describe('快速旅行面板只用数据行里的 id', () => {
  const mkDom = (list) => {
    const panelEl = { classList: { add() {}, remove() {} } };
    globalThis.document = {
      getElementById: (id) => (id === 'fast-travel-panel' ? panelEl : id === 'fast-travel-list' ? list : null),
      exitPointerLock: () => {},
    };
    return panelEl;
  };

  const mkBtn = (id) => {
    const handlers = [];
    return {
      dataset: { id },
      addEventListener: (_type, fn) => handlers.push(fn),
      click: () => handlers.at(-1)(),
    };
  };

  /** 从渲染出的 HTML 取回每一行：`[data-id, 是否 disabled]` */
  const rows = (html) => [...html.matchAll(/data-id="([^"]+)"([^>]*)>/g)].map((m) => ({ id: m[1], disabled: /disabled/.test(m[2]) }));

  afterEach(() => { delete globalThis.document; });

  it('渲染带 data-id，"在此"由 id 判定；点击同名另一座仍按 id 跳', () => {
    const game = makeGame(0);
    game.restPoints.addRestPoint(0, 55, '世界之锚休息点', ZONE_IDS.HUB);
    game.restPoints.addRestPoint(1000, 1000, '世界之锚休息点', ZONE_IDS.ABYSS);
    game.fastTravel = new FastTravelSystem(game);

    const list = { innerHTML: '', querySelectorAll: (sel) => (sel === '.ft-btn' ? list.btns : []) , btns: [] };
    mkDom(list);
    const panel = new FastTravelPanel(game);

    panel.show(ZONE_IDS.HUB);
    expect(rows(list.innerHTML)).toEqual([
      { id: ZONE_IDS.HUB, disabled: true },
      { id: ZONE_IDS.ABYSS, disabled: false },
    ]);

    // 第二座脚下打开面板：禁用的是 Abyss，而不是那座同名同位置的 Hub
    list.btns = [mkBtn(ZONE_IDS.HUB), mkBtn(ZONE_IDS.ABYSS)];
    panel.show(ZONE_IDS.ABYSS);
    expect(rows(list.innerHTML)).toEqual([
      { id: ZONE_IDS.HUB, disabled: false },
      { id: ZONE_IDS.ABYSS, disabled: true },
    ]);

    list.btns[0].click();
    expect([game.player.position.x, game.player.position.z]).toEqual([0, 55]);
    expect(game.player.combat.healed).toBe(1);
  });

  it('面板结构不要求 game.quests —— 目的地清单只来自 restPoints', () => {
    const game = makeGame(0);
    game.restPoints.buildDefaults();
    game.fastTravel = new FastTravelSystem(game);
    const list = { innerHTML: '', btns: [], querySelectorAll: () => list.btns };
    mkDom(list);
    new FastTravelPanel(game).show(null);
    expect(rows(list.innerHTML).map((r) => r.id)).toEqual(game.restPoints.ids());
    expect(rows(list.innerHTML).every((r) => !r.disabled)).toBe(true);
  });
});
