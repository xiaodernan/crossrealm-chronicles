/**
 * 换贴图用的共享材质（W-C1 切片2，关 B73 的剩下一半）。
 *
 * ## 修的是什么
 *
 * `TextureLibrary.applyToMesh` 每调一次就 `createMaterial` 一份新材质，而 `SceneEnhancer._upgradeProps`
 * 是**遍历整棵场景树**调它的 —— 场上有多少根柱子 / 多少块石头，就新建多少份材质，
 * 而 `(setName, tint)` 全仓只有**三种**组合。这与 B73 的掉落半区同形：
 * 都是"随数量线性增长、而不同形状其实没几份"。
 *
 * ## 关键取舍：不动 `createMaterial`，另开一条共享路径
 *
 * `createMaterial` 有 8 处调用点（地形、树干…），其中几处**拿到材质后会就地改**。
 * 给一个会被就地改的东西加缓存，等于把"改这一份"变成"改掉所有共用者" ——
 * 那比现在这份线性增长的账难查得多。所以：
 * - `sharedMaterial()` —— **只读共享**，给 `applyToMesh` 用，拿到的不该被改；
 * - `createMaterial()` —— 保持原样，要改就管它要一份私有的。
 *
 * 这两条分工本身要用例钉住（`createMaterial` 仍每次新建），否则下一个人"顺手"给 `createMaterial`
 * 加个缓存就把地形那几处一起改坏了。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TextureLibrary } from '../src/assets/TextureLibrary.js';
import { WorldDecorations } from '../src/world/WorldDecorations.js';

/** 造一个不用真的去加载贴图的库：`sets` 直接给，形状与 `init()` 产出的一致 */
function fakeLib(sets = {}) {
  const lib = new TextureLibrary();
  for (const [name, def] of Object.entries(sets)) {
    lib.sets[name] = { map: def.map ?? null, normalMap: null, roughness: def.roughness ?? 0.85 };
  }
  lib.ready = true;          // 生产里由 `init()` 置真；假库直接给，否则消费方会提前返回
  return lib;
}

const propMesh = (name = 'trunk') => {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x112233 }),
  );
  mesh.name = name;
  return mesh;
};

describe('共享材质：同 (setName, tint) 只建一份', () => {
  it('300 根柱子换完贴图 = 1 份材质，而不是 300 份', () => {
    const lib = fakeLib({ rock: { roughness: 0.9 } });
    const meshes = Array.from({ length: 300 }, () => propMesh('pillar'));
    for (const m of meshes) lib.applyToMesh(m, 'rock', 0x6a5a48);
    expect(lib.sharedMaterialCount()).toBe(1);
    // 而且每一根都真的换上了（共享不等于没换）
    expect(new Set(meshes.map((m) => m.material)).size).toBe(1);
    expect(meshes.every((m) => m.material === lib.sharedMaterial('rock', 0x6a5a48))).toBe(true);
  });

  it('三种 tint 就是三份 —— 份数跟着"有几种组合"走，不跟着道具有几个走', () => {
    const lib = fakeLib({ rock: {} });
    for (let i = 0; i < 50; i++) {
      lib.applyToMesh(propMesh('a'), 'rock', 0x6a5a48);
      lib.applyToMesh(propMesh('b'), 'rock', 0x8a8580);
      lib.applyToMesh(propMesh('c'), 'rock', 0x5a5048);
    }
    expect(lib.sharedMaterialCount()).toBe(3);
  });

  it('tint 与 setName 都参与键：同色不同 set、同 set 无色，都各是一份', () => {
    const lib = fakeLib({ rock: {}, bark: {} });
    lib.applyToMesh(propMesh(), 'rock', 0x6a5a48);
    lib.applyToMesh(propMesh(), 'bark', 0x6a5a48);
    lib.applyToMesh(propMesh(), 'rock', null);
    expect(lib.sharedMaterialCount()).toBe(3);
  });

  it('overrides 参与键：`flatShading: false` 与缺省不共用（防"先共享再就地改"）', () => {
    const lib = fakeLib({ rock: {} });
    const a = propMesh();
    const b = propMesh();
    lib.applyToMesh(a, 'rock', 0x8a8580, { flatShading: false });
    lib.applyToMesh(b, 'rock', 0x8a8580);
    expect(a.material).not.toBe(b.material);
    expect(a.material.flatShading).toBe(false);
    expect(b.material.flatShading).toBe(false);   // 缺省本来就是 false，两者值相同但**不是同一份**
    expect(lib.sharedMaterialCount()).toBe(2);
  });
});

