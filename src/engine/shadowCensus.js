/**
 * 阴影趟普查（W-C2 切片10，B151）—— 把"阴影那一趟画了哪些件"从**减法**换成**直接数出来的东西**。
 *
 * ## 这一片补的是哪个洞
 *
 * perf 腿的阴影列是减出来的：`阴影 = 整帧 − 本体`，而两趟之间隔着一次 `update()`
 * （口径，见 `scripts/perf-smoke.mjs` 里的 `一趟()`）。减法只要求"这两趟之间，除了阴影趟本身
 * 什么都没变"，这句话在游戏里**不成立**：敌人每帧在走，主趟的视锥剔除集合跟着变。
 *
 * 两件事都是这么来的：
 * - **B151**（上限表里 magic 阴影 50 对当日一次读数 72）：钉上世界种子之后同一配方五轮全读
 *   **39**，只有那一次读到 72 —— 整帧 584 / **本体 512**，比同日的 550 少 38 件。少的是本体趟，
 *   不是阴影趟。那一格上限本来就是 39 × 1.15 上取整到 10 = **50**，规则没算错，错的是"减法当测量"。
 * - **2026-10-29 的八站普查**（`.tmp-20261029-b151/all8.log`）：七站"数出来的"与"减出来的"逐格相等，
 *   幽暗站数出来 66、减出来 70 —— 差的 4 个 call 在本体趟少画的 4 件上。
 *
 * 所以这里**不放容差**（容差会变成下一次红之后被放宽的那个数），而是另数一遍，并且把减法也重做
 * 一次到可比的状态：**同一份世界状态下、中间不 `update()`** 的那一对趟。
 * `数出来的 == 冻结减出来的` 是一条零容差、不抖的对账（模型与真渲染必须给出同一个数）；
 * 而 `冻结减出来的 != 报告减出来的` 不是错误，是**这一列的抖动被打印出来**的唯一机会。
 *
 * ## 复刻的是哪几条规则（对着 `node_modules/three` 的 r172 源码逐行抄）
 *
 * 阴影趟的**走法**在 `three.module.js`（`WebGLShadowMap`），**平面与包围球的数学**在 `three.core.js`
 * （`Frustum` / `Plane` / `Sphere`）—— 两处都有单测钉住原文，升级改哪一头都会红一次。
 *
 * 1. **`WebGLShadowMap.render` 8445-8540**：逐光源一次阴影趟；
 *    `shadow.autoUpdate === false && shadow.needsUpdate === false` 的光源**整趟跳过**（8457），
 *    `shadow.getViewportCount()` 面（方向光/聚光 = 1，点光 = 6 —— 点光六面各换一个阴影相机，
 *    本模型只看得到当前那一面 ⇒ 不覆盖，点名拒绝）。
 * 2. **`renderObject` 8678-8686**：`object.visible === false` **先 return 再递归** ——
 *    不可见父件底下的子树整个不进阴影趟（这是"剪枝递归"，不是 `scene.traverse`；
 *    用 traverse + 逐件 visible 会**多数**，2026-10-29 第一版就是这么预测出 47 对实测 39 的）。
 *    层的测试用**主相机**的 `camera.layers`（8682 的 `camera` 是 `render(scene, camera)` 传进来的
 *    那只，不是阴影相机），层不过的件不画但**照样往下递归**。
 * 3. **8686 的第二个与式**：`(castShadow || (receiveShadow && type === VSM)) && (!frustumCulled || 相交)`
 *    —— 非 VSM 只有 `castShadow` 进阴影趟；`frustumCulled` 是 **falsy 就不剔**（`undefined` 也不剔）。
 * 4. **8693-8726**：多材质 ⇒ 每个 `geometry.groups` 里"材质存在且 visible"的一组一笔；
 *    单材质 ⇒ `material.visible` 为真才有一笔。
 * 5. **`Frustum.setFromProjectionMatrix`** 的六面平面取法与顺序（`three.core.js:15440-15448`）、
 *    `Plane.normalize()` 的"长度 0 不除"（同文件 978-980），以及 **`Sphere.applyMatrix4`**
 *    （同文件 5397-5404：心走透视除法、半径乘 `getMaxScaleOnAxis()`，**半径不除 w**）。
 *
 * ## 为什么住在这里（零依赖）
 *
 * 这把尺有两个读者：页面里（`perf-smoke` 在渲染完的那一帧调它，`await import('/src/engine/shadowCensus.js')`）
 * 与 node 里（`tests/perf-shadow-census.test.js` 拿 three 自己的 `Frustum` / `Sphere` 造场景对账）。
 * 所以它不许 import 任何东西：鸭子类型读 `matrixWorld.elements` / `geometry.boundingSphere` 这些字段，
 * 读不到就**拒绝**而不是猜。判定（"什么算不合格的一轮"）在 `scripts/harness-readings.mjs`，
 * 与 `draw读数问题` 同一条纪律 —— 这里只负责量，不负责红。
 */

