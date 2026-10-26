/**
 * 室内那一档掺进全局高度场（缺陷② 切片E，修 B126）。
 *
 * ## 这一片量的那把刀
 *
 * 室内地板此前是**场之外的一层**：`WorldManager.getGroundHeight` 先读全局场，再问
 * `getInternalHeightAtWorldPoint`，占地里整个换掉、占地外一刀交回室外。四座足迹的落差实测
 * 幽暗神殿 21.09 米、星港瞭望塔 23.36 米（`radiant-starwatch-tower` 的地板在 +24，同一圈的
 * 室外场在 +0.6）—— 玩家跨过去时 `walkY` 一帧跳二十米，竖直阻尼只能把他**从山体里穿上去**，
 * 而看得见的那张地面网格根本不认这一档。这就是"走路穿模"里与摆件无关的最狠一段。
 *
 * 现在它是场里的一项：`TerrainHeight.blendInterior` 按 `InternalSpace.groundWeightAt` 的权重
 * 把 `室外 → 室内地板` 摊成一条 smoothstep 过渡带。于是眼睛（`WorldTerrain` 那一张网格，
 * 按同一条 `sampleGlobalHeight` 采样）与脚（`sampleGlobalHeightSmooth`）读同一个数，
 * 台阶变成坡度；坡度够不够缓，由下面那把从生产推出来的尺说了算。
 *
 * ## 六条腿各自咬住一件事
 *
 * ① **腹地恒 1、带外恒 0**：权重的两个端点行为 —— 占地里场就答那一层地板（一字未改），
 *    带宽之外场就答室外那一份（混合是原子的，不是"差不多"）。
 * ② **带内每一步吸得下**：24 个方向逐条径向线按**生产那一步**（`colliderRadius × 0.5`）
 *    走下来，任何一帧的竖直射不过 `stepUp`。这一条是本案的正面判据，也是刀口所在。
 * ③ **带宽够不够由尺子定**：`rimBand ≥ Δ × 形状导数上限 ÷ 斜率上限`。三个量全来自生产 ——
 *    Δ 从**这条场自己**量，取 24 条径向里最狠的那一条（内端占地缘、外端带外），形状导数上限从
 *    `groundWeightAt` 自己身上采（不抄 smoothstep 的 1.5，改了形状尺子跟着变），步长与上坎取自
 *    `PlayerController`。② 量的是"今天恰好走得动"，这一条量的是"声明本身够不够宽"：把带宽改窄
 *    一半，② 靠逐点走路才认得出（臂11 实测只有瞭望塔红），这一条先把每一座的名字点出来。
 * ④ **两端的接痕不成折线**：带内/带外那两条接缝处的**形状导数**必须趋 0 —— 步长取带宽的
 *    fraction（不是米），所以这一条只问形状、不问宽度：直线退化（`1 - t`）在这里是 1，
 *    smoothstep 是 3δ ≈ 3e-4。否则 ② 走得动、看得见的却是一条棱（与区缘收口、广场裙带同一条形状要求）。
 * ⑤ **反面对照**：把同一批模板的 `rimBand` 归零，同一把尺必须量出刀（否则 ② 的绿是假绿）。
 *
 * ## 归属与地面是两条判据，不许顺手合并
 *
 * 过渡带只搬**地面**：`spaceAtWorldPoint` / `updateCurrent`（雾、层号、室内 HUD）仍按占地半径
 * 认领。带宽比半径宽（神殿 12 米占地配 22 米带），要是归属跟着带宽走，玩家站在厅外十米就
 * 还在室内雾里 —— 那条契约由 `tests/zone-internal-ownership.test.js` ④ 钉着，这里只加一条
 * 半径与带宽的关系判据（⑥）。
 *
 * ## 切片E 的落刀记录（臂号接在 `world-terrain-ground-align` 那批 1–8 之后）
 *
 * 每臂都跑**全量** 4741 例（不是只跑本片那七个文件）：漏到别的门禁里的红也是红。
 * 跑法 `.tmp-b126/arms-b126.mjs`，还原用备份字节，不用 `git checkout --`。
 *
 * | 臂 | 刀 | 预测红 | 实测 | 归因 |
 * |---|---|---|---|---|
 * | — | 不落刀 | — | 0 红（287 文件 / 4741 例全绿） | 基线 |
 * | 臂9 | 登记与问手挪到 `worldTerrain.build()` **之后** | world-terrain ①②④ | 3 红，无漏无超出 | 本门禁一次不红是**对的**：它问的是建好之后的那条场，此时花名册已经挂上 —— 顺序这一刀只有"把顶点存下来"的那张皮认得出 |
 * | 臂10 | `WorldTerrain.heightAt` 少递花名册 | world-terrain ①②④ | 3 红，无漏无超出 | 与臂9 落在同一组红、成因不同：臂9 是**建的时候还没有**，臂10 是**问的时候不递**。④ 那句"登记排在 build 之前"单独由臂9 证，两条合起来才把"眼睛与脚同一张场"钉死 |
 * | 臂11 | 四条过渡带统一砍半 | 本门禁 ②③ ＋见证 ② ＋world-terrain ② | 4 红，无漏无超出 | **修前这两处口径不对，是这一臂教出来的**：③ 只按圆心量 Δ ⇒ 瞭望塔砍到 12 米仍绿（实测最坏 0.686 米，只有 ② 认得出）；④ 的 δ 按**米**取 ⇒ 带宽砍半把 smoothstep 自己判成折线（树洞接缝 0.0019 每米）。改成 ③ 取 24 条径向里最狠的 Δ、④ 的 δ 取带宽的 fraction ⇒ 宽度归 ③、形状归 ④，两把尺不再重叠 |
 * | 臂12 | `blendInterior` 不再掺（室内退回"场之外另一层"，占地仍认领） | 本门禁 ①⑤ ＋world-terrain ④ ＋内部高度 ②②④ ＋归属 ①②③⑤⑤ ＋连续性 ③ | 12 红，无漏 | ③ 不红是**对的**：Δ 从**这条场自己**量，抹掉室内之后剩下的自然地差本身就 > 0 ⇒ 带宽尺对"没有这一档"无话可说；那一档有没有活着由 ①（腹地精确答地板）与 ⑤（带宽归零必须量出刀）认。**连续性 ③ 的红是新加的那道"白让"自检挣来的**：占地仍在认领、地面却不掺了，被让开的那几点与改前合成式一字不差 ⇒ 筛选当场变成藏身处被点名 |
 * | 臂13 | smoothstep 退成直线（`1 - t`） | 只有本门禁 ④ | 1 红，无漏无超出 | 直线两端导数是 1，而带宽与坡度都还够 ⇒ ②③ 全绿：只有形状尺认得出这道折线。②③④ 是三条互不重叠的尺，这一臂是它们分家的证据 |
 */