describe('正向门槛：共享不等于"把功能删掉来减负"', () => {
  it('换上去的材质带该 set 的贴图与粗糙度', () => {
    const map = new THREE.Texture();
    const lib = fakeLib({ rock: { map, roughness: 0.42 } });
    const mesh = propMesh();
    lib.applyToMesh(mesh, 'rock', 0x6a5a48);
    expect(mesh.material.map).toBe(map);
    expect(mesh.material.roughness).toBe(0.42);
    // 这一档**有**贴图时 `createMaterial` 会把颜色强制成白色（颜色交给贴图），tint 被丢掉。
    // 这是既有行为，本片没改它 —— 断言的是它真的这么做了，免得下一个人以为是共享改坏的。
    expect(mesh.material.color.getHex()).toBe(0xffffff);
  });

  it('没有贴图的那一档，tint 真的写进颜色', () => {
    const lib = fakeLib({ rock: { map: null, roughness: 0.7 } });
    const mesh = propMesh();
    lib.applyToMesh(mesh, 'rock', 0x6a5a48);
    expect(mesh.material.color.getHex()).toBe(0x6a5a48);
    expect(mesh.material.map).toBe(null);
  });

  it('阴影标志：显式设过的值不会被翻掉（含 false）', () => {
    const lib = fakeLib({ rock: {} });
    const kept = propMesh();
    kept.castShadow = false;
    kept.receiveShadow = true;
    lib.applyToMesh(kept, 'rock', 0x6a5a48);
    expect(kept.castShadow).toBe(false);
    expect(kept.receiveShadow).toBe(true);
  });

  /**
   * 顺手量出的一条既有问题（不修，只钉住现状 + 登记）：
   * `mesh.castShadow = mesh.castShadow ?? true` 里的 `?? true` **永远不生效** ——
   * three 的 `Object3D.castShadow` 初值是 `false`（布尔，不是 `undefined`），
   * 所以 `false ?? true` 得 `false`。也就是说这一行从来没给任何道具开过投影。
   *
   * 本片不改它：开投影既改画面又改开销，属于 W-C3（阴影单一所有者）那一片的事。
   * 用例断言"它现在确实没开"，等 W-C3 动它时这条会红，那时再一起定。
   */
  it('`?? true` 是死代码：three 默认 false，所以这一行从没给道具开过投影', () => {
    const lib = fakeLib({ rock: {} });
    const fresh = propMesh();
    expect(fresh.castShadow).toBe(false);       // 未设过的初值就是 false
    lib.applyToMesh(fresh, 'rock', 0x6a5a48);
    expect(fresh.castShadow).toBe(false);
  });

  it('旧的贴图在 set 本身没有时被带过来（`old.map` 兜底仍是原样）', () => {
    const oldMap = new THREE.Texture();
    const lib = fakeLib({ rock: { map: null } });   // 这一档没有贴图
    const mesh = propMesh();
    mesh.material.map = oldMap;
    lib.applyToMesh(mesh, 'rock', 0x6a5a48);
    expect(mesh.material.map).toBe(oldMap);
  });

  it('不是 mesh 就什么都不做（也不建材质）', () => {
    const lib = fakeLib({ rock: {} });
    lib.applyToMesh(null, 'rock', 0x6a5a48);
    lib.applyToMesh(new THREE.Object3D(), 'rock', 0x6a5a48);
    expect(lib.sharedMaterialCount()).toBe(0);
  });
});

