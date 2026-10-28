/**
 * 营火 NPC 手势素材加载器的行为门禁（W-C6 切片12）。
 *
 * ## 这一片修的是一条"永远不生效"
 *
 * `RestNpcAnimDirector.attachRestNpcs()` 里那句 `mergeRestNpcGestureClips(npc.model)` 排在
 * **同步段**，而 `npc.model.mixer` 是 `RestNpcModel.loadGlb()` 那条 promise 落地时才有的。
 * 于是挂接那一刻问 mixer，答案永远是 null ⇒ 函数第一行 `if (!model.mixer) return 0` 每次都走 ⇒
 * 三枚手势 GLB 一个也不会被并进来。症状（营火 NPC 只有程序化手臂）与"玩家没导素材"
 * 完全同形，而 `public/assets/models/rest/GESTURES_README.txt` 明明白白教玩家导。
 *
 * ## 这一片要钉住的
 *
 * ① **等 mixer**：混放器只在 `model.glbLoad` 之后出现 ⇒ 合并口要等到它，不再白拿 0；
 *    反向控制一条：既没有 `glbLoad` 也没有 mixer ⇒ 0，且一次网络都不打。
 * ② **写进原来那本账**：`RestNpcGesturePlayer` 在构造那一刻就把 `model.actions` 按**引用**
 *    抄进了自己的字段，合并口只能往同一个对象上写（换成新对象 = 播放层永远看不见新片段）。
 * ③ **一枚素材只解析一次**：六座营火 × 三枚素材以前是 18 次请求；并发挂接也只许 3 次。
 * ④ **失败分两档且看得见**：素材不在（`absent`，可选流程）与素材坏了（`broken`，事故）
 *    不能一起吞 —— 设计支柱 6"不许静默失败"。判档结果由 `gestureStatuses()` 说得出名字。
 * ⑤ **名册两边对账**：这里的 `GESTURE_URLS` 与 `scripts/blender_rest_gestures_to_glb.py` 的
 *    `GESTURE_MAP` 键是同一件事的两份写法。导入脚本换一次输出名，游戏只是"一个也读不到"。
 *    对账不止 url 那一层：手势**别名**也按这个名字认领，绝不看 clip 原名 —— Mixamo 的
 *    `Waving` 里不含 `wave`（差的正是那个 `e`），拿 `includes` 认名册会静默漏掉一整枚。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GESTURE_URLS, gestureStatuses, clearGestureCache, mergeRestNpcGestureClips,
} from '../src/world/RestNpcGestureClipLoader.js';

const clip = (name) => ({ name });

/** 像 `RestNpcModel` 的那一具：只暴露合并口真正会读的三样字段。 */
const 假模型 = ({ mixer = null, glbLoad = null } = {}) => ({
  mixer,
  glbLoad,
  actions: {},
  currentAction: null,
});

/** 假 GLTFLoader：按 url 给返回体或给一条 reject，并把每一次请求记下来。 */
const 假加载器 = (表) => {
  const calls = [];
  return {
    calls,
    loadAsync: (url) => {
      calls.push(url);
      const v = 表[url];
      return v instanceof Error ? Promise.reject(v) : Promise.resolve(v ?? { animations: [] });
    },
  };
};

const 成功表 = (perUrl = 1) => Object.fromEntries(GESTURE_URLS.map((u, i) => [
  u, { animations: Array.from({ length: perUrl }, (_, k) => clip(`${u.includes('wave') ? 'Waving' : u.includes('sit') ? 'Sitting' : 'Talking'} ${i}${k}`)) },
]));

/**
 * 假加载器（延迟版）：请求开出去但不落地，由测试决定何时放行。
 * 并发不是我们造出来的，是"素材还悬着、六条挂接同时走到同一个阻塞点"造出来的。
 */
const 延迟加载器 = (表) => {
  const calls = [];
  let 在飞 = new Map();
  return {
    calls,
    放行: () => {
      const 批 = [...在飞.values()];
      在飞 = new Map();
      批.forEach((r) => r());
    },
    loadAsync: (url) => {
      calls.push(url);
      return new Promise((resolve) => { 在飞.set(url, () => resolve(表[url] ?? { animations: [] })); });
    },
  };
};

