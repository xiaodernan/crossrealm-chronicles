/**
 * 武器贴图（steel，拉丝金属）的门禁（W-C5 切片5）。
 *
 * ## 这一片交付了什么
 * 第五种烘焙表面 `steel`（0.25 米一铺的水平拉丝，见 `content/materialSurfaces.js`）接到
 * 玩家的剑上（`player/PlayerController.js` 的 `_buildWeapon`）。它有两个新东西：
 * 1. **首个非分块图案族**（`brushed`）—— 烘焙器的分派从单实现变成 `SURFACE_BUILDERS` 查表
 *    （按族分家的读数尺在 `material-surfaces.test.js` 的 ② 里，这里不重复）；
 * 2. **首个"后到上贴"的消费方**：`_loadModel` 不等贴图库（模型与贴图各加载各的），
 *    剑可能先于 `TextureLibrary` 就绪出生 —— 所以消费侧是两段式：
 *    已就绪就直接上；没就绪挂到 `TextureLibrary.load()` 的同一份缓存 promise 上。
 *
 * ## 这里钉住的三层（坏法各不同）
 * 1. **延迟支**（本文件第一个用例，顺序即门禁）：构造时库未就绪 ⇒ 剑按旧读数出生
 *    （roughness 0.35、无贴图、normalScale 1）；`load()` 解析后**同一份材质**被上贴
 *    （与 `uvVariant('steel', 4, 4)` 同一份壳、roughness=1、normalScale 0.8、repeat=4、
 *    `needsUpdate` 翻过版本号）。漏掉 `.then` 那一支的症状是"整局没有金属纹理"，
 *    不会报错。
 * 2. **同步支与退路支**：库已就绪 ⇒ 构造即上贴；`sets.steel` 不在 ⇒ 退回旧读数，
 *    但**几何仍是米制 UV**（贴图在不在与几何换用无关）。
 * 3. **几何**：`makeUvBoxGeometry(0.06, 0.9, 0.12)` 的逐面 UV = 该面自己的尺寸（米）；
 *    反向对照：裸 `BoxGeometry` 同一把尺量出全 1。第三人称剑与第一人称剑共享
 *    几何与材质（clone 的语义 —— 一次上贴覆盖两把）。
 *
 * ## 为什么顺序是硬约束
 * `TextureLibrary` 是单例，一旦 ready 就回不到"未加载"态；vitest 每个测试文件
 * 独立模块图，所以本文件内**第一条碰库的用例必须是延迟支**（用例里第一句就自证
 * `loaded() === null`）。node 里 TextureLoader 载不出图，所以延迟支用 `_loadSet`
 * 原型桩给 steel 假槽（真 `DataTexture`，有 Source 可共享）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three';
import { PlayerController } from '../src/player/PlayerController.js';
import { CharacterModel } from '../src/player/CharacterModel.js';
import { TextureLibrary } from '../src/assets/TextureLibrary.js';
import { SURFACE_SPECS } from '../src/content/materialSurfaces.js';

const 砖 = 1 / SURFACE_SPECS.steel.tileMeters;

/** 只跑构建剑所需的宿主：真构造器、真 CameraRig，贴图库不注入（消费侧自己两段式） */
const mkPlayer = () => new PlayerController(
  new THREE.Group(),
  new THREE.PerspectiveCamera(62, 1, 0.1, 100),
  { getGroundHeight: () => 0, collision: null, bounds: null },
  { paused: false, cinematicActive: false, autoPlayMode: false, dialog: { toast() {} }, combatCamera: null, restScene: null },
);

const 假纹理 = (v) => new THREE.DataTexture(new Uint8Array(48).fill(v), 4, 4);

/** 只给 steel 假槽的一枚 `_loadSet` 桩（别的组留全 null，与 node 里载不出图同形） */
const 装钢桩 = () => { TextureLibrary.prototype._loadSet = async function (def) {
  const set = { map: null, normalMap: null, roughnessMap: null, roughness: def.roughness ?? 0.85 };
  if (def?.normalMap?.[0]?.includes('steel')) {
    set.normalMap = 假纹理(130);
    set.roughnessMap = 假纹理(190);
  }
  return set;
}; };

