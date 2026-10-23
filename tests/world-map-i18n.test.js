/**
 * 世界地图面板双表化（W-D2 切片29）。
 *
 * ## 为什么要有这道门禁
 *
 * 切片28 收完 HUD 之后，`WorldMapPanel` 是全屏地图最后一片裸中文：两枚 toast
 * （未探索/移路点）、副本内提示、以及图例整块 innerHTML（探索度 + 六行图例 +
 * 两行快捷键提示）全是中文字面量 —— 英玩家的全图界面从第一秒起是中文的。
 * 其中两行快捷键提示走的是 `keyText('...中文模板...')`：`{worldMap}` 这类占位
 * 照常展开，但模板本身不过 `t()`，所以换个语言提示还是中文。
 *
 * 修法（承切片27/28 既定方向）：
 * - 四个图例词里的 枢纽/地下城/营火 **复用既有键**（双表原值逐字相同，且每个值
 *   都已占满「同文案最多两键」的上限，新开必红）；
 * - 其余 9 处开新键（`world_map_*`），探索度标签从 HTML 里拆出来（表格值不掺标签）；
 * - 两行快捷键提示改 `keyText(t(键))` —— 单花括号占位穿过 `t()` 交给 keyText。
 *
 * 腿：
 * 1. 钉文案腿：9 个新键 + 3 个复用键的中英原值逐字钉死。
 * 2. 静态腿：WorldMapPanel.js 去注释后引号内无裸中文。
 * 3. 行为腿·toast：未探索/无近点/已移除三句，中英两语逐字对。
 * 4. 行为腿·副本提示：副本内开图，提示展开占位、不留花括号。
 * 5. 行为腿·图例：中英两语九块内容齐全，英文下不夹中文。
 * 6. 键数腿：双表对齐且键数只增不减（2234 → 2243）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WorldMapPanel } from '../src/ui/WorldMapPanel.js';
import { MapMarkerManager } from '../src/game/MapMarkerManager.js';
import { setLanguage } from '../src/engine/i18n.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';

const 读 = (p) => readFileSync(join(process.cwd(), p), 'utf8');
const 面板源码 = 读('src/ui/WorldMapPanel.js');

const CELL = 12;
const MIN = -320;
const GW = 54;
const GH = 54;

/** 只实现本片用到的三件事：格子尺寸、探没探索、探索度（后者给图例） */
const fakeMap = (revealedAll = true) => ({
  getGridSize: () => ({ gw: GW, gh: GH, cell: CELL, min: MIN, max: MIN + GW * CELL }),
  isRevealed: () => revealedAll,
  getExploredPercent: () => 12,
});

/** 画布桩：只要 getBoundingClientRect（`_screenToWorld` 用）与点击监听挂点 */
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
 * 开着一张地图。`revealedAll=false` 时哪儿都没探索（喂未探索 toast 那条腿）；
 * `legend` 控制图例格子存不存在（`updateLegend` 开头就问它）。
 */
const openPanel = ({ revealedAll = true, legend = true } = {}) => {
  const toasts = [];
  const legendEl = legend ? { innerHTML: '' } : null;
  const game = {
    dungeons: null,
    explorationMap: fakeMap(revealedAll),
    player: { position: { x: 0, z: 0 } },
    quests: { chapter: 2 },
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
    getElementById: (id) => ({ 'world-map-panel': shell, 'world-map-canvas': canvas, 'world-map-legend': legendEl }[id] ?? null),
    exitPointerLock: () => {},
  };
  const panel = new WorldMapPanel(game);
  panel.draw = () => {};
  panel.show();
  return { panel, game, toasts, legendEl };
};

