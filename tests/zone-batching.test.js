/**
 * 区域静态几何合批的门禁（W-C2 切片5，B94 收口）。
 *
 * ## 这一片改了什么
 *
 * 切片5 普查（#158）的读数：全场景可画≈1200 件里静止≈920 件，`同材质合几何省≈737`，
 * 而每站的顶层组归因里最贵的就是 `zone:*` 自己（fantasy 区体 318 次绘制、magic 158）。
 * `zoneBatching.js` 于是把每座 `zone.group` 里"建完就不再动"的网格按
 * **材质 × 阴影类别 × 顶点布局** 分桶，逐桶烘进区根本地坐标合成一件。
 *
 * ## 这里钉住的六层（每层都是"不报错但画面/账目不对"的坏法）
 *
 * ① **三角形守恒**：合批丢面不会有任何报错，只是远处一座林子少了几个树冠。
 *    逐区比对合并前后的三角形总数，并按 `材质 × 阴影` 分格比对 —— 这一条同时钉住
 *    "不许把 castOnly 的树并进 prop 的柱子"（阴影类别是分组键，不是事后补的）。
 * ② **每批都有包围球**：切片2 的教训 —— `mergeGeometries` 不算包围球，
 *    视锥测试拿 `null` 比会**整群消失**（画面少了东西，帧数还"变好了"）。
 * ③ **动态件留在原地**：合批把顶点烘死，此后物件自己的 `position/rotation/scale`
 *    就不算了。所以每处动画都要能**动给测试看**（不是只查一个标记位）：
 *    靠名字找的核、悬浮书、黑洞、POI 光柱。
 * ④ **材质身份不被克隆**：合并网格必须用**原来那份材质对象** ——
 *    贴图库晚到走的是 `applySurfaces` 就地改材质，克隆一份就把那条缝剪断了。
 * ⑤ **不合的东西确实没合**：半透明（透明排序按物件走，合了就重排）、隐藏的
 *    （合进可见批 = 让本该看不见的东西现形）、实例/renderOrder/不剔除的。
 * ⑥ **原始几何不 dispose**：同一份几何可以被多件共享（废墟拱门左右柱就是
 *    `left.clone()`），合批把原件摘走时顺手 dispose 会拆掉还在用的那份。
 *
 * ⑦ 接线次序（`Game` 里必须在 `attachPopCultureZones` **之后**）单独立一条：
 *    致敬层是最后往 `zone.group` 写东西的一方，早一步合批等于把它追加的装饰全留下当散件。
 *
 * ⑧ **合批产物有名可查**（切片16）：`shadowCensus.js` 的 `归属标签()` 沿父链往上是**就近**
 *    找名字，一族里认不出某一件就写 `(无名)` —— 合并网格原本只带 `userData.zoneBatch`、
 *    没有 `.name`，而区根 `zone.group` 自己也没名，于是 magic 站 23 笔、void 站 24 笔在阴影
 *    归属榜上全挤进 `(直属scene) / (无名)` 那一格，想问"阴影框边界上那一笔是谁"连把手都没有。
 *    名字由手里已有的两格推（区 id + 桶序）。这里钉的五条都是**能不能拿它找回那一件**：
 *    形状与区内不撞号（那一条只是其余四条的下限，不是目的）、`getObjectByName` 指回同一件、
 *    那位真读者 `归属标签` 开了口（附反面控制：没名的野件照样读 `(无名)`，否则"不含 (无名)"
 *    可能只是榜换了别的说法）、同树两次构建逐字同名、以及号钉在**桶序**而不是"第几个成功"
 *    （前面回退一桶，后面的号不许挪 —— 这一条需要一次真回退，见下面那段 mock）。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { AbyssZone } from '../src/world/zones/AbyssZone.js';
import { FantasyZone } from '../src/world/zones/FantasyZone.js';
import { GloomZone } from '../src/world/zones/GloomZone.js';
import { MagicZone } from '../src/world/zones/MagicZone.js';
import { RadiantZone } from '../src/world/zones/RadiantZone.js';
import { SpaceZone } from '../src/world/zones/SpaceZone.js';
import { VoidZone } from '../src/world/zones/VoidZone.js';
import { batchZoneStatics, markNoBatch } from '../src/world/zoneBatching.js';
import { 归属标签 } from '../src/engine/shadowCensus.js';
import { makeUvFacetGeometry } from '../src/engine/uvGeometry.js';
import { resetForTest as 帧归零, tick } from '../src/engine/FrameBudget.js';

/**
 * ⑧ 那条"前面一批回退、后面那批的号不跟着挪"需要一个**真回退**（`mergeGeometries` 返回 null）。
 * 生产里这一条路的入口是"布局对不上 / 三角形对不上"，而布局对不上会**先把分桶键岔开** ——
 * 摆不出"同一区里第一桶失败、后面两桶成功"这个形状，所以只能在模块层拦一刀：
 * `globalThis.__合批回退 = N` 令第 N 次调用返回 null（`__合批次` 在用例里归零）；
 * 没设就**逐字委托**给原实现，因此这个 mock 对本文件其余各条腿是惰性的 —— 它们照旧绿就是自证。
 */
