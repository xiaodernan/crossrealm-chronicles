/**
 * TextureLibrary 的加载链（W-C5 切片7）。
 *
 * ## 这一片交付了什么
 * ① 图集化判定（普查 `.tmp-20261007/wc5s7-census.mjs`）：**不做**。烘焙 6 个 set 的
 * 12 个 PNG（合计 630,530 字节 = 615.8 KiB）并成 2 张只省 10 次请求 —— 像素总量不变
 * （VRAM 不减）、材质本来就各不相同（绑定次数不减），而跨区域 `RepeatWrapping` 得动
 * `onBeforeCompile` 做 UV 重映射；CC0 那 5 个 set 是外部资源，进不了自家图集。
 * ② 真正量到的是**等待的形状**：`init()` 改前是一条 `for await` —— happy path 22 个请求
 * （10 个 CC0 + 12 个烘焙）一个来回一个来回地等。本片改成一次发起全部（`Promise.all`），
 * 同负载微观对照（11 set × 20ms 桩）：**260.0ms → 20.0ms**。
 *
 * ## 契约（改前改后逐条相同 —— 并发不许把它们带跑）
 * - `this.sets` 键序按 MANIFEST 落库（`Promise.all` 保序，完成顺序不参与）；
 * - `ready` 只有全部 set 落库后才置真（加载途中问它必须是 false）；
 * - 单个槽的 URL 全失败 ⇒ 该槽 `null`，`init()` 仍 resolve（`_loadFirst` 全 catch ——
 *   这也是静态 `load()` 自己没有 catch 却从不炸的底气）；
 * - 槽内 local → CDN 的回退顺序不变；
 * - 静态 `load()` 的单例缓存语义不变。
 *
 * 用例走**新实例 + 假 loader**（真 `TextureLoader` 在 node 里载不出图）；只有静态
 * `load()` 那条走真 loader —— 验的是"解析得回来 + 单例"，不是贴图内容。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TextureLibrary } from '../src/assets/TextureLibrary.js';

/** MANIFEST 的键序快照。加 set 要动这里（这是**规格钉**：落库顺序是给人看的读数面） */
const 名单 = ['grass', 'path', 'rock', 'forest', 'bark', 'masonry', 'slabs', 'plank', 'plate', 'steel', 'drum'];

/**
 * 假 loader：并发读数（在场 / 峰值 / 调用清单）+ 可控延迟与失败。
 * 返回值形与 `THREE.TextureLoader` 该用到的部分一致（只有 `loadAsync`）。
 */
function 假loader({ 延迟 = () => 5, 失败 = () => false } = {}) {
  const 读数 = { 在场: 0, 峰值: 0, 调用: [] };
  return {
    读数,
    async loadAsync(url) {
      读数.在场 += 1;
      读数.峰值 = Math.max(读数.峰值, 读数.在场);
      读数.调用.push(url);
      if (失败(url)) {
        读数.在场 -= 1;
        throw new Error(`假 loader 拦下 ${url}`);
      }
      await new Promise((r) => setTimeout(r, 延迟(url)));
      读数.在场 -= 1;
      return new THREE.Texture();
    },
  };
}

const 装 = (loader) => {
  const lib = new TextureLibrary();
  lib.loader = loader;
  return lib;
};

describe('并发：一次发起全部，而不是 22 个串行往返', () => {
  it('全部 set 的第一波请求同时发起 —— 峰值 = set 数（串行写法峰值只会是 1）', async () => {
    const loader = 假loader();
    const lib = 装(loader);
    expect(lib.ready).toBe(false);
    await lib.init();
    const 键 = Object.keys(lib.sets);
    expect(loader.读数.峰值, `峰值 ${loader.读数.峰值}：===1 就是还在串行排队（22 个请求一个来回一个来回地等）`)
      .toBe(键.length);
    expect(loader.读数.峰值, '峰值连 2 都没到 —— 这条用例没在量并发').toBeGreaterThanOrEqual(2);
    // happy path：假 loader 全命中第一条 URL ⇒ 每个槽恰好一次请求
    expect(loader.读数.调用.length, '请求总数不是 22 个槽各一次').toBe(22);
  });

  it('门禁自证：同一把尺量串行调度，峰值必须掉回 1', async () => {
    const loader = 假loader();
    for (const k of 名单) await loader.loadAsync(`fake://${k}`);
    expect(loader.读数.峰值, '这把尺量不出串行的话，上面"峰值 = set 数"那条就是空话').toBe(1);
  });
});

