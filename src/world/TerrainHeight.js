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
 *
 *  室内那一层地板（`interiors`）走同一层理由、也落在这条链的最后 —— 它比广场更极端：
 *  幽暗神殿那层地板在室外地面**之下** 20 米，星港瞭望塔那层在**之上** 20 米。
 *  改前它由 `WorldManager.getGroundHeight` 里一道"占地内就整体替换"的分支回答，
 *  占地边界就是一刀 21~23 米的竖直坎，而这张网格（眼睛）根本不认那一档：
 *  脚踩的那层与看见的那层是两层（B126，走路穿模里最狠的一段落差）。
 *  现在它按 `blendInterior` 的权重掺进来，腹地恒 1（读数一字未改），带外恒 0。
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

/** 谷底半宽占 halfWidth 的比例；谷底与肩峰之间必须接得上（见 corridorRidge 的注释） */
const CORRIDOR_FLOOR_RATIO = 0.55;
const CORRIDOR_FLOOR = -0.8;
const CORRIDOR_CREST = 2.8;

/** 区缘收口带宽的上限（再按区半径收窄，见 sampleGlobalHeight 的注释） */
const ZONE_RIM_TAPER = 28;

/**
 * 区际走廊：路径附近略低，两侧隆起。
 *
 * 改前谷底（`dist ≤ 0.55×halfWidth`）在半径外那一刀直接切到肩部曲线，单步落差两米级
 * （`dist = 6.6 → 7.0`）：玩家跨过去时 `walkY` 当场跳两米，竖直阻尼只会把他**从山坡里穿上去**
 * 竖直阻尼只会把他**从山坡里穿上去** —— 那是"走路穿模"里与摆件无关的另一半。
 * 现在谷底到肩峰走 smoothstep（两端导数 0 ⇒ 接痕不成折线），带外的形状一字未改。
 * 这一段由 `tests/terrain-continuity.test.js` 的"走廊谷缘不成台阶"那条盯着。
 */
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
  const crest = Math.max(0, 1 - Math.abs(dist - halfWidth) / halfWidth) * CORRIDOR_CREST;
  const floorEdge = halfWidth * CORRIDOR_FLOOR_RATIO;
  if (dist <= floorEdge) return CORRIDOR_FLOOR;
  if (dist >= halfWidth) return crest;
  const s = (dist - floorEdge) / (halfWidth - floorEdge);
  const w = s * s * (3 - 2 * s);
  return CORRIDOR_FLOOR + (crest - CORRIDOR_FLOOR) * w;
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

/**
 * 区缘权重。
 *
 * `BaseZone.getHeightAt` 在半径外一刀交 `-Infinity`，而各区自己的 `sampleHeight` 到缘只归 **0**
 * （`edgeFade`）—— 于是 `max` 在半径那一圈留下整段 `0 − 自然地` 的台阶（十几米级，最坏在
 * magic 区南缘）。玩家跨圆周时 `walkY` 当场跳十几米，
 * 竖直阻尼把他**从山体里穿上去**，这就是"走路穿模"里最大的一段落差。
 *
 * 权重在 `radius − 带` 之内恒 1（腹地读数一字未改），到 `radius` 收到 0 ⇒ 区高退回自然地，
 * 圆周两侧接得上。带宽按半径收窄，永远不会把整区抹平。
 * 这一段由 `tests/terrain-continuity.test.js` 的"区缘不是悬崖"和"区缘收口不动腹地"两条盯着。
 */
function zoneRimWeight(zone, x, z) {
  const band = Math.min(ZONE_RIM_TAPER, zone.radius * 0.25);
  const t = (zone.distanceToCenter(x, z) - (zone.radius - band)) / band;
  if (t <= 0) return 1;
  if (t >= 1) return 0;
  return 1 - t * t * (3 - 2 * t);
}

/**
 * 室内那一档往这块地里掺多少（W-B9 切片E，修 B126）。
 *
 * `interiors` 是宿主世界的 `InternalSpaceManager`（鸭子类型：只问 `groundBlendAt(x, z)`），
 * 没递就等于"这块地上没有室内"。掺混落在**室外那整块地之后**，与广场同一层理由：
 * `max` 只会往上抬，抬不平已经压在头顶的那座 hill，也压不下本该埋在地下的那层地板 ——
 * 而室内是"这一格的地面就是这一层楼"，它必须能同时往下和往上改。带外权重恒 0，
 * 于是这条掺混在世界上绝大多数点上根本发生不了。
 *
 * 过渡带里那点算**室外**：雾、层号、`currentSpace` 仍按占地认领（`spaceAtWorldPoint`），
 * 只有地面在带里往室内那一档俯身 —— 玩家还没进屋，但脚下不再是平的。
 */
function blendInterior(室外, interiors, x, z) {
  if (!interiors) return 室外;
  const 室内 = interiors.groundBlendAt(x, z);
  if (!室内) return 室外;
  return 室外 + (室内.height - 室外) * 室内.weight;
}

export function sampleGlobalHeight(x, z, zones = [], interiors = null) {
  const nat = naturalTerrain(x, z);
  let maxH = nat;

  for (const zone of zones) {
    const zh = zone.getHeightAt(x, z);
    if (!Number.isFinite(zh)) continue;
    const rim = zoneRimWeight(zone, x, z);
    const h = rim === 1 ? zh : nat + (zh - nat) * rim;
    if (h > maxH) maxH = h;
  }

  const w = hubPlazaWeight(x, z);
  const 室外 = w === 0 ? maxH : maxH + (HUB_PLAZA.level - maxH) * w;
  return blendInterior(室外, interiors, x, z);
}

/** 四角采样 — 减少陡坡穿模、移动更贴地 */
export function sampleGlobalHeightSmooth(x, z, zones = [], interiors = null) {
  const s = 0.5;
  return (
    sampleGlobalHeight(x, z, zones, interiors)
    + sampleGlobalHeight(x + s, z, zones, interiors)
    + sampleGlobalHeight(x - s, z, zones, interiors)
    + sampleGlobalHeight(x, z + s, zones, interiors)
    + sampleGlobalHeight(x, z - s, zones, interiors)
  ) / 5;
}

export function sampleGroundNormal(x, z, zones = [], interiors = null) {
  const e = 1.0;
  const hL = sampleGlobalHeight(x - e, z, zones, interiors);
  const hR = sampleGlobalHeight(x + e, z, zones, interiors);
  const hD = sampleGlobalHeight(x, z - e, zones, interiors);
  const hU = sampleGlobalHeight(x, z + e, zones, interiors);
  const nx = hL - hR;
  const nz = hD - hU;
  const len = Math.hypot(nx, nz, 2 * e) || 1;
  return { x: nx / len, y: (2 * e) / len, z: nz / len };
}

/** 蜿蜒古径控制点 */

