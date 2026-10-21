/**
 * 世界地图的键盘落点（W-D6 切片13）。
 *
 * 这一片防的是"全屏地图只能鼠标点"复发：`worldMap` 层没有 `nav` 宿主，↑↓←→ 在它那儿
 * 改前是死键，于是"在地图上选一格放下自己的路点"这件事实在不做。切片13 给地图一枚光标，
 * 方向键推它、F4/F6 在光标处落点。四件事各有各的死法，各有各的打法：
 *
 * 1. **鼠标与键盘共用同一句判据**：`markAt` / `unmarkAt` 是唯一入口，`_onCanvasClick` 与
 *    `markAtCursor` / `unmarkAtCursor` 只负责把"屏幕上那一下"换算成世界坐标。判据写成两份的
 *    那天，"鼠标能点、键盘点了没反应"这类分裂就回来了 —— 所以两个方向都要走一遍。
 * 2. **光标出界夹住，且回报"这一下有没有真的走动"**：这个返回值同时喂连发与重绘，
 *    夹住还返回 true = 按住不放时每帧重画一张一模一样的地图。
 * 3. **未探索的格不放路点，但光标照走、框照画（虚线）**：玩家要看得见"我到边界了"，
 *    而不是莫名其妙按不动。
 * 4. **接线只有一处**：`worldMap` 层一长出 `nav`，↑↓ 就被面板移焦接走、光标再也推不动；
 *    所以层表里它必须继续没有 `nav`，而"没有宿主可去时推光标"那个分支只在 `Game.panelNav`
 *    里写一次。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WorldMapPanel } from '../src/ui/WorldMapPanel.js';
import { MapMarkerManager } from '../src/game/MapMarkerManager.js';
import { Game } from '../src/core/Game.js';
import {
  UI_HOTKEYS, MAP_PASSTHROUGH_ACTIONS, hotkeyCodeFor, setHotkeyTable,
} from '../src/content/hotkeys.js';
import { OVERLAY_LAYERS } from '../src/ui/OverlayStack.js';
import { fakeDoc, fakePanel } from './helpers/fakePanelDom.js';

/* ------------------------------------------------------------ 桩与常数 */

// 与 `game/ExplorationMap.js` 的常数一致：光标住在格子里，格子尺寸对不上就全跑偏
const CELL = 12;
const MIN = -320;
const GW = 54;
const GH = 54;

const cellOf = (x, z) => ({
  gx: Math.max(0, Math.min(GW - 1, Math.floor((x - MIN) / CELL))),
  gz: Math.max(0, Math.min(GH - 1, Math.floor((z - MIN) / CELL))),
});

const centerOf = (gx, gz) => ({ x: MIN + gx * CELL + CELL / 2, z: MIN + gz * CELL + CELL / 2 });

/** 只实现本片用到的三件事：格子尺寸、探没探索、探索度（后者给图例，本片用不到也得给） */
const fakeMap = (revealed = []) => {
  const seen = new Set(revealed.map(([gx, gz]) => `${gx},${gz}`));
  return {
    getGridSize: () => ({ gw: GW, gh: GH, cell: CELL, min: MIN, max: MIN + GW * CELL }),
    isRevealed: (x, z) => {
      const { gx, gz } = cellOf(x, z);
      return seen.has(`${gx},${gz}`);
    },
    getExploredPercent: () => 12,
  };
};

/** 画布桩：只要 `getBoundingClientRect`（`_screenToWorld` 用）与构造时挂上去的那条点击监听 */
const fakeCanvas = () => ({
  listeners: {},
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
  getBoundingClientRect: () => ({ left: 0, top: 0 }),
  clientWidth: 720,
  clientHeight: 520,
  width: 0,
  height: 0,
});

/**
 * 开着一张地图、光标在玩家脚下。`revealed` 传格号；缺省只亮玩家那一格。
 *
 * `panel.draw` 换成计数器：整张地图的绘制要世界数据（区域、路线、副本表……），本片只关心
 * 光标，而"走没走"要看的是返回值与 `cursor`，重绘次数是附带断言（夹住时不重画）。
 */
