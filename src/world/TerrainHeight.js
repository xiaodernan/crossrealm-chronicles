/** 全局地形高度 — 枢纽台地、山谷、区际丘陵（非大平地）
 *
 *  `WINDING_ROUTES` 已搬到 `content/windingRoutes.js`（W-B1 切片1）：
 *  它被两个 UI 面板读，留在这里会让 `chunk-ui → chunk-world` 多一条回边（B37）。
 *  刻意**不做 re-export** —— 那等于把边原样接回来。
 */
export function hubPlateau(x, z) {
  const dx = x;
  const dz = z - 55;
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

export function sampleGlobalHeight(x, z, zones = []) {
  let maxH = continentalNoise(x, z) + connectionTerrain(x, z) + hubPlateau(x, z);

  for (const zone of zones) {
    const zh = zone.getHeightAt(x, z);
    if (zh > maxH) maxH = zh;
  }

  return maxH;
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

