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
});

/** 规格表里的表面名清单（消费方与门禁都从这里取，不许各自手抄） */
export const SURFACE_NAMES = Object.freeze(Object.keys(SURFACE_SPECS));