vi.mock('three/addons/utils/BufferGeometryUtils.js', async (importOriginal) => {
  const 原 = await importOriginal();
  return {
    ...原,
    mergeGeometries(几何们, 用组) {
      globalThis.__合批次 = (globalThis.__合批次 ?? 0) + 1;
      if (globalThis.__合批回退 === globalThis.__合批次) return null;
      return 原.mergeGeometries(几何们, 用组);
    },
  };
});

const 对话桩 = () => ({ show() {}, toast() {} });

/** 真 Scene：区域组靠 scene.add 挂上，`updateMatrixWorld` 才走生产那条路径 */
function 建区(Zone, center = { x: -200, z: 0 }) {
  const scene = new THREE.Scene();
  const zone = new Zone(scene, center, 对话桩());
  // 构造器只构造（缺陷② 切片F，修 B134）：内容由 `build()` 建 —— 生产里这一段由
  // `WorldManager` 在挂好地面问手之后调用，裸区在这里自己补上同一句。
  zone.build();
  return { scene, zone };
}

const 七区 = [AbyssZone, FantasyZone, GloomZone, MagicZone, RadiantZone, SpaceZone, VoidZone];

function 三角形数(o) {
  const g = o.geometry;
  return (g.index ? g.index.count : g.attributes.position.count) / 3;
}

function 网格清单(root) {
  const 出 = [];
  root.traverse((o) => {
    if (o.isMesh) 出.push(o);
  });
  return 出;
}

function 三角形总数(root) {
  return 网格清单(root).reduce((n, o) => n + 三角形数(o), 0);
}

/**
 * 按 `材质对象 × castShadow × receiveShadow` 分格的三角形账。
 * 合批前后的这张表必须一模一样 —— 它一次覆盖了三件事：不丢面、不串材质、
 * 不混阴影类别（`shadowPolicy` 的四档各留各的批）。
 */
function 阴影材质账(root) {
  const 账 = new Map();
  for (const o of 网格清单(root)) {
    const k = `${o.material.uuid}|cast=${o.castShadow ? 1 : 0}|recv=${o.receiveShadow ? 1 : 0}`;
    账.set(k, (账.get(k) ?? 0) + 三角形数(o));
  }
  return 账;
}

function 合批的(root) {
  const 出 = [];
  root.traverse((o) => {
    if (o.userData.zoneBatch) 出.push(o);
  });
  return 出;
}

/** 一个假区（只要 `id` 与 `group`），用来摆合成场景 */
function 假区(scene, 位置 = { x: 0, z: 0 }) {
  const group = new THREE.Group();
  group.position.set(位置.x, 0, 位置.z);
  scene.add(group);
  return { id: 'synthetic', group };
}