/** 与 three 的三个常量同值（`three.core.js:14-17`）—— 这里不 import three，所以要写死并钉住 */
export const SHADOW_MAP_TYPES = Object.freeze({
  BASIC: 0,
  PCF: 1,
  PCF_SOFT: 2,
  VSM: 3,
});

/**
 * 本模型覆盖到的 `shadowMap.type`。VSM 不在里面：它的阴影趟除了 castShadow 还要画
 * `receiveShadow` 的件（8686），收尾还多两次全屏模糊趟（8532 的 `VSMPass`），
 * 而且 8644 那条 `result.side` 取法也不一样 —— 少复刻一条，榜就是错的。
 */
const 支持的类型 = new Set([
  SHADOW_MAP_TYPES.BASIC,
  SHADOW_MAP_TYPES.PCF,
  SHADOW_MAP_TYPES.PCF_SOFT,
]);

/** `Layers.test`：掩码按位与。读不到 mask 当成 1（three 的默认值），不是当成"全过" */
const 层过 = (件, 相机) => (((件?.layers?.mask ?? 1) & (相机?.layers?.mask ?? 1)) !== 0);

/** 4×4 列主序相乘，与 `Matrix4.multiplyMatrices(a, b)` 同式（`a × b`，不是 `b × a`） */
export function 矩阵乘(a, b) {
  const 出 = new Array(16);
  for (let 列 = 0; 列 < 4; 列 += 1) {
    for (let 行 = 0; 行 < 4; 行 += 1) {
      出[列 * 4 + 行] = a[行] * b[列 * 4] + a[4 + 行] * b[列 * 4 + 1]
        + a[8 + 行] * b[列 * 4 + 2] + a[12 + 行] * b[列 * 4 + 3];
    }
  }
  return 出;
}

/**
 * 阴影框的六个面：与 `Frustum.setFromProjectionMatrix(投影 × 逆视图)` 同式。
 *
 * 平面的**顺序**照 r172 的取法（`three.core.js:15440-15448`：左、右、上、下、近、远），
 * 顺序本身不影响"在不在框内"（六个半空间取交集），但它影响**对账**：单测是逐面比到 1e-9 的，
 * 顺序一变，那条对账就红 —— 红了才知道 three 动过这里，比榜悄悄少一簇件好。
 *
 * 归一化照 `Plane.normalize()`：除以法线长度，`d` 一起除；**长度为 0 时不除**（`|| 1`，
 * three 978-980）。少除那一步会把"框边界"变成随矩阵缩放的东西。
 */
export function 阴影框平面(投影列, 逆视图列) {
  const m = 矩阵乘(投影列, 逆视图列);
  const 面 = (a, b, c, d) => {
    const 长 = Math.hypot(a, b, c);
    const 除 = 长 || 1;
    return [a / 除, b / 除, c / 除, d / 除];
  };
  return [
    面(m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]),
    面(m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]),
    面(m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]),
    面(m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]),
    面(m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]),
    面(m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]),
  ];
}

/**
 * 件的世界包围球，与 `Frustum.intersectsObject` 拿球的方式同式：
 * 有 `object.boundingSphere` 属性（`InstancedMesh` / `BatchedMesh`）就用它，否则用
 * `geometry.boundingSphere`；两者为 null 时 three 会先 `computeBoundingSphere()`。
 *
 * 半径乘的是 `getMaxScaleOnAxis()`（三个轴向量的**长度取最大**），**不除 w**；
 * 心要走透视除法。把半径也除以 w 是 2026-10-29 第一版写错的那一步。
 */
export function 世界包围球(件) {
  let 球 = null;
  if (件.boundingSphere !== undefined) {
    if (!件.boundingSphere) {
      if (typeof 件.computeBoundingSphere !== 'function') return null;
      件.computeBoundingSphere();
    }
    球 = 件.boundingSphere;
  } else {
    const 几何 = 件.geometry;
    if (!几何) return null;
    if (!几何.boundingSphere) {
      if (typeof 几何.computeBoundingSphere !== 'function') return null;
      几何.computeBoundingSphere();
    }
    球 = 几何.boundingSphere;
  }
  if (!球 || !球.center || !(球.radius >= 0)) return null;
  const e = 件.matrixWorld?.elements;
  if (!e || e.length !== 16) return null;
  const c = 球.center;
  const w = (e[3] * c.x + e[7] * c.y + e[11] * c.z + e[15]) || 1;
  const 轴长 = (i) => Math.hypot(e[i], e[i + 1], e[i + 2]);
  return {
    x: (e[0] * c.x + e[4] * c.y + e[8] * c.z + e[12]) / w,
    y: (e[1] * c.x + e[5] * c.y + e[9] * c.z + e[13]) / w,
    z: (e[2] * c.x + e[6] * c.y + e[10] * c.z + e[14]) / w,
    r: 球.radius * Math.max(轴长(0), 轴长(4), 轴长(8)),
  };
}

