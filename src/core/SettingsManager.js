import { padTuning } from '../content/keybinds.js';
import { applySunShadowQuality, normalizeShadowQuality } from '../engine/shadowPolicy.js';
import { applyMsaaSamples, normalizeMsaaSamples } from '../engine/aaPolicy.js';
import { DEFAULT_SSAO_QUALITY } from '../engine/ssaoSettings.js';
import { setSsaoQuality } from '../engine/SsaoPass.js';
import { DEFAULT_GRAPHICS_PRESET, getGraphicsPreset, normalizeGraphicsPreset } from '../engine/graphicsPresets.js';
import { setLanguage, applyTranslations } from '../engine/i18n.js';
import { DEFAULT_COLOR_MODE, setColorVision } from '../game/ColorVision.js';
import { DEFAULT_DIFFICULTY, setDifficulty } from '../game/Difficulty.js';
import { DEFAULT_LOOK_SENSITIVITY, applyLookSensitivity, normalizeLookSensitivity } from '../engine/lookSensitivity.js';
const KEY = 'crossrealm_settings';
/** v1 是"整包扁平、没有版本字段"；v2 起是 `{ version, values }` */
const VERSION = 2;

const DEFAULTS = {
  masterVolume: 0.35,
  sfxVolume: 0.5,
  bloomStrength: 0.35,
  shadows: true,
  /**
   * 太阳影子贴图的精度档（W-C3 切片2）：1024 / 2048 / 4096 三档，名册在
   * `engine/shadowPolicy.js`。出厂 4096 与硬编码时代同值 —— 默认精度零变更。
   * 存储里的脏值在 `applyToGame` 落地前经 `normalizeShadowQuality` 回落，不抛。
   */
  shadowQuality: 4096,
  /**
   * 全屏 MSAA 采样数（W-C4 切片1）：0 / 2 / 4 三档，名册在 `engine/aaPolicy.js`。
   * 出厂 4 —— 锯齿是每帧都看得见的缺陷，没有"迁移前同值"可守（迁移前实际是 0，
   * 一个不该守的值）。存储里的脏值在 `applyToGame` 落地前经 `normalizeMsaaSamples` 回落。
   */
  msaaSamples: 4,
  /**
   * SSAO 画质档（W-C4 切片5 / B98）：off / low / medium / high 四档，名册在
   * `engine/ssaoSettings.js`。出厂 off —— GTAO 每帧多一趟全场景法线渲染（draw call
   * 近翻倍），B94 的 <400 验收线按出厂配置记的账，出厂就超线的档不配叫出厂；
   * 画质预设的 medium / high 档会主动推它开。存储里的脏值在 `setSsaoQuality`
   * 内部经 `normalizeSsaoQuality` 回落出厂，不抛。
   */
  ssaoQuality: DEFAULT_SSAO_QUALITY,
  /**
   * 画质预设档（W-D3 切片1）：low / medium / high 三档，名册在
   * `engine/graphicsPresets.js`。出厂 medium —— 兼顾画质与性能。
   * 这一格只负责"记住玩家上次选的档位"，真正的批量设值由 `applyGraphicsPreset()` 完成。
   * 存储里的脏值在读取时经 `normalizeGraphicsPreset` 回落出厂。
   */
  graphicsPreset: DEFAULT_GRAPHICS_PRESET,
  pixelRatio: 1.5,
  enemyLodDistance: 85,
  /**
   * 鼠标镜头灵敏度倍率（W-D6 切片7）：1 = 改前那两枚硬编码值。
   * 出厂 1 —— 机制片不夹带手感变更，玩家要快要慢自己拧（可访问性里最常被提到的一格：
   * 高 DPI 鼠标轻轻一推就转过九十度，而手腕有伤 / 用触控板的玩家需要更小的舵量）。
   * 真源与量程在 `engine/lookSensitivity.js`；脏值在那里夹回量程，不抛。
   */
  lookSensitivity: DEFAULT_LOOK_SENSITIVITY,
  showFps: true,
  /** 玩家的键位重映射 `动作名 → KeyboardEvent.code`；空表 = 用 `content/hotkeys.js` 的出厂绑定 */
  keybinds: {},
  /**
   * 手柄按钮重映射 `手柄动作名 → 按钮名`（切片9）。与 `keybinds` 分两格存：
   * 那里的值是键码（`KeyW`）、这里的值是按钮名（`a`），而 `a` 也过键码那把正则 ——
   * 混在一格里就再也分不清"把跳跃改成 A 键"还是"改成 A 按钮"。
   */
  gamepadBinds: {},
  /**
   * **界面态**那张手柄表的重映射（切片23）：`界面动作名 → 按钮名`。
   *
   * 与上面那格分两格存，理由是同一族：两张表的值都是按钮名，靠值分不开，只能靠动作名，
   * 而"这个动作名归哪张表"的答案由 `padScopeOf()` 问表拿（两张表的名单互不相交，加载期钉住）。
   * 合成一格的代价是每次叠表都要先分流一次，而分流错了不会报错 —— 它表现为"面板里改的是
   * 界面那一格，动的却是战斗表"（B47 那一族换了轴）。
   */
  gamepadUiBinds: {},
  /**
   * 手柄手感旋钮（切片15 起三根，切片21 再加三根）：`padTuning()` 认识哪几格，这里就存哪几格。
   *
   * 默认值不在这里抄一遍 —— `padTuning()` 取的就是 `content/keybinds.js` 里那份 `PAD`，
   * 因为"滑杆的范围"与"桥认的范围"必须是同一条算式（两处分头写就会滑到头却被当成脏数据回落）。
   * 加一格也不需要动这里：读档那一步走的就是 `padTuning(存档)`，缺的那几格由它落到出厂值
   * （见 `tests/pad-tuning.test.js` 的"老档缺新格"一例）。
   */
  padTuning: padTuning(),
  /**
   * 字幕开关（W-D6 切片8）：把"只靠声音传递的信息"写到屏幕上。
   *
   * **出厂关** —— 与色觉档 / 镜头灵敏度同一条纪律：机制片不夹带视觉变更。
   * 而且字幕条要占屏幕下方一块地方，默认开着等于替所有玩家做决定。
   * 面板里它紧挨着色觉模式（同在"辅助功能"那一语义区），需要的人一进设置就看得见。
   *
   * 只认 `true`：存储是玩家可写的，一个 `"1"` / `1` 都该当成关（与 `vibration` 同口径）。
   * 关掉时**不影响声音** —— `game-cue` 照旧派发，只是没有人把它画出来。
   */
  captions: false,
  /**
   * 手柄震动（切片17）：只挡"要不要给马达下令"这一格，相机抖不抖仍然照旧 ——
   * 打击反馈有两路输出，玩家只想关其中一路（例如有人在夜里玩）。
   */
  vibration: true,
  /**
   * 界面语言（W-D2 切片2）：'zh' / 'en' 两档，名册在 `engine/i18n.js` 的 TABLES。
   * 出厂中文 —— 这是游戏的主语言。存储里的脏值在 `applyToGame` 落地前经 `setLanguage`
   * 的合法性校验回落（未知语言当场抛错，调用点捕获后回落 'zh'）。
   */
  language: 'zh',
  /**
   * 难度档（W-E1 切片2）：story / standard / brutal 三档，名册在 `content/difficulty.js`。
   * 出厂 standard —— 那一档逐格乘子为 1，"出厂行为与没有难度系统逐字节相同"由
   * `assertDifficultyTable` 硬断言，不靠记忆。落地走 `applyToGame` 里的 `setDifficulty`，
   * 脏值在出口内部回落出厂不抛。
   */
  difficulty: DEFAULT_DIFFICULTY,
  /**
   * 色觉档（W-D6 切片3）：default / deuteranopia / protanopia / tritanopia 四档，名册在
   * `content/semanticColors.js`。出厂 `default` —— 与"没有色盲模式"逐格同值（那张表的
   * `default` 一列就是迁移前在役的色），所以默认玩家的画面零变更；`tests/color-vision.test.js`
   * 拿迁移前的四个冻结色值对账，不靠记忆。存储里的脏值在 `applyToGame` 落地前经
   * `normalizeColorVision` 回落出厂，不抛。落地走 `setColorVision`（写入口只有那一处）。
   */
  colorVision: DEFAULT_COLOR_MODE,
};

