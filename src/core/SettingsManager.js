import { padTuning } from '../content/keybinds.js';

const KEY = 'crossrealm_settings';
/** v1 是"整包扁平、没有版本字段"；v2 起是 `{ version, values }` */
const VERSION = 2;

const DEFAULTS = {
  masterVolume: 0.35,
  sfxVolume: 0.5,
  bloomStrength: 0.35,
  shadows: true,
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
   * 手柄手感三根旋钮（切片15）：`{ deadzone, analogRange, lookCurve }`。
   *
   * 默认值不在这里抄一遍 —— `padTuning()` 取的就是 `content/keybinds.js` 里那份 `PAD`，
   * 因为"滑杆的范围"与"桥认的范围"必须是同一条算式（两处分头写就会滑到头却被当成脏数据回落）。
   */
  padTuning: padTuning(),
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
    // 同上：这三根旋钮也是一格对象，不能与出厂共用引用（就地改一次就把出厂手感改了）
    this.data.padTuning = { ...DEFAULTS.padTuning, ...(loaded.padTuning ?? {}) };
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
    if (game.performance) game.performance.enemyLodDistance = this.get('enemyLodDistance');
    // 手感旋钮推给桥（切片15）：`setTuning` 内部再走一次 `padTuning` 清洗 ——
    // 存储是玩家可写的，越界或 NaN 一律逐项回落出厂，不把脏值乘进每帧的舵量里
    game.padInput?.setTuning(this.get('padTuning'));
  }
}
