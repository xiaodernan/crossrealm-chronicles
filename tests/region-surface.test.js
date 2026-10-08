/**
 * 区域石构贴图（drum）的门禁（W-C5 切片6）。
 *
 * ## 这一片交付了什么
 * 第六种烘焙表面 `drum`（2 米一铺、对缝 2×2 的鼓形石段，见 `content/materialSurfaces.js`）
 * 接到三处区域石构上：灰白森林废墟的 6 根断柱（`FantasyZone.buildRuins`）、虚空区尖碑的
 * 柱身（`VoidZone.buildLandmarks`）、世界之锚的中央石柱（`WorldManager.buildHubLandmarks`）。
 * 柱身几何都换 `makeUvCylinderGeometry`（UV 以米计 —— u 绕该行周长、v 沿高），石材经
 * `world/regionSurfaces.js` 的 `makeRegionSurfaceMaterial` / `applyRegionSurface` 两段式上贴。
 *
 * ## 与切片5（剑）的差别只有一个：重挂点
 * 剑的延迟支挂在 `PlayerController` 自己身上；石构的宿主是世界 —— 世界构建（同步）不等
 * 贴图库（异步），所以补挂点在 `WorldManager.build()` 既有那个 `TextureLibrary.load().then`
 * （`applySurfaceTextures`）。本文件第一个用例走的**就是那条真缝**：真 `WorldManager.build()`，
 * 库解析后材料自己带上贴图 —— 少接线一处症状是"整局石头没有纹理"，不报错。
 *
 * ## 这里钉住的四层（坏法各不同）
 * 1. **延迟补挂**（①，顺序是硬约束：单例一旦 ready 延迟支无法复现）：`build()` 后 hub 石柱 /
 *    6 根断柱 / 尖碑柱身都是旧读数（0.85 / 0.9 / 0.85，无贴图）；`load()` 解析后**同一份材质**
 *    被上贴（与 `uvVariant('drum', 0.5, 0.5)` 同一份壳、roughness 1、normalScale 0.8），
 *    且那份材质确实挂在网格上（按材质引用找，返回份数一并钉住）。
 * 2. **同步支**（②）：库已就绪时构造区域 ⇒ 登记的石材出生即贴图态；尖碑八面体顶盖**不是**
 *    石段（UV 非米制），保持无贴图。
 * 3. **退路支**（③）：`sets.drum` 不在 ⇒ 退回旧读数，但几何仍是米制 UV —— 贴图在不在
 *    与几何换用无关。
 * 4. **几何**（④）：逐行 uMax = **该行半径**的周长（0.6↔0.8 收分柱的每行都算自己的）、
 *    vMax = 高；反向对照：裸圆柱同一把尺量出 0..1（尺真的在量米）。
 *
 * node 里 TextureLoader 载不出图，所以延迟支用 `_loadSet` 原型桩给 drum 假槽
 * （真 `DataTexture`，有 Source 可共享）；`WorldManager.build()` 会发 `zone-changed`
 * 事件（`applyHubAtmosphere`），所以 ① 需要与 poi-identity 同款的 window 通道桩。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { WorldManager } from '../src/world/WorldManager.js';
import { FantasyZone } from '../src/world/zones/FantasyZone.js';
import { VoidZone } from '../src/world/zones/VoidZone.js';
import { TextureLibrary } from '../src/assets/TextureLibrary.js';
import { SURFACE_SPECS } from '../src/content/materialSurfaces.js';
import { makeUvCylinderGeometry } from '../src/engine/uvGeometry.js';

const 砖 = 1 / SURFACE_SPECS.drum.tileMeters;

const makeScene = () => ({ add() {}, remove() {} });
const makeDialog = () => ({ show() {}, toast() {} });

const 假纹理 = (v) => new THREE.DataTexture(new Uint8Array(48).fill(v), 4, 4);

/**
 * 给**所有烘焙组**假槽的一枚 `_loadSet` 桩（W-C5 切片10 起不只是 drum：crag / ice
 * 也在这个库里，且都是 `gen/` 下的程序化贴图）。判据取 URL 里的 `/gen/` 而不是逐个
 * 列名字面量 —— 再加第八种表面时这个桩不用跟着改：列名字面量的桩会在新表面进来时
 * 安静地只给旧组上贴，于是"新表面没接线"被桩伪装成"世界一切正常"。
 * 别的组（CC0 照片贴图）仍留全 null，与 node 里真的载不出图同形。
 */