/** 排干微任务：让合并口里那一串 await 各自走到下一个阻塞点。 */
const 排干 = () => new Promise((r) => setTimeout(r, 0));

describe('① 等 mixer：混放器晚到也要并得进来', () => {
  beforeEach(() => clearGestureCache());

  it('事故复现：mixer 只在 glbLoad 的续体里出现 ⇒ 三枚片段全部落地', async () => {
    const model = 假模型();
    model.glbLoad = Promise.resolve().then(() => {
      model.mixer = { clipAction: (c) => ({ clip: c }) };
      return true;
    });
    const loader = 假加载器(成功表());

    expect(model.mixer, '前提：挂接那一刻确实还没有混放器').toBeNull();
    expect(await mergeRestNpcGestureClips(model, { loader })).toBe(3);
    expect(model.actions.wave, 'wave 那个别名没落上').toBeTruthy();
    expect(model.actions.sit).toBeTruthy();
    expect(model.actions.talk).toBeTruthy();
  });

  it('反向控制：没有 glbLoad 也没有 mixer ⇒ 0，且一次网络都不打', async () => {
    const loader = 假加载器(成功表());
    expect(await mergeRestNpcGestureClips(假模型(), { loader })).toBe(0);
    expect(loader.calls, '混放器都不存在就去打素材请求 —— 白打三次').toEqual([]);
  });

  it('glbLoad 落地了但 GLB 没导成（mixer 仍是 null）⇒ 0，也不打请求', async () => {
    const model = 假模型({ glbLoad: Promise.resolve(false) });
    const loader = 假加载器(成功表());
    expect(await mergeRestNpcGestureClips(model, { loader })).toBe(0);
    expect(loader.calls).toEqual([]);
  });
});

describe('② 写进原来那本账', () => {
  beforeEach(() => clearGestureCache());

  it('`model.actions` 是同一个对象（播放层手里那份引用不能作古）', async () => {
    const model = 假模型({ mixer: { clipAction: (c) => ({ clip: c }) }, glbLoad: Promise.resolve(true) });
    const 那本账 = model.actions;
    await mergeRestNpcGestureClips(model, { loader: 假加载器(成功表()) });
    expect(model.actions).toBe(那本账);
    expect(Object.keys(那本账).length, '别名与 clip 名都该写在同一本账上').toBeGreaterThan(3);
  });

  it('别名取自文件名、clip 原名也登记（RestNpcGesturePlayer 两种都会找）', async () => {
    const model = 假模型({ mixer: { clipAction: (c) => ({ clip: c }) }, glbLoad: Promise.resolve(true) });
    const 表 = {
      [GESTURE_URLS[0]]: { animations: [clip('Waving Right')] },
      [GESTURE_URLS[1]]: { animations: [clip('Sit To Stand')] },
      [GESTURE_URLS[2]]: { animations: [clip('Talking Idle')] },
    };
    expect(await mergeRestNpcGestureClips(model, { loader: 假加载器(表) })).toBe(3);
    expect(Object.keys(model.actions).sort()).toEqual(['Sit To Stand', 'Talking Idle', 'Waving Right', 'sit', 'talk', 'wave']);
    expect(model.actions.wave, '别名与那条 clip 必须是同一个 action').toBe(model.actions['Waving Right']);
  });
});