import { describe, it, expect } from 'vitest';
import { installWindowShim } from './helpers/enemyHarness.js';
import { buildSeededWorld } from './helpers/seededWorld.js';
import { playerRadius, playerStepUp } from './helpers/productionReadings.js';
import { sampleGlobalHeight, HUB_PLAZA } from '../src/world/TerrainHeight.js';
import { InternalSpaceManager, InternalSpaceTemplates } from '../src/world/InternalSpace.js';

installWindowShim();

const 上坎 = playerStepUp();
/** 生产里的一步：`moveCircle` 的细分粒度，与连续性门禁、行走见证同一把尺 */
const 步长 = playerRadius() * 0.5;

const world = buildSeededWorld(7);
const 区表 = world.zones;
const 名册 = [...world.internalSpaceManager.spacesByZone.entries()]
  .flatMap(([zoneId, 间们]) => 间们.map((间) => ({ zoneId, 间 })));

/** 这座空间在生产里真正拿到的区中心（问手递进来的那一份） */
const 载体 = (zoneId) => {
  const 区 = 区表.find((z) => z.id === zoneId);
  expect(区, `${zoneId} 在区表里找不到 ⇒ 问手给不出中心`).toBeTruthy();
  return 区.center;
};

/**
 * 形状自己的最大导数（以"带宽的 fraction"为单位）：直接对 `groundWeightAt` 采一条弦。
 * 不抄 1.5 —— 抄来的数是"我以为的形状"，采出来的是生产里那条式子。
 */
function 形状导数上限() {
  const 间 = 名册[0].间;
  const 心 = 载体(名册[0].zoneId);
  const wc = 间.getWorldCenter(心);
  const 起 = 间.radius, 止 = 间.radius + 间.rimBand;
  const n = 2000;
  let 最大 = 0;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const w0 = 间.groundWeightAt(wc.x + (起 + t0 * (止 - 起)), wc.z, 心);
    const w1 = 间.groundWeightAt(wc.x + (起 + t1 * (止 - 起)), wc.z, 心);
    const 斜 = Math.abs(w0 - w1) / (t1 - t0);
    if (斜 > 最大) 最大 = 斜;
  }
  expect(最大, '从 groundWeightAt 采出来的最大斜率是 0 ⇒ 这条过渡根本不存在').toBeGreaterThan(0.5);
  return 最大;
}

