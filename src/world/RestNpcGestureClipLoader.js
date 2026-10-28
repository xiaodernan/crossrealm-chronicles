import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * 营火 NPC 的手势素材名册（`scripts/import-rest-gestures.ps1` → `blender_rest_gestures_to_glb.py`
 * 的 `GESTURE_MAP` 键就是这里的文件名）。两边各写一次必然漂：导入脚本换一次输出名，
 * 这里只是"一个也读不到"，而读不到与"玩家没导素材"长得一模一样。
 * 对账由 `tests/rest-npc-gesture-loader.test.js` 钉住（它去读那份 python 表的键）。
 */
export const GESTURE_URLS = [
  '/assets/models/rest/gestures/wave.glb',
  '/assets/models/rest/gestures/sit.glb',
  '/assets/models/rest/gestures/talk.glb',
];

let _loader = null;
const gestureLoader = () => _loader ?? (_loader = new GLTFLoader());

/** url → 那一次请求的 promise（六个营火 NPC 共用同一批片段，不再各打各的） */
const _byUrl = new Map();
/** url → `'ok' | 'absent' | 'broken'`：只有本文件写它，读侧是门禁与那条 log */
const _status = new Map();

const basename = (url) => url.split('/').pop().replace(/\.glb$/, '');

/**
 * 一个手势 GLB 只解析一次。
 *
 * 失败分两档，因为它们的处置完全不同：
 * - `absent` —— 素材没导（`scripts/import-rest-gestures.ps1` 是可选流程，程序化手臂接手）；
 * - `broken` —— 素材在而读不懂（导出坏了 / 名字写错的那一侧）。
 * 前一种是预期，后一种是事故。改前两者一起被那句空 `catch` 吞掉 —— 那正是
 * "设计支柱 6：不许静默失败"点名的形状：玩家导了一批坏素材，界面上没有任何一处说得出为什么。
 */
function fetchGestureClips(url, loader) {
  const p = loader.loadAsync(url).then(
    (gltf) => {
      _status.set(url, 'ok');
      return gltf?.animations ?? [];
    },
    (err) => {
      const 状态码 = err?.target?.status ?? err?.status;
      const 是取不到 = (typeof 状态码 === 'number' && 状态码 >= 400)
        || /^THREE\.FileLoader/.test(String(err?.message ?? ''))
        || /status code|Failed to load/i.test(String(err?.message ?? ''));
      if (是取不到) {
        _status.set(url, 'absent');
        console.info(`[RestNpcGestures] ${basename(url)} 素材不在（可选流程，走程序化手臂）`);
      } else {
        _status.set(url, 'broken');
        console.warn(`[RestNpcGestures] ${basename(url)} 读不出片段：${err?.message ?? err}`);
      }
      return [];
    },
  );
  _byUrl.set(url, p);
  return p;
}

const loadGestureClips = (url, loader) => _byUrl.get(url) ?? fetchGestureClips(url, loader);

/** 名册快照（只读）：门禁与设置面板想知道"哪几枚手势素材真的到位了"就问这里。 */
export const gestureStatuses = () => Object.fromEntries(GESTURE_URLS.map((u) => [u, _status.get(u) ?? 'pending']));

/** 只给测试与"重新导入素材后热重挂"用：把请求与判档一起清空。 */
export const clearGestureCache = () => { _byUrl.clear(); _status.clear(); };

/**
 * 异步合并手势 GLB 到营火 NPC AnimationMixer。
 *
 * `model.mixer` 是 `RestNpcModel.loadGlb()` **异步**建出来的，而这一层过去在 `attachRestNpcs()`
 * 那一刻同步就问它 —— 那一刻混放器还不存在，于是每个营火都直接 `return 0`：README 教的
 * "导入 wave/sit/talk 就自动接上"从来没有成立过。现在先等那一格的 promise 落地再问。
 *
 * 手势别名认的是**文件名**，不是 clip 名。文件名是导入管线与加载口唯一对过账的那一侧
 * （见 `GESTURE_URLS` 上的注与那条静态对账测试）；clip 名那一侧一旦走 `includes` 匹配，
 * 就会栽在 Mixamo 的原名上 —— "Waving" 里不含 "wave"（差的是那个 `e`），而收件箱建议的
 * 正是 `Waving.fbx` 这一族名字。
 */
export async function mergeRestNpcGestureClips(model, { loader = gestureLoader() } = {}) {
  await (model?.glbLoad ?? null);
  if (!model?.mixer) return 0;
  let n = 0;
  for (const url of GESTURE_URLS) {
    const clips = await loadGestureClips(url, loader);
    const 手势名 = basename(url);
    clips.forEach((clip, i) => {
      const action = model.mixer.clipAction(clip);
      model.actions[clip.name] = action;
      if (i === 0) model.actions[手势名] = action;
      n += 1;
    });
  }
  return n;
}
