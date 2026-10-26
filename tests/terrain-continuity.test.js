/**
 * 地形高度场的**连续性**门禁（缺陷② 切片D）。
 *
 * ## 这条门禁量的是什么
 *
 * 玩家脚下的地面是 `world.getGroundHeight`（= `sampleGlobalHeightSmooth`）的一个**纯函数读数**，
 * 每帧直接赋值给 `position.y`。所以高度场里任何一记瞬时落差都会原样变成玩家的一次**瞬移**：
 * 上坡那帧他被抬进山体里（竖直阻尼 `lerp(y, walkY, 0.88)` 只能逐帧追赶，那几帧他的腿就在石头里），
 * 下坡那帧他悬空。摆件穿模（切片B）与这个同源，但落差不在一个量级 —— 修前实测：
 *
 * | 断点 | 成因 | 实测单步落差 |
 * |---|---|---|
 * | 走廊谷缘 `dist = 0.55×halfWidth` | `corridorRidge` 谷底 -0.8 直接切到肩部曲线 | **2.335 m** |
 * | 各区圆周 `dist = radius` | `BaseZone.getHeightAt` 区外一刀交 `-Infinity`，而各区 `sampleHeight` 到缘只归 **0**，`max` 把整段 `0 − 自然地` 留在圆上 | **13.591 m** @(135,-256) |
 *
 * 两处都在合成层（`TerrainHeight`）修：谷底→肩峰走 smoothstep；区缘把区高按权重收回自然地。
 *
 * ## 判据读的常数全部来自生产，不是我挑的
 *
 * - **取样步长** = `colliderRadius × 0.5` —— 那正是 `moveCircle` 自己细分位移的粒度
 *   （`maxStep = max(0.05, radius*0.5)`）：引擎认为"一帧之内最多这么挪"，落差就按这一格量。
 * - **单步落差上限** = `stepUp` —— 玩家一帧能吸收的高度只有这么多，超出的那部分不是"走上台阶"，
 *   是"从山体里穿过去"。
 * - **扫描线间隔** = `CollisionWorld.cellSize`（16 米）—— 空间哈希一格的边长，读障碍布局用的
 *   同一把尺；两个方向各扫一遍，圆周的切向漏读由"区缘"那一条专门补。
 * - **深腹地的判据** = `ZONE_RIM_TAPER` —— 只比真实带宽（`min(这条, 半径×0.25)`）更宽，
 *   所以落进这一圈的点权重必为 1，读数必须与改前那条 `max` 一字不差。
 * - **走廊名册与半宽** = 从 `CORRIDORS` 表和 `connectionTerrain` 的调用现场解析 ⇒ 加了第六条
 *   走廊、或把半宽改了，横切那条跟着挪刀，不会各切各的。
 *
 * ## 五条腿各咬住一件事
 *
 * ① 全图逐格扫描不许有任何一步超过 `stepUp`；② 每区 64 向跨圆周落差连续；
 * ③ 深腹地读数 == 改前的 `max` 合成式（收口权重不许啃进腹地）；④ 每条走廊横切谷底→带外；
 * ⑤ 玩家读的五抽头与网格读的裸值不许分家。
 *
 * ## 切片E（修 B126）在本片留下的两处口径
 *
 * - **取样必须带室内花名册**（`h` 与 ⑤ 的两侧都是）：这一档现在是场里的一项，少递一份就变成
 *   "玩家其实走不到的那张场"，占地边界那一刀（实测 21~23 米）从尺子上溜走。
 *   两处刻意传 `[]` 的读数是对照侧，不是漏。
 * - **③ 让开过渡带里的点**：室内那一档在区腹地里的读数由另一项改写，不归"区缘收口"这条管
 *   （它由 `tests/interior-ground-field.test.js` 整片钉）。让开带三道自检：整个名册至少真让开过
 *   一个点（否则这道筛选是藏身处）、每个让开的点必须**真的**与改前合成式对不上（不许白让）、
 *   每区仍要有量得到的样本。
 *
 * ## 变异臂（切片D 的落刀记录；与 `player-walk-witness` 那批是同一次跑）
 *
 * | 臂 | 刀 | 预测红 | 实测 | 超出预测的红 ⇒ 归因 |
 * |---|---|---|---|---|
 * | 臂6 | 不落刀 | — | 0 红 | 基线 |
 * | 臂1 | `CORRIDOR_FLOOR_RATIO 0.55 → 1.0` | ①＋②＋④＋⑤ | 4 红，无漏 | 谷底那一刀同时改掉②的走廊叠加分与⑤的抽头差；`terrain-height` 的"走廊中心凹陷"老用例一并红 |
 * | 臂2 | 合成层退回裸 `zh`（区缘收口摘掉） | ①＋②＋⑤ | 3 红，无漏 | ④ 不红是**对的**：那把刀只在区缘，走廊横切量不到 |
 * | 臂3 | 区缘权重取反 | ①＋②＋③＋⑤ | 4 红，无漏 | ③ 是唯一认得"权重方向"的那条；`terrain-height` 的"zone 高度参与取最大值"一并红 |
 * | 臂4 | `stepUp 0.65 → 0.05` | ①＋②＋④＋⑤ | 4 红，无漏 | 尺子来自生产：改小上限 ⇒ 四条腿同时点名，一处都没漏 |
 * | 臂7 | 竖直阻尼 `0.88 → 0.2` | **本门禁 0 红** | 0 红 | 这正是本案存在的理由：高度场一字未改，纯函数整套绿，只有 `PlayerController` 那三步能吃出差别 —— 见 `player-walk-witness` 的臂7 |
 * | 臂5 | 竖直阻尼 `0.88 → 1` | 0 红 | 0 红 | 与臂7 同族：这一向本门禁与见证都量不到，见证那侧把它记成限度 |
 *
 * 切片E（B126）的四刀里，本片吃到的只有臂12 那一刀（整批记录在
 * `tests/interior-ground-field.test.js` 头部那张表）：
 *
 * | 臂 | 刀 | 本片预测红 | 实测 | 归因 |
 * |---|---|---|---|---|
 * | 臂12 | `blendInterior` 不再掺 | 「区缘收口不动腹地」那一条 | 1 红，无漏无超出 | 红在**新加的那道"白让"自检**上：占地仍在认领、地面却不掺了 ⇒ 被让开的深腹地样本与改前合成式一字不差，筛选当场成了藏身处。①②④⑤ 全绿是**对的**：抹掉一项不制造刀，只让两侧一起退 |
 * | 臂11 | 四条过渡带统一砍半 | 0 红 | 0 红 | ① 那把尺沿**轴对齐**的扫描线走，每步吃的是坡度在轴上的投影；带砍半之后最狠的 0.686 米/步在**径向**上 ⇒ 由行走见证（沿半径走进去那条）认。两张尺各走各的方向，这一臂正是它们不重叠的证据 |
 */