afterEach(() => {
  vi.restoreAllMocks();
  // 回退开关是一次性的：漏在这里清，下一条腿会继承"第 N 次合并返回 null"，
  // 红得莫名其妙，而且红的还是与它无关的那条。
  delete globalThis.__合批回退;
  delete globalThis.__合批次;
});

describe('① 守恒：合批不许丢面、不许串类', () => {
  it('七座区逐区三角形总数一件不少，件数正好按记账掉下来', () => {
    for (const Zone of 七区) {
      const { zone } = 建区(Zone);
      const 前 = 三角形总数(zone.group);
      const 件前 = 网格清单(zone.group).length;
      const 计 = batchZoneStatics({ zones: [zone] });
      const 后 = 三角形总数(zone.group);
      expect(后, `${zone.id} 合批后三角形变了`).toBe(前);
      expect(计.区[0].省下绘制).toBe(件前 - 网格清单(zone.group).length);
      expect(计.区[0].合入件数).toBeGreaterThan(计.区[0].省下绘制);
      expect(计.区[0].回退).toBe(0);
    }
  });

  it('材质 × 阴影类别的分格账逐格对得上（castOnly 的树不会被并进 prop 的柱子）', () => {
    for (const Zone of 七区) {
      const { zone } = 建区(Zone);
      const 前 = 阴影材质账(zone.group);
      batchZoneStatics({ zones: [zone] });
      const 后 = 阴影材质账(zone.group);
      expect([...后.keys()].sort(), `${zone.id} 的类别集合变了`).toEqual([...前.keys()].sort());
      for (const [k, 三] of 前) expect(后.get(k), `${zone.id} 的 ${k} 三角形对不上`).toBe(三);
    }
  });

  it('中洲的树：共享材质之后一整片林子合成一批（逐棵新建材质就合不动）', () => {
    const { zone } = 建区(FantasyZone);
    const 共享树干材质 = zone.treeMaterials().trunk;
    // 林子被出生点空地随机跳过几棵（`FantasyZone.buildForest` 的 continue），件数从
    // **构建结果**里按材质身份数出来，不写死 80。
    const 树干件数 = 网格清单(zone.group).filter((o) => o.material === 共享树干材质).length;
    const 批 = batchZoneStatics({ zones: [zone] });
    // 树这一族是普查里最大的那块（87件 Cylinder|v=52 影85）。按**共享的那份材质**认领，
    // 才量得到"材质共享 ⇒ 合得动"：材质回到逐棵新建时这里立刻掉到 1，
    // 而笼统的"省下绘制"靠外野 40 棵同材质的野树也能凑够数，量不出这条。
    expect(树干件数, '树干没挂在 treeMaterials().trunk 上 ⇒ createTree 的材质又变回逐棵新建了').toBeGreaterThanOrEqual(70);
    expect(批.区[0].省下绘制).toBeGreaterThan(60);
    const 树干批 = 合批的(zone.group).filter((m) => m.material === 共享树干材质);
    expect(树干批, '共享树干的合并批不存在 ⇒ createTree 的材质又变回逐棵新建了').toHaveLength(1);
    expect(树干批[0].userData.zoneBatch.件数).toBe(树干件数);
  });
});

describe('② 包围球：合批网格不能没有它（切片2 的教训）', () => {
  it('每一批都算出了有限的正半径包围球', () => {
    for (const Zone of 七区) {
      const { zone } = 建区(Zone);
      batchZoneStatics({ zones: [zone] });
      const 批 = 合批的(zone.group);
      expect(批.length, `${zone.id} 没合出批来`).toBeGreaterThan(0);
      for (const m of 批) {
        const s = m.geometry.boundingSphere;
        expect(s, 'boundingSphere 为 null ⇒ 视锥测试会拿 null 比').not.toBeNull();
        expect(Number.isFinite(s.radius), `半径不是有限数：${s?.radius}`).toBe(true);
        expect(s.radius).toBeGreaterThan(0);
        expect(m.frustumCulled).toBe(true);
      }
    }
  });
});

