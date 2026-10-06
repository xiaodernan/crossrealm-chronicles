import * as THREE from 'three';
import { SURFACE_SPECS } from '../content/materialSurfaces.js';

const LOCAL = '/textures';

/** CC0 贴图（Poly Haven）— 本地 public/textures + CDN 回退 */
const MANIFEST = {
  grass: {
    map: [`${LOCAL}/grass_diff.jpg`, 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/aerial_grass_rock/aerial_grass_rock_diff_1k.jpg'],
    normalMap: [`${LOCAL}/grass_nor.jpg`, 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/aerial_grass_rock/aerial_grass_rock_nor_gl_1k.jpg'],
    repeat: [48, 56],
    roughness: 0.88,
  },
  path: {
    map: [`${LOCAL}/path_diff.jpg`, 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brown_mud_leaves_01/brown_mud_leaves_01_diff_1k.jpg'],
    normalMap: [`${LOCAL}/path_nor.jpg`, 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brown_mud_leaves_01/brown_mud_leaves_01_nor_gl_1k.jpg'],
    repeat: [12, 12],
    roughness: 0.82,
  },
  rock: {
    map: [`${LOCAL}/rock_diff.jpg`, 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rock_face/rock_face_diff_1k.jpg'],
    normalMap: [`${LOCAL}/rock_nor.jpg`, 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rock_face/rock_face_nor_gl_1k.jpg'],
    repeat: [4, 4],
    roughness: 0.92,
  },
  forest: {
    map: [`${LOCAL}/forest_diff.jpg`, 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/forest_ground_04/forest_ground_04_diff_1k.jpg'],
    normalMap: [`${LOCAL}/forest_nor.jpg`, 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/forest_ground_04/forest_ground_04_nor_gl_1k.jpg'],
    repeat: [32, 32],
    roughness: 0.9,
  },
  bark: {
    map: [`${LOCAL}/rock_diff.jpg`, 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/forest_ground_04/forest_ground_04_diff_1k.jpg'],
    normalMap: [`${LOCAL}/rock_nor.jpg`, 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/forest_ground_04/forest_ground_04_nor_gl_1k.jpg'],
    repeat: [1.2, 2.5],
    roughness: 0.95,
  },
  /**
   * 石砌（W-C5）：**程序生成、离线烘焙**的贴图 —— 没有 CDN 回退，本地文件就是全部。
   * 文件与数值都从 `content/materialSurfaces.js` 的规格表来（名字只有那一份），
   * 由 `npm run bake:textures` 产出、`tests/material-surfaces.test.js` 重算比对。
   * 没有 `map`：颜色留给各材料自己的 `color`（副本按主题染色），这里只管
   * normal + roughness 两种"表面事实"。消费方请走 `uvVariant`（表面尺寸各异）。
   * 这里的 repeat 是 `1 / 一砖米数`：地下城的几何 UV 以米计（dungeonAssets 的 uvBox 族），
   * 一砖两米 ⇒ 铺数 0.5，墙、地面、柱子无论多大都是同一个砖尺寸。
   */
  masonry: {
    normalMap: [`${LOCAL}/${SURFACE_SPECS.masonry.files.normal}`],
    roughnessMap: [`${LOCAL}/${SURFACE_SPECS.masonry.files.roughness}`],
    repeat: [1 / SURFACE_SPECS.masonry.tileMeters, 1 / SURFACE_SPECS.masonry.tileMeters],
    roughness: 1.0,
  },
};

let _instance = null;
let _loading = null;

export class TextureLibrary {
  constructor() {
    this.loader = new THREE.TextureLoader();
    this.sets = {};
    this.ready = false;
    /** 换贴图用的共享材质：`键 → 材质`（W-C1 切片2，关 B73 的剩下一半）。见 `sharedMaterial` */
    this._shared = new Map();
    /** 平铺变体：`键 → { normalMap, roughnessMap, map }`（W-C5）。见 `uvVariant` */
    this._variants = new Map();
  }

  static load() {
    if (_instance?.ready) return Promise.resolve(_instance);
    if (!_loading) {
      _loading = new TextureLibrary().init().then((lib) => {
        _instance = lib;
        return lib;
      });
    }
    return _loading;
  }

  /**
   * 已就绪的单例，不触发加载（W-C5）。给**同步构建路径**用 —— 它们没法 await：
   * `ProceduralDungeonGenerator.buildGeometry` 在进入副本那一刻同步跑，拿不到就按
   * 无贴图构建（几何与配色照旧，只是没有 normal/roughness），下次重建时自然拿到。
   * 未初始化 / 还在加载中返回 `null`。
   */
  static loaded() {
    return _instance?.ready ? _instance : null;
  }

  async init() {
    for (const [key, def] of Object.entries(MANIFEST)) {
      this.sets[key] = await this._loadSet(def);
    }
    this.ready = true;
    return this;
  }

  async _loadSet(def) {
    const set = { roughness: def.roughness ?? 0.85 };
    for (const slot of ['map', 'normalMap', 'roughnessMap']) {
      // 每个槽都可以缺省（masonry 没有颜色图；CC0 组没有 roughnessMap）——
      // 缺省的槽留在 set 上是 `null`，下游按"没有"处理，不写 undefined 骗过 three 的参数检查
      set[slot] = def[slot] ? (await this._loadFirst(def[slot])) : null;
      const tex = set[slot];
      if (!tex) continue;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(def.repeat[0], def.repeat[1]);
      // 颜色图是 sRGB；法线 / 粗糙度是数据图，必须线性（NoColorSpace）
      tex.colorSpace = slot === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.anisotropy = 4;
    }
    return set;
  }

  async _loadFirst(urls) {
    for (const url of urls) {
      try {
        return await this.loader.loadAsync(url);
      } catch {
        /* try next */
      }
    }
    return null;
  }

  createMaterial(setName, overrides = {}) {
    const set = this.sets[setName] ?? this.sets.grass;
    // 只写真的存在的槽：写 `map: undefined` 会让 three 的 setValues 打一条
    // "parameter 'map' has value of undefined" 警告（masonry 没有颜色图就会每份材质一条）
    const params = {
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: set.roughness,
      metalness: 0.04,
      envMapIntensity: 0.45,
      ...overrides,
    };
    if (set.map) params.map = set.map;
    if (set.normalMap) params.normalMap = set.normalMap;
    if (set.roughnessMap) params.roughnessMap = set.roughnessMap;
    const mat = new THREE.MeshStandardMaterial(params);
    if (set.map) mat.color.setHex(0xffffff);
    return mat;
  }

  /**
   * 平铺变体（W-C5）：同一份贴图、**按铺数**认领的一件套。
   *
   * ## 为什么要 clone 而不是把 set 级贴图直接挂上
   * `repeat` 挂在**纹理对象**上：set 级那份是给 `createMaterial` / `applyToMesh` 那条
   * 0..1-UV 世界路径的（草地的 48×56 就是那种口径）。地下城的 UV 以米计
   * （dungeonAssets 的 uvBox 族），要的铺数是 `1 / 一砖米数` —— 两条口径的消费者
   * 各自的铺数不该互相踩。`Texture.clone()`（three r172 的 `Texture.copy`：`this.source = source.source`）
   * 共享同一个 `Source`：**GPU 纹理只有一份上传**，变体只多一个薄薄的对象壳。
   *
   * 缓存键是 `setName@rx×ry`：铺数相同就同一份壳（今天地形全用 0.5 一档 ⇒ 全域一份），
   * 将来多一档密度就是多一份壳，纹理数据不重复。
   *
   * ## 契约
   * - 返回 `{ map, normalMap, roughnessMap }`（没有的槽是 `null`），或整套没加载出来时 `null` ——
   *   调用方（`ProceduralDungeonGenerator`）拿 `null` 就走无贴图分支，与 `loaded()` 为 null 同形。
   * - 变体上的 `wrapS/T`、`colorSpace`、`anisotropy` 从 set 继承；返回的纹理**是全库共用的**，
   *   不要就地改（要改请自己 clone 一份）。
   */
  uvVariant(setName, rx, ry) {
    const set = this.sets[setName];
    if (!set) return null;
    if (!set.map && !set.normalMap && !set.roughnessMap) return null;
    const key = `${setName}@${rx}x${ry}`;
    const hit = this._variants.get(key);
    if (hit) return hit;
    const variant = {};
    for (const slot of ['map', 'normalMap', 'roughnessMap']) {
      const src = set[slot];
      if (!src) { variant[slot] = null; continue; }
      const tex = src.clone();
      tex.repeat.set(rx, ry);
      variant[slot] = tex;
    }
    this._variants.set(key, variant);
    return variant;
  }

  /** 建过几份平铺变体：泄漏 watchdog 与用例看这个，不翻内部结构 */
  uvVariantCount() {
    return this._variants.size;
  }

  /**
   * 换贴图用的**共享**材质（W-C1 切片2，关 B73 的剩下一半）。
   *
   * 修前 `applyToMesh` 每调一次就 `createMaterial` 一份：`_upgradeProps` 遍历整棵场景树，
   * 于是"场上有多少根柱子 / 多少块石头"就新建多少份材质 —— 而 `(setName, tint)` 全仓只有
   * **三种**组合。改前普查（同一口径）：500 件掉落 +500 份材质；这里同形，只是随**场景道具数**增长。
   *
   * 刻意**不动 `createMaterial`** —— 它有 8 处调用点（地形、树干…），其中几处拿到材质后会就地改
   * （颜色、覆盖项）。给一个被就地改的东西加缓存，等于把"改这一份"变成"改掉所有共用者"。
   * 所以这里另开一条**只读共享**路径：拿到的材质不该被改，要改请用 `createMaterial` 要一份私有的。
   *
   * 键里带上 `overrides` 的字面量：`flatShading` 这类差异会让两份材质不能共用，
   * 而让调用方"先共享再就地改"正是这份缓存要挡住的事。
   */
  sharedMaterial(setName, colorTint = null, overrides = null) {
    const key = `${setName}|${colorTint ?? ''}|${overrides ? JSON.stringify(overrides) : ''}`;
    const hit = this._shared.get(key);
    if (hit) return hit;
    const mat = this.createMaterial(setName, {
      ...(colorTint === null || colorTint === undefined ? {} : { color: new THREE.Color(colorTint) }),
      ...(overrides ?? {}),
    });
    this._shared.set(key, mat);
    return mat;
  }

  /** 这一份共享材质被建了几份：泄漏 watchdog 与用例看这个，不翻内部结构 */
  sharedMaterialCount() {
    return this._shared.size;
  }

  /**
   * 为已有 mesh 批量换贴图。材质**共享**（见 `sharedMaterial`）；
   * `overrides` 参与缓存键 —— 不要把共享出来的材质拿去就地改。
   */
  applyToMesh(mesh, setName, colorTint = null, overrides = null) {
    if (!mesh?.isMesh) return;
    const old = mesh.material;
    const mat = this.sharedMaterial(setName, colorTint, overrides);
    if (old?.map && !mat.map) mat.map = old.map;
    mesh.material = mat;
  }
}