const 装烘焙桩 = () => { TextureLibrary.prototype._loadSet = async function (def) {
  const set = { map: null, normalMap: null, roughnessMap: null, roughness: def.roughness ?? 0.85 };
  if (def?.normalMap?.[0]?.includes('/gen/')) {
    set.normalMap = 假纹理(130);
    set.roughnessMap = 假纹理(190);
  }
  return set;
}; };

/** 挂某份材质的网格（按引用找 —— 不靠几何参数猜，顺带钉住"这份材质真的在场景里"） */
function 找材质网格(root, mat) {
  const out = [];
  root.traverse((o) => { if (o.isMesh && o.material === mat) out.push(o); });
  return out;
}

/** 一枚几何的全部顶点 u/v 上限 */
function uv范围(geometry) {
  const uv = geometry.attributes.uv;
  let uMax = -Infinity, vMax = -Infinity;
  for (let i = 0; i < uv.count; i++) {
    uMax = Math.max(uMax, uv.getX(i));
    vMax = Math.max(vMax, uv.getY(i));
  }
  return { uMax, vMax };
}

/**
 * 按**表面名**取本区登记过的材质（W-C5 切片10 起必须这样取）。
 * 切片6 时一个区只登记一种表面，`_surfaceMats[0]` 就是石构；切片10 起
 * `createRock` 也登记 crag，下标顺序取决于各 build 方法的调用次序 —— 按下标取
 * 会把"石头材质"当成"石柱材质"，断言的还是 6 根断柱，错的却看不出来。
 */
function 本区表面(zone, surface) {
  const 命中 = zone._surfaceMats.filter((r) => r.surface === surface).map((r) => r.mat);
  expect(命中.length, `${zone.id ?? zone.constructor.name} 没有登记 ${surface} 表面`).toBeGreaterThan(0);
  return 命中;
}

/** 逐行 uMax（只走躯干分组；y 取 1e-4 舍入成行号）—— 与 material-surfaces 的同名读数同口径 */
function 柱行实测(o) {
  const g = o.geometry;
  const uv = g.attributes.uv;
  const pos = g.attributes.position;
  const { start, count } = g.groups[0];
  const 行 = new Map();
  for (let i = start; i < start + count; i++) {
    const vi = g.index.getX(i);
    const y = Math.round(pos.getY(vi) * 1e4) / 1e4;
    行.set(y, Math.max(行.get(y) ?? 0, uv.getX(vi)));
  }
  return 行;
}