describe('世界地图面板双表化（W-D2 切片29）', () => {
  const 含汉 = /[\u4e00-\u9fff]/;

  /** 9 个新键 + 3 个复用键：键 → [中文原值, 英文原值] */
  const KEYS = {
    world_map_not_explored: ['该区域尚未探索 — 靠近揭开迷雾', 'Area not explored yet — approach to reveal the fog'],
    world_map_marker_removed_fmt: ['已移除：${label}', 'Removed: ${label}'],
    world_map_no_marker_nearby: ['附近没有路点', 'No waypoint nearby'],
    world_map_in_dungeon_hint: ['迷宫内请用小地图 ({minimap}) 查看房间', 'Use the minimap ({minimap}) to view rooms inside a dungeon'],
    world_map_explore_label: ['探索度', 'Explored'],
    world_map_legend_quest: ['任务目标 ▲', 'Quest Objective ▲'],
    world_map_legend_marker: ['自定义路点 ◆', 'Custom Waypoint ◆'],
    world_map_legend_hints: ['{worldMap} 关闭 · 方向键移动光标 · {mapMark} 放置路点 · {mapUnmark} 移除路点 · {zonePanel} 切换导航路点',
      '{worldMap} Close · Arrow keys move cursor · {mapMark} Place waypoint · {mapUnmark} Remove waypoint · {zonePanel} Cycle nav waypoint'],
    world_map_legend_mouse_hint: ['鼠标：点击放置路点 · Shift+点击移除', 'Mouse: click to place · Shift+click to remove'],
    hud_map_anchor_hub: ['枢纽', 'Hub'],
    journal_tab_dungeon: ['地下城', 'Dungeons'],
    upgrade_rest_default: ['营火', 'Campfire'],
  };

  beforeAll(() => { setLanguage('zh'); });
  afterAll(() => { setLanguage('zh'); delete globalThis.document; });

  it('钉文案腿：9 个新键 + 3 个复用键的中英原值逐字钉死', () => {
    expect(Object.keys(KEYS)).toHaveLength(12);
    for (const [key, [zh, en]] of Object.entries(KEYS)) {
      expect(STRINGS_ZH[key], `zh 表里 ${key} 的原值被改了`).toBe(zh);
      expect(STRINGS_EN[key], `en 表里 ${key} 的原值被改了`).toBe(en);
    }
    // 反向控制：过滤器必须能点名没登记的键
    expect(['world_map_not_explored', 'no_such_key_xyz'].filter((k) => !(k in STRINGS_ZH))).toEqual(['no_such_key_xyz']);
  });

  it('静态腿：WorldMapPanel.js 去注释后引号内无裸中文', () => {
    const noBlock = 面板源码.replace(/\/\*[\s\S]*?\*\//g, '');
    const noLine = noBlock.replace(/\/\/[^\n]*/g, '');
    expect(noLine, '面板里还有引号内裸中文').not.toMatch(/['"`][^'"`\n]*[\u4e00-\u9fff][^'"`\n]*['"`]/);
  });

  it('行为腿·toast：未探索 / 无近点 / 已移除三句，中英两语逐字对', () => {
    for (const [lang, [notExplored, noNearby, removedFmt]] of [
      ['zh', ['该区域尚未探索 — 靠近揭开迷雾', '附近没有路点', '已移除：路点 1']],
      ['en', ['Area not explored yet — approach to reveal the fog', 'No waypoint nearby', 'Removed: Waypoint 1']],
    ]) {
      setLanguage(lang);
      const { panel, game, toasts } = openPanel({ revealedAll: false });
      expect(panel.markAt(0, 0), `${lang}: 未探索的格竟然放成了`).toBe(false);
      expect(toasts.at(-1), `${lang}: 未探索 toast 不对`).toBe(notExplored);
      toasts.length = 0;
      expect(panel.unmarkAt(0, 0)).toBe(false);
      expect(toasts.at(-1), `${lang}: 无近点 toast 不对`).toBe(noNearby);
      toasts.length = 0;
      game.mapMarkers.add(0, 0);
      toasts.length = 0;
      expect(panel.unmarkAt(0, 0)).toBe(true);
      expect(toasts.at(-1), `${lang}: 已移除 toast 不对`).toBe(removedFmt);
    }
    setLanguage('zh');
  });

  it('行为腿·副本提示：副本内开图，占位展开、不留花括号', () => {
    for (const lang of ['zh', 'en']) {
      setLanguage(lang);
      const { panel, game, toasts } = openPanel();
      game.dungeons = { active: {} };
      panel.show();
      expect(toasts.at(-1), `${lang}: 副本内提示没出来`).toMatch(/查看房间|view rooms/);
      expect(toasts.at(-1), `${lang}: 占位没被展开`).not.toMatch(/\{/);
      expect(toasts.at(-1)).not.toContain('[MISSING:');
    }
    setLanguage('zh');
  });

  it('行为腿·图例：中英两语九块内容齐全，英文下不夹中文', () => {
    for (const lang of ['zh', 'en']) {
      setLanguage(lang);
      const { legendEl } = openPanel();
      const html = legendEl.innerHTML;
      expect(html, `${lang}: 图例没渲染`).toContain('12%');
      expect(html).toContain('Chapter 2');
      for (const piece of (lang === 'zh'
        ? ['探索度', '枢纽', 'Boss 💀', '地下城', '营火', '任务目标 ▲', '自定义路点 ◆']
        : ['Explored', 'Hub', 'Boss 💀', 'Dungeons', 'Campfire', 'Quest Objective ▲', 'Custom Waypoint ◆'])) {
        expect(html, `${lang}: 图例缺 ${piece}`).toContain(piece);
      }
      expect(html, `${lang}: 快捷键提示占位没展开`).not.toMatch(/\{/);
      expect(html).not.toContain('[MISSING:');
      if (lang === 'en') expect(html, '英文图例夹中文').not.toMatch(含汉);
    }
    setLanguage('zh');
  });

  it('键数腿：双表对齐且键数只增不减（2234 → 2243）', () => {
    const zhKeys = Object.keys(STRINGS_ZH);
    const enKeys = Object.keys(STRINGS_EN);
    expect(zhKeys.length).toBe(enKeys.length);
    expect(zhKeys.length).toBeGreaterThanOrEqual(2243);
  });
});