/** 不分段盒的六面 UV 尺寸表（面序 px/nx/py/ny/pz/nz，每面 4 顶点）—— 与 uvGeometry 互为见证 */
const 盒面期望 = (w, h, d) => [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];

/** 一枚不分段盒的逐面实测 u/v 上限（每面 4 顶点，与 uvGeometry 的顶点序约定对齐） */
function 逐面盒实测(geometry) {
  const uv = geometry.attributes.uv;
  if (uv.count !== 24) throw new Error(`逐面盒实测只接受 24 顶点的盒，拿到 ${uv.count}`);
  const out = [];
  for (let f = 0; f < 6; f++) {
    let u = 0, v = 0;
    for (let i = f * 4; i < f * 4 + 4; i++) {
      u = Math.max(u, uv.getX(i));
      v = Math.max(v, uv.getY(i));
    }
    out.push([u, v]);
  }
  return out;
}

const 剑 = (p) => p.mesh.getObjectByName('weapon');

let 真load;
beforeAll(() => {
  // 不碰网络：真 CharacterModel.load 会试三个 glb 地址（node 里全部失败后回退程序模型）
  真load = CharacterModel.prototype.load;
  CharacterModel.prototype.load = async function () {};
});
afterAll(() => { CharacterModel.prototype.load = 真load; });

describe('① 延迟上贴：剑先建好、贴图后到（_loadModel 不等库）', () => {
  it('构造时库未就绪 ⇒ 旧读数出生；load() 解析后同一份材质被上贴', async () => {
    expect(TextureLibrary.loaded(), '本用例必须最先跑：单例一旦 ready，延迟支就无法复现').toBe(null);
    const 真桩 = TextureLibrary.prototype._loadSet;
    装钢桩();
    try {
      const p = mkPlayer();
      await p.modelReady;
      const sword = 剑(p);
      expect(sword, '角色身上没找到 weapon').toBeTruthy();
      expect(sword.material.normalMap, '库里还没有 steel 时不该凭空有法线图').toBe(null);
      expect(sword.material.roughness, '未上贴时该是剑自己的旧读数 0.35').toBe(0.35);
      expect(sword.material.normalScale.x, '未上贴时 normalScale 该是 three 的默认 1').toBe(1);

      const lib = await TextureLibrary.load();
      expect(TextureLibrary.loaded()).toBe(lib);
      const 变体 = lib.uvVariant('steel', 砖, 砖);
      expect(变体, 'steel 没进 MANIFEST，或桩没给上假槽 —— 延迟支无从见证').not.toBe(null);
      expect(sword.material.normalMap, 'load() 解析后延迟的 .then 没把贴图上到同一份材质').toBe(变体.normalMap);
      expect(sword.material.roughnessMap).toBe(变体.roughnessMap);
      expect(sword.material.roughness, '贴图在时 roughness 必须是 1（贴图是唯一真源）').toBe(1);
      expect(sword.material.normalScale.x, '上贴时该把法线强度收到 0.8').toBe(0.8);
      expect(sword.material.normalMap.repeat.x, '铺数与 tileMeters 脱节').toBe(砖);
      expect(sword.material.normalMap.source, 'clone 必须共享 Source（GPU 只传一份）').toBe(lib.sets.steel.normalMap.source);
      expect(sword.material.version, '上贴后要重收程序（needsUpdate）—— 已编译材质换贴图的唯一开关').toBeGreaterThanOrEqual(1);
      expect(sword.material.color.getHex(), '贴图只管表面事实，颜色仍是剑自己的').toBe(0xc9a962);
    } finally {
      TextureLibrary.prototype._loadSet = 真桩;
    }
  });
});