describe('③ 一枚素材只解析一次', () => {
  beforeEach(() => clearGestureCache());

  it('六座营火串行挂接 ⇒ 请求仍是三枚', async () => {
    const loader = 假加载器(成功表());
    const mixer = () => ({ clipAction: (c) => ({ clip: c }) });
    for (let i = 0; i < 6; i++) {
      const model = 假模型({ mixer: mixer(), glbLoad: Promise.resolve(true) });
      expect(await mergeRestNpcGestureClips(model, { loader })).toBe(3);
    }
    expect(loader.calls.length, `六座 × 三枚 = 18 次请求回来了（实际 ${loader.calls.length}）`).toBe(3);
  });

  it('并发挂接：同一枚素材只开一条请求（缓存的是 promise，不是结果）', async () => {
    const loader = 延迟加载器(成功表());
    const 六条 = Array.from({ length: 6 }, () => mergeRestNpcGestureClips(
      假模型({ mixer: { clipAction: (c) => ({ clip: c }) }, glbLoad: Promise.resolve(true) }),
      { loader },
    ));
    await 排干();
    expect(loader.calls, '第一枚被六条并发各打了一次').toEqual([GESTURE_URLS[0]]);
    loader.放行();
    await 排干();
    expect(loader.calls.slice(1), '第二枚同理').toEqual([GESTURE_URLS[1]]);
    loader.放行();
    await 排干();
    expect(loader.calls.slice(2), '第三枚同理').toEqual([GESTURE_URLS[2]]);
    loader.放行();
    expect(await Promise.all(六条)).toEqual([3, 3, 3, 3, 3, 3]);
    expect(loader.calls, '六座营火总共只该打三枚素材').toEqual(GESTURE_URLS);
  });

  it('清空缓存之后会重新打（证明上面两条不是空转）', async () => {
    const loader = 假加载器(成功表());
    const 模型 = () => 假模型({ mixer: { clipAction: (c) => ({ clip: c }) }, glbLoad: Promise.resolve(true) });
    await mergeRestNpcGestureClips(模型(), { loader });
    expect(loader.calls.length).toBe(3);
    clearGestureCache();
    await mergeRestNpcGestureClips(模型(), { loader });
    expect(loader.calls.length).toBe(6);
  });
});

describe('④ 失败分两档且看得见', () => {
  let info, warn;
  beforeEach(() => {
    clearGestureCache();
    info = vi.spyOn(console, 'info').mockImplementation(() => {});
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); });

  /** 三枚都要给出条目，否则缺席的那枚停在 `pending`，会被"其它枚的日志"混进断言。 */
  const 全表 = (一枚, 坏) => Object.fromEntries(GESTURE_URLS.map((u, i) => [u, i === 坏 ? 一枚 : { animations: [clip('wave')] }]));

  it('HTTP 404 那一档判 `absent`：说一声，不报警，也不把 reject 抛给调用方', async () => {
    const 四十四 = Object.assign(new Error('Failed to load resource with status code 404.'), { target: { status: 404 } });
    const model = 假模型({ mixer: { clipAction: (c) => ({ clip: c }) }, glbLoad: Promise.resolve(true) });
    expect(await mergeRestNpcGestureClips(model, { loader: 假加载器(全表(四十四, 1)) })).toBe(2);
    expect(gestureStatuses()[GESTURE_URLS[1]]).toBe('absent');
    expect(warn.mock.calls.length, '素材没导不该报警').toBe(0);
    expect(info.mock.calls.flat().join('\n'), '缺席那一档也要说得出是哪一枚').toContain('素材不在');
    expect(info.mock.calls.flat().join('\n')).toContain('sit');
  });

  it('解析失败那一档判 `broken` 并点名（改前它和 404 一起被空 catch 吞掉）', async () => {
    const model = 假模型({ mixer: { clipAction: (c) => ({ clip: c }) }, glbLoad: Promise.resolve(true) });
    expect(await mergeRestNpcGestureClips(model, { loader: 假加载器(全表(new Error('THREE.GLTFLoader: No DRACOLoader instance provided.'), 2)) })).toBe(2);
    expect(gestureStatuses()[GESTURE_URLS[2]]).toBe('broken');
    const 报的那一行 = warn.mock.calls.flat().join('\n');
    expect(报的那一行).toContain('talk');
    expect(报的那一行).toContain('DRACOLoader');
  });

  it('没打过的那一枚停在 `pending`（判档不是猜出来的）', () => {
    expect(Object.values(gestureStatuses()).every((s) => s === 'pending')).toBe(true);
  });
});