import { describe, it, expect } from 'vitest';
import { installWindowShim } from './helpers/enemyHarness.js';
import { buildSeededWorld } from './helpers/seededWorld.js';
import {
  soleNumber, corridorRoster, corridorHalfWidth, playerRadius, playerStepUp,
} from './helpers/productionReadings.js';
import { CollisionWorld } from '../src/engine/Collision.js';
import {
  sampleGlobalHeight, sampleGlobalHeightSmooth, hubPlazaWeight,
} from '../src/world/TerrainHeight.js';

installWindowShim();


/** 生产里的"一步"：玩家碰撞半径的一半（`moveCircle` 的细分粒度），不是测试挑的数 */
const 半径 = playerRadius();
const 步长 = 半径 * 0.5;
/** 一帧能吸收的高度：超出它就是瞬移 */
const 单步上限 = playerStepUp();
/** 扫描线间隔 = 空间哈希一格（`CollisionWorld` 构造期的默认值，读障碍布局用的同一把尺） */
const 线隔 = new CollisionWorld().cellSize;
/** 区缘收口带宽的上限：真实带宽是 `min(这条, 半径×0.25)`，只会更窄，所以按这条判"深腹地"是保守的 */
const 收口带上限 = soleNumber('src/world/TerrainHeight.js', /const ZONE_RIM_TAPER = ([\d.]+);/g, 'ZONE_RIM_TAPER');
/** 谷底边缘占半宽的比例：谷底与肩峰之间那段 smoothstep 的起点由它定 */
const 谷底比例 = soleNumber('src/world/TerrainHeight.js', /const CORRIDOR_FLOOR_RATIO = ([\d.]+);/g, 'CORRIDOR_FLOOR_RATIO');
/** 走廊端点名册与半宽：都从生产读，加了第六条走廊这条自动多切一刀 */
const 走廊们 = corridorRoster();
const 半宽 = corridorHalfWidth();

