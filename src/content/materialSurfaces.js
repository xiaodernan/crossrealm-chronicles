/**
 * 烘焙表面（W-C5）：程序生成、离线烘焙进 `public/textures/` 的贴图**规格表**。
 *
 * ## 为什么是程序生成 + 离线烘焙，而不是又一组 CC0 照片贴图
 *
 * 现有的 5 组 CC0 贴图（Poly Haven）是**照片**：带 CDN 回退、平铺性靠素材本身、
 * 粗糙度是一格常数。给副本墙面这种"大块、平整、室内"的表面用它们有三处不合适：
 * ① 照片的高频细节在 2 米一格的近距离平铺下会看出接缝与重复；
 * ② 离线环境（CI / 无网预览）里 CDN 回退失败就整块没有贴图；
 * ③ 粗糙度的"哪一块更亮"是画出来的，不是算出来的 —— 而石砌表面该有的读数
 * （砖面略光、灰缝更糙）恰好是**几何事实**（离砖缝的距离），适合算。
 *
 * 程序生成的三条好处按重要性排：**确定性**（同一份规格永远产出同一张图，
 * 门禁可以直接重算比对字节）、**可平铺**（所有噪声在环面上取值，没有"照片边缘"）、
 * **零外部素材**（许可、下载、版本漂移全部离场）。
 *
 * ## 谁读这张表
 *
 * - `scripts/bake-textures.mjs`：按它生成 PNG（`npm run bake:textures`）。
 * - `assets/TextureLibrary.js`：按 `files` 拼 URL（`${LOCAL}/${spec.files.normal}`）——
 *   **文件名只有这一份**，谁都不许再抄一遍（抄一份的症状是"贴图 404 而没人报错"）。
 * - `tests/material-surfaces.test.js`：重算比对已提交的字节 + 校验数值区间。
 *
 * ## 为什么冻结
 *
 * 与其余内容表同一条口径：运行期读表、写它当场抛错。烘焙脚本与运行时消费的
 * 是同一份数值，途中被改一格就会让"已提交的 PNG"与"规格"对不上 —— 冻结把
 * 这种改写从"静默漂移"变成"当场炸"。
 */

/** 三层深冻结：表、行、行里嵌套的小表（octaves / bricks / files）都冻上 */
function deepFreeze(obj) {
  Object.freeze(obj);
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  }
  return obj;
}

