import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SHADOW_CLASSES, applyShadow } from '../engine/shadowPolicy.js';

/**
 * W-C2 切片5：把每座区域组里的**静态**几何按材质合批（B94 收口）。
 *
 * 切片5 普查（#158）给的账：全场景可画≈1200 件里静止≈920 件，`同材质合几何省≈735`，
 * 而 `zone:*` 本身就是最贵的顶层组（fantasy 区体 318 / magic 区体 158）。合批的落点
 * 因此定在**每座 `zone.group` 内部**：外部系统（`WorldDecorations` / `WeatherSystem` /
 * `BossBeacons` / `WorldEffects` / 掉落物 / NPC）一律挂在自己的顶层组上，本次一概不碰。
 *
 * 三条硬约束（任务里立的，逐条有门禁）：
 * 1. **三角形总数守恒** —— 合批不许丢面。每次 `mergeGeometries` 之后当场比对合并前后
 *    的三角形数，对不上就回退：把原始件原样留在场景里（克隆几何被丢弃，原件从未改动）。
 * 2. **阴影类别逐类保留** —— `shadowPolicy.js` 的四档（ground/prop/castOnly/actor）是
 *    材质之外的另一条分组键；`castShadow`/`receiveShadow` 不同的件绝不进同一批。
 * 3. **每批必须 `computeBoundingSphere()`** —— 切片2 的教训：合并几何不算包围球，
 *    第一帧的视锥测试会拿 `null` 去比，整群直接被裁掉（东西"消失"而不是变慢）。
 *
 * 合批的代价是把顶点烘进合并几何：被合进去的那件东西，此后**它自己的**
 * `position/rotation/scale` 再也说不算了。所以动态件必须挡在门外，靠两条规则：
 * - `markNoBatch(obj)`：建的时候就声明"这个子树要留着动"（`SpaceZone` 黑洞、
 *   `MagicZone` 悬浮书、POI 光柱这类**没有名字、靠字段引用**动的件）。
 * - **有名字就不合**：`name` 非空 ⇒ 有人在 `getObjectByName` 它
 *   （`VoidZone.timeRing0..4`、`Abyss.chaosCore`、`Gloom.mistCore`、`Radiant.sunCore`
 *   全是这一族），把它合进批里就等于把找它的那行代码改成静默 `null`。
 *   这条是结构性的，比"记得给四处加标记"更难写错。
 *
 * 半透明件也不合：透明排序是**按物件中心到相机的距离**排的，几十件合一件会重排
 * 它们之间（以及和别的透明件之间）的叠加顺序 —— 肉眼看得见的改动，不该顺手夹在
 * 一次性能切片里。冰晶 45 件、玻璃温室、魔法水晶、时线碎片、POI 光柱都在这格。
 */

const 不合批 = 'noBatch';
const 合批记账 = 'zoneBatch';

/**
 * 声明一个物件（连同子树）不参与合批 —— 它要留给动画系统。
 * 建的时候调用，比事后靠约定猜它动不动要便宜。
 */
export function markNoBatch(obj) {
  obj.userData[不合批] = true;
  return obj;
}

/** 该物件（或它的任一祖先）是否被留在合批之外 */
function 被动过(o, root) {
  for (let p = o; p !== null; p = p.parent) {
    if (p === root) return false;
    if (p.userData[不合批] === true || p.userData[合批记账]) return true;
    if (!p.visible) return true;
    if (p.name) return true;
  }
  return true; // 走不到 root ⇒ 不在本区组里
}

/**
 * 一件**可以**进批的静态网格：单个不透明材质、普通 Mesh（不是实例/蒙皮）、
 * 有 position 属性、没被谁按名字或标记认领、默认 renderOrder 与图层、参与视锥剔除。
 */
function 是可合批(o, root) {
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh) return false;
  const geo = o.geometry;
  if (!geo?.attributes?.position) return false;
  const mat = o.material;
  if (!mat || Array.isArray(mat)) return false;
  if (mat.transparent) return false;
  if (o.renderOrder !== 0) return false;
  if (o.frustumCulled === false) return false;
  return !被动过(o, root);
}

/**
 * `mergeGeometries` 的兼容条件读回成一把键：属性集必须同名、同 `itemSize`、同类型、
 * 同 `normalized`，索引要么人人有、要么人人无。这些对不上时 three 只会
 * `console.error` 后返回 `null` —— 提前分组键住，别把错误留给运行时。
 *
 * 键里**只有布局，没有形状**：索引的条目数、顶点数、几何类型一律不参与。这是
 * 普查里 `同材质合几何省=737` 与 `同几何同材质省=30` 的差距所在 —— 合批不吃
 * "同一种几何"，只吃"布局对得上的顶点数据 + 同一份材质"，所以城堡的方块主体能
 * 和四座圆柱塔并进一次绘制。
 */
function 属性布局(geo) {
  const 项 = [];
  for (const name of Object.keys(geo.attributes).sort()) {
    const a = geo.attributes[name];
    项.push(`${name}:${a.itemSize}:${a.type}:${a.normalized ? 1 : 0}`);
  }
  项.push(geo.index ? 'indexed' : 'raw');
  项.push(`morph=${Object.keys(geo.morphAttributes).length}`);
  return 项.join(',');
}

/** 三角形数：有索引按索引走，没索引按顶点 /3 */
function 三角形数(g) {
  return (g.index ? g.index.count : g.attributes.position.count) / 3;
}

function 分桶键(o) {
  return [
    o.material.uuid,
    o.castShadow ? 1 : 0,
    o.receiveShadow ? 1 : 0,
    o.layers.mask,
    属性布局(o.geometry),
  ].join('##');
}