describe('③ 动态件留在原地，并且真的还在动', () => {
  it('靠名字找的核心：合批后 getObjectByName 仍命中，且没被并进批', () => {
    const 名册 = [
      [AbyssZone, 'chaosCore'],
      [GloomZone, 'mistCore'],
      [RadiantZone, 'sunCore'],
      [VoidZone, 'timeRing0'],
      [VoidZone, 'timeRing4'],
    ];
    for (const [Zone, name] of 名册) {
      const { zone } = 建区(Zone);
      batchZoneStatics({ zones: [zone] });
      const 找到 = zone.group.getObjectByName(name);
      expect(找到, `${zone.id} 里 ${name} 被合掉了`).toBeTruthy();
      expect(找到.userData.zoneBatch).toBeUndefined();
    }
  });

  it('VoidZone 的时环：合批后 update 仍逐帧自转', () => {
    const { zone } = 建区(VoidZone);
    batchZoneStatics({ zones: [zone] });
    帧归零();
    const 转前 = zone.group.getObjectByName('timeRing2').rotation.z;
    for (let i = 0; i < 4; i++) {
      tick();
      zone.update(0.25);
    }
    expect(zone.group.getObjectByName('timeRing2').rotation.z).not.toBe(转前);
  });

  it('悬浮书：合批后每帧浮沉仍改得到 mesh 自己的 y', () => {
    const { zone } = 建区(MagicZone);
    batchZoneStatics({ zones: [zone] });
    expect(zone.books).toHaveLength(15);
    for (const b of zone.books) {
      expect(b.mesh.userData.noBatch).toBe(true);
      expect(b.mesh.parent).toBe(zone.group);
    }
    帧归零();
    const 记录 = zone.books.map((b) => b.mesh.position.y);
    for (let i = 0; i < 3; i++) {
      tick();
      zone.update(1 / 60);
    }
    const 动了 = zone.books.filter((b, i) => b.mesh.position.y !== 记录[i]).length;
    expect(动了, '15 本书一本没动 ⇒ 引用已被烘死').toBeGreaterThan(10);
  });

  it('黑洞（无名字、靠字段引用）：合批后过降频闸门仍自转', () => {
    const { zone } = 建区(SpaceZone);
    batchZoneStatics({ zones: [zone] });
    expect(zone.blackHole.userData.noBatch).toBe(true);
    帧归零();
    const 转前 = zone.blackHole.rotation.z;
    for (let i = 0; i < 4; i++) {
      tick();
      zone.update(0.25);
    }
    expect(zone.blackHole.rotation.z).not.toBe(转前);
    // 黑洞里那颗不透明的核心球不能被合走：它是 bhGroup 的孩子，标记挡得住
    expect(网格清单(zone.blackHole)).toHaveLength(3);
  });

  it('每根 POI 光柱都带 noBatch，合批后照样浮动', () => {
    for (const Zone of 七区) {
      const { zone } = 建区(Zone);
      const 柱前 = zone.poiMarkers.length;
      batchZoneStatics({ zones: [zone] });
      expect(zone.poiMarkers.every((m) => m.marker.userData.noBatch === true), zone.id).toBe(true);
      expect(zone.poiMarkers.map((m) => m.marker.userData.poiId).sort(), zone.id).toEqual(
        zone.pois.map((p) => p.id).sort(),
      );
      帧归零();
      const 高 = zone.poiMarkers.map((m) => m.marker.position.y);
      for (let i = 0; i < 3; i++) {
        tick();
        zone.update(1 / 60);
      }
      const 浮 = zone.poiMarkers.filter((m, i) => m.marker.position.y !== 高[i]).length;
      expect(浮, `${zone.id} 的光柱不再浮动（${柱前} 根）`).toBe(柱前);
    }
  });
});

