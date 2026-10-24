/** 全局地形高度 — 枢纽台地、山谷、区际丘陵（非大平地）
 *
 *  `WINDING_ROUTES` 已搬到 `content/windingRoutes.js`（W-B1 切片1）：
 *  它被两个 UI 面板读，留在这里会让 `chunk-ui → chunk-world` 多一条回边（B37）。
 *  刻意**不做 re-export** —— 那等于把边原样接回来。
 *
 *  枢纽那一圈另有一条**广场**项（`HUB_PLAZA`）。台地不是广场：它只把整片丘陵往上抬几米，
 *  盘内该起伏还是起伏 —— 于是泉池埋进地里、招牌柱与幡圈各站各的高度。"抹平"是
 *  另一种合成，只能落在 `sampleGlobalHeight` 取完最大值**之后**：`max` 只会往上抬，
 *  抬不平已经压在头顶的那座 hill。
 */
import { HUB_ZONE } from '../content/ZoneIdentity.js';

export function hubPlateau(x, z) {
  const dx = x - HUB_ZONE.center.x;
  const dz = z - HUB_ZONE.center.z;
  const hubDist = Math.sqrt(dx * dx + dz * dz);
  if (hubDist > 55) return 0;
  return (1 - hubDist / 55) ** 1.5 * 3.2;
}

export function continentalNoise(x, z) {
  let h = 0;
  h += Math.sin(x * 0.012) * Math.cos(z * 0.01) * 7.5;
  h += Math.sin(x * 0.028 + 0.7) * Math.cos(z * 0.024 + 1.1) * 3.8;
  h += Math.sin(x * 0.055 + z * 0.04) * 2.2;
  h += Math.cos(x * 0.008 - z * 0.006) * 4.5;
  h += Math.sin(x * 0.18 + z * 0.15) * 1.5;
  return h;
}

/** 区际走廊：路径附近略低，两侧隆起 */
export function corridorRidge(x, z, x1, z1, x2, z2, halfWidth = 14) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1) return 0;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / len2));
  const px = x1 + dx * t;
  const pz = z1 + dz * t;
  const dist = Math.sqrt((x - px) ** 2 + (z - pz) ** 2);
  if (dist > halfWidth * 2.2) return 0;
  const edge = Math.abs(dist - halfWidth) / halfWidth;
  if (dist < halfWidth * 0.55) return -0.8;
  return Math.max(0, 1 - edge) * 2.8;
}

const CORRIDORS = [
  [0, 55, -200, 0],
  [0, 55, 0, -180],
  [0, 55, 200, 80],
  [0, 55, 0, 220],
  [0, 55, -200, 220],
];

export function connectionTerrain(x, z) {
  let h = 0;
  for (const [x1, z1, x2, z2] of CORRIDORS) {
    h += corridorRidge(x, z, x1, z1, x2, z2, 12);
  }
  return h;
}

/** 广场还没介入时的那块地 —— 三项之和只有一处写法（`sampleGlobalHeight` 与水位都读它） */
function naturalTerrain(x, z) {
  return continentalNoise(x, z) + connectionTerrain(x, z) + hubPlateau(x, z);
}

/**
 * 广场盘半径：盖住枢纽家具最远的那一圈再留一步 —— 招牌柱 r=8、集市摊位 r=10~12、
 * 幡圈 r=14（`WorldDecorations`），泉池偏心 7。取 22 ⇒ 最外一圈家具整只落在台面里。
 */
const PLAZA_R = 22;
/** 过渡带宽度：台面在这一圈宽里揉回自然起伏（盘 + 带 = 38，仍在 `HUB_ZONE.radius` 50 之内） */
const PLAZA_SKIRT = 16;
/**
 * 盘心只此一份。水位取样、台面落位、枢纽家具那三圈读的都是这一个对象 ——
 * 抄成两份的写法（`HUB_PLAZA.x` 与 `HUB_ZONE.center` 各写一次）能让"整张台面搬到别处"
 * 和"水位算在原地"同时成立，那是一笔没人读的债。同心本身由判据 ⑤ 钉。
 */
const 盘心 = Object.freeze({ x: HUB_ZONE.center.x, z: HUB_ZONE.center.z });

/** 水位取盘内采样点的中位数：0.5 米一格，样本够稳，且整块地只扫一次（模块加载期，纯函数） */
const PLAZA_SCAN_STEP = 0.5;

/** 广场水位 = 盘内自然地形的**中位数**：挖方与填方大致相抵，台面高度不是我挑出来的数 */
function plazaLevel(r) {
  const 样本 = [];
  for (let dx = -r; dx <= r; dx += PLAZA_SCAN_STEP) {
    for (let dz = -r; dz <= r; dz += PLAZA_SCAN_STEP) {
      if (Math.hypot(dx, dz) > r) continue;
      样本.push(naturalTerrain(盘心.x + dx, 盘心.z + dz));
    }
  }
  样本.sort((a, b) => a - b);
  return 样本[(样本.length - 1) >> 1];
}

/** 枢纽广场（台面水平、与枢纽台地同心） */
export const HUB_PLAZA = Object.freeze({
  ...盘心,
  r: PLAZA_R,
  skirt: PLAZA_SKIRT,
  level: plazaLevel(PLAZA_R),
});

/** 广场权重：盘内恒 1，`r + skirt` 外恒 0，带内走 smoothstep（两端导数为 0 ⇒ 接痕不成折线） */
export function hubPlazaWeight(x, z) {
  const dx = x - HUB_PLAZA.x;
  const dz = z - HUB_PLAZA.z;
  const 外缘 = HUB_PLAZA.r + HUB_PLAZA.skirt;
  const d2 = dx * dx + dz * dz;
  if (d2 >= 外缘 * 外缘) return 0;
  if (d2 <= HUB_PLAZA.r * HUB_PLAZA.r) return 1;
  const t = (Math.sqrt(d2) - HUB_PLAZA.r) / HUB_PLAZA.skirt;
  return 1 - t * t * (3 - 2 * t);
}

export function sampleGlobalHeight(x, z, zones = []) {
  let maxH = naturalTerrain(x, z);

  for (const zone of zones) {
    const zh = zone.getHeightAt(x, z);
    if (zh > maxH) maxH = zh;
  }

  const w = hubPlazaWeight(x, z);
  if (w === 0) return maxH;
  return maxH + (HUB_PLAZA.level - maxH) * w;
}

/** 四角采样 — 减少陡坡穿模、移动更贴地 */
export function sampleGlobalHeightSmooth(x, z, zones = []) {
  const s = 0.5;
  return (
    sampleGlobalHeight(x, z, zones)
    + sampleGlobalHeight(x + s, z, zones)
    + sampleGlobalHeight(x - s, z, zones)
    + sampleGlobalHeight(x, z + s, zones)
    + sampleGlobalHeight(x, z - s, zones)
  ) / 5;
}

export function sampleGroundNormal(x, z, zones = []) {
  const e = 1.0;
  const hL = sampleGlobalHeight(x - e, z, zones);
  const hR = sampleGlobalHeight(x + e, z, zones);
  const hD = sampleGlobalHeight(x, z - e, zones);
  const hU = sampleGlobalHeight(x, z + e, zones);
  const nx = hL - hR;
  const nz = hD - hU;
  const len = Math.hypot(nx, nz, 2 * e) || 1;
  return { x: nx / len, y: (2 * e) / len, z: nz / len };
}

/** 蜿蜒古径控制点 */

