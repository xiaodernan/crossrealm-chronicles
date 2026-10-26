/**
 * 玩家可见验收（缺陷② 切片D）：用**真的 PlayerController + 真的世界 + 真的摆件**把枢纽、
 * 每条走廊、每片区的区缘都走一遍，逐帧问三件事：身体吃进体里没有、脚站在看见的地面上没有、
 * 竖直位移一帧之内吸得下没有。
 *
 * ## 为什么还要这一条，地形连续性门禁不是已经绿了？
 *
 * `tests/terrain-continuity.test.js` 量的是**高度场这个纯函数**；玩家踩的是
 * `world.getGroundHeight` 那条**出口**，中间还隔着位移细分、落脚判定、竖直阻尼三步。
 * 函数连续不等于走起来不穿模 —— 这一条把最后那三步也接进来：跑的是 `p.update(dt, …)`。
 *
 * ## 路线全部由生产推出来，一条都不手画（这条门禁的牙口就在这儿）
 *
 * 落刀实测连撞两次，都是"连续性门禁整套红、行走见证一字不动"：
 *
 * 1. 手画方向那次 —— 三条"跨缘长途"恰好走在圆周落差很小的那一向，见证对一米级台阶毫无反应。
 * 2. 改成"圆周自然地读数最大"那次还是没咬上 —— 因为改前那条合成是 `max(nat, zh…)`，
 *    **只会往上抬**：区高到缘归 0，于是只有"自然地低于 0"的那一向才被抬到 0、跨出去当场掉下去；
 *    `nat = +13` 的那种正坡改前改后都读 `nat`，**一步都不差**。按绝对值挑出来的七向里六向
 *    全是这种"改前后一个样"的向（实测剖面：落刀前后逐米读数一字不动）。
 *
 * 现在瞄准的是**改前合成真正搬掉的那一段**：`改前读数(缘里) − 改前读数(缘外)`，其中"改前读数"
 * 与 `tests/terrain-continuity.test.js` 的"区缘收口不动腹地"共用同一张写法（区高直接参与取最大值）。
 * 这个数对收口权重本身是盲的 ⇒ 它只负责**把路线对准刀口**，判据读的仍是生产出口。
 *
 * - 枢纽广场：三条整圈 + 两条直路，半径由 `HUB_PLAZA.r / skirt` 推（腹地、贴盘缘内侧、裙带中段）。
 * - **每条走廊一刀横切**：端点从 `CORRIDORS` 表解析，切线过走廊中点、垂直轴线、长 `半宽 × 2.4`
 *   （走廊项在 `2.2×半宽` 外恒 0，切到那儿就够）。加一条走廊就多一条路线，不会各切各的。
 * - **每片区一条跨缘长途，由缘外往缘内爬**（`缘外起手` 米起手、跨过圆周再走 `缘内收脚` 米）：
 *   爬那道刀时 `walkY` 一帧跳十几米、人被竖直阻尼从山体里穿上去，那才是玩家看得见的穿模；
 *   从缘上跳下去走的是重力落地那套账，本案不冒充。方向筛选问两道生产判据 —— 出界
 *   （PlayerController 把起点夹在 `world.bounds` 上，腿③ 只会看到"没走到"）、摆件堵路；
 *   每区连同"界内最利的那一向"一起交给腿⑥ 对账：**过滤器不许把水里的刀啃掉**。
 * - 全部按 `tests/helpers/seededWorld.js` 的两颗钉死种子跑 —— 读的是真布局，就不许听命于运气。
 *
 * **跨缘长途现在可以穿过室内足迹**（切片E 收口 B126 之后）：改前那片足迹与室外地形之间有
 * 20 米级台阶（幽暗神殿 21.09、星港瞭望塔 23.36），挑方向时必须绕开，否则见证量到的是那一刀
 * 而不是区缘。现在室内那一档按权重掺进了同一条高度场，绕开的那道筛子随之删掉 ——
 * 腿⑥ 反过来钉"**至少有一条长途真的踩过足迹**"，免得这条路线族对 B126 又变回沉默。
 *
 * ## 三把尺仍然全部来自生产
 *
 * 取样半径 = `colliderRadius`（吃进判定用 `半径 − 2 厘米`，留的正是贴墙滑行的那 2 厘米）；
 * 胸口高度 = `moveCircle` 自己那第二个探点；竖直上限 = `stepUp`（一帧吸收得下的高度）。
 *
 * ## 变异臂（切片D 的落刀记录；每一把都按"刀"那一列改生产常数复现，红名由非 TTY 输出解析）
 *
 * 同一批刀同时打在 `terrain-continuity` / `terrain-height` 上，那两处的红由它们自己的门禁认领，
 * 这张表只记**本案**这几条腿。
 *
 * | 臂 | 刀 | 预测红 | 实测 | 超出预测的红 ⇒ 归因 |
 * |---|---|---|---|---|
 * | 臂6 | 不落刀 | — | 0 红 | 基线 |
 * | 臂1 | `CORRIDOR_FLOOR_RATIO 0.55 → 1.0`（谷底→肩峰退成一刀） | ② | 1 红，无漏 | 横切走廊那几条路线当场点名 |
 * | 臂2 | 合成层退回裸 `zh`（区缘收口摘掉） | ② | 1 红，无漏 | 换掉瞄准量之后才咬上 —— 见开头那两次落刀实测 |
 * | 臂3 | 区缘权重取反（腹地交给自然地、区外交给区高） | ② | 1 红，无漏 | 反方向同样红 ⇒ ② 钉的是"收口朝外"而不是"某一次混合" |
 * | 臂4 | `stepUp 0.65 → 0.05`（尺子来自生产） | ②＋④ | 2 红，无漏 | ④ 是替身身体对账那条：上坎抄漂 ⇒ 量的就不是玩家 |
 * | 臂7 | 竖直阻尼 `0.88 → 0.2` | 只有 ② | 2 红 | **⑤ 反向控制**：⑤ 的另一半断言"真出口在同一条路上不许报帧"，阻尼放慢 4.4 倍后脚真的追不上地面 ⇒ 这一红是它的搭档在说话，不是噪声 |
 * | 臂5 | 阻尼 `0.88 → 1`（瞬吸，预期绿） | — | 0 绿 | 本案的**限度**：阻尼朝"更快"那一向没有见证可咬 —— 一帧吸满时 ② 的账恰好归零。② 只保证"慢于生产值会红" |
 *
 * 切片E（B126）的四刀里，本片吃到两刀（整批记录在 `tests/interior-ground-field.test.js` 头部那张表）：
 *
 * | 臂 | 刀 | 本片预测红 | 实测 | 归因 |
 * |---|---|---|---|---|
 * | 臂11 | 四条过渡带统一砍半 | ② | 1 红，无漏无超出 | 瞭望塔那一条"走进足迹"的长途报最坏单帧竖移 0.720 米（上限 0.65）—— 连续性门禁 ① 沿轴对齐扫描线量不到它（坡度在轴上的投影更小），**径向走进去的这一条才是那把尺** |
 * | 臂12 | `blendInterior` 不再掺 | 0 红 | 0 红 | 本片对"抹掉一项"是哑的，而且是**对的**：没有那一档就没有那把刀，脚走的是一条处处吸得下的场。室内那一档本身活着没活着，由 `interior-ground-field` ①⑤ 与 `zone-internal-ownership` 认 —— 见证只保证"吸不下就点名" |
 *
 * 臂7 是这批里唯一**只有身体能看见**的刀：高度场那一层一字未改，连续性门禁整套绿。
 *
 * ## 界外那几把刀（写明，不假造路线）
 *
 * `world.bounds` 比每片区的半径都小，所以 abyss / radiant / space 三区"改前台阶最利"的那一向
 * 落在玩家走不到的地方。腿⑥ 因此对每一区都同时打印"选中那一向"与"界内最利那一向"，并要求
 * 两者之差超过 `上坎` 的区数为零 —— 过滤器（出界／摆件堵路）不许把水里的刀啃掉。
 */