/**
 * 一座足迹的"最狠单步落差"：24 个方向各按 步长 从带外走到腹地，比相邻两点的生产读数。
 * 走的是 `world.getGroundHeight` 那条**出口**（五抽头那份），不是本案重抄的合成式。
 */
function 径向走一圈(间, 心, 采样 = 步长) {
  const wc = 间.getWorldCenter(心);
  const 外 = 间.radius + 间.rimBand + 2;
  let 最坏 = 0, 坏点 = null, 超线 = 0, 步数 = 0;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    let 前 = null;
    for (let d = 外; d >= 0.5; d -= 采样) {
      const p = { x: wc.x + Math.cos(a) * d, z: wc.z + Math.sin(a) * d };
      const 今 = world.getGroundHeight(p.x, p.z);
      if (前 !== null) {
        步数++;
        const 落 = Math.abs(今 - 前.h);
        if (落 > 最坏) { 最坏 = 落; 坏点 = { ...p, 落 }; }
        if (落 > 上坎) 超线++;
      }
      前 = { h: 今 };
    }
  }
  return { 最坏, 坏点, 超线, 步数 };
}

describe('室内那一档掺进全局高度场（腹地恒 1 / 过渡带 / 眼睛与脚同一张场）', () => {
  it('① 名册非空；腹地答那一层地板（精确），带外答室外那一份（精确）', () => {
    expect(名册.length, '四座室内空间都要登记进真世界').toBeGreaterThanOrEqual(4);
    for (const { zoneId, 间 } of 名册) {
      const 心 = 载体(zoneId);
      const wc = 间.getWorldCenter(心);
      // 腹地：权重恒 1 ⇒ 混合是原子的，场就答那一层地板
      expect(间.groundWeightAt(wc.x, wc.z, 心), `${间.id} 腹地的权重`).toBe(1);
      expect(sampleGlobalHeight(wc.x, wc.z, 区表, world.internalSpaceManager), `${间.id} 腹地读数`)
        .toBeCloseTo(间.getInternalHeightAt(wc.x, wc.z, 心), 9);
      // 带外：权重恒 0 ⇒ 与"根本没登记过室内"的那一份一字不差
      const 外 = { x: wc.x + 间.radius + 间.rimBand + 2, z: wc.z };
      expect(间.groundWeightAt(外.x, 外.z, 心), `${间.id} 带外的权重`).toBe(0);
      expect(sampleGlobalHeight(外.x, 外.z, 区表, world.internalSpaceManager), `${间.id} 带外读数`)
        .toBe(sampleGlobalHeight(外.x, 外.z, 区表));
    }
  });

  it('② 带内每一步吸得下：24 向逐条径向线按生产那一步走，不许一帧射过一阶上坎', () => {
    const 坏 = [];
    let 总步 = 0, 全局最坏 = 0;
    for (const { zoneId, 间 } of 名册) {
      const r = 径向走一圈(间, 载体(zoneId));
      总步 += r.步数;
      if (r.最坏 > 全局最坏) 全局最坏 = r.最坏;
      if (r.超线 > 0) {
        坏.push(`${间.id}：${r.超线}/${r.步数} 步超过上坎 ${上坎} 米，最坏 ${r.最坏.toFixed(3)} 米 `
          + `@(${r.坏点.x.toFixed(1)},${r.坏点.z.toFixed(1)}) —— 占地半径 ${间.radius}、带宽 ${间.rimBand}`);
      }
    }
    expect(总步, `整族径向只走了 ${总步} 步 ⇒ 采样退化，这条等于没跑`).toBeGreaterThanOrEqual(4 * 24 * 20);
    expect(坏, `跨进室内足迹的那一步吸不下（B126 那一刀回来了）：\n${坏.join('\n')}`).toEqual([]);
  }, 120_000);

  it('③ 带宽够不够由尺子定：rimBand ≥ Δ × 形状导数上限 ÷ 斜率上限', () => {
    const 斜率上限 = 上坎 / 步长;
    const 形状 = 形状导数上限();
    for (const { zoneId, 间 } of 名册) {
      const 心 = 载体(zoneId);
      const wc = 间.getWorldCenter(心);
      // Δ 取 **24 条径向里最狠的那一条**：内端落在占地缘（权重恒 1 ⇒ 场答那一层地板），
      // 外端落在带外（权重恒 0 ⇒ 场答室外）。不许只在圆心上量 —— 地板自己带坡
      // （神殿"中心凹陷 2 米"、瞭望塔隆在中央），心上那一份 Δ 只是平均数，
      // 而过渡带要摊平的是最陡那一圈；按心量会把尺子放软，带宽砍半也量不出来（臂11 实测）。
      let Δ = 0;
      let 最狠 = 0;
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const dx = Math.cos(a);
        const dz = Math.sin(a);
        const 内 = world.getGroundHeight(wc.x + dx * 间.radius, wc.z + dz * 间.radius);
        const 外 = world.getGroundHeight(
          wc.x + dx * (间.radius + 间.rimBand + 2),
          wc.z + dz * (间.radius + 间.rimBand + 2),
        );
        const 落 = Math.abs(外 - 内);
        if (落 > Δ) { Δ = 落; 最狠 = a; }
      }
      // 形状最大斜率（每单位带宽 fraction 收掉多少权重）÷ 带宽 = 每米收掉多少；
      // 乘以 Δ 与一步的长度就是这一步吃进的落差上限。解出来 ⇒ 带宽下限。
      const 下限 = Δ * 形状 / 斜率上限;
      expect(间.rimBand, `${间.id}：最狠一条径向（${(最狠 * 180 / Math.PI).toFixed(0)}°）落差 Δ=${Δ.toFixed(2)} 米、`
        + `形状导数上限 ${形状.toFixed(2)}、斜率上限 ${斜率上限.toFixed(3)} ⇒ 过渡带至少要 ${下限.toFixed(2)} 米宽，`
        + `声明的是 ${间.rimBand} 米（占地半径 ${间.radius}）。带宽改窄 ⇒ 跨进去的那一帧吸不下，就是 B126 那一刀`)
        .toBeGreaterThanOrEqual(下限);
      // 下限不许是 0：Δ=0 的足迹这条尺整体是哑的
      expect(下限, `${间.id} 的带宽下限算出来是 ${下限} ⇒ 这座足迹根本没有落差，这条尺对它无话可说`)
        .toBeGreaterThan(0);
    }
  });

  it('④ 两端的接痕不成折线：带内外的两条接缝处形状导数趋 0', () => {
    // 单位是**带宽的 fraction**，不是米：这一步取带宽的万分之一。按米取步长的话，
    // 量出来的斜率里混着 `δ/带宽` 这一项 —— 带宽砍半就把它自己判成折线（臂11 实测红在这一条），
    // 可"宽度够不够"是 ③ 的活。这里只问形状：直线两端导数是 1，smoothstep 两端是 3δ ≈ 3e-4。
    const δ = 1e-4;
    for (const { zoneId, 间 } of 名册) {
      const 心 = 载体(zoneId);
      const wc = 间.getWorldCenter(心);
      const 沿 = (t) => 间.groundWeightAt(wc.x + (间.radius + t * 间.rimBand), wc.z, 心);
      // 内缘：刚出占地时权重几乎不动（否则平台边缘是一道棱）
      const 内缘斜率 = Math.abs(1 - 沿(δ)) / δ;
      expect(内缘斜率, `${间.id} 内缘（r=${间.radius}）的接缝斜率 ${内缘斜率.toFixed(6)} 每单位带宽不为 0 `
        + `⇒ 平台边沿成棱 ⇒ smoothstep 的两端导数没接上（直线退化的话这里是 1）`).toBeLessThan(1e-2);
      // 外缘：带宽尽头权重已经贴着 0 落地（否则带外第一米还有一道坎）
      const 外缘斜率 = Math.abs(沿(1 - δ)) / δ;
      expect(外缘斜率, `${间.id} 外缘（r+band=${(间.radius + 间.rimBand).toFixed(1)}）的接缝斜率 `
        + `${外缘斜率.toFixed(6)} 每单位带宽不为 0 ⇒ 过渡带尽头是一道折线`).toBeLessThan(1e-2);
    }
  });

  it('⑤ 反面对照：同一批模板把带宽归零，同一把尺必须量出刀', () => {
    const 管理器 = new InternalSpaceManager();
    管理器.attachZoneCenterResolver((id) => 区表.find((z) => z.id === id)?.center ?? null);
    for (const 造 of Object.values(InternalSpaceTemplates)) 管理器.register(造({ x: 0, y: 0, z: 0 }));
    for (const [, 间们] of 管理器.spacesByZone) for (const 间 of 间们) 间.rimBand = 0;

    const 刀 = [];
    for (const [zoneId, 间们] of 管理器.spacesByZone) {
      const 心 = 载体(zoneId);
      for (const 间 of 间们) {
        const wc = 间.getWorldCenter(心);
        const 里 = sampleGlobalHeight(wc.x + 间.radius - 0.5, wc.z, 区表, 管理器);
        const 外 = sampleGlobalHeight(wc.x + 间.radius + 0.5, wc.z, 区表, 管理器);
        刀.push({ id: 间.id, 落: Math.abs(外 - 里) });
      }
    }
    expect(刀.length, '反向对照那批模板一座都没建出来').toBeGreaterThanOrEqual(4);
    const 有刀 = 刀.filter((d) => d.落 > 上坎);
    expect(有刀.length, `带宽归零之后每一座都只剩 ${(Math.max(...刀.map((d) => d.落))).toFixed(3)} 米的落差 ⇒ `
      + `② 的绿不是"恰好有刀"撞上的：${刀.map((d) => `${d.id} ${d.落.toFixed(2)}`).join('，')}`)
      .toBeGreaterThanOrEqual(3);
  });

  it('⑥ 带宽只搬地面，不搬归属：占地认领仍按半径，且带宽不把别座足迹罩进去', () => {
    for (const { zoneId, 间 } of 名册) {
      const 心 = 载体(zoneId);
      expect(间.rimBand, `${间.id} 的带宽应当**宽到**能摊平落差（比占地半径还窄的话先看 ③ 的尺）`)
        .toBeGreaterThan(0);
      // 归属按占地：带宽之内、占地之外那一点**不算**进了这座空间
      const 带内 = 间.getWorldCenter(心);
      const 点 = { x: 带内.x + 间.radius + Math.min(间.rimBand, 5) / 2, z: 带内.z };
      expect(world.internalSpaceManager.spaceAtWorldPoint(点.x, 点.z)?.space.id,
        `${间.id}：带外 ${((间.radius + Math.min(间.rimBand, 5) / 2)).toFixed(1)} 米这一点被归属认成了室内 `
        + '⇒ 归属跟着带宽走了（雾、层号会盖到室外草地上）').not.toBe(间.id);
    }
    // 两两分离按**带外圆**算：两条过渡带不许交叠，否则交叠那一圈的高是谁的说不清
    const 最紧 = { 比: Infinity, 对: '—' };
    for (let i = 0; i < 名册.length; i++) {
      for (let j = i + 1; j < 名册.length; j++) {
        const a = 名册[i], b = 名册[j];
        const pa = a.间.getWorldCenter(载体(a.zoneId));
        const pb = b.间.getWorldCenter(载体(b.zoneId));
        const 距 = Math.hypot(pa.x - pb.x, pa.z - pb.z);
        const 和 = (a.间.radius + a.间.rimBand) + (b.间.radius + b.间.rimBand);
        if (距 - 和 < 最紧.比) { 最紧.比 = 距 - 和; 最紧.对 = `${a.间.id} × ${b.间.id}`; }
      }
    }
    expect(最紧.比, `两条过渡带的外圆相交（最紧的一对余 ${最紧.比.toFixed(1)} 米：${最紧.对}）`
      + ' ⇒ 交叠那一圈的权重取谁的、混合会不会互相抵消都没定义').toBeGreaterThan(0);
    // 也不许蹭到枢纽广场那条裙带：广场上那张盘是整平的，带压上去就是两个口径抢同一块地
    for (const { zoneId, 间 } of 名册) {
      const wc = 间.getWorldCenter(载体(zoneId));
      const 到盘外缘 = Math.hypot(wc.x - HUB_PLAZA.x, wc.z - HUB_PLAZA.z) - (间.radius + 间.rimBand);
      expect(到盘外缘, `${间.id} 的过渡带外圆离广场裙带外缘只余 ${到盘外缘.toFixed(1)} 米 ⇒ 抢地`).toBeGreaterThan(0);
    }
  });
});