describe('分工：`createMaterial` 保持"每次新建"，共享只走 `sharedMaterial`', () => {
  it('`createMaterial` 两次调用给出两份不同的材质（地形那几处会就地改它）', () => {
    const lib = fakeLib({ grass: {} });
    const a = lib.createMaterial('grass');
    const b = lib.createMaterial('grass');
    expect(a).not.toBe(b);
    // 改其中一份不牵动另一份 —— 这正是不能给 `createMaterial` 加缓存的理由
    a.color.setHex(0xff0000);
    expect(b.color.getHex()).not.toBe(0xff0000);
  });

  it('`sharedMaterial` 同一键两次调用是同一份', () => {
    const lib = fakeLib({ grass: {} });
    expect(lib.sharedMaterial('grass')).toBe(lib.sharedMaterial('grass'));
  });

  it('门禁自证：把共享改回"每次新建"，第一条用例必须变红', () => {
    // 模拟修前的写法：每调一次建一份
    const lib = fakeLib({ rock: {} });
    const seen = new Set();
    for (let i = 0; i < 300; i++) {
      seen.add(lib.createMaterial('rock', { color: new THREE.Color(0x6a5a48) }));
    }
    expect(seen.size).toBe(300);      // 修前就是这个数；共享之后应为 1
  });
});

/* ------------------------------------------------------------------ *
 * 同族第三处：树干换贴图（W-C1 切片3；W-C2 切片2 合批后改成单网格换材质）
 * ------------------------------------------------------------------ */

describe('`WorldDecorations.applyTreeTextures`：一个树干合批网格换一次材质、拆一次旧', () => {
  /** W-C2 切片2 之后 `_scatterTrees` 只产出**一个**树干 InstancedMesh —— 换贴图只碰它 */
  const trunkMesh = () => {
    const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
    return m;
  };

  /** 只借那个方法用：它只碰 `this._treeTrunk`，所以不必真去建一整张世界地图 */
  const run = (trunk, lib) => {
    WorldDecorations.prototype.applyTreeTextures.call({ _treeTrunk: trunk }, lib);
  };

  it('换完之后树干拿的是那份共享 bark（整批树干本来就是同一个网格）', () => {
    const lib = fakeLib({ bark: { map: null, roughness: 0.9 } });
    const trunk = trunkMesh();
    run(trunk, lib);
    expect(lib.sharedMaterialCount()).toBe(1);
    expect(trunk.material).toBe(lib.sharedMaterial('bark', 0x6a5040));
  });

  it('换下来的旧材质被拆掉，且只拆一次（合批后旧材质天生只有一份）', () => {
    const lib = fakeLib({ bark: { map: null, roughness: 0.9 } });
    const trunk = trunkMesh();
    const disposed = [];
    const old = trunk.material;
    old.dispose = () => disposed.push('old');
    run(trunk, lib);
    expect(disposed).toEqual(['old']);
    expect(trunk.material).toBe(lib.sharedMaterial('bark', 0x6a5040));
  });

  it('已经是共享材质就不再动（不重复换、也不把活着的共享材质拆掉）', () => {
    const lib = fakeLib({ bark: { map: null, roughness: 0.9 } });
    const shared = lib.sharedMaterial('bark', 0x6a5040);
    const trunk = trunkMesh();
    trunk.material = shared;
    const disposed = [];
    shared.dispose = () => disposed.push('shared');
    run(trunk, lib);
    expect(disposed).toEqual([]);
    expect(trunk.material).toBe(shared);
  });

  it('库还没就绪就什么都不做（也不建材质）', () => {
    const lib = fakeLib({ bark: {} });
    const trunk = trunkMesh();
    run(trunk, Object.assign(Object.create(Object.getPrototypeOf(lib)), lib, { ready: false }));
    expect(lib.sharedMaterialCount()).toBe(0);
  });

  it('门禁自证：换回"每棵树一份"的写法，第一条用例必须变红', () => {
    const lib = fakeLib({ bark: {} });
    const made = new Set();
    for (let i = 0; i < 200; i++) made.add(lib.createMaterial('bark', { color: new THREE.Color(0x6a5040) }));
    expect(made.size).toBe(200);      // 修前就是这个数；共享之后应为 1
  });
});