import { describe, it, expect } from 'vitest';
import { installWindowShim } from './helpers/enemyHarness.js';
import { buildSeededWorld, buildSeededDecorations } from './helpers/seededWorld.js';
import { makePlayer } from './helpers/playerHarness.js';
import {
  corridorRoster, corridorHalfWidth, playerRadius, playerStepUp, chestProbe,
} from './helpers/productionReadings.js';
import { sampleGlobalHeight, HUB_PLAZA } from '../src/world/TerrainHeight.js';

installWindowShim();

const 半径 = playerRadius();
const 上坎 = playerStepUp();
const 胸口 = chestProbe();
/** 吃进判定留的余量：贴墙滑行时身体边缘正好压在 `半径` 上，差 2 厘米以内不算穿模 */
const 容差 = 0.02;

const world = buildSeededWorld(7);
buildSeededDecorations(world, 11);
const 区们 = world.zones;
const 室内 = world.internalSpaceManager;
/** 世界边界：PlayerController 会把人夹在这儿，路线算出界就是"没走到"而不是"穿模" */
const 界 = world.bounds;
/** 只交空区表 ⇒ 读数只剩 `naturalTerrain` 那三项（丘陵 + 走廊 + 枢纽台地） */
const 自然地 = (x, z) => sampleGlobalHeight(x, z, []);
/** 从某个中心沿 角 走 dist 的那个点 */
const 极 = (心, 角, dist) => ({ x: 心.x + Math.cos(角) * dist, z: 心.z + Math.sin(角) * dist });
/**
 * 改前那条合成式：区高直接参与取最大值，没有任何混合 —— 与
 * `tests/terrain-continuity.test.js` 的"区缘收口不动腹地"读的是同一张写法。
 * 本案只用它**瞄准刀口**：这个数对收口权重本身是盲的（落刀前后一字不变），
 * 判据读的仍然是生产出口 `world.getGroundHeight`。
 */
