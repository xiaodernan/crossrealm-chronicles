import { UI_HOTKEYS, UI_HOTKEY_LABELS, applyHotkeyOverrides } from '../content/hotkeys.js';

/** `KeyboardEvent.code` → 面板上给人看的字样。没列到的原样显示（`Numpad5` 之类） */
const KEY_LABELS = {
  Escape: 'Esc',
  Tab: 'Tab',
  Space: '空格',
  Backquote: '`',
  ControlLeft: '左 Ctrl',
  ControlRight: '右 Ctrl',
  ShiftLeft: '左 Shift',
  ShiftRight: '右 Shift',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

function keyLabel(code) {
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  const m = /^(?:Key|Digit)([A-Z0-9])$/.exec(code);
  return m ? m[1] : code;
}

export class SettingsPanel {
  constructor(game) {
    this.game = game;
    this.panel = document.getElementById('settings-panel');
    this.open = false;
    /** 正在等玩家按下一个键的动作名（null = 没在等） */
    this.capturing = null;
    this._onCaptureKey = (e) => this.captureKey(e);
    document.getElementById('settings-close')?.addEventListener('click', () => this.hide());
    this.bindControls();
    this.bindKeybinds();
  }

  bindControls() {
    const s = this.game.settings;
    const bind = (id, key, parse = Number) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        s.set(key, parse(el.value));
        s.applyToGame(this.game);
      });
    };
    bind('set-master-vol', 'masterVolume', Number);
    bind('set-sfx-vol', 'sfxVolume', Number);
    bind('set-bloom', 'bloomStrength', Number);
    bind('set-pixel', 'pixelRatio', Number);
    bind('set-lod', 'enemyLodDistance', Number);
    const sh = document.getElementById('set-shadows');
    sh?.addEventListener('change', () => {
      s.set('shadows', sh.checked);
      s.applyToGame(this.game);
    });
  }

  /**
   * 键位区：委托监听只挂一次，重绘只换行内容 —— 每行各挂一个监听器的那种写法，
   * 面板开合十次就留下十倍的僵尸监听（W-B 的台账正是为此而设）。
   */
  bindKeybinds() {
    const host = document.getElementById('set-keybinds');
    if (!host) return;
    host.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('[data-keybind],#keybind-reset');
      if (!btn) return;
      if (btn.id === 'keybind-reset') {
        this.capturing = null;
        this.game.settings.set('keybinds', {});
        this.game.rebuildHotkeys();
        return this.refreshKeybinds();
      }
      const action = btn.dataset.keybind;
      this.setCapturing(this.capturing === action ? null : action);   // 再点一次取消
      this.refreshKeybinds();
    });
  }

  captureKey(e) {
    e.preventDefault();
    e.stopPropagation();          // 别让它同时被 Game 记成一次真实按下
    const action = this.capturing;
    this.setCapturing(null);
    if (!action) return;
    const overrides = { ...(this.game.settings.get('keybinds') ?? {}), [action]: e.code };
    try {
      applyHotkeyOverrides(UI_HOTKEYS, overrides);
    } catch {
      this.game.dialog?.toast(`该键位无效或已被别的动作占用：${keyLabel(e.code)}`);
      return this.refreshKeybinds();
    }
    this.game.settings.set('keybinds', overrides);
    this.game.rebuildHotkeys();
    this.refreshKeybinds();
  }

  /**
   * 等待按键的那一小段时间才挂监听，离开立刻摘掉（同一个函数引用 + 同一个 capture 标志，
   * 浏览器不会重复登记）。捕获用 capture 阶段 + `stopPropagation`：Game 的监听在冒泡阶段，
   * 于是这一下只用于绑定，不会被记成一次真实按键。
   */
  setCapturing(action) {
    this.capturing = action;
    if (action) window.addEventListener('keydown', this._onCaptureKey, true);
    else window.removeEventListener('keydown', this._onCaptureKey, true);
  }

  show() {
    this.open = true;
    this.panel?.classList.remove('hidden');
    document.exitPointerLock?.();
    this.refresh();
  }

  hide() {
    this.open = false;
    this.setCapturing(null);
    this.panel?.classList.add('hidden');
  }

  refresh() {
    const d = this.game.settings.data;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('set-master-vol', d.masterVolume);
    set('set-sfx-vol', d.sfxVolume);
    set('set-bloom', d.bloomStrength);
    set('set-pixel', d.pixelRatio);
    set('set-lod', d.enemyLodDistance);
    const sh = document.getElementById('set-shadows');
    if (sh) sh.checked = d.shadows;
    this.refreshKeybinds();
  }

  refreshKeybinds() {
    const host = document.getElementById('set-keybinds');
    if (!host) return;
    const table = this.game.hotkeyTable ?? UI_HOTKEYS;
    const rows = table.map((e) => {
      const label = UI_HOTKEY_LABELS[e.action] ?? e.action;
      const hint = this.capturing === e.action ? '按下要绑定的键（再点一次取消）' : '';
      return `<div class="keybind-row"><span class="keybind-name">${label}</span>`
        + `<button type="button" data-keybind="${e.action}">${keyLabel(e.code)}</button>`
        + `<span class="keybind-hint">${hint}</span></div>`;
    });
    rows.push('<button type="button" id="keybind-reset">恢复默认键位</button>');
    host.innerHTML = rows.join('');
  }
}