/** `Frustum.intersectsSphere`：六个面都在半径外才算相交（`>= -r`，边界算进框） */
export function 球在框内(面组, 球) {
  for (const p of 面组) {
    if (p[0] * 球.x + p[1] * 球.y + p[2] * 球.z + p[3] < -球.r) return false;
  }
  return true;
}

/** 一件画几笔：多材质按 groups 逐组成一笔（材质缺位或 `visible` 为假的组不画） */
export function 件的阴影笔数(件) {
  const 材 = 件.material;
  if (Array.isArray(材)) {
    const 组 = 件.geometry?.groups;
    if (!组) return 0;
    let 笔 = 0;
    for (let i = 0; i < 组.length; i += 1) {
      const 分材 = 材[组[i].materialIndex];
      if (分材 && 分材.visible) 笔 += 1;
    }
    return 笔;
  }
  return (材 && 材.visible) ? 1 : 0;
}

/**
 * 归属标签：`挂在 scene 哪棵子树下 / 这一件叫什么〔实例批〕`。
 *
 * 名字往上是**就近**找的（自己没名就看父链上最近有名的），因为 GLB 落地时命名常常在中间那层；
 * 但**顶层那个名字不重复计入**（`WorldDecorations / WorldDecorations` 是噪声，不是信息 ——
 * 一族里认不出某一件就说认不出，这正是 magic 站那 23 笔要露出来的样子）。
 * 全都没名 ⇒ `(无名)` —— 它自己就是一条待查线索（2026-10-29 magic 站有 23 笔挂在这上头）。
 */
export function 归属标签(件, 场景) {
  let 顶 = null, 名 = null, p = 件;
  while (p) {
    if (顶 === null && p.parent === 场景) 顶 = p;
    if (名 === null && p !== 件 && p !== 顶 && p.name) 名 = p.name;
    p = p.parent;
  }
  return `${(顶 && 顶.name) || '(直属scene)'} / ${件.name || 名 || '(无名)'}${件.isInstancedMesh ? '〔实例批〕' : ''}`;
}

/**
 * 一次剪枝递归，走法与 `WebGLShadowMap.renderObject`（8678）逐行同形：
 * `visible === false` 立刻 return（子树整个不算），层不过只跳过"画"这一步、照样递归。
 *
 * `收` 决定这一件要不要计：阴影趟用 `castShadow`，收集光源用 `isLight`。
 */
function 剪枝下钻(根, 收, 上下) {
  if (根.visible === false) return;
  if (层过(根, 上下.相机)) 收(根, 上下);
  const 子 = 根.children;
  if (子) for (let i = 0; i < 子.length; i += 1) 剪枝下钻(子[i], 收, 上下);
}

/** 收集**这一帧真的会进阴影趟**的光源：与 `projectObject` 的可见/层规则同形（不可见父件底下的光不算） */
function 收集投影光源(场景, 相机) {
  const 光 = [];
  剪枝下钻(场景, (o, 上下) => {
    // three 16013-16019：光要在主相机的层上（`layers.test`）才被收进阴影光源名册，
    // 收进去的条件是 `castShadow` **为真**（不是 === true）—— 这里跟着用真值判断，
    // 将来谁把 castShadow 写成 1，模型不会悄悄把它当成"没有这盏灯"。
    if (o.isLight && o.castShadow && o.shadow && 层过(o, 上下.相机)) 光.push(o);
  }, { 相机 });
  return 光;
}

/**
 * 数一遍：这一帧阴影趟该画几笔、是哪些件。
 *
 * 返回的键是中文读数键（与 `draw读数问题` 收的那三列同一形状）：
 * `{ 预测, 框内件数, 可投件数, 榜, 光源, 问题 }`。
 * `问题` 非空 = **这把尺自己没量到**（类型不覆盖、点光六面、读不到阴影相机……），
 * 由 `scripts/harness-readings.mjs` 决定怎么红；这里不返回"猜出来的数"。
 */