describe('① 延迟补挂：世界先建好、贴图后到（build() 的 load().then 是真缝）', () => {
  it('build() 后石构是旧读数；load() 解析后同一份材质被上贴，且挂在网格上', async () => {
    expect(TextureLibrary.loaded(), '本用例必须最先跑：单例一旦 ready，延迟支就无法复现').toBe(null);
    const 真桩 = TextureLibrary.prototype._loadSet;
    装烘焙桩();
    // `WorldManager.build()` → `applyHubAtmosphere` 会发 zone-changed：真世界里接的人一大把，
    // node 里给一条通道即可（与 poi-identity 的夹具同款）
    const handlers = new Map();
    globalThis.window = {
      addEventListener(type, fn) {
        if (!handlers.has(type)) handlers.set(type, new Set());
        handlers.get(type).add(fn);
      },
      dispatchEvent(event) {
        handlers.get(event.type)?.forEach((fn) => fn(event));
        return true;
      },
    };
    globalThis.CustomEvent = class {
      constructor(type, init) { this.type = type; this.detail = init?.detail; }
    };
    try {
      const world = new WorldManager(new THREE.Scene(), makeDialog());
      world.build();

      const fantasy = world.zones[0];
      const voidZone = world.zones[3];
      const hubMat = world._hubSurfaceMat;
      expect(hubMat, 'hub 石柱没登记材质 —— applySurfaceTextures 无从补挂').toBeTruthy();
      const 断柱 = 找材质网格(fantasy.group, 本区表面(fantasy, 'drum')[0]);
      const 尖碑柱 = 找材质网格(voidZone.group, 本区表面(voidZone, 'drum')[0]);
      const hub柱 = 找材质网格(world.scene, hubMat);
      expect(断柱, '废墟断柱没找到 6 根 —— 这条用例没量到石构').toHaveLength(6);
      expect(尖碑柱, '尖碑柱身没找到').toHaveLength(1);
      expect(hub柱, '世界之锚的中央石柱没找到').toHaveLength(1);

      // —— 库未解析：三处都是退路读数（hub 0.85 / 断柱 0.9 / 尖碑 0.85）
      expect(hubMat.normalMap, '库里还没有 drum 时不该凭空有法线图').toBe(null);
      expect(hubMat.roughness, '未上贴时该是石柱自己的旧读数 0.85').toBe(0.85);
      expect(断柱[0].material.roughness, '未上贴时断柱该是旧读数 0.9').toBe(0.9);
      expect(尖碑柱[0].material.roughness, '未上贴时尖碑柱身该是旧读数 0.85').toBe(0.85);

      const lib = await TextureLibrary.load();
      expect(TextureLibrary.loaded()).toBe(lib);
      const 变体 = lib.uvVariant('drum', 砖, 砖);
      expect(变体, 'drum 没进 MANIFEST，或桩没给上假槽 —— 延迟支无从见证').not.toBe(null);

      // —— 上贴后：同一份材质（断柱 6 根共用一份）被补挂
      expect(hubMat.normalMap, 'load() 解析后延迟的 .then 没把贴图上到 hub 石柱').toBe(变体.normalMap);
      expect(hubMat.roughnessMap).toBe(变体.roughnessMap);
      expect(hubMat.roughness, '贴图在时 roughness 必须是 1（贴图是唯一真源）').toBe(1);
      expect(hubMat.normalScale.x, '上贴时该把法线强度收到 0.8').toBe(0.8);
      expect(hubMat.normalMap.repeat.x, '铺数与 tileMeters 脱节').toBe(砖);
      expect(hubMat.normalMap.source, 'clone 必须共享 Source（GPU 只传一份）').toBe(lib.sets.drum.normalMap.source);
      expect(hubMat.version, '上贴后要重收程序（needsUpdate）—— 已编译材质换贴图的唯一开关').toBeGreaterThanOrEqual(1);
      expect(断柱[0].material.normalMap, '断柱材质没被补挂').toBe(变体.normalMap);
      expect(断柱[0].material.color.getHex(), '贴图只管表面事实，颜色仍是石材自己的').toBe(0x8a8580);
      expect(尖碑柱[0].material.normalMap, '尖碑柱身没被补挂').toBe(变体.normalMap);
      expect(尖碑柱[0].material.emissive.getHex(), '贴图不改自发光 —— 尖碑还是那座尖碑').toBe(0xc9a962);

      // —— 顶盖不是石段：八面体 UV 非米制，保持无贴图（与柱身分家的证据）
      const 顶盖 = [];
      voidZone.group.traverse((o) => { if (o.isMesh && o.geometry.type === 'OctahedronGeometry') 顶盖.push(o); });
      expect(顶盖, '尖碑顶盖没找到 —— 这条断言在量空气').toHaveLength(1);
      expect(顶盖[0].material, '顶盖与柱身还共用一份材质 —— 分家没发生').not.toBe(本区表面(voidZone, 'drum')[0]);
      expect(顶盖[0].material.normalMap, '顶盖 UV 非米制，不该被上贴').toBe(null);
      expect(顶盖[0].material.roughness).toBe(0.85);

      // —— 几何：柱身的 uMax = 绕底圈的米数（1.2↔1.8 的收分柱是 2π·1.8、尖碑 2π·1.2）
      const hubg = uv范围(hub柱[0].geometry);
      expect(hubg.uMax, 'hub 石柱 uMax 不是绕底圈的米数 2π·1.8').toBeCloseTo(2 * Math.PI * 1.8, 3);
      expect(hubg.vMax, 'hub 石柱 vMax 不是高 10').toBeCloseTo(10, 3);
      const voidg = uv范围(尖碑柱[0].geometry);
      expect(voidg.uMax, '尖碑柱身 uMax 不是绕底圈的米数 2π·1.2').toBeCloseTo(2 * Math.PI * 1.2, 3);

      // —— 补挂份数 = 登记数。Slice10 起各区还登记了外野岩/冰，所以不再是 3：
      //     hub 1 + Fantasy(drum 断柱 / crag 散石) + Abyss(crag) + Gloom(crag)
      //           + Void(drum 尖碑 / crag 散石) + Space(ice / crag) + Radiant(crag) = 10
      // 逐条点名的意义：总数对得上也可能"漏挂的那一份刚好被别的抵掉"，所以下面按
      // 登记表逐条问一遍 —— 每一条都该拿到**它自己那个表面**的变体（拿错表面也是红）。
      const 登记 = world.zones.flatMap((z) => z._surfaceMats.map((r) => ({ ...r, 区: z.id })));
      expect(world.applySurfaceTextures(lib), '补挂份数与登记数不符').toBe(登记.length + 1);
      for (const { mat, surface, 区 } of 登记) {
        const 铺 = 1 / SURFACE_SPECS[surface].tileMeters;
        const v = lib.uvVariant(surface, 铺, 铺);
        expect(mat.normalMap, `${区} 登记的 ${surface} 没被补挂（或挂成了别的表面）`).toBe(v.normalMap);
        expect(mat.roughness, `${区} 的 ${surface} 上贴后 roughness 不是 1`).toBe(1);
      }
      // —— 重复调用幂等：重挂不换壳、不重复建变体
      expect(hubMat.normalMap, '再次补挂换了壳 —— uvVariant 缓存没生效').toBe(变体.normalMap);
    } finally {
      TextureLibrary.prototype._loadSet = 真桩;
      delete globalThis.window;
      delete globalThis.CustomEvent;
    }
  });
});