function 改前读数(x, z) {
  return 区们.reduce((m, 区) => {
    const zh = 区.getHeightAt(x, z);
    return Number.isFinite(zh) && zh > m ? zh : m;
  }, 自然地(x, z));
}

/** 航点间隔 = 玩家一步的量级（`colliderRadius` 的 16 倍 ≈ 7 米）：follower 靠航点拐弯，不靠运气 */
function 射线(起点, 角, 长) {
  const 步 = 半径 * 16;
  const 点 = [];
  for (let d = 0; d < 长; d += 步) 点.push({ x: 起点.x + Math.cos(角) * d, z: 起点.z + Math.sin(角) * d });
  点.push({ x: 起点.x + Math.cos(角) * 长, z: 起点.z + Math.sin(角) * 长 });
  return 点;
}

function 广场圈(r, n) {
  const 点 = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: HUB_PLAZA.x + Math.cos(a) * r, z: HUB_PLAZA.z + Math.sin(a) * r };
  });
  点.push({ ...点[0] }); // 回到起点，整圈闭合
  return 点;
}

/**
 * 这条射线是否穿过某座室内空间的水平足迹 —— 用生产那一条判据问，不自建近似。
 * B126 修好之前它是**筛子**（穿足迹的向一律不选，否则见证先撞上那片 20 米台阶）；
 * 现在它只是**记账**：腿⑥ 用它要求"至少有一条长途真的踩过足迹"。
 */
function 穿室内(起点, 角, 长) {
  for (let d = 0; d <= 长; d += 半径 * 4) {
    if (室内?.spaceAtWorldPoint(起点.x + Math.cos(角) * d, 起点.z + Math.sin(角) * d)) return true;
  }
  return false;
}

/**
 * 这个点还在**世界边界内**吗（留 `8×半径` 的边距：PlayerController 夹的是身体中心，不是脚边）。
 * 出界的路线会被夹在边界上，腿③ 看到的是"没走到"，跟"地形拦住了人"长得一模一样 —— 什么都没量。
 */
function 在界内(p) {
  const 边距 = 半径 * 8;
  return p.x >= 界.minX + 边距 && p.x <= 界.maxX - 边距 && p.z >= 界.minZ + 边距 && p.z <= 界.maxZ - 边距;
}

/**
 * 这条射线中途是否被摆件/障碍挡住 —— 用**腿① 那同一把尺**问（`blockersAt` 胸口档、半径减容差），
 * 不自建近似。方向里只要有一格被挡，人会在那儿蹭到帧数耗尽，腿③ 看到的"没走到"
 * 就分不清是摆件拦人、地形拦人还是边界截人。
 */
function 被挡(起点, 角, 长) {
  for (let d = 半径; d <= 长; d += 半径 * 4) {
    const x = 起点.x + Math.cos(角) * d;
    const z = 起点.z + Math.sin(角) * d;
    const 胸 = world.collision.blockersAt(x, z, world.getGroundHeight(x, z) + 胸口, 半径 - 容差);
    if (胸) return `${胸.owner ?? 胸.kind} @ (${x.toFixed(1)},${z.toFixed(1)})`;
  }
  return null;
}

/** 起手点在缘外这么远、跨过圆周后再往腹地收这么远：合起来就是这条长途的长度 */
const 缘外起手 = 25;
const 缘内收脚 = 20;

