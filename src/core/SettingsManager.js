const KEY = 'crossrealm_settings';

const DEFAULTS = {
  masterVolume: 0.35,
  sfxVolume: 0.5,
  bloomStrength: 0.35,
  shadows: true,
  pixelRatio: 1.5,
  enemyLodDistance: 85,
  showFps: true,
};

export class SettingsManager {
  constructor() {
    this.data = { ...DEFAULTS, ...this.load() };
  }

  load() {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '{}');
    } catch {
      return {};
    }
  }

  save() {
    localStorage.setItem(KEY, JSON.stringify(this.data));
    window.dispatchEvent(new CustomEvent('settings-changed', { detail: { ...this.data } }));
  }

  get(k) { return this.data[k] ?? DEFAULTS[k]; }

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