/**
 * v1 → v2：只把**认识**的键搬进 `values`，不认识的一律丢掉。
 *
 * 丢掉不是洁癖：留着它们，下一次 `save()` 会把没人负责的东西原样写回磁盘，
 * 而 `get()` 又可能读到它 —— 一个没有主人的配置比少一个配置更糟。
 * （读档那边的同一条纪律见 `SaveMigrations.js`。）
 */
export function migrateLegacySettings(flat) {
  const out = {};
  for (const k of Object.keys(DEFAULTS)) {
    if (Object.prototype.hasOwnProperty.call(flat, k)) out[k] = flat[k];
  }
  return out;
}

export class SettingsManager {
  constructor() {
    const loaded = this.load();
    this.data = { ...DEFAULTS, ...loaded };
    // 对象型默认值不能与 `DEFAULTS` 共用同一个引用：否则就地改一次就把出厂设定改了
    this.data.keybinds = { ...DEFAULTS.keybinds, ...(loaded.keybinds ?? {}) };
    this.data.gamepadBinds = { ...DEFAULTS.gamepadBinds, ...(loaded.gamepadBinds ?? {}) };
    // 界面态那格同理：三格对象型默认值都不许与 `DEFAULTS` 共用引用
    this.data.gamepadUiBinds = { ...DEFAULTS.gamepadUiBinds, ...(loaded.gamepadUiBinds ?? {}) };
    // 同上：这几根旋钮也是一格对象，不能与出厂共用引用（就地改一次就把出厂手感改了）。
    // 但这一格读档时**清洗一次**，不走 `{...出厂, ...存档}` 那种浅合并：合并会把"玩家没拧过这一格"
    // 这件事抹掉，而切片32 把扳机旋钮拆成 LT / RT 两根之后，老档里只有那一个数 —— 先合并成
    // "两枚新格都已经是出厂值"，`padTuning` 就再也认不出该不该拿老数垫它们（表现：玩家调过的
    // 灵敏扳机在拆分那天早上悄悄变回钝的）。清洗同时还会丢掉存储里没人认领的键，与
    // `migrateLegacySettings` 是同一条纪律。
    this.data.padTuning = padTuning(loaded.padTuning);
  }