/**
 * 这一向的区缘在**改前**留下多大的台阶：圆周里侧的改前读数 − 外侧的改前读数。
 *
 * 不是 `|自然地|`。`max` 只会往上抬，所以只有"自然地低于 0"的那一向才被区高抬到 0、
 * 跨出去当场掉下去；正坡那一向改前改后都读 `nat`，**一步都不差**。上一版按绝对值挑方向，
 * 挑中的七向里六向都是这种"改前后一个样"的向 ⇒ 落刀臂（合成层退回裸 `zh`）让连续性门禁
 * 整套红、行走见证却一字不动。这个式子对收口权重本身是盲的（落刀前后同一个数），只用来瞄准。
 */
function 刀口(区, 角) {
  const 里 = 极(区.center, 角, 区.radius - 0.25);
  const 外 = 极(区.center, 角, 区.radius + 0.25);
  return 改前读数(里.x, 里.z) - 改前读数(外.x, 外.z);
}

/**
 * 一片区的跨缘长途 = 64 向里"改前台阶最利"的那一向，**从缘外往缘内走**。
 *
 * 朝内走是要害：爬那道刀时 `walkY` 一帧跳十几米、人被竖直阻尼从山体里穿上去，那才是玩家
 * 看得见的穿模；从缘上跳下去是重力落地，另有一套账（本案不冒充那条）。
 * 筛掉的只有两道：出界的向 PlayerController 会把人夹在边界上（腿③ 只看到"没走到"）、
 * 被摆件堵住的向会让人原地蹭到帧数耗尽。**穿室内足迹的向不再筛掉**（B126 修好后并回来）。
 * 界内最利的那一向连同选中的一起交给腿⑥ 对账：**过滤器不许悄悄把牙啃掉**。
 */
function 跨缘方向(区) {
  const 候选 = [];
  for (let i = 0; i < 64; i++) {
    const 角 = (i / 64) * Math.PI * 2;
    const 起点 = 极(区.center, 角, 区.radius + 缘外起手);
    候选.push({
      角,
      起点,
      朝内: 角 + Math.PI,
      长: 缘外起手 + 缘内收脚,
      刀口: 刀口(区, 角),
      界内: 在界内(起点),
    });
  }
  候选.sort((a, b) => b.刀口 - a.刀口);
  const 可走 = 候选.filter((c) => c.界内);
  const 最利 = 可走.length ? 可走[0].刀口 : -Infinity;
  const 堵住们 = 可走.map((c) => 被挡(c.起点, c.朝内, c.长)).filter(Boolean);
  const 命中 = 可走.find((c) => !被挡(c.起点, c.朝内, c.长));
  const 前三 = 候选.slice(0, 3)
    .map((c) => `${(c.角 * 180 / Math.PI).toFixed(0)}° 台阶 ${c.刀口.toFixed(1)} m${c.界内 ? '' : '（缘外起手已出 world.bounds）'}`)
    .join('｜');
  expect(
    命中,
    `区 "${区.id}" 挑不出可走的跨缘长途 ⇒ 本片对该区缘那把刀是沉默的：台阶最大的三向是 ${前三}；` +
      `界内可走的 ${可走.length} 向里被摆件堵在半路 ${堵住们.length} 向` +
      `${堵住们.length ? `（如 ${堵住们[0]}）` : ''}。先确认是不是边界/摆件的布局漂了，再来把这条门槛调低`
  ).toBeTruthy();
  return { ...命中, 最利, 穿间: 穿室内(命中.起点, 命中.朝内, 命中.长) };
}

/** 走廊横切线：过中点、垂直轴线，从一侧的带外一直切到另一侧的带外（单程，不来回蹭） */
function 走廊切线([x1, z1, x2, z2]) {
  const 中 = { x: (x1 + x2) / 2, z: (z1 + z2) / 2 };
  const 轴 = Math.hypot(x2 - x1, z2 - z1) || 1;
  const 角 = Math.atan2((x2 - x1) / 轴, -(z2 - z1) / 轴);
  const L = corridorHalfWidth() * 2.4;
  return 射线({ x: 中.x - Math.cos(角) * L, z: 中.z - Math.sin(角) * L }, 角, 2 * L);
}

const 走廊们 = corridorRoster();
const 广场 = { r: HUB_PLAZA.r, skirt: HUB_PLAZA.skirt, 外缘: HUB_PLAZA.r + HUB_PLAZA.skirt };
const 区路线 = 区们.map((区) => [区, 跨缘方向(区)]);