const openPanel = (revealed = [[26, 26]]) => {
  const toasts = [];
  const game = {
    dungeons: null,
    explorationMap: fakeMap(revealed),
    player: { position: { x: 0, z: 0 } },
    dialog: { toast: (m) => toasts.push(m) },
  };
  game.mapMarkers = new MapMarkerManager(game);
  const canvas = fakeCanvas();
  const shell = {
    listeners: {},
    classList: { add() {}, remove() {} },
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
  };
  globalThis.document = {
    getElementById: (id) => ({ 'world-map-panel': shell, 'world-map-canvas': canvas }[id] ?? null),
    exitPointerLock: () => {},
  };
  const panel = new WorldMapPanel(game);
  let draws = 0;
  panel.draw = () => { draws += 1; };
  panel.show();
  return { panel, game, toasts, canvas, draws: () => draws };
};

/** 记录调用的 2D 上下文：只实现 `_drawCursor` 用到的那几个（本片只测光标怎么画，不测整张地图） */
const recordingCtx = () => {
  const ops = [];
  const rec = (name) => (...args) => { ops.push([name, ...args]); };
  return {
    ops,
    save: rec('save'),
    restore: rec('restore'),
    beginPath: rec('beginPath'),
    moveTo: rec('moveTo'),
    lineTo: rec('lineTo'),
    stroke: rec('stroke'),
    fill: rec('fill'),
    strokeRect: rec('strokeRect'),
    fillRect: rec('fillRect'),
    arc: rec('arc'),
    setLineDash: rec('setLineDash'),
    fillText: rec('fillText'),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: '',
  };
};

/**
 * `panelNav` 的假 game：与 `focus-nav` 那片各写一份是故意的 —— 那边 `worldMapPanel` 是
 * `{ open: false }` 的光壳，这边要的是一枚**真面板**（光标得真的在格子里走动）。
 * 层表那半边不走私货：`overlayState` 调的是 `Game.prototype` 真身，两片问的是同一份现状。
 */
const navGame = (panel) => {
  const g = {
    worldMapPanel: panel,
    playerAutoPlay: { active: false },
    helpManual: { open: false },
    cinematicActive: false,
    settingsPanel: { open: false },
    fastTravelPanel: { open: false },
    pauseMenu: { open: false },
    dialog: { open: false },
    upgrade: { open: false },
  };
  g.overlayState = () => Game.prototype.overlayState.call(g);
  g.overlayStack = {
    toStateMap: () => ({
      worldMapOpen: !!(g.worldMapPanel?.open),
      autoPlayActive: !!(g.playerAutoPlay?.active),
      helpOpen: !!(g.helpManual?.open),
      cinematicActive: !!g.cinematicActive,
      settingsOpen: !!(g.settingsPanel?.open),
      fastTravelOpen: !!(g.fastTravelPanel?.open),
      pauseMenuOpen: !!(g.pauseMenu?.open),
      dialogOpen: !!(g.dialog?.open),
      upgradeOpen: !!(g.upgrade?.open),
      journalOpen: !!(g.hud?.journalOpen),
    }),
  };
  return g;
};

/* ------------------------------------------------------------------ 用例 */

describe('光标住在哪一格：打开地图时落在玩家脚下', () => {
  afterEach(() => {
    delete globalThis.document;
    setHotkeyTable(UI_HOTKEYS);
  });

  it('show() 把光标放到玩家那一格，不是 (0,0) 也不是上一回的位置', () => {
    const { panel, game } = openPanel();
    game.player.position = { x: 12, z: -6 };
    panel.hide();
    panel.show();
    expect(panel.cursor).toEqual(cellOf(12, -6));
  });

  it('hide() 把光标收回 null：地图没开时方向键不该还推得动它', () => {
    const { panel } = openPanel();
    expect(panel.cursor).not.toBe(null);
    panel.hide();
    expect(panel.cursor).toBe(null);
    expect(panel.moveCursor(1, 0)).toBe(false);
    expect(panel.markAtCursor()).toBe(false);
    expect(panel.unmarkAtCursor()).toBe(false);
  });

  it('格号与世界坐标互相换得回来，且落点是格心（贴边的坐标会漂到隔壁去）', () => {
    const { panel } = openPanel();
    const { x, z } = panel._cellToWorld(26, 26);
    expect({ x, z }).toEqual(centerOf(26, 26));
    expect(panel._worldToCell(x, z)).toEqual({ gx: 26, gz: 26 });
    expect(panel._worldToCell(-9999, 9999)).toEqual({ gx: 0, gz: GH - 1 });
  });
});

