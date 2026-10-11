/**
 * AnimationClipLoader 行为门禁（W-C6 切片3 补测）。
 *
 * 第 1 条钉的是一个真事故：`new THREE.GLTFLoader()` 里 GLTFLoader 并不是 three 核心包的
 * 导出（它住在 `three/addons/loaders/GLTFLoader.js`），rollup 只给一行 warning，
 * 打出来的包里那个值是 undefined —— 构造函数一执行就 TypeError。
 * 全仓没有任何测试 new 过它，所以这个坑一路绿灯。
 */
import { describe, it, expect } from 'vitest';
import { AnimationClipLoader, ANIM_ACTIONS } from '../src/animation/AnimationClipLoader.js';

/** 假 glTF 返回体：只带 loadGLTF 真正读的字段 */
const fakeGltf = (names) => ({ animations: names.map((name) => ({ name })) });

describe('AnimationClipLoader', () => {
  it('构造即拿到真加载器 —— GLTFLoader 必须来自 addons，不能是 three 核心的 undefined', () => {
    const loader = new AnimationClipLoader();
    expect(typeof loader.loader?.loadAsync).toBe('function');
    const withManager = new AnimationClipLoader({});
    expect(typeof withManager.loader?.loadAsync).toBe('function');
  });

  it('loadGLTF 按 actionNames 过滤，并且同一 url 只打一次（缓存命中同一 Promise）', async () => {
    const loader = new AnimationClipLoader();
    let calls = 0;
    loader.loader = { loadAsync: async () => { calls += 1; return fakeGltf(['idle', 'run', 'hit']); } };

    const all = await loader.loadGLTF('a.glb');
    expect([...all.keys()]).toEqual(['idle', 'run', 'hit']);

    const some = await loader.loadGLTF('a.glb', ['run']);
    expect([...some.keys()]).toEqual(['run']);
    expect(calls).toBe(1);                       // 缓存：过滤发生在读取侧，不重复打网络

    loader.clearCache();
    await loader.loadGLTF('a.glb');
    expect(calls).toBe(2);
  });

  it('loadBatch 把 clip 合成 `url#动作名` 一把抓', async () => {
    const loader = new AnimationClipLoader();
    loader.loader = {
      loadAsync: async (url) => (url === 'a.glb' ? fakeGltf(['idle']) : fakeGltf(['attack', 'die'])),
    };
    const batch = await loader.loadBatch([
      { url: 'a.glb' },
      { url: 'b.glb', actions: ['attack'] },
    ]);
    expect([...batch.keys()]).toEqual(['a.glb#idle', 'b.glb#attack']);
  });

  it('createFromJSON 把声明式轨道烘成真 AnimationClip', () => {
    const clip = AnimationClipLoader.createFromJSON({
      name: 'pulse',
      duration: 2,
      tracks: [{ propertyPath: '.scale[x]', times: [0, 1, 2], values: [1, 2, 1] }],
    });
    expect(clip.name).toBe('pulse');
    expect(clip.duration).toBe(2);
    expect(clip.tracks).toHaveLength(1);
    expect(clip.tracks[0].name).toContain('.scale[x]');
  });

  it('预设动作名表是冻结的常量（玩家/敌人/Boss 三组都在）', () => {
    expect(Object.isFrozen(ANIM_ACTIONS)).toBe(true);
    expect(ANIM_ACTIONS.PLAYER_IDLE).toBe('player_idle');
    expect(ANIM_ACTIONS.ENEMY_DEATH).toBe('enemy_death');
    expect(ANIM_ACTIONS.BOSS_DEATH).toBe('boss_death');
  });
});
