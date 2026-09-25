/**
 * 区际蜿蜒道路 —— 纯数据表（W-B1 切片1）。
 *
 * 从 `world/TerrainHeight.js` 搬过来：它被**两个 UI 面板**（`ui/HUD.js` 的小地图、
 * `ui/WorldMapPanel.js` 的世界地图）和两个世界模块读，而 UI 与 world 是两个分块 ——
 * 它放在 `world/` 里就逼着 `chunk-ui → chunk-world`，是 B37 三条循环分块中的一条。
 *
 * 它本来就是数据（id / 颜色 / 折线点），住在 `content/` 才名实相符：
 * `content/` 这一层**不依赖任何其他层**（由 `tests/content-boundary.test.js` 钉住），
 * 所以任何块都可以读它而不会形成回边。
 *
 * 地图上画的是折线；`world/WorldTerrain.js` 用它把路面压平、`world/WorldDecorations.js`
 * 沿路撒装饰 —— 那两处是"怎么用"，与"有哪些路"分开。
 */
export const WINDING_ROUTES = [
  {
    id: 'to-forest',
    color: 0x6a5840,
    points: [[0, 55], [-18, 52], [-42, 48], [-68, 38], [-95, 28], [-125, 18], [-155, 8], [-185, 2], [-200, 0]],
  },
  {
    id: 'to-magic',
    color: 0x5a4870,
    points: [[0, 55], [8, 35], [12, 10], [8, -25], [5, -60], [3, -95], [5, -130], [5, -155], [0, -180]],
  },
  {
    id: 'to-space',
    color: 0x4a5878,
    points: [[0, 55], [22, 52], [48, 50], [75, 52], [105, 58], [135, 62], [165, 72], [190, 78], [200, 80]],
  },
  {
    id: 'to-void',
    color: 0x6a6040,
    points: [[0, 55], [-5, 75], [-2, 95], [5, 115], [8, 140], [6, 165], [4, 190], [2, 210], [0, 220]],
  },
  {
    id: 'to-abyss',
    color: 0x5a3048,
    points: [[0, 55], [-25, 70], [-55, 85], [-85, 100], [-110, 120], [-135, 145], [-165, 175], [-190, 200], [-200, 220]],
  },
  {
    id: 'hub-ring',
    color: 0x7a6848,
    points: (() => {
      const pts = [];
      for (let i = 0; i <= 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        pts.push([Math.cos(a) * 22, 55 + Math.sin(a) * 22]);
      }
      return pts;
    })(),
  },
];