export const SURFACE_SPECS = deepFreeze({
  /**
   * 石砌（砖石）—— 副本的地面与墙。256² 像素对应**2 米见方**（`tileMeters`），
   * 消费方按表面尺寸算 repeat（`TextureLibrary.uvVariant`），这里不写 repeat。
   *
   * 图案是错缝顺砌：8 行 × 4 列（行与行错半砖），灰缝下凹、砖面各自一个随机高度
   * （同一砖块在环面上的四个角共享同一个 hash，所以平铺时砖块不会被接缝切断）。
   * 在砖面高度上再叠三层高频噪声（16/32/64 格）当石面颗粒。
   */
  masonry: {
    pattern: 'tiled',
    /** 一张贴图铺开的米数 —— repeat = 表面尺寸 / 这个数 */
    tileMeters: 2,
    /** 输出分辨率（正方形） */
    size: 256,
    /** 图案种子：换它 = 换一套砖块排布，其余参数不动 */
    seed: 20261007,
    /** 砖块布局：行数 / 每行整砖数 / 灰缝宽（像素）/ 逐行错缝比例（0 = 对缝大板，0.5 = 错缝顺砌）
     *  / 网格相位（0..1：把块格整体平移这么多格 —— 让灰缝别压在贴图边上，见 slabs） */
    bricks: { rows: 8, cols: 4, mortarPx: 4, stagger: 0.5, phase: 0 },
    /** 砖面颗粒：三层值噪声，lattice 必须整除 size（环面周期），amp 是叠加权重 */
    octaves: [
      { lattice: 16, amp: 0.3 },
      { lattice: 32, amp: 0.18 },
      { lattice: 64, amp: 0.1 },
    ],
    /** 法线强度：高度差 → 切线空间倾角的放大系数（视觉调参格） */
    normalStrength: 2.6,
    /** 粗糙度 = base ± amp 的灰缝/砖面对比 + 一点颗粒。map 是乘性贴图，
     *  消费方把 `material.roughness` 置 1，让这张图成为唯一真源 */
    roughBase: 0.86,
    roughAmp: 0.1,
    /** 输出文件（相对 `public/textures/`）—— 名字只有这一份 */
    files: {
      normal: 'gen/masonry_nor.png',
      roughness: 'gen/masonry_rough.png',
    },
  },

  /**
   * 石板（W-C5 切片2）—— **Boss 场地面**。与石砌同一套"分块 + 灰缝 + 颗粒"机制，
   * 换的是尺子：4 米一铺、2×2 对缝大板（stagger 0），缝更深更粗 —— 远看是几块
   * 整石板而不是小砖。Boss 场的地面是圆盘（`CircleGeometry` 的 UV 是 0..1 跨整个直径），
   * 消费方按**直径 / tileMeters** 算铺数（见 `_buildBossArena`）。
   */
  slabs: {
    pattern: 'tiled',
    tileMeters: 4,
    size: 256,
    seed: 20261008,
    /** phase 0.5：块格平移半格，灰缝落在贴图**内部**（64/192）而不是贴图边上 ——
     *  2×2 的块格若对缝起于 0，贴图左右/上下边就整条压在灰缝上（平铺自检会红：接缝处
     *  每一对采样都跨灰缝底，邻差远大于内部平均）。平移半格后接缝落在整块板面中间。 */
    bricks: { rows: 2, cols: 2, mortarPx: 3, stagger: 0, phase: 0.5 },
    octaves: [
      { lattice: 32, amp: 0.28 },
      { lattice: 64, amp: 0.16 },
    ],
    normalStrength: 2.2,
    roughBase: 0.82,
    roughAmp: 0.12,
    files: {
      normal: 'gen/slabs_nor.png',
      roughness: 'gen/slabs_rough.png',
    },
  },

  /**
   * 木板（W-C5 切片3）—— **副本的门板**（关着的那一块）。同一套"分块 + 缝 + 颗粒"机制，
   * 尺子换成木匠的：2 米一铺、5 块竖板（板宽 0.4 米）。rows = 1 ⇒ 板身整高没有横缝，
   * 只有 phase 0.5 把格线推到铺面中间的那一道**压条**（4.2 米高的门面上落在 1 米与 3 米
   * 两处，像一块板拼门）；板与板的高低差来自 col hash 各自一档，缝因此有可见的深浅。
   * 颗粒（octaves）比石面轻一档 —— 木板是刨过的。粗糙度均值 ≈ 0.84，与门板改前那条
   * 常数 0.85 同档：贴图接管之后，门看起来还是那扇门。
   *
   * 消费方：`ProceduralDungeonGenerator` 的门板（几何走 `uvBox` 以米计 UV ⇒ repeat = 1 / tileMeters）。
   */
  plank: {
    pattern: 'tiled',
    tileMeters: 2,
    size: 256,
    seed: 20261009,
    /** rows = 1（板身整高）、stagger 在单行下不参与（留 0）、phase 0.5（压条落铺面中间） */
    bricks: { rows: 1, cols: 5, mortarPx: 3, stagger: 0, phase: 0.5 },
    octaves: [
      { lattice: 16, amp: 0.22 },
      { lattice: 32, amp: 0.14 },
      { lattice: 64, amp: 0.08 },
    ],
    normalStrength: 2.4,
    roughBase: 0.88,
    roughAmp: 0.12,
    files: {
      normal: 'gen/plank_nor.png',
      roughness: 'gen/plank_rough.png',
    },
  },

  /**
   * 装甲板（W-C5 切片4）—— **敌人身体**（`combat/Enemy.js` 的 mat 系几何：身体胶囊、
   * 盔、翼、肩甲、炮管、撞角）。同一套"分块 + 缝 + 颗粒"机制，尺子换成军械师的：
   * 0.5 米一铺、2×2 错缝板（行错半格互相压边，stagger 0.5）—— 一块板 25 厘米见方，
   * 0.8 米宽的躯体绕一圈约 10 块。缝取细（mortarPx 3），装甲是拼起来的不是砌起来的。
   * phase 0.5 与 slabs 同一条理由：2×2 的格线平移半格后落在铺面内部（128px），
   * 而不是整条压在贴图边上（平铺自检）。
   *
   * 消费方的 UV 以米计（身体走 `makeUvCapsuleGeometry` 按剖面弧长、其余走 uvBox/uvCone），
   * 所以铺数只有一个：`repeat = 1 / tileMeters = 2` —— 体型放大（BODY_PLANS.scale）不会
   * 把板子一起放大。粗糙度均值 ≈ 0.76，与敌人身体改前的常数 0.75 同档：贴图接管之后，
   * 敌人看起来还是那只敌人。
   */
  plate: {
    pattern: 'tiled',
    tileMeters: 0.5,
    size: 256,
    seed: 20261010,
    bricks: { rows: 2, cols: 2, mortarPx: 3, stagger: 0.5, phase: 0.5 },
    octaves: [
      { lattice: 16, amp: 0.18 },
      { lattice: 32, amp: 0.12 },
      { lattice: 64, amp: 0.08 },
    ],
    normalStrength: 2.0,
    roughBase: 0.8,
    roughAmp: 0.13,
    files: {
      normal: 'gen/plate_nor.png',
      roughness: 'gen/plate_rough.png',
    },
  },

  /**
   * 拉丝钢（W-C5 切片5）—— **玩家剑面**（`player/PlayerController.js` 的剑；第三人称本体
   * 与第一人称克隆共用一份材质与几何）。**第一族非分块图案**：拉丝是**一维条纹**而不是
   * 二维格 —— `lines: 128` 条 2 毫米竖纹、`rows: 4` 格沿程漂移（纹路沿刀刃方向跑）。
   * 0.25 米一铺：0.9 米的剑身 3.6 铺。粗糙度均值 ≈ 0.35，与剑改前那条常数同一档；
   * 贴图补的是**法线与粗糙度的方向**（金属拉丝的关键事实），颜色仍归剑自己的材质。
   *
   * 消费方的 UV 以米计（`makeUvBoxGeometry`），铺数只有一个：`repeat = 1 / tileMeters = 4`。
   * 剑是**晚到**的（PlayerController 在贴图库就绪前就可能构造）：拿不到走旧读数，
   * 库落地后补挂 —— 两段都在 `_applySteelSurface` 里。
   */
  steel: {
    pattern: 'brushed',
    tileMeters: 0.25,
    size: 256,
    seed: 20261011,
    /** 拉丝：条纹数（u 向格点，须整除 size —— 否则列边界在环上错位）/ 沿程段数（v 向格点）/ 条纹高度振幅 */
    brushed: { lines: 128, rows: 4, amp: 0.8 },
    /** 金属杂点：比石面轻一档 —— 拉丝是磨出来的，不是砌出来的 */
    octaves: [
      { lattice: 16, amp: 0.12 },
      { lattice: 32, amp: 0.08 },
      { lattice: 64, amp: 0.05 },
    ],
    normalStrength: 2.4,
    roughBase: 0.35,
    roughAmp: 0.12,
    files: {
      normal: 'gen/steel_nor.png',
      roughness: 'gen/steel_rough.png',
    },
  },

  /**
   * 石鼓（W-C5 切片6）—— **区域石构**（`zones/FantasyZone.js` 废墟石柱、
   * `WorldManager` 枢纽地标石柱、`zones/VoidZone.js` 方尖碑柱身）。第四张分块尺：
   * 2 米一铺、2×2 **对缝**（stagger 0 —— 石鼓上下对齐，不像墙砖错缝）、一块 1 米见方；
   * `phase 0.5` 让灰缝落在铺面中间（0.5 / 1.5 / 2.5 米……），柱子的施工缝按米排。
   * 粗糙度均值 ≈0.84，与三处改前常数（废墟 0.9 / 地标与方尖碑 0.85）同档 ——
   * 贴图接管之后，石柱还是那几根石柱；颜色仍归各区域自己的材质。
   *
   * 消费方的 UV 以米计（`engine/uvGeometry.js` 的 `makeUvCylinderGeometry` —— 三处
   * 都是锥台柱，u 按该行自己的周长算），铺数只有一个：`repeat = 1 / tileMeters = 0.5`。
   * 区域工件建在贴图库就绪之前（`WorldManager.build` 同步建区），所以走
   * "先按旧读数建、库到位后统一重贴"（`world/regionSurfaces.js`）。
   */
  drum: {
    pattern: 'tiled',
    tileMeters: 2.0,
    size: 256,
    seed: 20261012,
    bricks: { rows: 2, cols: 2, mortarPx: 4, stagger: 0, phase: 0.5 },
    octaves: [
      { lattice: 16, amp: 0.20 },
      { lattice: 32, amp: 0.12 },
      { lattice: 64, amp: 0.08 },
    ],
    normalStrength: 2.2,
    roughBase: 0.88,
    roughAmp: 0.12,
    files: {
      normal: 'gen/drum_nor.png',
      roughness: 'gen/drum_rough.png',
    },
  },
});

/** 规格表里的表面名清单（消费方与门禁都从这里取，不许各自手抄） */
export const SURFACE_NAMES = Object.freeze(Object.keys(SURFACE_SPECS));

/** 图案族清单（W-C5 切片5）：构建器分派（`scripts/bake-textures.mjs`）与表结构 enum 共用的唯一一份 */
export const SURFACE_PATTERNS = Object.freeze(['tiled', 'brushed']);