describe('并发不许带跑的既有契约', () => {
  it('落库键序按 MANIFEST，与完成顺序无关（故意把排最前的 grass 拖成最慢）', async () => {
    // grass 的四个 URL（map/normal × local/CDN）都含 "grass"，全给 40ms；其余 5ms
    const loader = 假loader({ 延迟: (url) => (url.includes('grass') ? 40 : 5) });
    const lib = 装(loader);
    await lib.init();
    expect(Object.keys(lib.sets), '键序漂了 —— 有人按"谁先完成谁先落库"写了').toEqual(名单);
  });

  it('每个 set 都物化成对象（不是 Promise）；槽是 null 或带参数的纹理', async () => {
    const lib = 装(假loader());
    await lib.init();
    for (const key of 名单) {
      const set = lib.sets[key];
      expect(typeof set?.roughness, `${key} 不是一份 set 对象（拿到 Promise / undefined？）`).toBe('number');
      for (const slot of ['map', 'normalMap', 'roughnessMap']) {
        const tex = set[slot];
        expect(tex === null || tex instanceof THREE.Texture, `${key}.${slot} 既不是 null 也不是纹理`).toBe(true);
        if (!tex) continue;
        expect(tex.wrapS, `${key}.${slot} 的 wrapS 没设成 RepeatWrapping`).toBe(THREE.RepeatWrapping);
        expect(tex.anisotropy, `${key}.${slot} 的 anisotropy 没设成 4`).toBe(4);
      }
    }
    // 两条口径各钉一例：颜色图是 sRGB 且按 MANIFEST 铺 48×56；烘焙组没有颜色图、数据图是线性
    expect(lib.sets.grass.map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(lib.sets.grass.map.repeat.x).toBe(48);
    expect(lib.sets.grass.map.repeat.y).toBe(56);
    expect(lib.sets.masonry.map, 'masonry（烘焙组）不该有颜色图').toBe(null);
    expect(lib.sets.masonry.normalMap.colorSpace).toBe(THREE.NoColorSpace);
  });

  it('加载途中 `ready` 是 false，全部落库才置 true', async () => {
    const lib = 装(假loader({ 延迟: () => 30 }));
    const p = lib.init();
    await new Promise((r) => setTimeout(r, 5));
    expect(lib.ready, '还在加载就置了 true —— 消费方会拿到半空的 sets').toBe(false);
    await p;
    expect(lib.ready).toBe(true);
  });
});

describe('失败与回退：既有的不炸语义照旧', () => {
  it('某 set 的 URL 全失败 ⇒ 该槽 null，init 仍 resolve（静态 load() 没有 catch 的底气）', async () => {
    const loader = 假loader({ 失败: (url) => url.includes('drum') });
    const lib = 装(loader);
    await expect(lib.init(), '一个 set 载不出来就把整个库炸了 —— Promise.all 把 reject 透传了').resolves.toBe(lib);
    expect(lib.ready).toBe(true);
    expect(lib.sets.drum.map).toBe(null);
    expect(lib.sets.drum.normalMap).toBe(null);
    expect(lib.sets.drum.roughnessMap).toBe(null);
    expect(lib.sets.drum.roughness, '槽失败了，set 自己的粗糙度读数也该在（按 def 缺省）').toBe(1.0);
    expect(loader.读数.调用.filter((u) => u.includes('drum')).length, 'drum 的槽根本没被试过').toBe(2);
    expect(lib.sets.steel.normalMap, '别的 set 被 drum 的失败连坐了').toBeInstanceOf(THREE.Texture);
  });

  it('槽内 local → CDN：本地失败时回退继续、顺序不变', async () => {
    const loader = 假loader({ 失败: (url) => url.includes('grass_diff.jpg') });
    const lib = 装(loader);
    await lib.init();
    expect(lib.sets.grass.map, '本地 404 后没有回退到 CDN').toBeInstanceOf(THREE.Texture);
    const 草 = loader.读数.调用.filter((u) => u.includes('grass'));
    expect(草[0], '第一条不是本地路径 —— 回退顺序被人动了').toBe('/textures/grass_diff.jpg');
    expect(草[1], '本地失败后没有接着试 CDN').toContain('aerial_grass_rock_diff_1k.jpg');
  });
});

describe('静态单例：load() 的缓存语义不变', () => {
  it('并发调用同一个 promise；解析后 loaded() 给出 ready 的实例', async () => {
    const a = TextureLibrary.load();
    const b = TextureLibrary.load();
    expect(a, '两次 load() 给了两个 promise —— 单例缓存破了').toBe(b);
    const lib = await a;
    expect(TextureLibrary.loaded(), 'load() 解析后 loaded() 还不是它').toBe(lib);
    expect(await TextureLibrary.load(), '就绪后再问 load()，实例换了').toBe(lib);
    expect(lib.ready).toBe(true);
    // 真 loader 在 node 里载不出图（全部槽 null），但 11 个 set 一个不少、键序照旧
    expect(Object.keys(lib.sets)).toEqual(名单);
  });
});