describe('④ 材质身份：合并网格用的是原来那份材质', () => {
  it('混沌边境的 crag 材质：合批后仍是同一份对象，贴图晚到也上得了', () => {
    const scene = new THREE.Scene();
    const zone = new AbyssZone(scene, { x: 0, z: 0 }, 对话桩());
    zone.build();
    const 登记的 = zone._surfaceMats.map((s) => s.mat);
    batchZoneStatics({ zones: [zone] });
    const 批 = 合批的(zone.group);
    const 用上登记材质的 = 批.filter((m) => 登记的.includes(m.material));
    expect(用上登记材质的.length, '外野 24 块岩合出来的批应当用登记过的那份材质').toBeGreaterThan(0);

    // 生产那条缝：`WorldManager.build()` → `TextureLibrary.load().then(() => zone.applySurfaces(lib))`
    const 假纹理 = (v) => new THREE.DataTexture(new Uint8Array(48).fill(v), 4, 4);
    const 库 = { uvVariant: () => ({ normalMap: 假纹理(130), roughnessMap: 假纹理(190) }) };
    const 挂上 = zone.applySurfaces(库);
    expect(挂上).toBeGreaterThan(0);
    for (const m of 用上登记材质的) {
      expect(m.material.normalMap, '合批件没吃到后到的贴图 ⇒ 材质被克隆过').not.toBeNull();
      expect(m.material.roughness).toBe(1);
    }
  });
});

describe('⑤ 不合的东西确实没合', () => {
  it('半透明件保持独立：透明排序按物件走，合了就重排', () => {
    const scene = new THREE.Scene();
    const zone = 假区(scene);
    const mat = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.5 });
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
      m.position.set(i * 3, 0, 0);
      zone.group.add(m);
    }
    const 计 = batchZoneStatics({ zones: [zone] });
    expect(计.区[0].批数).toBe(0);
    expect(网格清单(zone.group)).toHaveLength(4);
  });

  it('隐藏的件不并进可见批：合了等于让本该看不见的东西现形', () => {
    const scene = new THREE.Scene();
    const zone = 假区(scene);
    const mat = new THREE.MeshStandardMaterial();
    const 可见 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    const 藏 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    藏.visible = false;
    const 藏但合并 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    const 父 = new THREE.Group();
    父.visible = false;
    父.add(藏但合并);
    zone.group.add(可见, 藏, 父);
    const 计 = batchZoneStatics({ zones: [zone] });
    expect(计.区[0].批数).toBe(0);
    expect(藏.visible).toBe(false);
    expect(藏但合并.visible).toBe(true);
    expect(藏但合并.parent).toBe(父);
  });

  it('实例网格、renderOrder、frustumCulled=false 的件原样不动', () => {
    const scene = new THREE.Scene();
    const zone = 假区(scene);
    const mat = new THREE.MeshStandardMaterial();
    const 实例 = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, 3);
    const 排序 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    排序.renderOrder = 2;
    const 不剔除 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    不剔除.frustumCulled = false;
    const 蒙皮 = new THREE.SkinnedMesh(new THREE.BoxGeometry(1, 1, 1), mat);
    zone.group.add(实例, 排序, 不剔除, 蒙皮);
    for (let i = 0; i < 2; i++) {
      const o = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
      o.position.set(i * 5, 0, 0);
      zone.group.add(o);
    }
    batchZoneStatics({ zones: [zone] });
    expect(实例.parent).toBe(zone.group);
    expect(排序.parent).toBe(zone.group);
    expect(不剔除.parent).toBe(zone.group);
    expect(蒙皮.parent).toBe(zone.group);
    expect(合批的(zone.group)).toHaveLength(1);
  });

  it('markNoBatch 挡住整棵子树，哪怕里面全是同形同材质', () => {
    const scene = new THREE.Scene();
    const zone = 假区(scene);
    const mat = new THREE.MeshStandardMaterial();
    const 子树 = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
      m.position.set(i * 3, 0, 0);
      子树.add(m);
    }
    markNoBatch(子树);
    zone.group.add(子树);
    const 计 = batchZoneStatics({ zones: [zone] });
    expect(计.区[0].批数).toBe(0);
    expect(网格清单(子树)).toHaveLength(5);
  });

  it('顶点布局对不上（有无索引 / 属性个数不同）不进同一桶，且不惊动 mergeGeometries 的报错', () => {
    const 报错 = vi.spyOn(console, 'error').mockImplementation(() => {});
    const scene = new THREE.Scene();
    const zone = 假区(scene);
    const mat = new THREE.MeshStandardMaterial();
    const 索引 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    const 非索引 = new THREE.Mesh(makeUvFacetGeometry(new THREE.DodecahedronGeometry(1, 0)), mat);
    const 少属性 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    少属性.geometry.deleteAttribute('uv');
    const 不同尺寸 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    不同尺寸.geometry.setAttribute('uv', new THREE.Uint8BufferAttribute(new Uint8Array(8), 1));
    zone.group.add(索引, 非索引, 少属性, 不同尺寸);
    const 计 = batchZoneStatics({ zones: [zone] });
    expect(计.区[0].批数).toBe(0);
    expect(计.区[0].回退).toBe(0);
    expect(报错).not.toHaveBeenCalled();
    expect(网格清单(zone.group)).toHaveLength(4);
  });
});