describe('② 同步支：库已就绪时构造区域 ⇒ 登记的石材出生即贴图态', () => {
  it('与 uvVariant 同一份壳；断柱 6 根各归各的网格、共用一份材质', () => {
    const lib = TextureLibrary.loaded();
    expect(lib, '① 该已把库加载好 —— 顺序被人动了？').not.toBe(null);
    const 变体 = lib.uvVariant('drum', 砖, 砖);

    const fantasy = new FantasyZone(makeScene(), { x: -200, z: 0 }, makeDialog());
    const drum们 = 本区表面(fantasy, 'drum');
    expect(drum们, '断柱 drum 只该登记一份').toHaveLength(1);
    const stoneMat = drum们[0];
    expect(stoneMat.normalMap, '已就绪的库在构造时没被用上 —— 同步支没跑').toBe(变体.normalMap);
    expect(stoneMat.roughness).toBe(1);
    expect(stoneMat.normalScale.x).toBe(0.8);
    expect(找材质网格(fantasy.group, stoneMat), '6 根断柱该共用同一份材质（GPU 与 draw 各只一份）').toHaveLength(6);

    const voidZone = new VoidZone(makeScene(), { x: 0, z: 220 }, makeDialog());
    expect(本区表面(voidZone, 'drum'), '尖碑 drum 只该登记柱身一份（顶盖不是石段）').toHaveLength(1);
    expect(本区表面(voidZone, 'drum')[0].normalMap).toBe(变体.normalMap);
    const cap = [];
    voidZone.group.traverse((o) => { if (o.isMesh && o.geometry.type === 'OctahedronGeometry') cap.push(o); });
    expect(cap[0].material.normalMap, '八面体顶盖被上贴了 —— 分家回归').toBe(null);
  });
});