export function 阴影件普查(场景, 相机, 渲染器) {
  const 问题 = [];
  const 出 = { 预测: 0, 框内件数: 0, 可投件数: 0, 榜: [], 光源: [], 问题 };
  if (!场景 || typeof 场景 !== 'object') {
    问题.push('普查没拿到场景');
    return 出;
  }
  const 阴影设置 = 渲染器?.shadowMap;
  if (!阴影设置) {
    问题.push('普查没拿到 renderer.shadowMap');
    return 出;
  }
  const 类型 = 阴影设置.type;
  if (!支持的类型.has(类型)) {
    问题.push(`shadowMap.type = ${String(类型)} 不在本模型覆盖内（0/1/2 = Basic/PCF/PCFSoft 覆盖，3 = VSM 不覆盖：它还要画 receiveShadow 件与两次全屏模糊趟）`);
    return 出; // 不再往下走：明知规则少复刻一条还数出来的榜，比没有榜更坏
  }
  if (阴影设置.enabled !== true) {
    问题.push(`shadowMap.enabled = ${String(阴影设置.enabled)} —— 阴影趟根本不发，这一趟没有东西可数（普查要在拧着"开"的那一帧做，否则 0 == 0 是空对空）`);
    return 出;
  }
  if (阴影设置.autoUpdate === false && 阴影设置.needsUpdate === false) {
    问题.push('shadowMap.autoUpdate === false 且 needsUpdate === false —— 这一帧不重画阴影图（three 8422 直接 return），减出来的那一列量的是空气');
    return 出;
  }

  const 光源列表 = 收集投影光源(场景, 相机);
  if (光源列表.length === 0) {
    问题.push('这一帧没有任何 castShadow 的光源 —— 阴影趟本该一笔不画，那"阴影列"就不是阴影列');
  }
  const 计数 = new Map();
  for (const 光 of 光源列表) {
    const 名 = `${光.type || '(匿名光源)'}${光.name ? `:${光.name}` : ''}`;
    const 条 = { 名, 类: 光.isDirectionalLight ? '方向光' : (光.isSpotLight ? '聚光' : (光.isPointLight ? '点光' : '(未知光源类)')), 绘: 0, 框: 0 };
    出.光源.push(条);
    if (光.isPointLight === true || 光.shadow?.isPointLightShadow === true) {
      问题.push(`投影光源 ${名} 是点光：它的阴影是立方六面、每面换一个阴影相机（three 8507 的 getViewportCount），本模型只看得到当前那一面 ⇒ 这一轮的数不作数`);
      continue;
    }
    if (!光.isDirectionalLight && !光.isSpotLight) {
      问题.push(`投影光源 ${名} 既不是方向光也不是聚光 —— 它的阴影趟走法没被复刻，不猜`);
      continue;
    }
    if (光.shadow.autoUpdate === false && 光.shadow.needsUpdate === false) {
      条.跳过 = 'shadow.autoUpdate=false 且 needsUpdate=false（three 8457：这一盏整趟跳过）';
      continue;
    }
    const 阴影相机 = 光.shadow.camera;
    const 投影列 = 阴影相机?.projectionMatrix?.elements;
    const 逆视图列 = 阴影相机?.matrixWorldInverse?.elements;
    if (!投影列 || !逆视图列) {
      问题.push(`投影光源 ${名} 的 shadow.camera 读不到 projectionMatrix / matrixWorldInverse（阴影相机没 updateMatrices？）—— 没有框就没有剔除，这一轮的数不作数`);
      continue;
    }
    const 面 = 阴影框平面(投影列, 逆视图列);
    const 上下 = { 相机, 场景, 面, 计数, 计: { 预测: 0, 框: 0, 可投: 0 } };
    剪枝下钻(场景, (件) => {
      if (!(件.isMesh || 件.isLine || 件.isPoints)) return;
      if (!件.castShadow) return; // 8686 非 VSM 分支：只有 castShadow 为真的件进阴影趟
      上下.计.可投 += 1;
      if (件.frustumCulled === true) {
        const 球 = 世界包围球(件);
        if (!球 || !球在框内(面, 球)) return;
      }
      const 笔 = 件的阴影笔数(件);
      if (!笔) return;
      上下.计.预测 += 笔;
      上下.计.框 += 1;
      const 标签 = 归属标签(件, 场景);
      计数.set(标签, (计数.get(标签) || 0) + 笔);
    }, 上下);
    条.绘 = 上下.计.预测;
    条.框 = 上下.计.框;
    出.预测 += 上下.计.预测;
    出.框内件数 += 上下.计.框;
    出.可投件数 += 上下.计.可投;
  }
  出.榜 = 归因排名([...计数.entries()]);
  return 出;
}

/**
 * 榜：按笔数从多到少，同笔数的按标签字典序 —— 顺序必须是确定的，
 * 否则同一份世界两次跑打印出两个榜，日志就成了噪声而不再是证据。
 */
export function 归因排名(条目, 限) {
  条目 = Array.isArray(条目) ? 条目 : [];
  const 排 = [...条目]
    .filter(([标签, 笔]) => typeof 标签 === 'string' && Number.isInteger(笔) && 笔 > 0)
    .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0)));
  return (Number.isInteger(限) && 限 > 0) ? 排.slice(0, 限) : 排;
}