describe('⑥ 原始资源：合批摘走原件，但不销毁还在共享的几何', () => {
  it('原始几何一件都没 dispose，合并件用的是新几何', () => {
    const scene = new THREE.Scene();
    const zone = 假区(scene);
    const mat = new THREE.MeshStandardMaterial();
    const 共享 = new THREE.BoxGeometry(1, 1, 1); // 左右柱同款：一件几何两个主人
    const a = new THREE.Mesh(共享, mat);
    const b = new THREE.Mesh(共享, mat);
    b.position.set(4, 0, 0);
    const 独立 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    独立.position.set(8, 0, 0);
    zone.group.add(a, b, 独立);
    const 销毁 = [];
    for (const g of [共享, 独立.geometry]) g.addEventListener('dispose', () => 销毁.push(g));
    const 计 = batchZoneStatics({ zones: [zone] });
    expect(计.区[0].合入件数).toBe(3);
    expect(销毁, '合批把还在共享的原始几何 dispose 了').toHaveLength(0);
    const 批 = 合批的(zone.group);
    expect(批).toHaveLength(1);
    expect(批[0].geometry).not.toBe(共享);
    expect(共享.attributes.position.array).toHaveLength(24 * 3);
  });

  it('旋转与非等比缩放烘进顶点时，位置与法线一起走', () => {
    const scene = new THREE.Scene();
    const 区 = 假区(scene, { x: 10, z: 0 }); // 区根自己带位移 ⇒ 烘的必须是相对区根的坐标
    const mat = new THREE.MeshStandardMaterial();
    const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    b.position.set(5, 0, 0);
    b.scale.set(1, 3, 1);
    b.rotation.y = Math.PI / 2;
    区.group.add(a, b);
    batchZoneStatics({ zones: [区] });
    const 批 = 合批的(区.group);
    expect(批).toHaveLength(1);
    const 盒 = new THREE.Box3().setFromBufferAttribute(批[0].geometry.attributes.position);
    // 烘的是**相对区根**的坐标：区根自己那 +10 的位移不能进顶点（进了就等于把整片林子
    // 挪到世界坐标去，挂在区根下会再翻一倍）。a：x∈[-.5,.5] y∈[-.5,.5]；
    // b：绕 Y 转 90° ⇒ x 与 z 互换、y 拉 3 倍，再平移 +5 ⇒ x∈[4.5,5.5] y∈[-1.5,1.5]。
    expect(盒.min.x).toBeCloseTo(-0.5, 5);
    expect(盒.max.x).toBeCloseTo(5.5, 5);
    expect(盒.min.y).toBeCloseTo(-1.5, 5);
    expect(盒.max.y).toBeCloseTo(1.5, 5);
    expect(盒.max.z).toBeCloseTo(0.5, 5);
    const n = 批[0].geometry.attributes.normal;
    for (let i = 0; i < n.count; i++) {
      const 长 = Math.hypot(n.getX(i), n.getY(i), n.getZ(i));
      expect(长, '法线没跟着变换矩阵归一').toBeCloseTo(1, 4);
    }
  });
});