  load() {
    let raw;
    try {
      raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    } catch {
      return {};
    }
    if (!raw || typeof raw !== 'object') return {};
    return raw.version === VERSION ? (raw.values ?? {}) : migrateLegacySettings(raw);
  }

  save() {
    localStorage.setItem(KEY, JSON.stringify({ version: VERSION, values: this.data }));
    window.dispatchEvent(new CustomEvent('settings-changed', { detail: { ...this.data } }));
  }

  get(k) { return this.data[k] ?? DEFAULTS[k]; }

  get defaults() { return DEFAULTS; }

  /**
   * 应用画质预设（W-D3 切片1）：一次性把多格画质设置推到目标档位的值。
   *
   * 调用方只需传档位名和游戏实例，方法内部从冻结表取数、逐格 `set()` 并持久化，最后统一 `applyToGame`。
   * 玩家之后仍可微调单格 —— 预设只负责"推过去"，不负责锁死。
   * @param {string} presetName - 预设名（low / medium / high）
   * @param {object} game - Game 实例，用于落地到运行时
   */
  applyGraphicsPreset(presetName, game) {
    const name = normalizeGraphicsPreset(presetName);
    const preset = getGraphicsPreset(name);
    // 逐格写入并持久化：每一格都走 `set()`，保证存档同步更新
    for (const [key, value] of Object.entries(preset)) {
      this.set(key, value);
    }
    // 记住这一档的名字，下次读档时面板能回显
    this.set('graphicsPreset', name);
    // 统一落地到游戏实例
    if (game) this.applyToGame(game);
  }

  set(k, v) {
    this.data[k] = v;
    this.save();
  }