describe('moveCursor：走一格、出界夹住、回报有没有真走', () => {
  afterEach(() => {
    delete globalThis.document;
    setHotkeyTable(UI_HOTKEYS);
  });

  it('四向各走一格，cursor 跟着走', () => {
    const { panel } = openPanel();
    const start = { ...panel.cursor };
    expect(panel.moveCursor(1, 0)).toBe(true);
    expect(panel.cursor).toEqual({ gx: start.gx + 1, gz: start.gz });
    expect(panel.moveCursor(-1, 0)).toBe(true);
    expect(panel.cursor).toEqual(start);
    expect(panel.moveCursor(0, 1)).toBe(true);
    expect(panel.cursor).toEqual({ gx: start.gx, gz: start.gz + 1 });
    expect(panel.moveCursor(0, -1)).toBe(true);
    expect(panel.cursor).toEqual(start);
  });

  it('出界夹在边上，这一下回报 false 且不重画（不然按住不放会每帧重画一张一样的地图）', () => {
    const { panel, draws } = openPanel();
    panel.cursor = { gx: 0, gz: 0 };
    const before = draws();
    expect(panel.moveCursor(-1, 0)).toBe(false);
    expect(panel.moveCursor(0, -1)).toBe(false);
    expect(panel.cursor).toEqual({ gx: 0, gz: 0 });
    expect(draws()).toBe(before);
    expect(panel.moveCursor(1, 0)).toBe(true);
    expect(draws()).toBe(before + 1);
    panel.cursor = { gx: GW - 1, gz: GH - 1 };
    expect(panel.moveCursor(1, 0)).toBe(false);
    expect(panel.moveCursor(0, 1)).toBe(false);
    expect(panel.cursor).toEqual({ gx: GW - 1, gz: GH - 1 });
  });

  it('大步长也照夹：一次推一千格落在角上，不是飞出网格', () => {
    const { panel } = openPanel();
    expect(panel.moveCursor(1000, 0)).toBe(true);
    expect(panel.cursor).toEqual({ gx: GW - 1, gz: 26 });
    expect(panel.moveCursor(-1000, -1000)).toBe(true);
    expect(panel.cursor).toEqual({ gx: 0, gz: 0 });
  });
});

describe('落点：鼠标与键盘共用同一句判据', () => {
  afterEach(() => {
    delete globalThis.document;
    setHotkeyTable(UI_HOTKEYS);
  });

  it('键盘在光标那一格放点，鼠标 Shift+点同一格也收得掉', () => {
    const { panel, game, canvas, toasts } = openPanel();
    expect(panel.markAtCursor()).toBe(true);
    expect(game.mapMarkers.markers).toHaveLength(1);
    const { x, z } = centerOf(panel.cursor.gx, panel.cursor.gz);
    expect(game.mapMarkers.markers[0]).toMatchObject({ x: Math.round(x), z: Math.round(z) });
    canvas.listeners.click[0]({ clientX: x, clientY: z, shiftKey: true });
    expect(game.mapMarkers.markers).toHaveLength(0);
    expect(toasts.at(-1)).toContain('已移除');
  });

  it('鼠标放的点，键盘在光标处也收得掉（反方向再走一遍）', () => {
    const { panel, game, canvas } = openPanel();
    const { x, z } = centerOf(panel.cursor.gx, panel.cursor.gz);
    canvas.listeners.click[0]({ clientX: x, clientY: z, shiftKey: false });
    expect(game.mapMarkers.markers).toHaveLength(1);
    expect(panel.unmarkAtCursor()).toBe(true);
    expect(game.mapMarkers.markers).toHaveLength(0);
  });

  it('没探索过的格两条路都不放：同一句 toast、同一个 false', () => {
    const { panel, game, canvas, toasts } = openPanel();
    panel.cursor = { gx: 40, gz: 40 };
    expect(panel.markAtCursor()).toBe(false);
    const viaKeyboard = toasts.at(-1);
    expect(viaKeyboard).toContain('尚未探索');
    const far = centerOf(40, 40);
    canvas.listeners.click[0]({ clientX: far.x, clientY: far.z, shiftKey: false });
    expect(toasts.at(-1)).toBe(viaKeyboard);
    expect(game.mapMarkers.markers).toHaveLength(0);
  });

  it('附近没有路点时移除也说话：两条路都是"附近没有路点"', () => {
    const { panel, canvas, toasts } = openPanel();
    expect(panel.unmarkAtCursor()).toBe(false);
    expect(toasts.at(-1)).toBe('附近没有路点');
    const { x, z } = centerOf(panel.cursor.gx, panel.cursor.gz);
    canvas.listeners.click[0]({ clientX: x, clientY: z, shiftKey: true });
    expect(toasts.at(-1)).toBe('附近没有路点');
  });

  it('地图关着时两条落点路都不接：markAt / unmarkAt 直接 false', () => {
    const { panel } = openPanel();
    panel.hide();
    expect(panel.markAt(0, 0)).toBe(false);
    expect(panel.unmarkAt(0, 0)).toBe(false);
  });

  it('路点上限只有 MapMarkerManager 一个家：第九个把最旧的挪出去，落点这条路不报错', () => {
    const { panel, game } = openPanel();
    game.mapMarkers.add(0, 0, '老路点');
    for (let i = 0; i < 8; i++) expect(panel.markAtCursor()).toBe(true);
    expect(game.mapMarkers.markers).toHaveLength(8);
    expect(game.mapMarkers.markers.some((m) => m.label === '老路点')).toBe(false);
  });
});

