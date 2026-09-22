/** 全局地形高度 — 枢纽台地、山谷、区际丘陵（非大平地） */
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