  applyToGame(game) {
    if (game.audio) game.audio.setVolumes(this.get('masterVolume'), this.get('sfxVolume'));
    if (game.bloomPass) game.bloomPass.strength = this.get('bloomStrength');
    if (game.renderer) {
      game.renderer.shadowMap.enabled = this.get('shadows');
      game.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.get('pixelRatio')));
    }
    // 阴影精度档（W-C3 切片2）：换档要释放 three 缓存的旧深度图，释放那一步在
    // `applySunShadowQuality` 里。脏档回落出厂而不是抛 —— 存储是玩家可写的，
    // 一行手改的 localStorage 不该把开机炸了（`padTuning` 的同一先例）
    if (game.sun) applySunShadowQuality(game.sun, normalizeShadowQuality(this.get('shadowQuality')));
    // MSAA 档（W-C4 切片1）：与阴影精度档同口径 —— 脏值回落出厂不抛；
    // 换档要重建 multisample framebuffer，那一步在 `applyMsaaSamples` 里（dispose 懒重建）
    if (game.composer) applyMsaaSamples(game.composer, normalizeMsaaSamples(this.get('msaaSamples')));
    // SSAO 档（W-C4 切片5 / B98）：挂/摘/换档三态收口在 `setSsaoQuality` 一个出口
    //（摘除含 dispose —— B76 泄漏族的教训；原实现只更新参数不挂摘，玩家从 off 档
    // 切到任何非 off 档都永远无法创建 pass）。脏档在出口内部回落出厂。
    setSsaoQuality(game, this.get('ssaoQuality'));
    if (game.performance) game.performance.enemyLodDistance = this.get('enemyLodDistance');
    // 手感旋钮推给桥（切片15）：`setTuning` 内部再走一次 `padTuning` 清洗 ——
    // 存储是玩家可写的，越界或 NaN 一律逐项回落出厂，不把脏值乘进每帧的舵量里
    game.padInput?.setTuning(this.get('padTuning'));
    // 震动开关推给反馈层（切片17）：只认"真的勾上"——存储是玩家可写的，
    // 一个 `"1"` 或 `1` 都该当成关，而不是由这里替玩家猜他要震
    if (game.rumble) game.rumble.enabled = this.get('vibration') === true;
    // 界面语言（W-D2 切片2）：先切表再走查 DOM。未知语言不让它炸开机 ——
    // 存储是玩家可写的，回落中文而不是抛（与其余脏值同一口径）。
    // 这里**不**写 `applyTranslations(document)`：`document` 这个标识符在无 DOM
    // 的环境（纯逻辑测试）里取出即 ReferenceError，而走查本身在那种环境下
    // 就该是 no-op —— 兜底在 `applyTranslations` 自己的默认起点里。
    const lang = this.get('language');
    try {
      setLanguage(lang);
    } catch {
      setLanguage('zh');
    }
    applyTranslations();
    // 难度档（W-E1 切片2）：写入口只有这一处（与语言同一形状 —— 整局一份的模块级状态）。
    // `setDifficulty` 内部对脏值回落出厂不抛：存储是玩家可写的，一行手改的 localStorage
    // 不该把开机炸了（`padTuning` / `normalizeShadowQuality` 同一先例）。
    // 生效时机：`enemyHp` 乘在出生那一瞬间（场上已有的敌人保持当前血量），
    // `damageTaken` / `souls` 对下一击 / 下一笔收入即生效。
    setDifficulty(this.get('difficulty'));
    // 色觉档（W-D6 切片3）：与难度档同一套纪律 —— 写入口只有这一处，脏值回落出厂不抛。
    // 生效时机：新生成的掉落按当前档取色，场上已有的掉落在下一帧 `LootSystem.update` 重涂。
    setColorVision(this.get('colorVision'));
    // 鼠标镜头灵敏度倍率（W-D6 切片7）：写入口只有这一处（与难度档 / 色觉档同一条纪律）。
    // 生效时机：下一次 `addCameraInput` 即生效 —— 它是每帧乘进去的，没有"场上已有的角度"要重算。
    // 脏值在 `normalizeLookSensitivity` 里夹回量程，不抛（存储是玩家可写的）。
    applyLookSensitivity(game.player, normalizeLookSensitivity(this.get('lookSensitivity')));
    // 字幕开关（W-D6 切片8）：写入口只有这一处。生效时机：下一次 game-cue 即生效
    // （没有"场上已有的字幕"要重算，到期自然退场）。放在色觉档之后纯属分组方便，
    // 两者互不相干。
    game.captions?.setEnabled(this.get('captions') === true);
    // HUD 状态条按当前色觉档重写一次（W-D6 切片4）：写颜色的地方只有 ui/barTheme.js 一处，
    // HUD 只负责转发。放在 setColorVision 之后 —— 先落档位再取色，顺序反了会涂上一档的颜色。
    game.hud?.refreshBarColors?.();
  }
}

