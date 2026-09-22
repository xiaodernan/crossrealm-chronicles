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

  /** 为已有 mesh 批量换贴图 */
  applyToMesh(mesh, setName, colorTint = null) {
    if (!mesh?.isMesh) return;
    const old = mesh.material;
    const mat = this.createMaterial(setName, colorTint ? { color: new THREE.Color(colorTint) } : {});
    if (old?.map && !mat.map) mat.map = old.map;
    mesh.material = mat;
    mesh.castShadow = mesh.castShadow ?? true;
    mesh.receiveShadow = mesh.receiveShadow ?? true;
  }
}
