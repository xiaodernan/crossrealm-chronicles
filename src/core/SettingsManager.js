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
  }
}