describe('光标画出来是个方框：不靠颜色分辩', () => {
  afterEach(() => {
    delete globalThis.document;
    setHotkeyTable(UI_HOTKEYS);
  });

  it('已探索的格画实线方框 + 十字 + 坐标，一个圆都没有', () => {
    const { panel, game } = openPanel();
    panel.cursor = { gx: 26, gz: 26 };
    const ctx = recordingCtx();
    panel._drawCursor(ctx, 400, 300, 1, game.explorationMap.getGridSize());
    const rect = ctx.ops.find((o) => o[0] === 'strokeRect');
    // 方框：地图上圆是区域/Boss/副本、菱是自定义路点、三角是任务目标，光标与它们形状全异
    expect(rect, '光标得是个方框').toBeTruthy();
    expect(rect[3]).toBe(rect[4]);
    expect(ctx.ops.some((o) => o[0] === 'arc')).toBe(false);
    expect(ctx.ops.some((o) => o[0] === 'setLineDash' && o[1]?.length)).toBe(false);
    const { x, z } = centerOf(26, 26);
    expect(ctx.ops.some((o) => o[0] === 'fillText' && o[1] === `${Math.round(x)}, ${Math.round(z)}`)).toBe(true);
  });

  it('未探索的格改虚线，框照画：玩家得看得见"我走到边界了"', () => {
    const { panel, game } = openPanel();
    panel.cursor = { gx: 40, gz: 40 };
    const ctx = recordingCtx();
    panel._drawCursor(ctx, 400, 300, 1, game.explorationMap.getGridSize());
    expect(ctx.ops.some((o) => o[0] === 'setLineDash' && Array.isArray(o[1]) && o[1].length === 2)).toBe(true);
    expect(ctx.ops.some((o) => o[0] === 'strokeRect')).toBe(true);
  });

  it('十字画在框正中央：落点会落在格心，不是框角', () => {
    const { panel, game } = openPanel();
    panel.cursor = { gx: 10, gz: 10 };
    const ctx = recordingCtx();
    panel._drawCursor(ctx, 400, 300, 1, game.explorationMap.getGridSize());
    const { x, z } = centerOf(10, 10);
    const px = 400 + x;
    const pz = 300 + z;
    const rect = ctx.ops.find((o) => o[0] === 'strokeRect');
    expect(rect[1] + rect[3] / 2).toBe(px);
    expect(rect[2] + rect[4] / 2).toBe(pz);
    // 一横一竖两段线，各过一次中心：起点在对侧、终点在中心另一侧
    expect(ctx.ops.filter((o) => o[0] === 'moveTo')).toEqual([
      ['moveTo', px - 5, pz],
      ['moveTo', px, pz - 5],
    ]);
    expect(ctx.ops.filter((o) => o[0] === 'lineTo')).toEqual([
      ['lineTo', px + 5, pz],
      ['lineTo', px, pz + 5],
    ]);
  });
});

