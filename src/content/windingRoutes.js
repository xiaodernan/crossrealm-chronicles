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
import { ZONE_CENTERS, ZONE_IDS, HUB_ZONE } from './ZoneIdentity.js';

/**
 * 一端在枢纽、一端在区心的辐条路。
 *
 * **id 与终点都不手抄**：`to-<zoneId>` 的末点逐字取 `ZONE_CENTERS[zoneId]`，起点取
 * `HUB_ZONE.center`。改前七座区只有五条射线 —— gloom 与 radiant 没有编排过的路
 * （B6 那笔账的另一半），且 `to-forest` 的 id 说的是"森林"、走到的却是 fantasy。
 * 现在七座区各一条，`tests/winding-routes.test.js` 逐座钉住"有路、终点对得上"。
 */
const 辐条 = (zoneId, color, 途经) => ({
  id: `to-${zoneId}`,
  zone: zoneId,
  color,
  points: [
    [HUB_ZONE.center.x, HUB_ZONE.center.z],
    ...途经,
    [ZONE_CENTERS[zoneId].x, ZONE_CENTERS[zoneId].z],
  ],
});

export const WINDING_ROUTES = [
  辐条(ZONE_IDS.FANTASY, 0x6a5840,
    [[-18, 52], [-42, 48], [-68, 38], [-95, 28], [-125, 18], [-155, 8], [-185, 2]]),
  辐条(ZONE_IDS.MAGIC, 0x5a4870,
    [[8, 35], [12, 10], [8, -25], [5, -60], [3, -95], [5, -130], [5, -155]]),
  辐条(ZONE_IDS.SPACE, 0x4a5878,
    [[22, 52], [48, 50], [75, 52], [105, 58], [135, 62], [165, 72], [190, 78]]),
  辐条(ZONE_IDS.VOID, 0x6a6040,
    [[-5, 75], [-2, 95], [5, 115], [8, 140], [6, 165], [4, 190], [2, 210]]),
  辐条(ZONE_IDS.ABYSS, 0x5a3048,
    [[-25, 70], [-55, 85], [-85, 100], [-110, 120], [-135, 145], [-165, 175], [-190, 200]]),
  // 幽暗林地：从枢纽向东南穿过去（旧版没有这条路，走进 gloom 的地形没有编排过）
  辐条(ZONE_IDS.GLOOM, 0x3f4a3a,
    [[20, 58], [42, 60], [64, 64], [88, 68], [110, 74], [132, 80], [156, 88]]),
  // 辉煌圣域：向西南斜穿（同上）
  辐条(ZONE_IDS.RADIANT, 0x7a6430,
    [[-16, 42], [-34, 22], [-54, 0], [-78, -26], [-104, -58], [-130, -92], [-154, -126]]),
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