describe('② 同步上贴：库已就绪时构造即上贴', () => {
  it('与 uvVariant 同一份壳；两只剑的材质各归各的（纹理共享）', async () => {
    const lib = TextureLibrary.loaded();
    expect(lib, '① 该已把库加载好 —— 顺序被人动了？').not.toBe(null);
    // 显式给本用例自己的夹具（不借 ① 的桩），两条路径各自可读
    lib.sets.steel = { map: null, normalMap: 假纹理(130), roughnessMap: 假纹理(190), roughness: 1 };
    const 变体 = lib.uvVariant('steel', 砖, 砖);

    const a = mkPlayer();
    const b = mkPlayer();
    await Promise.all([a.modelReady, b.modelReady]);
    const 剑A = 剑(a), 剑B = 剑(b);
    expect(剑A.material.normalMap, '已就绪的库在构造时没被用上 —— 同步支没跑').toBe(变体.normalMap);
    expect(剑A.material.roughness).toBe(1);
    expect(剑A.material.normalScale.x).toBe(0.8);
    expect(剑B.material, '两把剑的材质该各归各的').not.toBe(剑A.material);
    expect(剑B.material.normalMap, '纹理是共享壳（GPU 只传一份）').toBe(剑A.material.normalMap);
  });
});

describe('③ 退路：steel 没加载出来 ⇒ 旧读数，但几何仍是米制', () => {
  it('sets.steel 不在：材质回到 0.35 / 无贴图；逐面 UV 不受影响', async () => {
    const lib = TextureLibrary.loaded();
    const 备用 = lib.sets.steel;
    delete lib.sets.steel;
    try {
      const p = mkPlayer();
      await p.modelReady;
      const sword = 剑(p);
      expect(sword.material.normalMap, 'steel 不在时不该有法线图').toBe(null);
      expect(sword.material.roughnessMap).toBe(null);
      expect(sword.material.roughness, '无贴图时该回到旧读数 0.35').toBe(0.35);
      const 实测 = 逐面盒实测(sword.geometry);
      expect(实测[0][0], '退路下剑身 uMax 不是米 —— 几何换用没发生').toBeCloseTo(0.12, 6);
      expect(实测[0][1]).toBeCloseTo(0.9, 6);
    } finally {
      lib.sets.steel = 备用;
    }
  });
});

describe('④ 剑身几何：逐面 UV = 该面自己的尺寸（米）', () => {
  it('盒逐面 = 该面自己的尺寸；第三人称与第一人称共享几何与材质', async () => {
    const p = mkPlayer();
    await p.modelReady;
    const sword = 剑(p);
    const g = sword.geometry;
    expect(g.type).toBe('BoxGeometry');
    const par = g.parameters;
    expect(par).toMatchObject({ width: 0.06, height: 0.9, depth: 0.12 });
    const 实测 = 逐面盒实测(g);
    const 期望 = 盒面期望(par.width, par.height, par.depth);
    for (let f = 0; f < 6; f++) {
      expect(实测[f][0], `第 ${f} 面 uMax=${实测[f][0]}，不是该面自己的尺寸`).toBeCloseTo(期望[f][0], 6);
      expect(实测[f][1], `第 ${f} 面 vMax=${实测[f][1]}，不是该面自己的尺寸`).toBeCloseTo(期望[f][1], 6);
    }
    const fp = p.fpWeaponGroup.children[0];
    expect(fp, '第一人称组里该挂着一把剑').toBeTruthy();
    expect(fp.geometry, '第一人称剑该共享几何（clone 的语义）').toBe(g);
    expect(fp.material, '第一人称剑该共享材质 —— 一次上贴覆盖两把').toBe(sword.material);
  });

  it('反向对照：裸 BoxGeometry 的逐面 uMax 全是 1（这把尺量的是米，不是 0..1）', () => {
    const 裸 = new THREE.BoxGeometry(0.06, 0.9, 0.12);
    for (const [u, v] of 逐面盒实测(裸)) {
      expect(u, '裸盒的逐面 uMax 居然不是 1 —— 逐面实测的顶点序约定变了').toBeCloseTo(1, 6);
      expect(v).toBeCloseTo(1, 6);
    }
  });
});