/** 腹地格：区心 + 八向 0.6×半径（远到能看出权重漏没漏，又近到还在 `radius − 带` 之内） */
const 腹地格 = [[0, 0], ...[45, 90, 135, 180, 225, 270, 315].map((deg) => {
  const a = (deg * Math.PI) / 180;
  return [Math.sin(a) * 0.6, Math.cos(a) * 0.6];
})];

const world = buildSeededWorld(7);
const 区们 = world.zones;
/**
 * 室内花名册（B126）：它现在是这条高度场的一项，所以全图扫描必须带着它 ——
 * 少递一份，这一片量的就是"玩家其实走不到的那张场"，占地边界那一刀（实测 21~23 米）
 * 反而从尺子上溜走。`自然地`（传 `[]` 那两处）刻意不带，那是" overlay 有没有漏"的对照侧。
 */
const 室内 = world.internalSpaceManager;
const h = (x, z) => sampleGlobalHeight(x, z, 区们, 室内);
/** 边界读数：世界包围盒内收一格，免得扫到网格外的假地 */
const 界 = world.bounds;
const 内 = (v, lo, hi) => Math.max(lo + 线隔, Math.min(hi - 线隔, v));

describe('地形高度场连续性（走山不瞬移）', () => {
  it('全图逐格扫描：任意一步的落差不许超过一阶台阶', () => {
    const 坏 = [];
    let 最坏 = 0;
    let 样本 = 0;
    const 记 = (a, b, 标) => {
      样本++;
      const 落 = Math.abs(b - a);
      if (落 > 最坏) 最坏 = 落;
      if (落 > 单步上限) 坏.push(`${标} 单步 ${落.toFixed(3)} m（上限 ${单步上限} m）`);
    };
    for (let x = 内(界.minX, 界.minX, 界.maxX); x <= 内(界.maxX, 界.minX, 界.maxX); x += 线隔) {
      let 前 = h(x, 内(界.minZ, 界.minZ, 界.maxZ));
      for (let z = 内(界.minZ, 界.minZ, 界.maxZ) + 步长; z <= 内(界.maxZ, 界.minZ, 界.maxZ); z += 步长) {
        const 今 = h(x, z);
        记(前, 今, `z向 (${x.toFixed(0)},${z.toFixed(1)})`);
        前 = 今;
      }
    }
    for (let z = 内(界.minZ, 界.minZ, 界.maxZ); z <= 内(界.maxZ, 界.minZ, 界.maxZ); z += 线隔) {
      let 前 = h(内(界.minX, 界.minX, 界.maxX), z);
      for (let x = 内(界.minX, 界.minX, 界.maxX) + 步长; x <= 内(界.maxX, 界.minX, 界.maxX); x += 步长) {
        const 今 = h(x, z);
        记(前, 今, `x向 (${x.toFixed(1)},${z.toFixed(0)})`);
        前 = 今;
      }
    }
    expect(样本, '④ 一格都没扫到 ⇒ 这条在空转').toBeGreaterThan(50000);
    expect(坏.length, `这些步子会把玩家瞬移：\n${坏.slice(0, 10).join('\n')}\n（最坏 ${最坏.toFixed(3)} m）`).toBe(0);
  });

  it('区缘不是悬崖：每区 64 个方向逐向跨缘', () => {
    const 坏 = [];
    for (const zone of 区们) {
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        const dx = Math.cos(a);
        const dz = Math.sin(a);
        const 里 = h(zone.center.x + dx * (zone.radius - 0.25), zone.center.z + dz * (zone.radius - 0.25));
        const 外 = h(zone.center.x + dx * (zone.radius + 0.25), zone.center.z + dz * (zone.radius + 0.25));
        const 落 = Math.abs(里 - 外);
        if (落 > 单步上限) {
          坏.push(`${zone.id} @(${(zone.center.x + dx * zone.radius).toFixed(0)},${(zone.center.z + dz * zone.radius).toFixed(0)}) 跨缘落差 ${落.toFixed(3)} m`);
        }
      }
    }
    expect(坏.length, `这些方向跨区缘=瞬移（区高没收回自然地）：\n${坏.slice(0, 10).join('\n')}`).toBe(0);
  });

  it('区缘收口不动腹地：深腹地的读数仍等于改前那条"取最大值"合成式', () => {
    const 坏 = [];
    const 让开 = [];
    const 每区 = new Map();
    for (const zone of 区们) {
      let 量到 = 0;
      // 区心 + 八向 0.6×半径。只量**深腹地**：到这里连"最保守的带"都还没进，
      // 所以覆盖它的每一座区权重都必须是 1 —— 重叠区（space/gloom 圆心只差 28 米、
      // 半径互相盖死）在"单一所有权"口径下一条都量不到，但这条照样量得到。
      for (const [fx, fz] of 腹地格) {
        const x = zone.center.x + fx * zone.radius;
        const z = zone.center.z + fz * zone.radius;
        const 覆盖 = 区们.filter((o) => Number.isFinite(o.getHeightAt(x, z)));
        const 深 = 覆盖.every((o) => o.distanceToCenter(x, z) < o.radius - 收口带上限);
        if (!深 || 覆盖.length === 0) continue;
        if (hubPlazaWeight(x, z) !== 0) continue; // 广场混合项在取完最大值之后再改写一次，不归这条
        const 自然 = sampleGlobalHeight(x, z, []);
        // 改前那一行：区高直接参与取最大值，没有任何混合。权重若漏进腹地，这里就对不上。
        const 应 = 覆盖.reduce((m, o) => Math.max(m, o.getHeightAt(x, z)), 自然);
        const 实 = h(x, z);
        // **B126 之后这条要避开室内那一档**：过渡带里的点也"深在区腹地"，读数被室内地板按权重
        // 改写，那是另一项自己的口径（由 `tests/interior-ground-field.test.js` 整片管），
        // 不是区缘收口漏进了腹地。但白让不许 —— 让开的每一点都必须真的与改前合成式对不上。
        const 掺 = 室内.groundBlendAt(x, z);
        if (掺) {
          让开.push({ 区: zone.id, x, z, 落: Math.abs(实 - 应), 间: 掺.space.id, 权重: 掺.weight });
          continue;
        }
        量到++;
        if (Math.abs(实 - 应) > 1e-9) {
          坏.push(`${zone.id} @(${x.toFixed(0)},${z.toFixed(0)}) 腹地读数 ${实.toFixed(6)}，改前合成式应是 ${应.toFixed(6)}（自然 ${自然.toFixed(3)}／覆盖 ${覆盖.map((o) => `${o.id}:${o.getHeightAt(x, z).toFixed(3)}`).join(' ')}）`);
        }
      }
      每区.set(zone.id, 量到);
    }
    const 空手 = [...每区].filter(([, n]) => n === 0).map(([id]) => id);
    expect(空手, `这些区一个深腹地样本都没量到 ⇒ 这条对它们等于没跑（收口带涨到吃掉整区也不会红）：${空手.join('、')}`).toEqual([]);
    // 那道让开必须是**有东西可让**的筛选，不是藏身处（跳过清单同族的教训）：
    // 确实有深腹地样本压在过渡带里，才有让开的必要。
    // 搬空了的话这条先红 ⇒ 要么足迹搬出了区心 0.6R 那一圈（那就把这半道筛选删掉，本条不需要它），
    // 要么带宽/归属漂了（那才是真消息）。不许改成"跳过 0 也算绿"。
    expect(
      让开.length,
      `过渡带没吃掉任何一个深腹地样本 ⇒ "让开室内那一档"这道筛选在空转：`
        + `要么四座足迹都搬出了区心 0.6R 那一圈（把这道筛选删掉，不要留着当藏身处），`
        + `要么 groundBlendAt 认不出自己的带了（那是 B126 回来了，去看 interior-ground-field ⑤）`
    ).toBeGreaterThanOrEqual(1);
    const 白让 = 让开.filter((p) => p.落 <= 1e-9)
      .map((p) => `${p.区} @(${p.x.toFixed(0)},${p.z.toFixed(0)}) 由 ${p.间} 掺 ${p.权重.toFixed(4)} ⇒ 读数却没动`);
    expect(白让, `这些点有室内权重却与改前合成式一字不差 ⇒ 让开是白让（这座足迹的地板恰好与室外同高，`
      + `这条筛选对它们无话可说）：\n${白让.join('\n')}`).toEqual([]);
    expect(坏.length, `区缘权重吃进了腹地（权重该在 radius − 带 之内恒为 1；已让开 ${让开.length} 个过渡带里的点）：\n${坏.slice(0, 10).join('\n')}`).toBe(0);
  });

  it('走廊谷缘不成台阶：横切每条走廊，从谷底一直量到带外', () => {
    const 坏 = [];
    const 外 = 半宽 * 2.4; // `dist > halfWidth × 2.2` 之后走廊项恒 0，切到那儿就够
    let 刀口最远 = 0;
    for (const [x1, z1, x2, z2] of 走廊们) {
      const 轴x = x2 - x1;
      const 轴z = z2 - z1;
      const 长 = Math.hypot(轴x, 轴z);
      // 沿轴 40% 处横切：靠枢纽那头 38 米内是广场盘面，混合项会再改写一次，不归这条
      const mx = x1 + 轴x * 0.4;
      const mz = z1 + 轴z * 0.4;
      const px = -轴z / 长; // 垂直于走廊轴
      const pz = 轴x / 长;
      let 前 = null;
      for (let d = -外; d <= 外; d += 步长) {
        const 今 = h(mx + px * d, mz + pz * d);
        if (前 !== null && Math.abs(今 - 前) > 单步上限) {
          坏.push(`走廊 (${x1},${z1})→(${x2},${z2}) 横切 d=${d.toFixed(2)} 单步 ${(今 - 前).toFixed(3)} m @(${(mx + px * d).toFixed(1)},${(mz + pz * d).toFixed(1)})`);
          刀口最远 = Math.max(刀口最远, Math.abs(d));
        }
        前 = 今;
      }
    }
    expect(坏.length, `谷底与肩峰之间还有刀口（最靠轴心的一处距轴 ${刀口最远.toFixed(1)} m，谷底边缘应在 ${半宽 * 谷底比例} m）：\n${坏.slice(0, 8).join('\n')}`).toBe(0);
  });

  it('五抽头读数与裸读数不分家：平滑采样不许造出悬空/陷地', () => {
    const 坏 = [];
    let 最坏 = 0;
    for (let x = -240; x <= 240; x += 6) {
      for (let z = -300; z <= 300; z += 6) {
        const 落 = Math.abs(sampleGlobalHeightSmooth(x, z, 区们, 室内) - h(x, z));
        if (落 > 最坏) 最坏 = 落;
        // 玩家读五抽头、网格读裸值：两者差一阶台阶以上就是"脚离看见了的那块地"
        if (落 > 单步上限) 坏.push(`(${x},${z}) 两把尺差 ${落.toFixed(3)} m`);
      }
    }
    expect(坏.length, `五抽头与裸读数分家（最坏 ${最坏.toFixed(3)} m）：\n${坏.slice(0, 10).join('\n')}`).toBe(0);
  });
});