/**
 * 每座登记在册的室内足迹一条"从带外走到空间心"的长途 —— B126 的玩家可见验收。
 *
 * 那条过渡带就是为这一步而存在的：改前占地边界那一刀 21~23 米，跨进去的那一帧 `walkY`
 * 当场跳二十米，竖直阻尼把人从山体里穿上去。所以这条路线必须**从带外起手、一路走到心**
 * （腹地那一段权重恒 1，是平的；刀口全在带里），把整条带宽都踩一遍。
 * 起手方向在八向里挑不被摆件堵住的那一向；都堵就取堵得最少的 —— 路线一条都不许静默消失，
 * 腿⑥ 按名册对账。
 */
const 室内名册 = [...室内.spacesByZone.entries()]
  .flatMap(([zoneId, 间们]) => 间们.map((间) => ({ zoneId, 间 })));
const 足迹路线 = 室内名册.map((条目) => {
  const 载体 = 区们.find((区) => 区.id === 条目.zoneId);
  expect(载体, `${条目.间.id} 登记在 ${条目.zoneId}，区表里却没有这个区`).toBeTruthy();
  const 心 = 条目.间.getWorldCenter(载体.center);
  const 外 = 条目.间.radius + 条目.间.rimBand + 8;
  const 候选 = [];
  for (let i = 0; i < 8; i++) {
    const 角 = (i / 8) * Math.PI * 2;
    const 起点 = 极(心, 角, 外);
    if (!在界内(起点)) continue;
    候选.push({ 角, 起点, 挡: 被挡(起点, 角 + Math.PI, 外) ? 1 : 0 });
  }
  expect(候选.length, `${条目.间.id} 的带外起手点在 world.bounds 里一个都放不下（心 (${心.x.toFixed(0)},${心.z.toFixed(0)})、`
    + `带外 ${外.toFixed(1)} 米）⇒ 这条足迹长途等于没建`).toBeGreaterThan(0);
  候选.sort((a, b) => a.挡 - b.挡);
  const 选 = 候选[0];
  const 名称 = `${条目.间.id} 走进足迹（${条目.zoneId} 名下，心 (${心.x.toFixed(0)},${心.z.toFixed(0)})、`
    + `占地 ${条目.间.radius} m + 带宽 ${条目.间.rimBand} m，从 ${选.角.toFixed(0)} rad 那一侧的带外 ${外.toFixed(0)} m 走到心）`;
  return {
    id: 条目.间.id,
    名称,
    起点: 选.起点,
    心,
    间: 条目.间,
    载体: 载体.center,
    路线: [名称, 射线(选.起点, 选.角 + Math.PI, 外)],
  };
});

const 路线们 = [
  [`绕广场腹地 r=${(广场.r * 0.72).toFixed(1)}`, 广场圈(广场.r * 0.72, 32)],
  [`绕广场贴盘缘内侧 r=${广场.r - 1}`, 广场圈(广场.r - 1, 32)],
  [`绕广场裙带 r=${(广场.r + 广场.skirt * 0.15).toFixed(1)}`, 广场圈(广场.r + 广场.skirt * 0.15, 32)],
  ['斜穿整个广场', 射线({ x: HUB_PLAZA.x - 广场.r * 0.9, z: HUB_PLAZA.z - 广场.r * 0.9 }, Math.PI / 4, 广场.r * 1.8 * Math.SQRT2)],
  ['从盘心沿 +x 越过裙带外缘', 射线({ x: HUB_PLAZA.x, z: HUB_PLAZA.z }, 0, 广场.外缘 + 10)],
  ...走廊们.map((c, i) => [`横切走廊 #${i + 1}（${c[0]},${c[1]}→${c[2]},${c[3]}）`, 走廊切线(c)]),
  ...区路线.map(([区, 向]) => [
    `爬 ${区.id} 区缘的刀（改前台阶 ${向.刀口.toFixed(1)} m，从 ${(向.角 * 180 / Math.PI).toFixed(0)}° 那一向由缘外 ${缘外起手} m 走进腹地 ${缘内收脚} m）`,
    射线(向.起点, 向.朝内, 向.长),
  ]),
  ...足迹路线.map((条) => 条.路线),
];

