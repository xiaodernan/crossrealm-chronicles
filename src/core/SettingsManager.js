import { padTuning } from '../content/keybinds.js';
import { applySunShadowQuality, normalizeShadowQuality } from '../engine/shadowPolicy.js';
import { applyMsaaSamples, normalizeMsaaSamples } from '../engine/aaPolicy.js';
import { DEFAULT_SSAO_QUALITY, normalizeSsaoQuality } from '../engine/ssaoSettings.js';
import { updateSsaoQuality } from '../engine/SsaoPass.js';

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
   * SSAO 画质档（W-C4 切片5）：off / low / medium / high 四档，名册在
   * `engine/ssaoSettings.js`。出厂 medium —— 提供基础的环境光遮蔽效果，增强深度感。
   * 存储里的脏值在 `applyToGame` 落地前经 `normalizeSsaoQuality` 回落出厂。
   */
  ssaoQuality: DEFAULT_SSAO_QUALITY,
  pixelRatio: 1.5,
  enemyLodDistance: 85,
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
   * 手柄震动（切片17）：只挡"要不要给马达下令"这一格，相机抖不抖仍然照旧 ——
   * 打击反馈有两路输出，玩家只想关其中一路（例如有人在夜里玩）。
   */
  vibration: true,
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
    // SSAO 档（W-C4 切片5）：换档更新 GTAOPass 参数，pass 不存在时静默跳过
    if (game.ssaoPass) {
      updateSsaoQuality(game.ssaoPass, normalizeSsaoQuality(this.get('ssaoQuality')));
    }
    if (game.performance) game.performance.enemyLodDistance = this.get('enemyLodDistance');
    // 手感旋钮推给桥（切片15）：`setTuning` 内部再走一次 `padTuning` 清洗 ——
    // 存储是玩家可写的，越界或 NaN 一律逐项回落出厂，不把脏值乘进每帧的舵量里
    game.padInput?.setTuning(this.get('padTuning'));
    // 震动开关推给反馈层（切片17）：只认"真的勾上"——存储是玩家可写的，
    // 一个 `"1"` 或 `1` 都该当成关，而不是由这里替玩家猜他要震
    if (game.rumble) game.rumble.enabled = this.get('vibration') === true;
  }
}
