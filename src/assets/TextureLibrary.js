import * as THREE from 'three';

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

  async init() {
    for (const [key, def] of Object.entries(MANIFEST)) {
      this.sets[key] = await this._loadSet(def);
    }
    this.ready = true;
    return this;
  }

  async _loadSet(def) {
    const map = await this._loadFirst(def.map);
    const normalMap = await this._loadFirst(def.normalMap);
    for (const tex of [map, normalMap]) {
      if (!tex) continue;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(def.repeat[0], def.repeat[1]);
      tex.colorSpace = tex === map ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.anisotropy = 4;
    }
    return { map, normalMap, roughness: def.roughness ?? 0.85 };
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
    const mat = new THREE.MeshStandardMaterial({
      map: set.map ?? undefined,
      normalMap: set.normalMap ?? undefined,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: set.roughness,
      metalness: 0.04,
      envMapIntensity: 0.45,
      ...overrides,
    });
    if (set.map) mat.color.setHex(0xffffff);
    return mat;
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
    mesh.castShadow = mesh.castShadow ?? true;
    mesh.receiveShadow = mesh.receiveShadow ?? true;
  }
}