describe('⑦ 幂等与接线', () => {
  it('再跑一次不产生新批、也不改件数', () => {
    const { zone } = 建区(FantasyZone);
    batchZoneStatics({ zones: [zone] });
    const 件数 = 网格清单(zone.group).length;
    const 批数 = 合批的(zone.group).length;
    const 第二次 = batchZoneStatics({ zones: [zone] });
    expect(第二次.区[0].批数).toBe(0);
    expect(第二次.区[0].省下绘制).toBe(0);
    expect(网格清单(zone.group)).toHaveLength(件数);
    expect(合批的(zone.group)).toHaveLength(批数);
  });

  it('整个七区世界一次跑完：合计记账与逐区一致', () => {
    const scene = new THREE.Scene();
    const zones = 七区.map((Z, i) => {
      const z = new Z(scene, { x: i * 300, z: 0 }, 对话桩());
      z.build(); // 构造器只构造（缺陷② 切片F）：内容由 build() 建
      return z;
    });
    const 前 = zones.reduce((n, z) => n + 三角形总数(z.group), 0);
    const 计 = batchZoneStatics({ zones });
    expect(三角形总数(scene)).toBe(前);
    expect(计.区数).toBe(7);
    expect(计.省下绘制).toBe(计.区.reduce((n, r) => n + r.省下绘制, 0));
    expect(计.合入件数).toBe(计.区.reduce((n, r) => n + r.合入件数, 0));
    expect(计.回退).toBe(0);
    // 这一条是"值不值"的地板：普查给的 zone 内可合面≈735，掉到 200 以下说明分组键走偏了
    expect(计.省下绘制).toBeGreaterThan(300);
  });

  it('Game 在世界装配与致敬层之后才合批（早一步就把追加的装饰留在外面）', () => {
    const 源 = readFileSync(fileURLToPath(new URL('../src/core/Game.js', import.meta.url)), 'utf8');
    const 引入 = 源.indexOf("import { batchZoneStatics } from '../world/zoneBatching.js'");
    const 追加 = 源.indexOf('attachPopCultureZones(this)');
    const 合批 = 源.indexOf('batchZoneStatics(this.world)');
    expect(引入, 'Game 没引入合批出口').toBeGreaterThan(-1);
    expect(追加).toBeGreaterThan(-1);
    expect(合批, 'Game 没调用 batchZoneStatics(this.world)').toBeGreaterThan(追加);
  });
});