describe('⑤ 名册两边对账（导入管线 ↔ 加载口）', () => {
  const 读 = (rel) => readFileSync(join(process.cwd(), rel), 'utf8');

  /** 从 blender 那份表里抠出键名（键 = 导出的 clip 名 = 文件名）。 */
  const python手势键 = () => {
    const 块 = /GESTURE_MAP\s*=\s*\{([\s\S]*?)\n\}/.exec(读('scripts/blender_rest_gestures_to_glb.py'));
    if (!块) throw new Error('blender 脚本里没有 GESTURE_MAP 那张表');
    return [...块[1].matchAll(/"([^"]+)"\s*:/g)].map((m) => m[1]);
  };

  /** ps1 那一侧的输出目录（相对仓库根）折成 dev 服上的 url 前缀：`public/` 挂在根。 */
  const 导入输出前缀 = () => {
    const 行 = /\$outDir\s*=\s*Join-Path\s+\$root\s+"([^"]+)"/.exec(读('scripts/import-rest-gestures.ps1'));
    if (!行) throw new Error('导入脚本里没有 $outDir 那一行');
    const 相对 = 行[1].split('\\').join('/');
    if (!相对.startsWith('public/')) throw new Error(`$outDir 不在 public/ 下面：${相对}`);
    return `/${相对.slice('public/'.length)}/`;
  };

  const 对账 = (名册urls, 表键, 前缀) => {
    const 毛病 = [];
    const 名册 = 名册urls.map((u) => u.split('/').pop().replace(/\.glb$/, ''));
    for (const k of 表键) if (!名册.includes(k)) 毛病.push(`导入管线会写出 ${k}.glb，加载口那三枚里没有它`);
    for (const n of 名册) if (!表键.includes(n)) 毛病.push(`加载口读 ${n}.glb，导入管线从来不写它`);
    for (const u of 名册urls) if (!u.startsWith(前缀)) 毛病.push(`${u} 不在导入管线的输出目录 ${前缀} 里`);
    return 毛病;
  };

  it('三枚素材名与 blender 那张表的键、ps1 的输出目录逐一对上', () => {
    expect(python手势键().length, '那张表抠出来是空的 —— 对账腿在空转').toBeGreaterThan(0);
    expect(对账(GESTURE_URLS, python手势键(), 导入输出前缀())).toEqual([]);
  });

  it('arming：导入侧改一个名 ⇒ 对账当场点名（谓词不是摆设）', () => {
    const 毛病 = 对账(GESTURE_URLS, ['wave', 'sit', 'nod'], 导入输出前缀());
    expect(毛病.length).toBeGreaterThan(0);
    expect(毛病.join('\n')).toContain('talk');
  });

  it('arming：加载口把 url 挪出输出目录 ⇒ 同样点名', () => {
    const 毛病 = 对账(['/assets/models/other/wave.glb', GESTURE_URLS[1], GESTURE_URLS[2]], python手势键(), 导入输出前缀());
    expect(毛病.join('\n')).toContain('other');
  });

  it('别名那一侧的键就是导入管线写出的文件名：clip 原名再野也接得上', async () => {
    clearGestureCache();
    // 三枚故意都不含自己的手势名（Mixamo 收件箱建议的正是这一族原名）。
    const 野表 = Object.fromEntries(GESTURE_URLS.map((u, i) => [
      u, { animations: [clip(['Waving Right', 'Seated Idle', 'Chatting'][i])] },
    ]));
    const model = 假模型({ mixer: { clipAction: (c) => ({ clip: c }) }, glbLoad: Promise.resolve(true) });
    expect(await mergeRestNpcGestureClips(model, { loader: 假加载器(野表) })).toBe(3);
    const 落上的别名 = python手势键().filter((k) => model.actions[k]);
    expect(落上的别名.sort(), '手势别名认的是 clip 名 —— 素材一用原名就一个也接不上').toEqual(python手势键().sort());
    expect(model.actions.wave.clip.name, '别名必须指向 wave.glb 里那条 clip，不能张冠李戴').toBe('Waving Right');
  });
});