describe('panelNav：没有宿主可去时，四下推地图光标', () => {
  afterEach(() => {
    delete globalThis.document;
    setHotkeyTable(UI_HOTKEYS);
  });

  it('地图开着、上面没压别的面板：↑↓←→ 推光标，不再是死键', () => {
    const { panel } = openPanel();
    const g = navGame(panel);
    const start = { ...panel.cursor };
    expect(Game.prototype.panelNav.call(g, 'down')).toBe(true);
    expect(panel.cursor).toEqual({ gx: start.gx, gz: start.gz + 1 });
    expect(Game.prototype.panelNav.call(g, 'right')).toBe(true);
    expect(panel.cursor).toEqual({ gx: start.gx + 1, gz: start.gz + 1 });
    expect(Game.prototype.panelNav.call(g, 'up')).toBe(true);
    expect(Game.prototype.panelNav.call(g, 'left')).toBe(true);
    expect(panel.cursor).toEqual(start);
  });

  it('地图关着（野外）：照样是死键，返回 false', () => {
    const { panel } = openPanel();
    panel.hide();
    const g = navGame(panel);
    expect(Game.prototype.panelNav.call(g, 'down')).toBe(false);
    expect(Game.prototype.panelNav.call(g, 'right')).toBe(false);
  });

  it('地图上压着暂停菜单：箭头仍归菜单，光标不许动（层表说不清的事，panelNav 不替它做主）', () => {
    const { panel } = openPanel();
    const g = navGame(panel);
    g.pauseMenu.open = true;
    const doc = fakeDoc();
    const menu = fakePanel(['resume', 'save'], doc);
    doc.hosts['pause-menu'] = menu.host;
    globalThis.document = doc;
    const before = { ...panel.cursor };
    expect(Game.prototype.panelNav.call(g, 'down')).toBe(true);
    expect(menu.active()).toBe('resume');
    expect(panel.cursor).toEqual(before);
  });
});

describe('静态门禁：名单、层表与接线', () => {
  afterEach(() => {
    setHotkeyTable(UI_HOTKEYS);
  });

  it('地图例外名单里有落点那两格，且名单里每个名字都真的有一格生效键位', () => {
    for (const action of MAP_PASSTHROUGH_ACTIONS) {
      expect(hotkeyCodeFor(action), `${action} 在名单里却查不到键位（拼错了就是静默不放行）`).toBeTruthy();
    }
    expect(MAP_PASSTHROUGH_ACTIONS).toContain('mapMark');
    expect(MAP_PASSTHROUGH_ACTIONS).toContain('mapUnmark');
  });

  it('F4 / F6 出厂就带着这两格', () => {
    setHotkeyTable(UI_HOTKEYS);
    expect(hotkeyCodeFor('mapMark')).toBe('F4');
    expect(hotkeyCodeFor('mapUnmark')).toBe('F6');
  });

  it('`worldMap` 层仍然没有 `nav` 宿主：它一有 nav，↑↓ 就被面板移焦接走，光标再也推不动', () => {
    const layer = OVERLAY_LAYERS.find((l) => l.layer === 'worldMap');
    expect(layer, 'worldMap 层不在了').toBeTruthy();
    expect(layer.nav).toBeUndefined();
  });

  it('落点那两格接的是面板的共用入口，不是另写一套判据', () => {
    const game = readFileSync(join(process.cwd(), 'src/core/Game.js'), 'utf8');
    expect(game).toContain("case 'mapMark': return this.worldMapPanel?.markAtCursor();");
    expect(game).toContain("case 'mapUnmark': return this.worldMapPanel?.unmarkAtCursor();");
  });

  it('WorldMapPanel 不自己落焦：`focusFirstItem` 全仓只有一个家（`ui/FocusNav.js`）', () => {
    const src = readFileSync(join(process.cwd(), 'src/ui/WorldMapPanel.js'), 'utf8');
    expect(src).not.toContain('focusFirstItem');
  });
});