/**
 * 寻的跟随 + 撞墙转向：每帧朝当前航点推满摇杆；挪不动（<0.1 米）就左右各试一档偏角。
 * 回卷位置只写 `position`，**不走 `teleport`** —— 那个会顺手 `resolveOverlap()`，
 * 正好把要量的吃进抹掉。撞墙转向是为了让路线在摆件之间走通，而不是替摆件开门。
 */
function 走路(p, 航点们, { 到距 = 2, 上限帧 = 4000 } = {}) {
  const 起点 = 航点们[0];
  p.teleport(起点.x, p.world.getGroundHeight(起点.x, 起点.z), 起点.z, { keepVelocity: false, yaw: 0 });
  const dt = 1 / 60;
  const 偏角 = [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5];
  const 异常 = [];
  const 每点最近 = 航点们.map(() => Infinity);
  每点最近[0] = 0;
  let 目标 = 1;
  let 帧 = 0;
  let 走完 = 0;
  let 最坏落差 = 0;
  let 最深陷地 = 0;
  let 吃进次数 = 0;
  while (目标 < 航点们.length && 帧 < 上限帧) {
    const 航 = 航点们[目标];
    const 距 = Math.hypot(p.position.x - 航.x, p.position.z - 航.z);
    if (距 < 每点最近[目标]) 每点最近[目标] = 距;
    if (距 < 到距) { 目标++; continue; }
    const 正对 = Math.atan2(航.x - p.position.x, 航.z - p.position.z);
    const 前 = {
      x: p.position.x, y: p.position.y, z: p.position.z,
      vx: p.velocity.x, vy: p.velocity.y, vz: p.velocity.z,
    };
    let 挪了 = 0;
    for (const 偏 of 偏角) {
      if (偏 !== 0) {
        p.position.set(前.x, 前.y, 前.z);
        p.velocity.set(前.vx, 前.vy, 前.vz);
      }
      p.yaw = 正对 + 偏;
      p.targetYaw = 正对 + 偏;
      p.update(dt, {}, { x: 0, y: 1, mag: 1, sprint: 0 });
      挪了 = Math.hypot(p.position.x - 前.x, p.position.z - 前.z);
      if (挪了 > 0.1) break;
    }
    帧++;
    走完 += 挪了;
    const 地 = p.world.getGroundHeight(p.position.x, p.position.z);
    const 胸 = world.collision.blockersAt(p.position.x, p.position.z, p.position.y + 胸口, 半径 - 容差);
    const 落差 = Math.abs(p.position.y - 前.y);
    const 陷地 = 地 - p.position.y;
    if (落差 > 最坏落差) 最坏落差 = 落差;
    if (陷地 > 最深陷地) 最深陷地 = 陷地;
    const 事 = [];
    if (胸) { 吃进次数++; 事.push(`身体吃进 ← ${胸.owner ?? 胸.kind}(${胸.x.toFixed(1)},${胸.z.toFixed(1)}) ${胸.base.toFixed(1)}→${胸.top.toFixed(1)}`); }
    if (落差 > 上坎) 事.push(`一帧竖移 ${落差.toFixed(3)} m > 上坎 ${上坎}`);
    if (陷地 > 0.05) 事.push(`脚在地面以下 ${陷地.toFixed(3)} m`);
    if (事.length) 异常.push(`f${帧} (${p.position.x.toFixed(1)},${p.position.z.toFixed(1)}) ${事.join('｜')}`);
  }
  const 没到 = 每点最近
    .map((d, i) => (d > 到距 ? `#${i}(${航点们[i].x.toFixed(0)},${航点们[i].z.toFixed(0)}) 只到 ${d.toFixed(1)} m` : null))
    .filter(Boolean);
  const 折线 = 航点们.reduce((总, 点, i) => (i ? 总 + Math.hypot(点.x - 航点们[i - 1].x, 点.z - 航点们[i - 1].z) : 0), 0);
  return { 异常, 帧, 走完, 折线, 没到, 最坏落差, 最深陷地, 吃进次数, 每帧: 走完 / Math.max(1, 帧) };
}

/**
 * 造一个只跑 locomotion 的玩家。取地出口默认**就是生产那一条** `world.getGroundHeight`
 * （里面还隔着室内足迹、副本两层分支），不是本案自己重抄的合成式 ——
 * 见证要量的是玩家脚下那块地，量错了出口就等于量了另一个游戏。
 */