describe('⑧ 有名可查：合批产物不许在阴影归属榜上读成 (无名)', () => {
  /** 建一座真区、合一次批，带回场景与产物（榜的读者要拿场景当根，两样都得给） */
  function 产物(Zone) {
    const { scene, zone } = 建区(Zone);
    batchZoneStatics({ zones: [zone] });
    return { scene, zone, 批: 合批的(zone.group) };
  }

  it('每一批都叫 `合批-<区 id>-<桶序>`，同一区内不撞号', () => {
    for (const Zone of 七区) {
      const { zone, 批 } = 产物(Zone);
      expect(批.length, `${zone.id} 一批都没合 —— 这条腿什么都没量到`).toBeGreaterThan(0);
      const 名们 = 批.map((m) => m.name);
      for (const 名 of 名们) {
        expect(名, `${zone.id} 有一批没起名 —— 归属榜会把它读成 (无名)`).toMatch(new RegExp(`^合批-${zone.id}-\\d+$`));
      }
      expect(new Set(名们).size, `${zone.id} 的批名撞号了 —— 榜上点到一个名字，找回两件`).toBe(名们.length);
    }
  });

  it('榜上写出这个名字，就真能顺着名字找回那一件（行为腿，不是只看字符串）', () => {
    const { scene, zone } = 产物(FantasyZone);
    const 批 = 合批的(zone.group);
    expect(批.length, 'fantasy 一批都没合').toBeGreaterThan(1);
    for (const m of 批) {
      const 找回 = scene.getObjectByName(m.name);
      expect(找回, `${m.name} 在场景里找不回来`).toBe(m);
      expect(找回.userData.zoneBatch.区, `${m.name} 指到了别的区`).toBe(zone.id);
    }
  });

  it('那位真读者（`shadowCensus` 的归属标签）看着名字开口 —— 附反面控制', () => {
    const { scene, zone } = 产物(VoidZone);
    const 批 = 合批的(zone.group);
    expect(批.length, 'void 一批都没合').toBeGreaterThan(0);
    for (const m of 批) {
      const 条 = 归属标签(m, scene);
      expect(条, `${m.name} 仍被读成 (无名)`).not.toContain('(无名)');
      expect(条, `${m.name} 没出现在榜的那一格里`).toContain(m.name);
    }
    // 反面控制：这条腿不是恒真。一件没名、又不挂在任何有名祖先下的东西照样读 (无名) ——
    // 没有这一句，上面那两条"不含 (无名)"可能只是因为榜换了别的说法。
    const 野件 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    野件.castShadow = true;
    scene.add(野件);
    expect(归属标签(野件, scene)).toBe('(直属scene) / (无名)');
  });

  it('同一座区建两次，桶序与件数逐格对上 —— 名字能当把手（掺进 uuid 或按成功计数就红）', () => {
    const a = 产物(VoidZone);
    const b = 产物(VoidZone);
    expect(b.批.map((m) => m.name), '两次构建的批名不一致').toEqual(a.批.map((m) => m.name));
    a.批.forEach((m, i) => {
      expect(b.批[i].userData.zoneBatch.件数, `${m.name} 在第二次构建里指到了另一桶`).toBe(m.userData.zoneBatch.件数);
    });
  });

  it('号钉在**桶序**而不是"第几个成功"：前面一桶回退，后面的号不许挪', () => {
    // 三桶 × 各两件、材质互不相同 ⇒ 桶序由 `traverse` 定死。令第 1 次 `mergeGeometries`
    // 返回 null（文件头那段 mock），也就是第一桶真的回退。若号按"成功才 +1"发，后两批
    // 会读成 `…-1`、`…-2` —— 同一棵树在"有没有回退"两种情况下给出不同的名字，
    // 榜上抄下来的那个把手换个构建就指到别处，名字等于白起。
    const scene = new THREE.Scene();
    const zone = 假区(scene);
    const 原件 = [];
    for (let 桶 = 0; 桶 < 3; 桶++) {
      const mat = new THREE.MeshStandardMaterial();
      for (let i = 0; i < 2; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
        m.position.set(桶 * 10 + i * 3, 0, 0);
        zone.group.add(m);
        原件.push(m);
      }
    }
    globalThis.__合批次 = 0;
    globalThis.__合批回退 = 1;
    const 计 = batchZoneStatics({ zones: [zone] });
    expect(计.区[0].回退, '第一桶没真的回退 —— 这条腿什么都没量到').toBe(1);
    expect(计.区[0].批数, '回退一桶后应剩两批').toBe(2);
    expect(合批的(zone.group).map((m) => m.name)).toEqual(['合批-synthetic-2', '合批-synthetic-3']);
    // 回退那一桶的原件还在原地（回退 = 场景未被改动），而且没人替它起名
    expect(原件.slice(0, 2).filter((m) => m.parent === zone.group)).toHaveLength(2);
    expect(scene.getObjectByName('合批-synthetic-1'), '回退的那一桶被起了名 —— 榜上会多一笔不存在的批').toBeUndefined();
  });
});
