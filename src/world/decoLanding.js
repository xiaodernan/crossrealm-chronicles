/**
 * 装饰整层的「落座」尺子 —— **读数**与**判据**分家（与 `scripts/harness-readings.mjs` 同一个套路）。
 *
 * ## 这一族量什么
 *
 * `tests/decoration-ground-landing.test.js` 判的是"**整件埋在自己脚下**"（顶面 vs 地面）。
 * 这一族判的是另一半：**底边不许浮在地面之上** —— 一件东西的底悬在半空，玩家看见的是
 * 一道缝、一圈影子，而碰撞体却已经挡住了他（`BASE_SINK` 那一手）。
 *
 * ## 为什么必须分"顶层件"与"子件"
 *
 * 装饰层 800 多件里约四成是**子件**：树冠挂在树顶上、灯头挂在灯柱顶上、雨棚挂在摊底
 * 顶上、门梁跨在两根门柱之间、幡布挂在幡杆上。它们的底边**本来就该离地** ——
 * "悬空"对它们不是缺陷。不分父子就量，337 件子件会把尺子的分母撑爆，真正的顶层件
 * 浮起来反而淹没在里面。
 *
 * 谁是父谁是子由**生产自己声明**（`mesh.userData.landing`，见 `WorldDecorations`）：
 * 诊断要说出"是哪一族浮起来了"，门禁要按族算分母，两者读同一处，不各抄一份名单。
 *
 * ## 为什么当地地面按"它自己的落脚点"读，而不是按包围盒中心
 *
 * 断柱与水晶是**随机尺寸**的族，包围盒中心离它真正的落脚点能差一个身位（柱宽最大
 * 1.5 米）。在坡上，那一点的地表高度差能到**米级** —— 按中心读会把一件稳稳站在
 * 坡上的断柱判成"浮空"。落脚点是实例矩阵的平移列（InstancedMesh）或网格的世界位置
 * （普通网格），那才是这一件真正踩着的那一格。
 *
 * ## 读数的保守方向
 *
 * 底边量的是**世界包围盒**的下沿。对绕三轴乱转的件（石头），包围盒比真实几何大 ——
 * 只会把底边算得更低（更"埋"），**不会**把一件浮着的件算成落地。所以这把尺子对
 * "浮空"是保守的：它漏报，但不会误报。
 */
import * as THREE from 'three';

/** 顶层件：自己站在地上 */
export const 顶层 = 'ground';

/**
 * 贴地容差（米）：小于它看不出来，再大就是浮着。
 *
 * ## 为什么是 2 厘米，而不是"看得见才算"的 10 厘米
 *
 * 改前这一族是**心高写死、尺寸随机** —— 心离地 0.8 米而水晶半径在 0.5~0.9 米之间摇、
 * 断柱高在 1.5~3.5 米之间摇 ⇒ 短的那些浮起来、长的一半埋下去。心高改成由自己的
 * 半高推出来之后，顶层件的底边**结构上不可能浮**：实测 487 件顶层件里，
 * **最大底差 4.9×10⁻⁶ 米**（浮点噪声那一档）。
 *
 * 于是容差只需要卡住"浮"的**下限**，而不是"看得见"的门槛：
 * - **0.1 米（看得见的门槛）会把这一族放过**：变异臂实测断柱那刀（浮 5 厘米）
 *   与长椅那刀（浮 2.5 厘米）在 0.1 米容差下**一条都不红** —— 尺子咬不住
 *   "心高写死"这一族的本体。
 * - **0.02 米把两刀都咬住**：2.5 厘米 > 2 厘米 ⇒ 红。而好状态离它有 4000 倍余量。
 *
 * 换句话说：**容差卡的是"浮"这个事实，不是"浮得够不够难看"**。
 */
export const LANDING_TOLERANCE = 0.02;

/** 子件：挂在某一族顶上。`挂于('wildTreeTrunk')` */
export const 挂于 = (族名) => `on:${族名}`;

/**
 * 子件与父件的水平距离容差（米）。
 *
 * 取 3.0 是因为**最宽的那一族是门梁**：它跨在两根门柱中间，中点离每根柱 2.5 米。
 * 其余四族（树冠/灯头/雨棚/幡布）的父子是**同一格**（距离 0）。
 */
export const 父距容差 = 3.0;

const _im = new THREE.Matrix4();
const _组合 = new THREE.Matrix4();
const _落点 = new THREE.Vector3();
const _盒 = new THREE.Box3();