/**
 * 由 `cast/receive` 反查 `shadowPolicy` 的类别名（**从表推，不抄名字**：加一类不用改这里）。
 *
 * `castOnly` 与 `actor` 在这一对上是同一个形状（投、不收），所以反查是**多对一**的 ——
 * 这没有代价：合并件要的只是那两个布尔，而这两个布尔由类别决定；取到哪一个名字，落下来的
 * `castShadow/receiveShadow` 逐字相同（`tests/zone-batching.test.js` 的"材质 × 阴影分格账"
 * 钉的就是那两个布尔，不是名字）。真正要紧的是**不许在这里写第二遍那两个布尔**。
 */
function 阴影类别(cast, receive) {
  for (const [名, 策略] of Object.entries(SHADOW_CLASSES)) {
    if (策略.cast === !!cast && 策略.receive === !!receive) return 名;
  }
  return null; // 表里没有这一格（(否,否) = 从未被策略认领）⇒ 不动它，新 Mesh 的缺省就是这一对
}

/**
 * 合一批：把 `件` 烘进 `区.group` 的本地坐标，合成一件挂回区根。
 * 成功返回合并网格，失败（三角形对不上 / `mergeGeometries` 返回 null）返回 `null`
 * 且**场景未被改动** —— 原件从头到尾没被搬走，克隆几何当场 dispose。
 */
function 合一批(zone, root, 件, mat) {
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const 克隆 = [];
  const 应得三角形 = 件.reduce((n, o) => n + 三角形数(o.geometry), 0);
  for (const o of 件) {
    const g = o.geometry.clone();
    // 烘的是"这件相对区根"的变换：位置、旋转、非等比缩放（散石有）一并进去，
    // 法线由 applyMatrix4 用法线矩阵带，缩放后归一 —— 与原来逐件着色等价。
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    克隆.push(g);
  }
  const merged = mergeGeometries(克隆, false);
  if (!merged) {
    for (const g of 克隆) g.dispose();
    return null;
  }
  if (三角形数(merged) !== 应得三角形) {
    merged.dispose();
    for (const g of 克隆) g.dispose();
    return null;
  }
  merged.computeBoundingSphere();

  const mesh = new THREE.Mesh(merged, mat);
  // 阴影类别走 `shadowPolicy` 的唯一出口（`tests/shadow-policy.test.js` ④ 那条结构门
  // 数的是"src/ 里裸写 castShadow/receiveShadow"）。合并件的类别**从分桶键已有的那一格
  // 反查**：桶里每一件的 cast/recv 本来就相同（它是分组键），所以"取件[0] 的类别"不是猜。
  // 反查不中 ⇒ (cast=false, receive=false)，那正是 three 新 Mesh 的缺省，也就是"这件从来
  // 没被任何策略认领过" —— 不硬套一个类别名，免得把表外的一格伪装成表内的一格。
  const 类别 = 阴影类别(件[0].castShadow, 件[0].receiveShadow);
  if (类别) applyShadow(mesh, 类别);
  mesh.layers.mask = 件[0].layers.mask;
  mesh.userData[合批记账] = { 区: zone.id, 件数: 件.length, 三角形: 应得三角形 };
  root.add(mesh);

  for (const o of 件) {
    // 原始几何**不能 dispose**：同一份几何可以被好几件共享（废墟拱门的左右柱就是
    // `left.clone()`）， dispose 会把还在用的那份 GPU 资源拆掉。
    o.parent.remove(o);
  }
  return mesh;
}

function 合一批一区(zone) {
  const root = zone?.group;
  if (!root?.isObject3D) return null;
  root.updateMatrixWorld(true);

  const 桶 = new Map();
  root.traverse((o) => {
    if (!是可合批(o, root)) return;
    const k = 分桶键(o);
    const 桶内 = 桶.get(k);
    if (桶内) 桶内.件.push(o);
    else 桶.set(k, { mat: o.material, 件: [o] });
  });

  const 结果 = { 区: zone.id, 批数: 0, 合入件数: 0, 省下绘制: 0, 三角形: 0, 回退: 0 };
  for (const { mat, 件 } of 桶.values()) {
    if (件.length < 2) continue;
    const mesh = 合一批(zone, root, 件, mat);
    if (!mesh) {
      结果.回退++;
      continue;
    }
    结果.批数++;
    结果.合入件数 += 件.length;
    结果.省下绘制 += 件.length - 1;
    结果.三角形 += mesh.userData[合批记账].三角形;
  }
  return 结果;
}

/**
 * 对 `world.zones` 逐区合批，返回记账（每区一批 + 合计）。
 *
 * 幂等：合出来的网格带 `合批记账`，`被动过` 会把它连同它自己一起挡在下一轮之外，
 * 原件也已从场景里摘走 —— 再调一次得到的是 `批数 0`。
 *
 * 调用时机：世界构建 + 致敬层追加**之后**（`Game` 里紧跟 `attachPopCultureZones`）。
 * 致敬层是最后往 `zone.group` 写东西的一方，早一步合批就等于把它追加的装饰全留下
 * 成散件。贴图库晚到不影响：合批保的是**同一份材质对象**（不克隆材质），
 * `applySurfaces` 就地改这份对象，合并网格跟着一起变。
 */
export function batchZoneStatics(world) {
  const 合计 = { 区数: 0, 批数: 0, 合入件数: 0, 省下绘制: 0, 三角形: 0, 回退: 0, 区: [] };
  for (const zone of world?.zones ?? []) {
    const r = 合一批一区(zone);
    if (!r) continue;
    合计.区.push(r);
    合计.区数++;
    合计.批数 += r.批数;
    合计.合入件数 += r.合入件数;
    合计.省下绘制 += r.省下绘制;
    合计.三角形 += r.三角形;
    合计.回退 += r.回退;
  }
  return 合计;
}