describe('③ 退路：sets.drum 没加载出来 ⇒ 旧读数，但几何仍是米制', () => {
  it('sets.drum 不在：石材回到 0.9 / 无贴图；断柱 uMax 仍绕底圈', () => {
    const lib = TextureLibrary.loaded();
    const 备用 = lib.sets.drum;
    delete lib.sets.drum;
    try {
      const fantasy = new FantasyZone(makeScene(), { x: -200, z: 0 }, makeDialog());
      const mat = 本区表面(fantasy, 'drum')[0];
      expect(mat.normalMap, 'drum 不在时不该有法线图').toBe(null);
      expect(mat.roughnessMap).toBe(null);
      expect(mat.roughness, '无贴图时该回到旧读数 0.9').toBe(0.9);
      const 柱 = 找材质网格(fantasy.group, mat);
      expect(柱, '退路下断柱没建出来 —— 几何断言无从落地').toHaveLength(6);
      const { uMax } = uv范围(柱[0].geometry);
      expect(uMax, '退路下断柱 uMax 不是绕底圈的米数 2π·0.8 —— 几何换用没发生').toBeCloseTo(2 * Math.PI * 0.8, 3);
    } finally {
      lib.sets.drum = 备用;
    }
  });
});

describe('④ 柱面几何的尺子：逐行 = 该行半径的周长；反向对照裸圆柱量出 0..1', () => {
  it('0.6↔0.8 收分柱每行都算自己的半径；裸 CylinderGeometry 同把尺全 1', () => {
    const 柱 = new THREE.Mesh(makeUvCylinderGeometry(0.6, 0.8, 5, 8));
    const p = 柱.geometry.parameters;
    expect(p.radiusTop).toBe(0.6);
    expect(p.radiusBottom).toBe(0.8);
    const { uMax, vMax } = uv范围(柱.geometry);
    expect(uMax, '柱的全局 uMax 不是绕底圈的米数').toBeCloseTo(2 * Math.PI * 0.8, 3);
    expect(vMax, '柱的 vMax 不是高').toBeCloseTo(5, 3);

    const 行 = 柱行实测(柱);
    expect(行.size, '躯干该有 ≥2 行顶点（上/下）').toBeGreaterThanOrEqual(2);
    for (const [y, u] of 行) {
      const r = ((p.height / 2 - y) / p.height) * (p.radiusBottom - p.radiusTop) + p.radiusTop;
      expect(u, `y=${y} 行的 uMax=${u.toFixed(4)}，不是该行半径的周长 2π·${r.toFixed(4)}≈${(2 * Math.PI * r).toFixed(4)}`)
        .toBeCloseTo(2 * Math.PI * r, 3);
    }

    // 反向对照：裸圆柱的 UV 是每面 0..1（没有这把尺，上面的断言可以说不上量了什么）
    const 裸 = new THREE.CylinderGeometry(0.6, 0.8, 5, 8);
    const 裸范围 = uv范围(裸);
    expect(裸范围.uMax, '裸圆柱 uMax 居然不是 1 —— 这把尺量不出"米制"与"0..1"之别').toBeCloseTo(1, 6);
    expect(裸范围.vMax).toBeCloseTo(1, 6);
  });
});