function 玩家(取地 = (x, z) => world.getGroundHeight(x, z)) {
  const p = makePlayer();
  p.world = {
    getGroundHeight: (x, z) => 取地(x, z),
    collision: world.collision,
    bounds: world.bounds ?? null,
  };
  return p;
}

describe('行走见证：真玩家真世界走全部推导路线（缺陷② 切片D）', () => {
  /** 每条路线跑一遍，结果按名字存着给后面几条腿复用（一次跑，几把尺，别再跑十几遍） */
  const 跑 = new Map();
  const 全跑 = () => {
    if (跑.size === 0) {
      for (const [名, 航点们] of 路线们) 跑.set(名, 走路(玩家(), 航点们));
    }
    return 跑;
  };

  it('① 身体任何一帧都不吃进障碍（胸口那一档是 moveCircle 自己的判据）', () => {
    const 坏 = [];
    for (const [名, r] of 全跑()) {
      if (r.吃进次数 > 0) 坏.push(`${名}：${r.吃进次数} 帧吃进\n    ${r.异常.filter((s) => s.includes('吃进')).slice(0, 4).join('\n    ')}`);
    }
    expect(坏, `玩家走路穿进摆件/地形里：\n${坏.join('\n')}`).toEqual([]);
  });

  it('② 一帧之内的竖直落差不超过上坎，且脚不站在地面以下', () => {
    const 坏 = [];
    for (const [名, r] of 全跑()) {
      if (r.最坏落差 > 上坎) 坏.push(`${名}：最坏单帧竖移 ${r.最坏落差.toFixed(3)} m（上限 ${上坎}）`);
      if (r.最深陷地 > 0.05) 坏.push(`${名}：最深陷地 ${r.最深陷地.toFixed(3)} m`);
    }
    expect(坏, `走路时被地形瞬移/陷进去：\n${坏.join('\n')}`).toEqual([]);
  });

  it('③ 每条路线真的走通了（见证不是空跑）', () => {
    const 坏 = [];
    let 总帧 = 0;
    let 总米 = 0;
    let 应走 = 0;
    for (const [名, r] of 全跑()) {
      总帧 += r.帧;
      总米 += r.走完;
      应走 += r.折线;
      if (r.没到.length) 坏.push(`${名}：没走到 ${r.没到.join(' ')}`);
      if (r.每帧 < 0.15) 坏.push(`${名}：平均每帧只挪 ${r.每帧.toFixed(3)} m ⇒ 全程在原地蹭，那三把尺等于没量`);
    }
    expect(坏, `路线走不通，前面两条的"零异常"就是假的：\n${坏.join('\n')}`).toEqual([]);
    expect(总帧, '一条路线都没跑起来 ⇒ 本文件在空转').toBeGreaterThan(1000);
    // 折线长是"绕开摆件"的下界：绕只会更远，不会更近
    expect(总米, `总共只走出 ${总米.toFixed(0)} 米，比所有路线折线加起来（${应走.toFixed(0)} 米）还少 ⇒ 见证没走路`).toBeGreaterThan(应走 * 0.9);
  });

  it('④ 替身玩家的身体与生产一致（半径/上坎抄漂了，见证量的就不是玩家）', () => {
    const p = 玩家();
    expect([p.colliderRadius, p.stepUp], `替身玩家的身体 ${p.colliderRadius}/${p.stepUp} 与生产 ${半径}/${上坎} 不一致`).toEqual([半径, 上坎]);
  });

  it('⑤ 反向控制：取地出口里塞一记 12 米台阶，同一把尺必须点名', () => {
    // 尺咬不住台阶就是假绿：把玩家脚下那道崖**行为性地**塞进出口，看它红不红。
    // 这条横线必须是**摆件挡不住人**的横线：红消息会直接点出占路的 owner，
    // 以后摆件压住它 ⇒ 换一条同规格的横线，别把断言放宽。
    const 路线 = 射线({ x: HUB_PLAZA.x - 广场.r * 0.9, z: HUB_PLAZA.z - 广场.r * 0.6 }, 0, 广场.r * 1.8);
    const 假取地 = (x, z) => world.getGroundHeight(x, z) + (x > HUB_PLAZA.x ? 12 : 0);
    const r = 走路(玩家(假取地), 路线);
    expect(
      r.异常.some((s) => s.includes('一帧竖移')),
      `过盘心那条 12 米台阶没被"单帧竖移 > 上坎"抓到（最坏 ${r.最坏落差.toFixed(3)} m）⇒ ①② 两把尺咬不住地形悬崖`
    ).toBe(true);
    // 对照：同一条路用真出口跑，就该一帧异常都没有
    const 真 = 走路(玩家(), 路线);
    expect(真.异常.length, `真出口在同一条路上却报了 ${真.异常.length} 帧：\n${真.异常.slice(0, 4).join('\n')}`).toBe(0);
  });

  it('⑥ 路线的牙口：界内有刀的区必须走在刀上，走进足迹的长途必须真的踩在过渡带上', () => {
    // 「界内最利」= 这一区 64 向里、起点还在 world.bounds 之内的那向的最大改前台阶。
    // 上一版的账就烂在这儿：量级按 `|自然地|` 取，挑中的向改前改后一个样（13 米的"落差"其实是
    // 正坡，`max` 从不抬它），落刀臂让连续性门禁整套红、见证却不动一个字。
    // 现在按改前合成真正搬掉的那一段瞄准；三区（space/abyss/radiant）的最利刀实测在界外 ——
    // 那是"玩家走不到的刀"，不是本案要抓的东西，但摆件那道筛子不许再把水里的刀啃掉。
    const 啃牙 = 区路线.filter(([, 向]) => 向.最利 > 上坎 && 向.刀口 <= 上坎)
      .map(([区, 向]) => `${区.id}：界内最利 ${向.最利.toFixed(2)} m，实际走在 ${向.刀口.toFixed(2)} m 的平地上`);
    expect(
      啃牙,
      `这些区明明有玩家一帧吸不下的区缘台阶，跨缘长途却挑了个没刀的方向 ⇒ ①② 对这把刀必然沉默（挑方向不许只挑好走的）：\n${啃牙.join('\n')}`
    ).toEqual([]);
    // 整族的下限（钉种子 7/11 实测 5 个区的选中向 > 上坎；留 3 是给摆件挪窝的余量，不是给"没刀"开的口子）
    const 明细 = 区路线.map(([区, 向]) => `${区.id} 选中 ${向.刀口.toFixed(2)} m / 界内最利 ${向.最利.toFixed(2)} m`).join('\n');
    const 有牙 = 区路线.filter(([, 向]) => 向.刀口 > 上坎).length;
    expect(有牙, `只有 ${有牙} 个区的跨缘长途踩着 > 上坎 ${上坎} m 的改前台阶 ⇒ 整族路线没牙：\n${明细}`).toBeGreaterThanOrEqual(3);

    // B126 那一族的路线：一座足迹一条，从带外走到心。三条各管一头 ——
    // ① 名册与路线数对得上（登记搬家了但路线没跟着搬 ⇒ 这一族对 B126 又变回沉默）；
    // ② 起点必须在**过渡带之外**（带内起手就是只踩了一半带宽）；
    // ③ 中间必须真的落进过占地（`spaceAtWorldPoint` 认出），否则"走进足迹"这条路量的是草地。
    const 路线名 = new Set(路线们.map(([名]) => 名));
    expect(足迹路线.length, '登记在册的室内空间数（名册与路线都从它推出来）').toBe(室内名册.length);
    for (const 条 of 足迹路线) {
      expect(路线名.has(条.名称), `路线里找不到「${条.id}」那一条走进足迹 ⇒ 这一族被静默丢下`).toBe(true);
      const 起手离 = Math.hypot(条.起点.x - 条.心.x, 条.起点.z - 条.心.z);
      expect(起手离, `${条.id} 的起手点离中心 ${起手离.toFixed(1)} 米，还在带宽之内（半径 ${条.间.radius} + 带 ${条.间.rimBand}）`
        + ` ⇒ 这条路线没把整条过渡带踩完`).toBeGreaterThan(条.间.radius + 条.间.rimBand);
      const 踩进 = 条.路线[1].some((点) => 室内.spaceAtWorldPoint(点.x, 点.z)?.space.id === 条.id);
      expect(踩进, `${条.id}：整条路线没有一个点落进它的占地 ⇒ "走进足迹"量的是草地`).toBe(true);
      // 权重那两条端点读数：带外恒 0、腹地恒 1 —— 路线两头各自站在哪一档，看得见的
      expect(条.间.groundWeightAt(条.起点.x, 条.起点.z, 条.载体), `${条.id} 带外那一点的权重`).toBe(0);
      expect(条.间.groundWeightAt(条.心.x, 条.心.z, 条.载体), `${条.id} 腹地那一点的权重`).toBe(1);
    }
  }, 120_000);
});