/**
 * 把装饰层摊成"每一件的读数"。
 *
 * @param {{ group: THREE.Object3 }} layer 装饰层（`WorldDecorations`）
 * @param {{ getGroundHeight: (x: number, z: number) => number }} world 世界场
 * @returns {Array<{族: string, 落座: string, 底: number, 顶: number, 当地地面: number, 差: number, 落点: {x: number, z: number}}>}
 */
export function 量落座(layer, world) {
  const 出 = [];
  layer.group.updateMatrixWorld(true);
  const 收 = (mesh, 世界矩阵, 落点) => {
    const geo = mesh.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    _盒.copy(geo.boundingBox).applyMatrix4(世界矩阵);
    if (!Number.isFinite(_盒.min.y)) return;
    const 当地地面 = world.getGroundHeight(落点.x, 落点.z);
    出.push({
      族: mesh.name || `未名:${mesh.geometry.type}`,
      落座: mesh.userData?.landing ?? null,
      底: _盒.min.y,
      顶: _盒.max.y,
      当地地面,
      差: _盒.min.y - 当地地面,
      落点: { x: 落点.x, z: 落点.z },
    });
  };
  for (const child of layer.group.children) {
    if (child.isInstancedMesh) {
      for (let i = 0; i < child.count; i += 1) {
        child.getMatrixAt(i, _im);
        _组合.multiplyMatrices(child.matrixWorld, _im);
        // 落脚点 = 实例矩阵的平移列（这一件真正踩着的那一格），再经父群矩阵换到世界
        _落点.setFromMatrixPosition(_im).applyMatrix4(child.matrixWorld);
        收(child, _组合, _落点);
      }
    } else {
      child.updateWorldMatrix(true, false);
      for (const m of collectMeshes(child)) {
        _落点.setFromMatrixPosition(m.matrixWorld);
        收(m, m.matrixWorld.clone(), _落点);
      }
    }
  }
  return 出;
}

/** 一个子树里所有的网格（普通件；合批件在 `量落座` 里单独展开） */
function collectMeshes(node) {
  const 出 = [];
  node.traverse((o) => {
    if (o.isMesh && !o.isInstancedMesh) 出.push(o);
  });
  return 出;
}

/**
 * 判据（纯函数）—— **吃读数、吐问题**。
 *
 * 这个形状是刻意的：判据住在生产这一侧，门禁只喂坏数据（反向控制），
 * 不在测试里再复刻一遍判断 —— 复刻的那份迟早与生产的分家。
 *
 * @param {Array} 读数 `量落座` 的输出
 * @param {number} 容差 贴地容差（米）
 * @returns {string[]} 问题清单；空数组 = 这一层没有一件浮在地面之上
 */
export function 落座问题(读数, 容差) {
  const 问题 = [];
  const 顶层族 = new Set();
  for (const r of 读数) if (r.落座 === 顶层) 顶层族.add(r.族);

  // **尺子被绕过的形状**：一件顶层件都没有 ⇒ 全被标成子件了，这条尺子量不到任何东西
  if (顶层族.size === 0 && 读数.length > 0) {
    问题.push(`这一层没有顶层件了（${读数.length} 件全被标成子件）—— 尺子被绕过去了`);
  }

  for (const r of 读数) {
    if (r.落座 === 顶层) {
      if (r.差 > 容差) {
        问题.push(`${r.族} 浮在地面之上 ${r.差.toFixed(2)} 米（落脚点 ${r.落点.x.toFixed(1)}, ${r.落点.z.toFixed(1)}）`);
      }
      continue;
    }
    if (typeof r.落座 === 'string' && r.落座.startsWith('on:')) {
      const 父 = r.落座.slice(3);
      if (!顶层族.has(父)) {
        问题.push(`${r.族} 挂在「${父}」上，而那一族不存在、或者它自己不是顶层件`);
        continue;
      }
      const 有父 = 读数.some((p) => p.族 === 父
        && Math.hypot(p.落点.x - r.落点.x, p.落点.z - r.落点.z) <= 父距容差);
      if (!有父) {
        问题.push(`${r.族} 挂在「${父}」上，但那一格里没有「${父}」的件（离得最近的超过 ${父距容差} 米）`);
      }
      continue;
    }
    问题.push(`${r.族} 没有声明落座身份（既不是顶层件，也没说挂在谁上面）`);
  }
  return 问题;
}
